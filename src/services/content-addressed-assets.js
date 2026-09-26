import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';

export const CONTENT_ASSET_DIR = 'content';
export const CONTENT_ASSET_PREFIX = '/site-assets/content/';
const SAFE_CONTENT_ASSET = /^asset-([0-9a-f]{64})\.(jpg|png|webp|mp4|webm)$/i;

export function sha256Hex(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function contentAssetDescriptor(hash, extension, config) {
  const normalizedHash = String(hash || '').toLowerCase();
  const normalizedExtension = String(extension || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalizedHash)) throw new TypeError('Content asset hash is invalid.');
  if (!/^(?:jpg|png|webp|mp4|webm)$/.test(normalizedExtension)) throw new TypeError('Content asset extension is invalid.');
  const filename = `asset-${normalizedHash}.${normalizedExtension}`;
  const directory = path.join(config.siteAssetsRoot, CONTENT_ASSET_DIR);
  return Object.freeze({
    hash: normalizedHash,
    filename,
    directory,
    target: path.join(directory, filename),
    publicUrl: `${CONTENT_ASSET_PREFIX}${filename}`
  });
}

export function contentAssetPathForUrl(url, config) {
  if (typeof url !== 'string' || !url.startsWith(CONTENT_ASSET_PREFIX)) return null;
  const filename = url.slice(CONTENT_ASSET_PREFIX.length);
  if (!SAFE_CONTENT_ASSET.test(filename)) return null;
  return path.join(config.siteAssetsRoot, CONTENT_ASSET_DIR, filename);
}

export function contentHashFromUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(CONTENT_ASSET_PREFIX)) return '';
  const match = url.slice(CONTENT_ASSET_PREFIX.length).match(SAFE_CONTENT_ASSET);
  return match?.[1]?.toLowerCase() || '';
}

export async function writeContentAsset(bytes, { extension, config }) {
  const hash = sha256Hex(bytes);
  const descriptor = contentAssetDescriptor(hash, extension, config);
  await mkdir(descriptor.directory, { recursive: true, mode: 0o770 });
  try {
    await stat(descriptor.target);
  } catch {
    const temporary = path.join(descriptor.directory, `.${descriptor.filename}.${crypto.randomUUID()}.tmp`);
    await writeFile(temporary, bytes, { mode: 0o640 });
    try {
      await rename(temporary, descriptor.target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      try { await stat(descriptor.target); }
      catch { throw error; }
    }
  }
  return descriptor;
}

export async function commitContentAssetTemporary(temporary, { hash, extension, config }) {
  const descriptor = contentAssetDescriptor(hash, extension, config);
  await mkdir(descriptor.directory, { recursive: true, mode: 0o770 });
  try {
    await stat(descriptor.target);
    await unlink(temporary).catch(() => undefined);
  } catch {
    try {
      await rename(temporary, descriptor.target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      try { await stat(descriptor.target); }
      catch { throw error; }
    }
  }
  return descriptor;
}

export async function deleteContentAsset(url, { store, config, force = false } = {}) {
  const file = contentAssetPathForUrl(url, config);
  if (!file) return false;
  if (!force && typeof store?.isContentAssetReferenced === 'function' && await store.isContentAssetReferenced(url)) return false;
  await unlink(file).catch(() => undefined);
  return true;
}

export function isContentAssetUrl(url) {
  return typeof url === 'string' && SAFE_CONTENT_ASSET.test(url.startsWith(CONTENT_ASSET_PREFIX) ? url.slice(CONTENT_ASSET_PREFIX.length) : '');
}


export async function cleanupUnreferencedContentAssets({
  store,
  config,
  olderThanMs = 24 * 60 * 60 * 1000,
  now = Date.now()
} = {}) {
  if (typeof store?.listContentAssetReferences !== 'function') return 0;
  const directory = path.join(config.siteAssetsRoot, CONTENT_ASSET_DIR);
  const referenced = new Set(await store.listContentAssetReferences());
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !SAFE_CONTENT_ASSET.test(entry.name)) continue;
    const publicUrl = CONTENT_ASSET_PREFIX + entry.name;
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
