from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from app.api.stocks import _sanitize
from app.services import ai_analysis
from app.services.scoring import compute_market_scores, compute_stock_scores
from app.services.signals import compute_market_signals, compute_stock_signals

router = APIRouter(prefix="/api/signals", tags=["signals"])


def today_str() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/market")
async def market_signals():
    """Full market top/bottom analysis with market-level indicators."""
    try:
        signals = await asyncio.to_thread(compute_market_signals)
        cached = bool(isinstance(signals, dict) and signals.pop("_cached", False))
        scores = compute_market_scores(signals)
        return _sanitize({"signals": signals, "scores": scores, "as_of": today_str(), "_cached": cached})
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/stock/{ticker}")
async def stock_signals(ticker: str):
    """Full stock top/bottom analysis with stock-level indicators."""
    try:
        symbol = ticker.upper().strip()
        signals = await asyncio.to_thread(compute_stock_signals, symbol)
        cached = bool(isinstance(signals, dict) and signals.pop("_cached", False))
        scores = compute_stock_scores(signals)
        rsi = (signals.get("rsi14") or {}).get("value")
        macd = (signals.get("macd_hist") or {}).get("value")
        rs = (signals.get("relative_strength_spy") or {}).get("value")
        trend_bias_score = 50 + (float(rs or 0) * 2) + (float(macd or 0) * 100) + ((float(rsi or 50) - 50) * 0.4)
        trend_bias_score = round(max(0, min(100, trend_bias_score)))
        trend_bias_label = "偏多" if trend_bias_score >= 58 else ("偏空" if trend_bias_score <= 42 else "中性")
        return _sanitize({"ticker": symbol, "signals": signals, "scores": scores, "trend_bias_score": trend_bias_score, "trend_bias_label": trend_bias_label, "as_of": today_str(), "_cached": cached})
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/stock/{ticker}/ai-analysis")
async def stock_ai_analysis(ticker: str, request: Request):
    """LLM confidence analysis on computed signals. Triggered only by explicit user action."""
    try:
        import hashlib
        ip = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for", "").split(",")[0].strip() or request.client.host
        fp = hashlib.md5(ip.encode()).hexdigest()[:12]
        symbol = ticker.upper().strip()
        signals = await asyncio.to_thread(compute_stock_signals, symbol)
        if isinstance(signals, dict):
            signals.pop("_cached", None)
        scores = compute_stock_scores(signals)
        # 40s ceiling — fallback to programmatic-only response if AI hangs
        try:
            llm_result = await asyncio.wait_for(
                asyncio.to_thread(ai_analysis.analyze_signals, symbol, signals, scores, fp),
                timeout=40
            )
        except asyncio.TimeoutError:
            llm_result = {
                "asset": symbol,
                "dominant_regime": "ai_timeout",
                "summary": "AI 分析超时（>60秒），仅展示程序化分数",
                "top_risk_confidence": scores.get("top_score"),
                "bottom_opportunity_confidence": scores.get("bottom_score"),
                "dip_buy_quality": scores.get("dip_buy_quality"),
                "data_quality": scores.get("data_quality"),
                "final_bias": "insufficient_data",
                "error": "ai_timeout",
            }
        return _sanitize({**llm_result, "raw_signals": signals, "raw_scores": scores, "as_of": today_str()})
    except Exception as e:
        raise HTTPException(500, str(e))
