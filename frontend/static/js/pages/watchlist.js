import { api } from '../api.js';
import { renderHeatmap } from '../components/heatmap.js';

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

const FALLBACK_WATCHLIST = [
  { ticker: 'AAPL', companyName: 'Apple Inc.', sector: 'TECH', price: 195.64, changePercent: 0.84, spark: [191.2, 192.4, 191.8, 193.6, 194.2, 194.8, 195.64], signalSummary: 'Momentum firming into product cycle.' },
  { ticker: 'NVDA', companyName: 'NVIDIA Corp.', sector: 'SEMIS', price: 121.79, changePercent: 1.72, spark: [115.1, 116.8, 118.2, 117.9, 120.3, 119.7, 121.79], signalSummary: 'Bullish volatility regime remains intact.' },
  { ticker: 'TSLA', companyName: 'Tesla Inc.', sector: 'AUTO', price: 177.48, changePercent: -1.12, spark: [184.1, 182.6, 181.9, 179.4, 180.2, 178.1, 177.48], signalSummary: 'Bearish pressure near short-term support.' }
];

const FALLBACK_HEATMAP = [
  { ticker: 'AAPL', label: 'Apple Inc.', changePercent: 0.84, weight: 2.4 },
  { ticker: 'NVDA', label: 'NVIDIA Corp.', changePercent: 1.72, weight: 2.8 },
  { ticker: 'MSFT', label: 'Microsoft Corp.', changePercent: 0.38, weight: 2.2 },
  { ticker: 'TSLA', label: 'Tesla Inc.', changePercent: -1.12, weight: 1.8 },
  { ticker: 'JPM', label: 'JPMorgan Chase', changePercent: -0.42, weight: 1.3 },
  { ticker: 'XOM', label: 'Exxon Mobil', changePercent: 0.21, weight: 1.1 }
];

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
    companyName: stock.companyName ?? stock.company_name ?? stock.name ?? stock.company ?? COMPANY_BY_TICKER[ticker] ?? '上市公司',
    sector: String(stock.sector ?? stock.industry ?? SECTOR_BY_TICKER[ticker] ?? 'WATCH').toUpperCase(),
    price,
    changePercent,
    spark: spark.length ? spark : [price * 0.98, price * 0.99, price * 0.985, price * 1.005, price * 1.01, price * 1.004, price].filter(Number.isFinite),
    signalSummary: stock.signalSummary ?? stock.signal_summary ?? stock.signal ?? stock.summary ?? ''
  };
}

function normalizeWatchlistPayload(payload) {
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

function renderStockCard(stock) {
  const isPositive = stock.changePercent >= 0;
  const toneClass = isPositive ? 'positive' : 'negative';
  return `
    <button class="stock-card" type="button" data-ticker="${escapeHtml(stock.ticker)}" aria-label="打开 ${escapeHtml(stock.ticker)} 详情">
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
    </button>
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
          <h1 id="terminal-title">Intelligence Terminal</h1>
          <p>信号分析与波动率监控</p>
        </div>
        <div class="terminal-status panel">
          <span class="label-caps">市场状态</span>
          <strong>美股时段</strong>
          <em class="up mono font-data-mono" data-numeric>开盘 · 实时</em>
        </div>
      </header>
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

export async function renderWatchlist() {
  renderWatchlistShell(true);
  const grid = document.getElementById('watchlist-grid');
  const heatmap = document.getElementById('terminal-heatmap');
  try {
    const [watchlistResult, heatmapResult] = await Promise.allSettled([
      api.watchlist(),
      api.heatmap()
    ]);

    if (watchlistResult.status !== 'fulfilled') throw watchlistResult.reason;
    const stocks = normalizeWatchlistPayload(watchlistResult.value);
    if (!stocks.length) throw new Error('Watchlist API returned no stocks');
    grid.innerHTML = stocks.map(renderStockCard).join('');

    const heatmapPayload = heatmapResult.status === 'fulfilled' ? heatmapResult.value : FALLBACK_HEATMAP;
    if (heatmap) heatmap.innerHTML = renderHeatmap(heatmapPayload);
  } catch (error) {
    console.warn('api.watchlist() failed; rendering fallback watchlist cards.', error);
    grid.innerHTML = FALLBACK_WATCHLIST.map(normalizeStock).map(renderStockCard).join('');
    if (heatmap) heatmap.innerHTML = renderHeatmap(FALLBACK_HEATMAP);
  }
  grid.classList.remove('is-loading');
  bindStockCardNavigation();
  bindHeatmapNavigation();
}
