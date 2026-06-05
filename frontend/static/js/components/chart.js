/**
 * SVG Candlestick chart with EMA20, SMA50, and Volume bars.
 * Matches News-feed AssetDetailModal style with proper candle spacing.
 */
const W = 800, PRICE_H = 240, VOL_H = 60, GAP = 4;
const TOTAL_H = PRICE_H + GAP + VOL_H;
const PAD = { top: 12, right: 50, bottom: 4, left: 6 };

export function renderChart(container, data = {}) {
  container.innerHTML = '';

  const bars = normalizeBars(Array.isArray(data) ? data : data.bars || []);
  const ema20 = normalizeMA(Array.isArray(data) ? [] : data.ema20 || []);
  const sma50 = normalizeMA(Array.isArray(data) ? [] : data.sma50 || []);

  if (!bars.length) {
    container.innerHTML = '<div class="h-80 flex items-center justify-center text-on-surface-variant text-sm">暂无数据</div>';
    return null;
  }

  // Limit to last ~80 candles for readability
  const maxCandles = 80;
  const visible = bars.slice(-maxCandles);
  const visibleTimes = new Set(visible.map(b => b.time));

  // Price range
  const allPrices = visible.flatMap(c => [c.high, c.low]);
  const minP = Math.min(...allPrices), maxP = Math.max(...allPrices);
  const priceRange = maxP - minP || 1;
  const pricePad = priceRange * 0.06;
  const pLow = minP - pricePad, pHigh = maxP + pricePad;
  const pRange = pHigh - pLow;

  // Volume range
  const allVol = visible.map(c => c.volume || 0);
  const maxVol = Math.max(...allVol, 1);

  const n = visible.length;
  const usableW = W - PAD.left - PAD.right;
  const step = usableW / n;
  const barW = Math.max(3, Math.min(12, step * 0.65));
  const toX = (i) => PAD.left + step * i + step / 2;
  const toY = (v) => PAD.top + (1 - (v - pLow) / pRange) * (PRICE_H - PAD.top - PAD.bottom);
  const volBase = PRICE_H + GAP + VOL_H;
  const toVolH = (v) => (v / maxVol) * (VOL_H - 4);

  // Y-axis ticks (price)
  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount }, (_, i) => {
    const val = pHigh - (pRange * i) / (tickCount - 1);
    return { val, y: toY(val) };
  });

  // MA paths
  const timeIdx = new Map(visible.map((c, i) => [c.time, i]));
  const maPath = (pts) => {
    const mapped = pts
      .filter(p => visibleTimes.has(p.time))
      .map(p => ({ x: timeIdx.get(p.time), y: p.value }))
      .filter(p => p.x !== undefined && Number.isFinite(p.y));
    if (mapped.length < 2) return '';
    return mapped.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`).join(' ');
  };

  // Build SVG
  let svgContent = '';

  // Grid lines
  yTicks.forEach(t => {
    svgContent += `<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${t.y}" y2="${t.y}" stroke="currentColor" class="text-outline-variant/10" stroke-width="0.5"/>`;
  });

  // Volume/price separator
  svgContent += `<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${PRICE_H + GAP/2}" y2="${PRICE_H + GAP/2}" stroke="currentColor" class="text-outline-variant/8" stroke-width="0.5" stroke-dasharray="4,4"/>`;

  // SMA50 (dashed, behind)
  const sma50Path = maPath(sma50);
  if (sma50Path) svgContent += `<path d="${sma50Path}" fill="none" stroke="#4953ac" stroke-width="2" stroke-dasharray="6,4" stroke-linecap="round"/>`;

  // EMA20 (solid, front)
  const ema20Path = maPath(ema20);
  if (ema20Path) svgContent += `<path d="${ema20Path}" fill="none" stroke="#6a1cf6" stroke-width="2" stroke-linecap="round"/>`;

  // Candles + Volume bars
  visible.forEach((c, i) => {
    const x = toX(i);
    const isUp = c.close >= c.open;
    const color = isUp ? '#006a28' : '#b41340';
    const bodyTop = toY(Math.max(c.open, c.close));
    const bodyBot = toY(Math.min(c.open, c.close));
    const bodyH = Math.max(1.5, bodyBot - bodyTop);

    const isExt = c.ext;  // extended hours bar
    const opacity = isExt ? '0.4' : '1';

    // Wick
    svgContent += `<line x1="${x}" x2="${x}" y1="${toY(c.high)}" y2="${toY(c.low)}" stroke="${color}" stroke-width="1" opacity="${opacity}"/>`;
    // Body
    svgContent += `<rect x="${x - barW/2}" y="${bodyTop}" width="${barW}" height="${bodyH}" fill="${color}" rx="0.5" opacity="${opacity}"/>`;

    // Volume bar (skip if 0)
    const vh = toVolH(c.volume || 0);
    if (vh > 0.5) {
      svgContent += `<rect x="${x - barW/2}" y="${volBase - vh}" width="${barW}" height="${vh}" fill="${color}" opacity="${isExt ? '0.15' : '0.35'}" rx="0.5"/>`;
    }
  });

  // Y-axis labels (right side)
  let labelsHTML = '';
  yTicks.forEach(t => {
    labelsHTML += `<text x="${W - 4}" y="${t.y + 3}" text-anchor="end" fill="currentColor" class="text-on-surface-variant/40" font-size="9" font-weight="600" font-family="Inter">${fmtTick(t.val)}</text>`;
  });
  // Volume label
  labelsHTML += `<text x="${W - 4}" y="${PRICE_H + GAP + 12}" text-anchor="end" fill="currentColor" class="text-on-surface-variant/30" font-size="8" font-weight="600" font-family="Inter">VOL</text>`;

  const wrap = document.createElement('div');
  wrap.className = 'w-full relative';
  wrap.innerHTML = `
    <svg class="w-full" viewBox="0 0 ${W} ${TOTAL_H}" preserveAspectRatio="xMidYMid meet" style="display:block">
      ${svgContent}
      ${labelsHTML}
    </svg>
    <div class="flex justify-between items-center mt-2 px-1">
      <div class="flex gap-4 text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-tight">
        <span class="flex items-center gap-1.5"><span class="w-5 h-0.5 rounded bg-[#6a1cf6] inline-block"></span>EMA 20</span>
        <span class="flex items-center gap-1.5"><span class="w-5 h-0.5 rounded bg-[#4953ac] inline-block" style="border-top:2px dashed #4953ac;height:0"></span>SMA 50</span>
      </div>
      <span class="text-[10px] text-on-surface-variant/40">Vol max: ${fmtVol(maxVol)}</span>
    </div>
  `;
  container.appendChild(wrap);
  return { destroy: () => { container.innerHTML = ''; } };
}

