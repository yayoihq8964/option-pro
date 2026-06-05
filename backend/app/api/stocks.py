from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Query

from app.models.schemas import BarsResponse, StockOverview, TickerSearchResult
from app.services.cache import cache
from app.services.massive import MassiveClient

router = APIRouter(prefix="/api/stocks", tags=["stocks"])


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


@router.get("/{ticker}", response_model=StockOverview)
async def stock_overview(ticker: str):
    symbol = ticker.upper()
    client = MassiveClient()
    details_data = await cache.get_or_set(f"ticker_details:{symbol}", 300, lambda: client.ticker_details(symbol))
    snap_data = await cache.get_or_set(f"stock_snapshot:{symbol}", 60, lambda: client.stock_snapshot(symbol))
    details = details_data.get("results") or {}
    snap = _snapshot_payload(snap_data)
    price = _last_price(snap)
    change, change_pct, prev = _change(snap, price)
    return StockOverview(
        ticker=symbol,
        name=details.get("name"),
        price=price,
        change=change,
        change_percent=change_pct,
        volume=(snap.get("day") or {}).get("v") or (snap.get("min") or {}).get("v"),
        market_cap=details.get("market_cap"),
        prev_close=prev,
        description=details.get("description"),
        sic_code=details.get("sic_code"),
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
