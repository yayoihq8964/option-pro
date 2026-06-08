import { api, safe } from '../api.js';
import { renderChart } from '../components/chart.js';
import { renderTopBottomSignals } from '../components/topBottomSignals.js';
import { renderOptionChain, renderAlerts } from '../components/optionChain.js';
import { renderAlertAnalysisButton } from '../components/aiAnalysis.js';

const TIMEFRAMES = [ ['5m','5分'], ['15m','15分'], ['1h','1时'], ['1d','日K'], ['1w','周K'] ];

const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money = (n) => n == null || Number.isNaN(Number(n)) ? '—' : `$${Number(n).toFixed(2)}`;
const large = (n) => n == null ? '—' : n >= 1e12 ? `$${(n/1e12).toFixed(2)}T` : n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : `$${Number(n).toLocaleString()}`;
const num = (n) => n == null ? '—' : Number(n).toLocaleString();
const safeUrl = (v) => {
  try {
    const url = new URL(String(v || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch (_) {
    return '';
  }
};

// Track the "active" mount so older mountDetail calls can detect they've been
// superseded and bail out of late cleanups. Each mount captures its own
// local handle + timer in closure — no shared mutable state.
let __activeMountId = 0;

function renderShell(ticker) {
  return `<section class="detail-page">
    <nav class="detail-breadcrumb">
      <a href="#watchlist" data-back-breadcrumb>← 返回终端</a>
      <span class="mono">/ ${esc(ticker)}</span>
    </nav>

    <div id="modal-header" class="panel" style="padding:24px"></div>
    <div id="modal-stats" style="display:grid;gap:16px"></div>

    <div class="detail-chart-wrap panel" style="padding:20px">
      <div id="tf-buttons" class="ethos-timeframe-row" style="margin-bottom:16px"></div>
      <div id="modal-chart" style="height:420px;min-height:420px"></div>
    </div>

    <div id="top-bottom-signals"></div>

    <div id="option-alerts-section"></div>

    <div id="option-chain-container"></div>
  </section>`;
}

function renderHeaderAndStats(stock) {
  const pct = Number(stock.change_percent ?? 0), ch = Number(stock.change ?? 0);
  const pos = pct > 0, neg = pct < 0;
  const toneClass = pos ? 'up' : neg ? 'down' : '';
  const initial = (stock.ticker || '?')[0];
  const logoUrl = safeUrl(stock.logo_url);

  document.getElementById('modal-header').innerHTML = `
    <div class="detail-stock-header">
      <div style="display:flex;align-items:flex-start;gap:16px;flex:1;min-width:0">
        <div class="detail-logo" data-logo-shell>
          ${logoUrl ? `<img src="${esc(logoUrl)}" alt="${esc(stock.name_en || stock.ticker)} logo" loading="lazy" referrerpolicy="no-referrer" data-company-logo>` : ''}
          <span data-logo-fallback>${esc(initial)}</span>
        </div>
        <div style="min-width:0">
          <h1 style="margin:0;font-size:24px;font-weight:800;letter-spacing:-.04em">
            ${esc(stock.name || stock.ticker)}
            <span style="font-family:'JetBrains Mono';font-size:14px;color:var(--color-muted);font-weight:700;margin-left:8px">${esc(stock.ticker)}</span>
          </h1>
          <p style="margin:6px 0 0;color:var(--color-muted);font-size:13px;line-height:1.5">${esc(stock.description || `${stock.name || stock.ticker} · 行情、技术信号与期权链分析`)}</p>
        </div>
      </div>
      <div class="detail-market-price">
        <strong class="mono">${Number(stock.price || 0).toLocaleString(undefined,{maximumFractionDigits:2})}</strong>
        <span class="mono ${toneClass}">${pos?'+':''}${pct.toFixed(2)}% (${pos?'+':''}$${Math.abs(ch).toFixed(2)})</span>
      </div>
    </div>`;
  document.querySelectorAll('[data-company-logo]').forEach((img) => {
    img.addEventListener('load', () => img.closest('[data-logo-shell]')?.classList.add('has-logo'), { once: true });
    img.addEventListener('error', () => img.closest('[data-logo-shell]')?.classList.add('logo-failed'), { once: true });
  });

  const quickStats = [
    ['Open', money(stock.open ?? stock.o)],
    ['High', money(stock.day_high ?? stock.high)],
    ['Low', money(stock.day_low ?? stock.low)],
    ['Volume', num(stock.volume)]
  ];
  const marketStats = [
    ['市值', large(stock.market_cap)],
    ['P/E', stock.pe_ratio ?? stock.pe ?? '—'],
    ['52周最高', money(stock.year_high ?? stock.week52_high)],
    ['52周最低', money(stock.year_low ?? stock.week52_low)]
  ];

  document.getElementById('modal-stats').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
      ${quickStats.map(([k,v]) => `<div class="panel" style="padding:14px"><div class="label-caps" style="margin-bottom:6px">${esc(k)}</div><div class="mono" style="font-size:18px;font-weight:800">${v}</div></div>`).join('')}
    </div>
    <div class="panel" style="padding:20px">
      <div class="label-caps" style="margin-bottom:14px">Market Statistics</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px 24px">
        ${marketStats.map(([k,v]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--color-border);font-size:13px"><span style="color:var(--color-muted)">${esc(k)}</span><span class="mono" style="font-weight:700">${v}</span></div>`).join('')}
      </div>
    </div>`;
}

async function loadChart(ticker, range, state) {
  const el = document.getElementById('modal-chart');
  if (!el || state.cancelled) return;
  el.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center"><div style="width:24px;height:24px;border:2px solid #000;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></div></div>';
  state.chartHandle?.destroy?.(); state.chartHandle = null;
  const data = await safe(api.chart(ticker, range));
  if (state.cancelled) return;
  if (data.__error) {
    el.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--color-crimson);font-size:14px">K线加载失败</div>';
    return;
  }
  state.chartHandle = renderChart(el, data, data.visible || 0);
}

async function loadOptionAlertsAndChain(ticker, state) {
  const alertsSection = document.getElementById('option-alerts-section');
  const chainSection = document.getElementById('option-chain-container');
  const ex = await safe(api.expirations(ticker));
  const expirations = ex.expirations || [];
  if (!expirations.length) {
    chainSection.innerHTML = '';
    return;
  }
  const selected = expirations[0];
  const chain = await safe(api.optionChain(ticker, selected));
  if (chain.__error) {
    chainSection.innerHTML = '';
    return;
  }
  // Render alerts + AI button at top
  const alerts = chain?.alerts || [];
  if (alerts.length > 0) {
    alertsSection.innerHTML = `<section class="option-alert-section">${renderAlerts(alerts)}<div id="ai-analysis-mount"></div></section>`;
    renderAlertAnalysisButton(document.getElementById('ai-analysis-mount'), ticker, alerts, chain.underlying_price || 0, selected);
  } else {
    alertsSection.innerHTML = '';
  }
  // Render option chain table
  chainSection.innerHTML = `<div class="panel" style="padding:20px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
      <div>
        <span class="label-caps">Options Chain</span>
        <h2 style="margin:6px 0 0;font-size:20px;font-weight:800;letter-spacing:-.03em">期权链 · ATM ±10</h2>
      </div>
      <select id="expiration-select" class="option-expiration-select">
        ${expirations.map(e => `<option value="${e}" ${e === selected ? 'selected' : ''}>${e}</option>`).join('')}
      </select>
    </div>
    <div id="option-chain-table">${renderOptionChain(chain)}</div>
  </div>`;
  // Bind expiration change
  document.getElementById('expiration-select')?.addEventListener('change', async (e) => {
    const exp = e.target.value;
    const tbl = document.getElementById('option-chain-table');
    tbl.innerHTML = '<div style="padding:32px;text-align:center;color:var(--color-muted)">加载中...</div>';
    const newChain = await safe(api.optionChain(ticker, exp));
    if (!newChain.__error) {
      tbl.innerHTML = renderOptionChain(newChain);
      // Re-render alerts for new expiration
      const newAlerts = newChain.alerts || [];
      if (newAlerts.length > 0) {
        alertsSection.innerHTML = `<section class="option-alert-section">${renderAlerts(newAlerts)}<div id="ai-analysis-mount"></div></section>`;
        renderAlertAnalysisButton(document.getElementById('ai-analysis-mount'), ticker, newAlerts, newChain.underlying_price || 0, exp);
      } else {
        alertsSection.innerHTML = '';
      }
    }
  });
}

export async function mountDetail(tickerFromRoute) {
  const ticker = String(tickerFromRoute || '').trim().toUpperCase();
  if (!ticker) { location.hash = '#watchlist'; return; }

  // Per-mount state in closure. Older mounts can still run cleanup on their
  // own state without trampling on this mount.
  const mountId = ++__activeMountId;
  const state = { cancelled: false, chartHandle: null, refreshTimer: null };

  const app = document.getElementById('app');
  app.innerHTML = renderShell(ticker);

  // Back nav
  document.querySelectorAll('[data-back-breadcrumb]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); location.hash = '#watchlist'; });
  });

  // Render timeframe buttons
  let currentRange = '1d';
  const tf = document.getElementById('tf-buttons');
  const drawTf = () => tf.innerHTML = TIMEFRAMES.map(([r, l]) =>
    `<button type="button" class="ethos-timeframe-button ${r === currentRange ? 'active' : ''}" data-range="${r}">${l}</button>`
  ).join('');
  drawTf();
  tf.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-range]');
    if (!b || state.cancelled) return;
    currentRange = b.dataset.range;
    drawTf();
    await loadChart(ticker, currentRange, state);
  });

  // Header + stats
  safe(api.stock(ticker)).then(d => {
    if (state.cancelled) return;
    if (!d.__error) renderHeaderAndStats(d);
  });

  // Chart with auto-refresh
  state.refreshTimer = setInterval(() => {
    if (state.cancelled) return;
    loadChart(ticker, currentRange, state);
  }, 30 * 60 * 1000);
  loadChart(ticker, currentRange, state);

  // Top/Bottom signals (4 gauges + AI analysis)
  safe(api.topBottomSignals(ticker)).then(d => {
    if (state.cancelled) return;
    const el = document.getElementById('top-bottom-signals');
    if (el) renderTopBottomSignals(el, ticker, d);
  });

  // Option alerts + chain
  loadOptionAlertsAndChain(ticker, state);

  // Cleanup on hash change — only this mount's state, not whatever's mounted now
  const cleanup = () => {
    state.cancelled = true;
    if (state.refreshTimer) { clearInterval(state.refreshTimer); state.refreshTimer = null; }
    state.chartHandle?.destroy?.(); state.chartHandle = null;
    window.removeEventListener('hashchange', cleanup);
  };
  window.addEventListener('hashchange', cleanup, { once: true });
}

export const renderDetail = mountDetail;
