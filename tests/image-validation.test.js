import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { inspectImage, validateImage, validateScreenJpeg } from '../src/services/image-validation.js';

async function jpegFor(width, height) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 16, g: 24, b: 40 } }
  }).jpeg({ quality: 80 }).toBuffer();
}

async function pngFor(width, height) {
  return sharp({
    create: { width, height, channels: 4, background: { r: 16, g: 24, b: 40, alpha: 1 } }
  }).png().toBuffer();
}

function pngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 4, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

test('image inspector reads dimensions from real JPEG and PNG files', async () => {
  assert.deepEqual(inspectImage(await jpegFor(1920, 1080)), { type: 'jpeg', width: 1920, height: 1080 });
  assert.deepEqual(inspectImage(await pngFor(640, 360)), { type: 'png', width: 640, height: 360 });
});

test('screen JPEG is fully decoded and must exactly match monitor resolution', async () => {
  const valid = await jpegFor(1920, 1080);
  assert.equal((await validateScreenJpeg(valid, '1920×1080', 40_000_000)).width, 1920);
  await assert.rejects(async () => validateScreenJpeg(await jpegFor(1280, 720), '1920×1080', 40_000_000), /должен иметь разрешение 1920×1080/);
  await assert.rejects(() => validateScreenJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), '1920×1080', 40_000_000), /формат или структура/);
});

test('structurally plausible but truncated image is rejected by full decoder', async () => {
  const valid = await pngFor(320, 180);
  const truncated = valid.subarray(0, Math.max(24, valid.length - 20));
  await assert.rejects(() => validateImage(truncated, {
    allowedTypes: ['png'],
    maxWidth: 1920,
    maxHeight: 1080,
    maxPixels: 40_000_000,
    label: 'Тест'
  }), /декодировать|структура/);
});

test('image limits reject decompression-bomb dimensions before decoding tiny payload', async () => {
  await assert.rejects(() => validateImage(pngHeader(100000, 100000), {
    allowedTypes: ['png'],
    maxWidth: 1920,
    maxHeight: 1080,
    maxPixels: 40_000_000,
    label: 'Тест'
  }), /максимальный размер/);
});
