import { composeScenePrograms } from './scene-composer.js';
import { MotionTimeline } from './timeline.js';

function normalizeCompilers(compilers) {
  if (!Array.isArray(compilers) || !compilers.length) throw new TypeError('Scene runtime requires compilers.');
  return Object.freeze(compilers.map((compiler, index) => {
    if (typeof compiler !== 'function') throw new TypeError(`Scene compiler at index ${index} is not a function.`);
    return compiler;
  }));
}

export class SceneRuntime {
  constructor({ root, driver, compilers }) {
    this.root = root;
    this.compilers = normalizeCompilers(compilers);
    this.timeline = new MotionTimeline({ root, driver });
    this.scene = null;
    this.context = null;
    this.programs = Object.freeze([]);
    this.plan = null;
  }

  load({ scene, context = {} }) {
    if (!scene || !Array.isArray(scene.nodes)) throw new TypeError('Scene runtime requires a scene graph.');
    this.timeline.destroy();
    this.scene = scene;
    this.context = Object.freeze({ ...context });
    this.programs = Object.freeze(this.compilers
      .map((compiler) => compiler(scene, this.context))
      .filter(Boolean));
    this.plan = composeScenePrograms(scene, this.programs);
    this.timeline.load(this.plan);
    return this.plan;
  }

  play() {
    if (this.plan) this.timeline.play();
  }

  pause() {
    this.timeline.pause();
  }

  replay() {
    if (this.plan) this.timeline.replay();
  }

  seek(milliseconds) {
    return this.timeline.seek(milliseconds);
  }

  currentTime() {
    return this.timeline.currentTime();
  }

  playState() {
    return this.timeline.playState();
  }

  destroy() {
    this.timeline.destroy();
    this.scene = null;
    this.context = null;
    this.programs = Object.freeze([]);
    this.plan = null;
  }
}
