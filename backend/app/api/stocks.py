from __future__ import annotations

import asyncio
import math
import time
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import httpx
import yfinance as yf
from fastapi import APIRouter, HTTPException, Query, Response


router = APIRouter(prefix="/api/stocks", tags=["stocks"])


# ──────────────────────────────────────────────────────────────────────────────
# Server-side TTL cache
# Backstop against Yahoo rate-limiting + much faster page loads.
# Returns stale on errors so a flaky API doesn't nuke the UI.
# ──────────────────────────────────────────────────────────────────────────────
_endpoint_cache: dict[str, tuple[float, Any]] = {}
# Per-key lock prevents thundering herd: concurrent requests for the same
# cold key would otherwise all kick off their own yfinance fetch.
_endpoint_locks: dict[str, asyncio.Lock] = {}

def _lock_for(key: str) -> asyncio.Lock:
    lock = _endpoint_locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _endpoint_locks[key] = lock
    return lock

async def _cached_endpoint(key: str, ttl: int, loader):
    now = time.time()
    hit = _endpoint_cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    # Serialize cold-cache fills per key
    async with _lock_for(key):
        # Re-check after acquiring lock (another waiter may have filled it)
        now = time.time()
        hit = _endpoint_cache.get(key)
        if hit and hit[0] > now:
            return hit[1]
        try:
            value = await loader()
        except Exception:
            if hit:
                return hit[1]  # stale fallback
            raise
        _endpoint_cache[key] = (now + ttl, value)
        return value


from app.services.utils import sanitize as _sanitize

_LOGO_MEDIA_TYPES = {"image/png", "image/jpeg", "image/webp", "image/svg+xml"}


def _website_host(website: str | None) -> str | None:
    if not website:
        return None
    try:
        parsed = urlparse(website if "://" in website else f"https://{website}")
        host = (parsed.netloc or "").lower().split("@")[-1].split(":")[0]
        if host.startswith("www."):
            host = host[4:]
        if "." not in host:
            return None
        return host
    except Exception:
        return None


def _logo_symbol_variants(symbol: str) -> list[str]:
    normalized = symbol.strip().upper()
    if normalized.startswith("US."):
        normalized = normalized[3:]
    normalized = "".join(c for c in normalized if c.isalnum() or c in {".", "-"})
    if not normalized:
        return []
    variants = [normalized]
    if "." in normalized:
        variants.append(normalized.replace(".", "-"))
    return list(dict.fromkeys(variants))


def _logo_urls(symbol: str, website: str | None = None) -> list[str]:
    candidates = []
    for variant in _logo_symbol_variants(symbol):
        candidates.extend([
            f"https://financialmodelingprep.com/image-stock/{variant}.png",
            f"https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/{variant}.png",
            f"https://eodhd.com/img/logos/US/{variant}.png",
        ])
    host = _website_host(website)
    if host:
        candidates.append(f"https://logo.clearbit.com/{host}")
    return list(dict.fromkeys(candidates))


async def _fetch_company_logo(symbol: str) -> dict[str, Any]:
    headers = {
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; OptixPro/1.0)",
    }
    async with httpx.AsyncClient(follow_redirects=True, timeout=6.0, headers=headers) as client:
        for url in _logo_urls(symbol):
            try:
                resp = await client.get(url)
            except Exception:
                continue
            media_type = resp.headers.get("content-type", "").split(";")[0].strip().lower()
            if resp.status_code == 200 and media_type in _LOGO_MEDIA_TYPES and len(resp.content) > 64:
                return {"content": resp.content, "media_type": media_type, "source": url}
    raise HTTPException(status_code=404, detail="Company logo not found")


