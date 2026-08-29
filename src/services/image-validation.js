import sharp from 'sharp';
import { ValidationError } from '../shared/errors.js';

const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegInfo(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  let dimensions = null;
  let sawEoi = false;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9) {
      sawEoi = true;
      break;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if (JPEG_SOF.has(marker)) {
      if (length < 7) return null;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (!width || !height) return null;
      dimensions = { width, height };
    }
    if (marker === 0xda) {
      const eoi = bytes.lastIndexOf(Buffer.from([0xff, 0xd9]));
      if (eoi < offset + length || eoi !== bytes.length - 2) return null;
      sawEoi = true;
      break;
    }
    offset += length;
  }
  return dimensions && sawEoi ? { type: 'jpeg', ...dimensions } : null;
}

function pngInfo(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!Buffer.isBuffer(bytes) || bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null;
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width && height ? { type: 'png', width, height } : null;
}

function uint24le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function webpInfo(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 30) return null;
  if (bytes.subarray(0, 4).toString('ascii') !== 'RIFF' || bytes.subarray(8, 12).toString('ascii') !== 'WEBP') return null;
  const chunk = bytes.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const width = uint24le(bytes, 24) + 1;
    const height = uint24le(bytes, 27) + 1;
    return width && height ? { type: 'webp', width, height } : null;
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    const data = 20;
    if (bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) return null;
    const width = bytes.readUInt16LE(data + 6) & 0x3fff;
    const height = bytes.readUInt16LE(data + 8) & 0x3fff;
    return width && height ? { type: 'webp', width, height } : null;
  }
  if (chunk === 'VP8L' && bytes.length >= 25) {
    const data = 20;
    if (bytes[data] !== 0x2f) return null;
    const b1 = bytes[data + 1];
    const b2 = bytes[data + 2];
    const b3 = bytes[data + 3];
    const b4 = bytes[data + 4];
    const width = 1 + (((b2 & 0x3f) << 8) | b1);
    const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
    return width && height ? { type: 'webp', width, height } : null;
  }
  return null;
}

export function inspectImage(bytes) {
  return jpegInfo(bytes) || pngInfo(bytes) || webpInfo(bytes);
}

async function decodeImage(bytes, { maxPixels, label }) {
  try {
    const pipeline = sharp(bytes, { failOn: 'error', limitInputPixels: maxPixels, sequentialRead: true });
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height || !metadata.format) throw new Error('missing metadata');
    if (metadata.pages && metadata.pages > 1) throw new ValidationError(`${label}: анимированные и многостраничные изображения не поддерживаются.`);
    await pipeline.clone().resize({ width: 1, height: 1, fit: 'fill' }).toBuffer();
    return {
      type: metadata.format === 'jpg' ? 'jpeg' : metadata.format,
      width: metadata.width,
      height: metadata.height,
      orientation: metadata.orientation || 1
    };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`${label}: файл не удалось полностью декодировать как изображение.`);
  }
}

export async function validateImage(bytes, { allowedTypes, maxWidth, maxHeight, maxPixels, label = 'Изображение' }) {
  const structural = inspectImage(bytes);
  if (!structural || !allowedTypes.includes(structural.type)) {
    throw new ValidationError(`${label}: формат или структура файла не поддерживается.`);
  }
  const structuralPixels = structural.width * structural.height;
  if (structural.width > maxWidth || structural.height > maxHeight || structuralPixels > maxPixels) {
    throw new ValidationError(`${label}: максимальный размер — ${maxWidth}×${maxHeight}, не более ${maxPixels} пикселей.`);
  }

  const decoded = await decodeImage(bytes, { maxPixels, label });
  if (!allowedTypes.includes(decoded.type) || decoded.width !== structural.width || decoded.height !== structural.height) {
    throw new ValidationError(`${label}: структура файла не совпадает с декодированным изображением.`);
  }
  return decoded;
}

export function parseResolution(value) {
  const match = String(value || '').match(/^(\d{3,5})[×x](\d{3,5})$/);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

export async function validateScreenJpeg(bytes, resolution, maxPixels) {
  const expected = parseResolution(resolution);
  if (!expected) throw new ValidationError('У монитора указано некорректное разрешение.');
  if (!Number.isSafeInteger(maxPixels) || maxPixels < 1) throw new Error('IMAGE_MAX_PIXELS должен быть передан в проверку JPEG.');
  const info = await validateImage(bytes, {
    allowedTypes: ['jpeg'],
    maxWidth: expected.width,
    maxHeight: expected.height,
    maxPixels: Math.min(maxPixels, expected.width * expected.height),
    label: 'JPEG монитора'
  });
  if (info.width !== expected.width || info.height !== expected.height) {
    throw new ValidationError(`JPEG монитора должен иметь разрешение ${expected.width}×${expected.height}.`);
  }
  if (info.orientation !== 1) throw new ValidationError('JPEG монитора не должен содержать EXIF-поворот.');
  return info;
}
