const API_BASE = '';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  watchlist: () => request('/api/stocks/watchlist'),
  stock: (ticker) => request(`/api/stocks/${encodeURIComponent(ticker)}`),
  chart: (ticker, range = '1d') => request(`/api/stocks/${encodeURIComponent(ticker)}/chart?range=${encodeURIComponent(range)}`),
  signals: (ticker) => request(`/api/stocks/${encodeURIComponent(ticker)}/signals`),
  expirations: (ticker) => request(`/api/options/${encodeURIComponent(ticker)}/expirations`),
  optionChain: (ticker, expiration) => request(`/api/options/${encodeURIComponent(ticker)}/chain?expiration=${encodeURIComponent(expiration)}`),
  sectors: () => request('/api/sectors'),
  ivRanking: (id) => request(`/api/sectors/${encodeURIComponent(id)}/iv-ranking`),
  heatmap: (id) => request(`/api/sectors/${encodeURIComponent(id)}/heatmap`),
  earnings: () => request('/api/earnings/upcoming'),
  marketStatus: () => request('/api/market/status'),
  search: (q) => request(`/api/stocks/search?q=${encodeURIComponent(q)}`),
};

export function safe(promise, fallback = null) {
  return promise.catch((error) => ({ __error: error.message, fallback }));
}
