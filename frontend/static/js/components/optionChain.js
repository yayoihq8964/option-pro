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

/** Render unusual activity alerts above the chain (Ethos style) */
export function renderAlerts(alerts = []) {
  if (!alerts.length) return '';
  const meta = (a = {}) => {
    const dir = a.inferred_direction || a.signal || 'unknown';
    if (dir === 'bullish') return {
      icon: 'trending_up',
      bg: '#ecfdf5',
      accent: 'var(--color-emerald)',
      chipBg: '#dff5ec',
      label: '方向推断偏多'
    };
    if (dir === 'bearish') return {
      icon: 'trending_down',
      bg: '#fef2f2',
      accent: 'var(--color-crimson)',
      chipBg: '#ffdad6',
      label: '方向推断偏空'
    };
    return {
      icon: 'help',
      bg: 'var(--color-surface)',
      accent: 'var(--color-muted)',
      chipBg: 'var(--color-container)',
      label: '方向未知'
    };
  };

  return `<div style="display:grid;gap:12px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <span class="label-caps" style="display:inline-flex;align-items:center;gap:6px">
        <span class="material-symbols-outlined" style="font-size:14px">notifications_active</span>
        异动信号
      </span>
      <span class="label-caps" style="color:var(--color-muted);font-weight:700">方向推断 · 非确定性判断</span>
    </div>
    <div style="display:grid;gap:8px">
      ${alerts.map(a => {
        const m = meta(a);
        const expText = a.expiration ? `${String(a.expiration).slice(5).replace('-', '/')}到期` : '到期日—';
        return `<div style="display:flex;align-items:flex-start;gap:12px;padding:14px;background:${m.bg};border:1px solid var(--color-border);border-radius:8px">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;background:${m.chipBg};color:${m.accent};flex-shrink:0">
            <span class="material-symbols-outlined" style="font-size:18px">${m.icon}</span>
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
              <strong class="mono" style="font-size:13px;font-weight:800;color:var(--color-on-surface)">${a.type === 'call' ? 'CALL' : 'PUT'} ${money(a.strike)}</strong>
              <span class="label-caps" style="color:var(--color-muted)">${esc(expText)} · DTE ${esc(a.dte ?? '—')}</span>
              <span class="label-caps" style="background:#fff;border:1px solid var(--color-border);color:${m.accent};padding:3px 7px;border-radius:999px">${m.label}</span>
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:6px;font-size:12px;color:var(--color-muted)">
              <span class="mono">Vol ${int(a.volume)}</span>
              <span class="mono">OI ${int(a.open_interest)}</span>
              ${a.premium_flow ? `<span class="mono" style="color:${m.accent};font-weight:700">$${Number(a.premium_flow).toLocaleString()}</span>` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${(a.reasons || []).map(r => `<span style="padding:3px 7px;background:#fff;border:1px solid var(--color-border);border-radius:4px;font-size:10px;font-weight:700;color:var(--color-muted)">${esc(r)}</span>`).join('')}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

export function renderOptionChain(chain) {
  if (!chain || chain.__error) return `<div style="padding:32px;text-align:center;color:var(--color-muted);font-size:13px">期权链暂无数据</div>`;

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

  const fmtDelta = (d) => (d == null || Number.isNaN(Number(d))) ? '—' : Number(d).toFixed(2);
  const fmtGamma = (g) => (g == null || Number.isNaN(Number(g))) ? '—' : Number(g).toFixed(3);

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

    const cellStyle = 'padding:8px 10px;font-size:12px;text-align:right';
    const strikeCellStyle = atm
      ? 'padding:8px 10px;text-align:center;background:#000;color:#fff;font-weight:800;font-family:"JetBrains Mono"'
      : 'padding:8px 10px;text-align:center;background:var(--color-surface);font-weight:800;font-family:"JetBrains Mono"';

    // Delta color: green for ITM, fade for OTM
    const deltaColor = (d) => {
      if (d == null) return 'var(--color-muted)';
      const abs = Math.abs(Number(d));
      if (abs >= 0.5) return 'var(--color-on-surface)';
      if (abs >= 0.2) return 'var(--color-muted)';
      return '#9c9c9c';
    };

    return `<tr style="${atm ? 'background:#fafaf8' : ''};border-bottom:1px solid var(--color-border)">
      <td class="mono" style="${cellStyle}">${cVol != null ? int(cVol) : '—'}</td>
      <td class="mono" style="${cellStyle};color:var(--color-muted)">${cOI != null ? int(cOI) : '—'}</td>
      <td class="mono" style="${cellStyle};color:${deltaColor(c.delta)}">${fmtDelta(c.delta)}</td>
      <td class="mono" style="${cellStyle};color:var(--color-muted)">${fmtGamma(c.gamma)}</td>
      <td class="mono" style="${cellStyle};color:var(--color-muted)">${cIV ? pct(cIV) : '—'}</td>
      <td style="${strikeCellStyle}">${money(strike)}</td>
      <td class="mono" style="${cellStyle};color:var(--color-muted)">${pIV ? pct(pIV) : '—'}</td>
      <td class="mono" style="${cellStyle};color:var(--color-muted)">${fmtGamma(p.gamma)}</td>
      <td class="mono" style="${cellStyle};color:${deltaColor(p.delta)}">${fmtDelta(p.delta)}</td>
      <td class="mono" style="${cellStyle};color:var(--color-muted)">${pOI != null ? int(pOI) : '—'}</td>
      <td class="mono" style="${cellStyle}">${pVol != null ? int(pVol) : '—'}</td>
    </tr>`;
  }).join('');

  return `<div style="overflow-x:auto;border:1px solid var(--color-border);border-radius:8px;background:#fff">
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:var(--color-surface);border-bottom:1px solid var(--color-border)">
          <th colspan="5" class="label-caps" style="padding:10px;text-align:center">← CALLS</th>
          <th class="label-caps" style="padding:10px;text-align:center;background:#fff;color:#000;font-weight:800">STRIKE</th>
          <th colspan="5" class="label-caps" style="padding:10px;text-align:center">PUTS →</th>
        </tr>
        <tr style="background:var(--color-surface);border-bottom:1px solid var(--color-border)">
          <th class="label-caps" style="padding:8px 10px;text-align:right">VOL</th>
          <th class="label-caps" style="padding:8px 10px;text-align:right">OI</th>
          <th class="label-caps" style="padding:8px 10px;text-align:right">Δ</th>
          <th class="label-caps" style="padding:8px 10px;text-align:right">Γ</th>
          <th class="label-caps" style="padding:8px 10px;text-align:right">IV</th>
          <th class="label-caps" style="padding:8px 10px;text-align:center">行权价</th>
          <th class="label-caps" style="padding:8px 10px;text-align:right">IV</th>
          <th class="label-caps" style="padding:8px 10px;text-align:right">Γ</th>
          <th class="label-caps" style="padding:8px 10px;text-align:right">Δ</th>
          <th class="label-caps" style="padding:8px 10px;text-align:right">OI</th>
          <th class="label-caps" style="padding:8px 10px;text-align:right">VOL</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="11" style="padding:32px;text-align:center;color:var(--color-muted)">暂无期权链</td></tr>'}</tbody>
    </table>
  </div>`;
}

export function renderExpirationSelect(expirations = [], selected = '') {
  return `<select id="expiration-select" class="option-expiration-select">
    ${expirations.map(e => `<option value="${esc(e)}" ${e === selected ? 'selected' : ''}>${esc(e)}</option>`).join('')}
  </select>`;
}
