import { api, safe } from '../api.js';
import { openModal } from '../components/modal.js';

const price = n => n == null ? '—' : `$${Number(n).toLocaleString(undefined,{maximumFractionDigits:2})}`;

function stockBlock(s) {
  const pct = Number(s.change_percent ?? 0), pos = pct > 0, neg = pct < 0;
  const tone = pos
    ? 'bg-tertiary-container text-on-tertiary-container'
    : neg
      ? 'bg-error-container text-on-error-container'
      : 'bg-surface-container text-on-surface-variant';
  return `<button data-ticker="${s.ticker}" class="w-24 h-24 md:w-28 md:h-28 rounded-2xl flex flex-col items-center justify-center gap-1 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-[0.98] ${tone}">
    <span class="text-sm font-black">${s.ticker}</span>
    <span class="text-xs font-bold">${pos?'+':''}${pct.toFixed(2)}%</span>
    <span class="text-xs font-semibold opacity-80">${price(s.price)}</span>
  </button>`;
}

function sectorGroup(group) {
  return `<section class="space-y-3">
    <div class="flex items-center gap-3">
      <h2 class="text-lg md:text-xl font-extrabold font-headline">${group.name}</h2>
      <span class="text-[10px] font-bold text-on-surface-variant bg-surface-container px-2 py-1 rounded-full">${(group.stocks || []).length} stocks</span>
    </div>
    <div class="flex flex-wrap gap-3 md:gap-4">${(group.stocks || []).map(stockBlock).join('')}</div>
  </section>`;
}

export async function mountWatchlist(root, ctx) {
  root.innerHTML = `<div class="flex gap-0"><main class="flex-1 xl:mr-80 p-4 md:p-6 lg:p-8 space-y-8"><section><div class="flex items-center justify-between mb-6"><h1 class="text-3xl font-extrabold font-headline">市场总览</h1><span class="text-xs text-on-surface-variant">${new Date().toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div><div id="watch-groups" class="space-y-8"></div></section></main><aside class="hidden xl:block fixed right-0 top-16 w-80 h-[calc(100vh-64px)] p-6 bg-surface-container-low overflow-y-auto custom-scrollbar z-40"><div id="watch-sidebar" class="space-y-8"></div></aside></div>`;
  const [wl, status, earnings, sectors] = await Promise.all([safe(api.watchlist()), safe(api.marketStatus()), safe(api.earnings()), safe(api.sectors())]);
  if (!ctx.isCurrent()) return;
  const groups = wl.groups || [];
  document.getElementById('watch-groups').innerHTML = groups.map(sectorGroup).join('') || '<div class="p-8 text-center text-on-surface-variant bg-white rounded-2xl">暂无市场数据</div>';
  root.querySelector('#watch-groups').addEventListener('click', e => { const b=e.target.closest('[data-ticker]'); if(b) openModal(b.dataset.ticker); });
  document.getElementById('watch-sidebar').innerHTML = sidebar(status, earnings, sectors);
}

function sidebar(status, earnings, sectors) {
  const market = status.market || 'Unknown';
  const es = (earnings.earnings || []).slice(0,5);
  const ss = (sectors.sectors || []).slice(0,4);
  return `<div class="bg-surface-container-lowest p-6 rounded-2xl space-y-4"><h3 class="text-xs font-black font-headline tracking-widest uppercase text-on-surface-variant flex items-center gap-2"><span class="material-symbols-outlined text-primary text-lg">schedule</span>Market Status</h3><div class="flex items-center justify-between"><span class="text-2xl font-black font-headline">${market}</span><span class="w-3 h-3 rounded-full ${/open/i.test(market)?'bg-tertiary':'bg-error'}"></span></div><p class="text-xs text-on-surface-variant">${status.server_time ? new Date(status.server_time).toLocaleString('zh-CN') : ''}</p></div>
  <div class="bg-surface-container-lowest p-5 rounded-2xl space-y-4"><h3 class="text-xs font-black font-headline tracking-widest uppercase text-on-surface-variant">Upcoming Earnings</h3><div class="space-y-3">${es.map(e=>`<button data-ticker="${e.ticker}" class="w-full flex items-center justify-between p-3 bg-surface-container-low rounded-xl text-left hover:bg-surface-container transition"><div><p class="font-bold text-sm">${e.ticker}</p><p class="text-[10px] text-on-surface-variant line-clamp-1">${e.name}</p></div><div class="text-right"><p class="text-xs font-bold">${e.earnings_date}</p><p class="text-[10px] text-on-surface-variant">EPS ${e.eps_estimate ?? '—'}</p></div></button>`).join('') || '<p class="text-sm text-on-surface-variant">暂无数据</p>'}</div></div>
  <div class="bg-surface-container-lowest p-5 rounded-2xl space-y-4"><h3 class="text-xs font-black font-headline tracking-widest uppercase text-on-surface-variant">Sector IV Overview</h3>${ss.map(s=>`<a href="#sectors" class="flex items-center gap-3 p-3 bg-surface-container-low rounded-xl"><span class="material-symbols-outlined text-primary">bubble_chart</span><div><p class="font-bold text-sm">${s.name}</p><p class="text-[10px] text-on-surface-variant">${(s.tickers||[]).length} tickers</p></div></a>`).join('')}</div>`;
}
