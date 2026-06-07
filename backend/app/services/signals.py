from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

import pandas as pd
import yfinance as yf

_cache: dict[str, tuple[datetime, Any]] = {}

SECTOR_ETFS = ["XLK", "XLF", "XLV", "XLE", "XLI", "XLC", "XLY", "XLP", "XLU", "XLRE", "XLB"]


def _cached(key: str, ttl_seconds: int, loader: Callable[[], Any]) -> Any:
    now = datetime.now(timezone.utc)
    hit = _cache.get(key)
    if hit and hit[0] > now:
        value = hit[1]
        if isinstance(value, dict):
            return {**value, "_cached": True}
        return value
    value = loader()
    _cache[key] = (now + timedelta(seconds=ttl_seconds), value)
    return value


def clamp(value: float | int | None, lo: float = 0, hi: float = 100) -> float:
    if value is None:
        return 0
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return 0
        return max(lo, min(hi, f))
    except Exception:
        return 0


def _safe_float(value: Any, ndigits: int = 4) -> float | None:
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, ndigits)
    except Exception:
        return None


def _history(symbol: str, period: str = "1y") -> pd.DataFrame:
    try:
        df = yf.Ticker(symbol).history(period=period, auto_adjust=True)
        # Drop rows with NaN close (yfinance sometimes returns trailing NaN)
        if not df.empty and "Close" in df.columns:
            df = df.dropna(subset=["Close"])
        return df
    except Exception:
        return pd.DataFrame()


def _last(series: pd.Series, default: float | None = None) -> float | None:
    try:
        s = series.dropna()
        return _safe_float(s.iloc[-1]) if not s.empty else default
    except Exception:
        return default


def compute_rsi(close: pd.Series, period: int = 14) -> float | None:
    if close is None or len(close) < period + 1:
        return None
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False).mean()
    rs = gain / loss.replace(0, math.nan)
    rsi = 100 - (100 / (1 + rs))
    return _last(rsi, 50)


