function cloneStyle(preset) {
  return {
    color: preset.palette.text,
    font_size: 24,
    font_weight: 700,
    text_align: 'center',
    vertical_align: 'center',
    line_height: 1,
    letter_spacing: 1,
    background: 'transparent',
    radius: 18,
    border_width: 1,
    border_color: preset.palette.accent
  };
}

function logoGeometry(scene, preset) {
  const heroLeft = preset.layout === 'hero-left';
  const multi = scene.canvas_width > 1920;
  if (multi) return { x: Math.max(90, scene.canvas_width - 470), y: 50, width: 360, height: 76 };
  return heroLeft
    ? { x: 1450, y: 38, width: 360, height: 76 }
    : { x: 90, y: 38, width: 330, height: 76 };
}

export function ensurePresetLogoSlots(scene, preset) {
  if (!scene || !Array.isArray(scene.slides)) return scene;
  for (const slide of scene.slides) {
    if ((slide.elements || []).some((element) => element.type === 'logo')) continue;
    const geometry = logoGeometry(scene, preset);
    slide.elements.push({
      id: `element-preset-core-${slide.id}-logo`,
      type: 'logo',
      ...geometry,
      z_index: 80,
      opacity: 1,
      content: 'ВАШ ЛОГОТИП',
      variant: 'default',
      style: cloneStyle(preset),
      effects: { shadow: false, glow: preset.id === 'night-neon', blur: 0 },
      animation: { entrance: 'fade', loop: 'none', exit: 'none', duration_ms: 700 },
      asset_id: '',
      media: { fit: 'contain', position: 'center' },
      preset_owned: true,
      preset_id: preset.id,
      preset_role: 'logo',
      preset_default_content: 'ВАШ ЛОГОТИП'
    });
  }
  return scene;
}
