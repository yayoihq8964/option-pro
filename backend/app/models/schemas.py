from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field


class TickerSearchResult(BaseModel):
    ticker: str
    name: Optional[str] = None
    market: Optional[str] = None
    type: Optional[str] = None


class StockOverview(BaseModel):
    ticker: str
    name: Optional[str] = None
    price: Optional[float] = None
    change: Optional[float] = None
    change_percent: Optional[float] = None
    volume: Optional[float] = None
    market_cap: Optional[float] = None
    prev_close: Optional[float] = None
    description: Optional[str] = None
    sic_code: Optional[str] = None


class Bar(BaseModel):
    t: int
    o: float
    h: float
    l: float
    c: float
    v: float


class BarsResponse(BaseModel):
    bars: List[Bar]


class ExpirationsResponse(BaseModel):
    expirations: List[str]


class OptionLeg(BaseModel):
    ticker: str
    type: Literal["call", "put"]
    strike: float
    expiration: str
    bid: Optional[float] = None
    ask: Optional[float] = None
    midpoint: Optional[float] = None
    last_price: Optional[float] = None
    volume: Optional[int] = None
    open_interest: Optional[int] = None
    implied_volatility: Optional[float] = None
    delta: Optional[float] = None
    gamma: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None
    break_even_price: Optional[float] = None
    day_change: Optional[float] = None
    day_change_percent: Optional[float] = None
    in_the_money: Optional[bool] = None
    raw: Optional[Dict[str, Any]] = Field(default=None, exclude=True)


class OptionChainResponse(BaseModel):
    calls: List[OptionLeg]
    puts: List[OptionLeg]
    underlying_price: Optional[float] = None
    strikes: List[float]
    grouped_by_strike: Dict[str, Dict[str, Optional[OptionLeg]]]


class UnusualActivity(BaseModel):
    ticker: str
    contract_ticker: str
    type: Literal["call", "put"]
    strike: float
    expiration: str
    volume: int
    oi: int
    vol_oi: float
    premium: Optional[float] = None
    implied_volatility: Optional[float] = None
    underlying_price: Optional[float] = None


class Sector(BaseModel):
    id: str
    name: str
    tickers: List[str]


class SectorIVRank(BaseModel):
    ticker: str
    name: Optional[str] = None
    price: Optional[float] = None
    iv_rank: int
    iv_pct: Optional[float] = None
    iv_change_30d: Optional[float] = None


class SectorHeatmapItem(BaseModel):
    ticker: str
    iv_percentile: Optional[float] = None


class MarketStatus(BaseModel):
    market: str
    server_time: Optional[str] = None
    exchanges: Optional[Dict[str, Any]] = None
    currencies: Optional[Dict[str, Any]] = None
    raw: Optional[Dict[str, Any]] = Field(default=None, exclude=True)
