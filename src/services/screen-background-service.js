import path from 'node:path';
import { unlink } from 'node:fs/promises';
import { ValidationError } from '../shared/errors.js';
import { validateImage } from './image-validation.js';
import { deleteContentAsset, isContentAssetUrl, writeContentAsset } from './content-addressed-assets.js';

const SCREEN_BACKGROUND_PREFIX = '/site-assets/screens/';
const SAFE_BACKGROUND = /^background-[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;

function localPathForUrl(url, config) {
  if (typeof url !== 'string' || !url.startsWith(SCREEN_BACKGROUND_PREFIX)) return null;
  const filename = url.slice(SCREEN_BACKGROUND_PREFIX.length);
  if (!SAFE_BACKGROUND.test(filename)) return null;
  return path.join(config.siteAssetsRoot, 'screens', filename);
}

export async function createScreenBackground(bytes, config) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > config.screenBackgroundMaxBytes) {
    throw new ValidationError('Размер фонового изображения монитора недопустим.');
  }
  const info = await validateImage(bytes, {
    allowedTypes: ['png', 'jpeg', 'webp'],
    maxWidth: config.screenMaxWidth,
    maxHeight: config.screenMaxHeight,
    maxPixels: config.imageMaxPixels,
    label: 'Фон монитора'
  });
  const extension = info.type === 'jpeg' ? 'jpg' : info.type;
  const descriptor = await writeContentAsset(bytes, { extension, config });
  return Object.freeze({
    publicUrl: descriptor.publicUrl,
    localPath: descriptor.target,
    contentHash: descriptor.hash
  });
}
export async function deleteScreenBackground(url, { store, config, force = false } = {}) {
  if (isContentAssetUrl(url)) return deleteContentAsset(url, { store, config, force });
  const localPath = localPathForUrl(url, config);
  if (!localPath) return false;
  if (!force && await store.isScreenBackgroundReferenced(url)) return false;
  await unlink(localPath).catch(() => undefined);
  return true;
}
