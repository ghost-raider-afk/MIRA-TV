const DEFAULT_WASM_URL = '/wasm/mira-motion-kernel.wasm';
let sharedPromise = null;

const FUNCTIONS = Object.freeze([
  'mira_row_x', 'mira_row_y', 'mira_row_scale', 'mira_row_brightness',
  'mira_promo_scale', 'mira_promo_glow', 'mira_promo_wave_progress', 'mira_promo_wave_opacity'
]);
const TAU = Math.PI * 2;

function wrap01(value) {
  const wrapped = Number(value) % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function oscillator(phase, phaseOffset) {
  return Math.sin(TAU * wrap01(Number(phase) + Number(phaseOffset)));
}

function quadrature(phase, phaseOffset) {
  return Math.cos(TAU * wrap01(Number(phase) + Number(phaseOffset)));
}

function promoEnvelope(phase, activeFraction) {
  const p = wrap01(phase);
  const active = Math.max(0.05, Math.min(Number(activeFraction), 0.95));
  if (p >= active) return 0;
  const s = Math.sin(Math.PI * (p / active));
  return s * s;
}

function javascriptKernel() {
  return Object.freeze({
    _mira_row_x: (phase, phaseOffset, amplitude) => Number(amplitude) * oscillator(phase, phaseOffset),
    _mira_row_y: (phase, phaseOffset, amplitude) => Number(amplitude) * quadrature(phase, phaseOffset),
    _mira_row_scale: (phase, phaseOffset, amount) => 1 + Number(amount) * 0.5 * (1 + oscillator(phase, phaseOffset)),
    _mira_row_brightness: (phase, phaseOffset, amount) => 1 + Number(amount) * 0.5 * (1 + quadrature(phase, phaseOffset)),
    _mira_promo_scale: (phase, activeFraction, amount) => 1 + Number(amount) * promoEnvelope(phase, activeFraction),
    _mira_promo_glow: (phase, activeFraction) => promoEnvelope(phase, activeFraction),
    _mira_promo_wave_progress: (phase, activeFraction) => {
      const p = wrap01(phase);
      const active = Math.max(0.05, Math.min(Number(activeFraction), 0.95));
      return p >= active ? 0 : p / active;
    },
    _mira_promo_wave_opacity: (phase, activeFraction) => promoEnvelope(phase, activeFraction)
  });
}

function normaliseExports(exports) {
  const kernel = {};
  for (const name of FUNCTIONS) {
    const fn = exports?.[`_${name}`] || exports?.[name];
    if (typeof fn !== 'function') throw new Error(`MIRA motion kernel is missing ${name}.`);
    kernel[`_${name}`] = fn;
  }
  return Object.freeze(kernel);
}

async function instantiate(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`MIRA motion kernel HTTP ${response.status}.`);
  let result;
  if (typeof WebAssembly.instantiateStreaming === 'function') {
    try { result = await WebAssembly.instantiateStreaming(response.clone(), {}); }
    catch { result = await WebAssembly.instantiate(await response.arrayBuffer(), {}); }
  } else {
    result = await WebAssembly.instantiate(await response.arrayBuffer(), {});
  }
  return normaliseExports(result.instance?.exports || result.exports);
}

export function loadMotionKernel(url = DEFAULT_WASM_URL) {
  if (!sharedPromise) {
    sharedPromise = instantiate(url).catch((error) => {
      console.warn('MIRA motion WASM kernel unavailable; using deterministic JavaScript fallback.', error);
      return javascriptKernel();
    });
  }
  return sharedPromise;
}

export function resetMotionKernelForTests() { sharedPromise = null; }
