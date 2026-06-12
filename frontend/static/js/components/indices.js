import { api, safe } from '../api.js';

const INDICES = [
  { symbol: '^GSPC',     label: 'S&P 500' },
  { symbol: '^IXIC',     label: 'NASDAQ' },
  { symbol: '^DJI',      label: 'DOW' },
  { symbol: '^N225',     label: '日经 225' },
  { symbol: '000001.SS', label: '上证综指' }
];

const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtPrice = (n) => Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtPct = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
};

function renderItem(idx) {
  const pct = Number(idx.changePercent ?? 0);
  const toneClass = pct > 0 ? 'up' : pct < 0 ? 'down' : '';
  return `<button class="ticker-item" type="button" data-index-symbol="${esc(idx.symbol)}" title="打开 ${esc(idx.label)} 详情">
    <strong>${esc(idx.label)}</strong>
    <span class="mono" data-numeric>${fmtPrice(idx.price)}</span>
    <em class="${toneClass} mono" data-numeric>${fmtPct(pct)}</em>
  </button>`;
}

export async function mountIndexTicker() {
  const track = document.getElementById('index-ticker-track');
  if (!track) return;

  // Initial skeleton with labels only
  track.innerHTML = INDICES.map(i => `<button class="ticker-item" type="button" data-index-symbol="${esc(i.symbol)}" title="加载中"><strong>${esc(i.label)}</strong><span class="mono">—</span><em class="mono">—</em></button>`).join('');
  bindClicks();

  // ONE batch request (backend fast_info) instead of 5 per-ticker overview
  // calls that each ran yfinance's slow full `.info` scrape.
  let data = INDICES;
  const batch = await safe(api.marketIndices());
  if (!batch?.__error && Array.isArray(batch?.indices)) {
    const bySymbol = new Map(batch.indices.map(q => [q.symbol, q]));
    data = INDICES.map(idx => {
      const q = bySymbol.get(idx.symbol);
      if (!q || q.price == null) return idx;
      return { ...idx, price: Number(q.price), changePercent: Number(q.change_percent) };
    });
  } else {
    // Fallback to per-ticker overview endpoint (older backend)
    const results = await Promise.all(INDICES.map(i => safe(api.stock(i.symbol))));
    data = INDICES.map((idx, i) => {
      const r = results[i];
      if (r?.__error) return idx;
      return {
        ...idx,
        price: Number(r.price ?? r.regularMarketPrice ?? r.last),
        changePercent: Number(r.change_percent ?? r.changePercent ?? r.regularMarketChangePercent)
      };
    });
  }

  track.innerHTML = data.map(renderItem).join('');
  bindClicks();
}

function bindClicks() {
  document.querySelectorAll('[data-index-symbol]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sym = btn.dataset.indexSymbol;
      if (sym) location.hash = `#detail/${encodeURIComponent(sym)}`;
    });
  });
}
