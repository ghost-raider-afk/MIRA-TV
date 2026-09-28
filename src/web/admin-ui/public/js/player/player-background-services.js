import { publishPlayerPreview } from './player-preview-capture.js';
import { createPlayerMetricsCollector } from './player-metrics.js';

export function createPlayerBackgroundServices(stage, { isVisible = () => true } = {}) {
  const metrics = createPlayerMetricsCollector();
  let previewInFlight = false;
  let previewMaxBytes = null;

  async function publishPreview() {
    if (previewInFlight || !isVisible() || !navigator.onLine) return;
    previewInFlight = true;
    try {
      await publishPlayerPreview(stage, { maxBytes:previewMaxBytes });
    } catch (error) {
      console.debug('TV Player preview publish skipped', error);
    } finally {
      previewInFlight = false;
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
  }

  function requestPreview() {
    void publishPreview();
  }

  function stop() {
    metrics.stop();
  }

  return Object.freeze({ configure, online, requestPreview, stop });
}
