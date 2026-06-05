export function heatmapHTML(data = []) {
  const color = (v) =>
    v > 75 ? "#ffdad6" : v > 55 ? "#ffb2b9" : v > 35 ? "#dce9ff" : "#6ffbbe";
  return `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-sm">${data.map((d) => `<div class="heat-cell" style="background:${color(d.iv_percentile)};color:#0b1c30"><span>${d.ticker}</span><small class="font-data-mono mt-1">${Math.round(d.iv_percentile || 0)}%</small></div>`).join("")}</div>`;
}
