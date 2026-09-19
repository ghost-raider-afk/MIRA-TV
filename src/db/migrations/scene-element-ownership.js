import { sceneInput } from '../../contracts/scene.js';

const IDS = Object.freeze({
  brand: 'legacy-brand',
  entity: 'legacy-entity',
  weather: 'legacy-weather',
  announcement: 'legacy-announcement'
});

function parse(value) {
  try {
    const result = JSON.parse(value || '{}');
    return result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  } catch {
    return {};
  }
}

function clamp(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function integer(value, min, max, fallback = min) {
  return Math.round(clamp(value, min, max, fallback));
}

function font(value) {
  if (value === 'arial') return 'arial';
  if (value === 'oswald') return 'arial-narrow';
  return 'system-sans';
}

function textElement({ id, text, x, y, width, height, z, fontFamily='system-sans', fontSize=64, fontWeight=700, color='#FFFFFF', tracking=0, verticalScale=100, glow=null, align='left' }) {
  return {
    id,
    type: 'text',
    enabled: true,
    x: integer(x, 0, 1919, 0),
    y: integer(y, 0, 1079, 0),
    width: integer(width, 1, 1920, 640),
    height: integer(height, 1, 1080, 180),
    z_index: integer(z, -1000, 1000, 0),
    opacity: 1,
    rotation_deg: 0,
    text: {
      runs: [{
        value: String(text || ''),
        font_family: fontFamily,
        font_size_px: clamp(fontSize, 6, 512, 64),
        font_weight: integer(fontWeight, 100, 900, 700),
        color,
        tracking_px: clamp(tracking, -20, 100, 0),
        vertical_scale_percent: clamp(verticalScale, 10, 400, 100)
      }],
      paragraph: { align, vertical_align: 'center', wrap: true },
      effects: glow ? {
        glow: {
          enabled: true,
          blur_px: clamp(glow.blur, 0, 256, 0),
          spread_px: 0,
          color: glow.color,
          opacity: .65
        }
      } : {}
    }
  };
}

function legacyBrand(value, z) {
  if (value?.enabled !== true || !String(value?.text || '').trim()) return null;
  const fontSize = clamp(value.font_size, 18, 180, 72);
  const lines = String(value.text).split(/\r?\n/).length;
  const width = Math.min(1200, Math.max(320, String(value.text).length * fontSize * .62));
  const height = Math.min(540, Math.max(100, lines * fontSize * 1.35));
  const x = Math.min(1920 - width, clamp(value.x, 0, 1920, 960));
  const y = Math.min(1080 - height, clamp(value.y, 0, 1080, 96));
  return textElement({
    id: IDS.brand,
    text: value.text,
    x, y, width, height, z,
    fontFamily: font(value.font_family),
    fontSize,
    fontWeight: 700,
    color: /^#[0-9a-f]{6}$/i.test(String(value.text_color || '')) ? value.text_color : '#FFFFFF',
    tracking: clamp(value.letter_spacing, -2, 20, 2),
    verticalScale: clamp(value.vertical_scale, .5, 2.2, 1) * 100,
    glow: Number(value.glow_strength) > 0 ? {
      blur: value.glow_strength,
      color: /^#[0-9a-f]{6}$/i.test(String(value.glow_color || '')) ? value.glow_color : '#35D9FF'
    } : null
  });
}

function legacyEntity(value, z) {
  if (value?.visible !== true || typeof value?.asset_url !== 'string' || !value.asset_url.startsWith('/site-assets/')) return null;
  const transform = value.transform && typeof value.transform === 'object' ? value.transform : {};
  const sourceWidth = clamp(value.width ?? value.asset_width, 0, 7680, 0);
  const sourceHeight = clamp(value.height ?? value.asset_height, 0, 4320, 0);
  const baseWidth = clamp(transform.width, 24, 3840, 280);
  const scale = clamp(transform.scale, .1, 4, 1);
  const baseHeight = sourceWidth > 0 && sourceHeight > 0 ? baseWidth * (sourceHeight / sourceWidth) : baseWidth;
  const width = Math.min(1920, Math.max(1, Math.round(baseWidth * scale)));
  const height = Math.min(1080, Math.max(1, Math.round(baseHeight * scale)));
  const visualX = clamp(transform.x, -1920, 3840, 0) - (width - baseWidth) / 2;
  const visualY = clamp(transform.y, -1080, 2160, 0) - (height - baseHeight) / 2;
  const type = value.asset_type === 'video' || /\.(?:mp4|webm)$/i.test(value.asset_url) ? 'video' : 'image';
  return {
    id: IDS.entity,
    type,
    enabled: true,
    x: integer(visualX, 0, Math.max(0, 1920 - width), 0),
    y: integer(visualY, 0, Math.max(0, 1080 - height), 0),
    width,
    height,
    z_index: integer(transform.depth, -1000, 1000, z),
    opacity: clamp(transform.opacity, 0, 1, 1),
    rotation_deg: clamp(transform.rotation, -360, 360, 0),
    media: {
      source_url: value.asset_url,
      fit: 'contain',
      ...(type === 'video' ? {
        loop: value.loop !== false,
        muted: value.muted !== false,
        playback_rate: clamp(value.playback_rate, .25, 4, 1)
      } : {})
    }
  };
}

function legacyWeather(value, z) {
  if (value?.enabled !== true) return null;
  const scale = clamp(value.scale, .4, 2.5, 1);
  const width = Math.min(1920, Math.max(260, Math.round(clamp(value.width_px, 260, 760, 420) * scale)));
  const height = Math.min(1080, Math.max(220, Math.round(360 * scale)));
  const centerX = clamp(value.x, 0, 1920, 1660);
  const centerY = clamp(value.y, 0, 1080, 190);
  return {
    id: IDS.weather,
    type: 'weather',
    enabled: true,
    x: integer(centerX - width / 2, 0, Math.max(0, 1920 - width), 0),
    y: integer(centerY - height / 2, 0, Math.max(0, 1080 - height), 0),
    width,
    height,
    z_index: z,
    opacity: clamp(value.opacity, 0, 1, .96),
    rotation_deg: 0,
    weather: {
      mode: value.show_forecast === false ? 'current' : 'current-and-forecast',
      location_name: value.location_name || '',
      latitude: value.latitude,
      longitude: value.longitude,
      timezone: value.timezone || 'auto',
      refresh_minutes: value.refresh_minutes || 15,
      show_location: true,
      show_condition: value.show_condition !== false,
      show_feels_like: value.show_feels_like !== false,
      show_humidity: value.show_humidity !== false,
      show_wind: value.show_wind !== false,
      show_forecast: value.show_forecast !== false,
      forecast_items: value.forecast_items || 3,
      animation_enabled: value.animation_enabled !== false,
      animation_speed: value.animation_speed || 1,
      animation_intensity: value.animation_intensity || 1,
      widget_motion_enabled: value.widget_motion_enabled !== false
    }
  };
}

function legacyAnnouncement(value, z) {
  const text = String(value?.text || '').trim();
  if (value?.enabled !== true || !text) return null;
  const height = Math.min(240, Math.max(80, clamp(value.font_size, 18, 72, 34) * 2.4));
  return textElement({
    id: IDS.announcement,
    text,
    x: 0,
    y: value.position === 'top' ? 0 : 1080 - height,
    width: 1920,
    height,
    z,
    fontFamily: font(value.font_family),
    fontSize: clamp(value.font_size, 18, 72, 34),
    fontWeight: 700,
    color: /^#[0-9a-f]{6}$/i.test(String(value.text_color || '')) ? value.text_color : '#FFFFFF',
    verticalScale: clamp(value.vertical_scale, .5, 2.2, 1) * 100,
    glow: value.glow_enabled === true ? {
      blur: value.glow_strength,
      color: /^#[0-9a-f]{6}$/i.test(String(value.glow_color || '')) ? value.glow_color : '#35D9FF'
    } : null,
    align: 'center'
  });
}

function addIfMissing(elements, candidate) {
  if (!candidate || elements.some((item) => item?.id === candidate.id)) return;
  elements.push(candidate);
}

export async function migrateLegacySceneOwnership(pool) {
  const drafts = await pool.query('SELECT screen_id, scene_json FROM screen_drafts ORDER BY screen_id');
  for (const row of drafts.rows) {
    const scene = parse(row.scene_json);
    const elements = Array.isArray(scene.elements) ? structuredClone(scene.elements) : [];
    const [animationResult, weatherResult] = await Promise.all([
      pool.query('SELECT entity_json, announcement_json, brand_json FROM screen_animation_settings WHERE screen_id = $1', [row.screen_id]),
      pool.query('SELECT config_json FROM screen_weather_settings WHERE screen_id = $1', [row.screen_id])
    ]);
    const animation = animationResult.rows[0] || {};
    const weather = weatherResult.rows[0] || {};
    let z = elements.reduce((max, item) => Math.max(max, Number(item?.z_index) || 0), 0) + 1;
    addIfMissing(elements, legacyBrand(parse(animation.brand_json), z++));
    addIfMissing(elements, legacyEntity(parse(animation.entity_json), z++));
    if (!elements.some((item) => item?.type === 'weather')) addIfMissing(elements, legacyWeather(parse(weather.config_json), z++));
    addIfMissing(elements, legacyAnnouncement(parse(animation.announcement_json), z++));
    const normalized = sceneInput({ version: 1, elements });
    await pool.query('UPDATE screen_drafts SET scene_json = $1 WHERE screen_id = $2', [JSON.stringify(normalized), row.screen_id]);
  }
}

export const LEGACY_SCENE_ELEMENT_IDS = IDS;
