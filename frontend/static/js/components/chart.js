/**
 * Candlestick chart using TradingView Lightweight Charts with EMA20 + SMA50 + Volume.
 * Reliable rendering — replaces custom SVG.
 */
export function renderChart(container, data = {}, visibleBars = 0) {
  container.innerHTML = '';

  const bars = normalizeBars(Array.isArray(data) ? data : data.bars || []);
  const ema20 = normalizeMA(Array.isArray(data) ? [] : data.ema20 || []);
  const sma50 = normalizeMA(Array.isArray(data) ? [] : data.sma50 || []);

  if (!bars.length) {
    container.innerHTML = '<div class="h-64 md:h-80 flex items-center justify-center text-on-surface-variant text-sm">暂无数据</div>';
    return null;
  }

  if (!window.LightweightCharts) {
    container.innerHTML = '<div class="h-64 md:h-80 flex items-center justify-center text-on-surface-variant text-sm">图表库加载中...</div>';
    return null;
  }
  const hasExtendedBars = bars.some(b => b.extended);

  const chart = LightweightCharts.createChart(container, {
    height: container.clientHeight || 400,
    layout: { background: { color: 'transparent' }, textColor: '#595c60', fontFamily: 'Inter, system-ui' },
    grid: { vertLines: { color: 'rgba(171,173,178,0.1)' }, horzLines: { color: 'rgba(171,173,178,0.1)' } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.05, bottom: 0.25 } },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  });

  // Candlestick series
  const candleSeries = chart.addCandlestickSeries({
    upColor: '#059669',
    downColor: '#ba1a1a',
    borderUpColor: '#059669',
    borderDownColor: '#ba1a1a',
    wickUpColor: '#059669',
    wickDownColor: '#ba1a1a',
  });
  candleSeries.setData(bars.map(b => ({
    time: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    ...(b.extended ? {
      color: b.close >= b.open ? 'rgba(5,150,105,0.58)' : 'rgba(186,26,26,0.58)',
      borderColor: b.close >= b.open ? 'rgba(5,150,105,0.62)' : 'rgba(186,26,26,0.62)',
      wickColor: b.close >= b.open ? 'rgba(5,150,105,0.62)' : 'rgba(186,26,26,0.62)',
    } : {}),
  })));

  // Volume series (bottom histogram)
  const volumeSeries = chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
  });
  chart.priceScale('volume').applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 },
    drawTicks: false,
  });
  volumeSeries.setData(bars.map(b => ({
    time: b.time,
    value: b.volume || 0,
    color: b.extended
      ? (b.close >= b.open ? 'rgba(5,150,105,0.12)' : 'rgba(186,26,26,0.12)')
      : (b.close >= b.open ? 'rgba(5,150,105,0.25)' : 'rgba(186,26,26,0.25)'),
  })));

  // EMA20 line (solid purple)
  if (ema20.length > 1) {
    const ema20Series = chart.addLineSeries({
      color: '#6a1cf6',
      lineWidth: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema20Series.setData(ema20.map(p => ({ time: p.time, value: p.value })));
  }

  // SMA50 line (dashed dark blue)
  if (sma50.length > 1) {
    const sma50Series = chart.addLineSeries({
      color: '#4953ac',
      lineWidth: 2,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    sma50Series.setData(sma50.map(p => ({ time: p.time, value: p.value })));
  }

  // Show last N bars initially; user can scroll left for history
  const totalBars = bars.length;
  if (visibleBars > 0 && totalBars > visibleBars) {
    chart.timeScale().setVisibleLogicalRange({
      from: totalBars - visibleBars - 5,
      to: totalBars + 5,
    });
  } else {
    chart.timeScale().fitContent();
  }

  // Responsive
  const resize = () => chart.applyOptions({
    width: container.clientWidth,
    height: container.clientHeight || 400,
  });
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'flex gap-4 text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-tight mt-2 px-1';
  legend.innerHTML = `
    <span class="flex items-center gap-1.5"><span class="w-5 h-0.5 rounded inline-block" style="background:#6a1cf6"></span>EMA 20</span>
    <span class="flex items-center gap-1.5"><span class="w-5 h-0.5 rounded inline-block" style="background:#4953ac;border-top:2px dashed #4953ac;height:0"></span>SMA 50</span>
    ${hasExtendedBars ? '<span class="flex items-center gap-1.5"><span class="w-5 h-0.5 rounded inline-block" style="background:rgba(89,92,96,.45)"></span>EXT 盘前/盘后</span>' : ''}
  `;
  container.appendChild(legend);

  return {
    chart,
    destroy: () => { ro.disconnect(); chart.remove(); },
  };
}

function normalizeBars(bars) {
  return bars
    .map(b => ({
      time: Math.floor(Number(b.t ?? b.time) > 1e12 ? Number(b.t ?? b.time) / 1000 : Number(b.t ?? b.time)),
      open: Number(b.o ?? b.open),
      high: Number(b.h ?? b.high),
      low: Number(b.l ?? b.low),
      close: Number(b.c ?? b.close),
      volume: Number(b.v ?? b.volume ?? 0),
      extended: Boolean(b.ext ?? b.extended),
      session: String(b.session || ''),
    }))
    .filter(b => Number.isFinite(b.time) && Number.isFinite(b.close) && b.time > 0)
    .sort((a, b) => a.time - b.time);
}

function normalizeMA(pts) {
  return pts
    .map(p => ({
      time: Math.floor(Number(p.time ?? p.t) > 1e12 ? Number(p.time ?? p.t) / 1000 : Number(p.time ?? p.t)),
      value: Number(p.value),
    }))
    .filter(p => Number.isFinite(p.time) && Number.isFinite(p.value) && p.time > 0)
    .sort((a, b) => a.time - b.time);
}
