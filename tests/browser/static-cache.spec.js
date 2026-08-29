import { test, expect } from '@playwright/test';

test('admin frontend keeps browser cache between page loads and revalidates assets', async ({ request }) => {
  const page = await request.get('/signin.html');
  expect(page.ok()).toBeTruthy();
  expect(page.headers()['cache-control']).toContain('no-store');
  expect(page.headers()['clear-site-data']).toBeUndefined();

  for (const asset of ['/css/index.css', '/app.js', '/js/editor/renderer.js']) {
    const response = await request.get(asset);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['cache-control']).toContain('no-cache');
    expect(response.headers()['cache-control']).toContain('must-revalidate');
    expect(response.headers()['cache-control']).not.toContain('max-age=3600');
  }
});
