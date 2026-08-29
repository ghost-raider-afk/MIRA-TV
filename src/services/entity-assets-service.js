import crypto from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { PayloadTooLargeError, ValidationError } from '../shared/errors.js';
import { sceneEntityInput } from '../contracts/scene-entity.js';
import { validateImage } from './image-validation.js';

const execFileAsync = promisify(execFile);
const ENTITY_DIR = 'entities';
const SAFE_ENTITY_ASSET = /^\/site-assets\/entities\/entity-[0-9a-f-]{36}\.(?:png|webp|mp4|webm)$/i;
const MEDIA = Object.freeze({
  'image/png': { kind: 'image', extension: 'png' },
  'image/webp': { kind: 'image', extension: 'webp' },
  'video/mp4': { kind: 'video', extension: 'mp4' },
  'video/webm': { kind: 'video', extension: 'webm' }
});

function assetFileFromUrl(url) {
  if (typeof url !== 'string' || !SAFE_ENTITY_ASSET.test(url)) return '';
  return path.basename(url);
}

function normalizedContentType(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function entityLimitText(config) {
  const megabytes = config.entityAssetMaxBytes / (1024 * 1024);
  return Number.isInteger(megabytes) ? `${megabytes} МБ` : `${megabytes.toFixed(1)} МБ`;
}

function entityTooLarge(config) {
  return new PayloadTooLargeError(`Медиафайл Entity превышает допустимый размер ${entityLimitText(config)}.`);
}

function assertEntitySize(size, config) {
  if (!Number.isSafeInteger(size) || size < 1) throw new ValidationError('Медиафайл Entity пустой или имеет некорректный размер.');
  if (size > config.entityAssetMaxBytes) throw entityTooLarge(config);
}

function declaredContentLength(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function resolveMedia(contentType) {
  const mime = normalizedContentType(contentType);
  const media = MEDIA[mime];
  if (!media) throw new ValidationError('Entity поддерживает PNG, WebP, MP4 и WebM.');
  return { mime, media };
}

function entityPaths(config, media) {
  const filename = `entity-${crypto.randomUUID()}.${media.extension}`;
  const directory = path.join(config.siteAssetsRoot, ENTITY_DIR);
  return {
    filename,
    directory,
    target: path.join(directory, filename),
    temporary: path.join(directory, `.${filename}.upload`)
  };
}

function videoHasAlpha(stream = {}) {
  const pixelFormat = String(stream.pix_fmt || '').toLowerCase();
  if (/^(?:yuva|gbrap|rgba|bgra|argb|abgr)/.test(pixelFormat)) return true;
  const tags = stream.tags && typeof stream.tags === 'object' ? stream.tags : {};
  return Object.entries(tags).some(([key, value]) => /alpha/i.test(key) && /^(?:1|true|yes)$/i.test(String(value)));
}

function videoContainerMatches(mime, formatName) {
  const formats = String(formatName || '').toLowerCase().split(',').map((value) => value.trim()).filter(Boolean);
  if (mime === 'video/webm') return formats.includes('webm');
  if (mime === 'video/mp4') return formats.includes('mp4') || formats.includes('mov');
  return false;
}

async function inspectVideo(file, config, mime) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,pix_fmt,codec_name:stream_tags:format=format_name',
      '-of', 'json', file
    ], { timeout: 12000, maxBuffer: 1024 * 1024 }));
  } catch {
    throw new ValidationError('Видео Entity не удалось прочитать через ffprobe. Проверьте MP4/WebM файл.');
  }
  let probe;
  try { probe = JSON.parse(stdout); } catch {}
  const stream = probe?.streams?.[0];
  const width = Number(stream?.width);
  const height = Number(stream?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new ValidationError('Видео Entity не содержит корректного видеопотока.');
  if (!videoContainerMatches(mime, probe?.format?.format_name)) throw new ValidationError('MIME-тип Entity не соответствует контейнеру видеофайла.');
  if (width > config.screenMaxWidth || height > config.screenMaxHeight || width * height > config.imageMaxPixels) {
    throw new ValidationError(`Видео Entity превышает допустимое разрешение ${config.screenMaxWidth}×${config.screenMaxHeight}.`);
  }
  return { width, height, hasAlpha: videoHasAlpha(stream), codec: String(stream.codec_name || '') };
}

