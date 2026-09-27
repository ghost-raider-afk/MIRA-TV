import express from 'express';
import { createSceneAssetStream, deleteSceneAsset } from '../../services/scene-assets-service.js';
import {
  buildRenderAgentPackage,
  verifyRenderUploadToken
} from '../../services/render-agent-package-service.js';

function bearerToken(request) {
  const header = String(request.get('authorization') || '');
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return String(match?.[1] || request.get('x-mira-render-token') || '').trim();
}

function closeEnough(value, expected, tolerance) {
  return Number.isFinite(value) && Math.abs(value - expected) <= tolerance;
}

export function createRenderAgentPublicRouter({ store, config, realtime }) {
  const router = express.Router();

  router.get('/context', async (request, response) => {
    const token = verifyRenderUploadToken(String(request.query?.token || ''), config);
    if (!token) return response.status(401).json({ error:'Render Agent token недействителен или истёк.' });
    const currentPackage = await buildRenderAgentPackage(store, token.screen_id, config);
    if (!currentPackage) return response.status(404).json({ error:'Монитор для рендера недоступен.' });
    if (currentPackage.render_revision !== token.render_revision || currentPackage.input_hash !== token.input_hash) {
      return response.status(409).json({ error:'Сцена изменилась. Получите новый render package.' });
    }
    if (currentPackage.bake_supported !== true) {
      return response.status(409).json({ error:'Эта сцена пока требует live renderer.', reason:currentPackage.unsupported_reason });
    }
    response.setHeader('Cache-Control','private, no-store');
    return response.json(currentPackage);
  });

  router.put('/screens/:id/video', async (request, response) => {
    const token = verifyRenderUploadToken(bearerToken(request), config);
    const screenId = Number(request.params.id);
    if (!token || !Number.isSafeInteger(screenId) || screenId < 1 || token.screen_id !== screenId) {
      return response.status(401).json({ error: 'Render Agent token недействителен или истёк.' });
    }

    const currentPackage = await buildRenderAgentPackage(store, screenId, config);
    if (!currentPackage) return response.status(404).json({ error: 'Монитор для рендера недоступен.' });
    if (currentPackage.render_revision !== token.render_revision || currentPackage.input_hash !== token.input_hash) {
      return response.status(409).json({
        error: 'Сцена изменилась во время рендера. Устаревший ролик не будет опубликован.',
        current_render_revision: currentPackage.render_revision,
        current_input_hash: currentPackage.input_hash
      });
    }

    if (currentPackage.bake_supported !== true) {
      return response.status(409).json({ error:'Эта сцена пока требует live renderer.', reason:currentPackage.unsupported_reason });
    }

    let asset;
    try {
      asset = await createSceneAssetStream({
        stream: request,
        contentLength: request.get('content-length'),
        contentType: request.get('content-type'),
        config
      });

      if (asset.media_type !== 'video/mp4' || asset.kind !== 'video') {
        throw Object.assign(new Error('Render Agent должен загружать H.264 MP4.'), { status: 400 });
      }
      if (asset.width !== currentPackage.screen.width || asset.height !== currentPackage.screen.height) {
        throw Object.assign(new Error(
          `Разрешение MP4 ${asset.width}×${asset.height} не совпадает с экраном ${currentPackage.screen.width}×${currentPackage.screen.height}.`
        ), { status: 400 });
      }
      if (!closeEnough(Number(asset.fps), Number(currentPackage.target.fps), 0.15)) {
        throw Object.assign(new Error(`MP4 должен иметь частоту ${currentPackage.target.fps} FPS.`), { status: 400 });
      }
      if (!closeEnough(Number(asset.duration_ms), Number(currentPackage.target.loop_duration_ms), 160)) {
        throw Object.assign(new Error(
          `Длительность MP4 должна быть около ${currentPackage.target.loop_duration_ms} мс.`
        ), { status: 400 });
      }

      const record = await store.activateBakedScene({
        screenId,
        sourceRenderRevision: currentPackage.render_revision,
        inputHash: currentPackage.input_hash,
        activeUrl: asset.source_url,
        activeHash: asset.content_hash,
        width: asset.width,
        height: asset.height,
        fps: asset.fps,
        durationMs: asset.duration_ms,
        agentVersion: request.get('x-mira-render-agent-version') || '',
        liveScene: {
          version:1,
          elements:Array.isArray(currentPackage.live_overlays?.weather)
            ? currentPackage.live_overlays.weather
            : []
        },
        updatedBy: 'render-agent'
      });

      realtime?.notifyScreen?.(screenId, currentPackage.render_revision);
      response.status(201).json({
        accepted: true,
        screen_id: screenId,
        render_revision: record.source_render_revision,
        input_hash: record.input_hash,
        scene_video: {
          source_url: record.active_url,
          content_hash: record.active_hash,
          width: record.width,
          height: record.height,
          fps: record.fps,
          duration_ms: record.duration_ms
        }
      });
    } catch (error) {
      if (asset?.source_url) await deleteSceneAsset(asset.source_url, { store, config }).catch(() => undefined);
      throw error;
    }
  });

  return router;
}
