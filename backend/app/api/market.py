from __future__ import annotations

import asyncio
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/status")
async def market_status():
    """Determine US market status from current time (no external API needed)."""
    def _compute():
        # US Eastern Time
        et = datetime.now(timezone(timedelta(hours=-4)))
        weekday = et.weekday()  # 0=Mon, 6=Sun
        hour, minute = et.hour, et.minute
        t = hour * 60 + minute

        if weekday >= 5:
            market = "closed"
            phase = "weekend"
        elif t < 4 * 60:
            market = "closed"
            phase = "overnight"
        elif t < 9 * 60 + 30:
            market = "pre-market"
            phase = "pre-market"
        elif t < 16 * 60:
            market = "open"
            phase = "regular"
        elif t < 20 * 60:
            market = "after-hours"
            phase = "after-hours"
        else:
            market = "closed"
            phase = "overnight"

        return {
            "market": market,
            "phase": phase,
            "server_time": et.isoformat(),
            "exchanges": {
                "nasdaq": market if market in ("open", "closed") else "extended",
                "nyse": market if market in ("open", "closed") else "extended",
            },
        }

    return await asyncio.to_thread(_compute)
