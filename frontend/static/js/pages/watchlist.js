import { api } from '../api.js';
import { renderHeatmap } from '../components/heatmap.js';
import { renderMarketStatus } from '../components/marketStatus.js';
import {
  getCustomTickers, initCustomFromBackend, applyCustomOrder,
  addTicker, removeTicker, moveTicker, saveCustomTickers
} from '../components/customWatchlist.js';

const SECTOR_BY_TICKER = {
  AAPL: 'TECH', MSFT: 'TECH', GOOGL: 'TECH', GOOG: 'TECH', META: 'TECH', AMZN: 'TECH', NFLX: 'TECH', CRM: 'TECH', ORCL: 'TECH', ADBE: 'TECH',
  NVDA: 'SEMIS', AMD: 'SEMIS', INTC: 'SEMIS', AVGO: 'SEMIS', TSM: 'SEMIS', ASML: 'SEMIS', QCOM: 'SEMIS', MU: 'SEMIS', ARM: 'SEMIS',
  TSLA: 'AUTO', F: 'AUTO', GM: 'AUTO', RIVN: 'AUTO', NIO: 'AUTO', LI: 'AUTO', XPEV: 'AUTO',
  JPM: 'BANKS', BAC: 'BANKS', WFC: 'BANKS', GS: 'BANKS', MS: 'BANKS', C: 'BANKS', V: 'FINTECH', MA: 'FINTECH', PYPL: 'FINTECH',
  XOM: 'ENERGY', CVX: 'ENERGY', COP: 'ENERGY', SLB: 'ENERGY',
  JNJ: 'HEALTH', UNH: 'HEALTH', PFE: 'HEALTH', MRK: 'HEALTH', LLY: 'HEALTH', ABBV: 'HEALTH',
  WMT: 'RETAIL', COST: 'RETAIL', HD: 'RETAIL', NKE: 'RETAIL', SBUX: 'RETAIL',
  SPY: 'ETF', QQQ: 'ETF', IWM: 'ETF', DIA: 'ETF'
};

const COMPANY_BY_TICKER = {
  AAPL: 'Apple Inc.', MSFT: 'Microsoft Corp.', GOOGL: 'Alphabet Inc.', GOOG: 'Alphabet Inc.', AMZN: 'Amazon.com Inc.', META: 'Meta Platforms',
  NVDA: 'NVIDIA Corp.', AMD: 'Advanced Micro Devices', TSLA: 'Tesla Inc.', NFLX: 'Netflix Inc.', JPM: 'JPMorgan Chase', SPY: 'SPDR S&P 500 ETF', QQQ: 'Invesco QQQ Trust'
};

// Note: Real prices only. No fallback fake data — showing wrong prices in a
// financial tool is worse than showing nothing.

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

function formatPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `$${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatChange(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const sign = number > 0 ? '+' : '';
  return `${sign}${number.toFixed(2)}%`;
}

function normalizeSpark(stock) {
  const spark = stock.spark ?? stock.sparkline ?? stock.spark7d ?? stock.spark_7d ?? stock.sparkData ?? stock.prices7d ?? stock.sevenDaySpark;
  if (Array.isArray(spark)) {
    return spark.map((point) => Number(typeof point === 'object' ? (point.price ?? point.close ?? point.value ?? point.y) : point)).filter(Number.isFinite);
  }
  return [];
}

function getChangePercent(stock, spark) {
  const raw = stock.changePercent ?? stock.change_percentage ?? stock.changePct ?? stock.change_pct ?? stock.percentChange ?? stock.change_percent ?? stock.change;
  const number = Number(raw);
  if (Number.isFinite(number)) return Math.abs(number) > 50 && Math.abs(number) < 1000 ? number / 100 : number;
  if (spark.length >= 2 && spark[0] !== 0) return ((spark[spark.length - 1] - spark[0]) / spark[0]) * 100;
  return 0;
}

function normalizeStock(stock) {
  const ticker = String(stock.ticker ?? stock.symbol ?? stock.code ?? '').toUpperCase();
  const spark = normalizeSpark(stock);
  const latestSpark = spark.length ? spark[spark.length - 1] : undefined;
  const price = Number(stock.price ?? stock.last ?? stock.lastPrice ?? stock.close ?? latestSpark);
  const changePercent = getChangePercent(stock, spark);
  return {
    ticker,
    companyName: stock.companyName ?? stock.company_name ?? stock.name_cn ?? stock.name ?? stock.company ?? COMPANY_BY_TICKER[ticker] ?? '上市公司',
    sector: String(stock.sector ?? stock.industry ?? stock._groupName ?? SECTOR_BY_TICKER[ticker] ?? 'WATCH').toUpperCase(),
    price,
    changePercent,
    // Real backend data only. Empty array means "no sparkline available" —
    // the card renderer should handle that gracefully (don't fake a fake curve).
    spark: spark.length ? spark : [],
    signalSummary: stock.signalSummary ?? stock.signal_summary ?? stock.signal ?? stock.summary ?? ''
  };
}

function normalizeWatchlistPayload(payload) {
  // API returns {groups: [{id, name, stocks: [{ticker, name, price, change_percent}]}]}
  if (payload?.groups && Array.isArray(payload.groups)) {
    const all = [];
    for (const group of payload.groups) {
      const sectorName = group.name || '';
      for (const s of (group.stocks || [])) {
        s._groupName = sectorName;
        all.push(s);
      }
    }
    return all.map(normalizeStock).filter((stock) => stock.ticker);
  }
  const items = Array.isArray(payload) ? payload : (payload?.watchlist ?? payload?.items ?? payload?.data ?? payload?.stocks ?? []);
  return items.map(normalizeStock).filter((stock) => stock.ticker);
}

function renderSparkline(points, isPositive) {
  if (!points.length) return '<svg class="sparkline" viewBox="0 0 120 36" role="img" aria-label="No sparkline data"></svg>';
  const width = 120;
  const height = 36;
  const padding = 3;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const d = points.map((value, index) => {
    const x = index * step;
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  const color = isPositive ? '#059669' : '#ba1a1a';
  return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="7-day price sparkline" data-spark="7-day">
      <path d="${d} L ${width} ${height} L 0 ${height} Z" fill="${color}" opacity="0.08"></path>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  `;
}

function renderStockCard(stock, editMode = false) {
  const isPositive = stock.changePercent >= 0;
  const toneClass = isPositive ? 'positive' : 'negative';
  const editControls = editMode ? `
      <div class="stock-card__edit-controls">
        <button type="button" class="card-edit-btn" data-edit-action="left" data-ticker="${escapeHtml(stock.ticker)}" aria-label="向前移动" title="向前">
          <span class="material-symbols-outlined">chevron_left</span>
        </button>
        <button type="button" class="card-edit-btn card-edit-btn--remove" data-edit-action="remove" data-ticker="${escapeHtml(stock.ticker)}" aria-label="移除" title="移除">
          <span class="material-symbols-outlined">close</span>
        </button>
        <button type="button" class="card-edit-btn" data-edit-action="right" data-ticker="${escapeHtml(stock.ticker)}" aria-label="向后移动" title="向后">
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </div>` : '';
  const cardTag = editMode ? 'div' : 'button';
  const cardAttrs = editMode
    ? `class="stock-card stock-card--editing" data-ticker="${escapeHtml(stock.ticker)}"`
    : `class="stock-card" type="button" data-ticker="${escapeHtml(stock.ticker)}" aria-label="打开 ${escapeHtml(stock.ticker)} 详情"`;
  return `
    <${cardTag} ${cardAttrs}>
      ${editControls}
      <div class="stock-card__topline">
        <span class="sector-tag label-caps">${escapeHtml(stock.sector)}</span>
        <span class="signal-dot ${toneClass}" aria-hidden="true"></span>
      </div>
      <div class="stock-card__identity">
        <strong class="stock-ticker">${escapeHtml(stock.ticker)}</strong>
        <span class="company-name">${escapeHtml(stock.companyName)}</span>
      </div>
      <div class="stock-card__market">
        <span class="stock-price mono font-data-mono" data-numeric>${formatPrice(stock.price)}</span>
        <span class="stock-change mono font-data-mono ${toneClass}" data-numeric>${formatChange(stock.changePercent)}</span>
      </div>
      ${renderSparkline(stock.spark, isPositive)}
      ${stock.signalSummary ? `<p class="signal-summary">${escapeHtml(stock.signalSummary)}</p>` : ''}
    </${cardTag}>
  `;
}

