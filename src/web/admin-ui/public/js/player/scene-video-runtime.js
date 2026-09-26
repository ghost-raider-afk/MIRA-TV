function sameOriginVideoUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/site-assets/')) return '';
    return url.href;
  } catch {
    return '';
  }
}

function waitForFirstFrame(video, timeoutMs = 5000) {
  if (!(video instanceof HTMLVideoElement)) return Promise.resolve(false);
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
      resolve(value);
    };
    const onReady = () => finish(true);
    const onError = () => finish(false);
    const timer = setTimeout(() => finish(video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA), timeoutMs);
    video.addEventListener('loadeddata', onReady, { once:true });
    video.addEventListener('canplay', onReady, { once:true });
    video.addEventListener('error', onError, { once:true });
  });
}

export class SceneVideoRuntime {
  constructor(layer, { activityTarget = null, autoplay = true } = {}) {
    if (!(layer instanceof HTMLElement)) throw new TypeError('SceneVideoRuntime requires an HTMLElement layer.');
    this.layer = layer;
    this.activityTarget = activityTarget instanceof HTMLElement ? activityTarget : null;
    this.autoplay = autoplay !== false;
    this.active = this.activityTarget ? this.activityTarget.dataset.playerActive === 'true' : true;
    this.visible = this.activityTarget?.dataset.scenePlaylistFullscreen !== 'true';
    this.source = '';
    this.destroyed = false;

    this.video = document.createElement('video');
    this.video.className = 'tv-player-baked-video';
    this.video.muted = true;
    this.video.defaultMuted = true;
    this.video.loop = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.disablePictureInPicture = true;
    this.video.setAttribute('aria-hidden', 'true');
    this.layer.replaceChildren(this.video);
    this.layer.hidden = true;

    this.handleVisibility = () => this.syncPlayback();
    this.handleActivity = (event) => {
      this.active = event?.detail?.active === true;
      this.syncPlayback();
    };
    this.handlePlaylist = (event) => {
      this.visible = event?.detail?.fullscreen !== true;
      this.syncPlayback();
    };

    document.addEventListener('visibilitychange', this.handleVisibility);
    this.activityTarget?.addEventListener('mira:player-active', this.handleActivity);
    this.activityTarget?.addEventListener('mira:scene-playlist-mode', this.handlePlaylist);
  }

  playbackAllowed() {
    return this.autoplay && this.active && this.visible && document.visibilityState !== 'hidden';
  }

  async render(component) {
    if (this.destroyed) return false;
    const source = component?.status === 'ready' && component?.enabled === true
      ? sameOriginVideoUrl(component.source_url)
      : '';
    if (!source) {
      this.reset();
      return false;
    }

    if (source !== this.source) {
      this.source = source;
      this.layer.hidden = true;
      this.video.pause();
      this.video.src = source;
      this.video.load();
      const ready = await waitForFirstFrame(this.video);
      if (!ready || source !== this.source) {
        this.layer.hidden = true;
        return false;
      }
    }

    this.layer.hidden = false;
    this.syncPlayback();
    return true;
  }

  syncPlayback() {
    if (this.destroyed || this.layer.hidden || !this.source || !this.playbackAllowed()) {
      this.video?.pause();
      return;
    }
    const result = this.video.play();
    if (result && typeof result.catch === 'function') result.catch(() => undefined);
  }

  reset() {
    if (this.destroyed) return;
    this.source = '';
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.layer.hidden = true;
  }

  destroy() {
    if (this.destroyed) return;
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.activityTarget?.removeEventListener('mira:player-active', this.handleActivity);
    this.activityTarget?.removeEventListener('mira:scene-playlist-mode', this.handlePlaylist);
    this.destroyed = true;
    this.video.pause();
    this.video.removeAttribute('src');
    this.layer.replaceChildren();
    this.source = '';
  }
}
