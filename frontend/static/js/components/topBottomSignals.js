import { api, safe } from '../api.js';

const fmt = (n, d = 1) => n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toFixed(d);
const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

// Score → color (low risk = emerald, high risk = crimson)
function scoreBarColor(score) {
  const s = Number(score || 0);
  if (s < 30) return 'var(--color-emerald)';
  if (s < 50) return '#d97706'; // amber
  if (s < 70) return '#ea580c'; // orange
  return 'var(--color-crimson)';
}

function gauge(title, score, label, reasons = null) {
  const s = Math.max(0, Math.min(100, Number(score || 0)));
  const color = scoreBarColor(s);
  const raising = reasons?.raising || [];
  const suppressing = reasons?.suppressing || [];
  return `<div class="panel" style="padding:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span class="label-caps">${esc(title)}</span>
      <span class="mono" style="font-size:22px;font-weight:800;letter-spacing:-.02em">${Math.round(s)}<span class="label-caps" style="color:var(--color-muted);margin-left:4px;font-size:10px">/100</span></span>
    </div>
    <div style="height:6px;border-radius:999px;background:var(--color-container);overflow:hidden;margin-bottom:10px">
      <div style="height:100%;width:${s}%;background:${color};border-radius:999px;transition:width .3s"></div>
    </div>
    <p style="margin:0 0 ${(raising.length || suppressing.length) ? '10px' : '0'};font-size:12px;font-weight:700;color:var(--color-muted)">${esc(label || '')}</p>
    ${(raising.length || suppressing.length) ? `<div style="display:grid;gap:6px;font-size:11px;line-height:1.5">
      ${raising.length ? `<p style="margin:0;color:var(--color-on-surface)"><b>抬高因素:</b> ${raising.map(esc).join('，')}</p>` : ''}
      ${suppressing.length ? `<p style="margin:0;color:var(--color-muted)"><b>压低因素:</b> ${suppressing.map(esc).join('，')}</p>` : ''}
    </div>` : ''}
  </div>`;
}

function interpret(k, sig) {
  const v = Number(sig?.value);
  if (k.includes('rsi')) return v >= 70 ? '过热' : v <= 30 ? '超卖' : v >= 60 ? '偏热' : v <= 40 ? '偏弱' : '中性';
  if (k.includes('sma')) return v > 5 ? '明显过热' : v > 1 ? '轻度过热' : v < -5 ? '明显超跌' : v < -1 ? '轻度超跌' : '贴近均线';
  if (k.includes('volume')) return v > 2 ? '放量' : v < -1 ? '缩量' : '正常';
  if (k.includes('macd')) return v > 0 ? '动能改善' : v < 0 ? '动能减弱' : '中性';
  if (k.includes('relative')) return v > 1 ? '偏强' : v < -1 ? '偏弱' : '接近大盘';
  if (k.includes('iv') || k.includes('atr')) return v > 70 ? '波动高' : v < 30 ? '波动低' : '波动正常';
  if (k.includes('close_position')) return v > 70 ? '收近高位' : v < 30 ? '收近低位' : '区间中部';
  return '—';
}

