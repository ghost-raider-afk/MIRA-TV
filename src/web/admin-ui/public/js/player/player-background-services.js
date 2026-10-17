import { publishPlayerPreview } from './player-preview-capture.js';
import { createPlayerMetricsCollector } from './player-metrics.js';

const PREVIEW_SETTLE_MS = 1500;

export function createPlayerBackgroundServices(stage, { isVisible = () => true } = {}) {
  const metrics = createPlayerMetricsCollector();
  let previewInFlight = false;
  let previewQueued = false;
  let previewMaxBytes = null;
  let previewTimer = null;

  function clearPreviewTimer() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = null;
  }

  function schedulePreview() {
    if (!previewQueued || previewInFlight || !isVisible() || !navigator.onLine) return;
    clearPreviewTimer();
    previewTimer = setTimeout(() => {
      previewTimer = null;
      void publishPreview();
    }, PREVIEW_SETTLE_MS);
  }

  async function publishPreview() {
    if (previewInFlight || !previewQueued) return;
    if (!isVisible() || !navigator.onLine) return;
    previewInFlight = true;
    previewQueued = false;
    try {
      await publishPlayerPreview(stage, { maxBytes:previewMaxBytes });
    } catch (error) {
      console.debug('TV Player preview publish skipped', error);
    } finally {
      previewInFlight = false;
      if (previewQueued) schedulePreview();
    }
  }

  function configure(context, { source } = {}) {
    metrics.configure({ intervalMs:Number(context?.metrics_interval_ms) });
    const maxBytes = Number(context?.preview_max_bytes);
    if (Number.isFinite(maxBytes) && maxBytes > 0) previewMaxBytes = maxBytes;
    if (source !== 'last-known-good') metrics.start();
  }

  function online() {
    metrics.start();
    if (previewQueued) schedulePreview();
  }

  function requestPreview() {
    previewQueued = true;
    schedulePreview();
  }

  function stop() {
    metrics.stop();
    clearPreviewTimer();
  }

  return Object.freeze({ configure, online, requestPreview, stop });
}
