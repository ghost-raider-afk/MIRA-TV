import crypto from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { PayloadTooLargeError, ValidationError } from '../shared/errors.js';
import { validateImage } from './image-validation.js';

const execFileAsync = promisify(execFile);
const MEDIA_DIR = 'media';
const SAFE_MEDIA_FILE = /^media-[0-9a-f-]{36}\.(?:jpg|png|webp|mp4|webm)$/i;
const MEDIA = Object.freeze({
  'image/jpeg': { kind: 'image', extension: 'jpg', imageType: 'jpeg' },
  'image/png': { kind: 'image', extension: 'png', imageType: 'png' },
  'image/webp': { kind: 'image', extension: 'webp', imageType: 'webp' },
  'video/mp4': { kind: 'video', extension: 'mp4' },
  'video/webm': { kind: 'video', extension: 'webm' }
});

function normalizedContentType(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function resolveMedia(contentType) {
  const mime = normalizedContentType(contentType);
  const media = MEDIA[mime];
  if (!media) throw new ValidationError('Медиатека поддерживает JPEG, PNG, WebP, MP4 и WebM.');
  return { mime, media };
}

function safeOriginalName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch {}
  return decoded.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180);
}

function declaredContentLength(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function limitFor(media, config) {
  return media.kind === 'video' ? config.mediaVideoMaxBytes : config.mediaImageMaxBytes;
}

function limitText(bytes) {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb} МБ` : `${mb.toFixed(1)} МБ`;
}

function assertSize(size, media, config) {
  if (!Number.isSafeInteger(size) || size < 1) throw new ValidationError('Медиафайл пустой или имеет некорректный размер.');
  const limit = limitFor(media, config);
  if (size > limit) throw new PayloadTooLargeError(`Медиафайл превышает допустимый размер ${limitText(limit)}.`);
}

function videoContainerMatches(mime, formatName) {
  const formats = String(formatName || '').toLowerCase().split(',').map((value) => value.trim()).filter(Boolean);
  if (mime === 'video/webm') return formats.includes('webm');
  if (mime === 'video/mp4') return formats.includes('mp4') || formats.includes('mov');
  return false;
}

function videoHasAlpha(stream = {}) {
  const pixelFormat = String(stream.pix_fmt || '').toLowerCase();
  return /^(?:yuva|gbrap|rgba|bgra|argb|abgr)/.test(pixelFormat);
}

async function inspectVideo(file, mime, config) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,pix_fmt,codec_name:format=format_name',
      '-of', 'json', file
    ], { timeout: 15000, maxBuffer: 1024 * 1024 }));
  } catch {
    throw new ValidationError('Видео не удалось прочитать через ffprobe. Проверьте MP4/WebM файл.');
  }
  let probe;
  try { probe = JSON.parse(stdout); } catch {}
  const stream = probe?.streams?.[0];
  const width = Number(stream?.width);
  const height = Number(stream?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new ValidationError('Видео не содержит корректного видеопотока.');
  if (!videoContainerMatches(mime, probe?.format?.format_name)) throw new ValidationError('MIME-тип не соответствует контейнеру видеофайла.');
  if (width > config.mediaMaxWidth || height > config.mediaMaxHeight || width * height > config.mediaMaxPixels) {
    throw new ValidationError(`Видео превышает допустимое разрешение ${config.mediaMaxWidth}×${config.mediaMaxHeight}.`);
  }
  return { width, height, hasAlpha: videoHasAlpha(stream), codec: String(stream.codec_name || '') };
}

async function inspectImage(file, mime, media, config) {
  const bytes = await readFile(file);
  const image = await validateImage(bytes, {
    allowedTypes: ['jpeg', 'png', 'webp'],
    maxWidth: config.mediaMaxWidth,
    maxHeight: config.mediaMaxHeight,
    maxPixels: config.mediaMaxPixels,
    label: 'Изображение медиатеки'
  });
  if (image.type !== media.imageType || `image/${image.type}` !== mime) {
    throw new ValidationError('MIME-тип изображения не соответствует содержимому файла.');
  }
  return { width: image.width, height: image.height, hasAlpha: image.type === 'png' || image.type === 'webp' };
}

async function inspectFile(file, mime, media, config) {
  return media.kind === 'video' ? inspectVideo(file, mime, config) : inspectImage(file, mime, media, config);
}

function mediaPaths(config, media) {
  const filename = `media-${crypto.randomUUID()}.${media.extension}`;
  const directory = path.join(config.siteAssetsRoot, MEDIA_DIR);
  return {
    filename,
    directory,
    target: path.join(directory, filename),
    temporary: path.join(directory, `.${filename}.upload`)
  };
}

async function writeChunk(handle, chunk) {
  let offset = 0;
  while (offset < chunk.length) {
    const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
    if (bytesWritten < 1) throw new Error('Не удалось записать медиафайл.');
    offset += bytesWritten;
  }
}

export async function createMediaAssetFromStream({ stream, contentLength, contentType, originalName, config, store, username }) {
  const { mime, media } = resolveMedia(contentType);
  const declared = declaredContentLength(contentLength);
  if (declared !== null) assertSize(declared, media, config);

  const id = `media-${crypto.randomUUID()}`;
  const { filename, directory, target, temporary } = mediaPaths(config, media);
  await mkdir(directory, { recursive: true, mode: 0o770 });

  let handle;
  let size = 0;
  try {
    handle = await open(temporary, 'wx', 0o640);
    for await (const part of stream) {
      const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
      size += chunk.length;
      assertSize(size, media, config);
      await writeChunk(handle, chunk);
    }
    await handle.close();
    handle = null;
    assertSize(size, media, config);
    const info = await inspectFile(temporary, mime, media, config);
    await rename(temporary, target);
    try {
      return await store.createMediaAsset({
        id,
        originalName: safeOriginalName(originalName),
        kind: media.kind,
        mimeType: mime,
        filename,
        sizeBytes: size,
        width: info.width,
        height: info.height,
        hasAlpha: info.hasAlpha,
        actor: username,
        now: new Date().toISOString()
      });
    } catch (error) {
      await unlink(target).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function removeMediaAssetFile({ asset, config }) {
  if (!asset) return false;
  if (!SAFE_MEDIA_FILE.test(String(asset.filename || ''))) throw new ValidationError('Некорректное имя файла медиатеки.');
  const target = path.join(config.siteAssetsRoot, MEDIA_DIR, asset.filename);
  try {
    await unlink(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}
