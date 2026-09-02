const WIDGET_TITLES = new Set(['Часы', 'Погода']);

function dispatch(control, type) {
  control?.dispatchEvent(new Event(type, { bubbles: true }));
}

function setValue(selector, value, eventType = 'input') {
  const control = document.querySelector(selector);
  if (!control) return;
  control.value = String(value);
  dispatch(control, eventType);
}

function setChecked(selector, value) {
  const control = document.querySelector(selector);
  if (!control) return;
  control.checked = Boolean(value);
  dispatch(control, 'change');
}

function colorFromBackground(value) {
  const text = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  const rgba = text.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!rgba) return '#10141c';
  return `#${rgba.slice(1, 4).map((part) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0')).join('')}`;
}

function syncBackgroundControls() {
  const source = document.querySelector('#element-background');
  const mode = document.querySelector('#element-background-mode');
  const color = document.querySelector('#element-background-color');
  const colorField = document.querySelector('#element-background-color-field');
  if (!source || !mode || !color || !colorField) return;
  const transparent = String(source.value || '').trim().toLowerCase() === 'transparent';
  mode.value = transparent ? 'transparent' : 'color';
  color.value = colorFromBackground(source.value);
  colorField.classList.toggle('is-hidden', transparent);
}

function widgetSelected() {
  return WIDGET_TITLES.has(document.querySelector('#inspector-title')?.textContent?.trim());
}

function syncWidgetControls({ resetPreset = false } = {}) {
  const section = document.querySelector('#widget-appearance-settings');
  const preset = document.querySelector('#widget-appearance-preset');
  if (!section || !preset) return;
  section.classList.toggle('is-hidden', !widgetSelected());
  if (resetPreset) preset.value = '';
}

function applyWidgetPreset(value) {
  const presets = {
    'ios-dark': {
      background: 'rgba(28,28,30,.78)', color: '#ffffff', radius: 34,
      borderWidth: 1, borderColor: '#5a5a5f', shadow: true
    },
    'ios-light': {
      background: 'rgba(242,242,247,.86)', color: '#111114', radius: 34,
      borderWidth: 1, borderColor: '#ffffff', shadow: true
    },
    'ios-blue': {
      background: 'rgba(31,111,235,.82)', color: '#ffffff', radius: 34,
      borderWidth: 1, borderColor: '#6da7ff', shadow: true
    },
    clear: {
      background: 'transparent', color: '#ffffff', radius: 0,
      borderWidth: 0, borderColor: '#ffffff', shadow: false
    }
  };
  const config = presets[value];
  if (!config) return;
  setValue('#element-background', config.background, 'change');
  setValue('#element-color', config.color, 'input');
  setValue('#element-radius', config.radius, 'input');
  setValue('#element-border-width', config.borderWidth, 'input');
  setValue('#element-border-color', config.borderColor, 'input');
  setChecked('#element-shadow', config.shadow);
  syncBackgroundControls();
}

export function initialiseSceneFormatControls() {
  const inspector = document.querySelector('.scene-inspector');
  const source = document.querySelector('#element-background');
  const mode = document.querySelector('#element-background-mode');
  const color = document.querySelector('#element-background-color');
  const preset = document.querySelector('#widget-appearance-preset');
  if (!inspector || !source || !mode || !color || !preset || inspector.dataset.formatControlsBound === '1') return;
  inspector.dataset.formatControlsBound = '1';

  mode.addEventListener('change', () => {
    if (mode.value === 'transparent') source.value = 'transparent';
    else source.value = color.value || '#10141c';
    dispatch(source, 'change');
    syncBackgroundControls();
  });

  color.addEventListener('input', () => {
    if (mode.value !== 'color') return;
    source.value = color.value;
    dispatch(source, 'change');
  });

  preset.addEventListener('change', () => applyWidgetPreset(preset.value));

  document.querySelectorAll('[data-inspector-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      inspector.scrollTop = 0;
      queueMicrotask(() => {
        syncBackgroundControls();
        syncWidgetControls();
      });
    });
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#scene-stage, #scene-slide-list, [data-add-element]')) return;
    queueMicrotask(() => {
      syncBackgroundControls();
      syncWidgetControls({ resetPreset: true });
    });
  });

  source.addEventListener('change', syncBackgroundControls);
  syncBackgroundControls();
  syncWidgetControls({ resetPreset: true });
}
