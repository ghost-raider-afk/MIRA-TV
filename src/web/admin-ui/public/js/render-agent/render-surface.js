import { ALL_PLAYER_COMPONENTS, PlayerSceneRenderer } from '../player/player-scene-renderer.js';

function tokenFromLocation() {
  return new URLSearchParams(window.location.search).get('token') || '';
}

function waitForEvent(target, name, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      target.removeEventListener(name, finish);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    target.addEventListener(name, finish, { once:true });
  });
}

async function waitForAssets(stage) {
  try { await document.fonts?.ready; } catch {}
  const images = [...stage.querySelectorAll('img')];
  await Promise.all(images.map(async (image) => {
    if (image.complete) {
      try { await image.decode?.(); } catch {}
      return;
    }
    await waitForEvent(image, 'load', 5000);
  }));
  const videos = [...stage.querySelectorAll('video[data-scene-source]')];
  await Promise.all(videos.map(async (video) => {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return;
    await waitForEvent(video, 'loadedmetadata', 5000);
  }));
}

async function seekSceneVideo(video, milliseconds) {
  if (!(video instanceof HTMLVideoElement)) return;
  if (!Number.isFinite(video.duration) || video.duration <= 0) return;
  const seconds = Math.max(0, Number(milliseconds) || 0) / 1000;
  const duration = Math.max(0.001, video.duration);
  const target = video.loop ? seconds % duration : Math.min(seconds, Math.max(0, duration - 0.001));
  if (Math.abs(video.currentTime - target) <= 0.008) return;
  const seeked = waitForEvent(video, 'seeked', 2500);
  try { video.currentTime = target; } catch { return; }
  await seeked;
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function configureSurface(host, width, height) {
  document.documentElement.style.margin = '0';
  document.documentElement.style.width = width + 'px';
  document.documentElement.style.height = height + 'px';
  document.documentElement.style.overflow = 'hidden';
  document.documentElement.style.background = '#000';
  document.body.style.margin = '0';
  document.body.style.width = width + 'px';
  document.body.style.height = height + 'px';
  document.body.style.overflow = 'hidden';
  document.body.style.background = '#000';
  host.style.position = 'relative';
  host.style.width = width + 'px';
  host.style.height = height + 'px';
  host.style.overflow = 'hidden';
  host.style.background = '#000';
}

async function boot() {
  const token = tokenFromLocation();
  if (!token) throw new Error('Render Agent token is missing.');

  const response = await fetch('/api/render-agent/context?token=' + encodeURIComponent(token), {
    cache:'no-store',
    credentials:'omit'
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || ('Render context HTTP ' + response.status));
  }
  const renderPackage = await response.json();
  if (renderPackage.bake_supported !== true) {
    throw new Error('Scene is not supported by baked Video Mode: ' + String(renderPackage.unsupported_reason || 'unknown'));
  }

  const width = Math.max(1, Number(renderPackage.screen?.width) || 1920);
  const height = Math.max(1, Number(renderPackage.screen?.height) || 1080);
  const host = document.querySelector('[data-render-agent-host]');
  const stage = document.querySelector('[data-render-agent-stage]');
  if (!(host instanceof HTMLElement) || !(stage instanceof HTMLElement)) throw new Error('Render surface DOM is unavailable.');

  configureSurface(host, width, height);
  stage.dataset.playerActive = 'false';

  const context = {
    schema_version: 0,
    revision: 'render-agent:' + String(renderPackage.render_revision),
    render_revision: renderPackage.render_revision,
    screen: renderPackage.screen,
    draft: renderPackage.draft,
    products: renderPackage.products,
    packaging: renderPackage.packaging,
    scene: renderPackage.scene,
    animation: renderPackage.animation,
    scene_playlist: null,
    scene_video: null
  };

  const renderer = new PlayerSceneRenderer(stage, { autoplay:false });
  await renderer.render(context, ALL_PLAYER_COMPONENTS);
  renderer.sceneMotionRuntime.pause();
  await renderer.sceneMotionRuntime.driver?.kernelPromise?.catch(() => null);
  await waitForAssets(stage);
  await nextPaint();

  window.__miraRenderSurface = Object.freeze({
    ready:true,
    width,
    height,
    fps:Number(renderPackage.target?.fps) || 25,
    durationMs:Number(renderPackage.target?.loop_duration_ms) || 12000,
    inputHash:String(renderPackage.input_hash || ''),
    renderRevision:Number(renderPackage.render_revision) || 1,
    async seek(milliseconds) {
      const time = Math.max(0, Number(milliseconds) || 0);
      renderer.sceneMotionRuntime.seek(time);
      const videos = [...stage.querySelectorAll('video[data-scene-source]')];
      await Promise.all(videos.map((video) => seekSceneVideo(video, time)));
      await nextPaint();
      return true;
    }
  });
}

window.__miraRenderSurface = Object.freeze({ ready:false });
boot().catch((error) => {
  console.error('MIRA-TV Render Surface failed', error);
  window.__miraRenderSurface = Object.freeze({
    ready:false,
    error:String(error?.message || error)
  });
});
