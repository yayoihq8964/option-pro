function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const sign = number > 0 ? '+' : '';
  return `${sign}${number.toFixed(2)}%`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const value = parseInt(normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixColor(start, end, amount) {
  const [r1, g1, b1] = hexToRgb(start);
  const [r2, g2, b2] = hexToRgb(end);
  const mix = (from, to) => Math.round(from + (to - from) * amount);
  return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
}

export function getHeatmapTileColor(value = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '#fbf9f8';

  // Ethos IV mode: API values above normal daily % ranges are treated as IV / IV rank.
  // Low IV = emerald, high IV = crimson, mid IV = warm surface neutrals.
  if (Math.abs(number) > 10) {
    if (number <= 35) return mixColor('#ecfdf5', '#059669', clamp((35 - number) / 35, 0, 0.72));
    if (number >= 65) return mixColor('#fee2e2', '#ba1a1a', clamp((number - 65) / 35, 0, 1));
    return mixColor('#ffffff', '#efedeb', clamp(Math.abs(number - 50) / 15, 0, 1));
  }

  const intensity = clamp(Math.abs(number) / 5, 0, 1);
  // Performance fallback keeps the same Ethos tokens: positive/low-risk emerald, negative/high-risk crimson.
  return number > 0
    ? mixColor('#d1fae5', '#059669', intensity)
    : mixColor('#fee2e2', '#ba1a1a', intensity);
}

export function normalizeHeatmapPayload(payload) {
  const items = Array.isArray(payload)
    ? payload
    : (payload?.heatmap ?? payload?.items ?? payload?.data ?? payload?.sectors ?? []);

  return items.map((item) => {
    const ticker = String(item.ticker ?? item.symbol ?? item.name ?? item.sector ?? '').toUpperCase();
    const rawChange = item.iv ?? item.ivRank ?? item.iv_rank ?? item.impliedVolatility ?? item.implied_volatility ?? item.changePercent ?? item.change_percentage ?? item.changePct ?? item.change_pct ?? item.percentChange ?? item.performance ?? item.change ?? 0;
    const changePercent = Number(rawChange);
    const rawWeight = item.weight ?? item.marketCapWeight ?? item.market_cap_weight ?? item.size ?? 1;
    const weight = Number(rawWeight);
    return {
      ticker,
      label: item.label ?? item.companyName ?? item.company_name ?? item.name ?? ticker,
      changePercent: Number.isFinite(changePercent) ? (Math.abs(changePercent) > 50 && Math.abs(changePercent) < 1000 ? changePercent / 100 : changePercent) : 0,
      weight: Number.isFinite(weight) && weight > 0 ? weight : 1
    };
  }).filter((item) => item.ticker);
}

export function renderHeatmap(payload = []) {
  const items = normalizeHeatmapPayload(payload);
  if (!items.length) {
    return '<div class="heatmap-empty">暂无热力图数据。</div>';
  }

  return `
    <div class="heatmap-grid" aria-label="板块热力图">
      ${items.map((item) => {
        const color = getHeatmapTileColor(item.changePercent);
        const isPositive = item.changePercent >= 0;
        const textColor = Math.abs(item.changePercent) >= 2.6 ? '#ffffff' : '#000000';
        return `
          <button class="heatmap-tile" type="button" data-ticker="${escapeHtml(item.ticker)}" style="--tile-bg: ${color}; --tile-grow: ${clamp(item.weight, 1, 3)}; --tile-text: ${textColor};" aria-label="打开 ${escapeHtml(item.ticker)} 详情">
            <span class="heatmap-tile__ticker mono font-data-mono" data-numeric>${escapeHtml(item.ticker)}</span>
            <span class="heatmap-tile__label">${escapeHtml(item.label)}</span>
            <strong class="heatmap-tile__change mono font-data-mono ${isPositive ? 'positive' : 'negative'}" data-numeric>${formatPercent(item.changePercent)}</strong>
          </button>
        `;
      }).join('')}
    </div>
  `;
}
