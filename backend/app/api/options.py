from __future__ import annotations

import asyncio
from typing import Literal

import yfinance as yf
from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import ExpirationsResponse, OptionChainResponse
from app.services import yahoo

router = APIRouter(prefix="/api/options", tags=["options"])
POPULAR_TICKERS = ["NVDA", "TSLA", "AAPL", "AMD", "AMZN", "META", "MSFT", "SPY", "QQQ", "GOOGL"]


@router.get("/unusual")
async def unusual_activity(
    type: Literal["all", "call", "put"] = "all",
    min_vol_oi: float = Query(1.0, ge=0),
):
    def scan() -> dict:
        results = []
        for symbol in POPULAR_TICKERS:
            try:
                t = yf.Ticker(symbol)
                exps = t.options[:2]
                try:
                    price = yahoo._safe_float(t.fast_info.last_price)
                except Exception:
                    price = None
                for exp in exps:
                    chain = t.option_chain(exp)
                    for side, df in [("call", chain.calls), ("put", chain.puts)]:
                        if type != "all" and type != side:
                            continue
                        for _, row in df.iterrows():
                            vol = yahoo._safe_int(row.get("volume")) or 0
                            oi = yahoo._safe_int(row.get("openInterest")) or 0
                            if oi <= 0 or vol <= 0:
                                continue
                            ratio = vol / oi
                            if ratio < min_vol_oi:
                                continue
                            lp = yahoo._safe_float(row.get("lastPrice")) or 0
                            results.append(
                                {
                                    "ticker": symbol,
                                    "contract_ticker": row.get("contractSymbol", ""),
                                    "contract_type": side,
                                    "type": side,
                                    "strike": float(row["strike"]),
                                    "expiration": exp,
                                    "volume": vol,
                                    "open_interest": oi,
                                    "oi": oi,
                                    "vol_oi_ratio": round(ratio, 2),
                                    "vol_oi": round(ratio, 2),
                                    "premium": round(lp * vol * 100, 2) if lp else None,
                                    "last_price": lp,
                                    "implied_volatility": yahoo._safe_float(row.get("impliedVolatility")),
                                    "underlying_price": price,
                                    "in_the_money": bool(row.get("inTheMoney", False)),
                                }
                            )
            except Exception:
                continue
        results.sort(key=lambda r: (r["vol_oi_ratio"], r.get("premium") or 0), reverse=True)
        return {"results": results[:50], "data_limited": False}

    return await asyncio.to_thread(scan)


@router.get("/{ticker}/expirations", response_model=ExpirationsResponse)
async def expirations(ticker: str):
    try:
        exps = await asyncio.to_thread(yahoo.get_expirations, ticker)
        return {"ticker": ticker.upper(), "expirations": exps}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{ticker}/chain", response_model=OptionChainResponse)
async def option_chain(ticker: str, expiration: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$")):
    try:
        return await asyncio.to_thread(yahoo.get_option_chain, ticker, expiration)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
