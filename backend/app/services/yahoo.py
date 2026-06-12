from __future__ import annotations

from datetime import datetime, timedelta, timezone
import math
from typing import Any

import logging
import warnings as _warnings
import yfinance as yf

_log = logging.getLogger(__name__)

# Use curl_cffi browser-impersonation session to dodge Yahoo's rate limits.
# Falls back to default session if curl_cffi isn't available.
try:
    from curl_cffi import requests as _cffi_requests
    _yf_session = _cffi_requests.Session(impersonate="chrome")
except Exception as _e:
    _yf_session = None
    _log.warning("curl_cffi unavailable, yfinance will use default session: %s", _e)

# Monkey-patch yf.Ticker so ALL call sites get our impersonating session.
# Verify the patched __init__ signature still matches what yfinance expects;
# if upstream changes the signature, we'd silently break — bail loudly instead.
if _yf_session is not None:
    import inspect as _inspect
    try:
        _sig = _inspect.signature(yf.Ticker.__init__)
        _params = list(_sig.parameters.keys())
        # Expect at least (self, ticker, session=...) — bail if shape changed
        if "session" not in _params:
            _warnings.warn(
                f"yfinance {yf.__version__} Ticker.__init__ no longer accepts 'session' "
                "kwarg; skipping monkey-patch. Update yahoo.py for new API."
            )
            _yf_session = None
    except Exception:
        pass  # if we can't introspect, try the patch anyway

if _yf_session is not None:
    _orig_init = yf.Ticker.__init__
    def _patched_init(self, ticker, session=None, **kwargs):
        if session is None:
            session = _yf_session
        _orig_init(self, ticker, session=session, **kwargs)
    yf.Ticker.__init__ = _patched_init

# Simple in-memory cache for yfinance data. Values are (expires_at, data).
_cache: dict[str, tuple[datetime, Any]] = {}
_CACHE_PURGE_THRESHOLD = 1024


