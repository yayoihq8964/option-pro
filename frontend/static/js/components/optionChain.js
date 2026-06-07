const money = (n) => n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toFixed(2);
const int = (n) => n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString();
const pct = (n) => n == null || Number.isNaN(Number(n)) ? '—' : (Number(n) * 100).toFixed(1) + '%';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const firstValid = (...values) => {
  for (const v of values) { if (v != null && !Number.isNaN(Number(v)) && Number(v) !== 0) return Number(v); }
  return null;
};

const optionVolume = (o = {}) => firstValid(o.volume, o.vol);
const optionOI = (o = {}) => firstValid(o.open_interest, o.oi, o.openInterest);
const optionIV = (o = {}) => firstValid(o.implied_volatility, o.iv);

export function renderExpirationSelect(expirations = [], selected = '') {
  return `<select id="expiration-select" class="bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20">
    ${expirations.map(e => `<option value="${e}" ${e === selected ? 'selected' : ''}>${e}</option>`).join('')}
  </select>`;
}

/** Render unusual activity alerts above the chain */
export function renderAlerts(alerts = []) {
  if (!alerts.length) return '';
  const meta = (a = {}) => {
    const dir = a.inferred_direction || a.signal || 'unknown';
    if (dir === 'bullish') return { icon: 'trending_up', bg: 'bg-tertiary-container/40', text: 'text-tertiary', chip: 'bg-tertiary/15 text-tertiary', label: '方向推断偏多' };
    if (dir === 'bearish') return { icon: 'trending_down', bg: 'bg-error-container/40', text: 'text-error', chip: 'bg-error/15 text-error', label: '方向推断偏空' };
    return { icon: 'help', bg: 'bg-surface-container-low', text: 'text-on-surface-variant', chip: 'bg-surface-container text-on-surface-variant', label: '方向未知' };
  };
  return `<div class="space-y-2 mb-5">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <h4 class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
        <span class="material-symbols-outlined text-primary text-base">notifications_active</span>
        异动信号
      </h4>
      <span class="text-[10px] font-bold text-on-surface-variant">方向推断，非确定性判断</span>
    </div>
    ${alerts.map(a => {
      const m = meta(a);
      const expText = a.expiration ? `${String(a.expiration).slice(5).replace('-', '/')}到期` : '到期日—';
      return `<div class="flex items-center gap-3 p-3 rounded-xl ${m.bg}">
        <span class="material-symbols-outlined text-lg ${m.text}">${m.icon}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-sm">${a.type === 'call' ? 'CALL' : 'PUT'} ${money(a.strike)} · ${esc(expText)} · DTE ${a.dte ?? '—'}</span>
            <span class="text-[10px] font-bold text-on-surface-variant">Vol ${int(a.volume)} · OI ${int(a.open_interest)}</span>
            ${a.premium_flow ? `<span class="text-[10px] font-bold ${m.text}">$${Number(a.premium_flow).toLocaleString()}</span>` : ''}
            <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${m.chip}">${m.label}</span>
          </div>
          <div class="flex gap-1.5 mt-1 flex-wrap">
            ${(a.reasons || []).map(r => `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${m.chip}">${esc(r)}</span>`).join('')}
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
    const cVol = optionVolume(c);
    const pVol = optionVolume(p);
    const cOI = optionOI(c);
    const pOI = optionOI(p);
    const cIV = optionIV(c);
    const pIV = optionIV(p);

    return `<tr class="${atm ? 'bg-primary/5 border-y border-primary/20' : ''} hover:bg-surface-container-low/60 transition-colors">
      <td class="px-3 py-2.5 text-center text-xs tabular-nums">${cVol != null ? int(cVol) : '—'}</td>
      <td class="px-3 py-2.5 text-center text-xs tabular-nums text-on-surface-variant">${cOI != null ? int(cOI) : '—'}</td>
      <td class="px-3 py-2.5 text-center text-xs tabular-nums text-on-surface-variant">${cIV ? pct(cIV) : '—'}</td>
      <td class="px-3 py-2.5 text-center"><span class="px-2.5 py-1 rounded-full ${atm ? 'bg-primary text-on-primary font-black' : 'bg-surface-container font-bold'} text-xs font-headline tabular-nums">${money(strike)}</span></td>
      <td class="px-3 py-2.5 text-center text-xs tabular-nums text-on-surface-variant">${pIV ? pct(pIV) : '—'}</td>
      <td class="px-3 py-2.5 text-center text-xs tabular-nums text-on-surface-variant">${pOI != null ? int(pOI) : '—'}</td>
      <td class="px-3 py-2.5 text-center text-xs tabular-nums">${pVol != null ? int(pVol) : '—'}</td>
    </tr>`;
  }).join('');

  return `
    ${renderAlerts(chain.alerts || [])}
    <div class="overflow-x-auto custom-scrollbar rounded-3xl border border-outline-variant/10 bg-surface-container-lowest">
      <table class="w-full text-sm">
        <thead class="text-[10px] uppercase tracking-widest text-on-surface-variant bg-surface-container-low">
          <tr>
            <th class="px-3 py-2.5 text-center">成交量</th>
            <th class="px-3 py-2.5 text-center">持仓量</th>
            <th class="px-3 py-2.5 text-center">IV</th>
            <th class="px-3 py-2.5 text-center font-black">行权价</th>
            <th class="px-3 py-2.5 text-center">IV</th>
            <th class="px-3 py-2.5 text-center">持仓量</th>
            <th class="px-3 py-2.5 text-center">成交量</th>
          </tr>
          <tr class="text-[9px] text-on-surface-variant/60">
            <th class="px-3 pb-2 text-left" colspan="3">CALLS ←</th>
            <th class="px-3 pb-2 text-center">STRIKE</th>
            <th class="px-3 pb-2 text-right" colspan="3">→ PUTS</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-outline-variant/5">${rows || '<tr><td colspan="7" class="p-8 text-center text-on-surface-variant">暂无期权链</td></tr>'}</tbody>
      </table>
    </div>`;
}
