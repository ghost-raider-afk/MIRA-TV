import { applySceneStage, renderSceneLayer } from './renderer.js';

const DEFAULT_TRANSITION_MS = 500;
const MAX_RUNTIME_ANIMATION_MS = 5000;

function reducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

function duration(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(MAX_RUNTIME_ANIMATION_MS, Math.max(0, Math.round(number)));
}

function elementById(slide) {
  return new Map((slide?.elements || []).map((element) => [element.id, element]));
}

function entranceFrames(type, opacity) {
  if (type === 'fade') return [{ opacity: 0 }, { opacity }];
  if (type === 'slide-up') return [{ opacity: 0, transform: 'translateY(7%)' }, { opacity, transform: 'translateY(0)' }];
  if (type === 'scale') return [{ opacity: 0, transform: 'scale(.94)' }, { opacity, transform: 'scale(1)' }];
  return null;
}

function exitFrames(type, opacity) {
  if (type === 'fade') return [{ opacity }, { opacity: 0 }];
  if (type === 'scale') return [{ opacity, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.94)' }];
  return null;
}

function transitionFrames(type) {
  switch (type) {
    case 'fade':
      return { incoming: [{ opacity: 0 }, { opacity: 1 }], outgoing: [{ opacity: 1 }, { opacity: 1 }] };
    case 'crossfade':
      return { incoming: [{ opacity: 0 }, { opacity: 1 }], outgoing: [{ opacity: 1 }, { opacity: 0 }] };
    case 'slide':
      return {
        incoming: [{ opacity: .35, transform: 'translateX(5%)' }, { opacity: 1, transform: 'translateX(0)' }],
        outgoing: [{ opacity: 1, transform: 'translateX(0)' }, { opacity: .35, transform: 'translateX(-5%)' }]
      };
    case 'zoom':
      return {
        incoming: [{ opacity: 0, transform: 'scale(1.035)' }, { opacity: 1, transform: 'scale(1)' }],
        outgoing: [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.985)' }]
      };
    case 'wipe':
      return {
        incoming: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
        outgoing: [{ opacity: 1 }, { opacity: 1 }]
      };
    default:
      return { incoming: null, outgoing: null };
  }
}

function animate(node, keyframes, milliseconds, easing = 'cubic-bezier(.22,.8,.25,1)') {
  if (!node || !keyframes || milliseconds <= 0 || reducedMotion() || typeof node.animate !== 'function') return null;
  return node.animate(keyframes, { duration: milliseconds, easing, fill: 'both' });
}

function finished(animation) {
  return animation?.finished?.catch(() => undefined) || Promise.resolve();
}

export function playSceneElementEntrances(layer, slide) {
  if (!layer || !slide || reducedMotion()) return [];
  const elements = elementById(slide);
  const animations = [];
  for (const node of layer.querySelectorAll('.scene-render-element[data-element-id]')) {
    const element = elements.get(node.dataset.elementId);
    if (!element) continue;
    const type = element.animation?.entrance || 'none';
    const frames = entranceFrames(type, Number(element.opacity ?? 1));
    if (!frames) continue;
    const loop = node.dataset.loop || 'none';
    node.dataset.loop = 'none';
    const animation = animate(node, frames, duration(element.animation?.duration_ms, 600));
    if (!animation) {
      node.dataset.loop = loop;
      continue;
    }
    void finished(animation).then(() => {
      if (node.isConnected) node.dataset.loop = loop;
    });
    animations.push(animation);
  }
  return animations;
}

export function playSceneElementExits(layer, slide) {
  if (!layer || !slide || reducedMotion()) return [];
  const elements = elementById(slide);
  const animations = [];
  for (const node of layer.querySelectorAll('.scene-render-element[data-element-id]')) {
    const element = elements.get(node.dataset.elementId);
    if (!element) continue;
    const frames = exitFrames(element.animation?.exit || 'none', Number(element.opacity ?? 1));
    if (!frames) continue;
    node.dataset.loop = 'none';
    const animation = animate(node, frames, duration(element.animation?.duration_ms, 600));
    if (animation) animations.push(animation);
  }
  return animations;
}

function frame(className, background) {
  const node = document.createElement('div');
  node.className = `scene-transition-frame ${className}`;
  node.style.background = background || '#10141c';
  return node;
}

function moveChildren(source, destination) {
  while (source.firstChild) destination.append(source.firstChild);
}

export async function transitionSceneLayer({
  stage,
  layer,
  scene,
  fromSlide,
  toSlide,
  context = {},
  decorate = null,
  animateElements = true
} = {}) {
  if (!stage || !layer || !scene || !toSlide) return [];
  if (!fromSlide || reducedMotion()) {
    applySceneStage(stage, scene, toSlide, { constrainAspect: stage !== layer });
    const nodes = renderSceneLayer(layer, { scene, slide: toSlide, context, decorate });
    if (animateElements) playSceneElementEntrances(layer, toSlide);
    return nodes;
  }

  const transition = toSlide.transition || 'none';
  const transitionMs = duration(toSlide.transition_duration_ms, transition === 'none' ? 0 : DEFAULT_TRANSITION_MS);
  const outgoing = frame('scene-transition-outgoing', fromSlide.background?.color || stage.style.background);
  const incoming = frame('scene-transition-incoming', toSlide.background?.color || '#10141c');
  moveChildren(layer, outgoing);
  layer.append(outgoing, incoming);

  const rendered = renderSceneLayer(incoming, { scene, slide: toSlide, context, decorate });
  const outgoingAnimations = animateElements ? playSceneElementExits(outgoing, fromSlide) : [];
  if (animateElements) playSceneElementEntrances(incoming, toSlide);
  const frames = transitionFrames(transition);
  const frameAnimations = [
    animate(outgoing, frames.outgoing, transitionMs),
    animate(incoming, frames.incoming, transitionMs)
  ].filter(Boolean);

  await Promise.allSettled([...frameAnimations, ...outgoingAnimations].map(finished));
  if (!incoming.isConnected || incoming.parentElement !== layer) return [];
  moveChildren(incoming, layer);
  outgoing.remove();
  incoming.remove();
  applySceneStage(stage, scene, toSlide, { constrainAspect: stage !== layer });
  return rendered;
}
