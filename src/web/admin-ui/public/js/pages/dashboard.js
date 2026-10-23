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


const RANGE_DURATION_MS = Object.freeze({
  '1h':60 * 60 * 1000,
  '24h':24 * 60 * 60 * 1000,
  '7d':7 * 24 * 60 * 60 * 1000,
  '30d':30 * 24 * 60 * 60 * 1000
});

function niceAxisStep(raw) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 0.00001)));
  const ratio = raw / magnitude;
  const multiplier = ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 2.5 ? 2.5 : ratio <= 5 ? 5 : 10;
  return magnitude * multiplier;
}

function valueScale(numeric, config) {
  if (config.key === 'player_load_percent') return { minimum:0, maximum:100, step:25 };
  const lowest = Math.min(...numeric);
  const highest = Math.max(...numeric);
  const padding = Math.max((highest - lowest) * 0.14, Math.abs(highest) * 0.035, 0.5);
  const step = niceAxisStep((highest - lowest + padding * 2) / 4);
  const minimum = Math.max(0, Math.floor(Math.max(0, lowest - padding) / step) * step);
  const maximum = Math.max(minimum + step * 4, Math.ceil((highest + padding) / step) * step);
  return { minimum, maximum, step };
}

function axisValue(value, step) {
  return numberText(value, step < 1 ? 2 : step < 5 ? 1 : 0);
}

function axisTime(timestamp) {
  const date = new Date(timestamp);
  if (activeRange === '7d' || activeRange === '30d') {
    return date.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit' });
  }
  return date.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
}

// The same time and value geometry is used by all three telemetry graphs.
function drawSeriesChart(host, points, config, numeric, endAt, telemetry) {
  const width = 480, height = 126;
  const left = 47, right = 9, top = 7, bottom = 29;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const duration = RANGE_DURATION_MS[activeRange] || RANGE_DURATION_MS['1h'];
  const end = Number.isFinite(Date.parse(endAt)) ? Date.parse(endAt) : Date.now();
  const start = end - duration;
  const scale = valueScale(numeric, config);
  const range = Math.max(0.00001, scale.maximum - scale.minimum);
  const positionX = (at) => left + Math.max(0, Math.min(1, (at - start) / duration)) * plotWidth;
  const positionY = (value) => top + plotHeight * (1 - (value - scale.minimum) / range);
  const svg = svgNode('svg', {
    viewBox:'0 0 ' + width + ' ' + height,
    role:'img',
    'aria-label':config.aria,
    preserveAspectRatio:'none'
  });
  svg.classList.add('dashboard-sparkline');

  for (let index = 0; index <= 4; index += 1) {
    const y = top + plotHeight * index / 4;
    const value = scale.maximum - (scale.maximum - scale.minimum) * index / 4;
    const grid = svgNode('line', { x1:left, y1:y, x2:width-right, y2:y });
    grid.classList.add('dashboard-chart-gridline');
    const tick = svgNode('text', { x:left-7, y:y+3.5, 'text-anchor':'end' });
    tick.classList.add('dashboard-chart-axis-label');
    tick.textContent = axisValue(value, scale.step);
    svg.append(grid, tick);
  }
  for (let index = 0; index <= 4; index += 1) {
    const x = left + plotWidth * index / 4;
    const tick = svgNode('text', {
      x, y:height-8,
      'text-anchor':index === 0 ? 'start' : index === 4 ? 'end' : 'middle'
    });
    tick.classList.add('dashboard-chart-axis-label');
    tick.textContent = axisTime(start + duration * index / 4);
    svg.append(tick);
  }

  const maximumGap = Math.max(duration / Math.max(points.length, 1) * 2.5,
    (Number(telemetry?.sample_interval_seconds) || 60) * 3000);
  const sampled = points.map((point) => {
    const time = Date.parse(point?.at);
    const value = metricNumber(point?.[config.key]);
    if (!Number.isFinite(time) || value === null || time < start || time > end) return null;
    return { time, value, x:positionX(time), y:positionY(value) };
  });

  let segment = [];
  let previous = null;
  const finishSegment = () => {
    if (segment.length > 1) {
      const path = svgNode('path', {
        d:segment.map((point, index) =>
          (index ? 'L' : 'M') + point.x.toFixed(2) + ',' + point.y.toFixed(2)).join(' ')
      });
      path.classList.add('dashboard-chart-line');
      svg.append(path);
    } else if (segment.length === 1) {
      const dot = svgNode('circle', { cx:segment[0].x, cy:segment[0].y, r:2.5 });
      dot.classList.add('dashboard-chart-point');
      svg.append(dot);
    }
    segment = [];
  };
  for (const point of sampled) {
    if (!point) { finishSegment(); previous = null; continue; }
    if (previous && point.time - previous.time > maximumGap) finishSegment();
    segment.push(point);
    previous = point;
  }
  finishSegment();

  const valid = sampled.filter(Boolean);
  if (valid.length) {
    const crosshair = svgNode('line', { x1:0, x2:0, y1:top, y2:top+plotHeight, visibility:'hidden' });
    crosshair.classList.add('dashboard-chart-crosshair');
    const dot = svgNode('circle', { cx:0, cy:0, r:4, visibility:'hidden' });
    dot.classList.add('dashboard-chart-hover-circle');
    svg.append(crosshair, dot);
    const tooltip = document.createElement('div');
    tooltip.className = 'dashboard-chart-tooltip';
    tooltip.hidden = true;
    host.append(tooltip);
    let lastPoint = null;
    const hide = () => {
      tooltip.hidden = true;
      crosshair.setAttribute('visibility', 'hidden');
      dot.setAttribute('visibility', 'hidden');
      lastPoint = null;
    };
    const move = (event) => {
      const bounds = svg.getBoundingClientRect();
      if (!bounds.width) return;
      const cursorX = (event.clientX - bounds.left) / bounds.width * width;
      if (cursorX < left || cursorX > width-right) { hide(); return; }
      let closest = valid[0];
      for (const candidate of valid) {
        if (Math.abs(candidate.x-cursorX) < Math.abs(closest.x-cursorX)) closest = candidate;
      }
      if (lastPoint === closest) return;
      lastPoint = closest;
      crosshair.setAttribute('x1', String(closest.x));
      crosshair.setAttribute('x2', String(closest.x));
      crosshair.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', String(closest.x));
      dot.setAttribute('cy', String(closest.y));
      dot.setAttribute('visibility', 'visible');
      tooltip.textContent = new Date(closest.time).toLocaleString('ru-RU', {
        day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'
      }) + ' · ' + config.format(closest.value);
      tooltip.style.left = Math.max(22, Math.min(78, closest.x / width * 100)) + '%';
      tooltip.hidden = false;
    };
    svg.addEventListener('pointermove', move, { passive:true });
    svg.addEventListener('pointerdown', move, { passive:true });
    svg.addEventListener('pointerleave', hide);
  }
  host.prepend(svg);
}

