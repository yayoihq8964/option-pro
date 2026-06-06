import { api } from '../api.js';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function scoreFrom(source, keys, fallback) {
  for (const key of keys) {
    const value = Number(source?.[key]);
    if (Number.isFinite(value)) return Math.max(0, Math.min(100, value));
  }
  return fallback;
}

function normalizeTopBottomSignals(payload) {
  const source = payload?.topBottomSignals ?? payload?.signals ?? payload?.data ?? payload ?? {};
  return {
    bottomScore: scoreFrom(source.bottom ?? source, ['bottomScore', 'bottom_score', 'bullishScore', 'bull_score', 'supportScore'], 34),
    topScore: scoreFrom(source.top ?? source, ['topScore', 'top_score', 'bearishScore', 'bear_score', 'riskScore', 'resistanceScore'], 66),
    bottomLabel: source.bottom?.label ?? source.bottomLabel ?? 'Bottom Confidence',
    topLabel: source.top?.label ?? source.topLabel ?? 'Top Risk'
  };
}

function renderGauge(label, score, tone) {
  const color = tone === 'bottom' ? '#059669' : '#ba1a1a';
  const dash = `${score}, 100`;
  return `
    <article class="top-bottom-gauge top-bottom-gauge--${tone}" style="--gauge-color: ${color}; --gauge-score: ${score};">
      <svg viewBox="0 0 120 120" role="img" aria-label="${escapeHtml(label)} ${score.toFixed(0)}">
        <circle class="gauge-track" cx="60" cy="60" r="48"></circle>
        <circle class="gauge-value" cx="60" cy="60" r="48" pathLength="100" stroke-dasharray="${dash}"></circle>
      </svg>
      <div class="gauge-copy">
        <span class="label-caps">${escapeHtml(label)}</span>
        <strong class="mono font-data-mono" data-numeric>${score.toFixed(0)}</strong>
      </div>
    </article>
  `;
}

export function renderTopBottomGauges(payload) {
  const signals = normalizeTopBottomSignals(payload);
  return `
    <section class="top-bottom-gauge-grid" aria-label="Top and bottom gauges">
      ${renderGauge(signals.bottomLabel, signals.bottomScore, 'bottom')}
      ${renderGauge(signals.topLabel, signals.topScore, 'top')}
    </section>
  `;
}

export async function renderTopBottomSignals(container, ticker, prefetchedSignals = null) {
  if (!container) return;
  const payload = prefetchedSignals ?? await api.topBottomSignals(ticker);
  container.innerHTML = renderTopBottomGauges(payload);
}

export { normalizeTopBottomSignals };
