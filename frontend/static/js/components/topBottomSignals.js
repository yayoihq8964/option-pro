import { api, safe } from '../api.js';

const fmt = (n, d = 1) => n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toFixed(d);

function color(score) {
  const s = Number(score || 0);
  if (s < 30) return 'bg-tertiary';
  if (s < 50) return 'bg-amber-400';
  if (s < 70) return 'bg-orange-500';
  return 'bg-error';
}

function gauge(title, score, label) {
  const s = Math.max(0, Math.min(100, Number(score || 0)));
  return `<div class="rounded-3xl bg-white border border-outline-variant/10 p-5 shadow-sm">
    <div class="flex items-center justify-between mb-3">
      <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">${title}</p>
      <span class="text-2xl font-black font-headline tabular-nums">${Math.round(s)}<span class="text-xs text-on-surface-variant">/100</span></span>
    </div>
    <div class="h-3 rounded-full bg-surface-container overflow-hidden"><div class="h-full ${color(s)} rounded-full transition-all" style="width:${s}%"></div></div>
    <p class="mt-2 text-xs font-bold text-on-surface-variant">${label || ''}</p>
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
  return sig?.top_score > sig?.bottom_score ? '偏顶部风险' : sig?.bottom_score > sig?.top_score ? '偏底部机会' : '中性';
}

function renderAiCard(data) {
  if (data?.__error || data?.error) return `<div class="rounded-2xl p-5 bg-surface-container-low text-center text-sm text-on-surface-variant">AI 深度分析暂不可用</div>`;
  const levels = data?.key_levels || {};
  return `<div class="rounded-[2rem] p-6 bg-gradient-to-br from-[#6a1cf6] to-[#4953ac] text-white shadow-xl relative overflow-hidden">
    <div class="absolute -top-10 -right-10 w-44 h-44 bg-white/10 rounded-full blur-3xl"></div>
    <div class="relative z-10 space-y-3">
      <div class="flex items-center gap-3"><div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><span class="material-symbols-outlined">auto_awesome</span></div><h4 class="font-headline font-extrabold text-lg">Oracle Signal Review</h4></div>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="bg-white/15 rounded-xl p-3"><p class="text-white/60 text-[10px] font-black uppercase">判断</p><p class="font-bold">${data.final_bias || data.dominant_regime || '—'}</p></div>
        <div class="bg-white/15 rounded-xl p-3"><p class="text-white/60 text-[10px] font-black uppercase">置信度</p><p class="font-bold">Top ${data.top_risk_confidence ?? '—'} · Bottom ${data.bottom_opportunity_confidence ?? '—'}</p></div>
      </div>
      ${data.most_important_signal ? `<p class="text-sm text-white/85"><b>最重要信号:</b> ${data.most_important_signal}</p>` : ''}
      <p class="text-sm text-white/85"><b>支撑:</b> ${(levels.support || []).join(', ') || '—'} | <b>阻力:</b> ${(levels.resistance || []).join(', ') || '—'}</p>
      ${(data.event_risks || []).length ? `<p class="text-xs text-white/70"><b>事件风险:</b> ${data.event_risks.join('；')}</p>` : ''}
      ${data.summary ? `<p class="text-sm leading-relaxed text-white/85">${data.summary}</p>` : ''}
    </div>
  </div>`;
}

export function renderTopBottomSignals(container, ticker, data) {
  if (!data || data.__error) {
    container.innerHTML = `<section class="rounded-3xl bg-white p-6 border border-outline-variant/10 text-sm text-on-surface-variant">Top/Bottom Signal Analysis 暂不可用</section>`;
    return;
  }
  const scores = data.scores || {};
  const signals = data.signals || {};
  const preferred = ['rsi14','sma20_dist','sma50_dist','return_20d','volume_zscore','macd_hist','relative_strength_spy','iv_rank','close_position','obv_divergence'];
  const rows = preferred.filter(k => signals[k]).map(k => {
    const s = signals[k];
    return `<li class="flex items-center justify-between gap-3 py-2 border-b border-outline-variant/10 last:border-0"><span class="font-bold text-sm">${s.label || k}</span><span class="text-sm text-on-surface-variant tabular-nums">${fmt(s.value, k.includes('macd') ? 4 : 1)} → ${interpret(k, s)}</span></li>`;
  }).join('');
  container.innerHTML = `<section class="space-y-5 rounded-[2rem] bg-surface-container-lowest border border-outline-variant/10 p-5 md:p-6 shadow-sm">
    <div class="flex items-center justify-between gap-3 flex-wrap"><h3 class="font-headline font-extrabold text-xl">Top/Bottom Signal Analysis</h3><span class="text-[10px] font-bold text-on-surface-variant">as of ${data.as_of || ''}${data._cached ? ' · cached' : ''}</span></div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${gauge('TOP RISK', scores.top_score, scores.top_label)}${gauge('BOTTOM OPP', scores.bottom_score, scores.bottom_label)}</div>
    <details open class="rounded-2xl bg-surface-container-low p-4"><summary class="cursor-pointer text-xs font-black uppercase tracking-widest text-on-surface-variant">Signal breakdown</summary><ul class="mt-3">${rows}</ul></details>
    <button id="tb-ai-btn" class="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-[#6a1cf6] to-[#4953ac] text-white font-bold text-sm hover:shadow-lg active:scale-[0.98] transition-all"><span class="material-symbols-outlined text-lg">psychology</span> AI 深度分析</button>
    <div id="tb-ai-result" class="hidden"></div>
  </section>`;
  const btn = container.querySelector('#tb-ai-btn');
  const result = container.querySelector('#tb-ai-result');
  btn.onclick = async () => {
    btn.innerHTML = '<span class="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin"></span> 正在分析信号一致性...';
    btn.disabled = true;
    const ai = await safe(api.analyzeTopBottomSignals(ticker));
    result.classList.remove('hidden');
    result.innerHTML = renderAiCard(ai);
    btn.innerHTML = '<span class="material-symbols-outlined text-lg">psychology</span> 重新分析';
    btn.disabled = false;
  };
}
