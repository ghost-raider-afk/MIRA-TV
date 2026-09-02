import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { animationSettingsInput } from '../src/contracts/animation.js';
import { announcementInput } from '../src/contracts/announcement.js';
import { brandTitleInput } from '../src/contracts/brand-title.js';
import { environmentInput, environmentFromLegacyAquarium } from '../src/contracts/environment.js';
import { completeScenePlaylist, scenePlaylistInput, MAX_PLAYLIST_SCENES } from '../src/contracts/scene-playlist.js';
import { completeAnimationProfile, DEFAULT_ANIMATION_PROFILE } from '../src/shared/animation-profile.js';

const root = new URL('../src/web/admin-ui/public/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('canonical profile keeps static menu text, static background and smooth promotion glow', () => {
  const profile = completeAnimationProfile({});
  assert.equal(profile.motion_version, 3);
  assert.equal(profile.pattern, 'cinematic');
  assert.equal(profile.section_effect, 'cinematic');
  assert.equal(profile.item_effect, 'cinematic');
  assert.equal(profile.price_effect, 'none');
  assert.equal('background_effect' in profile, false);
  assert.equal('background_zoom_percent' in profile, false);
  assert.equal(profile.promotion_effect, 'cinematic');
  assert.equal(profile.promotion_easing, 'smooth');
  assert.equal(profile.promotion_travel_px, 0);
  assert.ok(profile.promotion_scale_amount >= 0.03 && profile.promotion_scale_amount <= 0.08);
  const parsed = animationSettingsInput({
    enabled: true,
    preset_id: 'cinematic-live-menu',
    profile: DEFAULT_ANIMATION_PROFILE,
    announcement: {},
    brand: {},
    environment: {},
    scene_playlist: {}
  });
  assert.equal(parsed.preset_id, 'cinematic-live-menu');
  assert.equal(parsed.profile.price_effect, 'none');
  assert.equal(parsed.profile.promotion_easing, 'smooth');
  assert.equal(parsed.brand.text, '');
  assert.equal(parsed.environment.enabled, false);
  assert.equal(parsed.environment.effect, 'none');
  assert.deepEqual(parsed.scene_playlist, { enabled: false, menu_duration_seconds: 40, scenes: [] });
});

test('Scene Playlist keeps MenuScene implicit and validates temporary scene semantics before canonicalization', () => {
  assert.deepEqual(completeScenePlaylist(), { enabled: false, menu_duration_seconds: 40, scenes: [] });

  const parsed = scenePlaylistInput({
    enabled: true,
    menu_duration_seconds: 42,
    scenes: [
      { id: 'promo-1', type: 'promo', enabled: true, mode: 'overlay', duration_seconds: 8, title: 'Акция', body: '' },
      { id: 'content-1', type: 'content', enabled: true, mode: 'split', duration_seconds: 12, title: '', body: 'Информация' },
      { id: 'object-1', type: 'object-story', enabled: true, mode: 'fullscreen', duration_seconds: 10, title: '', body: '' }
    ]
  });
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.menu_duration_seconds, 42);
  assert.deepEqual(parsed.scenes.map(({ type, mode }) => ({ type, mode })), [
    { type: 'promo', mode: 'overlay' },
    { type: 'content', mode: 'split' },
    { type: 'object-story', mode: 'fullscreen' }
  ]);
  assert.equal(parsed.scenes.some((scene) => scene.type === 'menu'), false);

  assert.equal(completeScenePlaylist({ menu_duration_seconds: 1 }).menu_duration_seconds, 5);
  assert.equal(completeScenePlaylist({ menu_duration_seconds: 999 }).menu_duration_seconds, 300);
  assert.equal(completeScenePlaylist({ scenes: [{ duration_seconds: 1 }] }).scenes[0].duration_seconds, 2);
  assert.equal(completeScenePlaylist({ scenes: [{ duration_seconds: 999 }] }).scenes[0].duration_seconds, 120);
  assert.throws(() => scenePlaylistInput({ scenes: 'promo' }), /должен быть массивом/);
  assert.throws(() => scenePlaylistInput({ scenes: [{ type: 'menu' }] }), /неподдерживаемый тип/);
  assert.throws(() => scenePlaylistInput({ scenes: [{ type: 'promo', mode: 'picture-in-picture', title: 'x' }] }), /неподдерживаемый режим/);
  assert.throws(() => scenePlaylistInput({ scenes: [{ id: 'same', title: '1' }, { id: 'same', title: '2' }] }), /повторяющиеся идентификаторы/);
  assert.throws(() => scenePlaylistInput({ enabled: true, scenes: [{ type: 'content', title: '', body: '' }] }), /заголовок или текст/);
  assert.throws(() => scenePlaylistInput({ scenes: Array.from({ length: MAX_PLAYLIST_SCENES + 1 }, (_, index) => ({ id: `s-${index}`, title: 'x' })) }), /не более/);
});

