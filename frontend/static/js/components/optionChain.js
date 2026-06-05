const money = (n) => n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toFixed(2);
const int = (n) => n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString();
const pct = (n) => n == null || Number.isNaN(Number(n)) ? '—' : (Number(n) * 100).toFixed(1) + '%';

const firstValid = (...values) => {
  for (const v of values) { if (v != null && !Number.isNaN(Number(v)) && Number(v) !== 0) return Number(v); }
  return null;
};

const optionPremium = (o = {}) => firstValid(o.last_price, o.lastPrice, o.last, o.premium, o.mid, o.midpoint, o.bid);
const optionVolume = (o = {}) => firstValid(o.volume, o.vol);
const optionOI = (o = {}) => firstValid(o.open_interest, o.oi, o.openInterest);
const optionIV = (o = {}) => firstValid(o.implied_volatility, o.iv);

export function renderExpirationSelect(expirations = [], selected = '') {
  return `<select id="expiration-select" class="bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20">
    ${expirations.map(e => `<option value="${e}" ${e === selected ? 'selected' : ''}>${e}</option>`).join('')}
  </select>`;
}

/** Render unusual activity alerts above the chain */
function renderAlerts(alerts = []) {
  if (!alerts.length) return '';
  return `<div class="space-y-2 mb-5">
    <h4 class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
      <span class="material-symbols-outlined text-primary text-base">notifications_active</span>
      异动信号
    </h4>
    ${alerts.map(a => {
      const bull = a.signal === 'bullish';
      return `<div class="flex items-center gap-3 p-3 rounded-xl ${bull ? 'bg-tertiary-container/40' : 'bg-error-container/40'}">
        <span class="material-symbols-outlined text-lg ${bull ? 'text-tertiary' : 'text-error'}">${bull ? 'trending_up' : 'trending_down'}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-sm">${a.type === 'call' ? 'CALL' : 'PUT'} ${money(a.strike)}</span>
            <span class="text-[10px] font-bold text-on-surface-variant">Vol ${int(a.volume)} · OI ${int(a.open_interest)}</span>
            ${a.premium_flow ? `<span class="text-[10px] font-bold ${bull ? 'text-tertiary' : 'text-error'}">$${Number(a.premium_flow).toLocaleString()}</span>` : ''}
          </div>
          <div class="flex gap-1.5 mt-1 flex-wrap">
            ${a.reasons.map(r => `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${bull ? 'bg-tertiary/15 text-tertiary' : 'bg-error/15 text-error'}">${r}</span>`).join('')}
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

export function renderOptionChain(chain) {
  if (!chain || chain.__error) return `<div class="rounded-3xl bg-surface-container-low p-8 text-center text-sm text-on-surface-variant">期权链暂无数据</div>`;

  const underlying = Number(chain.underlying_price || 0);
  const groups = chain.grouped_by_strike || {};
  let allStrikes = Object.keys(groups).map(Number).sort((a, b) => a - b);

  // ── Filter to ATM ± 10 strikes ──
  if (underlying > 0 && allStrikes.length > 20) {
    const atmIdx = allStrikes.reduce((best, s, i) =>
      Math.abs(s - underlying) < Math.abs(allStrikes[best] - underlying) ? i : best, 0);
    const lo = Math.max(0, atmIdx - 10);
    const hi = Math.min(allStrikes.length, atmIdx + 11);
    allStrikes = allStrikes.slice(lo, hi);
  }

  const rows = allStrikes.map((strike) => {
    const g = groups[strike] || groups[String(strike)] || groups[strike.toFixed(1)] || groups[strike + '.0'] || {};
    const c = g.call || {};
    const p = g.put || {};
    const atm = underlying > 0 && Math.abs(strike - underlying) < Math.max(1, underlying * 0.008);
    const cPrem = optionPremium(c);
    const pPrem = optionPremium(p);
    const cVol = optionVolume(c);
    const pVol = optionVolume(p);
    const cOI = optionOI(c);
    const pOI = optionOI(p);
    const cIV = optionIV(c);
    const pIV = optionIV(p);

    return `<tr class="${atm ? 'bg-primary/5 border-y border-primary/20' : ''} hover:bg-surface-container-low/60 transition-colors">
      <td class="px-3 py-2.5 text-left font-bold tabular-nums ${cPrem ? 'text-tertiary' : 'text-on-surface-variant/40'}">${money(cPrem)}</td>
      <td class="px-3 py-2.5 text-center text-xs tabular-nums">${cVol != null ? int(cVol) : '—'}</td>
      <td class="px-3 py-2.5 text-center text-xs tabular-nums text-on-surface-variant">${cOI != null ? int(cOI) : '—'}</td>
      <td class="px-3 py-2.5 text-center text-xs tabular-nums text-on-surface-variant">${cIV ? pct(cIV) : '—'}</td>
      <td class="px-3 py-2.5 text-center"><span class="px-2.5 py-1 rounded-full ${atm ? 'bg-primary text-on-primary font-black' : 'bg-surface-container font-bold'} text-xs font-headline tabular-nums">${money(strike)}</span></td>
      <td class="px-3 py-2.5 text-center text-xs tabular-nums text-on-surface-variant">${pIV ? pct(pIV) : '—'}</td>
      <td class="px-3 py-2.5 text-center text-xs tabular-nums text-on-surface-variant">${pOI != null ? int(pOI) : '—'}</td>
      <td class="px-3 py-2.5 text-center text-xs tabular-nums">${pVol != null ? int(pVol) : '—'}</td>
      <td class="px-3 py-2.5 text-right font-bold tabular-nums ${pPrem ? 'text-error' : 'text-on-surface-variant/40'}">${money(pPrem)}</td>
    </tr>`;
  }).join('');

  return `
    ${renderAlerts(chain.alerts || [])}
    <div class="overflow-x-auto custom-scrollbar rounded-3xl border border-outline-variant/10 bg-surface-container-lowest">
      <table class="w-full text-sm">
        <thead class="text-[10px] uppercase tracking-widest text-on-surface-variant bg-surface-container-low">
          <tr>
            <th class="px-3 py-2.5 text-left">权利金</th>
            <th class="px-3 py-2.5 text-center">成交量</th>
            <th class="px-3 py-2.5 text-center">持仓量</th>
            <th class="px-3 py-2.5 text-center">IV</th>
            <th class="px-3 py-2.5 text-center font-black">行权价</th>
            <th class="px-3 py-2.5 text-center">IV</th>
            <th class="px-3 py-2.5 text-center">持仓量</th>
            <th class="px-3 py-2.5 text-center">成交量</th>
            <th class="px-3 py-2.5 text-right">权利金</th>
          </tr>
          <tr class="text-[9px] text-on-surface-variant/60">
            <th class="px-3 pb-2 text-left" colspan="4">CALLS ←</th>
            <th class="px-3 pb-2 text-center">STRIKE</th>
            <th class="px-3 pb-2 text-right" colspan="4">→ PUTS</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-outline-variant/5">${rows || '<tr><td colspan="9" class="p-8 text-center text-on-surface-variant">暂无期权链</td></tr>'}</tbody>
      </table>
    </div>`;
}