function bindStockCardNavigation() {
  document.querySelectorAll('.stock-card[data-ticker]').forEach((card) => {
    card.addEventListener('click', () => {
      const ticker = card.dataset.ticker;
      if (!ticker) return;
      window.location.hash = `#detail/${encodeURIComponent(ticker)}`;
    });
  });
}

function bindHeatmapNavigation() {
  document.querySelectorAll('.terminal-heatmap .heatmap-tile[data-ticker]').forEach((tile) => {
    tile.addEventListener('click', () => {
      const ticker = tile.dataset.ticker;
      if (!ticker) return;
      window.location.hash = `#detail/${encodeURIComponent(ticker)}`;
    });
  });
}

function renderWatchlistShell(isLoading = false) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <section class="terminal-page" aria-labelledby="terminal-title">
      <header class="terminal-header">
        <div>
          <span class="label-caps">自选</span>
          <h1 id="terminal-title">Signal Deck</h1>
          <p>信号分析与波动率监控 · 自定义自选已存储在本机</p>
        </div>
        <div class="terminal-header-right">
          <div id="market-status-panel" class="market-status-panel"></div>
          <button id="watchlist-edit-btn" type="button" class="watchlist-edit-btn">
            <span class="material-symbols-outlined">edit</span> 编辑
          </button>
        </div>
      </header>
      <div id="watchlist-add-bar" class="watchlist-add-bar" hidden>
        <input type="text" id="watchlist-add-input" placeholder="输入代码（如 NVDA），回车添加" autocomplete="off" />
        <button type="button" id="watchlist-add-btn">添加</button>
        <button type="button" id="watchlist-reset-btn" class="watchlist-reset-btn" title="重置为默认自选">重置默认</button>
      </div>
      <div class="terminal-layout">
        <div>
          <div id="watchlist-grid" class="watchlist-grid ${isLoading ? 'is-loading' : ''}">
            ${isLoading ? '<div class="panel loading-card">正在加载智能卡片…</div>' : ''}
          </div>
        </div>
        <aside class="terminal-sidebar" aria-label="市场智能侧栏">
          <section class="terminal-panel panel">
            <span class="label-caps">即将财报</span>
            <ul>
              <li><strong>NVDA</strong><span class="mono font-data-mono" data-numeric>T+2</span></li>
              <li><strong>ADBE</strong><span class="mono font-data-mono" data-numeric>T+5</span></li>
              <li><strong>TSLA</strong><span class="mono font-data-mono" data-numeric>T+8</span></li>
            </ul>
          </section>
          <section class="terminal-panel panel">
            <span class="label-caps">板块 IV 概览</span>
            <ul>
              <li><strong>SEMIS</strong><span class="up mono font-data-mono" data-numeric>42.1</span></li>
              <li><strong>TECH</strong><span class="mono font-data-mono" data-numeric>28.7</span></li>
              <li><strong>AUTO</strong><span class="down mono font-data-mono" data-numeric>51.4</span></li>
            </ul>
          </section>
        </aside>
      </div>
      <section class="terminal-heatmap panel" aria-labelledby="terminal-heatmap-title">
        <div class="section-card-heading">
          <span class="label-caps">波动率热力图</span>
          <h2 id="terminal-heatmap-title">波动率热力图</h2>
        </div>
        <div id="terminal-heatmap" class="terminal-heatmap__body">
          ${isLoading ? '<div class="detail-muted">正在加载波动率热力图…</div>' : ''}
        </div>
      </section>
    </section>
  `;
}

// Cache the latest backend data so we can re-render quickly when entering edit mode
let __watchlistState = { backendStocks: [], heatmapData: [] };
let __editMode = false;

async function fetchAndCacheBackend() {
  try {
    const payload = await api.watchlist();
    const groups = payload?.groups || [];
    // Initialize custom from backend on first visit
    initCustomFromBackend(groups);
    const stocks = normalizeWatchlistPayload(payload);
    __watchlistState.backendStocks = stocks;
    __watchlistState.heatmapData = stocks.slice(0, 20).map(s => ({
      ticker: s.ticker, label: s.companyName, changePercent: s.changePercent, weight: 1 + Math.abs(s.changePercent) / 2
    }));
    return stocks;
  } catch (e) {
    console.warn('api.watchlist() failed; showing empty state.', e);
    __watchlistState.backendStocks = [];
    __watchlistState.heatmapData = [];
    __watchlistState.fetchError = e.message || 'API unavailable';
    return [];
  }
}

function renderCardsFromCustom() {
  const grid = document.getElementById('watchlist-grid');
  if (!grid) return;
  const customTickers = getCustomTickers() || __watchlistState.backendStocks.map(s => s.ticker);
  const ordered = applyCustomOrder(__watchlistState.backendStocks, customTickers).map(s => {
    if (s._placeholder) {
      return normalizeStock({
        ticker: s.ticker, price: 0, change_percent: 0, name: s.ticker, sector: 'CUSTOM'
      });
    }
    return s;
  });
  if (!ordered.length) {
    const msg = __watchlistState.fetchError
      ? `<div class="detail-muted" style="padding:32px;text-align:center"><strong style="display:block;margin-bottom:6px;color:var(--color-crimson)">数据暂不可用</strong>API 返回失败 · 请稍后刷新</div>`
      : '<div class="detail-muted" style="padding:32px;text-align:center">自选列表为空 · 点击右上角「编辑」添加代码</div>';
    grid.innerHTML = msg;
    return;
  }
  grid.innerHTML = ordered.map((s) => renderStockCard(s, __editMode)).join('');
  bindCardEvents();
}

function bindCardEvents() {
  document.querySelectorAll('.stock-card[data-ticker]').forEach((card) => {
    card.addEventListener('click', (e) => {
      // Don't navigate when clicking edit buttons
      if (e.target.closest('[data-edit-action]')) return;
      if (__editMode) return;
      const ticker = card.dataset.ticker;
      if (ticker) window.location.hash = `#detail/${encodeURIComponent(ticker)}`;
    });
  });
  document.querySelectorAll('[data-edit-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.editAction;
      const ticker = btn.dataset.ticker;
      if (!ticker) return;
      if (action === 'remove') removeTicker(ticker);
      else if (action === 'left') moveTicker(ticker, 'left');
      else if (action === 'right') moveTicker(ticker, 'right');
      renderCardsFromCustom();
    });
  });
}

