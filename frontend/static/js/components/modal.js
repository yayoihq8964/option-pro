import { api, safe } from '../api.js';
import { renderChart } from './chart.js';
import { renderSignals } from './signals.js';
import { renderTopBottomSignals } from './topBottomSignals.js';
import { renderAlerts } from './optionChain.js';
import { renderAlertAnalysisButton } from './aiAnalysis.js';

const money = n => n == null ? '—' : `$${Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const num = n => n == null ? '—' : Number(n).toLocaleString();
const large = n => n == null ? '—' : n >= 1e12 ? `$${(n/1e12).toFixed(2)}T` : n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : `$${Number(n).toLocaleString()}`;

let chartHandle = null;
let closeHandler = null;

export function openModal(ticker) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div id="asset-backdrop" class="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 transition-all duration-200 bg-transparent">
    <div id="asset-modal" class="glass-modal w-full max-w-6xl max-h-[90vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden relative border border-white/40 transition-all duration-200 opacity-0 scale-95">
      <button id="modal-close" aria-label="Close" class="absolute top-5 right-6 text-on-surface-variant hover:text-primary transition-colors p-2 z-50"><span class="material-symbols-outlined text-2xl">close</span></button>
      <div class="overflow-y-auto custom-scrollbar p-6 md:p-10 space-y-8">
        <section id="modal-header" class="min-h-[84px]"><div class="h-8 w-72 skeleton mb-3"></div><div class="h-4 w-96 max-w-full skeleton"></div></section>
        <section class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 bg-surface-container-lowest rounded-3xl p-5 md:p-6 shadow-sm border border-outline-variant/10">
            <div class="flex items-center justify-between mb-6 flex-wrap gap-3"><div id="tf-buttons" class="flex gap-2"></div><div class="flex gap-5 text-[10px] font-bold text-on-surface-variant uppercase tracking-tight"><span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-tertiary"></span>UP</span><span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-error"></span>DOWN</span></div></div>
            <div id="modal-chart" class="h-64 md:h-80"><div class="h-full flex items-center justify-center"><div class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div></div></div>
          </div>
          <div id="modal-signals"><div class="rounded-[2rem] p-8 min-h-[320px] bg-gradient-to-br from-[#6a1cf6] to-[#4953ac] flex items-center justify-center"><div class="w-6 h-6 border-2 border-white/60 border-t-transparent rounded-full animate-spin"></div></div></div>
        </section>
        <section id="top-bottom-signals"><div class="h-80 rounded-3xl skeleton"></div></section>
        <section id="option-alerts-section"><div class="h-40 rounded-3xl skeleton"></div></section>
        <section id="modal-stats" class="space-y-6"><div class="grid grid-cols-2 md:grid-cols-4 gap-4">${Array.from({length:4}).map(()=>'<div class="h-24 rounded-3xl skeleton"></div>').join('')}</div></section>
      </div>
    </div>
  </div>`;

  const backdrop = root.querySelector('#asset-backdrop');
  const modal = root.querySelector('#asset-modal');
  const close = () => closeModal();
  closeHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', closeHandler);
  document.body.style.overflow = 'hidden';
  root.querySelector('#modal-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  requestAnimationFrame(() => { backdrop.classList.add('bg-inverse-surface/10','backdrop-blur-md'); modal.classList.remove('opacity-0','scale-95'); modal.classList.add('opacity-100','scale-100'); });

  mountModal(ticker);
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  const backdrop = root.querySelector('#asset-backdrop');
  const modal = root.querySelector('#asset-modal');
  if (!backdrop || !modal) return;
  backdrop.classList.remove('bg-inverse-surface/10','backdrop-blur-md');
  modal.classList.add('opacity-0','scale-95');
  chartHandle?.destroy?.(); chartHandle = null;
  document.removeEventListener('keydown', closeHandler);
  document.body.style.overflow = '';
  setTimeout(() => { root.innerHTML = ''; }, 200);
}

async function mountModal(ticker) {
  const ranges = ['1h','1d','5d','1m','1y'];
  let currentRange = '1d';
  const tf = document.getElementById('tf-buttons');
  const drawTf = () => tf.innerHTML = ranges.map(r => `<button data-range="${r}" class="px-4 py-1.5 rounded-full text-xs font-bold transition-all ${r===currentRange?'bg-primary text-on-primary shadow-sm':'text-on-surface-variant hover:bg-surface-container'}">${r.toUpperCase()}</button>`).join('');
  drawTf();
  tf.addEventListener('click', async e => { const b=e.target.closest('[data-range]'); if(!b) return; currentRange=b.dataset.range; drawTf(); await loadChart(ticker,currentRange); });

  safe(api.stock(ticker)).then(d => { if (!d.__error) renderHeaderAndStats(d); });
  loadChart(ticker, currentRange);
  safe(api.signals(ticker)).then(d => { document.getElementById('modal-signals').innerHTML = renderSignals(d); });
  safe(api.topBottomSignals(ticker)).then(d => { const el = document.getElementById('top-bottom-signals'); if (el) renderTopBottomSignals(el, ticker, d); });
  loadOptionAlerts(ticker);
}

