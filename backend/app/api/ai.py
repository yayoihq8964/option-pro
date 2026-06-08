from __future__ import annotations
import asyncio
import hashlib
import os
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from app.services import ai_analysis
from app.api.stocks import _sanitize

router = APIRouter(prefix="/api/ai", tags=["ai"])
_TRUST_PROXY_HEADERS = os.environ.get("TRUST_PROXY_HEADERS", "").strip().lower() in {"1", "true", "yes"}


def _client_ip(request: Request) -> str:
    if _TRUST_PROXY_HEADERS:
        return (
            request.headers.get("cf-connecting-ip")
            or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or (request.client.host if request.client else "unknown")
        )
    return request.client.host if request.client else "unknown"


def _fingerprint(request: Request) -> str:
    """Generate a fingerprint from client IP to distinguish different users."""
    return hashlib.md5(_client_ip(request).encode()).hexdigest()[:12]


class AlertsRequest(BaseModel):
    ticker: str
    alerts: list[dict] = Field(default_factory=list)
    underlying_price: float = 0
    expiration: str = ""


@router.post("/analyze-alerts")
async def analyze_alerts(req: AlertsRequest, request: Request):
    try:
        fp = _fingerprint(request)
        result = await asyncio.to_thread(
            ai_analysis.analyze_option_alerts,
            req.ticker, req.alerts, req.underlying_price, req.expiration, fp
        )
        return _sanitize(result)
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/earnings-correlation")
async def earnings_correlation(request: Request):
    try:
        fp = _fingerprint(request)
        from app.api.earnings import upcoming_earnings
        data = await upcoming_earnings()
        earnings = data.get("earnings", []) if isinstance(data, dict) else []
        result = await asyncio.to_thread(ai_analysis.analyze_earnings_correlation, earnings, fp)
        return _sanitize(result)
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/earnings-impact/{ticker}")
async def earnings_impact(ticker: str, request: Request):
    """Per-company earnings impact: which other companies will this report move?"""
    try:
        fp = _fingerprint(request)
        # Find the company's earnings info
        from app.api.earnings import upcoming_earnings
        data = await upcoming_earnings()
        earnings = data.get("earnings", []) if isinstance(data, dict) else []
        target = next((e for e in earnings if e.get("ticker", "").upper() == ticker.upper()), None)
        if not target:
            # Use bare ticker — AI can still reason about generic company
            target = {"ticker": ticker.upper(), "name": ticker.upper(),
                      "sector": "", "earnings_date": "", "eps_estimate": None}
        result = await asyncio.to_thread(
            ai_analysis.analyze_single_earnings_impact, target, fp
        )
        return _sanitize(result)
    except Exception as e:
        raise HTTPException(500, str(e))
