import path from 'node:path';
import { stat } from 'node:fs/promises';
import { contentAssetPathForUrl, contentHashFromUrl } from './content-addressed-assets.js';

const LEGACY_PREFIXES = Object.freeze([
  '/site-assets/scene/',
  '/site-assets/screens/'
]);

function localAssetUrl(value) {
  const url = String(value || '').trim();
  if (!url.startsWith('/site-assets/') || url.includes('..') || url.includes('\\')) return '';
  return url;
}

function extensionOf(url) {
  return path.extname(String(url || '')).slice(1).toLowerCase();
}

function mimeFor(url) {
  switch (extensionOf(url)) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    default: return 'application/octet-stream';
  }
}

function legacyPathForUrl(url, config) {
  const matched = LEGACY_PREFIXES.find((prefix) => url.startsWith(prefix));
  if (!matched) return null;
  const relative = url.slice('/site-assets/'.length);
  if (!relative || relative.includes('..')) return null;
  const root = path.resolve(config.siteAssetsRoot);
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

function localPathForUrl(url, config) {
  return contentAssetPathForUrl(url, config) || legacyPathForUrl(url, config);
}

function collectAssetReferences(draft, scene) {
  const assets = new Map();
  const add = (value, role) => {
    const url = localAssetUrl(value);
    if (!url) return;
    const entry = assets.get(url) || { url, roles:new Set() };
    entry.roles.add(role);
    assets.set(url, entry);
  };

  add(draft?.settings?.background_image_url, 'background');
  for (const element of Array.isArray(scene?.elements) ? scene.elements : []) {
    if (element?.enabled === false || !['image', 'logo', 'video'].includes(element?.type)) continue;
    add(element?.media?.source_url, element.type);
  }
  return [...assets.values()];
}

async function describeAsset(entry, config) {
  const file = localPathForUrl(entry.url, config);
  let sizeBytes = null;
  if (file) {
    try {
      const info = await stat(file);
      if (info.isFile()) sizeBytes = Number(info.size);
    } catch {}
  }
  return Object.freeze({
    url: entry.url,
    content_hash: contentHashFromUrl(entry.url) || null,
    size_bytes: Number.isSafeInteger(sizeBytes) && sizeBytes >= 0 ? sizeBytes : null,
    media_type: mimeFor(entry.url),
    roles: Object.freeze([...entry.roles].sort()),
    required: true
  });
}

export async function buildPlayerContentManifest({ draft, scene, renderRevision, config }) {
  const references = collectAssetReferences(draft, scene);
  const assets = await Promise.all(references.map((entry) => describeAsset(entry, config)));
  assets.sort((a, b) => a.url.localeCompare(b.url));
  return Object.freeze({
    version: 1,
    revision: String(renderRevision || 1),
    assets: Object.freeze(assets)
  });
}
