import { api } from '../api.js';
import { renderChart } from '../components/chart.js';
import { mountOptionChain } from '../components/optionChain.js';
import { renderSignalPanels } from '../components/signals.js';
import { mountTopBottomAnalysis } from '../components/aiAnalysis.js';

const EXCHANGE_BY_TICKER = {
  AAPL: 'NASDAQ', MSFT: 'NASDAQ', GOOGL: 'NASDAQ', GOOG: 'NASDAQ', AMZN: 'NASDAQ', META: 'NASDAQ', NVDA: 'NASDAQ', AMD: 'NASDAQ', TSLA: 'NASDAQ', NFLX: 'NASDAQ', QQQ: 'NASDAQ',
  JPM: 'NYSE', SPY: 'NYSE', XOM: 'NYSE', CVX: 'NYSE', WMT: 'NYSE', COST: 'NASDAQ'
};

const COMPANY_BY_TICKER = {
  AAPL: 'Apple Inc.', MSFT: 'Microsoft Corp.', GOOGL: 'Alphabet Inc.', GOOG: 'Alphabet Inc.', AMZN: 'Amazon.com Inc.', META: 'Meta Platforms',
  NVDA: 'NVIDIA Corp.', AMD: 'Advanced Micro Devices', TSLA: 'Tesla Inc.', NFLX: 'Netflix Inc.', JPM: 'JPMorgan Chase', SPY: 'SPDR S&P 500 ETF', QQQ: 'Invesco QQQ Trust'
};

