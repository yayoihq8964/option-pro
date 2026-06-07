from __future__ import annotations

import asyncio
import math
from typing import Any

import yfinance as yf
from fastapi import APIRouter

from app.services.cache import cache

router = APIRouter(prefix="/api/earnings", tags=["earnings"])

EARNINGS_TICKERS = [
    # Magnificent 7
    "NVDA", "TSLA", "AAPL", "AMZN", "META", "MSFT", "GOOGL",
    # Semiconductors
    "AMD", "AVGO", "TSM", "ASML", "MU", "INTC", "ARM", "QCOM", "MRVL", "AMAT", "LRCX", "KLAC",
    # Software / Cloud
    "CRM", "ORCL", "ADBE", "NOW", "SNOW", "PLTR", "NET", "PANW", "CRWD",
    # Consumer / Media
    "NFLX", "DIS", "BABA", "COST", "WMT", "TGT", "NKE", "SBUX", "MCD",
    # Finance
    "JPM", "GS", "MS", "V", "MA", "BAC", "C", "BLK",
    # Biotech / Pharma
    "LLY", "NVO", "ABBV", "AMGN", "GILD", "MRNA", "PFE", "JNJ", "UNH",
    # Energy
    "XOM", "CVX", "COP", "SLB",
    # Industrials / Others
    "BA", "CAT", "DE", "UPS", "FDX",
    # Chinese ADRs
    "PDD", "JD", "BIDU", "NIO", "LI", "XPEV",
]


from app.services.utils import sanitize as _sanitize


def _to_optional_float(value: Any) -> float | None:
    try:
        f = float(value)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return None


def _first(value: Any) -> Any:
    """Return the first item from list-like calendar fields; pass scalars through."""
    if value is None:
        return None
    try:
        if hasattr(value, "iloc"):
            return value.iloc[0] if len(value) else None
        if isinstance(value, (list, tuple)):
            return value[0] if value else None
    except Exception:
        return None
    return value


@router.get("/upcoming")
async def upcoming_earnings():
    """Fetch real upcoming earnings dates from Yahoo Finance."""

    key = "earnings:upcoming"
    cached = cache.get(key)
    if cached:
        return _sanitize(cached)

    async def fetch_one(ticker: str):
        def _work():
            try:
                tk = yf.Ticker(ticker)
                info = tk.info
                name = info.get("shortName", ticker)

                # earnings_dates requires lxml in some yfinance paths; calendar
                # provides the upcoming date and estimate fields without it.
                cal = tk.calendar
                if cal is None:
                    return None

                earnings_dates = cal.get("Earnings Date", [])
                next_raw = _first(earnings_dates)
                if next_raw is None:
                    return None

                return {
                    "ticker": ticker,
                    "name": name,
                    "earnings_date": str(next_raw),
                    "eps_estimate": _to_optional_float(cal.get("Earnings Average")),
                    "eps_high": _to_optional_float(cal.get("Earnings High")),
                    "eps_low": _to_optional_float(cal.get("Earnings Low")),
                    "revenue_estimate": _to_optional_float(cal.get("Revenue Average")),
                    "market_cap": _to_optional_float(info.get("marketCap")),
                    "sector": info.get("sector", ""),
                }
            except Exception:
                return None

        return await asyncio.to_thread(_work)

    results = await asyncio.gather(*[fetch_one(t) for t in EARNINGS_TICKERS], return_exceptions=True)
    earnings = [r for r in results if isinstance(r, dict)]
    earnings.sort(key=lambda x: x.get("earnings_date", "9999"))

    response = _sanitize({"earnings": earnings})
    cache.set(key, response, ttl=3600)
    return response
