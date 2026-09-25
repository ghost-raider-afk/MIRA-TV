const DEFAULT_INTERVAL_MS = 60_000;
const FPS_SAMPLE_MS = 4000;

function positiveInterval(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 30_000 ? Math.min(number, 600_000) : DEFAULT_INTERVAL_MS;
}

function bounded(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : null;
}

function heapUsedBytes() {
  const memory = performance?.memory;
  const used = Number(memory?.usedJSHeapSize);
  return Number.isFinite(used) && used >= 0 ? Math.round(used) : null;
}

function deviceMemoryGb() {
  return bounded(navigator?.deviceMemory, 0.25, 256);
}

function hardwareConcurrency() {
  const value = Number(navigator?.hardwareConcurrency);
  return Number.isFinite(value) && value >= 1 ? Math.round(Math.min(512, value)) : null;
}

async function measureFps(durationMs = FPS_SAMPLE_MS) {
  if (document.visibilityState === 'hidden') return null;
  return new Promise((resolve) => {
    let first = null;
    let previous = null;
    let frames = 0;
    let elapsed = 0;

    const tick = (timestamp) => {
      if (document.visibilityState === 'hidden') {
        resolve(null);
        return;
      }
      if (first === null) {
        first = timestamp;
        previous = timestamp;
        requestAnimationFrame(tick);
        return;
      }
      frames += 1;
      elapsed = timestamp - first;
      previous = timestamp;
      if (elapsed >= durationMs) {
        const fps = elapsed > 0 ? frames * 1000 / elapsed : null;
        resolve(bounded(fps, 0, 240));
        return;
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}

export function createPlayerMetricsCollector({ endpoint = '/api/device/metrics' } = {}) {
  let intervalMs = DEFAULT_INTERVAL_MS;
  let timer = null;
  let running = false;
  let inFlight = false;
  let lastWindowAt = performance.now();
  let longTaskMs = 0;
  let longTaskSupported = false;
  let observer = null;

  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTaskMs += Math.max(0, Number(entry.duration) || 0);
    });
    observer.observe({ type:'longtask', buffered:true });
    longTaskSupported = true;
  } catch {
    observer = null;
  }

  function configure({ intervalMs: nextInterval } = {}) {
    intervalMs = positiveInterval(nextInterval);
    if (running) schedule(intervalMs);
  }

  function resetWindow(now = performance.now()) {
    const elapsed = Math.max(1, now - lastWindowAt);
    const load = longTaskSupported ? bounded(longTaskMs / elapsed * 100, 0, 100) : null;
    longTaskMs = 0;
    lastWindowAt = now;
    return load;
  }

  function schedule(delay = intervalMs) {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!running) return;
    timer = setTimeout(() => void sample(), Math.max(1000, Number(delay) || intervalMs));
  }

  async function sample() {
    timer = null;
    if (!running || inFlight) {
      schedule();
      return;
    }
    if (document.visibilityState === 'hidden' || !navigator.onLine) {
      resetWindow();
      schedule();
      return;
    }

    inFlight = true;
    const measuredAt = performance.now();
    const playerLoad = resetWindow(measuredAt);
    try {
      const fps = await measureFps();
      const body = {
        sampled_at:new Date().toISOString(),
        fps_avg:fps,
        player_load_percent:playerLoad,
        js_heap_used_bytes:heapUsedBytes(),
        device_memory_gb:deviceMemoryGb(),
        hardware_concurrency:hardwareConcurrency(),
        uptime_seconds:Math.round(performance.now() / 1000)
      };
      const response = await fetch(endpoint, {
        method:'POST',
        credentials:'include',
        cache:'no-store',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify(body)
      });
      if (!response.ok && response.status !== 401 && response.status !== 403) {
        throw new Error(`Player metrics HTTP ${response.status}`);
      }
    } catch (error) {
      console.debug('TV Player metrics skipped', error);
    } finally {
      inFlight = false;
      schedule();
    }
  }

  function start({ delay = 5000 } = {}) {
    if (running) return;
    running = true;
    lastWindowAt = performance.now();
    longTaskMs = 0;
    schedule(delay);
  }

  function stop() {
    running = false;
    if (timer) clearTimeout(timer);
    timer = null;
    longTaskMs = 0;
    lastWindowAt = performance.now();
  }

  function dispose() {
    stop();
    observer?.disconnect?.();
    observer = null;
  }

  return Object.freeze({ configure, start, stop, dispose });
}
