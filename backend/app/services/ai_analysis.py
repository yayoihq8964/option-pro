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
    response = client.responses.create(
        model=os.environ.get("OPENAI_MODEL", "gpt-5.4-mini-2026-03-17"),
        input=prompt,
        tools=tools,
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
