import { element } from './dom.js';
import { state } from './state.js';
import { setIcon } from '../components/icons.js';

function imageElement(url, label) {
  const image = document.createElement('img');
  image.src = url;
  image.alt = label;
  image.className = 'brand-image';
  return image;
}

function rgb(hex) {
  const match = String(hex || '').trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function hex({ r, g, b }) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function mix(source, target, amount) {
  const left = rgb(source);
  const right = rgb(target);
  if (!left || !right) return source;
  return hex({ r: left.r + (right.r - left.r) * amount, g: left.g + (right.g - left.g) * amount, b: left.b + (right.b - left.b) * amount });
}

function luminance(value) {
  const color = rgb(value);
  if (!color) return 0;
  const channel = (input) => {
    const normalized = input / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrast(left, right) {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function foregroundFor(background) {
  return contrast(background, '#111111') >= contrast(background, '#FFFFFF') ? '#111111' : '#FFFFFF';
}

function accessibleAccentText(accent, background, target) {
  if (contrast(accent, background) >= 4.5) return accent;
  for (let step = 1; step <= 10; step += 1) {
    const candidate = mix(accent, target, step / 10);
    if (contrast(candidate, background) >= 4.5) return candidate;
  }
  return target;
}

function applyAccentColor(accent) {
  if (!rgb(accent)) return;
  const theme = currentTheme();
  const root = document.documentElement;
  const panelBackground = theme === 'dark' ? '#151D29' : '#FFFFFF';
  const chromeBackground = theme === 'dark' ? '#151D29' : '#F8F9FB';
  const themeTarget = theme === 'dark' ? '#FFFFFF' : '#000000';
  root.style.setProperty('--brand-accent', accent);
  root.style.setProperty('--ui-accent', accent);
  root.style.setProperty('--brand-accent-hover', mix(accent, theme === 'dark' ? '#FFFFFF' : '#000000', 0.12));
  root.style.setProperty('--ui-accent-hover', mix(accent, theme === 'dark' ? '#FFFFFF' : '#000000', 0.12));
  root.style.setProperty('--brand-accent-contrast', foregroundFor(accent));
  root.style.setProperty('--ui-accent-contrast', foregroundFor(accent));
  root.style.setProperty('--brand-accent-text', accessibleAccentText(accent, panelBackground, themeTarget));
  root.style.setProperty('--ui-accent-text', accessibleAccentText(accent, panelBackground, themeTarget));
  root.style.setProperty('--brand-accent-on-dark', accessibleAccentText(accent, '#151D29', '#FFFFFF'));
  root.style.setProperty('--ui-accent-on-dark', accessibleAccentText(accent, '#151D29', '#FFFFFF'));
  root.style.setProperty('--brand-accent-on-chrome', accessibleAccentText(accent, chromeBackground, themeTarget));
  root.style.setProperty('--ui-accent-on-chrome', accessibleAccentText(accent, chromeBackground, themeTarget));
}

function formatByteLimit(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Лимит загрузки задаётся сервером.';
  const mebibytes = bytes / (1024 * 1024);
  return `PNG, JPEG или WebP · максимум ${Number.isInteger(mebibytes) ? mebibytes : mebibytes.toFixed(1)} МБ`;
}

export function applyPresentation(site) {
  if (!site) return;
  const name = site.app_name || site.application_name || 'MIRA-TV';
  document.title = name;
  document.documentElement.dataset.signinLogoSize = String(Math.max(1, Math.min(7, Number(site.signin_logo_size) || 1)));
  document.querySelectorAll('[data-app-name]').forEach((node) => { node.textContent = name; });
  document.querySelectorAll('[data-screen-background-limit]').forEach((node) => { node.textContent = formatByteLimit(site.screen_background_max_bytes); });
  if (site.accent_color) applyAccentColor(site.accent_color);
  document.querySelectorAll('.brand-mark').forEach((mark) => {
    mark.replaceChildren();
    if (site.logo_url) mark.append(imageElement(site.logo_url, 'Логотип'));
    else mark.textContent = 'ТВ';
  });
  let favicon = document.querySelector("link[rel='icon']");
  if (site.favicon_url) {
    if (!favicon) { favicon = document.createElement('link'); favicon.rel = 'icon'; document.head.append(favicon); }
    favicon.href = site.favicon_url;
  } else if (favicon) favicon.remove();
  const logoPreview = document.querySelector('[data-logo-preview]');
  if (logoPreview) { logoPreview.src = site.logo_url || ''; logoPreview.classList.toggle('is-hidden', !site.logo_url); }
  const faviconPreview = document.querySelector('[data-favicon-preview]');
  if (faviconPreview) { faviconPreview.src = site.favicon_url || ''; faviconPreview.classList.toggle('is-hidden', !site.favicon_url); }
}

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme) {
  const requested = theme || 'system';
  const actual = requested === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : requested;
  document.documentElement.dataset.theme = actual;
  document.documentElement.dataset.themePreference = requested;
  if (state.site?.accent_color) applyAccentColor(state.site.accent_color);
  try { window.localStorage.setItem('menu-tv-theme', requested); } catch { /* Storage can be unavailable. */ }
  const toggle = element('theme-toggle');
  if (toggle) {
    setIcon(toggle, actual === 'dark' ? 'sun' : 'moon');
    toggle.setAttribute('aria-label', actual === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
  }
}

export function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const timezone = state.site?.timezone || undefined;
  const parts = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).formatToParts(date);
  const valueFor = (type) => parts.find((part) => part.type === type)?.value || '';
  const calendar = state.site?.date_format === 'YYYY-MM-DD' ? `${valueFor('year')}-${valueFor('month')}-${valueFor('day')}` : `${valueFor('day')}.${valueFor('month')}.${valueFor('year')}`;
  return `${calendar}, ${valueFor('hour')}:${valueFor('minute')}`;
}
