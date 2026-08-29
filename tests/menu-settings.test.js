import assert from 'node:assert/strict';
import test from 'node:test';
import { menuSettingsInput } from '../src/contracts/menu-settings.js';

test('monitor settings contract stores only canonical renderer fields', () => {
  const settings = menuSettingsInput({
    background_color: '#101828',
    background_image_url: '/site-assets/screens/background-123e4567-e89b-12d3-a456-426614174000.png',
    accent_color: '#f4c915', text_color: '#f8fafc', font_scale_percent: 92, font_family: 'tahoma-bold',
    table_x: 40, table_y: 20, table_width_px: 1200, table_height_px: 700,
    font_scale: 'large', table_width: 'wide', title: 'legacy'
  });
  assert.deepEqual(settings, {
    background_color: '#101828',
    background_image_url: '/site-assets/screens/background-123e4567-e89b-12d3-a456-426614174000.png',
    accent_color: '#F4C915', text_color: '#F8FAFC', font_scale_percent: 92, font_family: 'tahoma-bold',
    table_x: 40, table_y: 20, table_width_px: 1200, table_height_px: 700
  });
  assert.equal(Object.hasOwn(settings, 'font_scale'), false);
  assert.equal(Object.hasOwn(settings, 'table_width'), false);
  assert.equal(Object.hasOwn(settings, 'title'), false);
});

test('menu font scale has one validated range', () => {
  assert.equal(menuSettingsInput({ font_scale_percent: '55' }).font_scale_percent, 55);
  assert.equal(menuSettingsInput({ font_scale_percent: 130 }).font_scale_percent, 130);
  assert.throws(() => menuSettingsInput({ font_scale_percent: 54 }), /55 до 130/);
  assert.throws(() => menuSettingsInput({ font_scale_percent: 131 }), /55 до 130/);
  assert.throws(() => menuSettingsInput({ font_scale_percent: '90.5' }), /55 до 130/);
});

test('table font is allowlisted and defaults to Arial Narrow', () => {
  assert.equal(menuSettingsInput({}).font_family, 'arial-narrow');
  assert.equal(menuSettingsInput({ font_family: 'tahoma-bold' }).font_family, 'tahoma-bold');
  assert.throws(() => menuSettingsInput({ font_family: 'external-font' }), /Шрифт таблицы/);
});

test('table geometry is bounded by monitor dimensions', () => {
  const settings = menuSettingsInput({ table_x: 100, table_y: 50, table_width_px: 1400, table_height_px: 800 }, { maxWidth: 1600, maxHeight: 900 });
  assert.equal(settings.table_x, 100);
  assert.equal(settings.table_width_px, 1400);
  assert.throws(() => menuSettingsInput({ table_x: 500, table_width_px: 1200 }, { maxWidth: 1600, maxHeight: 900 }), /правую границу/);
  assert.throws(() => menuSettingsInput({ table_y: 200, table_height_px: 800 }, { maxWidth: 1600, maxHeight: 900 }), /нижнюю границу/);
});

test('client cannot inject arbitrary or legacy background asset URL', () => {
  assert.throws(() => menuSettingsInput({ background_image_url: 'https://example.test/background.png' }), /недопустимый адрес/);
  assert.throws(() => menuSettingsInput({ background_image_url: '/site-assets/templates/background-123e4567-e89b-12d3-a456-426614174000.webp' }), /недопустимый адрес/);
  assert.equal(menuSettingsInput({ background_image_url: '/site-assets/screens/background-123e4567-e89b-12d3-a456-426614174000.webp' }).background_image_url.endsWith('.webp'), true);
});
