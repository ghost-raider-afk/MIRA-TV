import { API } from '../core/config.js';
import { api } from '../core/api.js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);

export function mediaKindForTarget(target) {
  return target === 'video' ? 'video' : 'image';
}

export function mediaAcceptForTarget(target) {
  return mediaKindForTarget(target) === 'video'
    ? '.mp4,.webm,video/mp4,video/webm'
    : '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
}

export function compatibleMediaAssets(assets, target) {
  const kind = mediaKindForTarget(target);
  return (Array.isArray(assets) ? assets : []).filter((asset) => asset?.kind === kind && asset?.id && asset?.url);
}

export function mediaAssetById(assets, id) {
  return (Array.isArray(assets) ? assets : []).find((asset) => asset?.id === id) || null;
}

export async function fetchMediaAssets() {
  const result = await api.get(API.media);
  return Array.isArray(result) ? result : [];
}

export async function uploadMediaAsset(file) {
  if (!(file instanceof File)) throw new TypeError('Не выбран файл для загрузки.');
  const allowed = IMAGE_TYPES.has(file.type) || VIDEO_TYPES.has(file.type);
  if (!allowed) throw new Error('Поддерживаются JPEG, PNG, WebP, MP4 и WebM.');
  return api.post(API.media, file, {
    headers: {
      'Content-Type': file.type,
      'X-Mira-File-Name': encodeURIComponent(file.name || '')
    }
  });
}

export function mediaAssetLabel(asset) {
  if (!asset) return 'Файл не выбран';
  const name = asset.original_name || asset.filename || 'Медиафайл';
  const dimensions = asset.width && asset.height ? `${asset.width}×${asset.height}` : '';
  return dimensions ? `${name} · ${dimensions}` : name;
}
