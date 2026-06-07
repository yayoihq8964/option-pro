const API_BASE = '/api';

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

export const api = {
  watchlist()           { return fetchJson(`${API_BASE}/stocks/watchlist`); },
  stock(ticker)         { const s = enc(ticker); return fetchJson(`${API_BASE}/stocks/${s}`); },
  chart(ticker, range = '1d') { const s = enc(ticker); return fetchJson(`${API_BASE}/stocks/${s}/chart?range=${encodeURIComponent(range)}`); },
  search(q)             { return fetchJson(`${API_BASE}/stocks/search?q=${encodeURIComponent(q)}`); },

  signals(ticker)       { const s = enc(ticker); return fetchJson(`${API_BASE}/signals/stock/${s}`); },
  topBottomSignals(ticker) { const s = enc(ticker); return fetchJson(`${API_BASE}/signals/stock/${s}/top-bottom`); },
  signalAI(ticker)      { const s = enc(ticker); return fetchJson(`${API_BASE}/signals/stock/${s}/ai-analysis`, { method:'POST', headers:{'Content-Type':'application/json'} }); },

  expirations(ticker)   { const s = enc(ticker); return fetchJson(`${API_BASE}/options/${s}/expirations`); },
  optionChain(ticker, exp) { const s = enc(ticker); const q = exp ? `?expiration=${encodeURIComponent(exp)}` : ''; return fetchJson(`${API_BASE}/options/${s}/chain${q}`); },

  analyzeAlerts(ticker, alerts = [], extra = {}) {
    return fetchJson(`${API_BASE}/ai/analyze-alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: String(ticker).toUpperCase(), alerts, ...extra })
    });
  },

  sectors()             { return fetchJson(`${API_BASE}/sectors`); },
  sectorIV(sectorId)    { return fetchJson(`${API_BASE}/sectors/${encodeURIComponent(sectorId)}/iv-ranking`); },
  sectorHeatmap(sectorId) { return fetchJson(`${API_BASE}/sectors/${encodeURIComponent(sectorId)}/heatmap`); },

  marketStatus()        { return fetchJson(`${API_BASE}/market/status`); },
  earnings()            { return fetchJson(`${API_BASE}/earnings/upcoming`); },

  earningsCorrelation() {
    return fetchJson(`${API_BASE}/ai/earnings-correlation`, { method:'POST', headers:{'Content-Type':'application/json'} });
  },
};

function enc(ticker) { return encodeURIComponent(String(ticker).toUpperCase()); }

export function safe(p) {
  return p.then(d => d).catch(e => ({ __error: true, message: e.message }));
}
