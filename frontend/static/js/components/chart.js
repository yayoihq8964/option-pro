/**
 * Vanilla SVG candlestick chart with EMA20 (solid purple) + SMA50 (dashed blue).
 * Faithful port of News-feed AssetDetailModal CandlestickChart.
 */
const CHART_W = 800;
const CHART_H = 300;
const PAD = { top: 10, right: 10, bottom: 10, left: 10 };

export function renderChart(container, data = {}) {
  container.innerHTML = '';

  const bars = normalizeBars(Array.isArray(data) ? data : data.bars || []);
  const ema20 = normalizeMA(Array.isArray(data) ? [] : data.ema20 || []);
  const sma50 = normalizeMA(Array.isArray(data) ? [] : data.sma50 || []);

  if (!bars.length) {
    container.innerHTML = '<div class="h-64 md:h-80 flex items-center justify-center text-on-surface-variant text-sm">暂无数据</div>';
    return null;
  }

  const allPrices = bars.flatMap(c => [c.high, c.low]);
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const range = maxP - minP || 1;
  const padded = range * 0.08;
  const low = minP - padded;
  const high = maxP + padded;
  const yRange = high - low;

  const toY = (v) => PAD.top + (1 - (v - low) / yRange) * (CHART_H - PAD.top - PAD.bottom);
  const n = bars.length;
  const barW = Math.max(2, Math.min(14, (CHART_W - PAD.left - PAD.right) / n * 0.6));
  const step = (CHART_W - PAD.left - PAD.right) / n;
  const toX = (i) => PAD.left + step * i + step / 2;

  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const val = high - (yRange * i) / 4;
    return { val, y: toY(val) };
  });

  const timeIdx = new Map(bars.map((c, i) => [c.time, i]));
  const maPath = (pts) => {
    const mapped = pts
      .map(p => ({ x: timeIdx.get(p.time), y: p.value }))
      .filter(p => p.x !== undefined && Number.isFinite(p.y));
    if (mapped.length < 2) return '';
    return mapped.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`).join(' ');
  };

  const wrap = document.createElement('div');
  wrap.className = 'w-full h-64 md:h-80 relative';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'w-full h-full');
  svg.setAttribute('viewBox', `0 0 ${CHART_W} ${CHART_H}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  yTicks.forEach(t => {
    const line = el('line', { x1: 0, x2: CHART_W, y1: t.y, y2: t.y, stroke: 'currentColor', 'stroke-width': 1 });
    line.setAttribute('class', 'text-outline-variant/15');
    svg.appendChild(line);
  });

  const smaPath = maPath(sma50);
  if (smaPath) {
    svg.appendChild(el('path', { d: smaPath, fill: 'none', stroke: '#4953ac', 'stroke-width': 2.5, 'stroke-dasharray': '6,4' }));
  }

  const emaPath = maPath(ema20);
  if (emaPath) {
    svg.appendChild(el('path', { d: emaPath, fill: 'none', stroke: '#6a1cf6', 'stroke-width': 2.5 }));
  }

  bars.forEach((c, i) => {
    const x = toX(i);
    const isUp = c.close >= c.open;
    const color = isUp ? '#006a28' : '#b41340';
    const bodyTop = toY(Math.max(c.open, c.close));
    const bodyBot = toY(Math.min(c.open, c.close));
    const bodyH = Math.max(1, bodyBot - bodyTop);
    const g = el('g');
    g.appendChild(el('line', { x1: x, x2: x, y1: toY(c.high), y2: toY(c.low), stroke: color, 'stroke-width': 1.2 }));
    g.appendChild(el('rect', { x: x - barW / 2, y: bodyTop, width: barW, height: bodyH, fill: color, rx: 1 }));
    svg.appendChild(g);
  });

  const ticks = document.createElement('div');
  ticks.className = 'absolute left-1 top-0 bottom-0 flex flex-col justify-between text-[10px] font-bold text-on-surface-variant/50 pointer-events-none py-1';
  ticks.innerHTML = yTicks.map(t => `<span class="tabular-nums">${formatTick(t.val)}</span>`).join('');

  wrap.appendChild(svg);
  wrap.appendChild(ticks);
  container.appendChild(wrap);

  return { destroy: () => { container.innerHTML = ''; } };
}

function el(name, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function normalizeBars(bars) {
  return bars
    .map(b => ({
      time: String(Math.floor(Number(b.t ?? b.time) > 1e12 ? Number(b.t ?? b.time) / 1000 : Number(b.t ?? b.time))),
      open: Number(b.o ?? b.open),
      high: Number(b.h ?? b.high),
      low: Number(b.l ?? b.low),
      close: Number(b.c ?? b.close),
    }))
    .filter(b => Number.isFinite(Number(b.time)) && Number.isFinite(b.open) && Number.isFinite(b.high) && Number.isFinite(b.low) && Number.isFinite(b.close))
    .sort((a, b) => Number(a.time) - Number(b.time));
}

function normalizeMA(points) {
  return points
    .map(p => ({
      time: String(Math.floor(Number(p.time ?? p.t) > 1e12 ? Number(p.time ?? p.t) / 1000 : Number(p.time ?? p.t))),
      value: Number(p.value),
    }))
    .filter(p => Number.isFinite(Number(p.time)) && Number.isFinite(p.value));
}

function formatTick(val) {
  if (val >= 10000) return val.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (val >= 100) return val.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
