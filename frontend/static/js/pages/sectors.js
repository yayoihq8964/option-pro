import { api } from '../api.js';
import { renderHeatmap } from '../components/heatmap.js';

const FALLBACK_SECTORS = [
  { name: '半导体', ticker: 'NVDA', performance: 1.72, iv: 42.1, leaders: ['NVDA', 'AMD', 'AVGO'] },
  { name: '科技', ticker: 'AAPL', performance: 0.84, iv: 28.7, leaders: ['AAPL', 'MSFT', 'META'] },
  { name: '汽车', ticker: 'TSLA', performance: -1.12, iv: 51.4, leaders: ['TSLA', 'F', 'GM'] }
];

const FALLBACK_IV = [
  { ticker: 'TSLA', sector: '汽车', ivRank: 74, iv: 51.4, change: -1.12 },
  { ticker: 'NVDA', sector: '半导体', ivRank: 68, iv: 42.1, change: 1.72 },
  { ticker: 'AAPL', sector: '科技', ivRank: 41, iv: 28.7, change: 0.84 }
];

const FALLBACK_HEATMAP = [
  { ticker: 'NVDA', label: '英伟达', changePercent: 1.72, weight: 2.4 },
  { ticker: 'AAPL', label: '苹果', changePercent: 0.84, weight: 2.1 },
  { ticker: 'MSFT', label: '微软', changePercent: 0.52, weight: 2.0 },
  { ticker: 'TSLA', label: '特斯拉', changePercent: -1.12, weight: 1.7 },
  { ticker: 'JPM', label: '摩根大通', changePercent: -0.35, weight: 1.3 },
  { ticker: 'XOM', label: '埃克森美孚', changePercent: -2.24, weight: 1.4 }
];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function navigateToDetail(ticker) {
  const symbol = String(ticker || '').trim().toUpperCase();
  if (!symbol) return;
  window.location.hash = `#detail/${encodeURIComponent(symbol)}`;
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const sign = number > 0 ? '+' : '';
  return `${sign}${number.toFixed(2)}%`;
}

function normalizeSectors(payload) {
  const items = Array.isArray(payload) ? payload : (payload?.sectors ?? payload?.items ?? payload?.data ?? []);
  return items.map((item) => {
    const name = item.name ?? item.sector ?? item.label ?? '板块';
    const leaders = item.leaders ?? item.tickers ?? item.symbols ?? [];
    const ticker = String(item.ticker ?? item.symbol ?? leaders?.[0] ?? '').toUpperCase();
    return {
      name,
      ticker,
      performance: Number(item.performance ?? item.changePercent ?? item.change_percent ?? item.change ?? 0),
      iv: Number(item.iv ?? item.avgIv ?? item.average_iv ?? item.impliedVolatility ?? 0),
      leaders: Array.isArray(leaders) ? leaders.slice(0, 4).map((leader) => String(leader).toUpperCase()) : []
    };
  }).filter((sector) => sector.name);
}

function normalizeIvRanking(payload) {
  const items = Array.isArray(payload) ? payload : (payload?.ivRanking ?? payload?.iv_ranking ?? payload?.items ?? payload?.data ?? []);
  return items.map((item) => ({
    ticker: String(item.ticker ?? item.symbol ?? '').toUpperCase(),
    sector: item.sector ?? item.industry ?? '市场',
    ivRank: Number(item.ivRank ?? item.iv_rank ?? item.rank ?? item.score ?? 0),
    iv: Number(item.iv ?? item.impliedVolatility ?? item.implied_volatility ?? 0),
    change: Number(item.changePercent ?? item.change_percent ?? item.change ?? 0)
  })).filter((item) => item.ticker);
}

function renderSectorCards(sectors) {
  return sectors.map((sector) => `
    <article class="sector-card">
      <div class="sector-card__heading">
        <span class="label-caps">板块</span>
        <strong>${escapeHtml(sector.name)}</strong>
      </div>
      <div class="sector-card__metrics">
        <span><small class="label-caps">表现</small><b class="mono font-data-mono ${sector.performance >= 0 ? 'up' : 'down'}" data-numeric>${formatPercent(sector.performance)}</b></span>
        <span><small class="label-caps">平均 IV</small><b class="mono font-data-mono" data-numeric>${Number.isFinite(sector.iv) ? sector.iv.toFixed(1) : '—'}</b></span>
      </div>
      <div class="sector-tabs" aria-label="${escapeHtml(sector.name)} 领先标的">
        ${(sector.leaders.length ? sector.leaders : [sector.ticker]).filter(Boolean).map((ticker) => `<button class="sector-pill" type="button" data-ticker="${escapeHtml(ticker)}">${escapeHtml(ticker)}</button>`).join('')}
      </div>
    </article>
  `).join('');
}

