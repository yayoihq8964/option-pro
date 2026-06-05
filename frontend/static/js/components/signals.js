function row(label, value, signal) {
  const val = value != null ? (typeof value === 'number' ? value.toFixed(2) : value) : '—';
  const ok = /above|bull|oversold|spike|high/i.test(String(signal));
  const bad = /below|bear|overbought|normal/i.test(String(signal)) && !/above/i.test(String(signal));
  const icon = ok ? 'trending_up' : bad ? 'trending_down' : 'remove';
  return `<div class="flex items-center justify-between gap-3 bg-white/10 border border-white/10 rounded-xl px-3 py-2 backdrop-blur-md">
    <span class="text-white/75 font-bold text-xs">${label}</span>
    <span class="text-white font-semibold text-sm flex items-center gap-1">${val}<span class="material-symbols-outlined text-base">${icon}</span></span>
  </div>`;
}

export function renderSignals(data) {
  if (!data || data.__error) {
    return `<div class="rounded-[2rem] p-6 md:p-8 text-white bg-gradient-to-br from-[#6a1cf6] to-[#4953ac] shadow-2xl relative overflow-hidden min-h-[320px] flex items-center justify-center text-white/70">技术信号暂不可用</div>`;
  }

  const s = data.signals || {};
  const scores = data.scores || {};

  // Map new endpoint fields to display rows
  const sig = (key) => s[key] || {};
  const rows = [
    ['RSI(14, 日线)',    sig('rsi14').value,         sig('rsi14').value > 70 ? 'overbought' : sig('rsi14').value < 30 ? 'oversold' : 'neutral'],
    ['MACD 柱状图',      sig('macd_hist').value,      sig('macd_hist').value > 0 ? 'above' : 'below'],
    ['EMA(20) 偏离',    sig('sma20_dist').value != null ? sig('sma20_dist').value.toFixed(1) + '%' : null, sig('sma20_dist').value > 0 ? 'above' : 'below'],
    ['SMA(50) 偏离',    sig('sma50_dist').value != null ? sig('sma50_dist').value.toFixed(1) + '%' : null, sig('sma50_dist').value > 2 ? 'above' : sig('sma50_dist').value < -2 ? 'below' : 'neutral'],
    ['成交量/均量',       sig('_volume_ratio')?.value != null ? sig('_volume_ratio').value.toFixed(2) + 'x' : (s._volume_ratio?.value != null ? s._volume_ratio.value.toFixed(2) + 'x' : null), sig('volume_zscore').value > 1 ? 'spike' : sig('volume_zscore').value > 0.5 ? 'high' : 'normal'],
    ['相对强弱 vs SPY',  sig('relative_strength_spy').value != null ? sig('relative_strength_spy').value.toFixed(1) + '%' : null, sig('relative_strength_spy').value > 1 ? 'above' : sig('relative_strength_spy').value < -1 ? 'below' : 'neutral'],
  ].filter(r => r[1] != null);

  // Compute a trend bias score from top/bottom scores
  const top = scores.top_score ?? 50;
  const bottom = scores.bottom_score ?? 50;
  const dipBuy = scores.dip_buy_quality ?? 50;
  // Simple trend bias: 100 = very bullish, 0 = very bearish
  const bias = Math.max(0, Math.min(100, Math.round(50 + (bottom - top) / 2 + dipBuy / 5)));
  const biasLabel = bias >= 60 ? '偏多' : bias <= 40 ? '偏空' : '中性';

  // Tags from signal activity
  const tags = [];
  if (sig('rsi14').value && Math.abs(sig('rsi14').value - 50) > 15) tags.push('MOMENTUM');
  if (sig('sma50_dist').value && Math.abs(sig('sma50_dist').value) > 5) tags.push('TREND');
  if (sig('volume_zscore').value && sig('volume_zscore').value > 1) tags.push('VOLUME');

  return `<div class="rounded-[2rem] p-6 md:p-8 flex flex-col text-white bg-gradient-to-br from-[#6a1cf6] to-[#4953ac] shadow-2xl shadow-primary/20 relative overflow-hidden min-h-[320px]">
    <div class="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
    <div class="relative z-10 flex flex-col h-full">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md"><span class="material-symbols-outlined text-white">psychology</span></div>
        <div><h3 class="font-headline font-extrabold text-lg tracking-tight">技术信号（日线）</h3><p class="text-[10px] font-bold text-white/60 uppercase tracking-widest">趋势偏向 · 非买卖建议</p></div>
      </div>
      <div class="flex justify-between items-end mb-4"><span class="text-[10px] font-bold text-white/70 uppercase tracking-[0.15em]">${biasLabel}</span><span class="text-3xl font-black font-headline">${bias}%</span></div>
      <div class="h-2.5 bg-white/20 rounded-full overflow-hidden mb-4"><div class="h-full bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.6)] transition-all duration-500" style="width:${bias}%"></div></div>
      <div class="space-y-2 text-sm flex-1">${rows.map(r => row(...r)).join('')}</div>
      ${tags.length ? `<div class="flex gap-2 mt-5 flex-wrap">${tags.map(t => {
        const labels = {MOMENTUM:'动量异常',TREND:'趋势偏离',VOLUME:'放量信号'};
        const icons = {MOMENTUM:'speed',TREND:'trending_up',VOLUME:'bar_chart'};
        return `<span class="px-3 py-1.5 bg-white/20 border border-white/10 rounded-lg text-[10px] font-bold tracking-wide flex items-center gap-1"><span class="material-symbols-outlined text-xs">${icons[t]||'info'}</span>${labels[t]||t}</span>`;
      }).join('')}</div>` : ''}
    </div>
  </div>`;
}
