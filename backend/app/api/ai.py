from __future__ import annotations
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services import ai_analysis
from app.api.stocks import _sanitize

router = APIRouter(prefix="/api/ai", tags=["ai"])


class AlertsRequest(BaseModel):
    ticker: str
    alerts: list[dict] = []
    underlying_price: float = 0
    expiration: str = ""


@router.post("/analyze-alerts")
async def analyze_alerts(req: AlertsRequest):
    try:
        result = await asyncio.to_thread(
            ai_analysis.analyze_option_alerts,
            req.ticker, req.alerts, req.underlying_price, req.expiration
        )
        return _sanitize(result)
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/earnings-correlation")
async def earnings_correlation():
    try:
        from app.api.earnings import upcoming_earnings
        data = await upcoming_earnings()
        earnings = data.get("earnings", []) if isinstance(data, dict) else []
        result = await asyncio.to_thread(ai_analysis.analyze_earnings_correlation, earnings)
        return _sanitize(result)
    except Exception as e:
        raise HTTPException(500, str(e))
