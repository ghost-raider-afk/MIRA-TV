import test from 'node:test';
import assert from 'node:assert/strict';

import { gpuSceneEffectPlan } from '../src/web/admin-ui/public/js/player/gpu-scene-runtime.js';

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
