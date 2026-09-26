export function bakedSceneComponent(record, currentRenderRevision) {
  const revision = Number(currentRenderRevision) || 1;
  if (!record || !record.active_url || !record.active_hash) {
    return Object.freeze({
      enabled: false,
      status: 'fallback',
      source_url: '',
      content_hash: null,
      source_render_revision: revision,
      live_layers: Object.freeze(['weather'])
    });
  }
  return Object.freeze({
    enabled: true,
    status: 'ready',
    source_url: String(record.active_url),
    content_hash: String(record.active_hash),
    source_render_revision: Number(record.source_render_revision),
    stale: Number(record.source_render_revision) !== revision,
    input_hash: String(record.input_hash || ''),
    width: Number(record.width) || 1920,
    height: Number(record.height) || 1080,
    fps: Number(record.fps) || 25,
    duration_ms: Number(record.duration_ms) || 0,
    loop: true,
    live_scene: record.live_scene && typeof record.live_scene === 'object'
      ? record.live_scene
      : { version:1, elements:[] },
    live_layers: Object.freeze(['weather'])
  });
}

export function bakedSceneRuntimeToken(record, currentRenderRevision) {
  const component = bakedSceneComponent(record, currentRenderRevision);
  return component.status === 'ready'
    ? `ready:${component.content_hash}`
    : `fallback:${Number(currentRenderRevision) || 1}`;
}
