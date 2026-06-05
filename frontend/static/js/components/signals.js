function row(label, value, status) {
  const ok = /bull|above|buy|strong|看多|up|positive/i.test(String(status));
  const bad = /bear|below|sell|weak|看空|down|negative/i.test(String(status));
  const icon = ok ? 'trending_up' : bad ? 'trending_down' : 'remove';
  return `<div class="flex items-center justify-between gap-3 bg-white/10 border border-white/10 rounded-xl px-3 py-2 backdrop-blur-md">
    <span class="text-white/75 font-bold text-xs uppercase tracking-wide">${label}</span>
    <span class="text-white font-semibold text-sm flex items-center gap-1"><span>${value ?? '—'}</span><span class="material-symbols-outlined text-base">${icon}</span></span>
  </div>`;
}

export function renderSignals(data) {
  if (!data || data.__error) {
    return `<div class="rounded-[2rem] p-6 md:p-8 text-white bg-gradient-to-br from-[#6a1cf6] to-[#4953ac] shadow-2xl relative overflow-hidden min-h-[320px] flex items-center justify-center text-white/70 font-medium">Technical Signals（日线周期）暂不可用</div>`;
  }
  const s = data.signals || {};
  const rows = [
    ['RSI(14, 日线)', s.rsi?.value ?? s.rsi, s.rsi?.status ?? s.rsi?.signal],
    ['MACD(日线)', s.macd?.value ?? s.macd, s.macd?.status ?? s.macd?.signal],
    ['EMA(20, 日线)', s.ema20?.value ?? s.ema20, s.ema20?.status ?? s.ema20?.signal],
    ['SMA(50, 日线)', s.sma50?.value ?? s.sma50, s.sma50?.status ?? s.sma50?.signal],
    ['Volume(日线)', s.volume?.value ?? s.volume, s.volume?.status ?? s.volume?.signal],
  ];
  const score = Math.max(0, Math.min(100, Number(data.score ?? 50)));
  const tags = data.tags || [];
  const biasLabel = (v) => { const x = String(v || '').toLowerCase(); if (x.includes('bull') || x.includes('看多')) return '偏多'; if (x.includes('bear') || x.includes('看空')) return '偏空'; return '中性'; };
  return `<div class="rounded-[2rem] p-6 md:p-8 flex flex-col text-white bg-gradient-to-br from-[#6a1cf6] to-[#4953ac] shadow-2xl shadow-primary/20 relative overflow-hidden min-h-[320px]">
    <div class="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
    <div class="relative z-10 flex flex-col h-full">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md"><span class="material-symbols-outlined text-white">psychology</span></div>
        <div><h3 class="font-headline font-extrabold text-lg tracking-tight">Technical Signals（日线周期）</h3><p class="text-[10px] font-bold text-white/60 uppercase tracking-widest">趋势偏向 · 非买卖建议</p></div>
      </div>
      <div class="flex justify-between items-end mb-4"><span class="text-[10px] font-bold text-white/70 uppercase tracking-[0.15em]">${biasLabel(data.overall)}</span><span class="text-3xl font-black font-headline">${score}%</span></div>
      <div class="h-2.5 bg-white/20 rounded-full overflow-hidden mb-4"><div class="h-full bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.6)] transition-all duration-500" style="width:${score}%"></div></div>
      <div class="space-y-3 text-sm flex-1">${rows.map(r => row(...r)).join('')}</div>
      <div class="flex gap-2 mt-6 flex-wrap">${tags.map(t => {
        const labels = {MOMENTUM:'动量异常',TREND:'趋势偏离',VOLUME:'放量信号'};
        const icons = {MOMENTUM:'speed',TREND:'trending_up',VOLUME:'bar_chart'};
        return `<span class="px-3 py-1.5 bg-white/20 border border-white/10 rounded-lg text-[10px] font-bold tracking-wide flex items-center gap-1"><span class="material-symbols-outlined text-xs">${icons[t]||'info'}</span>${labels[t]||t}</span>`;
      }).join('')}</div>
    </div>
  </div>`;
}
