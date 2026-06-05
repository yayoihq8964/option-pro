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
    results = []
    for ticker, name in KNOWN_TICKERS.items():
        if q_upper in ticker or q_lower in name.lower():
            results.append({"ticker": ticker, "name": name, "market": "stocks", "type": "CS"})
    return _sanitize(results[:10])


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
async def stock_chart(ticker: str, range: str = Query("1d", pattern="^(1d|5d|1m|3m|1y|all)$")):
    def _work():
        period_map = {"1d": "5d", "5d": "1mo", "1m": "3mo", "1y": "1y", "all": "5y"}
        interval_map = {"1d": "5m", "5d": "30m", "1m": "1d", "1y": "1d", "all": "1wk"}
        period = period_map.get(range, "3mo")
        interval = interval_map.get(range, "1d")

        tk = yf.Ticker(ticker.upper())
        hist = tk.history(period=period, interval=interval)
        if hist.empty:
            return {"bars": [], "ema20": [], "sma50": []}

        bars = []
        for idx, row in hist.iterrows():
            t = int(idx.timestamp())
            bars.append({
                "t": t,
                "o": round(float(row["Open"]), 2),
                "h": round(float(row["High"]), 2),
                "l": round(float(row["Low"]), 2),
                "c": round(float(row["Close"]), 2),
                "v": int(row["Volume"]),
            })

        closes = [b["c"] for b in bars]
        times = [b["t"] for b in bars]

        ema20 = _compute_ema(closes, 20)
        sma50 = _compute_sma(closes, 50)

        ema20_data = [{"time": times[i + len(closes) - len(ema20)], "value": round(v, 2)} for i, v in enumerate(ema20)]
        sma50_data = [{"time": times[i + len(closes) - len(sma50)], "value": round(v, 2)} for i, v in enumerate(sma50)]

        return {"bars": bars, "ema20": ema20_data, "sma50": sma50_data}

    return _sanitize(await asyncio.to_thread(_work))
