import { api } from "../api.js";
import { renderCandlestick } from "../components/chart.js";
import { optionChainHTML } from "../components/optionChain.js";

const fmt = (n, d = 2) =>
  Number(n || 0).toLocaleString("zh-CN", { maximumFractionDigits: d });
const money = (n) =>
  Number(n || 0) >= 1e12
    ? (n / 1e12).toFixed(2) + "万亿"
    : Number(n || 0) >= 1e8
      ? (n / 1e8).toFixed(2) + "亿"
      : fmt(n, 0);
const pos = (n) => Number(n) >= 0;

export async function mountDashboard(root, state) {
  const ticker = state.ticker || "NVDA";

  root.innerHTML = dashboardSkeletonHTML();

  let stock;
  let stockError = null;
  try {
    stock = await api.stock(ticker);
  } catch (e) {
    stockError = e;
    stock = {
      ticker,
      name: ticker,
      price: 0,
      change: 0,
      change_percent: 0,
      volume: 0,
      market_cap: 0,
    };
  }

  renderHero(root, stock, state, stockError);

  api
    .chart(ticker, state.range || "1d")
    .then((chart) => {
      renderCandlestick(root.querySelector("#priceChart"), chart.bars || [], stock.price || 0);
    })
    .catch((e) => {
      const chartEl = root.querySelector("#priceChart");
      if (chartEl) {
        chartEl.innerHTML = `<p class="text-center text-on-surface-variant p-xl">图表加载失败${e?.message ? `: ${e.message}` : ""}</p>`;
      }
    });

  loadOptionChain(root, ticker, state, stock.price || 0);
}

function dashboardSkeletonHTML() {
  return `<div class="grid grid-cols-12 gap-gutter fade-in"><div class="col-span-12 lg:col-span-9 space-y-lg"><section class="card p-xl"><div class="h-28 skeleton rounded-xl"></div><div class="h-[400px] skeleton rounded-lg mt-xl"></div></section><div class="h-80 skeleton rounded-xl"></div></div><div class="col-span-12 lg:col-span-3 space-y-lg"><div class="h-64 skeleton rounded-xl"></div><div class="h-64 skeleton rounded-xl"></div></div></div>`;
}

function renderHero(root, stock, state, error = null) {
  const up = pos(stock.change);
  const ticker = stock.ticker || state.ticker || "NVDA";
  root.innerHTML = `<div class="grid grid-cols-12 gap-gutter fade-in"><div class="col-span-12 lg:col-span-9 space-y-lg"><section class="card p-xl"><div class="flex flex-col md:flex-row justify-between items-start gap-lg mb-xl"><div><div class="flex flex-wrap items-center gap-md mb-base"><h1 class="font-display text-headline-lg-mobile md:text-headline-lg text-on-surface">${stock.name || ticker}</h1><span class="px-sm py-base bg-surface-container rounded-lg font-data-mono text-primary text-body-md">$${ticker}</span></div>${error ? `<div class="mb-md rounded-xl border border-error/20 bg-error-container/40 px-md py-sm text-label-sm text-error">股票数据加载失败，已显示空状态：${error.message || "请求失败"}</div>` : ""}<div class="flex flex-wrap items-baseline gap-md"><span class="font-display text-display text-on-surface">${fmt(stock.price)}</span><div class="flex items-center ${up ? "text-secondary" : "text-error"} gap-xs font-semibold"><span class="material-symbols-outlined text-[20px]">${up ? "arrow_upward" : "arrow_downward"}</span><span class="text-body-lg">${up ? "+" : ""}${fmt(stock.change)} (${up ? "+" : ""}${fmt(stock.change_percent)}%)</span></div></div></div><div class="flex gap-sm"><div class="text-right"><p class="text-label-sm text-on-surface-variant uppercase">成交量</p><p class="font-data-mono text-body-md font-bold">${money(stock.volume)}</p></div><div class="h-10 w-px bg-outline-variant mx-sm"></div><div class="text-right"><p class="text-label-sm text-on-surface-variant uppercase">市值</p><p class="font-data-mono text-body-md font-bold">${money(stock.market_cap)}</p></div></div></div><div class="relative"><div id="priceChart" class="w-full h-[400px] chart-grid relative rounded-lg border border-outline-variant/20 overflow-hidden bg-white"><div class="h-full skeleton rounded-lg"></div></div><div class="absolute top-md left-md flex gap-xs">${[
    ["1d", "分时"],
    ["5d", "5日"],
    ["1m", "1月"],
    ["1y", "1年"],
    ["all", "全部"],
  ]
    .map(
      ([r, l]) =>
        `<button class="range-btn ${(state.range || "1d") === r ? "active" : ""}" data-range="${r}">${l}</button>`,
    )
    .join("")}</div></div></section><div id="chainWrap"></div></div><div class="col-span-12 lg:col-span-3 space-y-lg">${earningsCard()}${insightCard(stock)}${sentimentCard()}</div></div>`;

  root.querySelectorAll("[data-range]").forEach(
    (b) =>
      (b.onclick = () => {
        state.range = b.dataset.range;
        mountDashboard(root, state);
      }),
  );
}

