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

export function getHeatmapTileColor(value = 0, mode = 'auto') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '#fbf9f8';

  // IV mode: 0-100 percentile. Low IV = emerald (calm), high IV = crimson (volatile), mid = white.
  // Smooth continuous gradient over the whole range so 44, 50, 56 all look distinct.
  const useIvMode = mode === 'iv' || (mode === 'auto' && Math.abs(number) > 10);
  if (useIvMode) {
    if (number < 50) {
      // 0 = strong emerald, 50 = white
      const t = clamp((50 - number) / 50, 0, 1);
      return mixColor('#ffffff', '#059669', t * 0.78);
    } else {
      // 50 = white, 100 = strong crimson
      const t = clamp((number - 50) / 50, 0, 1);
      return mixColor('#ffffff', '#ba1a1a', t * 0.78);
    }
  }

  // Performance mode: small percent values like -5% to +5%
  if (number === 0) return '#fbf9f8';
  const intensity = clamp(Math.abs(number) / 5, 0, 1);
  return number > 0
    ? mixColor('#d1fae5', '#059669', intensity)
    : mixColor('#fee2e2', '#ba1a1a', intensity);
}

export function normalizeHeatmapPayload(payload) {
  const items = Array.isArray(payload)
    ? payload
    : (payload?.data ?? payload?.heatmap ?? payload?.items ?? payload?.sectors ?? payload?.rankings ?? []);

  return items.map((item) => {
    const ticker = String(item.ticker ?? item.symbol ?? item.name ?? item.sector ?? '').toUpperCase();
    // Detect IV mode vs performance mode
    const ivVal = item.iv_percentile ?? item.iv ?? item.ivRank ?? item.iv_rank ?? item.impliedVolatility ?? item.implied_volatility;
    const perfVal = item.changePercent ?? item.change_percentage ?? item.changePct ?? item.change_pct ?? item.percentChange ?? item.performance ?? item.change;
    const isIv = ivVal != null;
    const rawValue = isIv ? ivVal : (perfVal ?? 0);
    const value = Number(rawValue);
    const rawWeight = item.weight ?? item.marketCapWeight ?? item.market_cap_weight ?? item.size ?? 1;
    const weight = Number(rawWeight);
    return {
      ticker,
      label: item.label ?? item.companyName ?? item.company_name ?? item.name ?? ticker,
      value: Number.isFinite(value) ? value : 0,
      mode: isIv ? 'iv' : 'perf',
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
        const color = getHeatmapTileColor(item.value, item.mode);
        const distance = item.mode === 'iv' ? Math.abs(item.value - 50) : Math.abs(item.value);
        const intense = item.mode === 'iv' ? distance > 25 : distance > 2.6;
        const textColor = intense ? '#ffffff' : '#000000';
        const valueLabel = item.mode === 'iv'
          ? `IV ${Number(item.value).toFixed(0)}`
          : formatPercent(item.value);
        // Hide duplicate label when label == ticker
        const showLabel = item.label && String(item.label).toUpperCase() !== item.ticker;
        return `
          <button class="heatmap-tile" type="button" data-ticker="${escapeHtml(item.ticker)}" style="--tile-bg: ${color}; --tile-text: ${textColor};" aria-label="打开 ${escapeHtml(item.ticker)} 详情">
            <span class="heatmap-tile__ticker mono font-data-mono" data-numeric>${escapeHtml(item.ticker)}</span>
            ${showLabel ? `<span class="heatmap-tile__label">${escapeHtml(item.label)}</span>` : '<span></span>'}
            <strong class="heatmap-tile__change mono font-data-mono" data-numeric>${valueLabel}</strong>
          </button>
        `;
      }).join('')}
    </div>
  `;
}