async function inspectEntityFile(temporary, media, mime, config) {
  if (media.kind === 'video') return inspectVideo(temporary, config, mime);
  const bytes = await readFile(temporary);
  const image = await validateImage(bytes, {
    allowedTypes: ['png', 'webp'], maxWidth: config.screenMaxWidth, maxHeight: config.screenMaxHeight,
    maxPixels: config.imageMaxPixels, label: 'Entity'
  });
  if (`image/${image.type}` !== mime) throw new ValidationError('MIME-тип Entity не соответствует содержимому файла.');
  return { width: image.width, height: image.height, hasAlpha: image.type === 'png' || image.type === 'webp' };
}

async function persistEntityAsset({ temporary, target, filename, media, mime, config, store, username }) {
  let info;
  try {
    info = await inspectEntityFile(temporary, media, mime, config);
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }

  const current = await store.getAnimationSettings();
  const previousFile = assetFileFromUrl(current?.entity?.asset_url);
  const entity = sceneEntityInput({
    ...(current?.entity || {}),
    asset_url: `/site-assets/${ENTITY_DIR}/${filename}`,
    asset_type: media.kind,
    media_type: mime,
    width: info.width,
    height: info.height,
    has_alpha: info.hasAlpha,
    loop: current?.entity?.loop ?? true,
    muted: current?.entity?.muted ?? true,
    playsinline: current?.entity?.playsinline ?? true,
    playback_rate: current?.entity?.playback_rate ?? 1,
    poster_url: '',
    visible: true
  });

  let updated;
  try { updated = await store.updateAnimationEntity(entity, username); }
  catch (error) {
    await unlink(target).catch(() => undefined);
    throw error;
  }
  if (previousFile && previousFile !== filename) {
    const previousUrl = `/site-assets/${ENTITY_DIR}/${previousFile}`;
    if (!await store.isAnimationEntityAssetReferenced(previousUrl)) {
      await unlink(path.join(path.dirname(target), previousFile)).catch(() => undefined);
    }
  }
  return updated;
}

async function writeChunk(handle, chunk) {
  let offset = 0;
  while (offset < chunk.length) {
    const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
    if (bytesWritten < 1) throw new Error('Не удалось записать медиафайл Entity.');
    offset += bytesWritten;
  }
}

export async function replaceEntityAssetStream({ stream, contentLength, contentType, config, store, username }) {
  const { mime, media } = resolveMedia(contentType);
  const declared = declaredContentLength(contentLength);
  if (declared !== null) assertEntitySize(declared, config);

  const { filename, directory, target, temporary } = entityPaths(config, media);
  await mkdir(directory, { recursive: true, mode: 0o770 });

  let handle;
  let size = 0;
  try {
    handle = await open(temporary, 'wx', 0o640);
    for await (const part of stream) {
      const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
      size += chunk.length;
      if (size > config.entityAssetMaxBytes) throw entityTooLarge(config);
      await writeChunk(handle, chunk);
    }
    await handle.close();
    handle = null;
    assertEntitySize(size, config);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }

  return persistEntityAsset({ temporary, target, filename, media, mime, config, store, username });
}

export async function replaceEntityAsset({ bytes, contentType, config, store, username }) {
  if (!Buffer.isBuffer(bytes)) throw new ValidationError('Медиафайл Entity не передан.');
  assertEntitySize(bytes.length, config);
  const { mime, media } = resolveMedia(contentType);
  const { filename, directory, target, temporary } = entityPaths(config, media);
  await mkdir(directory, { recursive: true, mode: 0o770 });
  await writeFile(temporary, bytes, { mode: 0o640, flag: 'wx' });
  return persistEntityAsset({ temporary, target, filename, media, mime, config, store, username });
}
