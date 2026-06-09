from __future__ import annotations

import math
import time
from typing import Any

import httpx

from app.config import Settings, get_settings

_CACHE: dict[str, tuple[float, dict[str, Any] | None]] = {}
_TTL_SECONDS = 60 * 30


def marketdata_is_enabled(settings: Settings | None = None) -> bool:
    cfg = settings or get_settings()
    return bool(_token(cfg))


def _token(settings: Settings) -> str:
    return (settings.marketdata_token or settings.marketdata_api_token or "").strip()


def _safe_float(value: Any, ndigits: int = 4) -> float | None:
    try:
        number = float(value)
        if not math.isfinite(number):
            return None
        return round(number, ndigits)
    except Exception:
        return None


def _clamp(value: float | int | None, lo: float = 0.0, hi: float = 100.0, default: float = 50.0) -> float:
    if value is None:
        return default
    try:
        number = float(value)
    except Exception:
        return default
    if not math.isfinite(number):
        return default
    return max(lo, min(hi, number))


def _sum(values: list[Any]) -> float:
    total = 0.0
    for value in values:
        number = _safe_float(value, 4)
        if number is not None and number > 0:
            total += number
    return total


def _weighted_average(values: list[Any], weights: list[Any]) -> float | None:
    numerator = 0.0
    denominator = 0.0
    for value, weight in zip(values, weights):
        number = _safe_float(value, 6)
        w = _safe_float(weight, 4) or 0.0
        if number is None or number <= 0 or w <= 0:
            continue
        numerator += number * w
        denominator += w
    if denominator <= 0:
        return None
    return round(numerator / denominator, 4)


def _partition_by_side(payload: dict[str, Any], side: str, key: str) -> list[Any]:
    sides = payload.get("side") if isinstance(payload.get("side"), list) else []
    values = payload.get(key) if isinstance(payload.get(key), list) else []
    return [value for value, current_side in zip(values, sides) if str(current_side).lower() == side]


def _first_number(payload: dict[str, Any], key: str) -> float | None:
    values = payload.get(key)
    if isinstance(values, list):
        for value in values:
            number = _safe_float(value, 4)
            if number is not None:
                return number
    return _safe_float(values, 4)


def _request_chain(client: httpx.Client, base_url: str, symbol: str, settings: Settings) -> dict[str, Any] | None:
    token = _token(settings)
    mode = (settings.marketdata_option_mode or "").strip().lower()
    params: dict[str, Any] = {
        "dte": max(1, int(settings.marketdata_option_dte or 30)),
        "strikeLimit": max(2, int(settings.marketdata_option_strike_limit or 8)),
        "range": "all",
        "nonstandard": "false",
        "columns": "optionSymbol,underlying,expiration,side,strike,dte,bid,ask,mid,last,volume,openInterest,underlyingPrice,inTheMoney,updated,iv,delta",
    }
    if mode:
        params["mode"] = mode

    cache_key = f"marketdata:chain:{symbol}:{params['dte']}:{params['strikeLimit']}:{mode}"
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]

    response = client.get(
        f"{base_url}/v1/options/chain/{symbol}/",
        params=params,
        headers={"Authorization": f"Bearer {token}"},
    )
    if response.status_code == 204:
        _CACHE[cache_key] = (now + _TTL_SECONDS, None)
        return None
    if response.status_code not in {200, 203}:
        response.raise_for_status()

    data = response.json()
    if not isinstance(data, dict) or data.get("s") != "ok":
        _CACHE[cache_key] = (now + _TTL_SECONDS, None)
        return None

    _CACHE[cache_key] = (now + _TTL_SECONDS, data)
    return data


