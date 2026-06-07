/**
 * Custom watchlist stored in localStorage.
 * Returns null when user has never customized — fall back to backend default.
 */

const KEY = 'optix.watchlist.custom.v1';

export function getCustomTickers() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr.map(t => String(t).toUpperCase()).filter(Boolean);
  } catch {
    return null;
  }
}

export function saveCustomTickers(tickers) {
  const clean = (tickers || []).map(t => String(t).toUpperCase().trim()).filter(Boolean);
  // Dedup while preserving order
  const seen = new Set();
  const out = [];
  for (const t of clean) { if (!seen.has(t)) { seen.add(t); out.push(t); } }
  localStorage.setItem(KEY, JSON.stringify(out));
  return out;
}

export function addTicker(ticker) {
  const list = getCustomTickers() || [];
  const t = String(ticker).toUpperCase().trim();
  if (!t || list.includes(t)) return list;
  list.push(t);
  return saveCustomTickers(list);
}

export function removeTicker(ticker) {
  const list = getCustomTickers() || [];
  const t = String(ticker).toUpperCase();
  return saveCustomTickers(list.filter(x => x !== t));
}

export function moveTicker(ticker, direction) {
  const list = (getCustomTickers() || []).slice();
  const t = String(ticker).toUpperCase();
  const i = list.indexOf(t);
  if (i < 0) return list;
  const j = direction === 'left' ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return saveCustomTickers(list);
}

export function resetCustom() {
  localStorage.removeItem(KEY);
}

/**
 * Initialize custom watchlist from backend default if user has no custom yet.
 * Returns the list of tickers to display.
 */
export function initCustomFromBackend(backendGroups) {
  const existing = getCustomTickers();
  if (existing && existing.length) return existing;
  // Pull all tickers from backend groups, dedup
  const all = [];
  const seen = new Set();
  for (const g of backendGroups || []) {
    for (const s of (g.stocks || [])) {
      const t = String(s.ticker || '').toUpperCase();
      if (t && !seen.has(t)) { seen.add(t); all.push(t); }
    }
  }
  saveCustomTickers(all);
  return all;
}

/**
 * Reorder & filter backend-provided stocks by the custom ticker list,
 * appending any custom tickers that backend didn't return as placeholders.
 */
export function applyCustomOrder(backendStocks, customTickers) {
  const map = new Map(backendStocks.map(s => [String(s.ticker || '').toUpperCase(), s]));
  const out = [];
  for (const t of customTickers) {
    if (map.has(t)) out.push(map.get(t));
    else out.push({ ticker: t, _placeholder: true, price: null, change_percent: null, name_cn: '', sector: '' });
  }
  return out;
}
