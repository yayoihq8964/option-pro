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
  return getZonedParts(new Date(), tz);
}

function getZonedParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const weekday = map.weekday; // Mon, Tue...
  const hour = parseInt(map.hour === '24' ? '0' : map.hour, 10);
  const minute = parseInt(map.minute, 10);
  const minutes = hour * 60 + minute;
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday,
    minutes,
    isWeekend,
    hour,
    minute
  };
}

function shiftMarketDate(parts, offsetDays) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays, 12, 0));
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return {
    year,
    month,
    day,
    isWeekend: weekdayIndex === 0 || weekdayIndex === 6,
  };
}

function wallTimeToDate(tz, ymd, minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const desiredUTC = Date.UTC(ymd.year, ymd.month - 1, ymd.day, hour, minute);
  const guess = new Date(desiredUTC);
  const zoned = getZonedParts(guess, tz);
  const actualUTC = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute);
  return new Date(guess.getTime() + desiredUTC - actualUTC);
}

function regularSessions(market) {
  const h = market.hours;
  if (market.label === '美股') return [{ name: 'regular', start: h.regular[0], end: h.regular[1] }];
  return [
    { name: 'morning', start: h.morning[0], end: h.morning[1] },
    { name: 'afternoon', start: h.afternoon[0], end: h.afternoon[1] },
  ];
}

function findNextOpenDate(market, parts) {
  const sessions = regularSessions(market);
  const now = new Date();
  for (let offset = 0; offset <= 8; offset += 1) {
    const ymd = shiftMarketDate(parts, offset);
    if (ymd.isWeekend) continue;
    for (const session of sessions) {
      const candidate = wallTimeToDate(market.tz, ymd, session.start);
      if (candidate.getTime() > now.getTime() + 30 * 1000) return candidate;
    }
  }
  return null;
}

function findCurrentSession(market, minutes) {
  return regularSessions(market).find((session) => minutes >= session.start && minutes < session.end) || null;
}

function formatInZone(date, tz) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function formatLocal(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function getMarketSnapshot(market) {
  const t = getMarketLocalTime(market.tz);
  const ymd = { year: t.year, month: t.month, day: t.day, isWeekend: t.isWeekend };
  const currentSession = !t.isWeekend ? findCurrentSession(market, t.minutes) : null;
  let status;
  let nextEventLabel = '开市';
  let nextEventDate = null;

  if (t.isWeekend) {
    status = { phase: '周末休市', tone: 'off', dotColor: '#9fb4d9', title: 'Closed' };
    nextEventDate = findNextOpenDate(market, t);
  } else if (currentSession) {
    status = { phase: market.label === '美股' ? '盘中交易' : currentSession.name === 'morning' ? '上午交易' : '下午交易', tone: 'live', dotColor: 'var(--color-emerald)', title: 'Open' };
    nextEventLabel = '闭市';
    nextEventDate = wallTimeToDate(market.tz, ymd, currentSession.end);
  } else if (market.label === '美股') {
    const h = market.hours;
    if (t.minutes >= h.pre[0] && t.minutes < h.pre[1]) {
      status = { phase: '盘前交易', tone: 'pre', dotColor: '#c98a14', title: 'Pre-market' };
      nextEventDate = wallTimeToDate(market.tz, ymd, h.regular[0]);
    } else if (t.minutes >= h.after[0] && t.minutes < h.after[1]) {
      status = { phase: '盘后交易', tone: 'pre', dotColor: '#c98a14', title: 'After-hours' };
      nextEventDate = findNextOpenDate(market, t);
    } else {
      status = { phase: '已休市', tone: 'off', dotColor: '#9fb4d9', title: 'Closed' };
      nextEventDate = findNextOpenDate(market, t);
    }
  } else {
    const h = market.hours;
    if (t.minutes >= h.morning[1] && t.minutes < h.afternoon[0]) {
      status = { phase: '午间休市', tone: 'pre', dotColor: '#c98a14', title: 'Break' };
      nextEventDate = wallTimeToDate(market.tz, ymd, h.afternoon[0]);
    } else {
      status = { phase: '已休市', tone: 'off', dotColor: '#9fb4d9', title: 'Closed' };
      nextEventDate = findNextOpenDate(market, t);
    }
  }

  return {
    ...status,
    market,
    localClock: fmtLocalTime(market.tz),
    nextEventLabel,
    nextEventDate,
    nextEventMarketText: formatInZone(nextEventDate, market.tz),
    nextEventLocalText: formatLocal(nextEventDate),
    isOpen: status.tone === 'live',
  };
}

function getStatus(market) {
  return getMarketSnapshot(market);
}

function fmtLocalTime(tz) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
}

function renderRow(market) {
  const status = getStatus(market);
  const icon = status.tone === 'live' ? 'wb_sunny' : status.tone === 'pre' ? 'schedule' : 'dark_mode';
  return `<div class="market-hour-card market-hour-card--${status.tone}">
    <span class="market-hour-rail" aria-hidden="true"></span>
    <span class="material-symbols-outlined market-hour-icon" aria-hidden="true">${icon}</span>
    <div class="market-hour-copy">
      <div class="market-hour-title">
        <strong>${market.label}</strong>
        <span>${status.title}</span>
      </div>
      <p>${status.phase} · ${status.localClock}</p>
      <small>${status.nextEventLabel}: ${status.nextEventMarketText} · 本地 ${status.nextEventLocalText}</small>
    </div>
  </div>`;
}

export function renderMarketStatus(container) {
  if (!container) return;
  const draw = () => {
    container.innerHTML = `<div class="panel market-status-card">
      <div class="market-status-head">
        <span class="label-caps">市场状态</span>
        <span class="market-status-caption">本地时区显示</span>
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

export function getPrimaryMarketStatus() {
  return getMarketSnapshot(MARKETS[0]);
}