function bindEditToolbar() {
  const editBtn = document.getElementById('watchlist-edit-btn');
  const addBar = document.getElementById('watchlist-add-bar');
  const addInput = document.getElementById('watchlist-add-input');
  const addBtn = document.getElementById('watchlist-add-btn');
  const resetBtn = document.getElementById('watchlist-reset-btn');

  const setEdit = (on) => {
    __editMode = on;
    if (editBtn) editBtn.innerHTML = on
      ? '<span class="material-symbols-outlined">check</span> 完成'
      : '<span class="material-symbols-outlined">edit</span> 编辑';
    editBtn?.classList.toggle('is-active', on);
    if (addBar) addBar.hidden = !on;
    renderCardsFromCustom();
  };

  editBtn?.addEventListener('click', () => setEdit(!__editMode));

  const handleAdd = () => {
    const v = (addInput?.value || '').trim().toUpperCase();
    if (!v) return;
    addTicker(v);
    addInput.value = '';
    renderCardsFromCustom();
    // Try fetching the new ticker's data and re-render to fill placeholder
    api.stock(v).then(data => {
      const existing = __watchlistState.backendStocks.find(s => s.ticker === v);
      if (!existing && data) {
        __watchlistState.backendStocks.push(normalizeStock({
          ticker: v, name: data.name, price: data.price, change_percent: data.change_percent
        }));
        renderCardsFromCustom();
      }
    }).catch(() => {});
  };
  addBtn?.addEventListener('click', handleAdd);
  addInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAdd(); });

  resetBtn?.addEventListener('click', () => {
    if (!confirm('确认重置为默认自选？当前自定义将被覆盖。')) return;
    localStorage.removeItem('optix.watchlist.custom.v1');
    initCustomFromBackend(__watchlistState.backendStocks.map(s => ({ stocks: [s] })));
    renderCardsFromCustom();
  });
}

export async function renderWatchlist() {
  renderWatchlistShell(true);
  renderMarketStatus(document.getElementById('market-status-panel'));
  const grid = document.getElementById('watchlist-grid');
  const heatmap = document.getElementById('terminal-heatmap');

  await fetchAndCacheBackend();
  renderCardsFromCustom();
  if (heatmap) heatmap.innerHTML = renderHeatmap(__watchlistState.heatmapData);
  grid.classList.remove('is-loading');
  bindHeatmapNavigation();
  bindEditToolbar();
}