def _purge_cache(now: datetime) -> None:
    """Drop expired entries so per-ticker/expiration keys can't pile up forever."""
    if len(_cache) < _CACHE_PURGE_THRESHOLD:
        return
    for key in [k for k, (expires_at, _) in _cache.items() if expires_at <= now]:
        _cache.pop(key, None)
    if len(_cache) >= _CACHE_PURGE_THRESHOLD:
        # Still too big (all entries fresh): drop the oldest-expiring half.
        for key, _ in sorted(_cache.items(), key=lambda item: item[1][0])[: len(_cache) // 2]:
            _cache.pop(key, None)


def _cached(key: str, ttl_seconds: int, loader):
    now = datetime.now(timezone.utc)
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    try:
        value = loader()
    except Exception:
        # On rate-limit or transient error, return stale cache if available
        if hit:
            return hit[1]
        raise
    _purge_cache(now)
    _cache[key] = (now + timedelta(seconds=ttl_seconds), value)
    return value


def _get_ticker(symbol: str) -> yf.Ticker:
    if _yf_session is not None:
        return yf.Ticker(symbol.upper(), session=_yf_session)
    return yf.Ticker(symbol.upper())


def get_expirations(ticker: str) -> list[str]:
    """Get available option expiration dates."""
    symbol = ticker.upper()
    return _cached(f"expirations:{symbol}", 300, lambda: list(_get_ticker(symbol).options))


def get_option_chain(ticker: str, expiration: str) -> dict[str, Any]:
    """Get full option chain for a ticker and expiration date."""
    symbol = ticker.upper()

    def load() -> dict[str, Any]:
        t = _get_ticker(symbol)

        # Get current stock price
        try:
            price = _safe_float(t.fast_info.last_price)
        except Exception:
            price = None

        chain = t.option_chain(expiration)
        exp_date = datetime.strptime(expiration, "%Y-%m-%d").date()
        today = datetime.now().date()
        dte = max((exp_date - today).days, 0)
        T = max(dte, 1) / 365.0

        def _resolve_iv(row, strike, last_price, stock_price, is_call=True):
            """Use yfinance IV if meaningful, else compute from last_price via BS.
            Threshold rationale: a truly traded option has IV >= 0.5% always.
            0.0001/0/NaN means yfinance returned no quote (after-hours, etc).
            """
            iv = _safe_float(row.get("impliedVolatility"))
            if iv is not None and iv > 0.005:
                return iv
            if last_price and last_price > 0.01 and stock_price and stock_price > 0:
                computed = compute_iv(last_price, stock_price, strike, T, r=0.05, is_call=is_call)
                if computed and 0.01 < computed < 3.0:
                    return computed
            return iv  # return raw even if low

        def _greeks_for(strike, iv, is_call):
            if not (price and price > 0 and iv and iv > 0):
                return {"delta": None, "gamma": None, "theta": None, "vega": None, "rho": None}
            return compute_greeks(price, strike, T, 0.05, iv, is_call=is_call)

        calls = []
        # itertuples is 5-10x faster than iterrows; _asdict() keeps dict access.
        for nt in chain.calls.itertuples(index=False):
            row = nt._asdict()
            strike = float(row["strike"])
            last_price = _safe_float(row.get("lastPrice"))
            iv = _resolve_iv(row, strike, last_price, price, is_call=True)
            greeks = _greeks_for(strike, iv, True)
            calls.append(
                {
                    "ticker": row.get("contractSymbol", ""),
                    "type": "call",
                    "strike": strike,
                    "expiration": expiration,
                    "bid": _safe_float(row.get("bid")),
                    "ask": _safe_float(row.get("ask")),
                    "mid": _mid(row.get("bid"), row.get("ask")),
                    "midpoint": _mid(row.get("bid"), row.get("ask")),
                    "last_price": last_price,
                    "change": _safe_float(row.get("change")),
                    "change_percent": _safe_float(row.get("percentChange")),
                    "day_change": _safe_float(row.get("change")),
                    "day_change_percent": _safe_float(row.get("percentChange")),
                    "volume": _safe_int(row.get("volume")),
                    "open_interest": _safe_int(row.get("openInterest")),
                    "implied_volatility": iv,
                    "in_the_money": bool(row.get("inTheMoney", False)),
                    "break_even": strike + (last_price or 0),
                    "break_even_price": strike + (last_price or 0),
                    **greeks,
                }
            )

        puts = []
        for nt in chain.puts.itertuples(index=False):
            row = nt._asdict()
            strike = float(row["strike"])
            last_price = _safe_float(row.get("lastPrice"))
            iv = _resolve_iv(row, strike, last_price, price, is_call=False)
            greeks = _greeks_for(strike, iv, False)
            puts.append(
                {
                    "ticker": row.get("contractSymbol", ""),
                    "type": "put",
                    "strike": strike,
                    "expiration": expiration,
                    "bid": _safe_float(row.get("bid")),
                    "ask": _safe_float(row.get("ask")),
                    "mid": _mid(row.get("bid"), row.get("ask")),
                    "midpoint": _mid(row.get("bid"), row.get("ask")),
                    "last_price": last_price,
                    "change": _safe_float(row.get("change")),
                    "change_percent": _safe_float(row.get("percentChange")),
                    "day_change": _safe_float(row.get("change")),
                    "day_change_percent": _safe_float(row.get("percentChange")),
                    "volume": _safe_int(row.get("volume")),
                    "open_interest": _safe_int(row.get("openInterest")),
                    "implied_volatility": iv,
                    "in_the_money": bool(row.get("inTheMoney", False)),
                    "break_even": strike - (last_price or 0),
                    "break_even_price": strike - (last_price or 0),
                    **greeks,
                }
            )

        # ── Detect unusual activity alerts ──
        alerts = []
        all_contracts = [(c, "call") for c in calls] + [(p, "put") for p in puts]
        for contract, side in all_contracts:
            vol = contract.get("volume") or 0
            oi = contract.get("open_interest") or 0
            lp = contract.get("last_price") or 0
            iv = contract.get("implied_volatility") or 0
            strike = contract["strike"]

            reasons = []

            # Rule 1: Volume/OI ratio > 3 (unusual volume relative to open interest)
            if oi > 0 and vol / oi >= 3:
                reasons.append(f"Vol/OI {vol/oi:.1f}x")

            # Rule 2: High absolute volume
            if vol >= 5000:
                reasons.append(f"高成交量 {vol:,}")

            # Rule 3: Large premium flow (volume × price × 100 > $500K)
            premium = vol * lp * 100 if lp else 0
            if premium >= 500_000:
                reasons.append(f"大额权利金 ${premium:,.0f}")

            # Rule 4: Volume spike with low OI (new position building)
            if vol >= 1000 and oi < 500:
                reasons.append("可能新仓，待OI确认")

            # Rule 5: Deep OTM with high volume (speculative)
            if price:
                otm_pct = abs(strike - price) / price
                if otm_pct > 0.10 and vol >= 2000:
                    reasons.append(f"深度虚值 ({otm_pct*100:.0f}% OTM)")

            if reasons:
                inferred_direction = "unknown"
                if price:
                    # Conservative placeholder: infer direction from type + moneyness only; side data is unavailable.
                    if side == "call" and strike >= price * 0.98:
                        inferred_direction = "bullish"
                    elif side == "put" and strike <= price * 1.02:
                        inferred_direction = "bearish"

                alerts.append({
                    "strike": strike,
                    "type": side,
                    "expiration": expiration,
                    "dte": dte,
                    "volume": vol,
                    "open_interest": oi,
                    "last_price": lp,
                    "implied_volatility": iv,
                    "premium_flow": round(premium, 0) if premium else None,
                    "vol_oi_ratio": round(vol / oi, 2) if oi > 0 else None,
                    "reasons": reasons,
                    "signal": inferred_direction,
                    "inferred_direction": inferred_direction,
                    "direction_note": "方向推断，非确定性判断；缺少bid/ask成交位置数据",
                })

        # Sort alerts by premium flow descending
        alerts.sort(key=lambda a: a.get("premium_flow") or 0, reverse=True)

        strikes = sorted(set(c["strike"] for c in calls) | set(p["strike"] for p in puts))
        call_map = {c["strike"]: c for c in calls}
        put_map = {p["strike"]: p for p in puts}
        grouped = {str(s): {"call": call_map.get(s), "put": put_map.get(s)} for s in strikes}

        return {
            "ticker": symbol,
            "expiration": expiration,
            "underlying_price": price,
            "strikes": strikes,
            "calls": calls,
            "puts": puts,
            "grouped_by_strike": grouped,
            "alerts": alerts[:10],  # top 10 unusual activity alerts
            "data_limited": False,
        }

    return _cached(f"chain:{symbol}:{expiration}", 300, load)


def get_stock_iv(ticker: str) -> float | None:
    """Get meaningful ATM implied volatility using an expiration 20-60 days out."""
    symbol = ticker.upper()

    def load() -> float | None:
        try:
            t = _get_ticker(symbol)
            exps = t.options
            if not exps:
                return None

            price = float(t.fast_info.last_price)

            # Very near-term expirations often have unusable/zero IV. Prefer an
            # expiration around one month out for sector/stock displays.
            target_exp = None
            today = datetime.now().date()

            def _parse_exp(s):
                try:
                    return datetime.strptime(s, "%Y-%m-%d").date()
                except (ValueError, TypeError):
                    return None

            for exp in exps:
                exp_date = _parse_exp(exp)
                if not exp_date:
                    continue
                days_out = (exp_date - today).days
                if 20 <= days_out <= 60:
                    target_exp = exp
                    break
            if not target_exp:
                for exp in exps:
                    exp_date = _parse_exp(exp)
                    if exp_date and (exp_date - today).days > 7:
                        target_exp = exp
                        break
            if not target_exp and exps:
                target_exp = exps[-1]

            chain = t.option_chain(target_exp)
            calls = chain.calls
            atm_calls = calls.iloc[(calls["strike"] - price).abs().argsort()[:5]]

            # 1) Try yfinance IV first (must be >10% to be realistic for stocks)
            for _, row in atm_calls.iterrows():
                iv = _safe_float(row.get("impliedVolatility"))
                if iv is not None and iv > 0.10:
                    return round(iv, 4)

            # 2) Fallback: compute IV from last_price via Black-Scholes
            exp_date = _parse_exp(target_exp)
            if not exp_date:
                return None
            T = max((exp_date - today).days, 1) / 365.0
            for _, row in atm_calls.iterrows():
                last = _safe_float(row.get("lastPrice"))
                strike = _safe_float(row.get("strike"))
                if last and last > 0.01 and strike:
                    computed = compute_iv(last, price, strike, T, r=0.05, is_call=True)
                    if computed and 0.05 < computed < 3.0:
                        return round(computed, 4)
        except Exception:
            pass
        return None

    return _cached(f"stock_iv:{symbol}", 300, load)


def get_last_price(ticker: str) -> float | None:
    """Get last stock price from yfinance for fallback/sector displays."""
    try:
        return _safe_float(_get_ticker(ticker).fast_info.last_price)
    except Exception:
        return None


def _safe_float(v) -> float | None:
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except Exception:
        return None


def _safe_int(v) -> int | None:
    try:
        i = int(float(v))
        return i if i >= 0 else None
    except Exception:
        return None


def _mid(bid, ask) -> float | None:
    b, a = _safe_float(bid), _safe_float(ask)
    if b is not None and a is not None and b > 0 and a > 0:
        return round((b + a) / 2, 4)
    return None


# ── Black-Scholes IV solver (for after-hours when yfinance IV ≈ 0) ──────────

from math import log, sqrt, exp, pi, erf

def _norm_cdf(x):
    return (1 + erf(x / sqrt(2))) / 2

def _norm_pdf(x):
    return exp(-x * x / 2) / sqrt(2 * pi)

def _bs_call(S, K, T, r, sigma):
    if T <= 0 or sigma <= 0:
        return max(S - K, 0)
    d1 = (log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * sqrt(T))
    d2 = d1 - sigma * sqrt(T)
    return S * _norm_cdf(d1) - K * exp(-r * T) * _norm_cdf(d2)

def _bs_price(S, K, T, r, sigma, is_call):
    call = _bs_call(S, K, T, r, sigma)
    return call if is_call else call - S + K * exp(-r * T)


def compute_iv(option_price, S, K, T, r=0.05, is_call=True):
    """Solve IV via Newton's method; fall back to bisection if Newton fails to converge.

    Newton can diverge for deep OTM / near-expiry options where vega → 0.
    Bisection is slower but guaranteed to converge in a bounded sigma range.
    """
    if option_price <= 0 or S <= 0 or K <= 0 or T <= 0:
        return None
    intrinsic = max(S - K, 0) if is_call else max(K - S, 0)
    if option_price < intrinsic * 0.9:
        return None

    # ── Newton's method (fast path) ──
    sigma = 0.3
    for _ in range(50):
        bs = _bs_price(S, K, T, r, sigma, is_call)
        try:
            d1 = (log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * sqrt(T))
            vega = S * sqrt(T) * _norm_pdf(d1)
        except (ValueError, ZeroDivisionError):
            break
        if abs(vega) < 1e-8:
            break  # Newton stuck; try bisection
        step = (bs - option_price) / vega
        sigma -= step
        if sigma <= 0.001 or sigma > 5.0:
            break  # diverged; try bisection
        if abs(bs - option_price) < 0.001:
            return round(sigma, 4)

    # ── Bisection fallback (guaranteed convergence in [lo, hi]) ──
    lo, hi = 0.001, 5.0
    try:
        f_lo = _bs_price(S, K, T, r, lo, is_call) - option_price
        f_hi = _bs_price(S, K, T, r, hi, is_call) - option_price
    except Exception:
        return None
    if f_lo * f_hi > 0:
        return None  # no root in bracket
    for _ in range(60):  # log2(5/0.001) ≈ 12 needed for 0.001 precision
        mid = (lo + hi) / 2
        f_mid = _bs_price(S, K, T, r, mid, is_call) - option_price
        if abs(f_mid) < 0.001:
            return round(mid, 4)
        if f_lo * f_mid < 0:
            hi, f_hi = mid, f_mid
        else:
            lo, f_lo = mid, f_mid
    return round((lo + hi) / 2, 4)


def compute_greeks(S, K, T, r, sigma, is_call=True):
    """Black-Scholes Greeks. Returns dict with delta, gamma, theta, vega, rho.

    All inputs must be > 0. theta is per-day (not per-year).
    Returns None for any greek that fails to compute.
    """
    if not (S > 0 and K > 0 and T > 0 and sigma > 0):
        return {"delta": None, "gamma": None, "theta": None, "vega": None, "rho": None}
    try:
        sqrtT = sqrt(T)
        d1 = (log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * sqrtT)
        d2 = d1 - sigma * sqrtT
        Nd1 = _norm_cdf(d1)
        Nd2 = _norm_cdf(d2)
        nd1 = _norm_pdf(d1)
        disc = exp(-r * T)
        # Common
        gamma = nd1 / (S * sigma * sqrtT)
        vega = S * nd1 * sqrtT / 100.0  # per 1% IV change
        if is_call:
            delta = Nd1
            theta = (- S * nd1 * sigma / (2 * sqrtT) - r * K * disc * Nd2) / 365.0
            rho = K * T * disc * Nd2 / 100.0
        else:
            delta = Nd1 - 1.0
            theta = (- S * nd1 * sigma / (2 * sqrtT) + r * K * disc * (1 - Nd2)) / 365.0
            rho = -K * T * disc * (1 - Nd2) / 100.0
        return {
            "delta": round(delta, 4),
            "gamma": round(gamma, 5),
            "theta": round(theta, 4),
            "vega": round(vega, 4),
            "rho": round(rho, 4),
        }
    except Exception:
        return {"delta": None, "gamma": None, "theta": None, "vega": None, "rho": None}