const SECTOR_BY_TICKER = {
  AAPL: 'TECH', MSFT: 'TECH', GOOGL: 'TECH', GOOG: 'TECH', META: 'TECH', AMZN: 'TECH', NFLX: 'TECH', NVDA: 'SEMIS', AMD: 'SEMIS', TSLA: 'AUTO', JPM: 'BANKS', SPY: 'ETF', QQQ: 'ETF'
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
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

function normalizeStock(payload, ticker) {
  const source = payload?.stock ?? payload?.data ?? payload ?? {};
  const symbol = String(source.ticker ?? source.symbol ?? ticker).toUpperCase();
  const price = Number(source.price ?? source.last ?? source.lastPrice ?? source.close ?? source.regularMarketPrice);
  const rawChange = source.changePercent ?? source.change_percentage ?? source.changePct ?? source.percentChange ?? source.regularMarketChangePercent ?? source.change;
  const changePercent = Number(rawChange);
  const sector = source.sector ?? source.industry ?? SECTOR_BY_TICKER[symbol] ?? 'EQUITY';
  return {
    ticker: symbol,
    exchange: source.exchange ?? source.market ?? EXCHANGE_BY_TICKER[symbol] ?? 'US',
    companyName: source.companyName ?? source.company_name ?? source.name ?? source.company ?? COMPANY_BY_TICKER[symbol] ?? `${symbol} Holdings`,
    sectorTags: [sector, source.assetClass ?? source.asset_class ?? 'OPTIONS'].filter(Boolean).map((tag) => String(tag).toUpperCase()),
    price,
    changePercent: Number.isFinite(changePercent) ? (Math.abs(changePercent) > 50 && Math.abs(changePercent) < 1000 ? changePercent / 100 : changePercent) : 0
  };
}

function numberFrom(source, keys, fallback = null) {
  for (const key of keys) {
    const value = Number(source?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function normalizeTopBottomSignals(payload = {}, signalsPayload = {}) {
  const source = payload?.topBottomSignals ?? payload?.signals ?? payload?.data ?? payload ?? {};
  const signalSource = signalsPayload?.data ?? signalsPayload?.signals ?? signalsPayload ?? {};
  const bottom = source.bottom ?? source.bottomSignal ?? {};
  const top = source.top ?? source.topSignal ?? {};

  const bottomScore = Math.max(0, Math.min(100, numberFrom(bottom, ['score', 'confidence', 'bottomScore', 'bottom_score'], numberFrom(source, ['bottomScore', 'bottom_score', 'bullishScore', 'supportScore'], 34))));
  const topScore = Math.max(0, Math.min(100, numberFrom(top, ['score', 'confidence', 'topScore', 'top_score'], numberFrom(source, ['topScore', 'top_score', 'bearishScore', 'riskScore', 'resistanceScore'], 66))));

  return {
    bottom: {
      title: bottom.title ?? bottom.label ?? source.bottomLabel ?? 'Potential Bottom Setup',
      score: bottomScore,
      metrics: [
        ['Support', bottom.support ?? source.support ?? signalSource.support ?? 'Near demand zone'],
        ['Momentum', bottom.momentum ?? source.bottomMomentum ?? signalSource.momentum ?? 'Stabilizing'],
        ['Flow', bottom.flow ?? source.callFlow ?? signalSource.callFlow ?? 'Call-side interest']
      ],
      summary: bottom.summary ?? source.bottomSummary ?? signalSource.bottomSummary ?? 'Downside exhaustion and support behavior are monitored for a possible rebound window.'
    },
    top: {
      title: top.title ?? top.label ?? source.topLabel ?? 'Potential Top Risk',
      score: topScore,
      metrics: [
        ['Resistance', top.resistance ?? source.resistance ?? signalSource.resistance ?? 'Supply overhead'],
        ['Momentum', top.momentum ?? source.topMomentum ?? signalSource.momentum ?? 'Extension risk'],
        ['Flow', top.flow ?? source.putFlow ?? signalSource.putFlow ?? 'Put-side hedge watch']
      ],
      summary: top.summary ?? source.topSummary ?? signalSource.topSummary ?? 'Upside extension, resistance and bearish option flow are monitored for reversal risk.'
    }
  };
}

function normalizeExpirations(payload) {
  const expirations = Array.isArray(payload) ? payload : (payload?.expirations ?? payload?.data ?? payload?.dates ?? []);
  return expirations.map((item) => typeof item === 'string' ? item : (item.date ?? item.expiration ?? item.expiry)).filter(Boolean).slice(0, 6);
}

function renderHeader(stock) {
  const isPositive = stock.changePercent >= 0;
  const toneClass = isPositive ? 'positive' : 'negative';
  return `
    <section class="detail-header-card panel" aria-label="${escapeHtml(stock.ticker)} summary">
      <div class="detail-logo" aria-hidden="true">${escapeHtml(stock.ticker[0] ?? '•')}</div>
      <div class="detail-identity">
        <span class="label-caps">${escapeHtml(stock.exchange)}</span>
        <h1>${escapeHtml(stock.companyName)}</h1>
        <div class="detail-meta">
          <strong class="mono font-data-mono" data-numeric>${escapeHtml(stock.ticker)}</strong>
          ${stock.sectorTags.map((tag) => `<span class="sector-tag label-caps">${escapeHtml(tag)}</span>`).join('')}
        </div>
      </div>
      <div class="detail-market-price">
        <span class="detail-price mono font-data-mono" data-numeric>${formatPrice(stock.price)}</span>
        <span class="detail-change mono font-data-mono ${toneClass}" data-numeric>${formatChange(stock.changePercent)}</span>
      </div>
    </section>
  `;
}

function renderSignalPanel(kind, signal) {
  const isBottom = kind === 'bottom';
  const heading = isBottom ? 'BOTTOM SIGNAL ANALYSIS' : 'TOP SIGNAL ANALYSIS';
  const tone = isBottom ? 'bottom' : 'top';
  return `
    <section class="ethos-signal-panel ethos-signal-panel--${tone}" aria-labelledby="${tone}-signal-title">
      <header class="signal-panel-header">
        <span class="signal-theme-dot" aria-hidden="true"></span>
        <div>
          <span class="label-caps">${heading}</span>
          <h3 id="${tone}-signal-title">${escapeHtml(signal.title)}</h3>
        </div>
        <strong class="signal-score mono font-data-mono" data-numeric>${signal.score.toFixed(0)}</strong>
      </header>
      <div class="signal-metric-list">
        ${signal.metrics.map(([label, value]) => `
          <div class="signal-metric-row">
            <span class="label-caps">${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `).join('')}
      </div>
      <p class="signal-intelligence-copy">${escapeHtml(signal.summary)}</p>
    </section>
  `;
}

function renderExpirations(expirations) {
  if (!expirations.length) return '<p class="detail-muted">期权到期日将在下一阶段接入。</p>';
  return `<div class="expiration-list">${expirations.map((date) => `<span class="mono font-data-mono">${escapeHtml(date)}</span>`).join('')}</div>`;
}

function renderSkeleton(ticker) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <section class="detail-page" aria-labelledby="detail-title">
      <nav class="detail-breadcrumb" aria-label="Breadcrumb">
        <a href="#watchlist" data-back-breadcrumb>← 返回终端</a>
        <span class="mono font-data-mono">/ ${escapeHtml(ticker)}</span>
      </nav>
      <div class="panel detail-loading">Loading ${escapeHtml(ticker)} market detail…</div>
    </section>
  `;
}

function renderError(ticker, error) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <section class="detail-page" aria-labelledby="detail-title">
      <nav class="detail-breadcrumb" aria-label="Breadcrumb">
        <a href="#watchlist" data-back-breadcrumb>← 返回终端</a>
        <span class="mono font-data-mono">/ ${escapeHtml(ticker)}</span>
      </nav>
      <section class="panel detail-error">
        <span class="label-caps">Detail Load Error</span>
        <h1 id="detail-title">${escapeHtml(ticker)}</h1>
        <p>${escapeHtml(error?.message ?? 'Unable to load detail data.')}</p>
      </section>
    </section>
  `;
}

function bindBackBreadcrumb() {
  document.querySelectorAll('[data-back-breadcrumb]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.hash = '#watchlist';
    });
  });
}

export async function mountDetail(tickerFromRoute) {
  const ticker = String(tickerFromRoute || '').trim().toUpperCase();
  if (!ticker) {
    window.location.hash = '#watchlist';
    return;
  }

  renderSkeleton(ticker);
  bindBackBreadcrumb();

  try {
    const [stockResult, chartResult, signalsResult, topBottomSignalsResult, expirationsResult] = await Promise.allSettled([
      api.stock(ticker),
      api.chart(ticker, '1d'),
      api.signals(ticker),
      api.topBottomSignals(ticker),
      api.expirations(ticker)
    ]);

    if (stockResult.status === 'rejected') {
      console.warn(`api.stock(${ticker}) failed; rendering route with ticker fallback.`, stockResult.reason);
    }

    const stock = normalizeStock(stockResult.status === 'fulfilled' ? stockResult.value : {}, ticker);
    const chartPayload = chartResult.status === 'fulfilled' ? chartResult.value : null;
    const signalsPayload = signalsResult.status === 'fulfilled' ? signalsResult.value : {};
    const topBottomPayload = topBottomSignalsResult.status === 'fulfilled' ? topBottomSignalsResult.value : {};
    const topBottom = normalizeTopBottomSignals(topBottomPayload, signalsPayload);
    const expirations = expirationsResult.status === 'fulfilled' ? normalizeExpirations(expirationsResult.value) : [];

    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = `
      <section class="detail-page" aria-labelledby="detail-title">
        <nav class="detail-breadcrumb" aria-label="Breadcrumb">
          <a href="#watchlist" data-back-breadcrumb>← 返回终端</a>
          <span class="mono font-data-mono">/ ${escapeHtml(stock.ticker)}</span>
        </nav>

        <div class="detail-grid detail-grid--12">
          <div class="detail-main-column">
            ${renderHeader(stock)}
            <section class="detail-chart-card panel" aria-labelledby="detail-title">
              <div class="detail-section-heading">
                <div>
                  <span class="label-caps">PRICE ACTION</span>
                  <h2 id="detail-title">${escapeHtml(stock.ticker)} Chart</h2>
                </div>
              </div>
              <div id="detail-tradingview-chart" data-detail-chart></div>
            </section>
          </div>

          <aside class="detail-signals-card" aria-label="Signal analysis">
            ${renderSignalPanel('bottom', topBottom.bottom)}
            ${renderSignalPanel('top', topBottom.top)}
            <div id="detail-ai-analysis" class="detail-ai-analysis-slot"></div>
          </aside>

          <section class="detail-bottom-section panel" aria-label="Option chain and technical signals">
            <div class="detail-section-heading">
              <div>
                <span class="label-caps">OPTION CHAIN / TECHNICAL SIGNALS</span>
                <h2>期权链与技术信号</h2>
              </div>
            </div>
            <div class="detail-bottom-grid">
              <div id="detail-option-chain" class="detail-option-chain-slot"></div>
              <section class="detail-technical-signals" aria-labelledby="detail-technical-signals-title">
                <div class="detail-section-heading detail-section-heading--compact">
                  <div>
                    <span class="label-caps">TECHNICAL SIGNALS</span>
                    <h3 id="detail-technical-signals-title">信号指标网格</h3>
                  </div>
                </div>
                ${renderSignalPanels(signalsPayload)}
                <section class="detail-expirations">
                  <span class="label-caps">Option Expirations</span>
                  ${renderExpirations(expirations)}
                </section>
              </section>
            </div>
          </section>
        </div>
      </section>
    `;

    bindBackBreadcrumb();
    const chartContainer = document.getElementById('detail-tradingview-chart');
    await renderChart(chartContainer, stock.ticker, '1d', chartPayload);
    mountOptionChain(document.getElementById('detail-option-chain'), stock.ticker, expirations);
    mountTopBottomAnalysis(document.getElementById('detail-ai-analysis'), stock.ticker, topBottomPayload);
    app.focus({ preventScroll: true });
  } catch (error) {
    console.error(`Failed to render detail page for ${ticker}`, error);
    renderError(ticker, error);
    bindBackBreadcrumb();
  }
}

export const renderDetail = mountDetail;
