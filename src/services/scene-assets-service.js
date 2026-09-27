import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, open, readFile, readdir, stat, unlink } from 'node:fs/promises';
import { PayloadTooLargeError, ValidationError } from '../shared/errors.js';
import { validateImage } from './image-validation.js';
import {
  CONTENT_ASSET_DIR,
  cleanupUnreferencedContentAssets,
  commitContentAssetTemporary,
  deleteContentAsset,
  isContentAssetUrl
} from './content-addressed-assets.js';

const SCENE_DIR = 'scene';
const SCENE_ASSET_PREFIX = '/site-assets/scene/';
const SAFE_SCENE_ASSET = /^scene-[0-9a-f-]{36}\.(?:jpg|png|webp|mp4|webm)$/i;
const MEDIA = Object.freeze({
  'image/png': { kind:'image', extension:'png' },
  'image/jpeg': { kind:'image', extension:'jpg' },
  'image/webp': { kind:'image', extension:'webp' }
});

function localPathForUrl(url, config) {
  if (typeof url !== 'string' || !url.startsWith(SCENE_ASSET_PREFIX)) return null;
  const filename = url.slice(SCENE_ASSET_PREFIX.length);
  if (!SAFE_SCENE_ASSET.test(filename)) return null;
  return path.join(config.siteAssetsRoot, SCENE_DIR, filename);
}

function normalizedContentType(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}
function limitText(config) {
  const megabytes = config.sceneAssetMaxBytes / (1024 * 1024);
  return Number.isInteger(megabytes) ? `${megabytes} МБ` : `${megabytes.toFixed(1)} МБ`;
}
function tooLarge(config) {
  return new PayloadTooLargeError(`Медиафайл элемента превышает допустимый размер ${limitText(config)}.`);
}
function assertSize(size, config) {
  if (!Number.isSafeInteger(size) || size < 1) throw new ValidationError('Медиафайл элемента пустой или имеет некорректный размер.');
  if (size > config.sceneAssetMaxBytes) throw tooLarge(config);
}
function declaredLength(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
function resolveMedia(value) {
  const mime = normalizedContentType(value);
  const media = MEDIA[mime];
  if (!media) throw new ValidationError('Элементы сцены поддерживают PNG, JPEG и WebP.');
  return { mime, media };
}
function scenePaths(config) {
  const filename = `.asset-upload-${crypto.randomUUID()}.tmp`;
  const directory = path.join(config.siteAssetsRoot, CONTENT_ASSET_DIR);
  return { directory, temporary:path.join(directory,filename) };
}
async function inspectFile(file, _media, mime, config) {
  const bytes=await readFile(file);
  const image=await validateImage(bytes,{allowedTypes:['png','jpeg','webp'],maxWidth:config.screenMaxWidth,maxHeight:config.screenMaxHeight,maxPixels:config.imageMaxPixels,label:'Изображение элемента'});
  const detected=image.type==='jpeg'?'image/jpeg':`image/${image.type}`;
  if(detected!==mime) throw new ValidationError('MIME-тип изображения не соответствует содержимому файла.');
  return {width:image.width,height:image.height};
}
async function writeChunk(handle, chunk) {
  let offset=0;
  while(offset<chunk.length){
    const {bytesWritten}=await handle.write(chunk,offset,chunk.length-offset);
    if(bytesWritten<1) throw new Error('Не удалось записать медиафайл элемента.');
    offset+=bytesWritten;
  }
}
export async function createSceneAssetStream({stream,contentLength,contentType,config}) {
  const {mime,media}=resolveMedia(contentType), declared=declaredLength(contentLength);
  if(declared!==null) assertSize(declared,config);
  const paths=scenePaths(config);
  await mkdir(paths.directory,{recursive:true,mode:0o770});
  let handle,size=0;
  const hash=crypto.createHash('sha256');
  try {
    handle=await open(paths.temporary,'wx',0o640);
    for await (const part of stream) {
      const chunk=Buffer.isBuffer(part)?part:Buffer.from(part);
      size+=chunk.length;
      if(size>config.sceneAssetMaxBytes) throw tooLarge(config);
      hash.update(chunk);
      await writeChunk(handle,chunk);
    }
    await handle.close(); handle=null; assertSize(size,config);
    const info=await inspectFile(paths.temporary,media,mime,config);
    const descriptor=await commitContentAssetTemporary(paths.temporary,{hash:hash.digest('hex'),extension:media.extension,config});
    return Object.freeze({
      source_url:descriptor.publicUrl,
      content_hash:descriptor.hash,
      kind:media.kind,
      media_type:mime,
      width:info.width,
      height:info.height,
      size
    });
  } catch(error) {
    if(handle) await handle.close().catch(()=>undefined);
    await unlink(paths.temporary).catch(()=>undefined);
    throw error;
  }
}


export async function deleteSceneAsset(url, { store, config, force = false } = {}) {
  if (isContentAssetUrl(url)) return deleteContentAsset(url, { store, config, force });
  const localPath = localPathForUrl(url, config);
  if (!localPath) return false;
  if (!force && await store.isSceneAssetReferenced(url)) return false;
  await unlink(localPath).catch(() => undefined);
  return true;
}

export async function cleanupUnreferencedSceneAssets({
  store,
  config,
  olderThanMs = 24 * 60 * 60 * 1000,
  now = Date.now()
} = {}) {
  let removed = await cleanupUnreferencedContentAssets({ store, config, olderThanMs, now });
  if (typeof store?.listSceneAssetReferences !== 'function') return removed;

  const directory = path.join(config.siteAssetsRoot, SCENE_DIR);
  const referenced = new Set(await store.listSceneAssetReferences());
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {}

  for (const entry of entries) {
    if (!entry.isFile() || !SAFE_SCENE_ASSET.test(entry.name)) continue;
    const publicUrl = SCENE_ASSET_PREFIX + entry.name;
    if (referenced.has(publicUrl)) continue;
    const file = path.join(directory, entry.name);
    try {
      const info = await stat(file);
      if (now - info.mtimeMs < olderThanMs) continue;
      await unlink(file);
      removed += 1;
    } catch {}
  }
  return removed;
}