KNOWN_TICKERS = {
    "NVDA": "Nvidia Corp", "TSLA": "Tesla Inc", "AAPL": "Apple Inc", "AMD": "AMD Inc",
    "AMZN": "Amazon.com", "META": "Meta Platforms", "MSFT": "Microsoft Corp", "GOOGL": "Alphabet Inc",
    "SPY": "SPDR S&P 500 ETF", "QQQ": "Invesco QQQ Trust", "TSM": "Taiwan Semiconductor",
    "AVGO": "Broadcom Inc", "ASML": "ASML Holdings", "MU": "Micron Technology", "INTC": "Intel Corp",
    "ARM": "Arm Holdings", "QCOM": "Qualcomm", "CRM": "Salesforce", "ADBE": "Adobe Inc",
    "ORCL": "Oracle Corp", "NFLX": "Netflix", "DIS": "Disney", "BABA": "Alibaba",
    "LLY": "Eli Lilly", "XOM": "Exxon Mobil", "CVX": "Chevron", "JPM": "JPMorgan Chase",
    "V": "Visa Inc", "MA": "Mastercard", "BAC": "Bank of America",
    "NOW": "ServiceNow", "SNOW": "Snowflake", "PLTR": "Palantir", "NET": "Cloudflare",
    "PANW": "Palo Alto Networks", "CRWD": "CrowdStrike", "MRVL": "Marvell Technology",
    "TXN": "Texas Instruments", "LRCX": "Lam Research", "KLAC": "KLA Corp", "AMAT": "Applied Materials",
    # Finance
    "GS": "Goldman Sachs", "MS": "Morgan Stanley", "C": "Citigroup", "BLK": "BlackRock",
    "SCHW": "Charles Schwab", "AXP": "American Express", "WFC": "Wells Fargo",
    # Healthcare
    "UNH": "UnitedHealth", "JNJ": "Johnson & Johnson", "PFE": "Pfizer", "ABBV": "AbbVie",
    "AMGN": "Amgen", "GILD": "Gilead Sciences", "MRNA": "Moderna", "NVO": "Novo Nordisk",
    "VRTX": "Vertex Pharma", "REGN": "Regeneron",
    # Consumer / Retail
    "WMT": "Walmart", "COST": "Costco", "TGT": "Target", "HD": "Home Depot", "LOW": "Lowe's",
    "NKE": "Nike", "SBUX": "Starbucks", "MCD": "McDonald's", "PEP": "PepsiCo", "KO": "Coca-Cola",
    "PG": "Procter & Gamble", "ABNB": "Airbnb", "BKNG": "Booking Holdings",
    # Industrials / Transport
    "BA": "Boeing", "CAT": "Caterpillar", "DE": "Deere", "UPS": "UPS", "FDX": "FedEx",
    "GE": "GE Aerospace", "HON": "Honeywell", "RTX": "RTX Corp", "LMT": "Lockheed Martin",
    # Tech / Internet
    "UBER": "Uber", "SHOP": "Shopify", "SQ": "Block Inc", "COIN": "Coinbase",
    "SNAP": "Snap Inc", "PINS": "Pinterest", "RBLX": "Roblox", "U": "Unity Software",
    "DDOG": "Datadog", "MDB": "MongoDB", "ZS": "Zscaler", "OKTA": "Okta",
    "TEAM": "Atlassian", "TWLO": "Twilio", "HUBS": "HubSpot",
    # Energy
    "COP": "ConocoPhillips", "SLB": "Schlumberger", "EOG": "EOG Resources",
    "MPC": "Marathon Petroleum", "OXY": "Occidental Petroleum", "DVN": "Devon Energy",
    # EV / Auto
    "RIVN": "Rivian", "LCID": "Lucid Motors", "F": "Ford", "GM": "General Motors",
    # Chinese ADRs
    "PDD": "PDD Holdings", "JD": "JD.com", "BIDU": "Baidu", "NIO": "NIO Inc",
    "LI": "Li Auto", "XPEV": "XPeng", "BILI": "Bilibili", "TME": "Tencent Music",
    # ETFs
    "IWM": "Russell 2000 ETF", "DIA": "Dow Jones ETF", "XLK": "Tech ETF",
    "XLF": "Financials ETF", "XLE": "Energy ETF", "XLV": "Healthcare ETF",
    "ARKK": "ARK Innovation ETF", "SOXX": "Semiconductor ETF", "GLD": "Gold ETF",
    "TLT": "20Y Treasury ETF", "HYG": "High Yield Bond ETF",
}


@router.get("/watchlist")
async def watchlist():
    return await _cached_endpoint("watchlist", 300, _build_watchlist)


