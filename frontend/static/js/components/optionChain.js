const money = (n) => n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toFixed(2);
const int = (n) => n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString();

export function renderExpirationSelect(expirations = [], selected = '') {
  return `<select id="expiration-select" class="bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20">
    ${expirations.map(e => `<option value="${e}" ${e === selected ? 'selected' : ''}>${e}</option>`).join('')}
  </select>`;
}

export function renderOptionChain(chain) {
  if (!chain || chain.__error) return `<div class="rounded-3xl bg-surface-container-low p-8 text-center text-sm text-on-surface-variant">期权链暂无数据</div>`;
  const groups = chain.grouped_by_strike || {};
  let rows = Object.keys(groups).map(Number).sort((a,b)=>a-b).map((strike) => {
    const g = groups[strike] || {};
    const c = g.call || g.calls || (chain.calls || []).find(x => Number(x.strike) === strike) || {};
    const p = g.put || g.puts || (chain.puts || []).find(x => Number(x.strike) === strike) || {};
    const atm = Math.abs(strike - Number(chain.underlying_price || 0)) < Math.max(1, Number(chain.underlying_price || 0) * .01);
    return `<tr class="${atm ? 'bg-primary/5' : ''} hover:bg-surface-container-low transition-colors">
      <td class="px-4 py-3 text-left font-bold text-tertiary">${money(c.lastPrice ?? c.last ?? c.bid ?? c.premium)}</td>
      <td class="px-4 py-3 text-center text-on-surface-variant">${int(c.openInterest ?? c.oi)}</td>
      <td class="px-4 py-3 text-center"><span class="px-3 py-1 rounded-full bg-surface-container font-black font-headline">${money(strike)}</span></td>
      <td class="px-4 py-3 text-center text-on-surface-variant">${int(p.openInterest ?? p.oi)}</td>
      <td class="px-4 py-3 text-right font-bold text-error">${money(p.lastPrice ?? p.last ?? p.bid ?? p.premium)}</td>
    </tr>`;
  }).join('');
  if (!rows) rows = '<tr><td colspan="5" class="p-8 text-center text-on-surface-variant">暂无期权链</td></tr>';
  return `<div class="overflow-x-auto custom-scrollbar rounded-3xl border border-outline-variant/10 bg-surface-container-lowest">
    <table class="w-full text-sm">
      <thead class="text-[10px] uppercase tracking-widest text-on-surface-variant bg-surface-container-low"><tr>
        <th class="px-4 py-3 text-left">CALL Premium</th><th class="px-4 py-3 text-center">OI</th><th class="px-4 py-3 text-center">Strike</th><th class="px-4 py-3 text-center">OI</th><th class="px-4 py-3 text-right">PUT Premium</th>
      </tr></thead>
      <tbody class="divide-y divide-outline-variant/10">${rows}</tbody>
    </table>
  </div>`;
}
