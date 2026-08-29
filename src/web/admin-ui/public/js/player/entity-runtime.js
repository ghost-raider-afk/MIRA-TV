import { buildDomMotionScene } from '../motion/dom-scene-adapter.js';
import { WaapiMotionDriver } from '../motion/drivers/waapi-driver.js';
import { compileEntityBehaviorProgram } from '../motion/entity-behavior.js';
import { SceneRuntime } from '../motion/scene-runtime.js';

const stage = document.querySelector('[data-player-stage]');
let runtime = null;
let target = null;
let scheduled = null;

function destroyRuntime() {
  runtime?.destroy();
  runtime = null;
  target = null;
}

function bindEntityRuntime() {
  scheduled = null;
  if (!(stage instanceof Element)) return;
  const nextTarget = stage.querySelector('[data-entity-motion="beer-glass"]');
  if (!(nextTarget instanceof Element)) {
    destroyRuntime();
    return;
  }
  if (nextTarget === target && runtime) return;

  destroyRuntime();
  const scene = buildDomMotionScene(stage);
  runtime = new SceneRuntime({
    root: stage,
    driver: new WaapiMotionDriver(),
    compilers: [compileEntityBehaviorProgram]
  });
  runtime.load({ scene, context: { entity: { visible: true, id: 'beer-glass' } } });
  target = nextTarget;

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) runtime.pause();
  else runtime.play();
}

function scheduleBind() {
  if (scheduled !== null) cancelAnimationFrame(scheduled);
  scheduled = requestAnimationFrame(bindEntityRuntime);
}

if (stage instanceof Element) {
  new MutationObserver(scheduleBind).observe(stage, { childList: true, subtree: true });
  scheduleBind();
}

window.addEventListener('pagehide', destroyRuntime, { once: true });
