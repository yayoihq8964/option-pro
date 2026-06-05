import { api } from '../api.js';
import { openModal } from './modal.js';

export function initSearch(root) {
  if (!root) return;
  root.innerHTML = `<div class="relative"><span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span><input id="stock-search" class="w-full bg-surface-container-low rounded-full py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/20" placeholder="搜索股票..."/><div id="search-results" class="hidden absolute top-11 left-0 right-0 bg-white rounded-2xl shadow-2xl border border-outline-variant/10 overflow-hidden z-[80]"></div></div>`;
  const input = root.querySelector('#stock-search');
  const box = root.querySelector('#search-results');
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 1) { box.classList.add('hidden'); return; }
    timer = setTimeout(async () => {
      try {
        const res = await api.search(q);
        const items = res.results || res.stocks || res || [];
        box.innerHTML = items.slice(0, 8).map(x => `<button data-ticker="${x.ticker || x.symbol}" class="w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors"><span class="font-bold">${x.ticker || x.symbol}</span><span class="text-sm text-on-surface-variant ml-2">${x.name || ''}</span></button>`).join('') || '<div class="p-4 text-sm text-on-surface-variant">无结果</div>';
        box.classList.remove('hidden');
      } catch { box.innerHTML = '<div class="p-4 text-sm text-error">搜索失败</div>'; box.classList.remove('hidden'); }
    }, 180);
  });
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ticker]');
    if (!btn) return;
    openModal(btn.dataset.ticker);
    box.classList.add('hidden');
    input.value = '';
  });
  document.addEventListener('click', (e) => { if (!root.contains(e.target)) box.classList.add('hidden'); });
}
