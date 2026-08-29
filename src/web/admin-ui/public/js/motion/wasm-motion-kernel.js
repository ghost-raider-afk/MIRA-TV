const DEFAULT_WASM_URL = '/wasm/mira-motion-kernel.wasm';
let sharedPromise = null;

const FUNCTIONS = Object.freeze([
  'mira_row_x', 'mira_row_y', 'mira_row_scale', 'mira_row_brightness',
  'mira_promo_scale', 'mira_promo_glow', 'mira_promo_wave_progress', 'mira_promo_wave_opacity'
]);

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
  if (!sharedPromise) sharedPromise = instantiate(url);
  return sharedPromise;
}

export function resetMotionKernelForTests() { sharedPromise = null; }
