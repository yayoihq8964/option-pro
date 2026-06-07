from __future__ import annotations

import asyncio
import time
from typing import Any

import yfinance as yf
from fastapi import APIRouter, HTTPException

from app.models.schemas import Sector
from app.services import yahoo
from app.services.sectors import SECTORS

router = APIRouter(prefix="/api/sectors", tags=["sectors"])

# Simple TTL cache shared by sector endpoints (10 min — IV ranks change slowly)
_cache: dict[str, tuple[float, Any]] = {}

async def _cached(key: str, ttl: int, loader):
    now = time.time()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    try:
        value = await loader()
    except Exception:
        if hit:
            return hit[1]
        raise
    _cache[key] = (now + ttl, value)
    return value


def ensure_sector(sector_id: str) -> None:
    if sector_id not in SECTORS:
        raise HTTPException(status_code=404, detail=f"Unknown sector: {sector_id}")


@router.get("")
async def list_sectors():
    return {"sectors": [{"id": id_, "name": data["name"], "tickers": data["tickers"]} for id_, data in SECTORS.items()]}


@router.get("/{sector_id}/iv-ranking")
async def iv_ranking(sector_id: str):
    ensure_sector(sector_id)
    return await _cached(f"iv:{sector_id}", 600, lambda: _iv_ranking_impl(sector_id))


async def _iv_ranking_impl(sector_id: str):
    sector = SECTORS[sector_id]

    def load() -> dict:
        rankings = []
        for ticker in sector["tickers"]:
            try:
                t = yf.Ticker(ticker)
                price = yahoo._safe_float(t.fast_info.last_price)
                iv = yahoo.get_stock_iv(ticker)
                if iv is not None:
                    try:
                        name = t.info.get("shortName", ticker)
                    except Exception:
                        name = ticker
                    rankings.append(
                        {
                            "ticker": ticker,
                            "name": name,
                            "price": round(price, 2) if price is not None else None,
                            "iv_rank": None,
                            "iv_percentile": round(iv * 100, 1),
                            "iv_pct": round(iv * 100, 1),
                            "iv_current": round(iv * 100, 1),
                            "iv_change_30d": None,
                        }
                    )
            except Exception:
                continue

        rankings.sort(key=lambda r: r["iv_percentile"])
        for i, r in enumerate(rankings):
            r["iv_rank"] = round((i + 1) / len(rankings) * 100, 1) if rankings else 0

        return {"sector_id": sector_id, "sector_name": sector["name"], "rankings": rankings, "data_limited": False}

    return await asyncio.to_thread(load)


@router.get("/{sector_id}/heatmap")
async def heatmap(sector_id: str):
    ensure_sector(sector_id)
    return await _cached(f"hm:{sector_id}", 600, lambda: _heatmap_impl(sector_id))


async def _heatmap_impl(sector_id: str):
    sector = SECTORS[sector_id]

    def load() -> dict:
        data = []
        for ticker in sector["tickers"]:
            try:
                iv = yahoo.get_stock_iv(ticker)
                if iv is not None:
                    data.append({"ticker": ticker, "iv_percentile": round(iv * 100, 1)})
            except Exception:
                continue

        return {"sector_id": sector_id, "sector_name": sector["name"], "data": data, "rankings": data, "data_limited": False}

    return await asyncio.to_thread(load)
