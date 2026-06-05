from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import MarketStatus
from app.services.cache import cache
from app.services.massive import MassiveClient

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/status", response_model=MarketStatus)
async def market_status():
    client = MassiveClient()
    data = await cache.get_or_set("market_status", 30, client.market_status)
    market = data.get("market") or data.get("status") or "unknown"
    return MarketStatus(
        market=str(market).lower(),
        server_time=data.get("serverTime") or data.get("server_time"),
        exchanges=data.get("exchanges"),
        currencies=data.get("currencies"),
        raw=data,
    )
