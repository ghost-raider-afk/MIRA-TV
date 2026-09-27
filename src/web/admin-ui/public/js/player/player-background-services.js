import { publishPlayerPreview } from './player-preview-capture.js';
import { createPlayerMetricsCollector } from './player-metrics.js';

export function createPlayerBackgroundServices(stage, { isVisible = () => true } = {}) {
  const metrics = createPlayerMetricsCollector();
  let previewTimer = null;
  let previewInFlight = false;
  let previewCaptureIntervalMs = null;
  let previewMaxBytes = null;

  function stopPreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = null;
  }

  function schedulePreview(delayMs = previewCaptureIntervalMs) {
    stopPreview();
    if (!Number.isFinite(previewCaptureIntervalMs) || previewCaptureIntervalMs < 10_000) return;
    const delay = Math.max(250, Number.isFinite(delayMs) ? delayMs : previewCaptureIntervalMs);
    previewTimer = setTimeout(() => void publishPreview(), delay);
  }

  async function publishPreview() {
    previewTimer = null;
    if (previewInFlight || !isVisible() || !navigator.onLine) {
      schedulePreview();
      return;
    }
    previewInFlight = true;
    try {
      await publishPlayerPreview(stage, { maxBytes:previewMaxBytes });
    } catch (error) {
      console.debug('TV Player preview publish skipped', error);
    } finally {
      previewInFlight = false;
      schedulePreview();
    }
  }

  function configure(context, { source } = {}) {
    metrics.configure({ intervalMs:Number(context?.metrics_interval_ms) });

    const previewInterval = Number(context?.preview_capture_interval_ms);
    if (Number.isFinite(previewInterval) && previewInterval >= 10_000) previewCaptureIntervalMs = previewInterval;
    const maxBytes = Number(context?.preview_max_bytes);
    if (Number.isFinite(maxBytes) && maxBytes > 0) previewMaxBytes = maxBytes;

    if (source !== 'last-known-good') {
      metrics.start();
      schedulePreview(450);
    }
  }

  function online() {
    metrics.start();
    schedulePreview(450);
  }

  function visibilityChanged() {
    if (document.visibilityState === 'visible') schedulePreview(450);
  }

  function requestPreview() {
    if (!isVisible()) return;
    void publishPreview();
  }

  function stop() {
    stopPreview();
    metrics.stop();
  }

  return Object.freeze({ configure, online, visibilityChanged, requestPreview, stop });
}
