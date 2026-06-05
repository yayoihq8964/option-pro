const fmt = (n) =>
  Number(n || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const oi = (n) =>
  Number(n || 0) >= 10000 ? (Number(n) / 10000).toFixed(2) + "万" : fmt(n);
export function optionChainHTML(chain, opts = {}) {
  const grouped = chain?.grouped_by_strike || {};
  const strikes = (chain?.strikes || Object.keys(grouped))
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const u = chain?.underlying_price || 0;
  const near = strikes.reduce(
    (a, b) => (Math.abs(b - u) < Math.abs(a - u) ? b : a),
    strikes[0] || 0,
  );
  const list = strikes.slice(
    Math.max(0, strikes.indexOf(near) - 4),
    Math.min(strikes.length, strikes.indexOf(near) + 5),
  );
  return `<section class="card overflow-hidden ${opts.compact ? "mt-lg" : ""}"><div class="glass-header px-xl py-md border-b border-outline-variant/20 flex flex-wrap gap-md justify-between items-center"><div class="flex items-center gap-md"><span class="material-symbols-outlined text-primary">layers</span><h2 class="font-headline-md text-on-surface">${opts.title || "热门期权链"}</h2></div>${opts.expirationSelect || `<span class="text-label-sm text-on-surface-variant">到期日: ${chain?.expiration || "--"}</span>`}</div><div class="overflow-x-auto custom-scrollbar"><table class="w-full border-collapse min-w-[680px]"><thead class="bg-surface-container-low"><tr><th class="px-xl py-sm text-left font-label-sm text-on-surface-variant uppercase">看涨期权权利金</th><th class="px-md py-sm text-center font-label-sm text-on-surface-variant uppercase">持仓量</th><th class="px-xl py-sm text-center font-label-sm text-primary uppercase bg-primary/5 border-x border-primary/10">行权价</th><th class="px-md py-sm text-center font-label-sm text-on-surface-variant uppercase">持仓量</th><th class="px-xl py-sm text-right font-label-sm text-on-surface-variant uppercase">看跌期权权利金</th></tr></thead><tbody class="divide-y divide-outline-variant/20">${list
    .map((k) => {
      const r = grouped[k] || grouped[String(k)] || {},
        c = r.call || {},
        p = r.put || {};
      const atm = Math.abs(k - near) < 0.001;
      return `<tr class="${atm ? "bg-surface-container-high/20 border-y-2 border-primary/10" : "hover:bg-surface-container/50"} transition-colors"><td class="px-xl py-md text-secondary font-data-mono font-bold">${fmt(c.mid || c.last_price || c.ask || 0)} <span class="text-[10px] text-on-surface-variant/60 font-normal ml-base">${c.change_percent ? `(${c.change_percent > 0 ? "+" : ""}${fmt(c.change_percent)}%)` : ""}</span></td><td class="px-md py-md text-center font-data-mono text-on-surface-variant">${oi(c.open_interest)}</td><td class="px-xl py-md text-center bg-primary/5 border-x border-primary/10 font-display font-bold ${atm ? "text-primary ring-1 ring-inset ring-primary/20" : "text-on-surface"}">${fmt(k)}</td><td class="px-md py-md text-center font-data-mono text-on-surface-variant">${oi(p.open_interest)}</td><td class="px-xl py-md text-right text-error font-data-mono font-bold">${fmt(p.mid || p.last_price || p.ask || 0)} <span class="text-[10px] text-on-surface-variant/60 font-normal ml-base">${p.change_percent ? `(${p.change_percent > 0 ? "+" : ""}${fmt(p.change_percent)}%)` : ""}</span></td></tr>`;
    })
    .join("")}</tbody></table></div></section>`;
}
