import { api } from "../api.js";
const debounce = (fn, ms = 250) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
export function mountSearch(el, onPick) {
  el.innerHTML = `<span class="material-symbols-outlined text-primary shrink-0">search</span><input class="min-w-0 flex-1 h-11 bg-transparent border-none p-0 text-body-md font-medium text-on-surface placeholder:text-on-surface-variant/70 focus:ring-0 focus:outline-none" placeholder="搜索代码、异动或行权价..." type="text" autocomplete="off"/><div class="search-dropdown hidden"></div>`;
  const input = el.querySelector("input"),
    dd = el.querySelector(".search-dropdown");
  const close = () => dd.classList.add("hidden");
  input.addEventListener(
    "input",
    debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) {
        close();
        return;
      }
      dd.classList.remove("hidden");
      dd.innerHTML = `<div class="p-md text-on-surface-variant">搜索中...</div>`;
      try {
        const data = await api.searchStocks(q);
        const rows = (data.results || []).slice(0, 8);
        dd.innerHTML = rows.length
          ? rows
              .map(
                (r) =>
                  `<button class="w-full flex justify-between items-center px-md py-sm hover:bg-surface-container-low text-left" data-ticker="${r.ticker}"><span><b class="text-primary">${r.ticker}</b><span class="ml-sm font-medium">${r.name || ""}</span><span class="block text-label-sm text-on-surface-variant mt-1">${r.primary_exchange || r.market || ""} · ${r.type || "Equity"}</span></span><span class="material-symbols-outlined text-on-surface-variant">north_east</span></button>`,
              )
              .join("")
          : `<div class="p-md text-on-surface-variant">未找到结果</div>`;
      } catch (e) {
        dd.innerHTML = `<div class="p-md text-error">搜索暂不可用</div>`;
      }
    }, 220),
  );
  dd.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ticker]");
    if (!b) return;
    input.value = b.dataset.ticker;
    close();
    onPick(b.dataset.ticker);
  });
  document.addEventListener("click", (e) => {
    if (!el.contains(e.target)) close();
  });
}