def _score_option_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    symbols = payload.get("optionSymbol") if isinstance(payload.get("optionSymbol"), list) else []
    if not symbols:
        return None

    volumes = payload.get("volume") if isinstance(payload.get("volume"), list) else []
    open_interest = payload.get("openInterest") if isinstance(payload.get("openInterest"), list) else []
    iv_values = payload.get("iv") if isinstance(payload.get("iv"), list) else []
    weights = volumes if _sum(volumes) > 0 else open_interest

    total_volume = _sum(volumes)
    total_oi = _sum(open_interest)
    call_volume = _sum(_partition_by_side(payload, "call", "volume"))
    put_volume = _sum(_partition_by_side(payload, "put", "volume"))
    call_oi = _sum(_partition_by_side(payload, "call", "openInterest"))
    put_oi = _sum(_partition_by_side(payload, "put", "openInterest"))
    avg_iv = _weighted_average(iv_values, weights)

    volume_score = _clamp(math.log10(total_volume + 1) * 20 if total_volume else 30)
    oi_score = _clamp(math.log10(total_oi + 1) * 13 if total_oi else 35)
    iv_score = _clamp((avg_iv or 0.35) * 100 * 1.15, 20, 95)
    imbalance = abs(math.log((call_volume + 1) / (put_volume + 1)))
    imbalance_score = _clamp(50 + imbalance * 12, 50, 85)
    option_heat_score = round(_clamp(volume_score * .34 + oi_score * .30 + iv_score * .24 + imbalance_score * .12), 1)

    put_call_volume = round(put_volume / call_volume, 2) if call_volume > 0 else (None if put_volume == 0 else 99.0)
    put_call_oi = round(put_oi / call_oi, 2) if call_oi > 0 else (None if put_oi == 0 else 99.0)
    iv_label = "高IV" if avg_iv is not None and avg_iv >= 0.65 else ("低IV" if avg_iv is not None and avg_iv <= 0.28 else "中性IV")
    updated = _first_number(payload, "updated")
    dte = _first_number(payload, "dte")

    return {
        "option_heat_score": option_heat_score,
        "iv_rank": None,
        "iv_average": avg_iv,
        "iv_label": iv_label,
        "source_status": "active",
        "provider": "MarketData.app",
        "contracts": len(symbols),
        "total_volume": int(total_volume),
        "total_open_interest": int(total_oi),
        "call_volume": int(call_volume),
        "put_volume": int(put_volume),
        "put_call_volume": put_call_volume,
        "put_call_open_interest": put_call_oi,
        "dte": int(dte) if dte is not None else None,
        "updated": int(updated) if updated is not None else None,
        "warning": None,
    }


def _empty_status(status: str = "not_configured", message: str | None = None) -> dict[str, Any]:
    return {
        "provider": "MarketData.app",
        "status": status,
        "configured": False,
        "enriched": 0,
        "message": message or "MARKETDATA_TOKEN 未配置，期权热度保持中性占位",
    }


def enrich_rows_with_marketdata_options(rows: list[dict[str, Any]], settings: Settings | None = None) -> dict[str, Any]:
    cfg = settings or get_settings()
    token = _token(cfg)
    if not token:
        return _empty_status()

    limit = max(0, min(int(cfg.marketdata_options_enrich_limit or 0), len(rows)))
    if limit <= 0:
        return _empty_status("disabled", "MARKETDATA_OPTIONS_ENRICH_LIMIT 为 0，已跳过期权增强")

    base_url = str(cfg.marketdata_base_url).rstrip("/")
    timeout = min(float(cfg.request_timeout or 20.0), 8.0)
    enriched = 0
    failed = 0

    try:
        with httpx.Client(timeout=timeout) as client:
            for row in rows[:limit]:
                symbol = str(row.get("ticker") or "").upper().strip()
                if not symbol:
                    continue
                try:
                    payload = _request_chain(client, base_url, symbol, cfg)
                    metrics = _score_option_payload(payload or {})
                    if not metrics:
                        failed += 1
                        continue

                    old_score = _safe_float(row.get("option_heat_score"), 1) or 50.0
                    new_score = _safe_float(metrics.get("option_heat_score"), 1) or old_score
                    option_weight = _safe_float(row.get("option_score_weight"), 4) or 0.06
                    row["option_heat_score"] = new_score
                    row["option_context"] = metrics
                    row["data_sources"]["options"] = "MarketData.app"
                    row.setdefault("breakdown", {})["option_heat"] = new_score
                    if "final_score" in row:
                        row["final_score"] = round(_clamp(float(row["final_score"]) + (new_score - old_score) * option_weight), 1)
                        row["strength_score"] = row["final_score"]
                    row["warnings"] = [w for w in (row.get("warnings") or []) if "期权热度" not in str(w)]
                    if new_score >= 68:
                        row["tags"] = list(dict.fromkeys([*(row.get("tags") or []), "期权活跃"]))[:6]
                    if metrics.get("total_volume", 0) <= 0 and metrics.get("total_open_interest", 0) <= 0:
                        row.setdefault("warnings", []).append("期权链流动性偏低")
                    enriched += 1
                except Exception:
                    failed += 1
    except Exception as exc:
        return {
            "provider": "MarketData.app",
            "status": "degraded",
            "configured": True,
            "enriched": enriched,
            "failed": max(failed, 1),
            "message": f"MarketData.app 请求失败，期权热度已降级：{exc.__class__.__name__}",
        }

    status = "active" if enriched else "degraded"
    return {
        "provider": "MarketData.app",
        "status": status,
        "configured": True,
        "enriched": enriched,
        "failed": failed,
        "mode": (cfg.marketdata_option_mode or "delayed").strip() or "default",
        "dte": int(cfg.marketdata_option_dte or 30),
        "strike_limit": int(cfg.marketdata_option_strike_limit or 8),
        "message": "MarketData.app 期权链增强已启用" if enriched else "MarketData.app 已配置，但本次未拿到可用期权链",
    }
