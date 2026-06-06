import { api } from '../api.js';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return number.toLocaleString('en-US');
}

function normalizeExpirations(payload) {
  const expirations = Array.isArray(payload) ? payload : (payload?.expirations ?? payload?.data ?? payload?.dates ?? []);
  return expirations.map((item) => typeof item === 'string' ? item : (item.date ?? item.expiration ?? item.expiry)).filter(Boolean);
}

function normalizeLeg(raw = {}, type) {
  return {
    type,
    bid: raw.bid ?? raw.b,
    ask: raw.ask ?? raw.a,
    last: raw.last ?? raw.lastPrice ?? raw.price,
    volume: raw.volume ?? raw.vol,
    openInterest: raw.openInterest ?? raw.open_interest ?? raw.oi,
    impliedVolatility: raw.impliedVolatility ?? raw.iv ?? raw.implied_volatility,
    delta: raw.delta,
    unusual: Boolean(raw.unusual ?? raw.isUnusual ?? raw.unusual_activity),
    alert: raw.alert ?? raw.alertType ?? raw.sentiment
  };
}

function normalizeChain(payload) {
  const source = payload?.data ?? payload?.chain ?? payload?.optionChain ?? payload ?? {};
  const rows = [];

  const combined = source.rows ?? source.strikes ?? source.options;
  if (Array.isArray(combined)) {
    combined.forEach((row) => {
      const strike = Number(row.strike ?? row.strikePrice ?? row.price);
      if (Number.isFinite(strike)) {
        rows.push({
          strike,
          call: normalizeLeg(row.call ?? row.calls ?? row, 'call'),
          put: normalizeLeg(row.put ?? row.puts ?? row, 'put')
        });
      }
    });
  }

  const calls = source.calls ?? payload?.calls;
  const puts = source.puts ?? payload?.puts;
  if (!rows.length && (Array.isArray(calls) || Array.isArray(puts))) {
    const byStrike = new Map();
    (calls || []).forEach((call) => {
      const strike = Number(call.strike ?? call.strikePrice);
      if (Number.isFinite(strike)) byStrike.set(strike, { ...(byStrike.get(strike) || {}), strike, call: normalizeLeg(call, 'call') });
    });
    (puts || []).forEach((put) => {
      const strike = Number(put.strike ?? put.strikePrice);
      if (Number.isFinite(strike)) byStrike.set(strike, { ...(byStrike.get(strike) || {}), strike, put: normalizeLeg(put, 'put') });
    });
    rows.push(...byStrike.values());
  }

  const underlying = Number(source.underlyingPrice ?? source.underlying ?? source.spot ?? payload?.underlyingPrice);
  const sorted = rows.filter((row) => Number.isFinite(row.strike)).sort((a, b) => a.strike - b.strike);
  const atmStrike = Number(source.atmStrike ?? payload?.atmStrike) || sorted.reduce((closest, row) => {
    if (!Number.isFinite(underlying)) return closest ?? row.strike;
    if (closest == null) return row.strike;
    return Math.abs(row.strike - underlying) < Math.abs(closest - underlying) ? row.strike : closest;
  }, null);

  return { rows: sorted, underlyingPrice: underlying, atmStrike };
}

function getAlertTone(leg = {}) {
  const signal = String(leg.alert ?? '').toLowerCase();
  if (leg.type === 'call' || signal.includes('bull') || signal.includes('call')) return 'bullish';
  if (leg.type === 'put' || signal.includes('bear') || signal.includes('put')) return 'bearish';
  return '';
}

function renderAlertChip(leg) {
  if (!leg?.unusual && !leg?.alert) return '';
  const tone = getAlertTone(leg);
  const label = tone === 'bearish' ? 'Bearish Flow' : 'Bullish Flow';
  return `<span class="option-alert-chip option-alert-chip--${tone}">${label}</span>`;
}

function renderLegCells(leg = {}) {
  return `
    <td class="mono font-data-mono" data-numeric>${formatNumber(leg.bid)}</td>
    <td class="mono font-data-mono" data-numeric>${formatNumber(leg.ask)}</td>
    <td class="mono font-data-mono" data-numeric>${formatNumber(leg.last)}</td>
    <td class="mono font-data-mono" data-numeric>${formatVolume(leg.volume)}</td>
    <td class="mono font-data-mono" data-numeric>${formatVolume(leg.openInterest)}</td>
    <td class="mono font-data-mono option-iv" data-numeric>${formatNumber(Number(leg.impliedVolatility) > 3 ? leg.impliedVolatility : Number(leg.impliedVolatility) * 100, 1)}%</td>
  `;
}

