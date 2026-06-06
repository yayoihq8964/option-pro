import { api } from '../api.js';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function firstDefined(source, keys, fallback = '—') {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== '') return source[key];
  }
  return fallback;
}

function formatValue(value, suffix = '') {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'number') return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}`;
  return `${value}${suffix}`;
}

function normalizeSignalsPayload(payload) {
  const source = payload?.signals ?? payload?.data ?? payload ?? {};
  const bottom = source.bottom ?? source.bullish ?? source.support ?? source.positive ?? {};
  const top = source.top ?? source.bearish ?? source.resistance ?? source.negative ?? {};

  return {
    bottom: {
      supportZone: firstDefined(bottom, ['supportZone', 'support_zone', 'support', 'zone'], firstDefined(source, ['supportZone', 'support_zone', 'support'], 'Support building near recent demand.')),
      volumeProfile: firstDefined(bottom, ['volumeProfile', 'volume_profile', 'volume', 'volumeNode'], firstDefined(source, ['volumeProfile', 'volume_profile'], 'Constructive accumulation profile.')),
      optionsFlow: firstDefined(bottom, ['optionsFlow', 'options_flow', 'callFlow', 'calls'], firstDefined(source, ['optionsFlow', 'callSignal', 'call_flow'], 'Call demand and downside protection remain balanced.')),
      intelligenceSummary: firstDefined(bottom, ['intelligenceSummary', 'intelligence_summary', 'summary', 'thesis'], firstDefined(source, ['bullish', 'bull_score', 'momentum'], 'Bottom setup favors patient accumulation while price respects support.'))
    },
    top: {
      resistanceZone: firstDefined(top, ['resistanceZone', 'resistance_zone', 'resistance', 'zone'], firstDefined(source, ['resistanceZone', 'resistance_zone', 'resistance'], 'Resistance overhead requires confirmation.')),
      iv: firstDefined(top, ['iv', 'impliedVolatility', 'implied_volatility', 'ivRank'], firstDefined(source, ['iv', 'ivRank', 'volatility'], 'Volatility regime is elevated enough to monitor.')),
      openInterest: firstDefined(top, ['openInterest', 'open_interest', 'oi'], firstDefined(source, ['openInterest', 'open_interest'], 'Open interest clusters may cap momentum.')),
      riskAssessment: firstDefined(top, ['riskAssessment', 'risk_assessment', 'risk', 'summary'], firstDefined(source, ['bearish', 'bear_score', 'putSignal'], 'Top risk is a failed breakout with renewed hedging demand.'))
    }
  };
}

function renderMetric(label, value) {
  return `
    <div class="signal-metric-row">
      <span class="label-caps">${escapeHtml(label)}</span>
      <strong class="mono font-data-mono" data-numeric>${escapeHtml(formatValue(value))}</strong>
    </div>
  `;
}

export function renderSignalPanels(payload) {
  const signals = normalizeSignalsPayload(payload);
  return `
    <section class="signal-analysis-grid" aria-label="Technical signal analysis">
      <article class="ethos-signal-panel ethos-signal-panel--bottom" aria-labelledby="bottom-signal-title">
        <div class="signal-panel-header">
          <span class="signal-theme-dot" aria-hidden="true"></span>
          <div>
            <span class="label-caps">Emerald / Bullish</span>
            <h3 id="bottom-signal-title">Bottom Signal Analysis</h3>
          </div>
        </div>
        <div class="signal-metric-list">
          ${renderMetric('Support Zone', signals.bottom.supportZone)}
          ${renderMetric('Volume Profile', signals.bottom.volumeProfile)}
          ${renderMetric('Options Flow', signals.bottom.optionsFlow)}
        </div>
        <p class="signal-intelligence-copy">${escapeHtml(formatValue(signals.bottom.intelligenceSummary))}</p>
      </article>

      <article class="ethos-signal-panel ethos-signal-panel--top" aria-labelledby="top-signal-title">
        <div class="signal-panel-header">
          <span class="signal-theme-dot" aria-hidden="true"></span>
          <div>
            <span class="label-caps">Crimson / Bearish</span>
            <h3 id="top-signal-title">Top Signal Analysis</h3>
          </div>
        </div>
        <div class="signal-metric-list">
          ${renderMetric('Resistance Zone', signals.top.resistanceZone)}
          ${renderMetric('IV', signals.top.iv)}
          ${renderMetric('Open Interest', signals.top.openInterest)}
        </div>
        <p class="signal-intelligence-copy">${escapeHtml(formatValue(signals.top.riskAssessment))}</p>
      </article>
    </section>
  `;
}

export async function renderSignals(container, ticker, prefetchedSignals = null) {
  if (!container) return;
  const payload = prefetchedSignals ?? await api.signals(ticker);
  container.innerHTML = renderSignalPanels(payload);
}

export { normalizeSignalsPayload };
