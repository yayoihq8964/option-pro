import { api } from '../api.js';
import { renderHeatmap } from '../components/heatmap.js';

// No fake fallbacks — real data or empty state.
const FALLBACK_SECTORS = [];
const FALLBACK_IV = [];
const FALLBACK_HEATMAP = [];

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

function normalizeIvRanking(payload, sectorName) {
  // API returns {rankings: [{ticker, iv_percentile}], sector_name, ...}
  const items = Array.isArray(payload)
    ? payload
    : (payload?.rankings ?? payload?.ivRanking ?? payload?.iv_ranking ?? payload?.items ?? payload?.data ?? []);
  return items.map((item) => ({
    ticker: String(item.ticker ?? item.symbol ?? '').toUpperCase(),
    sector: item.sector ?? item.industry ?? sectorName ?? '市场',
    ivRank: Number(item.iv_percentile ?? item.ivRank ?? item.iv_rank ?? item.rank ?? item.score ?? 0),
    iv: Number(item.iv ?? item.impliedVolatility ?? item.implied_volatility ?? item.iv_percentile ?? 0),
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
      <div class="sector-carousel-wrap">
        <button type="button" class="sector-carousel-arrow sector-carousel-arrow--left" id="sector-arrow-left" aria-label="向左滚动">
          <span class="material-symbols-outlined">chevron_left</span>
        </button>
        <div class="sector-carousel" id="sector-card-grid"><div class="panel loading-card">正在加载板块数据…</div></div>
        <button type="button" class="sector-carousel-arrow sector-carousel-arrow--right" id="sector-arrow-right" aria-label="向右滚动">
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </div>
      <div class="sectors-layout">
        <section class="sector-section-card" aria-labelledby="iv-ranking-title">
          <div class="section-card-heading"><span class="label-caps">IV 排名</span><h2 id="iv-ranking-title">波动率领先标的</h2></div>
          <div id="iv-ranking-list" class="iv-ranking-list"><div class="detail-muted">正在加载 IV 排名…</div></div>
        </section>
        <div class="sectors-right-column">
          <section class="sector-section-card" aria-labelledby="heatmap-title">
            <div class="section-card-heading"><span class="label-caps">热力图</span><h2 id="heatmap-title">市场宽度</h2></div>
            <div id="sector-heatmap"><div class="detail-muted">正在加载热力图…</div></div>
          </section>
          <section class="sector-section-card" aria-labelledby="constituents-title">
            <div class="section-card-heading"><span class="label-caps">成分股表现</span><h2 id="constituents-title">板块龙头</h2></div>
            <div id="sector-constituents" class="sector-constituents"><div class="detail-muted">正在加载成分股…</div></div>
          </section>
          <section class="sector-section-card" aria-labelledby="stats-title">
            <div class="section-card-heading"><span class="label-caps">板块统计</span><h2 id="stats-title">总览</h2></div>
            <div id="sector-stats" class="sector-stats"></div>
          </section>
        </div>
      </div>
    </section>
  `;
}

function renderConstituents(stocks) {
  if (!stocks.length) return '<div class="detail-muted">该板块成分股暂无数据</div>';
  const sorted = [...stocks].sort((a, b) => (Number(b.change_percent || 0)) - (Number(a.change_percent || 0)));
  return `<div class="constituents-grid">
    ${sorted.map(s => {
      const pct = Number(s.change_percent || 0);
      const tone = pct >= 0 ? 'up' : 'down';
      return `<button type="button" class="constituent-card" data-ticker="${s.ticker}">
        <div class="constituent-top">
          <strong class="mono">${s.ticker}</strong>
          <span class="mono ${tone}" data-numeric>${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>
        </div>
        <div class="constituent-name">${s.name_cn || s.name || ''}</div>
        <div class="mono constituent-price">$${Number(s.price || 0).toFixed(2)}</div>
      </button>`;
    }).join('')}
  </div>`;
}

function renderSectorStats(sectorName, ivItems, stocks) {
  const totalStocks = stocks.length;
  const advancing = stocks.filter(s => Number(s.change_percent || 0) > 0).length;
  const declining = stocks.filter(s => Number(s.change_percent || 0) < 0).length;
  const avgChange = totalStocks ? stocks.reduce((sum, s) => sum + Number(s.change_percent || 0), 0) / totalStocks : 0;
  const avgIv = ivItems.length ? ivItems.reduce((sum, it) => sum + (Number(it.ivRank) || 0), 0) / ivItems.length : 0;
  const maxGainer = [...stocks].sort((a, b) => (Number(b.change_percent || 0)) - (Number(a.change_percent || 0)))[0];
  const maxLoser  = [...stocks].sort((a, b) => (Number(a.change_percent || 0)) - (Number(b.change_percent || 0)))[0];

  const stat = (label, value, tone = '') => `<div class="sector-stat">
    <span class="label-caps">${label}</span>
    <strong class="mono ${tone}" data-numeric>${value}</strong>
  </div>`;

  const fmtPct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

  return `<div class="sector-stats-grid">
    ${stat('成分股数', totalStocks)}
    ${stat('上涨 / 下跌', `${advancing} / ${declining}`)}
    ${stat('平均涨幅', fmtPct(avgChange), avgChange >= 0 ? 'up' : 'down')}
    ${stat('平均 IV', avgIv.toFixed(1))}
    ${maxGainer ? stat('最强', `${maxGainer.ticker} ${fmtPct(Number(maxGainer.change_percent || 0))}`, 'up') : ''}
    ${maxLoser ? stat('最弱', `${maxLoser.ticker} ${fmtPct(Number(maxLoser.change_percent || 0))}`, 'down') : ''}
  </div>`;
}

async function loadSectorDetail(sectorId, sectorName, watchlistGroups = []) {
  const ivList = document.getElementById('iv-ranking-list');
  const heatmap = document.getElementById('sector-heatmap');
  const constituents = document.getElementById('sector-constituents');
  const stats = document.getElementById('sector-stats');
  const ivTitle = document.getElementById('iv-ranking-title');
  const heatmapTitle = document.getElementById('heatmap-title');
  const constituentsTitle = document.getElementById('constituents-title');
  if (ivTitle) ivTitle.textContent = `${sectorName} · IV 排名`;
  if (heatmapTitle) heatmapTitle.textContent = `${sectorName} · 波动率热力图`;
  if (constituentsTitle) constituentsTitle.textContent = `${sectorName} · 成分股`;
  if (ivList) ivList.innerHTML = '<div class="detail-muted">正在加载 IV 排名…</div>';
  if (heatmap) heatmap.innerHTML = '<div class="detail-muted">正在加载热力图…</div>';
  if (constituents) constituents.innerHTML = '<div class="detail-muted">正在加载成分股…</div>';

  // Find watchlist stocks for this sector (by name match)
  const group = watchlistGroups.find(g => g.name === sectorName);
  const sectorStocks = group?.stocks || [];

  const [ivResult, hmResult] = await Promise.allSettled([
    api.sectorIV(sectorId),
    api.sectorHeatmap(sectorId)
  ]);
  let ivItems = FALLBACK_IV;
  if (ivResult.status === 'fulfilled') {
    const normalized = normalizeIvRanking(ivResult.value, sectorName);
    if (normalized.length) ivItems = normalized;
  }
  if (ivList) ivList.innerHTML = renderIvRanking(ivItems);

  // Backfill avg IV onto the sector card
  if (ivItems.length) {
    const avgIv = ivItems.reduce((sum, it) => sum + (Number(it.ivRank) || 0), 0) / ivItems.length;
    const cardIv = document.querySelector(`[data-sector-iv="${sectorId}"]`);
    if (cardIv) cardIv.textContent = avgIv.toFixed(1);
  }
  const hmPayload = hmResult.status === 'fulfilled' ? hmResult.value : FALLBACK_HEATMAP;
  if (heatmap) heatmap.innerHTML = renderHeatmap(hmPayload);
  if (constituents) constituents.innerHTML = renderConstituents(sectorStocks);
  if (stats) stats.innerHTML = renderSectorStats(sectorName, ivItems, sectorStocks);

  // Wire ticker clicks
  document.querySelectorAll('#iv-ranking-list [data-ticker], #sector-heatmap [data-ticker], #sector-constituents [data-ticker]').forEach((b) => {
    b.addEventListener('click', () => navigateToDetail(b.dataset.ticker));
  });
}

export async function renderSectors() {
  renderShell();
  const sectorGrid = document.getElementById('sector-card-grid');

  let sectors = FALLBACK_SECTORS;
  let sectorList = [];
  let watchlistGroups = [];
  try {
    const [sectorData, watchlistData] = await Promise.all([
      api.sectors(),
      api.watchlist().catch(() => ({ groups: [] }))
    ]);
    sectorList = sectorData?.sectors || [];
    watchlistGroups = watchlistData?.groups || [];
    const rawSectors = normalizeSectors(sectorData);
    if (rawSectors.length) sectors = rawSectors;
  } catch (e) {
    console.warn('Sectors data load error:', e);
  }

  // Compute performance from watchlist groups (matched by sector name)
  const performanceByName = {};
  for (const g of watchlistGroups) {
    const stocks = g.stocks || [];
    if (stocks.length) {
      const avg = stocks.reduce((sum, s) => sum + Number(s.change_percent || 0), 0) / stocks.length;
      performanceByName[g.name] = avg;
    }
  }

  if (sectorGrid) {
    sectorGrid.innerHTML = sectors.map((sector, i) => {
      const id = sectorList[i]?.id || sector.id || '';
      const perf = performanceByName[sector.name] ?? sector.performance ?? 0;
      const ivLabel = Number.isFinite(sector.iv) && sector.iv > 0 ? sector.iv.toFixed(1) : '点击查看';
      return `
        <article class="sector-card" data-sector-id="${id}" data-sector-name="${sector.name}" style="cursor:pointer">
          <div class="sector-card__heading">
            <span class="label-caps">板块</span>
            <strong>${sector.name}</strong>
          </div>
          <div class="sector-card__metrics">
            <span><small class="label-caps">表现</small><b class="mono font-data-mono ${perf >= 0 ? 'up' : 'down'}" data-numeric>${formatPercent(perf)}</b></span>
            <span><small class="label-caps">平均 IV</small><b class="mono font-data-mono" data-sector-iv="${id}" data-numeric>${ivLabel}</b></span>
          </div>
          <div class="sector-tabs">
            ${(sector.leaders.length ? sector.leaders : (sectorList[i]?.tickers || []).slice(0,4)).filter(Boolean).map((t) => `<button class="sector-pill" type="button" data-ticker="${t}">${t}</button>`).join('')}
          </div>
        </article>
      `;
    }).join('');
    // Wire sector card clicks (excluding the sector-pill ticker buttons)
    sectorGrid.querySelectorAll('.sector-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.sector-pill')) return;
        const id = card.dataset.sectorId;
        const name = card.dataset.sectorName;
        if (id) {
          sectorGrid.querySelectorAll('.sector-card').forEach(c => c.classList.remove('is-active'));
          card.classList.add('is-active');
          loadSectorDetail(id, name, watchlistGroups);
        }
      });
    });
  }

  // Load first sector's iv-ranking and heatmap by default
  if (sectorList.length) {
    sectorGrid.querySelector('.sector-card')?.classList.add('is-active');
    await loadSectorDetail(sectorList[0].id, sectorList[0].name, watchlistGroups);
  }

  // Wire ticker pill clicks
  document.querySelectorAll('.sector-pill[data-ticker]').forEach((button) => {
    button.addEventListener('click', () => navigateToDetail(button.dataset.ticker));
  });

  // Wire carousel arrows
  const leftBtn = document.getElementById('sector-arrow-left');
  const rightBtn = document.getElementById('sector-arrow-right');
  const updateArrows = () => {
    if (!sectorGrid) return;
    const maxScroll = sectorGrid.scrollWidth - sectorGrid.clientWidth;
    if (leftBtn) leftBtn.disabled = sectorGrid.scrollLeft <= 4;
    if (rightBtn) rightBtn.disabled = sectorGrid.scrollLeft >= maxScroll - 4;
  };
  const scrollBy = (delta) => sectorGrid?.scrollBy({ left: delta, behavior: 'smooth' });
  leftBtn?.addEventListener('click', () => scrollBy(-sectorGrid.clientWidth * 0.7));
  rightBtn?.addEventListener('click', () => scrollBy(sectorGrid.clientWidth * 0.7));
  sectorGrid?.addEventListener('scroll', updateArrows, { passive: true });
  updateArrows();
}
