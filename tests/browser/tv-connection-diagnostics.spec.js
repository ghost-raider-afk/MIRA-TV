import { test, expect } from '@playwright/test';

test.describe('TV connection history in admin interface', () => {
  test.use({ viewport:{ width:390, height:844 } });

  test('on-demand history is responsive, paged and safe for untrusted log metadata', async ({ page }) => {
    let calls = 0;
    await page.goto('/signin');
    await page.addStyleTag({ url:'/css/pages/screens.css' });
    await page.route('**/api/device-admin/bindings/17/diagnostics?*', async route => {
      const query = new URL(route.request().url()).searchParams;
      calls += 1;
      const append = query.has('cursor');
      await route.fulfill({
        status:200, contentType:'application/json',
        body:JSON.stringify({
          screen_id:17, device_id:23, online:!append,
          outages:2, last_seen_at:'2026-11-12T10:30:00.000Z',
          ping_measured:query.get('measure_ping') === '1',
          ping_ms:48,
          events:[{
            device_id:23,
            boot_id:append ? 'player-test' : 'server-test',
            seq:append ? 12 : 11,
            event_type:append ? 'sync.failed' : 'connection.offline',
            level:'warn',
            server_received_at:'2026-11-12T10:00:00.000Z',
            device_timestamp:'2026-11-12T10:00:00.000Z',
            metadata:append ? { message:'<img src=x onerror="window.injected=true">' } : {cause:'heartbeat_timeout'}
          }],
          next_cursor:append ? null : 'eyJjdXJzb3IiOiIxIn0'
        })
      });
    });
    await page.evaluate(async () => {
      const { openTvConnectionDiagnostics } = await import('/js/pages/tv-connection-diagnostics.js');
      openTvConnectionDiagnostics({ id:17, name:'Экран', location_number:2, location_name:'Точка Центр' });
    });
    const modal = page.locator('dialog.tv-connection-dialog');
    await expect(modal).toBeVisible();
    await expect(modal.locator('[data-connection-online]')).toHaveText('Онлайн');
    await expect(modal.locator('[data-connection-ping]')).toHaveText('48 мс');
    await expect(modal.getByText('WebSocket отключён')).toBeVisible();
    await modal.locator('[data-connection-events] details').first().locator('summary').click();
    await expect(modal.getByText(/heartbeat/)).toBeVisible();
    await modal.getByRole('button', { name:'Загрузить ещё' }).click();
    await expect(modal.getByText('Ошибка синхронизации')).toBeVisible();
    await modal.locator('[data-connection-events] details').last().locator('summary').click();
    await expect(modal.getByText('<img src=x onerror="window.injected=true">')).toBeVisible();
    expect(await page.evaluate(() => window.injected)).toBeUndefined();
    await expect(modal.locator('[data-connection-events] img')).toHaveCount(0);
    await modal.locator('[data-connection-level]').selectOption('error');
    await expect(modal.getByText('Нет событий выбранного уровня.')).toBeVisible();
    expect(calls).toBe(2);
    const sizes = await modal.evaluate(node => ({
      width:node.getBoundingClientRect().width,
      window:innerWidth,
      content:node.scrollWidth
    }));
    expect(sizes.width).toBeLessThanOrEqual(sizes.window);
    expect(sizes.content).toBeLessThanOrEqual(sizes.width + 1);
    await modal.getByRole('button', { name:'Закрыть' }).click();
    await expect(modal).not.toBeVisible();
  });

  test('history can refresh without background polling', async ({ page }) => {
    await page.goto('/signin');
    let requests = 0;
    await page.route('**/api/device-admin/bindings/5/diagnostics?*', async route => {
      requests += 1;
      await route.fulfill({ contentType:'application/json', body:JSON.stringify({
        online:false, outages:0, events:[], next_cursor:null, ping_measured:false
      }) });
    });
    await page.evaluate(async () => {
      (await import('/js/pages/tv-connection-diagnostics.js')).openTvConnectionDiagnostics({ id:5 });
    });
    const modal = page.locator('dialog.tv-connection-dialog');
    await expect(modal.getByText('Активного WebSocket нет', { exact:false })).toBeVisible();
    expect(requests).toBe(1);
    await modal.locator('[data-connection-hours]').selectOption('168');
    await expect.poll(() => requests).toBe(2);
    await modal.getByRole('button', { name:'Закрыть' }).click();
  });
});
