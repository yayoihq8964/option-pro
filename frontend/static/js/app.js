import { mountWatchlist } from './pages/watchlist.js';
import { mountSectors } from './pages/sectors.js';
import { mountEarnings } from './pages/earnings.js';
import { initSearch } from './components/search.js';

const routes = {
  watchlist: mountWatchlist,
  sectors: mountSectors,
  earnings: mountEarnings,
};

const state = { route: null, token: 0 };

function currentRoute() {
  const key = (location.hash || '#watchlist').replace('#', '').split('?')[0];
  return routes[key] ? key : 'watchlist';
}

function setActiveNav(route) {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.classList.toggle('active', el.dataset.nav === route);
  });
}

export function render() {
  const route = currentRoute();
  const token = ++state.token;
  state.route = route;
  setActiveNav(route);
  const root = document.getElementById('app');
  root.innerHTML = `<div class="p-8"><div class="h-8 w-48 skeleton mb-6"></div><div class="grid grid-cols-2 lg:grid-cols-4 gap-4">${Array.from({length:8}).map(()=>'<div class="h-36 rounded-2xl skeleton"></div>').join('')}</div></div>`;
  // Non-blocking: do not await page mount.
  Promise.resolve(routes[route](root, { token, isCurrent: () => token === state.token })).catch((err) => {
    if (token === state.token) root.innerHTML = `<div class="p-8 text-error font-bold">页面加载失败：${err.message}</div>`;
  });
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', () => {
  if (!location.hash) location.hash = '#watchlist';
  initSearch(document.getElementById('global-search'));
  render();
});
