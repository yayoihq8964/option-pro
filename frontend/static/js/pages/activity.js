import { api } from "../api.js";
const fmt = (n, d = 2) =>
  Number(n || 0).toLocaleString("zh-CN", { maximumFractionDigits: d });
export async function mountActivity(root, state) {
  state.activityType = state.activityType || "all";
  state.minVolOi = state.minVolOi || 1;
  root.innerHTML = '<div class="h-96 skeleton rounded-xl"></div>';
  let data;
  try {
    data = await api.unusual(state.activityType, state.minVolOi);
  } catch (e) {
    data = {
      results: [
        {
          ticker: "NVDA",
          name: "NVIDIA",
          contract_type: "call",
          strike: 120,
          expiration: "2026-07-18",
          volume: 48120,
          open_interest: 11200,
          vol_oi_ratio: 4.3,
          premium: 1850000,
          last_price: 3.85,
          implied_volatility: 0.62,
          underlying_price: 118.32,
          underlying_change_pct: 3.97,
        },
        {
          ticker: "TSLA",
          name: "Tesla",
          contract_type: "put",
          strike: 180,
          expiration: "2026-01-16",
          volume: 22980,
          open_interest: 6100,
          vol_oi_ratio: 3.8,
          premium: 940000,
          last_price: 4.15,
          implied_volatility: 0.71,
          underlying_price: 184.1,
          underlying_change_pct: -2.1,
        },
      ],
    };
  }
  const rows = data.results || [];
  const calls = rows.filter((r) => r.contract_type === "call").length,
    puts = rows.length - calls;
  root.innerHTML = `<div class="grid grid-cols-12 gap-gutter fade-in"><div class="col-span-12 lg:col-span-9 space-y-lg"><section class="card overflow-hidden"><div class="glass-header px-xl py-md border-b border-outline-variant/20 flex flex-wrap gap-md items-center justify-between"><div class="flex items-center gap-md"><span class="material-symbols-outlined text-primary">analytics</span><h1 class="font-headline-lg-mobile md:font-headline-lg">期权异动</h1></div><div class="flex gap-xs">${[
    ["all", "全部"],
    ["call", "看涨"],
    ["put", "看跌"],
  ]
    .map(
      ([v, l]) =>
        `<button data-type="${v}" class="px-md py-xs rounded-xl font-label-sm ${state.activityType === v ? "tab-active" : "hover:bg-surface-container-low text-on-surface-variant"}">${l}</button>`,
    )
    .join(
      "",
    )}</div></div><div class="px-xl py-md bg-surface-container-low flex items-center gap-md"><span class="font-label-sm text-on-surface-variant uppercase">Volume/OI &gt; ${state.minVolOi}</span><input id="ratio" type="range" min="1" max="10" step=".5" value="${state.minVolOi}" class="accent-primary w-56"></div><div class="overflow-x-auto custom-scrollbar"><table class="w-full min-w-[860px]"><thead class="bg-surface-container-low"><tr>${["代码", "类型", "行权价", "到期日", "详情", "权利金", "情绪"].map((h) => `<th class="px-xl py-sm text-left font-label-sm text-on-surface-variant uppercase">${h}</th>`).join("")}</tr></thead><tbody class="divide-y divide-outline-variant/20">${rows
    .map((r) => {
      const bull = r.contract_type === "call";
      return `<tr class="hover:bg-surface-container/50"><td class="px-xl py-md"><b class="text-primary">${r.ticker}</b><p class="text-label-sm text-on-surface-variant">$${fmt(r.underlying_price)} · <span class="${r.underlying_change_pct >= 0 ? "positive" : "negative"}">${r.underlying_change_pct >= 0 ? "+" : ""}${fmt(r.underlying_change_pct)}%</span></p></td><td class="px-xl py-md"><span class="px-sm py-base rounded-full font-label-sm ${bull ? "bg-secondary-container text-on-secondary-container" : "bg-error-container text-on-error-container"}">${bull ? "CALL" : "PUT"}</span></td><td class="px-xl py-md font-data-mono font-bold">${fmt(r.strike)}</td><td class="px-xl py-md font-data-mono">${r.expiration}</td><td class="px-xl py-md"><p class="font-data-mono">Vol ${fmt(r.volume, 0)}</p><p class="text-label-sm text-on-surface-variant">OI ${fmt(r.open_interest, 0)} · ${fmt(r.vol_oi_ratio)}x</p></td><td class="px-xl py-md font-data-mono font-bold">$${fmt(r.premium, 0)}</td><td class="px-xl py-md"><span class="material-symbols-outlined ${bull ? "text-secondary" : "text-error"}">${bull ? "trending_up" : "trending_down"}</span></td></tr>`;
    })
    .join(
      "",
    )}</tbody></table></div></section></div><aside class="col-span-12 lg:col-span-3 space-y-lg"><section class="card p-lg"><h2 class="font-headline-md mb-lg">市场热度</h2><div class="space-y-md"><div><div class="flex justify-between text-label-sm mb-xs"><span>Call Volume</span><b>${calls}</b></div><div class="h-2 bg-surface-container rounded-full"><div class="h-full bg-secondary rounded-full" style="width:${rows.length ? (calls / rows.length) * 100 : 0}%"></div></div></div><div><div class="flex justify-between text-label-sm mb-xs"><span>Put Volume</span><b>${puts}</b></div><div class="h-2 bg-surface-container rounded-full"><div class="h-full bg-error rounded-full" style="width:${rows.length ? (puts / rows.length) * 100 : 0}%"></div></div></div></div></section><section class="card p-lg"><p class="font-label-sm text-on-surface-variant uppercase">VIX Placeholder</p><p class="font-display text-display mt-sm">18.4</p><p class="positive font-bold">-2.1%</p></section><section class="card p-lg"><h2 class="font-headline-md mb-md">热门代码</h2>${[
    ...new Set(rows.map((r) => r.ticker)),
  ]
    .slice(0, 5)
    .map(
      (t) =>
        `<div class="py-sm border-b border-outline-variant/20 last:border-0 font-bold text-primary">${t}</div>`,
    )
    .join("")}</section></aside></div>`;
  root.querySelectorAll("[data-type]").forEach(
    (b) =>
      (b.onclick = () => {
        state.activityType = b.dataset.type;
        mountActivity(root, state);
      }),
  );
  root.querySelector("#ratio").onchange = (e) => {
    state.minVolOi = e.target.value;
    mountActivity(root, state);
  };
}
