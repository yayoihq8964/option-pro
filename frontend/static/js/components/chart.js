export function renderCandlestick(container, bars = [], price) {
  container.innerHTML = "";
  if (!window.LightweightCharts) {
    container.innerHTML =
      '<div class="h-full chart-grid rounded-lg flex items-center justify-center text-on-surface-variant">Chart library unavailable</div>';
    return null;
  }
  const chart = LightweightCharts.createChart(container, {
    layout: {
      background: { color: "#ffffff" },
      textColor: "#464554",
      fontFamily: "Inter",
    },
    grid: { vertLines: { color: "#F1F5F9" }, horzLines: { color: "#F1F5F9" } },
    rightPriceScale: { borderColor: "#e5eeff" },
    timeScale: { borderColor: "#e5eeff", timeVisible: true },
    crosshair: { mode: 1 },
    width: container.clientWidth,
    height: container.clientHeight,
  });
  const s = chart.addCandlestickSeries({
    upColor: "#006c49",
    downColor: "#ba1a1a",
    borderUpColor: "#006c49",
    borderDownColor: "#ba1a1a",
    wickUpColor: "#006c49",
    wickDownColor: "#ba1a1a",
  });
  const data = (bars || [])
    .map((b, i) => ({
      time:
        typeof b.t === "number"
          ? b.t
          : Math.floor(new Date(b.t).getTime() / 1000) || i + 1,
      open: +b.o,
      high: +b.h,
      low: +b.l,
      close: +b.c,
    }))
    .filter((x) => x.open && x.high && x.low && x.close);
  s.setData(data.length ? data : mockBars(price || 118));
  chart.timeScale().fitContent();
  const ro = new ResizeObserver(() =>
    chart.applyOptions({
      width: container.clientWidth,
      height: container.clientHeight,
    }),
  );
  ro.observe(container);
  return {
    chart,
    series: s,
    destroy: () => {
      ro.disconnect();
      chart.remove();
    },
  };
}
function mockBars(base = 118) {
  let p = base;
  return Array.from({ length: 80 }, (_, i) => {
    const o = p,
      c = o + (Math.random() - 0.45) * 2,
      h = Math.max(o, c) + Math.random() * 1.5,
      l = Math.min(o, c) - Math.random() * 1.5;
    p = c;
    return {
      time: Math.floor(Date.now() / 1000) - (80 - i) * 3600,
      open: o,
      high: h,
      low: l,
      close: c,
    };
  });
}
