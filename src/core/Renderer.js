import * as THREE from 'three';

const PRESETS = {
  low: { ratio: 1, shadows: 'none', soft: false, fast: true, shadowSize: 1024 },
  medium: { ratio: 1.25, shadows: 'static', soft: false, fast: true, shadowSize: 4096 },
  high: { ratio: 1.5, shadows: 'dynamic', soft: true, fast: false, shadowSize: 2048 },
};

export class Renderer {
  constructor(container, quality = 'medium') {
    this.gl = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.gl.shadowMap.enabled = true;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.gl.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.05, 600);
    this.scene.add(this.camera);

    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(58, 1, 0.01, 20);

    this.quality = null;
    this.preset = PRESETS.medium;
    this.scale = 1;
    this.frameAvg = 0;
    this.refresh = 1 / 60;
    this.adaptT = 0;
    this.frame = 0;
    this.setQuality(quality);
    addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    if (this.quality === q) return;
    this.quality = q;
    this.preset = PRESETS[q] || PRESETS.medium;
    this.gl.shadowMap.type = this.preset.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.gl.shadowMap.enabled = this.preset.shadows !== 'none';
    this.struggle = 0;
    this.scale = 1;
    this.applyRatio();
  }

  get shadowsEnabled() {
    return this.preset.shadows !== 'none';
  }

  get minScale() {
    return Math.max(0.6, 0.85 / Math.min(devicePixelRatio, this.preset.ratio));
  }

  get dynamicShadows() {
    return this.preset.shadows === 'dynamic';
  }

  get fast() {
    return this.preset.fast;
  }

  get shadowSize() {
    return this.preset.shadowSize;
  }

  applyRatio() {
    this.gl.setPixelRatio(Math.min(devicePixelRatio, this.preset.ratio) * this.scale);
    this.resize();
  }

  measureRefresh() {
    return new Promise((resolve) => {
      const samples = [];
      let last = performance.now();
      const tick = (now) => {
        samples.push((now - last) / 1000);
        last = now;
        if (samples.length < 50) {
          requestAnimationFrame(tick);
          return;
        }
        samples.sort((x, y) => x - y);
        this.refresh = Math.max(1 / 360, samples[Math.floor(samples.length * 0.3)]);
        resolve(this.refresh);
      };
      requestAnimationFrame(tick);
    });
  }

  adapt(dt) {
    this.frameAvg = this.frameAvg ? this.frameAvg * 0.92 + dt * 0.08 : dt;
    this.adaptT += dt;
    if (this.adaptT < 1) return false;
    this.adaptT = 0;
    const target = this.refresh;
    let next = this.scale;
    const slow = this.frameAvg > target * 1.25;
    if (slow) next = Math.max(this.minScale, this.scale - (this.frameAvg > target * 1.8 ? 0.12 : 0.06));
    else if (this.frameAvg < target * 1.05) next = Math.min(1, this.scale + 0.04);
    if (Math.abs(next - this.scale) > 0.001) {
      this.scale = next;
      this.applyRatio();
    }
    this.struggle = slow && this.scale <= this.minScale ? this.struggle + 1 : 0;
    if (this.struggle >= 4) {
      this.struggle = 0;
      return true;
    }
    return false;
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.gl.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.updateProjectionMatrix();
  }

  render(sun) {
    const gl = this.gl;
    this.frame++;
    if (sun && this.dynamicShadows && this.frame % 3 === 0) sun.shadow.needsUpdate = true;
    gl.render(this.scene, this.camera);
    gl.autoClear = false;
    gl.clearDepth();
    gl.render(this.viewScene, this.viewCamera);
    gl.autoClear = true;
  }
}
