import { api } from "../api.js";
import { heatmapHTML } from "../components/heatmap.js";
import { optionChainHTML } from "../components/optionChain.js";
const fmt = (n) =>
  Number(n || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const fallback = [
  { id: "semiconductors", name: "半导体" },
  { id: "software-infra", name: "软件基础设施" },
  { id: "biotech", name: "生物技术" },
  { id: "consumer-electronics", name: "消费电子" },
  { id: "energy", name: "能源" },
];

export async function mountSectors(root, state) {
  let sectors;
  try {
    const sectorResponse = await api.sectors();
    sectors = Array.isArray(sectorResponse) ? sectorResponse : sectorResponse.sectors;
  } catch (e) {
    sectors = fallback;
  }
  state.sectorId = state.sectorId || sectors[0]?.id || fallback[0].id;
  root.innerHTML = '<div class="h-96 skeleton rounded-xl"></div>';

  let rank = { rankings: [] };
  let heat = { rankings: [] };
  let loadError = null;
  try {
    [rank, heat] = await Promise.all([
      api.ivRanking(state.sectorId),
      api.heatmap(state.sectorId),
    ]);
  } catch (e) {
    loadError = e;
  }

  const rows = rank.rankings || [];
  const heatRows = heat.data || heat.rankings || [];
  const notice = loadError
    ? noticeHTML(`板块 IV 数据加载失败：${loadError.message || "请求失败"}`)
    : rows.length === 0
      ? noticeHTML("暂无板块 IV 数据")
      : "";

  root.innerHTML = `<div class="space-y-lg fade-in"><div class="flex gap-xs overflow-x-auto custom-scrollbar pb-xs">${sectors.map((s) => `<button data-sector="${s.id}" class="px-md py-sm shrink-0 rounded-xl font-label-sm ${state.sectorId === s.id ? "tab-active" : "bg-white hover:bg-surface-container-low text-on-surface-variant"}">${s.name}</button>`).join("")}</div><div class="grid grid-cols-12 gap-gutter"><section class="col-span-12 lg:col-span-9 card overflow-hidden"><div class="glass-header px-xl py-md border-b border-outline-variant/20 flex items-center gap-md"><span class="material-symbols-outlined text-primary">pie_chart</span><h1 class="font-headline-lg-mobile md:font-headline-lg">板块分析</h1></div>${notice || tableHTML(rows)}<div id="inlineChain" class="p-xl hidden"></div></section><aside class="col-span-12 lg:col-span-3 card p-lg"><h2 class="font-headline-md mb-lg">IV Heatmap</h2>${heatRows.length === 0 ? `<div class="rounded-xl border border-outline-variant/40 bg-surface-container-low p-lg text-center text-label-sm text-on-surface-variant">暂无热力图数据</div>` : heatmapHTML(heatRows)}</aside></div></div>`;

  root.querySelectorAll("[data-sector]").forEach(
    (b) =>
      (b.onclick = () => {
        state.sectorId = b.dataset.sector;
        mountSectors(root, state);
      }),
  );
  root.querySelectorAll("tr[data-ticker]").forEach(
    (tr) =>
      (tr.onclick = async () => {
        const box = root.querySelector("#inlineChain");
        box.classList.remove("hidden");
        box.innerHTML = '<div class="h-72 skeleton rounded-xl"></div>';
        try {
          const ex = (await api.expirations(tr.dataset.ticker)).expirations[0];
          if (!ex) {
            box.innerHTML = '<p class="text-on-surface-variant">暂无可用期权数据</p>';
            return;
          }
          box.innerHTML = optionChainHTML(
            await api.chain(tr.dataset.ticker, ex),
            { title: `${tr.dataset.ticker} 期权链`, compact: true },
          );
        } catch (e) {
          box.innerHTML = '<p class="text-error">期权链加载失败</p>';
        }
      }),
  );
}

function noticeHTML(message) {
  return `<div class="p-xl text-center"><div class="rounded-xl border border-outline-variant/40 bg-surface-container-low p-xl"><span class="material-symbols-outlined text-primary text-4xl mb-sm">info</span><p class="font-headline-md text-on-surface">${message}</p></div></div>`;
}

function tableHTML(rows) {
  return `<div class="overflow-x-auto"><table class="w-full min-w-[760px]"><thead class="bg-surface-container-low"><tr>${["代码", "价格", "IV排名", "IV%", "30日IV变化"].map((h) => `<th class="px-xl py-sm text-left font-label-sm text-on-surface-variant uppercase">${h}</th>`).join("")}</tr></thead><tbody class="divide-y divide-outline-variant/20">${rows.map((r) => `<tr class="hover:bg-surface-container/50 cursor-pointer" data-ticker="${r.ticker}"><td class="px-xl py-md"><b class="text-primary">${r.ticker}</b><p class="text-label-sm text-on-surface-variant">${r.name || ""}</p></td><td class="px-xl py-md font-data-mono">$${fmt(r.price)}</td><td class="px-xl py-md"><div class="flex items-center gap-sm"><div class="w-32 h-2 bg-surface-container rounded-full"><div class="h-full bg-primary rounded-full" style="width:${r.iv_rank || 0}%"></div></div><span class="font-data-mono">${fmt(r.iv_rank)}%</span></div></td><td class="px-xl py-md font-data-mono font-bold">${fmt(r.iv_percentile ?? r.iv_pct)}%</td><td class="px-xl py-md font-data-mono ${(r.iv_change_30d || 0) >= 0 ? "positive" : "negative"}">${(r.iv_change_30d || 0) >= 0 ? "+" : ""}${fmt(r.iv_change_30d)}%</td></tr>`).join("")}</tbody></table></div>`;
}
