import { api, safe } from '../api.js';
import { openModal } from '../components/modal.js';
import { renderHeatmap } from '../components/heatmap.js';

export async function mountSectors(root, ctx) {
  root.innerHTML = `<main class="p-4 md:p-6 lg:p-8 space-y-8"><div class="flex items-center justify-between"><div><h1 class="text-3xl font-extrabold font-headline">板块波动率分析</h1><p class="text-sm text-on-surface-variant mt-1">Sector IV ranking & heatmap</p></div></div><div id="sectors-wrap" class="space-y-6"></div></main>`;
  const res = await safe(api.sectors());
  if (!ctx.isCurrent()) return;
  const sectors = res.sectors || [];
  const wrap = document.getElementById('sectors-wrap');
  wrap.innerHTML = sectors.map((s,i)=>`<section class="bg-surface-container-lowest rounded-2xl p-5 md:p-6 space-y-5"><button data-sector="${s.id}" class="w-full flex items-center justify-between text-left"><div><h2 class="text-xl font-extrabold font-headline">${s.name}</h2><p class="text-xs text-on-surface-variant mt-1">${(s.tickers||[]).join(' · ')}</p></div><span class="material-symbols-outlined text-primary">expand_more</span></button><div id="sector-${s.id}" class="${i===0?'':'hidden'}"><div class="h-48 rounded-2xl skeleton"></div></div></section>`).join('') || '<div class="p-8 bg-white rounded-2xl text-on-surface-variant">暂无板块数据</div>';
  wrap.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-open-ticker]'); if (t) { openModal(t.dataset.openTicker); return; }
    const b = e.target.closest('[data-sector]'); if (!b) return;
    const panel = document.getElementById(`sector-${b.dataset.sector}`);
    panel.classList.toggle('hidden');
    if (!panel.dataset.loaded && !panel.classList.contains('hidden')) loadSector(b.dataset.sector, panel);
  });
  if (sectors[0]) loadSector(sectors[0].id, document.getElementById(`sector-${sectors[0].id}`));
}

async function loadSector(id, panel) {
  panel.dataset.loaded = '1';
  const [rank, heat] = await Promise.all([safe(api.ivRanking(id)), safe(api.heatmap(id))]);
  const rows = rank.rankings || [];
  panel.innerHTML = `<div class="grid grid-cols-1 xl:grid-cols-2 gap-6 pt-5"><div class="space-y-3"><h3 class="text-xs font-black font-headline tracking-widest uppercase text-on-surface-variant">IV Ranking</h3><div class="space-y-2">${rows.map(r=>`<button data-open-ticker="${r.ticker}" class="w-full flex items-center gap-4 p-4 bg-surface-container-low rounded-2xl text-left hover:shadow-md hover:-translate-y-0.5 transition-all"><div class="w-11 h-11 rounded-2xl bg-white flex items-center justify-center"><span class="material-symbols-outlined text-primary">monitoring</span></div><div class="flex-1 min-w-0"><p class="font-bold">${r.ticker} <span class="text-on-surface-variant font-medium">${r.name||''}</span></p><p class="text-xs text-on-surface-variant">${Number(r.price||0).toFixed(2)}</p></div><div class="text-right"><p class="text-lg font-black font-headline">${Number(r.iv_rank ?? 0).toFixed(0)}</p><p class="text-[10px] font-bold text-on-surface-variant uppercase">IV Rank</p></div></button>`).join('') || '<p class="text-sm text-on-surface-variant">暂无排名</p>'}</div></div><div class="space-y-3"><h3 class="text-xs font-black font-headline tracking-widest uppercase text-on-surface-variant">IV Heatmap</h3>${renderHeatmap(heat.data || [], true)}</div></div>`;
}
