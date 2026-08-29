import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { normaliseScene } from './model.js';

export async function listScenes() {
  const rows = await api.get(API.scenes);
  return Array.isArray(rows) ? rows : [];
}

export async function getScene(sceneId) {
  return normaliseScene(await api.get(`${API.scenes}/${encodeURIComponent(sceneId)}`));
}

export async function createSceneRemote(scene) {
  return normaliseScene(await api.post(API.scenes, scene));
}

export async function updateSceneRemote(scene) {
  return normaliseScene(await api.put(`${API.scenes}/${encodeURIComponent(scene.id)}`, scene));
}

export async function duplicateSceneRemote(sceneId) {
  return normaliseScene(await api.post(`${API.scenes}/${encodeURIComponent(sceneId)}/clone`, {}));
}

export async function deleteSceneRemote(sceneId) {
  return api.delete(`${API.scenes}/${encodeURIComponent(sceneId)}`);
}
