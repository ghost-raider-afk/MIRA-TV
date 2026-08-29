import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { ValidationError } from '../shared/errors.js';
import { validateImage } from './image-validation.js';

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
  const filename = `background-${crypto.randomUUID()}.${extension}`;
  const directory = path.join(config.siteAssetsRoot, 'screens');
  const target = path.join(directory, filename);
  const temporary = path.join(directory, `.${filename}.tmp`);
  await mkdir(directory, { recursive: true, mode: 0o770 });
  await writeFile(temporary, bytes, { mode: 0o640 });
  await rename(temporary, target);
  return Object.freeze({ publicUrl: `${SCREEN_BACKGROUND_PREFIX}${filename}`, localPath: target });
}

export async function deleteScreenBackground(url, { store, config, force = false } = {}) {
  const localPath = localPathForUrl(url, config);
  if (!localPath) return;
  if (!force && await store.isScreenBackgroundReferenced(url)) return;
  await unlink(localPath).catch(() => undefined);
}