function renderIvRanking(items) {
  return items.map((item, index) => `
    <button class="iv-ranking-item" type="button" data-ticker="${escapeHtml(item.ticker)}" aria-label="打开 ${escapeHtml(item.ticker)} 详情">
      <span class="iv-ranking-item__rank mono font-data-mono" data-numeric>${String(index + 1).padStart(2, '0')}</span>
      <span class="iv-ranking-item__identity"><strong>${escapeHtml(item.ticker)}</strong><small>${escapeHtml(item.sector)}</small></span>
      <span class="iv-ranking-item__metric"><small class="label-caps">IV 排名</small><b class="mono font-data-mono" data-numeric>${Number.isFinite(item.ivRank) ? item.ivRank.toFixed(0) : '—'}</b></span>
      <span class="iv-ranking-item__metric"><small class="label-caps">IV</small><b class="mono font-data-mono" data-numeric>${Number.isFinite(item.iv) ? item.iv.toFixed(1) : '—'}</b></span>
    </button>
  `).join('');
}

function renderShell() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <section class="sectors-page" aria-labelledby="sectors-title">
      <header class="terminal-header">
        <div>
          <span class="label-caps">板块</span>
          <h1 id="sectors-title">板块波动率分析</h1>
          <p>以 Ethos 白色卡片、低调边框、IV 排名与翡翠绿到深红的热力图呈现板块波动率结构。</p>
        </div>
      </header>
      <div class="sector-card-grid" id="sector-card-grid"><div class="panel loading-card">正在加载板块数据…</div></div>
      <div class="sectors-layout">
        <section class="sector-section-card" aria-labelledby="iv-ranking-title">
          <div class="section-card-heading"><span class="label-caps">IV 排名</span><h2 id="iv-ranking-title">波动率领先标的</h2></div>
          <div id="iv-ranking-list" class="iv-ranking-list"><div class="detail-muted">正在加载 IV 排名…</div></div>
        </section>
        <section class="sector-section-card" aria-labelledby="heatmap-title">
          <div class="section-card-heading"><span class="label-caps">热力图</span><h2 id="heatmap-title">市场宽度</h2></div>
          <div id="sector-heatmap"><div class="detail-muted">正在加载热力图…</div></div>
        </section>
      </div>
    </section>
  `;
}

export async function renderSectors() {
  renderShell();
  const sectorGrid = document.getElementById('sector-card-grid');
  const ivList = document.getElementById('iv-ranking-list');
  const heatmap = document.getElementById('sector-heatmap');

  let sectors = FALLBACK_SECTORS, ivItems = FALLBACK_IV, heatmapPayload = FALLBACK_HEATMAP;
  try {
    const sectorData = await api.sectors();
    const rawSectors = normalizeSectors(sectorData);
    if (rawSectors.length) sectors = rawSectors;
    // Use first sector for iv-ranking and heatmap
    const firstId = sectorData?.sectors?.[0]?.id || 'semiconductors';
    const [ivResult, hmResult] = await Promise.allSettled([
      api.sectorIV(firstId),
      api.sectorHeatmap(firstId)
    ]);
    if (ivResult.status === 'fulfilled') {
      const normalized = normalizeIvRanking(ivResult.value);
      if (normalized.length) ivItems = normalized;
    }
    if (hmResult.status === 'fulfilled') heatmapPayload = hmResult.value;
  } catch (e) {
    console.warn('Sectors data load error:', e);
  }

  if (sectorGrid) sectorGrid.innerHTML = renderSectorCards(sectors);
  if (ivList) ivList.innerHTML = renderIvRanking(ivItems);
  if (heatmap) heatmap.innerHTML = renderHeatmap(heatmapPayload);

  document.querySelectorAll('[data-ticker]').forEach((button) => {
    button.addEventListener('click', () => navigateToDetail(button.dataset.ticker));
  });
}
