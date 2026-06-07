import { api, safe } from '../api.js';

/**
 * Render AI alert analysis button + panel inside option chain area.
 * Only triggers on user click (saves tokens).
 */
export function renderAlertAnalysisButton(container, ticker, alerts, underlyingPrice, expiration) {
  if (!alerts || alerts.length === 0) return;

  const wrap = document.createElement('div');
  wrap.className = 'mb-5';
  wrap.innerHTML = `
    <button id="ai-analyze-btn" class="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl
      bg-gradient-to-r from-[#6a1cf6] to-[#4953ac] text-white font-bold text-sm
      hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98] transition-all">
      <span class="material-symbols-outlined text-lg">psychology</span>
      AI 分析异动 (${alerts.length} 条信号)
    </button>
    <div id="ai-analysis-result" class="hidden mt-4"></div>`;

  container.prepend(wrap);

  const btn = wrap.querySelector('#ai-analyze-btn');
  const resultDiv = wrap.querySelector('#ai-analysis-result');

  btn.onclick = async () => {
    btn.innerHTML = '<span class="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin"></span> 正在分析...';
    btn.disabled = true;

    const result = await safe(api.analyzeAlerts({
      ticker, alerts, underlying_price: underlyingPrice, expiration
    }));

    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = renderAnalysisCard(result);

    btn.innerHTML = `<span class="material-symbols-outlined text-lg">psychology</span> 重新分析`;
    btn.disabled = false;
  };
}

function renderAnalysisCard(data) {
  if (data?.__error || data?.error) {
    return `<div class="rounded-2xl p-5 bg-surface-container-low text-center text-sm text-on-surface-variant">AI 分析暂时不可用</div>`;
  }

  const conf = data?.confidence || 'medium';
  const dir = data?.direction || 'mixed';
  const confColors = { high: 'bg-tertiary text-white', medium: 'bg-amber-500 text-white', low: 'bg-error text-white' };
  const dirColors = { bullish: 'bg-tertiary/20 text-tertiary', bearish: 'bg-error/20 text-error', mixed: 'bg-surface-container text-on-surface-variant' };
  const dirLabels = { bullish: '看涨', bearish: '看空', mixed: '多空交织' };

  return `
    <div class="rounded-[2rem] p-6 bg-gradient-to-br from-[#6a1cf6] to-[#4953ac] text-white shadow-xl relative overflow-hidden">
      <div class="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
      <div class="relative z-10 space-y-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
            <span class="material-symbols-outlined">psychology</span>
          </div>
          <h3 class="font-headline font-extrabold text-lg">AI 异动分析</h3>
          ${data?._cached ? '<span class="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">缓存</span>' : ''}
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${confColors[conf] || confColors.medium}">
            置信度: ${conf.toUpperCase()}
          </span>
          <span class="px-3 py-1 rounded-full text-[10px] font-black ${dirColors[dir] || dirColors.mixed}">
            ${dirLabels[dir] || dir}
          </span>
        </div>
        ${data?.summary ? `<p class="text-white font-bold">${data.summary}</p>` : ''}
        ${data?.analysis ? `<p class="text-sm text-white/85 leading-relaxed">${data.analysis}</p>` : ''}
        ${data?.key_strikes?.length ? `
          <div class="flex gap-2 flex-wrap">
            ${data.key_strikes.map(s => `<span class="px-3 py-1.5 bg-white/20 rounded-lg text-[10px] font-bold tracking-widest">STRIKE ${s}</span>`).join('')}
          </div>` : ''}
        ${data?.risk_note ? `<p class="text-[10px] text-white/50 mt-2">⚠ ${data.risk_note}</p>` : ''}
      </div>
    </div>`;
}

/**
 * Render earnings correlation analysis on the earnings page.
 */
