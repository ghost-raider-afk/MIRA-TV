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
  const visibility = sceneVisibility(profile);
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

  return visibility;
}
