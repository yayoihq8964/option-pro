export function renderChart(container, bars = []) {
  container.innerHTML = '';
  if (!window.LightweightCharts) {
    container.innerHTML = '<div class="h-64 flex items-center justify-center text-sm text-on-surface-variant">图表库加载中...</div>';
    return null;
  }
  if (!bars.length) {
    container.innerHTML = '<div class="h-64 md:h-80 flex items-center justify-center text-sm text-on-surface-variant">暂无K线数据</div>';
    return null;
  }

  const chart = LightweightCharts.createChart(container, {
    height: container.clientHeight || 320,
    layout: { background: { color: 'transparent' }, textColor: '#595c60', fontFamily: 'Inter' },
    grid: { vertLines: { color: 'rgba(171,173,178,.16)' }, horzLines: { color: 'rgba(171,173,178,.16)' } },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    crosshair: { mode: 1 },
  });
  const series = chart.addCandlestickSeries({
    upColor: '#006a28', downColor: '#b41340', borderUpColor: '#006a28', borderDownColor: '#b41340', wickUpColor: '#006a28', wickDownColor: '#b41340',
  });
  series.setData(bars.map((b) => ({
    time: Math.floor((b.t > 1e12 ? b.t / 1000 : b.t)),
    open: Number(b.o), high: Number(b.h), low: Number(b.l), close: Number(b.c),
  })).filter(b => Number.isFinite(b.time) && Number.isFinite(b.close)));
  chart.timeScale().fitContent();

  const resize = () => chart.applyOptions({ width: container.clientWidth, height: container.clientHeight || 320 });
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  return { chart, destroy: () => { ro.disconnect(); chart.remove(); } };
}
