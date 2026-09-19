import assert from 'node:assert/strict';
import test from 'node:test';
import { sceneInput } from '../src/contracts/scene.js';

test('scene contract normalizes canonical geometry and rich-text runs', () => {
  const scene = sceneInput({
    elements: [{
      id: 'element-1',
      type: 'text',
      x: 100,
      y: 200,
      width: 800,
      height: 300,
      text: {
        runs: [
          { value: 'СВЕЖЕЕ ', color: '#ffffff', font_size_px: 48 },
          { value: 'ПИВО', color: '#f4c915', font_size_px: 96, font_weight: 700, tracking_px: 2 }
        ],
        paragraph: { align: 'center', vertical_align: 'center', wrap: true },
        effects: { stroke: { enabled: true, width_px: 2, color: '#000000' } }
      }
    }]
  });

  assert.equal(scene.version, 1);
  assert.equal(scene.elements.length, 1);
  assert.equal(scene.elements[0].text.runs[1].value, 'ПИВО');
  assert.equal(scene.elements[0].text.runs[1].font_weight, 700);
  assert.equal(scene.elements[0].text.paragraph.align, 'center');
  assert.equal(scene.elements[0].text.effects.stroke.enabled, true);
});

test('scene contract strips incompatible type-specific data', () => {
  const scene = sceneInput({
    elements: [{
      id: 'element-2',
      type: 'image',
      width: 640,
      height: 360,
      text: { runs: [{ value: 'legacy' }] },
      weather: { mode: 'current-and-forecast' },
      media: { source_url: '/site-assets/scene/photo.webp', fit: 'cover' }
    }]
  });

  const element = scene.elements[0];
  assert.equal(element.type, 'image');
  assert.equal(element.media.fit, 'cover');
  assert.equal('text' in element, false);
  assert.equal('weather' in element, false);
});

test('scene contract rejects duplicate ids and geometry outside canonical bounds', () => {
  assert.throws(() => sceneInput({
    elements: [
      { id: 'same', type: 'logo', width: 100, height: 100 },
      { id: 'same', type: 'logo', width: 100, height: 100 }
    ]
  }), /уникальными/);

  assert.throws(() => sceneInput({
    elements: [{ id: 'overflow', type: 'image', x: 1800, width: 200, height: 100 }]
  }), /правую границу/);
});

test('scene media only accepts same-origin site assets', () => {
  assert.throws(() => sceneInput({
    elements: [{ id: 'external', type: 'video', width: 640, height: 360, media: { source_url: 'https://example.com/video.mp4' } }]
  }), /внутренний ресурс/);
});


test('weather scene element owns location and presentation settings', () => {
  const scene = sceneInput({
    elements: [{
      id: 'weather-1', type: 'weather', width: 520, height: 360,
      weather: { location_name: 'Хельсинки', latitude: 60.1699, longitude: 24.9384, timezone: 'Europe/Helsinki', refresh_minutes: 10, show_forecast: true, forecast_items: 4, animation_speed: 1.25 }
    }]
  });
  const weather = scene.elements[0].weather;
  assert.equal(weather.location_name, 'Хельсинки');
  assert.equal(weather.latitude, 60.1699);
  assert.equal(weather.longitude, 24.9384);
  assert.equal(weather.timezone, 'Europe/Helsinki');
  assert.equal(weather.forecast_items, 4);
  assert.equal(weather.animation_speed, 1.25);
});
