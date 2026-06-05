import { mountSearch } from "./components/search.js";
import { api } from "./api.js";
import { mountDashboard } from "./pages/dashboard.js";
import { mountActivity } from "./pages/activity.js";
import { mountSectors } from "./pages/sectors.js";
import { mountEarnings } from "./pages/earnings.js";

const state = { ticker: "NVDA", range: "1d" };
let renderId = 0; // prevent stale renders

const routes = {
  dashboard: { label: "市场仪表盘", mobile: "市场", icon: "dashboard", mount: mountDashboard },
  activity:  { label: "期权异动",   mobile: "异动", icon: "analytics",  mount: mountActivity },
  sectors:   { label: "板块分析",   mobile: "板块", icon: "pie_chart",  mount: mountSectors },
  earnings:  { label: "AI 财报中心", mobile: "AI",   icon: "psychology", mount: mountEarnings },
};

function current() {
  const h = (location.hash || "#dashboard").replace("#", "");
  return h in routes ? h : "dashboard";
}

function navHTML(k, r, active) {
  return `<a href="#${k}" class="nav-link ${active ? "nav-active" : ""}"><span class="material-symbols-outlined ${active ? "icon-fill" : ""}">${r.icon}</span><span class="font-display text-body-md">${r.label}</span></a>`;
}

function mobileHTML(k, r, active) {
  return `<a href="#${k}" class="flex flex-col items-center gap-1 ${active ? "bottom-active" : "text-on-surface-variant"}"><span class="material-symbols-outlined ${active ? "icon-fill" : ""}">${r.icon}</span><span class="text-[10px] ${active ? "font-bold" : ""}">${r.mobile}</span></a>`;
}

function renderNav() {
  const c = current();
  document.querySelector("#sideNav").innerHTML = Object.entries(routes).map(([k, r]) => navHTML(k, r, k === c)).join("");
  document.querySelector("#mobileNav").innerHTML = Object.entries(routes).map(([k, r]) => mobileHTML(k, r, k === c)).join("");
}

function render() {
  if (!location.hash) location.hash = "#dashboard";
  renderNav();
  const c = current();
  const app = document.querySelector("#app");
  const id = ++renderId;
  // Don't await — let page mount async, nav switches instantly
  routes[c].mount(app, state).catch((e) => {
    // Only update DOM if this render is still current
    if (renderId === id) {
      app.innerHTML = `<div class="card p-xl text-center"><p class="text-error">页面加载失败</p><p class="text-label-sm text-on-surface-variant mt-sm">${e.message || ""}</p></div>`;
    }
  });
}

mountSearch(document.querySelector("#globalSearch"), (ticker) => {
  state.ticker = ticker.toUpperCase();
  location.hash = "#dashboard";
  render();
});

window.addEventListener("hashchange", render);
render();

api.marketStatus()
  .then((s) => {
    document.querySelector("#marketStatus").textContent =
      `${s.market || "Market"} · ${new Date(s.server_time || Date.now()).toLocaleTimeString("zh-CN")}`;
  })
  .catch(() => {});
