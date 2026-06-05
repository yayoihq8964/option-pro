const json = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};
export const api = {
  searchStocks: (q) => json(`/api/stocks/search?q=${encodeURIComponent(q)}`),
  stock: (t) => json(`/api/stocks/${encodeURIComponent(t)}`),
  chart: (t, range = "1d") =>
    json(
      `/api/stocks/${encodeURIComponent(t)}/chart?range=${encodeURIComponent(range)}`,
    ),
  expirations: (t) => json(`/api/options/${encodeURIComponent(t)}/expirations`),
  chain: (t, e) =>
    json(
      `/api/options/${encodeURIComponent(t)}/chain?expiration=${encodeURIComponent(e)}`,
    ),
  unusual: (type = "all", min = 1) =>
    json(
      `/api/options/unusual?type=${encodeURIComponent(type)}&min_vol_oi=${encodeURIComponent(min)}`,
    ),
  sectors: () => json("/api/sectors"),
  ivRanking: (id) => json(`/api/sectors/${encodeURIComponent(id)}/iv-ranking`),
  heatmap: (id) => json(`/api/sectors/${encodeURIComponent(id)}/heatmap`),
  marketStatus: () => json("/api/market/status"),
};
