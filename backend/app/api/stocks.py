from __future__ import annotations

import asyncio
import math
from typing import Any

import yfinance as yf
from fastapi import APIRouter, Query


router = APIRouter(prefix="/api/stocks", tags=["stocks"])


def _sanitize(obj):
    """Recursively replace NaN/Inf with None for JSON serialization."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize(v) for v in obj]
    return obj


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
    from app.services.sectors import SECTORS

    all_tickers = []
    for sec in SECTORS.values():
        all_tickers.extend(sec["tickers"])
    all_tickers = list(dict.fromkeys(all_tickers))

    async def fetch_one(ticker):
        def _work():
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
            except Exception:
                return None

        return await asyncio.to_thread(_work)

    results = await asyncio.gather(*[fetch_one(t) for t in all_tickers], return_exceptions=True)
    price_map = {r["ticker"]: r for r in results if isinstance(r, dict)}

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


@router.get("/{ticker}")
async def stock_overview(ticker: str):
    def _work():
        tk = yf.Ticker(ticker.upper())
        info = tk.info
        fi = tk.fast_info
        last_price = float(fi.last_price)
        prev_close = float(fi.previous_close)
        from app.services.zh_names import get_zh_info
        zh = get_zh_info(ticker.upper())
        return {
            "ticker": ticker.upper(),
            "name": zh.get("name_zh") or info.get("shortName", ticker.upper()),
            "name_en": info.get("shortName", ticker.upper()),
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


@router.get("/{ticker}/chart")
async def stock_chart(ticker: str, range: str = Query("1d", pattern="^(1d|1h|5d|1m|3m|1y|all)$")):
    def _work():
        # Config per timeframe: (period, interval, include_prepost)
        config = {
            "1h":  ("5d",  "1h",  True),    # 5 days hourly
            "1d":  ("2d",  "5m",  True),    # 2 days 5-min
            "5d":  ("5d",  "15m", False),   # 5 days 15-min
            "1m":  ("1mo", "1d",  False),   # 1 month daily
            "1y":  ("6mo", "1d",  False),   # 6 months daily
            "all": ("2y",  "1wk", False),   # 2 years weekly
        }
        period, interval, prepost = config.get(range, ("3mo", "1d", False))

        tk = yf.Ticker(ticker.upper())
        hist = tk.history(period=period, interval=interval, prepost=prepost)
        if hist.empty:
            return {"bars": [], "ema20": [], "sma50": []}

        raw_bars = []
        for idx, row in hist.iterrows():
            t = int(idx.timestamp())
            o, h, l, c = round(float(row["Open"]), 2), round(float(row["High"]), 2), round(float(row["Low"]), 2), round(float(row["Close"]), 2)
            v = int(row["Volume"])
            raw_bars.append({"t": t, "o": o, "h": h, "l": l, "c": c, "v": v})

        # For intraday with prepost: filter out degenerate bars
        # Keep bars that have volume > 0 OR are within regular market hours (9:30-16:00 ET)
        if prepost:
            from datetime import datetime as _dt, timezone as _tz, timedelta as _td
            ET = _tz(_td(hours=-4))
            filtered = []
            for b in raw_bars:
                dt = _dt.fromtimestamp(b["t"], tz=ET)
                hour_min = dt.hour * 60 + dt.minute
                is_regular = 570 <= hour_min < 960  # 9:30 to 16:00 ET
                if is_regular:
                    filtered.append(b)
                elif b["v"] > 0:
                    # Extended hours: only keep bars with actual volume
                    b["ext"] = True
                    filtered.append(b)
            bars = filtered
        else:
            bars = raw_bars

        closes = [b["c"] for b in bars]
        times = [b["t"] for b in bars]

        ema20 = _compute_ema(closes, 20)
        sma50 = _compute_sma(closes, 50)

        ema20_data = [{"time": times[i + len(closes) - len(ema20)], "value": round(v, 2)} for i, v in enumerate(ema20)]
        sma50_data = [{"time": times[i + len(closes) - len(sma50)], "value": round(v, 2)} for i, v in enumerate(sma50)]

        return {"bars": bars, "ema20": ema20_data, "sma50": sma50_data}

    return _sanitize(await asyncio.to_thread(_work))
