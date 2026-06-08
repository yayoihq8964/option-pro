/**
 * Candlestick chart using TradingView Lightweight Charts with EMA20 + SMA50 + Volume.
 * Reliable rendering — replaces custom SVG.
 */
export function renderChart(container, data = {}, visibleBars = 0, options = {}) {
  container.innerHTML = '';

  const mode = options.mode === 'line' ? 'line' : 'candles';
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
  const viewport = document.createElement('div');
  viewport.className = 'chart-viewport';
  container.appendChild(viewport);

  const chart = LightweightCharts.createChart(viewport, {
    height: viewport.clientHeight || Math.max((container.clientHeight || 400) - 26, 320),
    layout: { background: { color: 'transparent' }, textColor: '#747571', fontFamily: 'Manrope, system-ui' },
    grid: { vertLines: { color: 'transparent' }, horzLines: { color: 'rgba(20,22,25,0.055)' } },
    rightPriceScale: {
      borderVisible: false,
      scaleMargins: mode === 'line' ? { top: 0.08, bottom: 0.12 } : { top: 0.05, bottom: 0.25 },
    },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  });
  let liveDotHandle = null;

  if (mode === 'line') {
    const closeSeries = chart.addLineSeries({
      color: '#008c72',
      lineWidth: 4,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 5,
      ...(LightweightCharts.LineType?.Curved != null ? { lineType: LightweightCharts.LineType.Curved } : {}),
    });
    closeSeries.setData(bars.map(b => ({ time: b.time, value: b.close })));
    const lastBar = bars[bars.length - 1];
    liveDotHandle = mountLivePriceDot(viewport, chart, closeSeries, { time: lastBar.time, value: lastBar.close });
  } else {
    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#008c72',
      downColor: '#d84747',
      borderUpColor: '#008c72',
      borderDownColor: '#d84747',
      wickUpColor: '#008c72',
      wickDownColor: '#d84747',
    });
    candleSeries.setData(bars.map(b => ({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      ...(b.extended ? {
        color: b.close >= b.open ? 'rgba(0,140,114,0.46)' : 'rgba(216,71,71,0.46)',
        borderColor: b.close >= b.open ? 'rgba(0,140,114,0.5)' : 'rgba(216,71,71,0.5)',
        wickColor: b.close >= b.open ? 'rgba(0,140,114,0.5)' : 'rgba(216,71,71,0.5)',
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
        ? (b.close >= b.open ? 'rgba(0,140,114,0.1)' : 'rgba(216,71,71,0.1)')
        : (b.close >= b.open ? 'rgba(0,140,114,0.2)' : 'rgba(216,71,71,0.18)'),
    })));

    // EMA20 line (solid purple)
    if (ema20.length > 1) {
      const ema20Series = chart.addLineSeries({
        color: '#2d66c3',
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
        color: '#747571',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        crosshairMarkerVisible: false,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      sma50Series.setData(sma50.map(p => ({ time: p.time, value: p.value })));
    }
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
    width: viewport.clientWidth,
    height: viewport.clientHeight || Math.max((container.clientHeight || 400) - 26, 320),
  });
  const updateLayout = () => {
    resize();
    liveDotHandle?.update?.();
  };
  resize();
  const ro = new ResizeObserver(updateLayout);
  ro.observe(container);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  legend.innerHTML = mode === 'line'
    ? '<span class="chart-legend__item"><span class="chart-legend__swatch chart-legend__swatch--close"></span>CLOSE</span>'
    : `
      <span class="chart-legend__item"><span class="chart-legend__swatch" style="background:#2d66c3"></span>EMA 20</span>
      <span class="chart-legend__item"><span class="chart-legend__swatch chart-legend__swatch--dash"></span>SMA 50</span>
      ${hasExtendedBars ? '<span class="chart-legend__item"><span class="chart-legend__swatch" style="background:rgba(20,22,25,.28)"></span>EXT 盘前/盘后</span>' : ''}
    `;
  container.appendChild(legend);

  return {
    chart,
    destroy: () => { liveDotHandle?.dispose?.(); ro.disconnect(); chart.remove(); },
  };
}

function mountLivePriceDot(viewport, chart, series, point) {
  const dot = document.createElement('span');
  dot.className = 'live-price-dot';
  dot.setAttribute('aria-hidden', 'true');
  viewport.appendChild(dot);

  const update = () => {
    const x = chart.timeScale().timeToCoordinate(point.time);
    const y = series.priceToCoordinate(point.value);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      dot.hidden = true;
      return;
    }
    dot.hidden = false;
    dot.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  };

  const timeScale = chart.timeScale();
  timeScale.subscribeVisibleLogicalRangeChange?.(update);
  timeScale.subscribeVisibleTimeRangeChange?.(update);
  requestAnimationFrame(update);

  return {
    update,
    dispose() {
      timeScale.unsubscribeVisibleLogicalRangeChange?.(update);
      timeScale.unsubscribeVisibleTimeRangeChange?.(update);
      dot.remove();
    }
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
      quoteOnly: Boolean(b.quote_only ?? b.quoteOnly),
      session: String(b.session || ''),
    }))
    .filter(b => (
      Number.isFinite(b.time) &&
      Number.isFinite(b.open) &&
      Number.isFinite(b.high) &&
      Number.isFinite(b.low) &&
      Number.isFinite(b.close) &&
      b.time > 0 &&
      b.low > 0 &&
      b.high >= Math.max(b.open, b.close) &&
      b.low <= Math.min(b.open, b.close)
    ))
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