def compute_atr(hist: pd.DataFrame, period: int = 14) -> pd.Series:
    if hist.empty:
        return pd.Series(dtype=float)
    high, low, close = hist["High"], hist["Low"], hist["Close"]
    prev_close = close.shift(1)
    tr = pd.concat([(high - low).abs(), (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
    return tr.rolling(period).mean()


def compute_obv_divergence(close: pd.Series, volume: pd.Series, lookback: int = 20) -> float | None:
    """Return -100..100 style divergence: positive price vs weak OBV => top risk; negative price vs strong OBV => bottom setup."""
    if len(close) < lookback + 1 or len(volume) < lookback + 1:
        return None
    direction = close.diff().apply(lambda x: 1 if x > 0 else (-1 if x < 0 else 0))
    obv = (direction * volume).fillna(0).cumsum()
    price_ret = close.iloc[-1] / close.iloc[-lookback] - 1
    obv_ret = (obv.iloc[-1] - obv.iloc[-lookback]) / max(abs(obv.iloc[-lookback]), volume.iloc[-lookback], 1)
    divergence = (price_ret - obv_ret) * 100
    return _safe_float(divergence, 2)


def compute_macd_histogram(close: pd.Series) -> float | None:
    if len(close) < 35:
        return None
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    hist = macd - signal
    # normalized 3-day slope as pct of price
    slope = (hist.iloc[-1] - hist.iloc[-4]) / close.iloc[-1] * 100 if len(hist) >= 4 and close.iloc[-1] else hist.iloc[-1]
    return _safe_float(slope, 4)


def _percentile_rank(series: pd.Series, value: float | None) -> float | None:
    if value is None or series is None:
        return None
    clean = series.dropna()
    if clean.empty:
        return None
    return _safe_float((clean <= value).mean() * 100, 1)


def _is_above_sma(symbol: str, period: int = 50) -> bool:
    hist = _history(symbol, "6mo")
    if hist.empty or len(hist) < period:
        return False
    close = hist["Close"]
    sma = close.rolling(period).mean().iloc[-1]
    return bool(close.iloc[-1] > sma)


def _with_score(key: str, value: Any, label: str, scorer: Callable[[str, Any], tuple[int, int]]) -> dict:
    top, bottom = scorer(key, value)
    return {"value": _safe_float(value, 4) if isinstance(value, (int, float)) else value, "label": label, "top_score": top, "bottom_score": bottom}


def _score_market_signal(key: str, value: Any) -> tuple[int, int]:
    v = 0 if value is None else float(value)
    top = bottom = 0.0
    if key in ("sma20_distance", "sma50_distance", "sma200_distance"):
        mult = 8 if key == "sma20_distance" else (5 if key == "sma50_distance" else 2.5)
        top, bottom = clamp(v * mult), clamp(-v * mult)
    elif key == "rsi14":
        top, bottom = clamp((v - 50) * 3), clamp((50 - v) * 3)
    elif key == "return_20d":
        top, bottom = clamp(v * 4), clamp(-v * 4)
    elif key in ("rsp_spy_5d", "iwm_spy_5d"):
        top, bottom = clamp(-v * 15), clamp(v * 15)
    elif key == "qqq_spy_5d":
        top, bottom = clamp(v * 8), clamp(-v * 8)
    elif key == "sectors_above_50dma":
        top = clamp((45 - v) * 2) + clamp((v - 85) * 1.5)
        bottom = clamp((55 - v) * 1.5)
    elif key == "vix":
        top, bottom = clamp((15 - v) * 5), clamp((v - 20) * 4)
    elif key == "vix_percentile":
        top, bottom = clamp((100 - v) * 0.8), clamp(v * 0.8)
    elif key == "vix_5d_change":
        top = clamp(v * 3) if v > 0 else 0
        bottom = clamp(-v * 3) if v < 0 else 0
    elif key == "credit_risk":
        top, bottom = clamp(-v * 8), clamp(v * 5)  # HYG/TLT falling is risk; rising is stable/risk-on
    elif key in ("yield_10y", "yield_10y_20d_change"):
        top, bottom = (clamp((v - 4) * 25), clamp((4 - v) * 10)) if key == "yield_10y" else (clamp(v * 80), clamp(-v * 80))
    return round(clamp(top)), round(clamp(bottom))


def _score_stock_signal(key: str, value: Any) -> tuple[int, int]:
    if value is None:
        return 0, 0
    v = float(value)
    top = bottom = 0.0
    if key in ("sma20_dist", "sma50_dist", "sma200_dist"):
        mult = {"sma20_dist": 8, "sma50_dist": 5, "sma200_dist": 2.5}[key]
        top, bottom = clamp(v * mult), clamp(-v * mult)
    elif key == "rsi14":
        top, bottom = clamp((v - 50) * 3), clamp((50 - v) * 3)
    elif key == "return_20d":
        top, bottom = clamp(v * 3.5), clamp(-v * 3.5)
    elif key == "atr_percentile":
        top, bottom = clamp((v - 60) * 1.2), clamp((v - 70) * 1.0)
    elif key == "volume_zscore":
        top, bottom = clamp(v * 20), clamp(v * 10)
    elif key == "obv_divergence":
        top, bottom = clamp(v * 3), clamp(-v * 3)
    elif key == "relative_strength_spy":
        top, bottom = clamp(v * 6), clamp(-v * 6)
    elif key == "iv_rank":
        top, bottom = clamp((v - 50) * 1.2), clamp((v - 70) * 0.8)
    elif key == "close_position":
        top, bottom = clamp((35 - v) * 2), clamp((v - 65) * 1.2)
    elif key == "macd_hist":
        top, bottom = clamp(-v * 150), clamp(v * 150)
    return round(clamp(top)), round(clamp(bottom))


def compute_market_signals() -> dict:
    def load() -> dict:
        spy = _history("SPY"); qqq = _history("QQQ"); iwm = _history("IWM"); rsp = _history("RSP")
        vix = _history("^VIX"); hyg = _history("HYG"); tlt = _history("TLT"); tnx = _history("^TNX")
        if spy.empty or len(spy) < 60:
            raise RuntimeError("Insufficient SPY data")
        close = spy["Close"]
        signals: dict[str, dict] = {}
        add = lambda k, val, lab: signals.__setitem__(k, _with_score(k, val, lab, _score_market_signal))
        add("sma20_distance", (close.iloc[-1] / close.rolling(20).mean().iloc[-1] - 1) * 100, "SPY距20日线偏离%")
        add("sma50_distance", (close.iloc[-1] / close.rolling(50).mean().iloc[-1] - 1) * 100, "SPY距50日线偏离%")
        add("sma200_distance", (close.iloc[-1] / close.rolling(200).mean().iloc[-1] - 1) * 100 if len(close) >= 200 else None, "SPY距200日线偏离%")
        add("rsi14", compute_rsi(close, 14), "SPY RSI(14)")
        add("return_20d", (close.iloc[-1] / close.iloc[-20] - 1) * 100, "SPY 20日涨幅%")
        if not rsp.empty and len(rsp) >= 5: add("rsp_spy_5d", ((rsp["Close"].iloc[-1] / rsp["Close"].iloc[-5]) / (close.iloc[-1] / close.iloc[-5]) - 1) * 100, "等权重/SPY 5日相对强弱%")
        if not iwm.empty and len(iwm) >= 5: add("iwm_spy_5d", ((iwm["Close"].iloc[-1] / iwm["Close"].iloc[-5]) / (close.iloc[-1] / close.iloc[-5]) - 1) * 100, "小盘/SPY 5日相对强弱%")
        if not qqq.empty and len(qqq) >= 5: add("qqq_spy_5d", ((qqq["Close"].iloc[-1] / qqq["Close"].iloc[-5]) / (close.iloc[-1] / close.iloc[-5]) - 1) * 100, "QQQ/SPY 5日相对强弱%")
        add("sectors_above_50dma", sum(1 for s in SECTOR_ETFS if _is_above_sma(s, 50)) / len(SECTOR_ETFS) * 100, "板块ETF在50日线上方%")
        if not vix.empty and len(vix) >= 5:
            v = vix["Close"].iloc[-1]
            add("vix", v, "VIX")
            add("vix_percentile", _percentile_rank(vix["Close"], v), "VIX 1年分位%")
            add("vix_5d_change", (v / vix["Close"].iloc[-5] - 1) * 100, "VIX 5日变化%")
        if not hyg.empty and not tlt.empty and len(hyg) >= 20 and len(tlt) >= 20:
            add("credit_risk", ((hyg["Close"].iloc[-1] / tlt["Close"].iloc[-1]) / (hyg["Close"].iloc[-20] / tlt["Close"].iloc[-20]) - 1) * 100, "信用风险(HYG/TLT) 20日变化%")
        if not tnx.empty and len(tnx) >= 20:
            y = tnx["Close"].iloc[-1]
            add("yield_10y", y, "10年期收益率%")
            add("yield_10y_20d_change", y - tnx["Close"].iloc[-20], "10Y收益率20日变化")
        return signals
    return _cached("market_signals", 300, load)


def compute_stock_signals(ticker: str) -> dict:
    symbol = ticker.upper().strip()
    def load() -> dict:
        import math
        hist = _history(symbol); spy = _history("SPY")
        if hist.empty or len(hist) < 20:
            raise RuntimeError(f"Insufficient price data for {symbol}")
        close, volume = hist["Close"], hist["Volume"]
        signals: dict[str, dict] = {}
        add = lambda k, val, lab: signals.__setitem__(k, _with_score(k, val, lab, _score_stock_signal))

        def safe(val):
            """Convert NaN/Inf to None."""
            if val is None: return None
            try:
                f = float(val)
                return round(f, 4) if math.isfinite(f) else None
            except (TypeError, ValueError):
                return None

        # SMA distances
        for period, key in [(20, "sma20_dist"), (50, "sma50_dist"), (200, "sma200_dist")]:
            sma = close.rolling(period).mean().iloc[-1] if len(close) >= period else None
            val = safe((close.iloc[-1] / sma - 1) * 100) if sma and safe(sma) else None
            add(key, val, f"距{period}日线偏离%")

        add("rsi14", safe(compute_rsi(close, 14)), "RSI(14)")

        ret20 = safe((close.iloc[-1] / close.iloc[-20] - 1) * 100) if len(close) >= 20 else None
        add("return_20d", ret20, "20日涨幅%")

        atr = compute_atr(hist, 14)
        add("atr_percentile", safe(_percentile_rank(atr, _last(atr))), "ATR 1年分位%")

        vol_mean = safe(volume.rolling(20).mean().iloc[-1]) if len(volume) >= 20 else None
        vol_std = safe(volume.rolling(20).std().iloc[-1]) if len(volume) >= 20 else None
        vol_cur = safe(volume.iloc[-1])
        vol_z = safe((vol_cur - vol_mean) / vol_std) if vol_mean and vol_std and vol_std > 0 else 0
        add("volume_zscore", vol_z, "成交量Z分数")

        signals["_volume_today"] = {"value": int(vol_cur) if vol_cur else 0, "label": "今日成交量"}
        signals["_volume_avg20"] = {"value": int(vol_mean) if vol_mean else 0, "label": "20日平均成交量"}
        signals["_volume_ratio"] = {"value": safe(vol_cur / vol_mean) if vol_mean and vol_mean > 0 else 1.0, "label": "成交量/均量比"}

        add("obv_divergence", safe(compute_obv_divergence(close, volume)), "OBV背离")

        if not spy.empty and len(spy) >= 20 and len(close) >= 20:
            stock_ret = safe((close.iloc[-1] / close.iloc[-20] - 1))
            spy_ret = safe((spy["Close"].iloc[-1] / spy["Close"].iloc[-20] - 1))
            rs = safe((stock_ret - spy_ret) * 100) if stock_ret is not None and spy_ret is not None else None
            add("relative_strength_spy", rs, "相对强弱(vs SPY)%")
        else:
            add("relative_strength_spy", None, "相对强弱(vs SPY)%")

        try:
            from app.services.yahoo import get_stock_iv
            iv = get_stock_iv(symbol)
        except Exception:
            iv = None
        add("iv_rank", round(iv * 100, 1) if iv else None, "IV Rank/ATM IV%")

        day_range = safe(hist["High"].iloc[-1] - hist["Low"].iloc[-1])
        close_pos = safe((close.iloc[-1] - hist["Low"].iloc[-1]) / day_range * 100) if day_range and day_range > 0 else 50
        add("close_position", close_pos, "收盘位于当日区间%")

        add("macd_hist", safe(compute_macd_histogram(close)), "MACD柱状图方向")
        return signals
    return _cached(f"stock_signals:{symbol}", 300, load)
