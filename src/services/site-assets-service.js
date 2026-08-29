import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { ValidationError } from '../shared/errors.js';
import { validateImage } from './image-validation.js';

export function siteSettingsResponse(settings, config) {
  const version = encodeURIComponent(settings.updated_at || '0');
  return {
    ...settings,
    app_name: settings.application_name || config.appName,
    domain: config.sftp.publicHost,
    session_ttl_hours: config.sessionTtlHours,
    sftp_port: config.sftp.port,
    screen_background_max_bytes: config.screenBackgroundMaxBytes,
    logo_url: settings.logo_filename ? `/site-assets/${settings.logo_filename}?v=${version}` : '',
    favicon_url: settings.favicon_filename ? `/site-assets/${settings.favicon_filename}?v=${version}` : ''
  };
}

function inspectIco(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22) return null;
  if (!bytes.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00]))) return null;
  const count = bytes.readUInt16LE(4);
  if (count < 1 || bytes.length < 6 + count * 16) return null;
  let maxWidth = 0;
  let maxHeight = 0;
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    const width = bytes[offset] || 256;
    const height = bytes[offset + 1] || 256;
    const size = bytes.readUInt32LE(offset + 8);
    const imageOffset = bytes.readUInt32LE(offset + 12);
    if (!size || imageOffset + size > bytes.length) return null;
    maxWidth = Math.max(maxWidth, width);
    maxHeight = Math.max(maxHeight, height);
  }
  return { type: 'ico', width: maxWidth, height: maxHeight };
}

async function validateSiteImage(kind, bytes, config) {
  if (kind === 'favicon') {
    const ico = inspectIco(bytes);
    if (ico) {
      if (ico.width > 256 || ico.height > 256) throw new ValidationError('Favicon ICO не должен превышать 256×256.');
      return ico;
    }
    return validateImage(bytes, {
      allowedTypes: ['png'],
      maxWidth: 512,
      maxHeight: 512,
      maxPixels: Math.min(config.imageMaxPixels, 512 * 512),
      label: 'Favicon'
    });
  }
  return validateImage(bytes, {
    allowedTypes: ['png', 'jpeg', 'webp'],
    maxWidth: config.screenMaxWidth,
    maxHeight: config.screenMaxHeight,
    maxPixels: config.imageMaxPixels,
    label: 'Логотип'
  });
}

function safeAssetFilename(filename) {
  return typeof filename === 'string' && (
    /^site-(?:logo|favicon)-[0-9a-f-]{36}\.(?:jpg|png|webp|ico)$/i.test(filename) ||
    /^site-(?:logo|favicon)\.(?:jpg|png|webp|ico)$/i.test(filename)
  );
}

export async function replaceSiteImage({ kind, bytes, config, store, username }) {
  const maxBytes = kind === 'logo' ? config.siteLogoMaxBytes : config.siteFaviconMaxBytes;
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxBytes) {
    throw new ValidationError(`Размер ${kind === 'logo' ? 'логотипа' : 'favicon'} недопустим.`);
  }
  const info = await validateSiteImage(kind, bytes, config);
  const extension = info.type === 'jpeg' ? 'jpg' : info.type;
  const filename = `site-${kind}-${crypto.randomUUID()}.${extension}`;
  const target = path.join(config.siteAssetsRoot, filename);
  const temporary = path.join(config.siteAssetsRoot, `.${filename}.tmp`);

  await mkdir(config.siteAssetsRoot, { recursive: true, mode: 0o770 });
  await writeFile(temporary, bytes, { mode: 0o640 });
  await rename(temporary, target);

  const previous = await store.getSiteSettings();
  let updated;
  try {
    updated = await store.setSiteAsset(kind, filename, username);
  } catch (error) {
    await unlink(target).catch(() => undefined);
    throw error;
  }

  const previousFilename = kind === 'logo' ? previous.logo_filename : previous.favicon_filename;
  if (previousFilename && previousFilename !== filename && safeAssetFilename(previousFilename)) {
    await unlink(path.join(config.siteAssetsRoot, previousFilename)).catch(() => undefined);
  }
  return updated;
}