function renderUptimeCard(card, points, selectedTv) {
  const current = latestValue(points, 'uptime_hours');
  const samples = points.filter((point) => metricNumber(point?.uptime_hours) !== null);
  const currentNode = card?.querySelector('[data-dashboard-current]');
  const status = card?.querySelector('[data-dashboard-uptime-state]');
  const last = card?.querySelector('[data-dashboard-uptime-last]');
  const sampleNode = card?.querySelector('[data-dashboard-uptime-samples]');
  if (currentNode) currentNode.textContent = uptimeText(current);
  if (status) {
    const healthy = selectedTv?.online === true && Boolean(samples.length)
      && !selectedTv?.problem_code;
    status.classList.toggle('is-online', healthy);
    status.textContent = !samples.length ? 'Нет данных о времени работы'
      : !selectedTv?.online ? 'TV офлайн · последний известный показатель'
      : selectedTv?.problem_code ? 'Проверка данных Player'
      : 'Player работает';
  }
  const timestamp = samples.at(-1)?.at || selectedTv?.last_metric_at;
  if (last) last.textContent = timestamp ? formatDate(timestamp) : '—';
  if (sampleNode) sampleNode.textContent = samples.length ? numberText(samples.length) : '—';
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


function drawChart(card, points, config, selectedTv, telemetry, generatedAt) {
  const host = card?.querySelector('[data-dashboard-chart]');
  const latest = card?.querySelector('[data-dashboard-current]');
  const minNode = card?.querySelector('[data-dashboard-min]');
  const maxNode = card?.querySelector('[data-dashboard-max]');
  if (!host) return;

  const numeric = points.map((point) => metricNumber(point?.[config.key])).filter(Number.isFinite);
  const current = latestValue(points, config.key);
  if (latest) latest.textContent = current === null ? '—' : config.format(current);
  if (minNode) minNode.textContent = numeric.length ? config.format(Math.min(...numeric)) : '—';
  if (maxNode) maxNode.textContent = numeric.length ? config.format(Math.max(...numeric)) : '—';

  host.replaceChildren();
  card?.classList.toggle('is-empty', !numeric.length);
  if (!numeric.length) {
    const empty = document.createElement('div');
    empty.className = 'dashboard-chart-empty';
    empty.textContent = emptyChartMessage(selectedTv, telemetry);
    host.append(empty);
    return;
  }
  drawSeriesChart(host, points, config, numeric, generatedAt, telemetry);
}

function drawAllCharts(points, selectedTv, telemetry, generatedAt) {
  const configs = [
    { id:'fps', key:'fps_avg', format:(value)=>numberText(value, 1) + ' FPS',
      aria:'FPS Player с числовой шкалой и осью времени' },
    { id:'load', key:'player_load_percent', format:(value)=>numberText(value, 1) + '%',
      aria:'Нагрузка главного потока Player в процентах, со шкалой от 0 до 100' },
    { id:'memory', key:'memory_mb', format:(value)=>numberText(value, 0) + ' МБ',
      aria:'Память JavaScript Player с числовой шкалой в мегабайтах' }
  ];
  const hasTelemetry = [...configs.map((config) => config.key), 'uptime_hours'].some((key) =>
    points.some((point) => metricNumber(point?.[key]) !== null)
  );
  const grid = document.querySelector('.dashboard-chart-grid');
  const sharedEmpty = document.querySelector('[data-dashboard-charts-empty]');
  const sharedMessage = document.querySelector('[data-dashboard-charts-empty-message]');
  grid?.classList.toggle('is-empty', !hasTelemetry);
  if (sharedEmpty) sharedEmpty.hidden = hasTelemetry;
  if (sharedMessage && !hasTelemetry) {
    sharedMessage.textContent = emptyChartMessage(selectedTv, telemetry);
  }

  for (const config of configs) {
    const card = document.querySelector('[data-dashboard-card="' + config.id + '"]');
    if (card) card.hidden = !hasTelemetry;
    drawChart(card, points, config, selectedTv, telemetry, generatedAt);
  }
  const uptime = document.querySelector('[data-dashboard-card="uptime"]');
  if (uptime) uptime.hidden = !hasTelemetry;
  renderUptimeCard(uptime, points, selectedTv);
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
  drawAllCharts(Array.isArray(data.player_metrics?.points) ? data.player_metrics.points : [], selected, data.telemetry || {}, data.generated_at);
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
