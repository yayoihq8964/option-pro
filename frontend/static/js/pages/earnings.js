import { api } from '../api.js';
import { renderEarningsCorrelationAI } from '../components/aiAnalysis.js';

const FALLBACK_EARNINGS = [
  { ticker: 'NVDA', company: '英伟达', date: 'T+2', period: 'Q2', epsEstimate: 0.64, revenueEstimate: '28.4B' },
  { ticker: 'ADBE', company: 'Adobe', date: 'T+5', period: 'Q2', epsEstimate: 4.39, revenueEstimate: '5.3B' },
  { ticker: 'TSLA', company: '特斯拉', date: 'T+8', period: 'Q2', epsEstimate: 0.51, revenueEstimate: '24.6B' }
];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function navigateToDetail(ticker) {
  const symbol = String(ticker || '').trim().toUpperCase();
  if (!symbol) return;
  window.location.hash = `#detail/${encodeURIComponent(symbol)}`;
}

function normalizeEarnings(payload) {
  const items = Array.isArray(payload) ? payload : (payload?.earnings ?? payload?.items ?? payload?.data ?? payload?.calendar ?? []);
  return items.map((item) => ({
    ticker: String(item.ticker ?? item.symbol ?? '').toUpperCase(),
    company: item.company ?? item.companyName ?? item.company_name ?? item.name ?? '上市公司',
    date: item.date ?? item.reportDate ?? item.report_date ?? item.earningsDate ?? item.earnings_date ?? 'TBD',
    period: item.period ?? item.quarter ?? item.fiscalQuarter ?? item.fiscal_quarter ?? '—',
    epsEstimate: item.epsEstimate ?? item.eps_estimate ?? item.estimatedEps ?? item.estimated_eps ?? '—',
    revenueEstimate: item.revenueEstimate ?? item.revenue_estimate ?? item.estimatedRevenue ?? item.estimated_revenue ?? '—'
  })).filter((item) => item.ticker);
}

function renderEarningsRows(items) {
  return items.map((item) => `
    <tr>
      <td><button class="earnings-ticker-badge mono font-data-mono" data-numeric type="button" data-ticker="${escapeHtml(item.ticker)}">${escapeHtml(item.ticker)}</button></td>
      <td><strong>${escapeHtml(item.company)}</strong></td>
      <td><span class="earnings-date-badge mono font-data-mono" data-numeric>${escapeHtml(item.date)}</span></td>
      <td><span class="sector-tag label-caps">${escapeHtml(item.period)}</span></td>
      <td class="mono font-data-mono" data-numeric>${escapeHtml(item.epsEstimate)}</td>
      <td class="mono font-data-mono" data-numeric>${escapeHtml(item.revenueEstimate)}</td>
    </tr>
  `).join('');
}

function renderShell(isLoading = true) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <section class="earnings-page" aria-labelledby="earnings-title">
      <header class="terminal-header">
        <div>
          <span class="label-caps">财报</span>
          <h1 id="earnings-title">财报中心</h1>
          <p>沿用现有财报 API 数据流，使用 Ethos 表头、黑色代码徽章与安静的日期表面展示即将发布的业绩。</p>
        </div>
      </header>
      <section class="earnings-table-card" aria-labelledby="earnings-table-title">
        <div class="section-card-heading"><span class="label-caps">日历</span><h2 id="earnings-table-title">即将发布</h2></div>
        <div class="earnings-table-wrap">
          <table class="earnings-table">
            <thead>
              <tr><th>代码</th><th>公司</th><th>财报日期</th><th>周期</th><th>EPS 预估</th><th>营收预估</th></tr>
            </thead>
            <tbody id="earnings-table-body">
              ${isLoading ? '<tr><td colspan="6">正在加载财报日历…</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </section>
      <div id="earnings-ai-slot">${renderEarningsCorrelationAI('即将发布')}</div>
    </section>
  `;
}

function bindEarningsCorrelation() {
  const button = document.querySelector('[data-earnings-correlation-button]');
  const output = document.querySelector('[data-earnings-correlation-results]');
  if (!button || !output) return;
  button.addEventListener('click', async () => {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '分析中…';
    output.innerHTML = '<article class="ai-result-card ai-result-card--loading">正在读取财报背景…</article>';
    try {
      const result = await api.earningsCorrelation('Upcoming');
      const source = result?.analysis ?? result?.data ?? result ?? {};
      const summary = typeof source === 'string' ? source : (source.summary ?? source.text ?? source.analysis ?? '相关性分析完成。');
      output.innerHTML = `<article class="ai-result-card"><div class="ai-result-card__header"><span class="label-caps">AI 分析</span><strong>即将发布财报相关性</strong></div><p>${escapeHtml(summary)}</p></article>`;
    } catch (error) {
      output.innerHTML = `<article class="ai-result-card"><span class="label-caps">AI 分析</span><p>${escapeHtml(error.message ?? '无法运行财报相关性分析。')}</p></article>`;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
}

export async function renderEarnings() {
  renderShell(true);
  const tableBody = document.getElementById('earnings-table-body');
  try {
    const payload = await api.earnings();
    const earnings = normalizeEarnings(payload);
    if (!earnings.length) throw new Error('财报 API 未返回数据');
    tableBody.innerHTML = renderEarningsRows(earnings);
  } catch (error) {
    console.warn('api.earnings() failed; rendering fallback earnings rows.', error);
    tableBody.innerHTML = renderEarningsRows(FALLBACK_EARNINGS);
  }
  document.querySelectorAll('[data-ticker]').forEach((button) => button.addEventListener('click', () => navigateToDetail(button.dataset.ticker)));
  bindEarningsCorrelation();
}
