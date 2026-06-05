from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import yfinance as yf
from fastapi import APIRouter

from app.services.cache import cache

router = APIRouter(prefix="/api/earnings", tags=["earnings"])

EARNINGS_TICKERS = [
    "NVDA",
    "TSLA",
    "AAPL",
    "AMD",
    "AMZN",
    "META",
    "MSFT",
    "GOOGL",
    "DIS",
    "BABA",
    "NFLX",
    "CRM",
    "ORCL",
    "ADBE",
    "COST",
]


def _to_optional_float(value: Any) -> float | None:
    try:
        f = float(value)
        return None if f != f else f
    except Exception:
        return None


@router.get("/upcoming")
async def upcoming_earnings():
    """Fetch real upcoming earnings dates from Yahoo Finance."""

    key = "earnings:upcoming"
    cached = cache.get(key)
    if cached:
        return cached

    async def fetch_one(ticker: str):
        def _work():
            try:
                tk = yf.Ticker(ticker)
                info = tk.info
                name = info.get("shortName", ticker)

                # Get earnings dates
                try:
                    dates = tk.earnings_dates
                    if dates is not None and not dates.empty:
                        # Filter future dates
                        now = datetime.now(timezone.utc)
                        future = dates[dates.index > now]
                        if not future.empty:
                            next_date = str(future.index[0].date())
                            eps_est = future.iloc[0].get("EPS Estimate")
                            rev_est = future.iloc[0].get("Revenue Estimate")
                            return {
                                "ticker": ticker,
                                "name": name,
                                "earnings_date": next_date,
                                "eps_estimate": _to_optional_float(eps_est),
                                "revenue_estimate": _to_optional_float(rev_est),
                                "market_cap": info.get("marketCap"),
                                "sector": info.get("sector", ""),
                            }
                except Exception:
                    pass

                return None
            except Exception:
                return None

        return await asyncio.to_thread(_work)

    results = await asyncio.gather(*[fetch_one(t) for t in EARNINGS_TICKERS], return_exceptions=True)
    earnings = [r for r in results if isinstance(r, dict)]
    earnings.sort(key=lambda x: x.get("earnings_date", "9999"))

    response = {"earnings": earnings}
    cache.set(key, response, ttl=3600)
    return response
