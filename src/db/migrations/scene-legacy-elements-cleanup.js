import { LEGACY_SCENE_ELEMENT_IDS } from './scene-element-ownership.js';

const LEGACY_IDS = new Set(Object.values(LEGACY_SCENE_ELEMENT_IDS));

function parseScene(value) {
  try {
    const scene = JSON.parse(value || '{}');
    return scene && typeof scene === 'object' && !Array.isArray(scene)
      ? scene
      : { version: 1, elements: [] };
  } catch {
    return { version: 1, elements: [] };
  }
}

export async function removeLegacySceneElements(pool) {
  const { rows } = await pool.query('SELECT screen_id, scene_json FROM screen_drafts ORDER BY screen_id');
  for (const row of rows) {
    const scene = parseScene(row.scene_json);
    const elements = Array.isArray(scene.elements) ? scene.elements : [];
    const nextElements = elements.filter((element) => !LEGACY_IDS.has(String(element?.id || '')));
    if (nextElements.length === elements.length) continue;
    const nextScene = { ...scene, version: 1, elements: nextElements };
    await pool.query(
      'UPDATE screen_drafts SET scene_json = $1 WHERE screen_id = $2',
      [JSON.stringify(nextScene), row.screen_id]
    );
  }
}
