import { ALL_PLAYER_COMPONENTS, PlayerSceneRenderer } from './player-scene-renderer.js';

function renderToken() {
  return new URLSearchParams(window.location.search).get('token') || '';
}

function withoutWeather(scene) {
  const elements = Array.isArray(scene?.elements)
    ? scene.elements.filter((element) => element?.enabled !== false && element?.type !== 'weather')
    : [];
  return { ...(scene || { version: 1 }), elements };
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
    target.addEventListener(name, finish, { once: true });
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
    await waitForEvent(image, 'load');
  }));
  const videos = [...stage.querySelectorAll('video[data-scene-source]')];
  await Promise.all(videos.map(async (video) => {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return;
    await waitForEvent(video, 'loadedmetadata', 5000);
  }));
}

async function seekVideo(video, milliseconds) {
  if (!(video instanceof HTMLVideoElement)) return;
  if (!Number.isFinite(video.duration) || video.duration <= 0) return;
  const seconds = Math.max(0, Number(milliseconds) || 0) / 1000;
  const duration = Math.max(0.001, video.duration);
  const target = video.loop ? seconds % duration : Math.min(seconds, Math.max(0, duration - 0.001));
  if (Math.abs(video.currentTime - target) <= 0.012) return;
  const seeked = waitForEvent(video, 'seeked', 2500);
  try { video.currentTime = target; } catch { return; }
  await seeked;
}

async function nextPaint() {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function boot() {
  const token = renderToken();
  if (!token) throw new Error('Server render token is missing.');
  const response = await fetch('/__mira/scene-render/context?token=' + encodeURIComponent(token), {
    cache: 'no-store',
    credentials: 'omit'
  });
  if (!response.ok) throw new Error('Server render context is unavailable: HTTP ' + response.status);
  const context = await response.json();
  context.scene = withoutWeather(context.scene);
  context.scene_playlist = null;
  context.scene_video = null;

  const stage = document.querySelector('[data-server-render-stage]');
  const host = document.querySelector('[data-server-render-host]');
  const match = String(context.screen?.resolution || '').match(/(\d+)\D+(\d+)/);
  const width = Number(match?.[1]) || 1920;
  const height = Number(match?.[2]) || 1080;
  host.style.width = width + 'px';
  host.style.height = height + 'px';
  document.documentElement.style.width = width + 'px';
  document.documentElement.style.height = height + 'px';
  document.body.style.width = width + 'px';
  document.body.style.height = height + 'px';

  const renderer = new PlayerSceneRenderer(stage, { autoplay: false });
  await renderer.render(context, ALL_PLAYER_COMPONENTS.filter((name) => name !== 'scene_video'));
  renderer.sceneMotionRuntime.pause();
  await renderer.sceneMotionRuntime.driver?.kernelPromise?.catch(() => null);
  await waitForAssets(stage);
  await nextPaint();

  window.__miraServerRender = {
    ready: true,
    width,
    height,
    async seek(milliseconds) {
      renderer.sceneMotionRuntime.seek(milliseconds);
      const videos = [...stage.querySelectorAll('video[data-scene-source]')];
      await Promise.all(videos.map((video) => seekVideo(video, milliseconds)));
      await nextPaint();
      return true;
    }
  };
}

window.__miraServerRender = { ready: false };
boot().catch((error) => {
  console.error('MIRA-TV server scene render failed', error);
  window.__miraServerRender = { ready: false, error: String(error?.message || error) };
});
