import { test, expect } from '@playwright/test';
import { STATUS_WIDGET_HTML, buildTelegramNotice } from '../../src/bot/telegram-widgets.js';

// This verifies the HTML surface only; Telegram QuickJS profile enforcement
// still requires testing in the official Telegram test environment.
test.describe('Telegram connection widget', () => {
  test.use({ viewport:{ width:340, height:640 } });

  async function openWidget(page, initial) {
    const prelude = '<script>window.TelegramWidget={' +
      'chatData:' + JSON.stringify(initial.chat_data) + ',' +
      'onEvent:function(name,fn){this.callbacks=this.callbacks||{};this.callbacks[name]=fn;},' +
      'ready:function(){window.widgetReady=true;}' +
      '};</script>';
    await page.setContent(STATUS_WIDGET_HTML.replace('<script>', prelude + '<script>'));
  }

  test('renders offline and restored TV events and expands technical details', async ({ page }) => {
    const initial = buildTelegramNotice({ kind:'tv_offline', location:'Точка «Центральная»', subject:'ТВ 2', time:'12.11.2026 18:00', detail:'Сервер перестал получать heartbeat.' });
    await openWidget(page, initial);
    await expect(page.getByRole('heading', { name:'Нет связи с телевизором' })).toBeVisible();
    await expect(page.locator('#location')).toHaveText('Точка «Центральная»');
    await expect(page.locator('#screen')).toHaveText('ТВ 2');
    await expect(page.locator('#detail')).toBeHidden();
    await page.getByRole('button', { name:'Подробнее' }).click();
    await expect(page.locator('#detail')).toContainText('heartbeat');
    const restored = buildTelegramNotice({ kind:'tv_restored', location:'Точка «Центральная»', subject:'ТВ 2' });
    await page.evaluate(data => {
      window.TelegramWidget.chatData = data;
      window.TelegramWidget.callbacks.chatDataChanged();
    }, restored.chat_data);
    await expect(page.getByRole('heading', { name:'Связь восстановлена' })).toBeVisible();
    expect(await page.evaluate(() => window.widgetReady)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(340);
  });

  test('treats location names as text, without executing markup', async ({ page }) => {
    const notice = buildTelegramNotice({ kind:'tv_offline', location:'<img src=x onerror="window.hacked=1">' });
    await openWidget(page, notice);
    await expect(page.locator('#location')).toHaveText('<img src=x onerror="window.hacked=1">');
    expect(await page.evaluate(() => window.hacked)).toBeUndefined();
    await expect(page.locator('#location img')).toHaveCount(0);
  });
});
