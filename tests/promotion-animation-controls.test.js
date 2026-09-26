import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePromotionMotionProgram } from '../src/web/admin-ui/public/js/motion/motion-plan.js';

function scene() {
  const nodes = [
    { id:'badge-glow', kind:'promotion-badge-glow', metadata:{ animation:'shine' } },
    { id:'badge-shine', kind:'promotion-badge-shine', metadata:{ animation:'shine', travelPx:120 } },
    { id:'badge-sparkle', kind:'promotion-badge-sparkle', metadata:{ animation:'shine', travelPx:120 } },
    { id:'row-glow', kind:'promotion-glow', metadata:{ animation:'wave' } }
  ];
  return { nodes };
}

const baseProfile = Object.freeze({
  promotion_effect:'cinematic',
  promotion_cycle_seconds:4.8,
  promotion_event_duration_ms:1800,
  promotion_intensity:96,
  promotion_brightness_amount:.35,
  promotion_glow_radius:28,
  promotion_shine_speed:1,
  promotion_shine_frequency_per_minute:8,
  promotion_row_intensity:96,
  promotion_row_cycle_seconds:4.8,
  promotion_row_event_duration_ms:1800,
  promotion_row_glow_radius:28,
  promotion_badge_glow_enabled:true,
  promotion_badge_shine_enabled:true,
  promotion_badge_sparkle_enabled:true,
  promotion_row_highlight_enabled:true,
  promotion_row_animation_enabled:true
});

test('promotion motion parts can be disabled independently', () => {
  const program = compilePromotionMotionProgram(scene(), {
    profile:{
      ...baseProfile,
      promotion_badge_shine_enabled:false,
      promotion_badge_sparkle_enabled:false,
      promotion_row_animation_enabled:false
    }
  });

  assert.deepEqual(program.tracks.map((track) => track.procedural.kind), ['promo-badge-glow']);
});

test('promotion master switch stops all animated tracks', () => {
  const program = compilePromotionMotionProgram(scene(), {
    profile:{ ...baseProfile, promotion_effect:'none' }
  });
  assert.equal(program.tracks.length, 0);
});

test('promotion row highlight switch also suppresses row animation', () => {
  const program = compilePromotionMotionProgram(scene(), {
    profile:{ ...baseProfile, promotion_row_highlight_enabled:false }
  });
  assert.equal(program.tracks.some((track) => track.procedural.kind === 'promo-glow'), false);
  assert.equal(program.tracks.some((track) => track.procedural.kind === 'promo-badge-shine'), true);
});
