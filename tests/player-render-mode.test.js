import test from 'node:test';
import assert from 'node:assert/strict';

import { playerMenuRenderMode } from '../src/web/admin-ui/public/js/player/flat-menu-renderer.js';

test('Player uses Flat Menu Renderer when motion is disabled', () => {
  assert.equal(playerMenuRenderMode({ animation: { enabled: false, profile: null } }), 'flat');
  assert.equal(playerMenuRenderMode({ animation: { enabled: true, profile: null } }), 'flat');
});

test('Player keeps the menu flat and enables coarse GPU scene motion for animated profiles', () => {
  assert.equal(playerMenuRenderMode({ animation: { enabled: true, profile: { pattern: 'cinematic' } } }), 'flat-gpu');
});
