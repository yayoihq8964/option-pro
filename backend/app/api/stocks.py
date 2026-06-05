from __future__ import annotations

import asyncio
import math
from datetime import date, timedelta
from typing import Any

import yfinance as yf
from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import BarsResponse, StockOverview, TickerSearchResult
from app.services.cache import cache
from app.services.massive import MassiveClient

router = APIRouter(prefix="/api/stocks", tags=["stocks"])

WATCHLIST = ["NVDA", "TSLA", "AAPL", "AMD", "AMZN", "META", "MSFT", "SPY", "QQQ", "GOOGL"]


def _sanitize(obj):
    """Recursively replace NaN/Inf with None for JSON serialization."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize(v) for v in obj]
    return obj


def _snapshot_payload(data: dict[str, Any]) -> dict[str, Any]:
    return data.get("ticker") or data.get("results") or data


def _last_price(snap: dict[str, Any]) -> float | None:
    for path in (("lastTrade", "p"), ("lastQuote", "P"), ("day", "c"), ("min", "c")):
        cur: Any = snap
        for key in path:
            cur = cur.get(key) if isinstance(cur, dict) else None
        if cur is not None:
            return float(cur)
    return None


def _change(snap: dict[str, Any], price: float | None) -> tuple[float | None, float | None, float | None]:
    prev = (snap.get("prevDay") or {}).get("c")
    if price is None or prev in (None, 0):
        return None, None, prev
    change = price - float(prev)
    return round(change, 4), round(change / float(prev) * 100, 4), float(prev)


@router.get("/watchlist")
async def watchlist():
    """Return batch stock data for default watchlist with 7-day spark bars."""

    async def fetch_one(ticker: str):
        def _work():
            try:
                tk = yf.Ticker(ticker)
                info = tk.fast_info
                hist = tk.history(period="7d")
                bars = [round(float(row["Close"]), 2) for _, row in hist.iterrows()] if not hist.empty else []
                price = float(info.last_price)
                prev = float(info.previous_close) if info.previous_close else price
                mc = float(info.market_cap) if info.market_cap else None
                if mc is not None and (math.isnan(mc) or math.isinf(mc)):
                    mc = None
                chg = round(price - prev, 2) if prev else 0
                chg_pct = round((price - prev) / prev * 100, 2) if prev and prev != 0 else 0
                if math.isnan(chg): chg = 0
                if math.isnan(chg_pct): chg_pct = 0
                return {
                    "ticker": ticker,
                    "name": tk.info.get("shortName", ticker),
                    "price": round(price, 2),
                    "change": chg,
                    "change_percent": chg_pct,
                    "market_cap": mc,
                    "spark": bars[-7:],
                }
            except Exception:
                return None

        return await asyncio.to_thread(_work)

    results = await asyncio.gather(*[fetch_one(t) for t in WATCHLIST], return_exceptions=True)
    stocks = [r for r in results if isinstance(r, dict)]
    return _sanitize({"stocks": stocks})


@router.get("/search", response_model=list[TickerSearchResult])
async def search_stocks(q: str = Query(..., min_length=1, max_length=50)):
    client = MassiveClient()
    data = await cache.get_or_set(f"ticker_search:{q.lower()}", 300, lambda: client.ticker_search(q))
    return [
        TickerSearchResult(
            ticker=item.get("ticker", ""),
            name=item.get("name"),
            market=item.get("market"),
            type=item.get("type"),
        )
        for item in data.get("results", [])
    ]


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


@router.get("/{ticker}", response_model=StockOverview)
async def stock_overview(ticker: str):
    symbol = ticker.upper()
    client = MassiveClient()
    details_data = await cache.get_or_set(f"ticker_details:{symbol}", 300, lambda: client.ticker_details(symbol))
    prev_data = await cache.get_or_set(f"aggs_prev:{symbol}", 60, lambda: client.aggs_prev(symbol))
    details = details_data.get("results") or {}
    prev = (prev_data.get("results") or [{}])[0]
    if not prev:
        raise HTTPException(status_code=404, detail=f"No previous day aggregate found for {symbol}")

    open_price = prev.get("o")
    close_price = prev.get("c")
    change = close_price - open_price if close_price is not None and open_price is not None else None
    change_pct = (change / open_price * 100) if change is not None and open_price not in (None, 0) else None
    return StockOverview(
        ticker=symbol,
        name=details.get("name"),
        price=close_price,
        change=round(change, 4) if change is not None else None,
        change_percent=round(change_pct, 4) if change_pct is not None else None,
        volume=prev.get("v"),
        market_cap=details.get("market_cap"),
        prev_close=close_price,
        high=prev.get("h"),
        low=prev.get("l"),
        open=open_price,
        description=details.get("description"),
        sic_code=details.get("sic_code"),
        sic_description=details.get("sic_description"),
    )


def _range_params(range_: str) -> tuple[int, str, date, date]:
    today = date.today()
    if range_ == "1d":
        return 5, "minute", today - timedelta(days=3), today
    if range_ == "5d":
        return 30, "minute", today - timedelta(days=8), today
    if range_ == "1m":
        return 1, "day", today - timedelta(days=35), today
    if range_ == "3m":
        return 1, "day", today - timedelta(days=100), today
    if range_ == "1y":
        return 1, "day", today - timedelta(days=370), today
    if range_ == "all":
        return 1, "week", today - timedelta(days=3650), today
    return 1, "day", today - timedelta(days=35), today


@router.get("/{ticker}/chart", response_model=BarsResponse)
async def stock_chart(ticker: str, range: str = Query("1d", pattern="^(1d|5d|1m|3m|1y|all)$")):
    symbol = ticker.upper()
    multiplier, timespan, start, end = _range_params(range)
    client = MassiveClient()
    key = f"aggs:{symbol}:{range}"
    data = await cache.get_or_set(key, 60, lambda: client.aggs(symbol, multiplier, timespan, start.isoformat(), end.isoformat()))
    return BarsResponse(bars=[{"t": b["t"], "o": b["o"], "h": b["h"], "l": b["l"], "c": b["c"], "v": b["v"]} for b in data.get("results", [])])
