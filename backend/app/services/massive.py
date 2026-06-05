from __future__ import annotations

from datetime import date
from typing import Any
from urllib.parse import urlparse, parse_qsl

import httpx
from fastapi import HTTPException, status

from app.config import Settings, get_settings


class MassiveClient:
    """Async wrapper around Massive.com's REST API."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.base_url = str(self.settings.massive_base_url).rstrip("/")
        self.api_key = self.settings.massive_api_key
        self.timeout = self.settings.request_timeout

    def _require_key(self) -> None:
        if not self.api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="MASSIVE_API_KEY is not configured",
            )

    async def _request(self, path_or_url: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self._require_key()
        params = {k: v for k, v in (params or {}).items() if v is not None}
        params["apiKey"] = self.api_key
        url = path_or_url if path_or_url.startswith("http") else f"{self.base_url}{path_or_url}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.get(url, params=params)
            except httpx.TimeoutException as exc:
                raise HTTPException(status_code=504, detail="Massive API request timed out") from exc
            except httpx.HTTPError as exc:
                raise HTTPException(status_code=502, detail=f"Massive API connection error: {exc}") from exc

        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="Massive API rate limit exceeded")
        if response.status_code >= 400:
            try:
                detail = response.json()
            except ValueError:
                detail = response.text
            raise HTTPException(status_code=response.status_code, detail={"massive_error": detail})
        try:
            return response.json()
        except ValueError as exc:
            raise HTTPException(status_code=502, detail="Massive API returned invalid JSON") from exc

    async def _paginated(self, path: str, params: dict[str, Any] | None = None, max_pages: int = 20) -> dict[str, Any]:
        """Fetch result pages following next_url and combine `results`."""
        first = await self._request(path, params)
        combined = dict(first)
        results = list(first.get("results") or [])
        next_url = first.get("next_url")
        pages = 1

        while next_url and pages < max_pages:
            # next_url may already include apiKey from Massive; remove it so _request
            # can consistently inject the configured key.
            parsed = urlparse(next_url)
            query = dict(parse_qsl(parsed.query))
            query.pop("apiKey", None)
            page_url = next_url.split("?", 1)[0]
            page = await self._request(page_url, query)
            results.extend(page.get("results") or [])
            next_url = page.get("next_url")
            pages += 1

        combined["results"] = results
        combined["next_url"] = next_url
        combined["pages_fetched"] = pages
        return combined

    async def option_chain(self, underlying: str, expiration_date: str | None = None, limit: int = 250) -> dict[str, Any]:
        params = {"expiration_date": expiration_date, "limit": limit}
        return await self._paginated(f"/v3/snapshot/options/{underlying.upper()}", params)

    async def option_contracts(
        self,
        ticker: str,
        expiration_gte: str | None = None,
        expiration_date: str | None = None,
        limit: int = 250,
    ) -> dict[str, Any]:
        params = {
            "underlying_ticker": ticker.upper(),
            "limit": limit,
            "expiration_date.gte": expiration_gte,
            "expiration_date": expiration_date,
        }
        return await self._paginated("/v3/reference/options/contracts", params, max_pages=10)

    async def aggs(self, ticker: str, multiplier: int, timespan: str, from_: str, to: str, limit: int = 5000) -> dict[str, Any]:
        return await self._request(
            f"/v2/aggs/ticker/{ticker.upper()}/range/{multiplier}/{timespan}/{from_}/{to}",
            {"limit": limit},
        )

    async def ticker_search(self, q: str, limit: int = 10) -> dict[str, Any]:
        return await self._request("/v3/reference/tickers", {"search": q, "market": "stocks", "active": "true", "limit": limit})

    async def ticker_details(self, ticker: str) -> dict[str, Any]:
        return await self._request(f"/v3/reference/tickers/{ticker.upper()}")

    async def stock_snapshot(self, ticker: str) -> dict[str, Any]:
        return await self._request(f"/v2/snapshot/locale/us/markets/stocks/tickers/{ticker.upper()}")

    async def batch_stock_snapshots(self, tickers: list[str]) -> dict[str, Any]:
        symbols = ",".join(t.upper() for t in tickers)
        return await self._request("/v2/snapshot/locale/us/markets/stocks/tickers", {"tickers": symbols})

    async def market_status(self) -> dict[str, Any]:
        return await self._request("/v1/marketstatus/now")


def today_iso() -> str:
    return date.today().isoformat()
