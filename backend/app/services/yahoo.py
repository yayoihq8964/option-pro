from __future__ import annotations

from datetime import datetime, timedelta
import math
from typing import Any

import yfinance as yf

# Simple in-memory cache for yfinance data. Values are (expires_at, data).
_cache: dict[str, tuple[datetime, Any]] = {}


def _cached(key: str, ttl_seconds: int, loader):
    now = datetime.utcnow()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    value = loader()
    _cache[key] = (now + timedelta(seconds=ttl_seconds), value)
    return value


def _get_ticker(symbol: str) -> yf.Ticker:
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

        calls = []
        for _, row in chain.calls.iterrows():
            strike = float(row["strike"])
            last_price = _safe_float(row.get("lastPrice"))
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
                    "implied_volatility": _safe_float(row.get("impliedVolatility")),
                    "in_the_money": bool(row.get("inTheMoney", False)),
                    "break_even": strike + (last_price or 0),
                    "break_even_price": strike + (last_price or 0),
                }
            )

        puts = []
        for _, row in chain.puts.iterrows():
            strike = float(row["strike"])
            last_price = _safe_float(row.get("lastPrice"))
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
                    "implied_volatility": _safe_float(row.get("impliedVolatility")),
                    "in_the_money": bool(row.get("inTheMoney", False)),
                    "break_even": strike - (last_price or 0),
                    "break_even_price": strike - (last_price or 0),
                }
            )

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
            "data_limited": False,
        }

    return _cached(f"chain:{symbol}:{expiration}", 120, load)


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
            for exp in exps:
                exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
                days_out = (exp_date - today).days
                if 20 <= days_out <= 60:
                    target_exp = exp
                    break
            if not target_exp:
                for exp in exps:
                    exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
                    if (exp_date - today).days > 7:
                        target_exp = exp
                        break
            if not target_exp and exps:
                target_exp = exps[-1]

            chain = t.option_chain(target_exp)
            calls = chain.calls
            atm_calls = calls.iloc[(calls["strike"] - price).abs().argsort()[:5]]
            for _, row in atm_calls.iterrows():
                iv = _safe_float(row.get("impliedVolatility"))
                if iv is not None and iv > 0.01:
                    return round(iv, 4)
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
