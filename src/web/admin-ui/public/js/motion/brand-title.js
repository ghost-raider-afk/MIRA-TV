export const BRAND_FONT_STACKS = Object.freeze({
  inter: 'Inter, Arial, Helvetica, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  montserrat: 'Montserrat, Arial, Helvetica, sans-serif',
  oswald: 'Oswald, "Arial Narrow", Arial, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif'
});

const ENTRANCE_EFFECTS = Object.freeze(['none', 'pop-up', 'blur-reveal', 'zoom-in', 'tracking-expand', 'neon-reveal']);
const LOOP_EFFECTS = Object.freeze(['none', 'wave', 'neon-pulse', 'float', 'breathe', 'stretch']);
const EXIT_EFFECTS = Object.freeze(['none', 'fade-out', 'blur-out', 'zoom-out']);
const exitTimers = new WeakMap();

export const DEFAULT_BRAND_TITLE = Object.freeze({
  enabled: false,
  text: '',
  x: 960,
  y: 96,
  font_family: 'inter',
  font_size: 72,
  vertical_scale: 1,
  letter_spacing: 2,
  line_spacing: 6,
  text_color: '#FFFFFF',
  glow_color: '#35D9FF',
  glow_strength: 18,
  entrance_effect: 'blur-reveal',
  loop_effect: 'neon-pulse',
  exit_effect: 'fade-out',
  entrance_duration_ms: 900,
  exit_duration_ms: 550,
  letter_stagger_ms: 55,
  amplitude_px: 12,
  overshoot: 0.12,
  cycle_seconds: 5.5,
  effect: 'neon-pulse'
});

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function normaliseBrandTitle(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const textColor = /^#[0-9a-f]{6}$/i.test(String(source.text_color || '')) ? String(source.text_color) : DEFAULT_BRAND_TITLE.text_color;
  const glowColor = /^#[0-9a-f]{6}$/i.test(String(source.glow_color || '')) ? String(source.glow_color) : DEFAULT_BRAND_TITLE.glow_color;
  const legacyLoop = enumValue(source.effect, LOOP_EFFECTS, DEFAULT_BRAND_TITLE.loop_effect);
  const loopEffect = enumValue(source.loop_effect, LOOP_EFFECTS, legacyLoop);
  return {
    enabled: source.enabled === true,
    text: String(source.text ?? DEFAULT_BRAND_TITLE.text).replace(/\r\n?/g, '\n').trim().slice(0, 80),
    x: clamp(source.x, DEFAULT_BRAND_TITLE.x, 0, 1920),
    y: clamp(source.y, DEFAULT_BRAND_TITLE.y, 0, 1080),
    font_family: BRAND_FONT_STACKS[source.font_family] ? source.font_family : DEFAULT_BRAND_TITLE.font_family,
    font_size: clamp(source.font_size, DEFAULT_BRAND_TITLE.font_size, 18, 180),
    vertical_scale: clamp(source.vertical_scale, DEFAULT_BRAND_TITLE.vertical_scale, 0.5, 2.2),
    letter_spacing: clamp(source.letter_spacing, DEFAULT_BRAND_TITLE.letter_spacing, -2, 20),
    line_spacing: clamp(source.line_spacing, DEFAULT_BRAND_TITLE.line_spacing, -60, 80),
    text_color: textColor,
    glow_color: glowColor,
    glow_strength: clamp(source.glow_strength, DEFAULT_BRAND_TITLE.glow_strength, 0, 48),
    entrance_effect: enumValue(source.entrance_effect, ENTRANCE_EFFECTS, DEFAULT_BRAND_TITLE.entrance_effect),
    loop_effect: loopEffect,
    exit_effect: enumValue(source.exit_effect, EXIT_EFFECTS, DEFAULT_BRAND_TITLE.exit_effect),
    entrance_duration_ms: clamp(source.entrance_duration_ms, DEFAULT_BRAND_TITLE.entrance_duration_ms, 200, 5000),
    exit_duration_ms: clamp(source.exit_duration_ms, DEFAULT_BRAND_TITLE.exit_duration_ms, 150, 3000),
    letter_stagger_ms: clamp(source.letter_stagger_ms, DEFAULT_BRAND_TITLE.letter_stagger_ms, 0, 250),
    amplitude_px: clamp(source.amplitude_px, DEFAULT_BRAND_TITLE.amplitude_px, 0, 80),
    overshoot: clamp(source.overshoot, DEFAULT_BRAND_TITLE.overshoot, 0, 0.45),
    cycle_seconds: clamp(source.cycle_seconds, DEFAULT_BRAND_TITLE.cycle_seconds, 2, 30),
    effect: loopEffect
  };
}

function clearExitTimer(layer) {
  const timer = exitTimers.get(layer);
  if (timer) clearTimeout(timer);
  exitTimers.delete(layer);
}