async def _build_watchlist():
    from app.services.sectors import SECTORS

    all_tickers = []
    for sec in SECTORS.values():
        all_tickers.extend(sec["tickers"])
    all_tickers = list(dict.fromkeys(all_tickers))

    # Cap concurrent yfinance calls so we don't 228-blast Yahoo and trip its
    # per-IP rate limiter. Empirically Yahoo is fine with 8 concurrent from a
    # single browser-impersonating session, but stalls hard above ~50.
    sem = asyncio.Semaphore(8)

    async def fetch_one(ticker):
        def _work():
            # Retry once with backoff on rate limit
            import random, time as _t
            for attempt in range(2):
                try:
                    tk = yf.Ticker(ticker)
                    info = tk.fast_info
                    price = float(info.last_price)
                    prev = float(info.previous_close) if info.previous_close else price
                    from app.services.zh_names import get_zh_name
                    return {
                        "ticker": ticker,
                        "name": get_zh_name(ticker) or ticker,
                        "price": round(price, 2),
                        "change_percent": round((price - prev) / prev * 100, 2) if prev else 0,
                    }
                except Exception as e:
                    if attempt == 0 and "rate" in str(e).lower():
                        _t.sleep(0.5 + random.random())
                        continue
                    return None

        async with sem:
            return await asyncio.to_thread(_work)

    # Fetch real sparkline data (5-day daily closes) using yfinance batch download.
    # ONE HTTP call for all 228 tickers — much cheaper than per-ticker history().
    def _fetch_sparks():
        try:
            import yfinance as yf_mod
            # group_by='ticker' returns nested cols; auto_adjust=False to get raw close
            df = yf_mod.download(
                tickers=" ".join(all_tickers),
                period="5d",
                interval="1d",
                group_by="ticker",
                threads=False,  # we already control concurrency
                progress=False,
                auto_adjust=False,
                session=getattr(__import__("app.services.yahoo", fromlist=["_yf_session"]),
                                "_yf_session", None),
            )
            sparks = {}
            for t in all_tickers:
                try:
                    if t in df.columns.get_level_values(0):
                        closes = df[t]["Close"].dropna().tolist()
                        if closes:
                            sparks[t] = [round(float(c), 2) for c in closes[-7:]]
                except Exception:
                    continue
            return sparks
        except Exception:
            return {}

    # Run sparkline batch + per-ticker price fetches concurrently
    sparks_task = asyncio.to_thread(_fetch_sparks)
    results, sparks = await asyncio.gather(
        asyncio.gather(*[fetch_one(t) for t in all_tickers], return_exceptions=True),
        sparks_task,
    )
    price_map = {r["ticker"]: r for r in results if isinstance(r, dict)}
    # Attach real sparkline to each stock
    for ticker, stock in price_map.items():
        stock["spark"] = sparks.get(ticker, [])

    # If yfinance limited us hard, less than 30% succeeded — treat as failure
    # so the cache returns the previous (stale) snapshot instead of an empty one.
    success_ratio = len(price_map) / max(len(all_tickers), 1)
    if success_ratio < 0.3:
        raise RuntimeError(f"watchlist mostly failed ({len(price_map)}/{len(all_tickers)} succeeded)")

    groups = []
    for sec_id, sec in SECTORS.items():
        items = [price_map[t] for t in sec["tickers"] if t in price_map]
        if items:
            groups.append({"id": sec_id, "name": sec["name"], "stocks": items})

    return _sanitize({"groups": groups})


