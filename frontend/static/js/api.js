const API_BASE = '/api';

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function enc(ticker) { return encodeURIComponent(String(ticker).toUpperCase()); }

export const api = {
  watchlist()           { return fetchJson(`${API_BASE}/stocks/watchlist`); },
  stock(ticker)         { return fetchJson(`${API_BASE}/stocks/${enc(ticker)}`); },
  chart(ticker, range = '1d') { return fetchJson(`${API_BASE}/stocks/${enc(ticker)}/chart?range=${encodeURIComponent(range)}`); },
  search(q)             { return fetchJson(`${API_BASE}/stocks/search?q=${encodeURIComponent(q)}`); },

  signals(ticker)       { return fetchJson(`${API_BASE}/signals/stock/${enc(ticker)}`); },
  topBottomSignals(ticker) { return fetchJson(`${API_BASE}/signals/stock/${enc(ticker)}/top-bottom`); },
  signalAI(ticker)      { return fetchJson(`${API_BASE}/signals/stock/${enc(ticker)}/ai-analysis`, { method:'POST', headers:{'Content-Type':'application/json'} }); },
  analyzeTopBottomSignals(ticker) { return fetchJson(`${API_BASE}/signals/stock/${enc(ticker)}/ai-analysis`, { method:'POST', headers:{'Content-Type':'application/json'} }); },

  expirations(ticker)   { return fetchJson(`${API_BASE}/options/${enc(ticker)}/expirations`); },
  optionChain(ticker, exp) { const q = exp ? `?expiration=${encodeURIComponent(exp)}` : ''; return fetchJson(`${API_BASE}/options/${enc(ticker)}/chain${q}`); },

  // Accept either (ticker, alerts, extra) OR ({ticker, alerts, underlying_price, expiration})
  analyzeAlerts(arg1, alerts = [], extra = {}) {
    const body = (typeof arg1 === 'object' && arg1 !== null && !Array.isArray(arg1))
      ? arg1
      : { ticker: String(arg1).toUpperCase(), alerts, ...extra };
    return fetchJson(`${API_BASE}/ai/analyze-alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  },

  sectors()             { return fetchJson(`${API_BASE}/sectors`); },
  sectorIV(sectorId)    { return fetchJson(`${API_BASE}/sectors/${encodeURIComponent(sectorId)}/iv-ranking`); },
  sectorHeatmap(sectorId) { return fetchJson(`${API_BASE}/sectors/${encodeURIComponent(sectorId)}/heatmap`); },

  marketStatus()        { return fetchJson(`${API_BASE}/market/status`); },
  earnings()            { return fetchJson(`${API_BASE}/earnings/upcoming`); },

  earningsCorrelation() {
    return fetchJson(`${API_BASE}/ai/earnings-correlation`);
  },
};

export function safe(p) {
  return p.then(d => d).catch(e => ({ __error: true, message: e.message }));
}
