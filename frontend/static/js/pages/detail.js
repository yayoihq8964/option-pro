import { api, safe } from '../api.js';
import { renderChart } from '../components/chart.js';
import { mountOptionChain } from '../components/optionChain.js';

const EXCHANGE_BY_TICKER = { AAPL:'NASDAQ', MSFT:'NASDAQ', GOOGL:'NASDAQ', GOOG:'NASDAQ', AMZN:'NASDAQ', META:'NASDAQ', NVDA:'NASDAQ', AMD:'NASDAQ', TSLA:'NASDAQ', NFLX:'NASDAQ', QQQ:'NASDAQ', JPM:'NYSE', SPY:'NYSE', XOM:'NYSE' };
const COMPANY_BY_TICKER = { AAPL:'Apple Inc.', MSFT:'Microsoft Corp.', GOOGL:'Alphabet Inc.', GOOG:'Alphabet Inc.', AMZN:'Amazon.com Inc.', META:'Meta Platforms', NVDA:'NVIDIA Corp.', AMD:'Advanced Micro Devices', TSLA:'Tesla Inc.', NFLX:'Netflix Inc.', JPM:'JPMorgan Chase', SPY:'SPDR S&P 500 ETF', QQQ:'Invesco QQQ Trust' };
const SECTOR_BY_TICKER = { AAPL:'TECH', MSFT:'TECH', GOOGL:'TECH', GOOG:'TECH', META:'TECH', AMZN:'TECH', NFLX:'TECH', NVDA:'SEMICONDUCTORS', AMD:'SEMICONDUCTORS', TSLA:'AUTO', JPM:'BANKS', SPY:'ETF', QQQ:'ETF' };
const TIMEFRAMES = [ ['5m','5分'], ['15m','15分'], ['1h','1时'], ['1d','日K'], ['1w','周K'] ];

