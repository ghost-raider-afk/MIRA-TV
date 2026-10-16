import { expect, test } from '@playwright/test';
import sharp from 'sharp';

async function solidPng() {
  return sharp({
    create: {
      width: 16,
      height: 16,
      channels: 4,
      background: { r: 220, g: 35, b: 35, alpha: 1 }
    }
  }).png().toBuffer();
}

async function installPreviewStage(page, backgroundUrl) {
  await page.evaluate((url) => {
    document.body.replaceChildren();
    const stage = document.createElement('div');
    stage.dataset.sceneViewportWidth = '100';
    stage.dataset.sceneViewportHeight = '100';
    stage.style.position = 'relative';
    stage.style.width = '100px';
    stage.style.height = '100px';

    const layer = document.createElement('div');
    layer.style.position = 'absolute';
    layer.style.inset = '0';
    layer.style.backgroundImage = `url("${url}")`;
    layer.style.backgroundSize = 'cover';
    stage.append(layer);
    document.body.append(stage);
  }, backgroundUrl);
}

test('TV snapshot inlines nested stage backgrounds before publishing', async ({ page }) => {
  const png = await solidPng();
  let previewBody = null;
  await page.route('**/preview-red.png', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: png
  }));
  await page.route('**/api/device/preview', async (route) => {
    previewBody = route.request().postDataBuffer();
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ accepted:true })
    });
  });

  await page.goto('/signin');
  await installPreviewStage(page, '/preview-red.png');
  const published = await page.evaluate(async () => {
    const { publishPlayerPreview } = await import('/js/player/player-preview-capture.js');
    return publishPlayerPreview(document.body.firstElementChild, { maxBytes:262144 });
  });

  expect(published).toBe(true);
  expect(previewBody).toBeInstanceOf(Buffer);
  const image = sharp(previewBody);
  const metadata = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject:true });
  const x = Math.floor((metadata.width || info.width) / 2);
  const y = Math.floor((metadata.height || info.height) / 2);
  const offset = (y * info.width + x) * info.channels;
  expect(data[offset]).toBeGreaterThan(150);
  expect(data[offset]).toBeGreaterThan(data[offset + 1] * 2);
  expect(data[offset]).toBeGreaterThan(data[offset + 2] * 2);
});

test('TV snapshot keeps the previous LKG frame when a required visual asset cannot be embedded', async ({ page }) => {
  let previewPosts = 0;
  await page.route('**/preview-missing.png', (route) => route.fulfill({ status:404, body:'missing' }));
  await page.route('**/api/device/preview', (route) => {
    previewPosts += 1;
    return route.fulfill({ status:202, contentType:'application/json', body:'{}' });
  });

  await page.goto('/signin');
  await installPreviewStage(page, '/preview-missing.png');
  const published = await page.evaluate(async () => {
    const { publishPlayerPreview } = await import('/js/player/player-preview-capture.js');
    return publishPlayerPreview(document.body.firstElementChild, { maxBytes:262144 });
  });

  expect(published).toBe(false);
  expect(previewPosts).toBe(0);
});
