import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { formatDate } from '../core/presentation.js';

const RANGE_LABELS = Object.freeze({ '1h':'1 час', '24h':'24 часа', '7d':'7 дней', '30d':'30 дней' });
let activeRange = '1h';
let selectedScreenId = null;
let refreshTimer = null;
let disposed = false;

function metricNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberText(value, digits = 0) {
  const number = metricNumber(value);
  return number === null ? '—' : number.toLocaleString('ru-RU', { maximumFractionDigits:digits, minimumFractionDigits:digits });
}

function uptimeText(hours) {
  const value = metricNumber(hours);
  if (value === null) return '—';
  if (value < 1) return `${Math.max(0, Math.round(value * 60))} мин`;
  if (value < 24) return `${numberText(value, 1)} ч`;
  const days = Math.floor(value / 24);
  const remaining = Math.round(value - days * 24);
  return remaining > 0 ? `${days} д ${remaining} ч` : `${days} д`;
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
  if (!status) return;
  const problems = Number(summary.problems) || 0;
  status.textContent = problems ? `${problems} требуют внимания` : 'Все TV в норме';
  status.classList.toggle('is-ok', problems === 0);
  status.classList.toggle('is-warning', problems > 0);
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
  return {
    line,
    area:`${line} L${last[0].toFixed(2)},${base} L${first[0].toFixed(2)},${base} Z`
  };
}

function emptyChartMessage(selectedTv, telemetry) {
  if (!selectedTv) return 'В системе пока нет TV.';
  if (!selectedTv.bound) return 'TV не подключён. История появится после подключения Player.';
  if (!selectedTv.online && !selectedTv.last_metric_at) return 'TV офлайн. Замеры ещё не поступали.';
  if (selectedTv.online && !selectedTv.last_metric_at) {
    return `Первый замер обычно появляется примерно через ${Number(telemetry?.expected_first_sample_seconds) || 10} секунд после запуска Player.`;
  }
  return 'За выбранный период данных нет.';
}