@router.get("/search")
async def search_stocks(q: str = Query(..., min_length=1, max_length=50)):
    q_upper = q.upper().strip()
    q_lower = q.lower().strip()
    from app.services.zh_names import NAMES

    def fuzzy(query, text):
        """Check if all chars of query appear in text in order (fuzzy match)."""
        it = iter(text.lower())
        return all(c in it for c in query.lower())

    # 1) Local dictionary — exact substring + fuzzy match
    exact, fuzzy_results = [], []
    all_tickers = {**KNOWN_TICKERS}
    for t, (zh, _) in NAMES.items():
        if t not in all_tickers:
            all_tickers[t] = zh

    for ticker, name in all_tickers.items():
        zh_entry = NAMES.get(ticker)
        zh_name = zh_entry[0] if zh_entry else ""
        zh_desc = zh_entry[1] if zh_entry else ""
        search_text = f"{ticker} {name} {zh_name} {zh_desc}".lower()

        if q_upper == ticker or q_lower == name.lower():
            exact.insert(0, {"ticker": ticker, "name": zh_name or name, "name_en": name, "market": "stocks", "type": "CS"})
        elif q_upper in ticker or q_lower in search_text:
            exact.append({"ticker": ticker, "name": zh_name or name, "name_en": name, "market": "stocks", "type": "CS"})
        elif len(q_lower) >= 2 and (fuzzy(q_lower, ticker) or fuzzy(q_lower, name) or fuzzy(q_lower, zh_name)):
            fuzzy_results.append({"ticker": ticker, "name": zh_name or name, "name_en": name, "market": "stocks", "type": "CS"})

    results = exact + fuzzy_results
    if results:
        return _sanitize(results[:12])

    # 2) Fallback: try yfinance for completely unknown tickers
    def _yf_search():
        try:
            tk = yf.Ticker(q_upper)
            info = tk.info
            name = info.get("shortName", "")
            if name and info.get("regularMarketPrice"):
                return [{"ticker": q_upper, "name": name, "market": "stocks", "type": info.get("quoteType", "CS")}]
        except Exception:
            pass
        return []
    yf_results = await asyncio.to_thread(_yf_search)
    return _sanitize(yf_results[:10])


@router.get("/{ticker}/signals")
async def stock_signals(ticker: str):
    """Compute RSI, MACD, EMA/SMA signals from 100d daily data."""

    symbol = ticker.upper()

    def _safe_number(value: Any) -> float | None:
        try:
            f = float(value)
            return f if math.isfinite(f) else None
        except Exception:
            return None

    def _compute():
        try:
            tk = yf.Ticker(symbol)
            hist = tk.history(period="100d")
            if hist.empty or len(hist) < 50:
                return {"ticker": symbol, "score": 50, "overall": "neutral", "signals": {}}

            close = hist["Close"]
            volume = hist["Volume"]

            # RSI(14)
            delta = close.diff()
            gain = delta.clip(lower=0).rolling(14).mean()
            loss = (-delta.clip(upper=0)).rolling(14).mean()
            rs = gain / loss
            rsi_series = 100 - (100 / (1 + rs))
            current_rsi = _safe_number(rsi_series.iloc[-1])
            if current_rsi is None:
                current_rsi = 50.0

            # MACD
            ema12 = close.ewm(span=12).mean()
            ema26 = close.ewm(span=26).mean()
            macd_line = ema12 - ema26
            signal_line = macd_line.ewm(span=9).mean()
            histogram = macd_line - signal_line
            macd_val = _safe_number(histogram.iloc[-1]) or 0.0
            macd_prev = _safe_number(histogram.iloc[-2]) or 0.0

            # EMAs
            ema20 = _safe_number(close.ewm(span=20).mean().iloc[-1])
            sma50 = _safe_number(close.rolling(50).mean().iloc[-1])
            price = _safe_number(close.iloc[-1])
            if ema20 is None or sma50 is None or price is None:
                return {"ticker": symbol, "score": 50, "overall": "neutral", "signals": {}}

            # Volume
            avg_vol = _safe_number(volume.rolling(20).mean().iloc[-1]) or 0.0
            cur_vol = _safe_number(volume.iloc[-1]) or 0.0
            vol_ratio = cur_vol / avg_vol if avg_vol > 0 else 1.0

            signals = {
                "rsi": {
                    "value": round(current_rsi, 1),
                    "signal": "oversold" if current_rsi < 30 else "overbought" if current_rsi > 70 else "neutral",
                    "label": "RSI(14)",
                },
                "macd": {
                    "value": round(macd_val, 4),
                    "signal": "bullish" if macd_val > 0 and macd_prev <= 0 else "bearish" if macd_val < 0 and macd_prev >= 0 else ("bullish" if macd_val > 0 else "bearish"),
                    "label": "MACD",
                },
                "ema20": {
                    "value": round(ema20, 2),
                    "signal": "above" if price > ema20 else "below",
                    "label": "EMA(20)",
                },
                "sma50": {
                    "value": round(sma50, 2),
                    "signal": "above" if price > sma50 else "below",
                    "label": "SMA(50)",
                },
                "volume": {
                    "value": round(vol_ratio, 2),
                    "signal": "spike" if vol_ratio > 2 else "high" if vol_ratio > 1.5 else "normal",
                    "label": "Volume",
                },
            }

            # Score: 0-100
            score = 50
            if current_rsi < 30:
                score += 15
            elif current_rsi > 70:
                score -= 15
            elif current_rsi < 40:
                score += 5
            elif current_rsi > 60:
                score -= 5
            if macd_val > 0:
                score += 15
            else:
                score -= 15
            if price > ema20:
                score += 10
            else:
                score -= 10
            if price > sma50:
                score += 10
            else:
                score -= 10
            score = max(0, min(100, score))

            tags = [
                "MOMENTUM" if abs(current_rsi - 50) > 15 else None,
                "TREND" if sma50 and abs(price - sma50) / sma50 > 0.05 else None,
                "VOLUME" if vol_ratio > 1.5 else None,
            ]

            return {
                "ticker": symbol,
                "price": round(price, 2),
                "score": score,
                "overall": "bullish" if score >= 60 else "bearish" if score <= 40 else "neutral",
                "signals": signals,
                "tags": [tag for tag in tags if tag],
            }
        except Exception:
            return {"ticker": symbol, "score": 50, "overall": "neutral", "signals": {}, "tags": []}

    result = await asyncio.to_thread(_compute)
    return _sanitize(result)


