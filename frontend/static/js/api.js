const API_BASE = '/api';

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function tryEndpoints(paths) {
  let lastError;
  for (const path of paths) {
    try {
      return await fetchJson(path);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No API endpoint configured');
}

export const api = {
  watchlist() {
    return tryEndpoints([
      `${API_BASE}/watchlist`,
      `${API_BASE}/market/watchlist`,
      '/watchlist'
    ]);
  },

  stock(ticker) {
    const symbol = encodeURIComponent(String(ticker).toUpperCase());
    return tryEndpoints([
      `${API_BASE}/stock/${symbol}`,
      `${API_BASE}/stocks/${symbol}`,
      `${API_BASE}/market/stock/${symbol}`,
      `${API_BASE}/market/stocks/${symbol}`,
      `${API_BASE}/quote/${symbol}`,
      `${API_BASE}/market/quote/${symbol}`
    ]);
  },

  chart(ticker, range = '1M') {
    const symbol = encodeURIComponent(String(ticker).toUpperCase());
    const window = encodeURIComponent(range);
    return tryEndpoints([
      `${API_BASE}/chart/${symbol}?range=${window}`,
      `${API_BASE}/stocks/${symbol}/chart?range=${window}`,
      `${API_BASE}/market/chart/${symbol}?range=${window}`,
      `${API_BASE}/market/stocks/${symbol}/chart?range=${window}`
    ]);
  },

  signals(ticker) {
    const symbol = encodeURIComponent(String(ticker).toUpperCase());
    return tryEndpoints([
      `${API_BASE}/signals/${symbol}`,
      `${API_BASE}/stocks/${symbol}/signals`,
      `${API_BASE}/market/signals/${symbol}`,
      `${API_BASE}/market/stocks/${symbol}/signals`
    ]);
  },

  topBottomSignals(ticker) {
    const symbol = encodeURIComponent(String(ticker).toUpperCase());
    return tryEndpoints([
      `${API_BASE}/signals/${symbol}/top-bottom`,
      `${API_BASE}/top-bottom-signals/${symbol}`,
      `${API_BASE}/stocks/${symbol}/top-bottom-signals`,
      `${API_BASE}/market/signals/${symbol}/top-bottom`,
      `${API_BASE}/market/stocks/${symbol}/top-bottom-signals`
    ]);
  },

  expirations(ticker) {
    const symbol = encodeURIComponent(String(ticker).toUpperCase());
    return tryEndpoints([
      `${API_BASE}/expirations/${symbol}`,
      `${API_BASE}/stocks/${symbol}/expirations`,
      `${API_BASE}/options/${symbol}/expirations`,
      `${API_BASE}/market/expirations/${symbol}`,
      `${API_BASE}/market/options/${symbol}/expirations`
    ]);
  },

  optionChain(ticker, expiration) {
    const symbol = encodeURIComponent(String(ticker).toUpperCase());
    const expiry = encodeURIComponent(String(expiration || ''));
    const suffix = expiry ? `?expiration=${expiry}` : '';
    return tryEndpoints([
      `${API_BASE}/option-chain/${symbol}${suffix}`,
      `${API_BASE}/option_chain/${symbol}${suffix}`,
      `${API_BASE}/options/${symbol}/chain${suffix}`,
      `${API_BASE}/stocks/${symbol}/options${suffix}`,
      `${API_BASE}/market/option-chain/${symbol}${suffix}`,
      `${API_BASE}/market/option_chain/${symbol}${suffix}`,
      `${API_BASE}/market/options/${symbol}/chain${suffix}`
    ]);
  },

  analyzeAlerts(ticker, alerts = []) {
    const symbol = encodeURIComponent(String(ticker).toUpperCase());
    return fetchJson(`${API_BASE}/ai/analyze-alerts/${symbol}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alerts })
    });
  },

  analyzeTopBottomSignals(ticker, signals = {}) {
    const symbol = encodeURIComponent(String(ticker).toUpperCase());
    return fetchJson(`${API_BASE}/ai/analyze-top-bottom-signals/${symbol}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signals })
    });
  },

  sectors() {
    return tryEndpoints([
      `${API_BASE}/sectors`,
      `${API_BASE}/market/sectors`,
      '/sectors'
    ]);
  },

  ivRanking() {
    return tryEndpoints([
      `${API_BASE}/iv-ranking`,
      `${API_BASE}/iv_ranking`,
      `${API_BASE}/market/iv-ranking`,
      `${API_BASE}/market/iv_ranking`,
      '/iv-ranking'
    ]);
  },

  heatmap() {
    return tryEndpoints([
      `${API_BASE}/heatmap`,
      `${API_BASE}/market/heatmap`,
      '/heatmap'
    ]);
  },

  earnings() {
    return tryEndpoints([
      `${API_BASE}/earnings`,
      `${API_BASE}/market/earnings`,
      '/earnings'
    ]);
  },

  earningsCorrelation(ticker = 'Earnings') {
    const symbol = encodeURIComponent(String(ticker || 'Earnings').toUpperCase());
    return fetchJson(`${API_BASE}/ai/earnings-correlation/${symbol}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  },

  marketStatus() {
    return tryEndpoints([`${API_BASE}/market/status`]);
  },

  signalAI(ticker) {
    const symbol = encodeURIComponent(String(ticker).toUpperCase());
    return fetchJson(`${API_BASE}/signals/stock/${symbol}/ai-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export function safe(p) {
  return p.then((d) => d).catch((e) => ({ __error: true, message: e.message }));
}
