from __future__ import annotations

import hmac
import os as _os
import time as _time
from collections import defaultdict as _dd
from pathlib import Path

# Import yahoo.py first — it monkey-patches yf.Ticker to use curl_cffi session
# so all downstream yfinance usage dodges Yahoo's rate limiter.
from app.services import yahoo  # noqa: F401

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse as _JSON
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    """Prevent browser + CDN caching of JS/CSS/HTML files."""
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        path = request.url.path
        if path.startswith("/static/") or path == "/" or path.endswith(".html"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["CDN-Cache-Control"] = "no-store"          # Cloudflare CDN
            response.headers["Cloudflare-CDN-Cache-Control"] = "no-store"  # CF explicit
        return response

from app.api import ai, earnings, market, options, sectors, signals, stocks

app = FastAPI(
    title="Optix Pro Options Visualization API",
    description="FastAPI backend wrapping Massive.com stock and options market data.",
    version="0.1.0",
)

app.add_middleware(NoCacheStaticMiddleware)

# CORS: same-origin by default. Override with ALLOWED_ORIGINS only when the
# frontend is hosted on a different trusted origin.
_allowed = _os.environ.get("ALLOWED_ORIGINS", "").strip()
_origins = [o.strip() for o in _allowed.split(",") if o.strip()] if _allowed else []
if _origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Authorization", "X-App-Token"],
    )


_TRUST_PROXY_HEADERS = _os.environ.get("TRUST_PROXY_HEADERS", "").strip().lower() in {"1", "true", "yes"}
_APP_AUTH_TOKEN = _os.environ.get("APP_AUTH_TOKEN", "").strip()


def _client_ip(request: Request) -> str:
    """Return the real client IP unless proxy headers are explicitly trusted."""
    if _TRUST_PROXY_HEADERS:
        return (
            request.headers.get("cf-connecting-ip")
            or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or (request.client.host if request.client else "unknown")
        )
    return request.client.host if request.client else "unknown"


def _extract_token(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.headers.get("x-app-token", "").strip()


class _OptionalApiAuth(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        if _APP_AUTH_TOKEN and request.url.path.startswith("/api/"):
            token = _extract_token(request)
            if not token or not hmac.compare_digest(token, _APP_AUTH_TOKEN):
                return _JSON(
                    status_code=401,
                    content={"error": "unauthorized", "message": "Missing or invalid API token"},
                )
        return await call_next(request)


app.add_middleware(_OptionalApiAuth)


# Simple per-IP rate limiter for expensive endpoints (AI, scan, watchlist).
# Lightweight token-bucket-ish counter — good enough to discourage scraping.
_rl_buckets: dict[str, list[float]] = _dd(list)
_RL_HEAVY_LIMIT = 30   # max requests / window for heavy endpoints
_RL_LIGHT_LIMIT = 200  # max requests / window for cheap endpoints
_RL_WINDOW = 60        # seconds


class _RateLimit(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        if request.method == "OPTIONS" or not path.startswith("/api/"):
            return await call_next(request)
        ip = _client_ip(request)
        is_heavy = (
            path.startswith("/api/ai/") or
            "/ai-analysis" in path or
            "/analyze-" in path or
            path.endswith("/unusual") or
            path.endswith("/watchlist")
        )
        limit = _RL_HEAVY_LIMIT if is_heavy else _RL_LIGHT_LIMIT
        key = f"{ip}:{'h' if is_heavy else 'l'}"
        now = _time.time()
        bucket = _rl_buckets[key]
        # drop expired
        cutoff = now - _RL_WINDOW
        while bucket and bucket[0] < cutoff:
            bucket.pop(0)
        if len(bucket) >= limit:
            return _JSON(
                status_code=429,
                content={"error": "rate_limited", "message": f"Too many requests; try again in {_RL_WINDOW}s"},
                headers={"Retry-After": str(_RL_WINDOW)},
            )
        bucket.append(now)
        return await call_next(request)

app.add_middleware(_RateLimit)

app.include_router(stocks.router)
app.include_router(options.router)
app.include_router(earnings.router)
app.include_router(sectors.router)
app.include_router(market.router)
app.include_router(signals.router)
app.include_router(ai.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


# Docker-compose runs from /app/backend; local runs may be from repo root.
# Allow override via FRONTEND_DIR env var for unusual deployments.
_env_dir = _os.environ.get("FRONTEND_DIR")
if _env_dir:
    FRONTEND_DIR = Path(_env_dir).resolve()
else:
    # Try a few candidate paths
    _here = Path(__file__).resolve()
    _candidates = [
        _here.parents[2] / "frontend",  # /app/frontend (docker)
        _here.parents[3] / "frontend",  # /repo/frontend (local from backend/)
    ]
    FRONTEND_DIR = next((c for c in _candidates if c.exists()), _candidates[0])

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
else:
    import warnings
    warnings.warn(f"FRONTEND_DIR not found at {FRONTEND_DIR}; static serving disabled")
