import { createMotionScene, MOTION_LAYERS, MOTION_SCENE_VERSION } from './scene-graph.js';

function markTarget(node) {
  const { target } = node;
  if (!(target instanceof Element)) return;
  target.dataset.motion = node.kind;
  target.dataset.motionNode = node.id;
  target.dataset.motionLayer = node.layer;
  target.dataset.motionOrder = String(node.order ?? 0);
  target.dataset.motionCount = String(node.count ?? 1);
  target.dataset.motionDepth = String(node.depth ?? 0);
  target.dataset.motionTransformOwner = node.transformOwner || 'self';
}

function append(nodes, node) {
  if (!(node.target instanceof Element)) return;
  nodes.push(node);
}

function collectMenuNodes(stage) {
  const nodes = [];
  const sections = [...stage.querySelectorAll('g.table-section .row-motion-surface-section')];
  sections.forEach((target, index) => append(nodes, {
    id: `menu.section.${index}`, kind: 'section', layer: MOTION_LAYERS.MENU, target,
    order: index, count: sections.length, depth: 0, transformOwner: 'surface', metadata: { surfaceOnly: true }
  }));

  const rows = [...stage.querySelectorAll('g.table-item .row-motion-surface-item, g.table-packaging .row-motion-surface-packaging')];
  rows.forEach((target, index) => append(nodes, {
    id: `menu.item.${index}`, kind: 'item', layer: MOTION_LAYERS.MENU, target,
    order: index, count: rows.length, depth: 0, transformOwner: 'surface', metadata: { surfaceOnly: true }
  }));

  const promotions = [...stage.querySelectorAll('g.promotion-badge')];
  promotions.forEach((target, index) => append(nodes, {
    id: `menu.promotion.${index}`, kind: 'promotion', layer: MOTION_LAYERS.MENU, target,
    order: index, count: promotions.length, depth: 2, transformOwner: 'promotion-badge'
  }));

  const glows = [...stage.querySelectorAll('g.promotion-row-glow')];
  glows.forEach((target, index) => append(nodes, {
    id: `menu.promotion-glow.${index}`, kind: 'promotion-glow', layer: MOTION_LAYERS.MENU, target,
    order: index, count: glows.length, depth: 1, transformOwner: 'promotion-overlay'
  }));
  return nodes;
}

function collectEntityNodes(stage) {
  const nodes = [];
  stage.querySelectorAll('[data-entity-motion]').forEach((target, index) => append(nodes, {
    id: `entity.${target.dataset.entityMotion || index}`,
    kind: 'entity', layer: MOTION_LAYERS.ENTITY, target,
    order: index, count: 1, depth: 10, transformOwner: 'entity-behavior'
  }));
  return nodes;
}

export function buildDomMotionScene(stage) {
  if (!(stage instanceof Element)) throw new TypeError('DOM motion scene requires a stage element.');
  const scene = createMotionScene({
    root: stage,
    nodes: [...collectMenuNodes(stage), ...collectEntityNodes(stage)],
    metadata: { adapter: 'dom', backgroundMotion: false, rowTransformOwner: false, menuTextStatic: true, promotionOverlay: 'row-glow' }
  });
  scene.nodes.forEach(markTarget);
  stage.dataset.motionSceneVersion = String(MOTION_SCENE_VERSION);
  return scene;
}
