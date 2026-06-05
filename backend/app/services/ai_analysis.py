"""OpenAI Response API client for AI-powered analysis (GPT-5.4-mini + web search)."""
from __future__ import annotations
import json, os, math
from datetime import datetime, timedelta
from openai import OpenAI

_cache: dict[str, tuple[datetime, dict]] = {}


def _get_client() -> OpenAI:
    key = os.environ.get("OPENAI_API_KEY", "")
    base = os.environ.get("OPENAI_BASE_URL", "")
    if not key:
        raise RuntimeError("OPENAI_API_KEY not set")
    kwargs = {"api_key": key}
    if base:
        kwargs["base_url"] = base
    return OpenAI(**kwargs)


def _ask(prompt: str, use_web_search: bool = False) -> str:
    client = _get_client()
    tools = [{"type": "web_search_preview"}] if use_web_search else []
    reasoning = os.environ.get("OPENAI_REASONING", "xhigh")
    response = client.responses.create(
        model=os.environ.get("OPENAI_MODEL", "gpt-5.4-mini-2026-03-17"),
        input=prompt,
        tools=tools,
        reasoning={"effort": reasoning},
    )
    for item in response.output:
        if item.type == "message":
            for block in item.content:
                if block.type == "output_text":
                    return block.text
    return ""


