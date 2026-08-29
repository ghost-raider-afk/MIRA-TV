export const MOTION_SCENE_VERSION = 3;

export const MOTION_LAYERS = Object.freeze({
  BACKGROUND: 'background',
  MENU: 'menu',
  ATMOSPHERE: 'atmosphere',
  ENTITY: 'entity'
});

export function createMotionNode({ id, kind, layer, target, order = 0, count = 1, depth = 0, transformOwner = 'self', metadata = null }) {
  if (!id || typeof id !== 'string') throw new TypeError('Motion node requires a stable id.');
  if (!kind || typeof kind !== 'string') throw new TypeError(`Motion node ${id} requires a kind.`);
  if (!layer || typeof layer !== 'string') throw new TypeError(`Motion node ${id} requires a layer.`);
  if (target === undefined || target === null) throw new TypeError(`Motion node ${id} requires a render target.`);
  return Object.freeze({
    id,
    kind,
    layer,
    target,
    order,
    count,
    depth,
    transformOwner,
    metadata: metadata ? Object.freeze({ ...metadata }) : null
  });
}

export function createMotionScene({ root, nodes, layers = Object.values(MOTION_LAYERS), metadata = null }) {
  if (root === undefined || root === null) throw new TypeError('Motion scene requires a render root.');
  if (!Array.isArray(nodes)) throw new TypeError('Motion scene requires nodes.');
  const frozenNodes = Object.freeze(nodes.map((node) => createMotionNode(node)));
  const ids = new Set();
  for (const node of frozenNodes) {
    if (ids.has(node.id)) throw new Error(`Duplicate motion scene node id: ${node.id}`);
    ids.add(node.id);
  }
  return Object.freeze({
    version: MOTION_SCENE_VERSION,
    root,
    nodes: frozenNodes,
    layers: Object.freeze([...layers]),
    metadata: metadata ? Object.freeze({ ...metadata }) : null,
    find(kind) {
      return frozenNodes.filter((node) => node.kind === kind);
    },
    node(id) {
      return frozenNodes.find((node) => node.id === id) || null;
    }
  });
}
