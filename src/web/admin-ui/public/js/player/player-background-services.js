import { publishPlayerPreview } from './player-preview-capture.js';
import { createPlayerMetricsCollector } from './player-metrics.js';

const MIN_PREVIEW_INTERVAL_MS = 10_000;
const INITIAL_PREVIEW_DELAY_MS = 450;

export function createPlayerBackgroundServices(stage, { isVisible = () => true } = {}) {
  const metrics = createPlayerMetricsCollector();
  let previewInFlight = false;
  let previewMaxBytes = null;
  let previewCaptureIntervalMs = null;
  let previewTimer = null;
  let stopped = false;

  function clearPreviewTimer() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = null;
  }

  function schedulePreview(delayMs = previewCaptureIntervalMs) {
    clearPreviewTimer();
    if (stopped || !Number.isFinite(previewCaptureIntervalMs) || previewCaptureIntervalMs < MIN_PREVIEW_INTERVAL_MS) return;
    const delay = Math.max(250, Number.isFinite(delayMs) ? delayMs : previewCaptureIntervalMs);
    previewTimer = setTimeout(() => void publishPreview({ reschedule:true }), delay);
  }

  async function publishPreview({ reschedule = false } = {}) {
    previewTimer = null;
    if (previewInFlight) {
      if (reschedule) schedulePreview();
      return;
    }
    if (!isVisible() || !navigator.onLine) {
      if (reschedule) schedulePreview();
      return;
    }
    previewInFlight = true;
    try {
      await publishPlayerPreview(stage, { maxBytes:previewMaxBytes });
    } catch (error) {
      console.debug('TV Player preview publish skipped', error);
    } finally {
      previewInFlight = false;
      if (reschedule) schedulePreview();
    }
  }

  function configure(context, { source } = {}) {
    stopped = false;
    metrics.configure({ intervalMs:Number(context?.metrics_interval_ms) });
    const maxBytes = Number(context?.preview_max_bytes);
    if (Number.isFinite(maxBytes) && maxBytes > 0) previewMaxBytes = maxBytes;
    const interval = Number(context?.preview_capture_interval_ms);
    if (Number.isFinite(interval) && interval >= MIN_PREVIEW_INTERVAL_MS) {
      previewCaptureIntervalMs = interval;
    }
    if (source !== 'last-known-good') {
      metrics.start();
      schedulePreview(INITIAL_PREVIEW_DELAY_MS);
    }
  }

  function online() {
    stopped = false;
    metrics.start();
    schedulePreview(INITIAL_PREVIEW_DELAY_MS);
  }

  function requestPreview() {
    stopped = false;
    void publishPreview({ reschedule:false });
  }

  function stop() {
    stopped = true;
    clearPreviewTimer();
    metrics.stop();
  }

  return Object.freeze({ configure, online, requestPreview, stop });
}
