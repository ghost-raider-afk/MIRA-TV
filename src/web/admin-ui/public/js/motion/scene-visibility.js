function profileValue(profile) {
  return profile && typeof profile === 'object' ? profile : {};
}

export function sceneVisibility(profile = {}) {
  const value = profileValue(profile);
  return Object.freeze({
    menu: value.menu_visible !== false,
    promotion: value.promotion_visible !== false
  });
}

export function applySceneVisibility(root, profile = {}) {
  if (!(root instanceof Element)) return sceneVisibility(profile);
  const value = profileValue(profile);
  const visibility = sceneVisibility(value);
  const promotionMotionEnabled = value.promotion_effect !== 'none';
  const rowHighlightEnabled = value.promotion_row_highlight_enabled !== false;
  const rowAnimationEnabled = promotionMotionEnabled && value.promotion_row_animation_enabled !== false;
  const rowIntensity = Math.max(0, Math.min(100, Number(value.promotion_row_intensity ?? value.promotion_intensity ?? 96) || 0));
  const staticRowOpacity = rowHighlightEnabled ? Math.min(0.48, 0.12 + (rowIntensity / 100) * 0.30) : 0;
  const menuLayer = root.matches?.('[data-player-menu-layer],[data-scene-menu-layer]')
    ? root
    : root.querySelector('[data-player-menu-layer],[data-scene-menu-layer]');

  if (menuLayer instanceof HTMLElement) {
    menuLayer.hidden = !visibility.menu;
    menuLayer.setAttribute('aria-hidden', visibility.menu ? 'false' : 'true');
  }

  root.querySelectorAll('g.promotion-badge, g.promotion-row-glow').forEach((node) => {
    if (!(node instanceof SVGElement)) return;
    if (visibility.menu && visibility.promotion) node.style.removeProperty('display');
    else node.style.display = 'none';
  });

  root.querySelectorAll('g.promotion-row-glow').forEach((node) => {
    if (!(node instanceof SVGElement)) return;
    if (!visibility.menu || !visibility.promotion) return;
    if (rowAnimationEnabled && rowHighlightEnabled) node.style.removeProperty('opacity');
    else node.style.opacity = String(staticRowOpacity);
  });

  return visibility;
}
