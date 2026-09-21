import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { formatDate } from '../core/presentation.js';

const RANGE_LABELS = Object.freeze({ '1h':'1 час', '24h':'24 часа', '7d':'7 дней', '30d':'30 дней' });
let activeRange = '1h';
let refreshTimer = null;
let disposed = false;

function numberText(value, digits = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('ru-RU', { maximumFractionDigits:digits, minimumFractionDigits:digits }) : '—';
}

function metricNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function latestValue(points, key) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = metricNumber(points[index]?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function setSummary(summary = {}) {
  for (const [key, value] of Object.entries(summary)) {
    document.querySelectorAll(`[data-dashboard-summary="${key}"]`).forEach((node) => { node.textContent = numberText(value); });
  }
  const status = document.querySelector('[data-dashboard-health]');
  if (status) {
    const offline = Number(summary.offline) || 0;
    const unbound = Number(summary.unbound) || 0;
    status.textContent = offline || unbound ? `${offline + unbound} требуют внимания` : 'Все TV в норме';
    status.classList.toggle('is-ok', offline === 0 && unbound === 0);
    status.classList.toggle('is-warning', offline > 0 || unbound > 0);
  }
}

function svgNode(name, attributes = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function linePath(values, width, height, padding, minimum, maximum) {
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const range = Math.max(0.0001, maximum - minimum);
  const points = [];
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    const x = values.length <= 1 ? padding + usableWidth / 2 : padding + usableWidth * index / (values.length - 1);
    const y = padding + usableHeight - ((value - minimum) / range) * usableHeight;
    points.push([x, y]);
  });
  if (!points.length) return { line:'', area:'' };
  const line = points.map(([x,y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const first = points[0];
  const last = points.at(-1);
  const base = height - padding;
  const area = `${line} L${last[0].toFixed(2)},${base} L${first[0].toFixed(2)},${base} Z`;
  return { line, area };
}

function drawChart(card, points, config) {
  const host = card?.querySelector('[data-dashboard-chart]');
  const latest = card?.querySelector('[data-dashboard-current]');
  const minNode = card?.querySelector('[data-dashboard-min]');
  const maxNode = card?.querySelector('[data-dashboard-max]');
  if (!host) return;

  const values = points.map((point) => metricNumber(point?.[config.key]));
  const numeric = values.filter(Number.isFinite);
  const current = latestValue(points, config.key);
  if (latest) latest.textContent = current === null ? '—' : config.format(current);
  if (minNode) minNode.textContent = numeric.length ? config.format(Math.min(...numeric)) : '—';
  if (maxNode) maxNode.textContent = numeric.length ? config.format(Math.max(...numeric)) : '—';

  host.replaceChildren();
  if (!numeric.length) {
    const empty = document.createElement('div');
    empty.className = 'dashboard-chart-empty';
    empty.textContent = 'Данные появятся после первых замеров TV Player';
    host.append(empty);
    return;
  }

  const width = 420;
  const height = 132;
  const padding = 10;
  let minimum = config.minimum ?? Math.min(...numeric);
  let maximum = config.maximum ?? Math.max(...numeric);
  if (minimum === maximum) {
    const spread = Math.max(1, Math.abs(minimum) * 0.08);
    minimum -= spread;
    maximum += spread;
  }
  if (config.zeroBase) minimum = Math.min(0, minimum);

  const svg = svgNode('svg', { viewBox:`0 0 ${width} ${height}`, role:'img', 'aria-label':config.aria });
  svg.classList.add('dashboard-sparkline');

  for (let index = 1; index <= 3; index += 1) {
    const y = padding + (height - padding * 2) * index / 4;
    const grid = svgNode('line', { x1:padding, y1:y, x2:width-padding, y2:y });
    grid.classList.add('dashboard-chart-grid');
    svg.append(grid);
  }

  const paths = linePath(values, width, height, padding, minimum, maximum);
  const area = svgNode('path', { d:paths.area });
  area.classList.add('dashboard-chart-area');
  const line = svgNode('path', { d:paths.line });
  line.classList.add('dashboard-chart-line');
  svg.append(area, line);
  host.append(svg);

  const axis = document.createElement('div');
  axis.className = 'dashboard-chart-axis';
  const firstAt = points[0]?.at;
  const lastAt = points.at(-1)?.at;
  axis.innerHTML = `<span>${firstAt ? new Date(firstAt).toLocaleString('ru-RU', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' }) : ''}</span><span>${lastAt ? new Date(lastAt).toLocaleString('ru-RU', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' }) : ''}</span>`;
  host.append(axis);
}

function drawAllCharts(points) {
  const configs = [
    { id:'online', key:'online_tvs', format:(value)=>`${Math.round(value)} TV`, minimum:0, zeroBase:true, aria:'Количество TV, передающих телеметрию' },
    { id:'fps', key:'fps_avg', format:(value)=>`${numberText(value, 1)} FPS`, minimum:0, aria:'Средняя частота кадров TV Player' },
    { id:'load', key:'player_load_percent', format:(value)=>`${numberText(value, 1)}%`, minimum:0, maximum:100, aria:'Нагрузка главного потока TV Player' },
    { id:'memory', key:'memory_mb', format:(value)=>`${numberText(value, 0)} МБ`, minimum:0, zeroBase:true, aria:'Средняя JS-память TV Player' }
  ];
  for (const config of configs) drawChart(document.querySelector(`[data-dashboard-card="${config.id}"]`), points, config);
}

function renderAttention(items = []) {
  const host = document.querySelector('[data-dashboard-attention]');
  if (!host) return;
  host.replaceChildren();
  if (!items.length) {
    const item = document.createElement('div');
    item.className = 'dashboard-attention-empty';
    item.textContent = 'TV без связи не обнаружены.';
    host.append(item);
    return;
  }
  for (const item of items) {
    const link = document.createElement('a');
    link.className = 'dashboard-attention-item';
    link.href = '/screens';
    const label = item.location_number ? `TV ${item.location_number}` : (item.screen_name || `TV ${item.screen_id}`);
    const lastSeen = item.last_seen_at ? formatDate(item.last_seen_at) : 'связи ещё не было';
    link.innerHTML = `<span><strong>${label}</strong><small>${item.location_name || 'Без торговой точки'}</small></span><span class="dashboard-attention-state">Офлайн · ${lastSeen}</span>`;
    host.append(link);
  }
}

function syncRangeButtons() {
  document.querySelectorAll('[data-dashboard-range]').forEach((button) => {
    const active = button.dataset.dashboardRange === activeRange;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const label = document.querySelector('[data-dashboard-range-label]');
  if (label) label.textContent = RANGE_LABELS[activeRange] || activeRange;
}

async function loadDashboard() {
  const data = await api.get(`${API.overview}?range=${encodeURIComponent(activeRange)}`);
  if (disposed) return;
  setSummary(data.summary);
  drawAllCharts(Array.isArray(data.player_metrics?.points) ? data.player_metrics.points : []);
  renderAttention(Array.isArray(data.attention) ? data.attention : []);
  const updated = document.querySelector('[data-dashboard-updated]');
  if (updated) updated.textContent = `Обновлено ${new Date(data.generated_at || Date.now()).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' })}`;
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (disposed) return;
  const seconds = Math.max(15, Number(state.site?.dashboard_refresh_seconds) || 60);
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    if (document.visibilityState !== 'hidden') await loadDashboard().catch(() => undefined);
    scheduleRefresh();
  }, seconds * 1000);
}

export function initialiseDashboard() {
  disposed = false;
  activeRange = '1h';
  const controls = [...document.querySelectorAll('[data-dashboard-range]')];
  const onRange = (event) => {
    const next = event.currentTarget?.dataset?.dashboardRange;
    if (!Object.hasOwn(RANGE_LABELS, next) || next === activeRange) return;
    activeRange = next;
    syncRangeButtons();
    void loadDashboard();
  };
  controls.forEach((button) => button.addEventListener('click', onRange));
  syncRangeButtons();
  void loadDashboard();
  scheduleRefresh();

  return {
    dispose() {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = null;
      controls.forEach((button) => button.removeEventListener('click', onRange));
    }
  };
}