export function renderEarningsCorrelation(container) {
  const wrap = document.createElement('div');
  wrap.className = 'mb-8';
  wrap.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-extrabold font-headline">AI 财报关联分析</h2>
      <button id="ai-earnings-btn" class="flex items-center gap-2 px-4 py-2 rounded-xl
        bg-gradient-to-r from-[#6a1cf6] to-[#4953ac] text-white font-bold text-xs
        hover:shadow-lg active:scale-[0.98] transition-all">
        <span class="material-symbols-outlined text-sm">auto_awesome</span>
        生成分析
      </button>
    </div>
    <div id="ai-earnings-result"></div>`;

  container.prepend(wrap);

  const btn = wrap.querySelector('#ai-earnings-btn');
  const resultDiv = wrap.querySelector('#ai-earnings-result');

  btn.onclick = async () => {
    btn.innerHTML = '<span class="w-3 h-3 border-2 border-white/60 border-t-transparent rounded-full animate-spin"></span> GPT-5.4-mini 联网分析中...';
    btn.disabled = true;

    const result = await safe(api.earningsCorrelation());
    resultDiv.innerHTML = renderCorrelationCards(result);

    btn.innerHTML = `<span class="material-symbols-outlined text-sm">auto_awesome</span> 重新分析`;
    btn.disabled = false;
  };
}

function renderCorrelationCards(data) {
  if (data?.__error || data?.error) {
    return `<div class="rounded-2xl p-5 bg-surface-container-low text-center text-sm text-on-surface-variant">AI 分析暂时不可用: ${data?.error || ''}</div>`;
  }

  const correlations = data?.correlations || [];
  const summary = data?.summary || '';
  const theme = data?.market_theme || '';

  return `
    ${summary ? `
    <div class="rounded-2xl p-5 bg-gradient-to-br from-[#6a1cf6]/10 to-[#4953ac]/5 border border-primary/10 mb-4">
      <p class="text-sm font-medium text-on-surface leading-relaxed">${summary}</p>
      ${theme ? `<p class="text-xs text-primary font-bold mt-2">📡 ${theme}</p>` : ''}
      ${data?._cached ? '<p class="text-[10px] text-on-surface-variant mt-1">📋 今日已缓存分析</p>' : ''}
    </div>` : ''}
    <div class="space-y-3">
      ${correlations.map(c => `
        <div class="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/10">
          <div class="flex items-center gap-3 mb-3">
            <span class="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-black">${c.source_ticker}</span>
            <span class="font-bold text-sm">${c.source_name || ''}</span>
            <span class="text-xs text-on-surface-variant ml-auto">${c.earnings_date || ''}</span>
          </div>
          <div class="space-y-2">
            ${(c.impact || []).map(imp => `
              <div class="flex items-center gap-3 px-3 py-2 rounded-xl ${imp.direction === 'bullish' ? 'bg-tertiary-container/30' : 'bg-error-container/30'}">
                <span class="material-symbols-outlined text-sm ${imp.direction === 'bullish' ? 'text-tertiary' : 'text-error'}">
                  ${imp.direction === 'bullish' ? 'trending_up' : 'trending_down'}
                </span>
                <span class="font-bold text-xs">${imp.ticker}</span>
                <span class="text-xs text-on-surface-variant">${imp.name || ''}</span>
                <span class="text-xs text-on-surface-variant ml-auto">${imp.reason || ''}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>`;
}

/**
 * Returns HTML for earnings correlation panel.
 * Usage: insert returned HTML into a container, then call bindEarningsCorrelationButton().
 */
export function renderEarningsCorrelationAI(label = '') {
  return `<div class="panel" style="padding:20px;margin-top:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px">
      <div>
        <span class="label-caps">AI 财报关联</span>
        <h3 style="margin:6px 0 0;font-size:18px;font-weight:800">${label || '财报相关性分析'}</h3>
      </div>
      <button class="ai-analysis-button" data-earnings-correlation-button type="button">生成分析</button>
    </div>
    <div data-earnings-correlation-results></div>
  </div>`;
}
