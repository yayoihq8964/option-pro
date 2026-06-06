import { api } from '../api.js';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function normalizeAnalysis(payload) {
  const source = payload?.analysis ?? payload?.data ?? payload ?? {};
  const summary = typeof source === 'string' ? source : (source.summary ?? source.text ?? source.analysis ?? 'No AI analysis returned.');
  const points = source.keyPoints ?? source.key_points ?? source.points ?? source.insights ?? [];
  const confidence = source.confidence ?? source.score ?? source.rating;
  return { summary, points: Array.isArray(points) ? points : [], confidence };
}

function renderResultCard(title, payload) {
  const analysis = normalizeAnalysis(payload);
  return `
    <article class="ai-result-card">
      <div class="ai-result-card__header">
        <span class="label-caps">AI Analysis</span>
        <strong>${escapeHtml(title)}</strong>
      </div>
      <p>${escapeHtml(analysis.summary)}</p>
      ${analysis.points.length ? `
        <ul>
          ${analysis.points.slice(0, 4).map((point) => `<li>${escapeHtml(typeof point === 'string' ? point : (point.text ?? point.title ?? JSON.stringify(point)))}</li>`).join('')}
        </ul>
      ` : ''}
      ${analysis.confidence != null ? `<span class="ai-confidence mono font-data-mono" data-numeric>Confidence ${escapeHtml(analysis.confidence)}</span>` : ''}
    </article>
  `;
}

async function runAnalysis(button, output, request, title) {
  if (!button || !output) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Analyzing…';
  output.innerHTML = '<div class="ai-result-card ai-result-card--loading">Reading market context…</div>';
  try {
    const result = await request();
    output.innerHTML = renderResultCard(title, result);
  } catch (error) {
    console.warn(`${title} failed`, error);
    output.innerHTML = `<article class="ai-result-card"><span class="label-caps">AI Analysis</span><p>${escapeHtml(error.message ?? 'Unable to run AI analysis.')}</p></article>`;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

export function mountAlertsAnalysis(container, ticker, alerts = []) {
  if (!container) return;
  container.innerHTML = `
    <section class="ai-analysis-panel panel" aria-labelledby="alerts-ai-title">
      <div class="ai-analysis-copy">
        <span class="label-caps">Unusual Activity AI</span>
        <h3 id="alerts-ai-title">Interpret alert flow</h3>
        <p>Summarize unusual options activity with neutral, Ethos-style market context.</p>
      </div>
      <button class="ai-analysis-button" type="button" data-ai-alerts>Analyze Alerts</button>
      <div class="ai-analysis-results" data-ai-alert-results></div>
    </section>
  `;
  const button = container.querySelector('[data-ai-alerts]');
  const output = container.querySelector('[data-ai-alert-results]');
  button?.addEventListener('click', () => runAnalysis(
    button,
    output,
    () => api.analyzeAlerts(ticker, alerts),
    `${ticker} unusual activity`
  ));
}

export function mountTopBottomAnalysis(container, ticker, signals = {}) {
  if (!container) return;
  container.innerHTML = `
    <section class="ai-analysis-panel panel ai-analysis-panel--compact" aria-labelledby="signals-ai-title">
      <div class="ai-analysis-copy">
        <span class="label-caps">Signal AI</span>
        <h3 id="signals-ai-title">Top / bottom read</h3>
        <p>Translate signal gauges into a concise investment-risk narrative.</p>
      </div>
      <button class="ai-analysis-button" type="button" data-ai-signals>Analyze Signals</button>
      <div class="ai-analysis-results" data-ai-signal-results></div>
    </section>
  `;
  const button = container.querySelector('[data-ai-signals]');
  const output = container.querySelector('[data-ai-signal-results]');
  button?.addEventListener('click', () => runAnalysis(
    button,
    output,
    () => api.analyzeTopBottomSignals(ticker, signals),
    `${ticker} signal correlation`
  ));
}

export function renderEarningsCorrelationAI(ticker = 'Earnings') {
  return `
    <section class="ai-analysis-panel earnings-correlation-ai panel">
      <div class="ai-analysis-copy">
        <span class="label-caps">财报相关 AI</span>
        <h3>${escapeHtml(ticker)} 财报背景</h3>
        <p>使用 Ethos 白色表面、细边框与黑色主按钮呈现财报与期权流相关性。</p>
      </div>
      <button class="ai-analysis-button" type="button" data-earnings-correlation-button>分析相关性</button>
      <div class="ai-analysis-results" data-earnings-correlation-results>
        <article class="ai-result-card">
          <span class="label-caps">就绪</span>
          <p>运行分析以比较财报时间、期权流与信号方向。</p>
        </article>
      </div>
    </section>
  `;
}