function exitExistingBrand(layer, brand) {
  const existing = layer.querySelector('.scene-brand-title');
  if (!(existing instanceof HTMLElement)) {
    layer.replaceChildren();
    return;
  }
  if (existing.classList.contains('is-exiting')) return;
  const exitEffect = existing.dataset.exitEffect || 'none';
  const duration = Number(existing.dataset.exitDuration || brand.exit_duration_ms || 0);
  if (exitEffect === 'none' || duration <= 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    layer.replaceChildren();
    return;
  }
  existing.classList.add('is-exiting');
  clearExitTimer(layer);
  const timer = setTimeout(() => {
    if (layer.contains(existing)) layer.replaceChildren();
    exitTimers.delete(layer);
  }, duration + 60);
  exitTimers.set(layer, timer);
}

export function renderBrandTitleLayer(layer, value) {
  if (!(layer instanceof Element)) return null;
  const brand = normaliseBrandTitle(value);
  const signature = JSON.stringify(brand);
  const existing = layer.querySelector('.scene-brand-title');
  layer.classList.toggle('is-enabled', brand.enabled);
  if (!brand.enabled || !brand.text) {
    layer.dataset.brandSignature = '';
    exitExistingBrand(layer, brand);
    return brand;
  }
  if (layer.dataset.brandSignature === signature && existing instanceof HTMLElement && !existing.classList.contains('is-exiting')) {
    return brand;
  }

  clearExitTimer(layer);
  layer.replaceChildren();
  layer.dataset.brandSignature = signature;
  const root = document.createElement('div');
  root.className = 'scene-brand-title';
  root.dataset.brandTitle = 'true';
  root.dataset.entranceEffect = brand.entrance_effect;
  root.dataset.loopEffect = brand.loop_effect;
  root.dataset.exitEffect = brand.exit_effect;
  root.dataset.exitDuration = String(brand.exit_duration_ms);
  root.setAttribute('aria-label', brand.text);
  root.style.left = `${(brand.x / 19.2).toFixed(4)}cqw`;
  root.style.top = `${(brand.y / 19.2).toFixed(4)}cqw`;
  root.style.setProperty('--brand-font-family', BRAND_FONT_STACKS[brand.font_family]);
  root.style.setProperty('--brand-font-size', `${brand.font_size / 19.2}cqw`);
  root.style.setProperty('--brand-scale-y', String(brand.vertical_scale));
  root.style.setProperty('--brand-letter-spacing', `${brand.letter_spacing / 19.2}cqw`);
  root.style.setProperty('--brand-line-spacing', `${brand.line_spacing / 19.2}cqw`);
  root.style.setProperty('--brand-text-color', brand.text_color);
  root.style.setProperty('--brand-glow-color', brand.glow_color);
  root.style.setProperty('--brand-glow-radius', `${brand.glow_strength / 19.2}cqw`);
  root.style.setProperty('--brand-cycle', `${brand.cycle_seconds}s`);
  root.style.setProperty('--brand-enter-duration', `${brand.entrance_duration_ms}ms`);
  root.style.setProperty('--brand-exit-duration', `${brand.exit_duration_ms}ms`);
  root.style.setProperty('--brand-amplitude', `${brand.amplitude_px / 19.2}cqw`);
  root.style.setProperty('--brand-overshoot', String(1 + brand.overshoot));

  const motion = document.createElement('div');
  motion.className = 'scene-brand-title-motion';
  const glyphs = document.createElement('span');
  glyphs.className = 'scene-brand-title-glyphs';
  glyphs.setAttribute('aria-hidden', 'true');
  let glyphIndex = 0;
  brand.text.split('\n').forEach((lineText, lineIndex) => {
    const line = document.createElement('span');
    line.className = 'scene-brand-title-line';
    line.dataset.brandLine = String(lineIndex + 1);
    const characters = [...lineText];
    const center = (characters.length - 1) / 2;
    if (!characters.length) line.classList.add('is-empty');
    characters.forEach((character, index) => {
      const sequenceIndex = glyphIndex++;
      const shell = document.createElement('span');
      shell.className = 'scene-brand-glyph';
      shell.style.setProperty('--brand-delay', `${Math.round(sequenceIndex * brand.letter_stagger_ms)}ms`);
      shell.style.setProperty('--brand-loop-delay', `${Math.round(brand.entrance_duration_ms + sequenceIndex * brand.letter_stagger_ms + 90)}ms`);
      shell.style.setProperty('--brand-track-offset', `${((index - center) * Math.max(4, brand.amplitude_px) / 19.2).toFixed(4)}cqw`);
      const loop = document.createElement('span');
      loop.className = 'scene-brand-glyph-loop';
      const char = document.createElement('span');
      char.className = 'scene-brand-glyph-char';
      char.textContent = character === ' ' ? '\u00a0' : character;
      loop.append(char);
      shell.append(loop);
      line.append(shell);
    });
    glyphs.append(line);
  });
  motion.append(glyphs);
  root.append(motion);
  layer.append(root);
  return brand;
}
