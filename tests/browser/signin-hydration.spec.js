import { test, expect } from '@playwright/test';

test('sign-in stays locked until its submit handler is hydrated', async ({ page }) => {
  let releaseApp;
  const appGate = new Promise((resolve) => { releaseApp = resolve; });

  await page.route('**/app.js', async (route) => {
    await appGate;
    await route.continue();
  }, { times: 1 });

  await page.goto('/signin', { waitUntil: 'commit' });
  const form = page.locator('#signin-form');
  const submit = page.locator('#signin-submit');

  try {
    await expect(submit).toBeDisabled();
    await expect(form).not.toHaveAttribute('data-hydrated', 'true');
  } finally {
    releaseApp();
  }

  await expect(form).toHaveAttribute('data-hydrated', 'true');
  await expect(submit).toBeEnabled();
});