function normalizeBars(bars) {
  return bars
    .map(b => ({
      time: String(Math.floor(Number(b.t ?? b.time) > 1e12 ? Number(b.t ?? b.time) / 1000 : Number(b.t ?? b.time))),
      open: Number(b.o ?? b.open),
      high: Number(b.h ?? b.high),
      low: Number(b.l ?? b.low),
      close: Number(b.c ?? b.close),
      volume: Number(b.v ?? b.volume ?? 0),
      ext: !!b.ext,
    }))
    .filter(b => Number.isFinite(Number(b.time)) && Number.isFinite(b.close))
    .sort((a, b) => Number(a.time) - Number(b.time));
}

function normalizeMA(pts) {
  return pts
    .map(p => ({
      time: String(Math.floor(Number(p.time ?? p.t) > 1e12 ? Number(p.time ?? p.t) / 1000 : Number(p.time ?? p.t))),
      value: Number(p.value),
    }))
    .filter(p => Number.isFinite(Number(p.time)) && Number.isFinite(p.value));
}

function fmtTick(v) {
  if (v >= 10000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (v >= 100) return v.toFixed(1);
  return v.toFixed(2);
}

function fmtVol(v) {
  if (v >= 1e9) return (v/1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v/1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v/1e3).toFixed(0) + 'K';
  return String(v);
}