function renderTable(chain) {
  if (!chain.rows.length) {
    return '<div class="option-chain-empty">No option chain data available for this expiration.</div>';
  }

  return `
    <div class="option-chain-table-wrap">
      <table class="option-chain-table">
        <thead>
          <tr class="option-chain-superhead">
            <th colspan="7">Calls</th>
            <th>Strike</th>
            <th colspan="7">Puts</th>
          </tr>
          <tr>
            <th>Bid</th><th>Ask</th><th>Last</th><th>Vol</th><th>OI</th><th>IV</th><th>Alert</th>
            <th>Strike</th>
            <th>Alert</th><th>IV</th><th>OI</th><th>Vol</th><th>Last</th><th>Ask</th><th>Bid</th>
          </tr>
        </thead>
        <tbody>
          ${chain.rows.map((row) => {
            const isAtm = Number(row.strike) === Number(chain.atmStrike);
            return `
              <tr class="${isAtm ? 'is-atm' : ''}">
                ${renderLegCells(row.call)}
                <td>${renderAlertChip(row.call)}</td>
                <td class="option-strike mono font-data-mono" data-numeric>${formatNumber(row.strike)}</td>
                <td>${renderAlertChip(row.put)}</td>
                <td class="mono font-data-mono option-iv" data-numeric>${formatNumber(Number(row.put?.impliedVolatility) > 3 ? row.put?.impliedVolatility : Number(row.put?.impliedVolatility) * 100, 1)}%</td>
                <td class="mono font-data-mono" data-numeric>${formatVolume(row.put?.openInterest)}</td>
                <td class="mono font-data-mono" data-numeric>${formatVolume(row.put?.volume)}</td>
                <td class="mono font-data-mono" data-numeric>${formatNumber(row.put?.last)}</td>
                <td class="mono font-data-mono" data-numeric>${formatNumber(row.put?.ask)}</td>
                <td class="mono font-data-mono" data-numeric>${formatNumber(row.put?.bid)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export async function mountOptionChain(container, ticker, initialExpirations = []) {
  if (!container) return;
  container.innerHTML = '<section class="option-chain-card panel"><span class="label-caps">Options Chain</span><div class="option-chain-empty">Loading option chain…</div></section>';

  try {
    let expirations = initialExpirations;
    if (!expirations.length) expirations = normalizeExpirations(await api.expirations(ticker));
    const selected = expirations[0] ?? '';

    container.innerHTML = `
      <section class="option-chain-card panel" aria-labelledby="option-chain-title">
        <div class="option-chain-toolbar">
          <div>
            <span class="label-caps">Options Chain</span>
            <h2 id="option-chain-title">${escapeHtml(ticker)} Calls | Strike | Puts</h2>
          </div>
          <label class="option-expiration-field label-caps">
            Expiration
            <select class="option-expiration-select" data-option-expiration>
              ${expirations.map((date) => `<option value="${escapeHtml(date)}" ${date === selected ? 'selected' : ''}>${escapeHtml(date)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div data-option-chain-body class="option-chain-body"><div class="option-chain-empty">Loading ${escapeHtml(selected || 'latest')} chain…</div></div>
      </section>
    `;

    const body = container.querySelector('[data-option-chain-body]');
    const select = container.querySelector('[data-option-expiration]');
    const loadChain = async (expiration) => {
      body.innerHTML = '<div class="option-chain-empty">Loading option chain…</div>';
      const chain = normalizeChain(await api.optionChain(ticker, expiration));
      body.innerHTML = renderTable(chain);
    };

    select?.addEventListener('change', () => loadChain(select.value).catch((error) => {
      console.warn('Option chain load failed', error);
      body.innerHTML = `<div class="option-chain-empty">${escapeHtml(error.message ?? 'Unable to load option chain.')}</div>`;
    }));

    if (selected) await loadChain(selected);
    else body.innerHTML = '<div class="option-chain-empty">No expiration dates available.</div>';
  } catch (error) {
    console.warn(`Failed to mount option chain for ${ticker}`, error);
    container.innerHTML = `<section class="option-chain-card panel"><span class="label-caps">Options Chain</span><div class="option-chain-empty">${escapeHtml(error.message ?? 'Unable to load options.')}</div></section>`;
  }
}
