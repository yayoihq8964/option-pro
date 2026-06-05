from __future__ import annotations

from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, Query

from app.models.schemas import ExpirationsResponse, OptionChainResponse, OptionLeg, UnusualActivityLimitedResponse
from app.services.cache import cache
from app.services.massive import MassiveClient

router = APIRouter(prefix="/api/options", tags=["options"])
POPULAR_TICKERS = ["NVDA", "AAPL", "TSLA", "AMD", "MSFT", "AMZN", "META", "GOOGL", "SPY", "QQQ"]


def parse_option(item: dict[str, Any], underlying_price: float | None = None) -> OptionLeg:
    details = item.get("details") or item
    quote = item.get("last_quote") or {}
    trade = item.get("last_trade") or {}
    greeks = item.get("greeks") or {}
    day = item.get("day") or {}
    underlying_price = underlying_price if underlying_price is not None else (item.get("underlying_asset") or {}).get("price")
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
    data = await cache.get_or_set(
        key,
        300,
        lambda: client.option_contracts(symbol, limit=250, extra_params={"expiration_date.gte": date.today().isoformat()}),
    )
    exps = sorted({item.get("expiration_date") for item in data.get("results", []) if item.get("expiration_date")})
    return ExpirationsResponse(expirations=exps)


@router.get("/{ticker}/chain", response_model=OptionChainResponse)
async def option_chain(ticker: str, expiration: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$")):
    symbol = ticker.upper()
    client = MassiveClient()
    data = await cache.get_or_set(
        f"contracts:{symbol}:{expiration}",
        300,
        lambda: client.option_contracts(symbol, expiration_date=expiration, limit=250),
    )
    prev_data = await cache.get_or_set(f"aggs_prev:{symbol}", 60, lambda: client.aggs_prev(symbol))
    prev = (prev_data.get("results") or [{}])[0]
    underlying_price = prev.get("c")

    legs = [parse_option(item, underlying_price=underlying_price) for item in data.get("results", [])]
    calls = sorted([l for l in legs if l.type == "call"], key=lambda l: l.strike)
    puts = sorted([l for l in legs if l.type == "put"], key=lambda l: l.strike)
    strikes = sorted({l.strike for l in legs})
    grouped: dict[str, dict[str, OptionLeg | None]] = {str(s): {"call": None, "put": None} for s in strikes}
    for leg in legs:
        grouped[str(leg.strike)][leg.type] = leg
    return OptionChainResponse(
        calls=calls,
        puts=puts,
        underlying_price=underlying_price,
        strikes=strikes,
        grouped_by_strike=grouped,
        data_limited=True,
        upgrade_message="Live options quotes, IV, Greeks, volume, and open interest require the Options Starter plan. Upgrade at massive.com/pricing",
    )


@router.get("/unusual", response_model=UnusualActivityLimitedResponse)
async def unusual_activity(
    type: Literal["all", "call", "put"] = "all",
    min_vol_oi: float = Query(1.0, ge=0),
):
    return UnusualActivityLimitedResponse(
        results=[],
        data_limited=True,
        message="Unusual activity requires Options Starter plan. Upgrade at massive.com/pricing",
    )
