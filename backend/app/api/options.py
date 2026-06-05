from __future__ import annotations

import asyncio
from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, Query

from app.models.schemas import ExpirationsResponse, OptionChainResponse, OptionLeg, UnusualActivity
from app.services.cache import cache
from app.services.massive import MassiveClient

router = APIRouter(prefix="/api/options", tags=["options"])
POPULAR_TICKERS = ["NVDA", "AAPL", "TSLA", "AMD", "MSFT", "AMZN", "META", "GOOGL", "SPY", "QQQ"]


def parse_option(item: dict[str, Any]) -> OptionLeg:
    details = item.get("details") or {}
    quote = item.get("last_quote") or {}
    trade = item.get("last_trade") or {}
    greeks = item.get("greeks") or {}
    day = item.get("day") or {}
    underlying_price = (item.get("underlying_asset") or {}).get("price")
    strike = float(details.get("strike_price") or 0)
    typ = details.get("contract_type") or "call"
    itm = None
    if underlying_price is not None:
        itm = underlying_price > strike if typ == "call" else underlying_price < strike
    return OptionLeg(
        ticker=details.get("ticker", ""),
        type=typ,
        strike=strike,
        expiration=details.get("expiration_date", ""),
        bid=quote.get("bid"),
        ask=quote.get("ask"),
        midpoint=quote.get("midpoint"),
        last_price=trade.get("price") or day.get("close"),
        volume=day.get("volume"),
        open_interest=item.get("open_interest"),
        implied_volatility=item.get("implied_volatility"),
        delta=greeks.get("delta"),
        gamma=greeks.get("gamma"),
        theta=greeks.get("theta"),
        vega=greeks.get("vega"),
        break_even_price=item.get("break_even_price"),
        day_change=day.get("change"),
        day_change_percent=day.get("change_percent"),
        in_the_money=itm,
        raw=item,
    )


@router.get("/{ticker}/expirations", response_model=ExpirationsResponse)
async def expirations(ticker: str):
    symbol = ticker.upper()
    client = MassiveClient()
    key = f"expirations:{symbol}"
    data = await cache.get_or_set(key, 300, lambda: client.option_contracts(symbol, expiration_gte=date.today().isoformat()))
    exps = sorted({item.get("expiration_date") for item in data.get("results", []) if item.get("expiration_date")})
    return ExpirationsResponse(expirations=exps)


@router.get("/{ticker}/chain", response_model=OptionChainResponse)
async def option_chain(ticker: str, expiration: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$")):
    symbol = ticker.upper()
    client = MassiveClient()
    data = await cache.get_or_set(f"chain:{symbol}:{expiration}", 120, lambda: client.option_chain(symbol, expiration))
    legs = [parse_option(item) for item in data.get("results", [])]
    calls = sorted([l for l in legs if l.type == "call"], key=lambda l: l.strike)
    puts = sorted([l for l in legs if l.type == "put"], key=lambda l: l.strike)
    underlying_price = None
    for item in data.get("results", []):
        underlying_price = (item.get("underlying_asset") or {}).get("price")
        if underlying_price is not None:
            break
    strikes = sorted({l.strike for l in legs})
    grouped: dict[str, dict[str, OptionLeg | None]] = {str(s): {"call": None, "put": None} for s in strikes}
    for leg in legs:
        grouped[str(leg.strike)][leg.type] = leg
    return OptionChainResponse(calls=calls, puts=puts, underlying_price=underlying_price, strikes=strikes, grouped_by_strike=grouped)


@router.get("/unusual", response_model=list[UnusualActivity])
async def unusual_activity(
    type: Literal["all", "call", "put"] = "all",
    min_vol_oi: float = Query(1.0, ge=0),
):
    client = MassiveClient()

    async def scan(symbol: str) -> list[UnusualActivity]:
        try:
            data = await cache.get_or_set(f"unusual_chain:{symbol}", 120, lambda: client.option_chain(symbol, limit=250))
        except Exception:
            return []
        out: list[UnusualActivity] = []
        for item in data.get("results", []):
            leg = parse_option(item)
            if type != "all" and leg.type != type:
                continue
            vol = leg.volume or 0
            oi = leg.open_interest or 0
            if oi <= 0:
                continue
            ratio = vol / oi
            if ratio < min_vol_oi:
                continue
            price = leg.midpoint or leg.last_price
            premium = round(price * vol * 100, 2) if price is not None else None
            out.append(UnusualActivity(
                ticker=symbol,
                contract_ticker=leg.ticker,
                type=leg.type,
                strike=leg.strike,
                expiration=leg.expiration,
                volume=vol,
                oi=oi,
                vol_oi=round(ratio, 4),
                premium=premium,
                implied_volatility=leg.implied_volatility,
                underlying_price=(item.get("underlying_asset") or {}).get("price"),
            ))
        return out

    chunks = await asyncio.gather(*(scan(t) for t in POPULAR_TICKERS))
    rows = [row for chunk in chunks for row in chunk]
    rows.sort(key=lambda r: (r.vol_oi, r.premium or 0), reverse=True)
    return rows[:100]
