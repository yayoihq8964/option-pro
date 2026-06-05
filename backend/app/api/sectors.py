from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import Sector, SectorIVLimitedResponse
from app.services.sectors import SECTORS

router = APIRouter(prefix="/api/sectors", tags=["sectors"])


def ensure_sector(sector_id: str) -> None:
    if sector_id not in SECTORS:
        raise HTTPException(status_code=404, detail=f"Unknown sector: {sector_id}")


@router.get("", response_model=list[Sector])
async def list_sectors():
    return [Sector(id=id_, name=data["name"], tickers=data["tickers"]) for id_, data in SECTORS.items()]


@router.get("/{sector_id}/iv-ranking", response_model=SectorIVLimitedResponse)
async def iv_ranking(sector_id: str):
    ensure_sector(sector_id)
    return SectorIVLimitedResponse(
        rankings=[],
        data_limited=True,
        message="IV data requires Options Starter plan.",
    )


@router.get("/{sector_id}/heatmap", response_model=SectorIVLimitedResponse)
async def heatmap(sector_id: str):
    ensure_sector(sector_id)
    return SectorIVLimitedResponse(
        rankings=[],
        data_limited=True,
        message="IV data requires Options Starter plan.",
    )
