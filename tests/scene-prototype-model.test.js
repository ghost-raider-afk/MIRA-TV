import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendSlide,
  createElement,
  createScene,
  normaliseScene,
  setDisplayCount
} from '../src/web/admin-ui/public/js/scenes/model.js';

test('prototype scene creates a horizontal canvas from display count', () => {
  const scene = createScene({ displayCount: 3 });
  assert.equal(scene.display_count, 3);
  assert.equal(scene.canvas_width, 5760);
  assert.equal(scene.canvas_height, 1080);
  assert.equal(scene.slides.length, 1);
});

test('prototype scene preserves slide-first authoring model', () => {
  const scene = createScene();
  const second = appendSlide(scene);
  const element = createElement('weather', scene, second);
  second.elements.push(element);
  assert.equal(scene.slides.length, 2);
  assert.equal(scene.active_slide_id, second.id);
  assert.equal(second.elements[0].type, 'weather');
});

test('changing horizontal display count resizes canvas and clamps elements', () => {
  const scene = createScene({ displayCount: 4 });
  const slide = scene.slides[0];
  const element = createElement('text', scene, slide);
  element.x = 7000;
  slide.elements.push(element);
  setDisplayCount(scene, 1);
  assert.equal(scene.canvas_width, 1920);
  assert.ok(element.x + element.width <= scene.canvas_width);
});

test('normaliseScene limits prototype to supported horizontal display range', () => {
  const scene = normaliseScene({ ...createScene(), display_count: 100 });
  assert.equal(scene.display_count, 6);
  assert.equal(scene.canvas_width, 11520);
});
