from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, HTTPException

from app.services import yahoo
from app.services.sectors import SECTORS
from app.services.zh_names import get_zh_name

router = APIRouter(prefix="/api/sectors", tags=["sectors"])

# Simple TTL cache shared by sector endpoints (10 min — IV ranks change slowly).
# Per-key locks prevent thundering herd: without them, concurrent cold-cache
# requests would each kick off a full sector scan.
_cache: dict[str, tuple[float, Any]] = {}
_locks: dict[str, asyncio.Lock] = {}


def _lock_for(key: str) -> asyncio.Lock:
    lock = _locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _locks[key] = lock
    return lock


async def _cached(key: str, ttl: int, loader):
    now = time.time()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    async with _lock_for(key):
        now = time.time()
        hit = _cache.get(key)
        if hit and hit[0] > now:
            return hit[1]
        try:
            value = await loader()
        except Exception:
            if hit:
                return hit[1]  # stale fallback
            raise
        _cache[key] = (now + ttl, value)
        return value


def ensure_sector(sector_id: str) -> None:
    if sector_id not in SECTORS:
        raise HTTPException(status_code=404, detail=f"Unknown sector: {sector_id}")


@router.get("")
async def list_sectors():
    return {"sectors": [{"id": id_, "name": data["name"], "tickers": data["tickers"]} for id_, data in SECTORS.items()]}


async def _sector_iv_rows(sector_id: str) -> list[dict[str, Any]]:
    """Fetch price + ATM IV for every sector ticker IN PARALLEL.

    The old implementation looped tickers sequentially in one thread and even
    called the very slow yfinance `.info` scrape just for a display name —
    a 14-ticker sector took 30-60s cold. Names now come from the local
    zh_names dictionary, and per-ticker work runs in a bounded thread pool.
    """
    sector = SECTORS[sector_id]
    sem = asyncio.Semaphore(8)

    def _one(ticker: str) -> dict[str, Any] | None:
        try:
            iv = yahoo.get_stock_iv(ticker)
            if iv is None:
                return None
            price = yahoo.get_last_price(ticker)
            return {
                "ticker": ticker,
                "name": get_zh_name(ticker) or ticker,
                "price": round(price, 2) if price is not None else None,
                "iv": iv,
            }
        except Exception:
            return None

    async def bounded(ticker: str):
        async with sem:
            return await asyncio.to_thread(_one, ticker)

    results = await asyncio.gather(*[bounded(t) for t in sector["tickers"]], return_exceptions=True)
    return [r for r in results if isinstance(r, dict)]


async def _iv_ranking_payload(sector_id: str) -> dict:
    sector = SECTORS[sector_id]
    rows = await _sector_iv_rows(sector_id)

    rankings = [
        {
            "ticker": row["ticker"],
            "name": row["name"],
            "price": row["price"],
            "iv_rank": None,
            "iv_percentile": round(row["iv"] * 100, 1),
            "iv_pct": round(row["iv"] * 100, 1),
            "iv_current": round(row["iv"] * 100, 1),
            "iv_change_30d": None,
        }
        for row in rows
    ]
    rankings.sort(key=lambda r: r["iv_percentile"])
    for i, r in enumerate(rankings):
        r["iv_rank"] = round((i + 1) / len(rankings) * 100, 1) if rankings else 0

    return {"sector_id": sector_id, "sector_name": sector["name"], "rankings": rankings, "data_limited": False}


@router.get("/{sector_id}/iv-ranking")
async def iv_ranking(sector_id: str):
    ensure_sector(sector_id)
    return await _cached(f"iv:{sector_id}", 600, lambda: _iv_ranking_payload(sector_id))


@router.get("/{sector_id}/heatmap")
async def heatmap(sector_id: str):
    ensure_sector(sector_id)
    # Reuse the iv-ranking cache — the heatmap is a projection of the same
    # data, so visiting both views costs one scan instead of two.
    payload = await _cached(f"iv:{sector_id}", 600, lambda: _iv_ranking_payload(sector_id))
    data = [
        {"ticker": item["ticker"], "iv_percentile": item["iv_percentile"]}
        for item in payload.get("rankings", [])
    ]
    return {
        "sector_id": sector_id,
        "sector_name": payload.get("sector_name", SECTORS[sector_id]["name"]),
        "data": data,
        "rankings": data,
        "data_limited": False,
    }
