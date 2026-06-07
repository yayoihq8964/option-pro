from __future__ import annotations

from pathlib import Path

# Import yahoo.py first — it monkey-patches yf.Ticker to use curl_cffi session
# so all downstream yfinance usage dodges Yahoo's rate limiter.
from app.services import yahoo  # noqa: F401

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
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

# CORS — same-origin only by default. Override with ALLOWED_ORIGINS env if you
# need external access (e.g. "https://option.example.com,https://app.example.com").
import os as _os
_allowed = _os.environ.get("ALLOWED_ORIGINS", "").strip()
_origins = [o.strip() for o in _allowed.split(",") if o.strip()] if _allowed else []
if not _origins:
    # Permissive in dev — allow_credentials must be False with wildcard
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Authorization"],
    )


# Simple per-IP rate limiter for expensive endpoints (AI, scan, watchlist).
# Lightweight token-bucket-ish counter — good enough to discourage scraping.
import time as _time
from collections import defaultdict as _dd
from fastapi import Request as _Req
from fastapi.responses import JSONResponse as _JSON
_rl_buckets: dict[str, list[float]] = _dd(list)
_RL_HEAVY_LIMIT = 30   # max requests / window for heavy endpoints
_RL_LIGHT_LIMIT = 200  # max requests / window for cheap endpoints
_RL_WINDOW = 60        # seconds

class _RateLimit(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)
        ip = request.headers.get("cf-connecting-ip") or \
             (request.headers.get("x-forwarded-for", "").split(",")[0].strip()) or \
             (request.client.host if request.client else "unknown")
        is_heavy = (
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