async function loadChart(ticker, range) {
  const el = document.getElementById('modal-chart');
  if (!el) return;
  el.innerHTML = '<div class="h-full flex items-center justify-center"><div class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div></div>';
  chartHandle?.destroy?.(); chartHandle = null;
  const data = await safe(api.chart(ticker, range));
  if (data.__error) { el.innerHTML = '<div class="h-full flex items-center justify-center text-sm text-error">K线加载失败</div>'; return; }
  chartHandle = renderChart(el, data);
}

async function loadOptionAlerts(ticker) {
  const section = document.getElementById('option-alerts-section');
  const ex = await safe(api.expirations(ticker), { expirations: [] });
  const expirations = ex.expirations || ex.fallback?.expirations || [];
  const selected = expirations[0] || '';
  if (!selected) { section.innerHTML = ''; return; }
  const chain = await safe(api.optionChain(ticker, selected));
  const alerts = chain?.alerts || [];
  if (alerts.length === 0) { section.innerHTML = ''; return; }
  // Show alerts + AI analysis button only (no option chain table)
  section.innerHTML = renderAlerts(alerts);
  renderAlertAnalysisButton(section, ticker, alerts, chain.underlying_price || 0, selected);
}

function renderHeaderAndStats(stock) {
  const pct = Number(stock.change_percent ?? 0), ch = Number(stock.change ?? 0), pos = pct > 0, neg = pct < 0;
  document.getElementById('modal-header').innerHTML = `<div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
    <div class="space-y-1"><div class="flex items-center gap-3 flex-wrap"><span class="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase font-headline">STOCK</span><h1 class="text-2xl md:text-3xl font-extrabold font-headline tracking-tight text-on-surface">${stock.name || stock.ticker} (${stock.ticker})</h1></div><p class="text-on-surface-variant font-medium text-sm md:text-base">${stock.description || `${stock.name || stock.ticker} market data, technical signals and option chain analysis.`}</p></div>
    <div class="text-left md:text-right flex-shrink-0"><div class="text-3xl md:text-4xl font-black font-headline text-on-surface tabular-nums">${Number(stock.price || 0).toLocaleString(undefined,{maximumFractionDigits:2})}</div><div class="flex items-center md:justify-end gap-1 font-bold text-sm ${pos?'text-tertiary':neg?'text-error':'text-on-surface-variant'}"><span class="material-symbols-outlined text-sm">${pos?'trending_up':neg?'trending_down':'trending_flat'}</span><span>${pos?'+':''}${pct.toFixed(2)}% (${pos?'+':''}$${Math.abs(ch).toFixed(2)})</span></div></div>
  </div>`;
  document.getElementById('modal-stats').innerHTML = `<div class="grid grid-cols-2 md:grid-cols-4 gap-4">${[
    ['Open', money(stock.open ?? stock.o)], ['High', money(stock.day_high ?? stock.high)], ['Low', money(stock.day_low ?? stock.low)], ['Volume', num(stock.volume)]
  ].map(i => `<div class="bg-white rounded-3xl p-5 shadow-sm border border-surface-container-low hover:-translate-y-0.5 hover:shadow-md transition-all"><p class="text-[11px] font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1">${i[0]}</p><p class="text-xl font-bold text-on-surface tracking-tight font-headline">${i[1]}</p></div>`).join('')}</div>
  <div class="bg-surface-container-low rounded-3xl p-6 md:p-8"><h3 class="font-headline font-bold text-lg mb-6">Market Statistics</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-5">${[
    ['市值', large(stock.market_cap)], ['P/E', stock.pe_ratio ?? stock.pe ?? '—'], ['52周最高', money(stock.year_high ?? stock.week52_high)], ['52周最低', money(stock.year_low ?? stock.week52_low)]
  ].map(i=>`<div class="flex justify-between items-center py-2 border-b border-outline-variant/20"><span class="text-sm text-on-surface-variant font-medium">${i[0]}</span><span class="text-sm font-bold text-on-surface">${i[1]}</span></div>`).join('')}</div></div>`;
}
