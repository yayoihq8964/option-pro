export function renderHeatmap(data = [], onTicker = '') {
  if (!data.length) return '<div class="p-8 text-center text-sm text-on-surface-variant bg-surface-container-lowest rounded-2xl">暂无热力图数据</div>';
  return `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
    ${data.map((d) => {
      const v = Number(d.iv_percentile ?? d.iv_rank ?? 0);
      const bg = v >= 70 ? 'bg-error-container text-on-error-container' : v >= 40 ? 'bg-primary-container text-on-primary-container' : 'bg-tertiary-container text-on-tertiary-container';
      return `<button type="button" ${onTicker ? `data-open-ticker="${d.ticker}"` : ''} class="${bg} rounded-2xl p-4 text-left hover:-translate-y-0.5 hover:shadow-lg transition-all active:scale-[.98]">
        <p class="font-black font-headline">${d.ticker}</p>
        <p class="text-2xl font-black mt-2">${v.toFixed(0)}%</p>
        <p class="text-[10px] font-bold uppercase tracking-widest opacity-70">IV Percentile</p>
      </button>`;
    }).join('')}
  </div>`;
}
