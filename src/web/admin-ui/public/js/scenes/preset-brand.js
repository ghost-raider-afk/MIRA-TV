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
  const scale = scene.canvas_width / 1920;
  const heroLeft = preset.layout === 'hero-left';
  return heroLeft
    ? { x: 1410 * scale, y: 34, width: 340 * scale, height: 72 }
    : { x: 92 * scale, y: 30, width: 310 * scale, height: 72 };
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
      media: { fit: 'contain', position: 'center' }
    });
  }
  return scene;
}
