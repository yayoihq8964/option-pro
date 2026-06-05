from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import ai, earnings, market, options, sectors, signals, stocks

app = FastAPI(
    title="Optix Pro Options Visualization API",
    description="FastAPI backend wrapping Massive.com stock and options market data.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