@router.get("/{ticker}/logo")
async def stock_logo(ticker: str):
    symbol = ticker.upper().strip()
    if not _logo_symbol_variants(symbol):
        raise HTTPException(status_code=404, detail="Invalid ticker")
    logo = await _cached_endpoint(f"logo:{symbol}", 24 * 60 * 60, lambda: _fetch_company_logo(symbol))
    return Response(
        content=logo["content"],
        media_type=logo["media_type"],
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Logo-Source": logo["source"],
        },
    )


@router.get("/{ticker}")
async def stock_overview(ticker: str):
    return await _cached_endpoint(f"stock:{ticker.upper()}", 300, lambda: _stock_overview_impl(ticker))


async def _stock_overview_impl(ticker: str):
    def _work():
        symbol = ticker.upper()
        tk = yf.Ticker(symbol)
        info = tk.info
        fi = tk.fast_info
        last_price = float(fi.last_price)
        prev_close = float(fi.previous_close)
        from app.services.zh_names import get_zh_info
        zh = get_zh_info(symbol)
        website = info.get("website")
        logo_urls = _logo_urls(symbol, website)
        return {
            "ticker": symbol,
            "name": zh.get("name_zh") or info.get("shortName", symbol),
            "name_en": info.get("shortName", symbol),
            "website": website,
            "logo_url": logo_urls[0] if logo_urls else None,
            "logo_urls": logo_urls,
            "price": round(last_price, 2),
            "change": round(last_price - prev_close, 2),
            "change_percent": round((last_price - prev_close) / prev_close * 100, 2) if prev_close else 0,
            "volume": int(fi.last_volume) if fi.last_volume else None,
            "market_cap": float(fi.market_cap) if fi.market_cap else None,
            "prev_close": round(prev_close, 2),
            "high": info.get("dayHigh"),
            "low": info.get("dayLow"),
            "open": info.get("open"),
            "description": zh.get("description_zh") or info.get("longBusinessSummary", ""),
            "description_en": info.get("longBusinessSummary", ""),
            "sic_description": info.get("industry", ""),
            "pe_ratio": info.get("trailingPE"),
            "dividend_yield": info.get("dividendYield"),
            "year_high": info.get("fiftyTwoWeekHigh"),
            "year_low": info.get("fiftyTwoWeekLow"),
        }

    return _sanitize(await asyncio.to_thread(_work))


def _compute_ema(data, period):
    if len(data) < period:
        return []
    k = 2 / (period + 1)
    result = []
    prev = sum(data[:period]) / period
    result.append(prev)
    for i in range(period, len(data)):
        prev = data[i] * k + prev * (1 - k)
        result.append(prev)
    return result


def _compute_sma(data, period):
    if len(data) < period:
        return []
    result = []
    s = sum(data[:period])
    result.append(s / period)
    for i in range(period, len(data)):
        s += data[i] - data[i - period]
        result.append(s / period)
    return result


