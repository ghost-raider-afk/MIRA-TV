import test from 'node:test';
import assert from 'node:assert/strict';

import { gpuPromotionEffectPlan, gpuSceneEffectPlan } from '../src/web/admin-ui/public/js/player/gpu-scene-runtime.js';

test('GPU scene plan uses only transform and opacity keyframes', () => {
  for (const pattern of ['cinematic', 'ambient', 'wave', 'focus', 'pulse', 'spark', 'parallax']) {
    const plan = gpuSceneEffectPlan({ pattern, intensity: 70, cycle_seconds: 8, flow_direction: 'left-to-right' });
    assert.ok(plan.duration >= 4000);
    assert.ok(plan.keyframes.length >= 3);
    for (const frame of plan.keyframes) {
      assert.deepEqual(Object.keys(frame).sort(), ['opacity', 'transform']);
      assert.equal(typeof frame.transform, 'string');
      assert.equal(typeof frame.opacity, 'number');
    }
  }
});

test('GPU scene direction is compiled once into compositor keyframes', () => {
  const left = gpuSceneEffectPlan({ pattern: 'cinematic', flow_direction: 'left-to-right' });
  const right = gpuSceneEffectPlan({ pattern: 'cinematic', flow_direction: 'right-to-left' });
  const vertical = gpuSceneEffectPlan({ pattern: 'cinematic', flow_direction: 'top-to-bottom' });
  assert.match(left.keyframes[0].transform, /-145%/);
  assert.match(right.keyframes[0].transform, /145%/);
  assert.match(vertical.keyframes[0].transform, /0,-145%/);
});

test('TV promotion plan animates badge and full-row glow with compositor-safe keyframes', () => {
  const plan = gpuPromotionEffectPlan({
    promotion_effect: 'cinematic',
    promotion_intensity: 96,
    promotion_cycle_seconds: 4.8,
    promotion_event_duration_ms: 1800,
    promotion_scale_amount: 0.06,
    promotion_brightness_amount: 0.35,
    promotion_glow_radius: 28
  });
  assert.ok(plan);
  assert.equal(plan.duration, 4800);
  assert.equal(plan.badgeKeyframes.length, 4);
  assert.equal(plan.glowKeyframes.length, 4);
  assert.match(plan.badgeKeyframes[1].transform, /^scale\(1\./);
  for (const frame of plan.badgeKeyframes) {
    assert.deepEqual(Object.keys(frame).sort(), ['offset', 'opacity', 'transform']);
    assert.ok(!Object.hasOwn(frame, 'filter'));
  }
  for (const frame of plan.glowKeyframes) {
    assert.deepEqual(Object.keys(frame).sort(), ['offset', 'opacity']);
  }
  assert.ok(plan.glowKeyframes[1].opacity > 0);
  assert.equal(gpuPromotionEffectPlan({ promotion_effect: 'none' }), null);
  assert.equal(gpuPromotionEffectPlan({ promotion_effect: 'cinematic', promotion_intensity: 0 }), null);
});
