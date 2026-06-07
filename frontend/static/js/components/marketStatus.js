/**
 * Compute current trading status for US / Japan / China stock markets.
 * No backend dependency — purely based on user's local time vs each market's TZ.
 */

const MARKETS = [
  {
    label: '美股',
    tz: 'America/New_York',
    // Regular hours: 9:30-16:00 ET (weekdays); pre 4:00-9:30; after 16:00-20:00
    hours: { pre: [4*60, 9*60+30], regular: [9*60+30, 16*60], after: [16*60, 20*60] }
  },
  {
    label: '日股',
    tz: 'Asia/Tokyo',
    // Tokyo: 9:00-11:30, 12:30-15:00 (weekdays)
    hours: { morning: [9*60, 11*60+30], afternoon: [12*60+30, 15*60] }
  },
  {
    label: '上证',
    tz: 'Asia/Shanghai',
    // Shanghai: 9:30-11:30, 13:00-15:00 (weekdays)
    hours: { morning: [9*60+30, 11*60+30], afternoon: [13*60, 15*60] }
  }
];

function getMarketLocalTime(tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false
  }).formatToParts(new Date());
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const weekday = map.weekday; // Mon, Tue...
  const hour = parseInt(map.hour === '24' ? '0' : map.hour, 10);
  const minute = parseInt(map.minute, 10);
  const minutes = hour * 60 + minute;
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  return { weekday, minutes, isWeekend, hour, minute };
}

function getStatus(market) {
  const t = getMarketLocalTime(market.tz);
  if (t.isWeekend) return { phase: '周末休市', tone: 'off', dotColor: '#94a3b8' };

  const h = market.hours;
  if (market.label === '美股') {
    if (t.minutes >= h.regular[0] && t.minutes < h.regular[1]) return { phase: '盘中交易', tone: 'live', dotColor: 'var(--color-emerald)' };
    if (t.minutes >= h.pre[0] && t.minutes < h.pre[1]) return { phase: '盘前交易', tone: 'pre', dotColor: '#d97706' };
    if (t.minutes >= h.after[0] && t.minutes < h.after[1]) return { phase: '盘后交易', tone: 'pre', dotColor: '#d97706' };
    return { phase: '已休市', tone: 'off', dotColor: '#94a3b8' };
  } else {
    // Japan / China — two sessions
    if (t.minutes >= h.morning[0] && t.minutes < h.morning[1]) return { phase: '上午交易', tone: 'live', dotColor: 'var(--color-emerald)' };
    if (t.minutes >= h.afternoon[0] && t.minutes < h.afternoon[1]) return { phase: '下午交易', tone: 'live', dotColor: 'var(--color-emerald)' };
    if (t.minutes >= h.morning[1] && t.minutes < h.afternoon[0]) return { phase: '午间休市', tone: 'pre', dotColor: '#d97706' };
    return { phase: '已休市', tone: 'off', dotColor: '#94a3b8' };
  }
}

function fmtLocalTime(tz) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
}

function renderRow(market) {
  const status = getStatus(market);
  const local = fmtLocalTime(market.tz);
  return `<div class="market-status-row">
    <span class="market-status-dot" style="background:${status.dotColor}"></span>
    <strong>${market.label}</strong>
    <span class="mono market-status-time">${local}</span>
    <span class="label-caps market-status-phase market-status-phase--${status.tone}">${status.phase}</span>
  </div>`;
}

export function renderMarketStatus(container) {
  if (!container) return;
  const draw = () => {
    container.innerHTML = `<div class="panel market-status-card">
      <div class="market-status-head">
        <span class="label-caps">市场状态</span>
      </div>
      ${MARKETS.map(renderRow).join('')}
    </div>`;
  };
  draw();
  // Refresh every minute
  const timer = setInterval(draw, 60 * 1000);
  // Stop on hash change
  window.addEventListener('hashchange', () => clearInterval(timer), { once: true });
}