function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[c]); }
function fmtPrice(value) { const n = Number(value); return Number.isFinite(n) ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'; }
function fmtPct(value) { const n = Number(value); return Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(2)}%` : '—'; }
function first(source, keys, fallback = '—') { for (const k of keys) if (source?.[k] !== undefined && source?.[k] !== null && source?.[k] !== '') return source[k]; return fallback; }
function num(source, keys, fallback = 0) { for (const k of keys) { const n = Number(source?.[k]); if (Number.isFinite(n)) return n; } return fallback; }

function normalizeStock(payload, ticker) {
  const source = payload?.stock ?? payload?.data ?? payload ?? {};
  const symbol = String(source.ticker ?? source.symbol ?? ticker).toUpperCase();
  const rawChange = source.changePercent ?? source.change_percentage ?? source.changePct ?? source.percentChange ?? source.regularMarketChangePercent ?? source.change;
  const change = Number(rawChange);
  const sector = source.sector ?? source.industry ?? SECTOR_BY_TICKER[symbol] ?? 'EQUITY';
  return {
    ticker: symbol,
    exchange: source.exchange ?? source.market ?? EXCHANGE_BY_TICKER[symbol] ?? 'NASDAQ',
    name: source.companyName ?? source.company_name ?? source.name ?? source.company ?? COMPANY_BY_TICKER[symbol] ?? `${symbol} Corp.`,
    sector,
    price: Number(source.price ?? source.last ?? source.lastPrice ?? source.close ?? source.regularMarketPrice),
    change: Number.isFinite(change) ? (Math.abs(change) > 50 && Math.abs(change) < 1000 ? change / 100 : change) : 0
  };
}

function normalizeTopBottom(payload = {}, signalsPayload = {}) {
  const source = payload?.topBottomSignals ?? payload?.signals ?? payload?.data ?? payload ?? {};
  const sig = signalsPayload?.data ?? signalsPayload?.signals ?? signalsPayload ?? {};
  const bottom = source.bottom ?? source.bottomSignal ?? {};
  const top = source.top ?? source.topSignal ?? {};
  return {
    bottom: {
      score: Math.max(0, Math.min(100, num(bottom, ['score','confidence','bottomScore','bottom_score'], num(source, ['bottomScore','bottom_score','bullishScore','supportScore'], 34)))),
      factors: [
        ['支撑区间', first(bottom, ['support','supportZone','support_zone'], first(source, ['support','supportZone'], first(sig, ['support'], '接近需求支撑区'))],
        ['成交量 / 资金流', first(bottom, ['volume','flow','volumeProfile'], first(source, ['volumeProfile','callFlow'], '量能开始企稳'))],
        ['智能摘要', first(bottom, ['summary','thesis'], first(source, ['bottomSummary'], '下行动能衰竭与支撑行为构成潜在反弹窗口'))]
      ]
    },
    top: {
      score: Math.max(0, Math.min(100, num(top, ['score','confidence','topScore','top_score'], num(source, ['topScore','top_score','bearishScore','riskScore'], 66)))),
      factors: [
        ['阻力区间', first(top, ['resistance','resistanceZone','resistance_zone'], first(source, ['resistance','resistanceZone'], '上方供给区仍需确认'))],
        ['IV / OI 数据', first(top, ['iv','openInterest','flow'], first(source, ['iv','openInterest'], '隐含波动率与持仓集中度偏高'))],
        ['风险文本', first(top, ['risk','summary','riskAssessment'], first(source, ['topSummary'], '突破失败后可能触发对冲需求与回撤风险'))]
      ]
    }
  };
}

function normalizeSignals(payload = {}) {
  const s = payload?.signals ?? payload?.data ?? payload ?? {};
  const items = [
    ['RSI', first(s, ['rsi','RSI'], 54.2)], ['MACD', first(s, ['macd','MACD'], 'Neutral')], ['SMA', first(s, ['sma','sma50','SMA'], 'Above')],
    ['ATR', first(s, ['atr','ATR'], 2.18)], ['Vol', first(s, ['volume','vol','relativeVolume'], '1.2x')], ['RelStr', first(s, ['relativeStrength','relStr'], 'Firm')], ['IV', first(s, ['iv','impliedVolatility','ivRank'], 42.1)]
  ];
  return items;
}

function normalizeExpirations(payload) { return (Array.isArray(payload) ? payload : (payload?.expirations ?? payload?.data ?? payload?.dates ?? [])).map((x) => typeof x === 'string' ? x : (x.date ?? x.expiration ?? x.expiry)).filter(Boolean).slice(0, 8); }

function renderSignalPanel(kind, signal) {
  const isBottom = kind === 'bottom';
  return `<section class="detail-signal-panel detail-signal-panel--${kind}">
    <header><span class="signal-theme-dot"></span><span class="label-caps">${isBottom ? '底部信号分析' : '顶部信号分析'}</span><strong class="mono" data-numeric>${signal.score.toFixed(0)}</strong></header>
    <div class="signal-score-bar"><span style="width:${signal.score}%"></span></div>
    <div class="signal-metric-list">${signal.factors.map(([l,v]) => `<div class="signal-metric-row"><span class="label-caps">${escapeHtml(l)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}</div>
  </section>`;
}

function renderTechnicalSignals(items) {
  return `<section class="technical-signals-card"><div class="section-card-heading"><span class="label-caps">Technical Signals</span><h2>技术信号</h2></div><div class="technical-signal-grid">${items.map(([l,v]) => `<article class="technical-signal-mini"><span class="label-caps">${escapeHtml(l)}</span><strong class="mono" data-numeric>${escapeHtml(v)}</strong></article>`).join('')}</div></section>`;
}

function renderPage(stock, topBottom, signals) {
  const positive = stock.change >= 0;
  return `<section class="detail-page" aria-labelledby="detail-title">
    <nav class="detail-breadcrumb" aria-label="Breadcrumb"><a href="#watchlist" data-back-breadcrumb>← 返回终端</a><span class="mono">/ ${escapeHtml(stock.ticker)}:${escapeHtml(stock.exchange)}</span></nav>
    <div class="detail-hero-grid">
      <section class="detail-primary-card panel">
        <header class="detail-stock-header"><div class="detail-logo">${escapeHtml(stock.ticker[0])}</div><div><h1 id="detail-title">${escapeHtml(stock.name)} <span>${escapeHtml(stock.ticker)}</span></h1><p>${escapeHtml(stock.sector)} • Tech</p></div><div class="detail-market-price"><strong class="mono">${fmtPrice(stock.price)}</strong><span class="mono ${positive ? 'up' : 'down'}">${fmtPct(stock.change)}</span></div></header>
        <div id="detail-chart-tabs" class="ethos-timeframe-row">${TIMEFRAMES.map(([r,l], i) => `<button class="ethos-timeframe-button ${i===3?'active':''}" type="button" data-range="${r}">${l}</button>`).join('')}</div>
        <div id="detail-tradingview-chart" class="detail-chart-box" data-detail-chart></div>
      </section>
      <aside class="detail-signal-column">${renderSignalPanel('bottom', topBottom.bottom)}${renderSignalPanel('top', topBottom.top)}</aside>
    </div>
    ${renderTechnicalSignals(signals)}
    <section class="ai-analysis-panel panel detail-ai-card"><div class="ai-analysis-copy"><span class="label-caps">AI Analysis</span><h3>智能信号解读</h3><p>使用当前价格、技术信号与顶部/底部模型生成简洁分析。</p></div><button class="ai-analysis-button" type="button" data-ai-detail>运行 AI 分析</button><div class="ai-analysis-results" data-ai-detail-results></div></section>
    <div id="detail-option-chain" class="detail-option-chain-slot"></div>
  </section>`;
}

function bindBack() { document.querySelectorAll('[data-back-breadcrumb]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); location.hash = '#watchlist'; })); }
function renderLoading(ticker) { document.getElementById('app').innerHTML = `<section class="detail-page"><nav class="detail-breadcrumb"><a href="#watchlist" data-back-breadcrumb>← 返回终端</a><span class="mono">/ ${escapeHtml(ticker)}</span></nav><div class="panel detail-loading">正在加载 ${escapeHtml(ticker)} 详情…</div></section>`; bindBack(); }

export async function mountDetail(tickerFromRoute) {
  const ticker = String(tickerFromRoute || '').trim().toUpperCase();
  if (!ticker) { location.hash = '#watchlist'; return; }
  renderLoading(ticker);

  const [stockPayload, signalsPayload, topBottomPayload, expirationsPayload] = await Promise.all([
    safe(api.stock(ticker)), safe(api.signals(ticker)), safe(api.topBottomSignals(ticker)), safe(api.expirations(ticker))
  ]);
  const stock = normalizeStock(stockPayload.__error ? {} : stockPayload, ticker);
  const topBottom = normalizeTopBottom(topBottomPayload.__error ? {} : topBottomPayload, signalsPayload.__error ? {} : signalsPayload);
  const signals = normalizeSignals(signalsPayload.__error ? {} : signalsPayload);
  const expirations = expirationsPayload.__error ? [] : normalizeExpirations(expirationsPayload);

  const app = document.getElementById('app');
  app.innerHTML = renderPage(stock, topBottom, signals);
  bindBack();

  const chartEl = document.getElementById('detail-tradingview-chart');
  let refreshTimer;
  let chartHandle = null;
  async function loadChart(range = '1d') {
    chartEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%"><div style="width:24px;height:24px;border:2px solid #000;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></div></div>';
    chartHandle?.destroy?.(); chartHandle = null;
    const chartData = await safe(api.chart(stock.ticker, range));
    if (!chartData.__error) {
      chartHandle = renderChart(chartEl, chartData, chartData.visible || 0);
    } else {
      chartEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ba1a1a;font-size:14px">K线加载失败</div>';
    }
    document.querySelectorAll('#detail-chart-tabs .ethos-timeframe-button').forEach((b) => b.classList.toggle('active', b.dataset.range === range));
  }
  document.querySelectorAll('#detail-chart-tabs .ethos-timeframe-button').forEach((b) => b.addEventListener('click', () => loadChart(b.dataset.range)));
  await loadChart('1d');
  refreshTimer = setInterval(() => loadChart(document.querySelector('#detail-chart-tabs .ethos-timeframe-button.active')?.dataset.range || '1d'), 30 * 60 * 1000);
  window.addEventListener('hashchange', () => clearInterval(refreshTimer), { once: true });

  const aiButton = document.querySelector('[data-ai-detail]');
  const aiOut = document.querySelector('[data-ai-detail-results]');
  aiButton?.addEventListener('click', async () => {
    const old = aiButton.textContent; aiButton.disabled = true; aiButton.textContent = '分析中…'; aiOut.innerHTML = '<article class="ai-result-card">正在读取信号上下文…</article>';
    const result = await safe(api.signalAI ? api.signalAI(stock.ticker) : api.analyzeAlerts(stock.ticker, []));
    const source = result.__error ? { summary: result.message } : (result.analysis ?? result.data ?? result);
    const summary = typeof source === 'string' ? source : (source.summary ?? source.text ?? source.analysis ?? 'AI 分析完成。');
    aiOut.innerHTML = `<article class="ai-result-card"><div class="ai-result-card__header"><span class="label-caps">AI 分析</span><strong>${escapeHtml(stock.ticker)} 信号摘要</strong></div><p>${escapeHtml(summary)}</p></article>`;
    aiButton.disabled = false; aiButton.textContent = old;
  });

  mountOptionChain(document.getElementById('detail-option-chain'), stock.ticker, expirations);
  app.focus({ preventScroll: true });
}

export const renderDetail = mountDetail;
