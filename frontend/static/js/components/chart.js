import { api } from '../api.js';

const ETHOS = {
  emerald: '#059669',
  crimson: '#ba1a1a',
  black: '#000000',
  warmGray: '#8f8580',
  border: '#E8E4E1',
  surface: '#ffffff',
  muted: '#6f6a66'
};

const TIMEFRAMES = [
  { label: '5m', range: '5m' },
  { label: '15m', range: '15m' },
  { label: '1h', range: '1h' },
  { label: '1d', range: '1d' },
  { label: '1w', range: '1w' }
];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function toTimestamp(value, fallbackIndex) {
  if (typeof value === 'number') return value > 10000000000 ? Math.floor(value / 1000) : value;
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  return Math.floor(Date.now() / 1000) - (fallbackIndex * 86400);
}

function normalizeBars(payload) {
  const points = Array.isArray(payload) ? payload : (payload?.candles ?? payload?.ohlc ?? payload?.data ?? payload?.chart ?? []);
  return points.map((point, index) => {
    const close = Number(point.close ?? point.c ?? point.price ?? point.value ?? point.y);
    const open = Number(point.open ?? point.o ?? close);
    const high = Number(point.high ?? point.h ?? Math.max(open, close));
    const low = Number(point.low ?? point.l ?? Math.min(open, close));
    return {
      time: toTimestamp(point.time ?? point.date ?? point.t, points.length - index),
      open,
      high,
      low,
      close
    };
  }).filter((point) => [point.open, point.high, point.low, point.close].every(Number.isFinite));
}

function normalizeMA(candles, period) {
  return candles.map((candle, index) => {
    const window = candles.slice(Math.max(0, index - period + 1), index + 1);
    const value = window.reduce((sum, item) => sum + item.close, 0) / window.length;
    return { time: candle.time, value };
  });
}

function renderEmpty(container, ticker) {
  container.innerHTML = `
    <div class="ethos-chart-shell" data-chart-surface="ethos">
      <div class="ethos-timeframe-row" aria-label="Chart timeframe">
        ${TIMEFRAMES.map((item) => `<button type="button" class="ethos-timeframe-button" data-range="${item.range}">${item.label}</button>`).join('')}
      </div>
      <div class="ethos-chart-empty">${escapeHtml(ticker)} chart data unavailable.</div>
    </div>
  `;
}

function renderFrame(container, activeRange) {
  container.innerHTML = `
    <div class="ethos-chart-shell" data-chart-surface="ethos">
      <div class="ethos-timeframe-row" aria-label="Chart timeframe">
        ${TIMEFRAMES.map((item) => `<button type="button" class="ethos-timeframe-button ${item.range === activeRange ? 'active' : ''}" data-range="${item.range}">${item.label}</button>`).join('')}
      </div>
      <div class="ethos-lightweight-chart" data-chart-canvas></div>
    </div>
  `;
}

export async function renderChart(container, ticker, activeRange = '1d', prefetchedChart = null) {
  if (!container) return;
  const symbol = String(ticker || '').toUpperCase();
  renderFrame(container, activeRange);

  container.querySelectorAll('.ethos-timeframe-button').forEach((button) => {
    button.addEventListener('click', () => renderChart(container, symbol, button.dataset.range));
  });

  const payload = prefetchedChart ?? await api.chart(symbol, activeRange);
  const candles = normalizeBars(payload);
  if (!candles.length) {
    renderEmpty(container, symbol);
    return;
  }

  const chartElement = container.querySelector('[data-chart-canvas]');
  const lightweight = window.LightweightCharts;
  if (!lightweight?.createChart) {
    chartElement.innerHTML = `<div class="ethos-chart-empty">TradingView Lightweight Charts library is not loaded.</div>`;
    return;
  }

  const chart = lightweight.createChart(chartElement, {
    height: 360,
    layout: {
      background: { color: ETHOS.surface },
      textColor: ETHOS.muted
    },
    grid: {
      vertLines: { color: 'rgba(232, 228, 225, 0.7)' },
      horzLines: { color: 'rgba(232, 228, 225, 0.7)' }
    },
    rightPriceScale: { borderColor: ETHOS.border },
    timeScale: { borderColor: ETHOS.border, timeVisible: true }
  });

  const candlestickSeries = chart.addCandlestickSeries({
    upColor: ETHOS.emerald,
    borderUpColor: ETHOS.emerald,
    wickUpColor: ETHOS.emerald,
    downColor: ETHOS.crimson,
    borderDownColor: ETHOS.crimson,
    wickDownColor: ETHOS.crimson
  });
  candlestickSeries.setData(candles);

  const ema20 = chart.addLineSeries({ color: ETHOS.black, lineWidth: 2, title: 'EMA20' });
  ema20.setData(normalizeMA(candles, 20));

  const sma50 = chart.addLineSeries({ color: ETHOS.warmGray, lineWidth: 2, title: 'SMA50' });
  sma50.setData(normalizeMA(candles, 50));

  chart.timeScale().fitContent();
}

const normalizeCandles = normalizeBars;
const movingAverage = normalizeMA;

export { TIMEFRAMES, normalizeBars, normalizeMA, normalizeCandles, movingAverage };