async function loadOptionChain(root, ticker, state, underlyingPrice) {
  const chainWrap = root.querySelector("#chainWrap");
  if (!chainWrap) return;
  chainWrap.innerHTML = '<div class="card p-xl"><div class="h-60 skeleton rounded-xl"></div><p class="text-center text-on-surface-variant text-label-sm mt-md">期权链加载中... (免费API可能较慢)</p></div>';

  try {
    const exps = await api.expirations(ticker);
    const expList = exps.expirations || [];
    if (expList.length === 0) {
      chainWrap.innerHTML = '<div class="card p-xl text-center text-on-surface-variant">暂无可用期权数据</div>';
      return;
    }

    const selectedExpiration = state.expiration || expList[0];
    const chain = await api.chain(ticker, selectedExpiration);
    if (!chain.underlying_price && underlyingPrice) chain.underlying_price = underlyingPrice;
    chain.expiration = selectedExpiration;
    chainWrap.innerHTML = optionChainHTML(chain, {
      expirationSelect: `<select id="expSel" class="rounded-lg border-outline-variant bg-surface-container-low text-label-sm focus:ring-primary focus:border-primary">${expList.map((e) => `<option ${e === selectedExpiration ? "selected" : ""}>${e}</option>`).join("")}</select>`,
    });

    root.querySelector("#expSel")?.addEventListener("change", async (e) => {
      const nextExpiration = e.target.value;
      state.expiration = nextExpiration;
      chainWrap.innerHTML = '<div class="h-80 skeleton rounded-xl"></div>';
      try {
        const nextChain = await api.chain(ticker, nextExpiration);
        if (!nextChain.underlying_price && underlyingPrice) nextChain.underlying_price = underlyingPrice;
        nextChain.expiration = nextExpiration;
        chainWrap.innerHTML = optionChainHTML(nextChain, {
          expirationSelect: `<span class="text-label-sm text-on-surface-variant">到期日: ${nextExpiration}</span>`,
        });
      } catch (e2) {
        chainWrap.innerHTML = `<div class="card p-xl text-center"><p class="text-on-surface-variant">期权链加载失败</p><p class="text-label-sm text-error mt-sm">${e2.message || "请求失败"}</p></div>`;
      }
    });
  } catch (e) {
    chainWrap.innerHTML = `<div class="card p-xl text-center"><p class="text-on-surface-variant">期权链加载失败</p><p class="text-label-sm text-error mt-sm">${e.message || "请求失败"}</p></div>`;
  }
}

function earningsCard() {
  return `<section class="card p-lg"><div class="flex items-center gap-md mb-lg"><span class="material-symbols-outlined text-primary">calendar_month</span><h2 class="font-headline-md">即将公布的财报</h2></div><div class="space-y-md">${[
    ["T", "特斯拉 (Tesla Inc.)", "TSLA • 盘后", "10月23日", "高波动"],
    ["A", "超微半导体 (AMD)", "AMD • 盘前", "10月29日", "待发布"],
    ["A", "亚马逊 (Amazon)", "AMZN • 盘后", "10月31日", "待发布"],
  ]
    .map(
      (x) =>
        `<div class="flex items-center justify-between p-sm rounded-lg hover:bg-surface-container-low"><div class="flex items-center gap-md"><div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center font-bold text-primary">${x[0]}</div><div><p class="font-bold text-body-md">${x[1]}</p><p class="text-label-sm text-on-surface-variant">${x[2]}</p></div></div><div class="text-right"><p class="font-data-mono text-body-md font-bold text-primary">${x[3]}</p><p class="text-[10px] ${x[4] == "高波动" ? "text-secondary" : "text-on-surface-variant"} font-bold uppercase">${x[4]}</p></div></div>`,
    )
    .join("")}</div><button class="w-full mt-lg py-sm border border-outline-variant text-primary font-label-sm rounded-xl hover:bg-surface-container-low">查看完整日历</button></section>`;
}
function insightCard(s) {
  return `<section class="bg-primary-container text-on-primary-container rounded-xl p-lg shadow-xl relative overflow-hidden group"><div class="absolute top-0 right-0 w-32 h-32 bg-secondary opacity-10 rounded-full -mr-16 -mt-16 blur-3xl"></div><div class="relative z-10"><div class="flex items-center gap-md mb-md"><span class="material-symbols-outlined text-secondary-container icon-fill">auto_awesome</span><h2 class="font-headline-md text-surface-container-lowest">AI 洞察</h2></div><p class="text-body-md text-on-primary-container/90 leading-relaxed mb-lg">基于 <b class="text-secondary-container">${s.name || s.ticker}</b> 的表现，相关供应链标的在财报后呈现较强波动相关性。</p><div class="p-md bg-white/10 rounded-xl backdrop-blur-sm border border-white/10"><p class="text-label-sm text-on-primary-container/70 mb-sm uppercase tracking-widest font-bold">情绪预测</p><div class="flex items-center gap-md"><div class="flex-1 h-2 bg-white/10 rounded-full overflow-hidden"><div class="h-full bg-secondary-fixed w-[84%]"></div></div><span class="font-data-mono font-bold text-secondary-fixed">84% 看涨</span></div></div></div></section>`;
}
function sentimentCard() {
  return `<section class="bg-surface-container-highest/40 rounded-xl p-lg border border-outline-variant/30"><div class="flex justify-between items-center mb-md"><span class="font-label-sm text-on-surface-variant font-bold uppercase">恐惧与贪婪指数</span><span class="font-display font-bold text-secondary">64 - 贪婪</span></div><div class="relative h-1 w-full bg-outline-variant/30 rounded-full overflow-hidden"><div class="absolute left-0 top-0 h-full bg-gradient-to-r from-error via-surface-container-high to-secondary w-[64%]"></div><div class="absolute top-0 bottom-0 w-2 bg-on-surface-variant rounded-full -ml-1 shadow-sm" style="left:64%"></div></div></section>`;
}