test('announcement contract validates font, vertical stretch and independent row glow', () => {
  const parsed = announcementInput({
    enabled: true, text: 'Сегодня скидка 10%', position: 'bottom', speed_px_per_second: 90, font_size: 34,
    font_family: 'oswald', vertical_scale: 1.35, text_color: '#FFFFFF', background_color: '#101317',
    background_opacity: 0.8, glow_enabled: true, glow_color: '#35D9FF', glow_strength: 16
  });
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.text, 'Сегодня скидка 10%');
  assert.equal(parsed.font_family, 'oswald');
  assert.equal(parsed.vertical_scale, 1.35);
  assert.equal(parsed.glow_enabled, true);
  assert.throws(() => announcementInput({ enabled: true, text: '' }), /Введите текст объявления/);
  assert.throws(() => announcementInput({ enabled: true, text: 'x', font_family: 'remote-font' }), /Шрифт бегущей строки/);
});

test('brand title and environment effect are independent validated scene layers', () => {
  const brand = brandTitleInput({
    enabled: true,
    text: 'БАР\nМАЯК',
    x: 240,
    y: 110,
    font_family: 'montserrat',
    vertical_scale: 1.2,
    line_spacing: -18,
    effect: 'neon-pulse'
  });
  assert.equal(brand.text, 'БАР\nМАЯК');
  assert.equal(brand.x, 240);
  assert.equal(brand.vertical_scale, 1.2);
  assert.equal(brand.line_spacing, -18);
  assert.equal(brand.effect, 'neon-pulse');
  assert.equal(brandTitleInput({}).text, '');
  assert.throws(() => brandTitleInput({ enabled: true, text: '' }), /Введите название бренда/);

  const environment = environmentInput({
    enabled: true,
    effect: 'aquarium',
    parameters: { style: 'neon', intro_fill: true, fish_count: 4, bubble_density: 50, plant_density: 30, caustics: 60, speed: 40 }
  });
  assert.equal(environment.enabled, true);
  assert.equal(environment.effect, 'aquarium');
  assert.equal(environment.parameters.style, 'neon');
  assert.equal(environment.parameters.fish_count, 4);
});

test('legacy aquarium settings are converted to an environment effect without becoming a layer', () => {
  const environment = environmentFromLegacyAquarium({
    enabled: true,
    style: 'reef',
    intro_fill: false,
    fish_count: 5,
    bubble_density: 44,
    plant_density: 22,
    caustics: 61,
    speed: 37
  });
  assert.deepEqual(environment, {
    enabled: true,
    effect: 'aquarium',
    parameters: {
      style: 'reef', intro_fill: false, intensity: 45, fish_count: 5,
      bubble_density: 44, plant_density: 22, caustics: 61, speed: 37
    }
  });
});

test('legacy animation data migrates without background or independent price motion', () => {
  const migrated = completeAnimationProfile({
    entrance: 'cascade', direction: 'left', easing: 'smooth', duration_ms: 900, stagger_ms: 70,
    distance_px: 54, scale_from: 0.98, opacity_from: 0, section_emphasis: 'pulse', price_emphasis: 'pop',
    shimmer: false, glow: true, background_motion: true, ambient_speed_seconds: 28, intensity: 55
  });
  assert.equal(migrated.motion_version, 3);
  assert.equal('background_effect' in migrated, false);
  assert.equal(migrated.price_effect, 'none');
  assert.equal(migrated.promotion_effect, 'cinematic');
  assert.equal(migrated.promotion_easing, 'smooth');
  assert.equal(migrated.promotion_scale_amount, 0.06);
});

test('stored v3 bounce/pop settings are canonicalized instead of reintroducing jerking', () => {
  const migrated = completeAnimationProfile({
    ...DEFAULT_ANIMATION_PROFILE,
    motion_version: 3,
    price_effect: 'pop',
    promotion_effect: 'bounce',
    promotion_easing: 'elastic',
    promotion_scale_amount: 0.2,
    promotion_travel_px: 24
  });
  assert.equal(migrated.price_effect, 'none');
  assert.equal(migrated.promotion_effect, 'cinematic');
  assert.equal(migrated.promotion_easing, 'smooth');
  assert.equal(migrated.promotion_scale_amount, 0.08);
  assert.equal(migrated.promotion_travel_px, 0);
});

test('legacy Motion Studio is retired from the user-facing playlist route while compatibility runtime remains', async () => {
  const [html, application, navigation, playlistEditor, runtime] = await Promise.all([
    read('playlist.html'),
    read('js/application.js'),
    read('js/core/navigation.js'),
    read('js/motion/scene-playlist-editor.js'),
    read('js/motion/scene-playlist-runtime.js')
  ]);

  assert.match(html, /data-page="playlist"/);
  assert.match(html, /playlist-retired-page/);
  assert.match(html, /Старый Motion Studio выведен из рабочего интерфейса/);
  assert.doesNotMatch(html, /id="animation-stage"|id="animation-entity-file"|PLAYLIST STUDIO/);
  assert.doesNotMatch(application, /import\('\.\/pages\/playlist\.js'\)/);
  assert.match(application, /case 'playlist':\s*case 'animation':\s*return undefined;/);
  assert.match(navigation, /path: '\/playlist'.*prefetch: false/);
  const primaryRoutes = navigation.match(/export const PRIMARY_ROUTES = Object\.freeze\(\[[\s\S]*?\]\);/)?.[0] || '';
  assert.doesNotMatch(primaryRoutes, /href: '\/playlist'/);
  assert.match(playlistEditor, /export class ScenePlaylistEditor/);
  assert.match(runtime, /export class ScenePlaylistRuntime/);
});
