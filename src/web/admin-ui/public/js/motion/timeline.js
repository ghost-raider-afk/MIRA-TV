function requireDriver(driver) {
  const methods = ['createTrack', 'createClock', 'play', 'pause', 'cancel', 'seek', 'currentTime', 'playState'];
  for (const method of methods) {
    if (typeof driver?.[method] !== 'function') throw new TypeError(`Motion driver is missing ${method}().`);
  }
  return driver;
}

export class MotionTimeline {
  constructor({ root, driver }) {
    if (root === undefined || root === null) throw new TypeError('Motion timeline requires a render root.');
    this.root = root;
    this.driver = requireDriver(driver);
    this.trackHandles = [];
    this.clockHandle = null;
    this.duration = 0;
    this.plan = null;
  }

  load(plan) {
    this.destroy();
    if (!plan || !Array.isArray(plan.tracks)) throw new TypeError('Motion timeline requires a compiled plan.');
    this.plan = plan;
    this.duration = Number(plan.duration) || 0;
    this.trackHandles = plan.tracks.map((track) => this.driver.createTrack(track));
    this.clockHandle = this.driver.createClock(this.root, plan.clock);
    return this;
  }

  allHandles() {
    return this.clockHandle ? [...this.trackHandles, this.clockHandle] : [...this.trackHandles];
  }

  play() {
    this.allHandles().forEach((handle) => this.driver.play(handle));
  }

  pause() {
    this.allHandles().forEach((handle) => this.driver.pause(handle));
  }

  replay() {
    this.allHandles().forEach((handle) => {
      this.driver.seek(handle, 0);
      this.driver.play(handle);
    });
  }

  seek(milliseconds) {
    const time = Math.max(0, Math.min(this.duration, Number(milliseconds) || 0));
    this.allHandles().forEach((handle) => this.driver.seek(handle, time));
    return time;
  }

  currentTime() {
    return this.driver.currentTime(this.clockHandle);
  }

  playState() {
    return this.driver.playState(this.clockHandle);
  }

  destroy() {
    this.allHandles().forEach((handle) => this.driver.cancel(handle));
    this.trackHandles = [];
    this.clockHandle = null;
    this.duration = 0;
    this.plan = null;
  }
}
