export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.buttons = 0;
    this.clicked = 0;
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.keyboardLocked = false;
    this.onUnlock = null;
    this.onEscape = null;

    addEventListener('keydown', (e) => {
      if (e.target?.tagName === 'INPUT') return;
      if (e.code === 'Tab' || e.code === 'Space' || ((e.ctrlKey || e.metaKey) && this.locked)) e.preventDefault();
      if (e.code === 'Escape' && !e.repeat) this.onEscape?.();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.buttons = 0;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons |= 1 << e.button;
      this.clicked |= 1 << e.button;
    });
    addEventListener('mouseup', (e) => {
      this.buttons &= ~(1 << e.button);
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) this.keyboardLocked = false;
    });

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (was && !this.locked) {
        this.buttons = 0;
        this.keys.clear();
        this.onUnlock?.();
      }
    });
  }

  lock() {
    const plain = () => Promise.resolve(this.canvas.requestPointerLock());
    try {
      const req = this.canvas.requestPointerLock({ unadjustedMovement: true });
      return req?.catch ? req.catch(plain) : Promise.resolve();
    } catch {
      return plain();
    }
  }

  async fullscreen() {
    this.switching = true;
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      if (navigator.keyboard?.lock) {
        await navigator.keyboard.lock();
        this.keyboardLocked = true;
      }
    } catch {
      this.keyboardLocked = false;
    }
    setTimeout(() => {
      this.switching = false;
    }, 300);
  }

  leaveFullscreen() {
    navigator.keyboard?.unlock?.();
    this.keyboardLocked = false;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  hit(code) {
    return this.pressed.has(code);
  }

  mouse(button) {
    return (this.buttons & (1 << button)) !== 0;
  }

  mouseHit(button) {
    return (this.clicked & (1 << button)) !== 0;
  }

  endFrame() {
    this.pressed.clear();
    this.clicked = 0;
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }
}