# Keep chart data live-ish. Personal dashboard traffic is low, and a 5-minute
# cap prevents the current candle from feeling stale during active sessions.
_CHART_TTL = {"5m": 300, "15m": 300, "1h": 300, "1d": 300, "1w": 300}
_NEW_YORK_TZ = ZoneInfo("America/New_York")


@router.get("/{ticker}/chart")
async def stock_chart(ticker: str, range: str = Query("1d", pattern="^(5m|15m|1h|1d|1w)$")):
    return await _cached_endpoint(
        f"chart:{ticker.upper()}:{range}",
        _CHART_TTL.get(range, 600),
        lambda: _stock_chart_impl(ticker, range)
    )


async def _stock_chart_impl(ticker: str, range: str):
    def _work():
        # Buttons = K-line intervals (周期), fetch plenty of data for scrolling
        # (yf_period, yf_interval, prepost, visible_bars)
        # visible_bars = how many bars to show initially (user can scroll left for more)
        config = {
            "5m":  ("5d",   "5m",  True,  80),    # 5分钟K线, fetch 5 days
            "15m": ("1mo",  "15m", True,  80),     # 15分钟K线, fetch 1 month
            "1h":  ("3mo",  "1h",  True,  80),     # 1小时K线, fetch 3 months
            "1d":  ("2y",   "1d",  False, 120),    # 日K线, fetch 2 years
            "1w":  ("5y",   "1wk", False, 104),    # 周K线, fetch 5 years
        }
        yf_period, interval, prepost, visible = config.get(range, ("1y", "1d", False, 120))

        tk = yf.Ticker(ticker.upper())
        hist = tk.history(period=yf_period, interval=interval, prepost=prepost)
        if hist.empty:
            return {"bars": [], "ema20": [], "sma50": []}

        raw_bars = []
        for idx, row in hist.iterrows():
            t = int(idx.timestamp())
            try:
                o, h, l, c = (
                    round(float(row["Open"]), 2),
                    round(float(row["High"]), 2),
                    round(float(row["Low"]), 2),
                    round(float(row["Close"]), 2),
                )
            except Exception:
                continue
            if not all(math.isfinite(v) and v > 0 for v in (o, h, l, c)):
                continue
            try:
                volume_raw = float(row.get("Volume", 0))
                v = max(0, int(volume_raw)) if math.isfinite(volume_raw) else 0
            except Exception:
                v = 0
            bar = {"t": t, "o": o, "h": h, "l": l, "c": c, "v": v}
            if prepost:
                dt = idx.to_pydatetime()
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=_NEW_YORK_TZ)
                else:
                    dt = dt.astimezone(_NEW_YORK_TZ)
                bar["_ny_min"] = dt.hour * 60 + dt.minute
            raw_bars.append(bar)

        # For intraday with prepost: keep valid extended-hours bars and tag
        # them so the frontend can visually distinguish pre/post-market.
        if prepost:
            filtered = []
            for b in raw_bars:
                hour_min = b.pop("_ny_min", None)
                if hour_min is None:
                    continue
                is_regular = 570 <= hour_min < 960  # 9:30 to 16:00 ET
                has_valid_price = all(math.isfinite(float(b[k])) and float(b[k]) > 0 for k in ("o", "h", "l", "c"))
                if not has_valid_price:
                    continue
                if is_regular:
                    b["session"] = "regular"
                    filtered.append(b)
                else:
                    b["ext"] = True
                    b["session"] = "pre" if hour_min < 570 else "post"
                    filtered.append(b)
            bars = filtered
        else:
            bars = raw_bars

        # Compute EMA/SMA on FULL fetch window (more data = smoother lines)
        closes = [b["c"] for b in bars]
        times = [b["t"] for b in bars]

        ema20 = _compute_ema(closes, 20)
        sma50 = _compute_sma(closes, 50)

        ema20_data = [{"time": times[i + len(closes) - len(ema20)], "value": round(v, 2)} for i, v in enumerate(ema20)]
        sma50_data = [{"time": times[i + len(closes) - len(sma50)], "value": round(v, 2)} for i, v in enumerate(sma50)]

        # Send ALL data to frontend — let TradingView handle scrolling
        # visible tells frontend how many bars to show initially
        return {"bars": bars, "ema20": ema20_data, "sma50": sma50_data, "visible": visible}

    return _sanitize(await asyncio.to_thread(_work))