function renderAiCard(data) {
  if (data?.__error || data?.error) {
    return `<div class="ai-result-card"><p style="margin:0;color:var(--color-muted);font-size:13px">AI 深度分析暂不可用</p></div>`;
  }
  const levels = data?.key_levels || {};
  return `<div class="ai-result-card">
    <div class="ai-result-card__header">
      <span class="label-caps">AI 信号深度分析</span>
      ${data._cached ? '<span class="label-caps" style="background:var(--color-container);padding:3px 7px;border-radius:999px">缓存</span>' : ''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div style="padding:10px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:6px">
        <div class="label-caps" style="margin-bottom:4px">判断</div>
        <strong style="font-size:13px">${esc(data.final_bias || data.dominant_regime || '—')}</strong>
      </div>
      <div style="padding:10px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:6px">
        <div class="label-caps" style="margin-bottom:4px">置信度</div>
        <strong class="mono" style="font-size:13px">Top ${esc(data.top_risk_confidence ?? '—')} · Bot ${esc(data.bottom_opportunity_confidence ?? '—')}</strong>
      </div>
    </div>
    ${data.most_important_signal ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.6"><b>最重要信号:</b> ${esc(data.most_important_signal)}</p>` : ''}
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6"><b>支撑:</b> <span class="mono">${(levels.support || []).join(', ') || '—'}</span> &nbsp;|&nbsp; <b>阻力:</b> <span class="mono">${(levels.resistance || []).join(', ') || '—'}</span></p>
    ${(data.event_risks || []).length ? `<p style="margin:0 0 8px;font-size:12px;color:var(--color-muted)"><b>事件风险:</b> ${data.event_risks.map(esc).join('；')}</p>` : ''}
    ${data.summary ? `<p style="margin:0;font-size:13px;line-height:1.65;color:var(--color-muted)">${esc(data.summary)}</p>` : ''}
  </div>`;
}

export function renderTopBottomSignals(container, ticker, data) {
  if (!data || data.__error) {
    container.innerHTML = `<div class="panel" style="padding:20px;color:var(--color-muted);font-size:13px">Top/Bottom Signal Analysis 暂不可用</div>`;
    return;
  }
  const scores = data.scores || {};
  const signals = data.signals || {};
  const preferred = ['rsi14','sma20_dist','sma50_dist','return_20d','volume_zscore','macd_hist','relative_strength_spy','iv_rank','close_position','obv_divergence'];
  const rows = preferred.filter(k => signals[k]).map(k => {
    const s = signals[k];
    return `<li style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--color-border);font-size:13px"><span style="font-weight:700">${esc(s.label || k)}</span><span class="mono" style="color:var(--color-muted)">${fmt(s.value, k.includes('macd') ? 4 : 1)} → ${interpret(k, s)}</span></li>`;
  }).join('');

  container.innerHTML = `<div class="panel" style="padding:20px;display:grid;gap:16px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <span class="label-caps">Top / Bottom Signal Analysis</span>
        <h3 style="margin:6px 0 0;font-size:20px;font-weight:800;letter-spacing:-.03em">顶底信号分析</h3>
        <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:var(--color-muted)">预测窗口：5-20 交易日 · 周期：日线</p>
      </div>
      <span class="label-caps" style="color:var(--color-muted)">as of ${esc(data.as_of || '')}${data._cached ? ' · cached' : ''}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
      ${gauge('趋势偏向', data.trend_bias_score ?? 50, data.trend_bias_label || '中性')}
      ${gauge('顶部风险', scores.top_score, scores.top_label, scores.top_reasons)}
      ${gauge('底部机会', scores.bottom_score, scores.bottom_label, scores.bottom_reasons)}
      ${gauge('回调买点', scores.dip_buy_quality, scores.dip_buy_label, { raising: scores.dip_buy_reasons || [], suppressing: [] })}
    </div>
    <details open style="padding:14px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:6px">
      <summary class="label-caps" style="cursor:pointer">Signal Breakdown · 信号明细</summary>
      <ul style="margin:10px 0 0;padding:0;list-style:none">${rows}</ul>
    </details>
    <button id="tb-ai-btn" class="ai-analysis-button" style="width:100%;justify-content:center;display:inline-flex;align-items:center;gap:8px">
      <span class="material-symbols-outlined" style="font-size:18px">psychology</span> AI 深度分析
    </button>
    <div id="tb-ai-result" style="display:none"></div>
  </div>`;

  const btn = container.querySelector('#tb-ai-btn');
  const result = container.querySelector('#tb-ai-result');
  btn.onclick = async () => {
    btn.innerHTML = '<span style="width:14px;height:14px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;display:inline-block"></span> 正在分析信号一致性...';
    btn.disabled = true;
    const ai = await safe(api.analyzeTopBottomSignals(ticker));
    result.style.display = 'block';
    result.innerHTML = renderAiCard(ai);
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">psychology</span> 重新分析';
    btn.disabled = false;
  };
}
