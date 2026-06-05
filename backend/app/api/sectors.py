from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import Sector, SectorHeatmapItem, SectorIVRank
from app.services.cache import cache
from app.services.massive import MassiveClient
from app.services.sectors import SECTORS, sector_heatmap, sector_iv_ranking

router = APIRouter(prefix="/api/sectors", tags=["sectors"])


def ensure_sector(sector_id: str) -> None:
    if sector_id not in SECTORS:
        raise HTTPException(status_code=404, detail=f"Unknown sector: {sector_id}")


@router.get("", response_model=list[Sector])
async def list_sectors():
    return [Sector(id=id_, name=data["name"], tickers=data["tickers"]) for id_, data in SECTORS.items()]


@router.get("/{sector_id}/iv-ranking", response_model=list[SectorIVRank])
async def iv_ranking(sector_id: str):
    ensure_sector(sector_id)
    client = MassiveClient()
    return await cache.get_or_set(f"sector_iv:{sector_id}", 300, lambda: sector_iv_ranking(sector_id, client))


@router.get("/{sector_id}/heatmap", response_model=list[SectorHeatmapItem])
async def heatmap(sector_id: str):
    ensure_sector(sector_id)
    client = MassiveClient()
    return await cache.get_or_set(f"sector_heatmap:{sector_id}", 300, lambda: sector_heatmap(sector_id, client))