function drawChart(card, points, config, selectedTv, telemetry) {
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
    empty.textContent = emptyChartMessage(selectedTv, telemetry);
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
    grid.classList.add('dashboard-chart-gridline');
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
  const axisFormat = { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' };
  const left = document.createElement('span');
  left.textContent = firstAt ? new Date(firstAt).toLocaleString('ru-RU', axisFormat) : '';
  const right = document.createElement('span');
  right.textContent = lastAt ? new Date(lastAt).toLocaleString('ru-RU', axisFormat) : '';
  axis.append(left, right);
  host.append(axis);
}

function drawAllCharts(points, selectedTv, telemetry) {
  const configs = [
    { id:'fps', key:'fps_avg', format:(value)=>`${numberText(value, 1)} FPS`, minimum:0, aria:'Частота кадров выбранного TV Player' },
    { id:'load', key:'player_load_percent', format:(value)=>`${numberText(value, 1)}%`, minimum:0, maximum:100, aria:'Нагрузка главного потока выбранного TV Player' },
    { id:'memory', key:'memory_mb', format:(value)=>`${numberText(value, 0)} МБ`, minimum:0, zeroBase:true, aria:'JS-память выбранного TV Player' },
    { id:'uptime', key:'uptime_hours', format:uptimeText, minimum:0, zeroBase:true, aria:'Uptime выбранного TV Player' }
  ];
  for (const config of configs) {
    drawChart(document.querySelector(`[data-dashboard-card="${config.id}"]`), points, config, selectedTv, telemetry);
  }
}

function tvOptionLabel(tv) {
  return `${tv.location_name || 'Без торговой точки'} · ${tv.label || tv.screen_name || `TV ${tv.screen_id}`}`;
}

function renderTvSelector(tvs = [], selectedTv = null) {
  const select = document.querySelector('[data-dashboard-tv-select]');
  if (!select) return;
  const previous = String(selectedTv?.screen_id || selectedScreenId || '');
  select.replaceChildren();

  if (!tvs.length) {
    select.append(new Option('TV пока нет', ''));
    select.disabled = true;
    return;
  }

  select.disabled = false;
  for (const tv of tvs) select.append(new Option(tvOptionLabel(tv), String(tv.screen_id)));
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

function selectedStatusText(tv) {
  if (!tv) return 'TV не выбран';
  if (!tv.bound) return 'Не подключён';
  if (!tv.online) return 'Офлайн';
  if (tv.problem_code === 'telemetry_missing') return 'Онлайн · ждём телеметрию';
  if (tv.problem_code === 'telemetry_stale') return 'Онлайн · телеметрия устарела';
  return 'Онлайн';
}

function renderSelectedTv(tv, telemetry = {}) {
  const title = document.querySelector('[data-dashboard-tv-title]');
  const location = document.querySelector('[data-dashboard-tv-location]');
  const status = document.querySelector('[data-dashboard-tv-status]');
  const telemetryStatus = document.querySelector('[data-dashboard-telemetry-status]');

  if (title) title.textContent = tv?.label || tv?.screen_name || '—';
  if (location) location.textContent = tv?.location_name || 'TV не выбран';
  if (status) {
    status.textContent = selectedStatusText(tv);
    status.classList.toggle('is-online', tv?.online === true && !tv?.problem_code);
    status.classList.toggle('is-warning', Boolean(tv?.problem_code));
  }

  if (telemetryStatus) {
    if (!tv) telemetryStatus.textContent = 'Выберите TV для просмотра истории.';
    else if (tv.last_metric_at) telemetryStatus.textContent = `Последний замер: ${formatDate(tv.last_metric_at)}`;
    else if (tv.online) telemetryStatus.textContent = `Первый замер ожидается примерно через ${Number(telemetry.expected_first_sample_seconds) || 10} секунд после запуска Player.`;
    else telemetryStatus.textContent = 'Телеметрия ещё не получена.';
  }

  const firstSample = document.querySelector('[data-dashboard-first-sample]');
  const interval = document.querySelector('[data-dashboard-sample-interval]');
  const retention = document.querySelector('[data-dashboard-retention]');
  if (firstSample) firstSample.textContent = `Примерно через ${Number(telemetry.expected_first_sample_seconds) || 10} секунд после запуска Player.`;
  if (interval) interval.textContent = `Раз в ${Number(telemetry.sample_interval_seconds) || 60} секунд.`;
  if (retention) retention.textContent = `Хранится ${Number(telemetry.retention_days) || 31} день отдельно по каждому TV.`;
}

function renderProblems(items = []) {
  const host = document.querySelector('[data-dashboard-attention]');
  if (!host) return;
  host.replaceChildren();

  if (!items.length) {
    const item = document.createElement('div');
    item.className = 'dashboard-attention-empty';
    item.textContent = 'Проблемных TV не обнаружено.';
    host.append(item);
    return;
  }

  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dashboard-attention-item';
    button.dataset.dashboardProblemScreen = String(item.screen_id);

    const identity = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = item.label || item.screen_name || `TV ${item.screen_id}`;
    const location = document.createElement('small');
    location.textContent = item.location_name || 'Без торговой точки';
    identity.append(title, location);

    const stateNode = document.createElement('span');
    stateNode.className = 'dashboard-attention-state';
    const lastContact = item.last_metric_at || item.last_seen_at;
    stateNode.textContent = lastContact
      ? `${item.problem_label} · ${formatDate(lastContact)}`
      : item.problem_label || 'Требует внимания';

    button.append(identity, stateNode);
    button.addEventListener('click', () => {
      selectedScreenId = Number(item.screen_id);
      const select = document.querySelector('[data-dashboard-tv-select]');
      if (select) select.value = String(selectedScreenId);
      void loadDashboard();
    });
    host.append(button);
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
  const query = new URLSearchParams({ range:activeRange });
  if (selectedScreenId) query.set('screen_id', String(selectedScreenId));
  const data = await api.get(`${API.overview}?${query.toString()}`);
  if (disposed) return;

  const selected = data.selected_tv || null;
  selectedScreenId = selected?.screen_id ? Number(selected.screen_id) : null;
  setSummary(data.summary);
  renderTvSelector(Array.isArray(data.tvs) ? data.tvs : [], selected);
  renderSelectedTv(selected, data.telemetry || {});
  drawAllCharts(Array.isArray(data.player_metrics?.points) ? data.player_metrics.points : [], selected, data.telemetry || {});
  renderProblems(Array.isArray(data.problems) ? data.problems : []);

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
  selectedScreenId = null;

  const controls = [...document.querySelectorAll('[data-dashboard-range]')];
  const select = document.querySelector('[data-dashboard-tv-select]');

  const onRange = (event) => {
    const next = event.currentTarget?.dataset?.dashboardRange;
    if (!Object.hasOwn(RANGE_LABELS, next) || next === activeRange) return;
    activeRange = next;
    syncRangeButtons();
    void loadDashboard();
  };

  const onTvChange = () => {
    const next = Number(select?.value);
    selectedScreenId = Number.isInteger(next) && next > 0 ? next : null;
    void loadDashboard();
  };

  controls.forEach((button) => button.addEventListener('click', onRange));
  select?.addEventListener('change', onTvChange);
  syncRangeButtons();
  void loadDashboard();
  scheduleRefresh();

  return {
    dispose() {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = null;
      controls.forEach((button) => button.removeEventListener('click', onRange));
      select?.removeEventListener('change', onTvChange);
    }
  };
}