def _parse_json(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    return json.loads(text)


def _sanitize_ai(obj):
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    if isinstance(obj, dict):
        return {k: _sanitize_ai(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_ai(v) for v in obj]
    return obj


def analyze_option_alerts(ticker: str, alerts: list[dict], underlying_price: float, expiration: str) -> dict:
    cache_key = f"alerts:{ticker}:{expiration}"
    cached = _cache.get(cache_key)
    if cached and cached[0] > datetime.utcnow():
        return {**cached[1], "_cached": True}

    if not alerts:
        return {"analysis": "暂无异动数据可供分析", "confidence": None}

    alerts_text = "\n".join([
        f"- {a['type'].upper()} strike={a['strike']}: vol={a['volume']}, OI={a.get('open_interest',0)}, "
        f"premium=${a.get('premium_flow',0):,.0f}, IV={a.get('implied_volatility','N/A')}, "
        f"原因: {', '.join(a.get('reasons',[]))}"
        for a in alerts[:8]
    ])

    prompt = f"""你是一位专业的期权分析师。分析以下 {ticker} (当前价格 ${underlying_price:.2f}) 到期日 {expiration} 的期权异动数据，并使用联网搜索获取该公司最新新闻和市场动态来辅助判断。

异动数据:
{alerts_text}

请用中文回复，严格使用以下JSON格式:
{{"confidence":"high或medium或low","direction":"bullish或bearish或mixed","summary":"一句话总结50字以内","analysis":"详细分析100到150字","key_strikes":["最值得关注的1到3个行权价"],"risk_note":"风险提示30字以内"}}

仅返回JSON。"""

    try:
        raw = _ask(prompt, use_web_search=True)
        result = _parse_json(raw)
        _cache[cache_key] = (datetime.utcnow() + timedelta(hours=1), result)
        return _sanitize_ai(result)
    except Exception as e:
        return {"analysis": f"AI分析暂时不可用", "confidence": None, "error": str(e)[:120]}


SIGNALS_SYSTEM_PROMPT = """你是一个美股个股与大盘顶部/底部信号分析器。

你只能基于用户提供的结构化数据判断，不得编造未提供的行情、新闻、财报、期权数据。

你的任务：
1. 判断未来 5-20 个交易日的顶部风险。
2. 判断未来 5-20 个交易日的底部机会。
3. 判断回调买点质量（dip_buy_quality）。
4. 判断当前是否更像趋势延续、健康轮动、高位震荡、趋势内回踩、阶段性顶部、回调买点、恐慌底、破位下跌或数据不足。
5. 给出置信度，但置信度代表证据一致性，不代表真实概率。

硬性规则：
1. 不得把 Call 简单当成看多，也不得把 Put 简单当成看空。
2. 如果没有成交价相对 bid/ask 的信息，期权方向置信度不得高于 60。
3. 如果没有到期日和 DTE，期权流只能作为弱证据。
4. 如果只有成交量和 OI，不能确认是新仓，只能说“可能新仓，待次日 OI 确认”。
5. 如果技术指标存在周期冲突，必须降低 data_quality，并在 data_quality_notes 中说明。
6. 单一指标极端不能给出高置信度。
7. 顶部信号必须同时考虑价格、成交量、相对强弱、期权、波动率、市场环境。
8. 底部信号必须同时考虑超跌、恐慌释放、价格收复、广度修复、波动率回落。
9. 临近财报、CPI、FOMC、非农、OpEx 等事件，必须加入 event_risks，并降低置信度。
10. 输出必须是严格 JSON，不得包含确定性交易指令。

输出字段：
{
  "asset": "",
  "horizon": "5-20 trading days",
  "dominant_regime": "",
  "trend_bias_confidence": 0,
  "top_risk_confidence": 0,
  "bottom_opportunity_confidence": 0,
  "dip_buy_quality": 0,
  "breakdown_risk": 0,
  "data_quality": 0,
  "final_bias": "",
  "top_evidence": [],
  "bottom_evidence": [],
  "dip_buy_evidence": [],
  "bearish_evidence": [],
  "contradictions": [],
  "options_flow_read": {
    "net_direction": "",
    "confidence": 0,
    "bullish_flow_evidence": [],
    "bearish_flow_evidence": [],
    "unknown_or_neutral_flow": [],
    "warnings": []
  },
  "key_levels": {"support": [], "resistance": [], "vwap_levels": [], "options_levels": []},
  "confirmation_signals": [],
  "invalidation_signals": [],
  "event_risks": [],
  "data_quality_notes": [],
  "summary": ""
}

final_bias 只能从以下选项选择：
- bullish_continuation
- healthy_rotation
- trend_pullback
- range_consolidation
- tactical_top_risk
- dip_buy_setup
- capitulation_bottom_setup
- bearish_breakdown
- insufficient_data

评分纪律：
- 如果价格没有跌破关键支撑，top_risk_confidence 不得高于 70。
- 如果没有恐慌释放和价格收复，bottom_opportunity_confidence 不得高于 60。
- 如果期权缺少 DTE、bid/ask、成交方向，options_flow_read.confidence 不得高于 60。
- 如果数据周期冲突，data_quality 必须低于 75。
- 如果 raw_score 与最终 confidence 偏离超过 15 分，必须解释原因。
"""


def analyze_signals(ticker: str, signals: dict, scores: dict) -> dict:
    """LLM confidence analysis for precomputed top/bottom signals.

    The model only judges evidence consistency. Indicator computation is done in services.signals.
    Uses web search solely to identify upcoming event risks such as FOMC, CPI, NFP, earnings.
    """
    symbol = ticker.upper()
    cache_key = f"signals:{symbol}:{hash(json.dumps({'signals': signals, 'scores': scores}, sort_keys=True, default=str))}"
    cached = _cache.get(cache_key)
    if cached and cached[0] > datetime.utcnow():
        return {**cached[1], "_cached": True}

    data = {
        "as_of": datetime.utcnow().date().isoformat(),
        "asset": {"symbol": symbol, "type": "stock", "timeframe": "swing_5_20d"},
        "raw_scores": {
            "top_score": scores.get("top_score"),
            "bottom_score": scores.get("bottom_score"),
            "dip_buy_quality": scores.get("dip_buy_quality"),
            "data_quality_score": scores.get("data_quality"),
            "top_breakdown": scores.get("top_breakdown"),
            "bottom_breakdown": scores.get("bottom_breakdown"),
            "dip_buy_breakdown": scores.get("dip_buy_breakdown"),
            "top_reasons": scores.get("top_reasons"),
            "bottom_reasons": scores.get("bottom_reasons"),
        },
        "computed_signals": signals,
        "event_check_request": "Use web search only to check upcoming FOMC, CPI, NFP, option expiration, and company earnings for this asset. Do not add external market-price facts.",
    }
    prompt = f"""{SIGNALS_SYSTEM_PROMPT}

请基于以下结构化数据，评估该资产未来 5-20 个交易日的顶部风险和底部机会。
允许联网搜索即将发生的事件风险（FOMC、CPI、NFP、财报、期权到期），但不得用联网获得的行情价格替代结构化数据。
仅输出严格 JSON，不要输出 JSON 以外文字。

结构化数据如下：
{json.dumps(data, ensure_ascii=False, indent=2, default=str)}
"""
    try:
        raw = _ask(prompt, use_web_search=True)
        result = _parse_json(raw)
        result.setdefault("asset", symbol)
        result.setdefault("horizon", "5-20 trading days")
        result.setdefault("data_quality", scores.get("data_quality"))
        result.setdefault("dip_buy_quality", scores.get("dip_buy_quality"))
        result.setdefault("options_flow_read", {"net_direction": "unknown", "confidence": 0, "bullish_flow_evidence": [], "bearish_flow_evidence": [], "unknown_or_neutral_flow": [], "warnings": ["未提供期权流结构化数据"]})
        _cache[cache_key] = (datetime.utcnow() + timedelta(minutes=30), result)
        return _sanitize_ai(result)
    except Exception as e:
        return {
            "asset": symbol,
            "horizon": "5-20 trading days",
            "dominant_regime": "insufficient_data",
            "top_risk_confidence": scores.get("top_score"),
            "bottom_opportunity_confidence": scores.get("bottom_score"),
            "trend_bias_confidence": None,
            "dip_buy_quality": scores.get("dip_buy_quality"),
            "data_quality": scores.get("data_quality"),
            "final_bias": "insufficient_data",
            "top_evidence": [],
            "bottom_evidence": [],
            "dip_buy_evidence": [],
            "bearish_evidence": [],
            "contradictions": [],
            "most_important_signal": "AI analysis unavailable",
            "options_flow_read": {"net_direction": "unknown", "confidence": 0, "bullish_flow_evidence": [], "bearish_flow_evidence": [], "unknown_or_neutral_flow": [], "warnings": ["AI分析暂时不可用"]},
            "key_levels": {"support": [], "resistance": [], "vwap_levels": [], "options_levels": []},
            "confirmation_signals": [],
            "invalidation_signals": [],
            "event_risks": [],
            "data_quality_notes": ["AI分析暂时不可用"],
            "summary": "AI分析暂时不可用，当前仅展示程序化信号分数。",
            "error": str(e)[:120],
        }


def analyze_earnings_correlation(earnings: list[dict]) -> dict:
    cache_key = "earnings_correlation"
    cached = _cache.get(cache_key)
    if cached and cached[0] > datetime.utcnow():
        return {**cached[1], "_cached": True}

    if not earnings:
        return {"summary": "暂无即将发布的财报数据", "correlations": []}

    earnings_text = "\n".join([
        f"- {e['ticker']} ({e.get('name','')}): 财报日期 {e.get('earnings_date','')}, "
        f"EPS预估 {e.get('eps_estimate','N/A')}, 行业: {e.get('sector','')}"
        for e in earnings[:10]
    ])

    prompt = f"""你是一位资深美股分析师。分析以下即将发布的财报，使用联网搜索获取最新市场信息，判断每家公司财报对关联公司的潜在影响。

即将发布的财报:
{earnings_text}

请用中文回复，严格使用以下JSON格式:
{{"summary":"整体财报季展望100字以内","correlations":[{{"source_ticker":"代码","source_name":"公司名","earnings_date":"日期","impact":[{{"ticker":"受影响公司","name":"公司名","direction":"bullish或bearish","reason":"30字以内理由"}}]}}],"market_theme":"当前市场热点50字以内"}}

仅返回JSON。"""

    try:
        raw = _ask(prompt, use_web_search=True)
        result = _parse_json(raw)
        _cache[cache_key] = (datetime.utcnow() + timedelta(hours=24), result)
        return _sanitize_ai(result)
    except Exception as e:
        return {"summary": f"AI分析暂时不可用", "correlations": [], "error": str(e)[:120]}
