import * as THREE from 'three';

const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();

export class Audio {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);

    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);

    this.buffers = {};
    this.wind = null;
    this.synthesize();
  }

  tone(name, seconds, fn) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    let state = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const out = fn(t, t / seconds, state);
      state = out[1];
      data[i] = out[0];
    }
    this.buffers[name] = buffer;
  }

  synthesize() {
    const noise = () => Math.random() * 2 - 1;
    this.tone('beep', 0.12, (t, k) => [Math.sin(t * 2 * Math.PI * 2650) * Math.min(1, t * 400) * (1 - k) ** 2 * 0.6, 0]);
    this.tone('tick', 0.05, (t, k) => [Math.sin(t * 2 * Math.PI * 1700) * (1 - k) ** 3 * 0.5, 0]);
    this.tone('swoosh', 0.24, (t, k, s) => {
      const a = 0.08 + 0.5 * Math.sin(k * Math.PI);
      const v = s + (noise() - s) * a;
      return [v * Math.sin(k * Math.PI) ** 1.5 * 0.9, v];
    });
    this.tone('hiss', 2.6, (t, k, s) => {
      const v = s + (noise() - s) * 0.35;
      return [v * Math.min(1, t * 12) * (1 - k) ** 1.6 * 0.35, v];
    });
    this.tone('shing', 0.5, (t, k, s) => {
      const v = s + (noise() - s) * 0.9;
      const ring = Math.sin(t * 2 * Math.PI * 3150) * 0.35 + Math.sin(t * 2 * Math.PI * 4720) * 0.22 + Math.sin(t * 2 * Math.PI * 6230) * 0.12;
      const scrape = k < 0.35 ? v * Math.sin((k / 0.35) * Math.PI) * 0.5 : 0;
      return [(scrape + ring * Math.min(1, t * 60) * (1 - k) ** 2.4) * 0.8, v];
    });
    this.tone('cloth', 0.22, (t, k, s) => {
      const v = s + (noise() - s) * 0.12;
      return [v * Math.sin(k * Math.PI) * 1.6, v];
    });
    this.tone('armed', 0.5, (t, k) => [(Math.sin(t * 2 * Math.PI * 880) * (k < 0.45 ? 1 : 0) + Math.sin(t * 2 * Math.PI * 1320) * (k > 0.55 ? 1 : 0)) * 0.35 * Math.min(1, t * 200), 0]);
  }

  async decode(name, data) {
    this.buffers[name] = await this.ctx.decodeAudioData(data);
  }

  unlock() {
    if (this.ctx.state !== 'running') this.ctx.resume();
    if (!this.wind) this.startWind();
  }

  setVolume(v) {
    this.master.gain.value = v;
  }

  updateListener(camera) {
    const l = this.ctx.listener;
    const p = camera.getWorldPosition(_fwd);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(p.x, t);
      l.positionY.setValueAtTime(p.y, t);
      l.positionZ.setValueAtTime(p.z, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
    }
    camera.getWorldDirection(_fwd);
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    if (l.forwardX) {
      l.forwardX.setValueAtTime(_fwd.x, t);
      l.forwardY.setValueAtTime(_fwd.y, t);
      l.forwardZ.setValueAtTime(_fwd.z, t);
      l.upX.setValueAtTime(_up.x, t);
      l.upY.setValueAtTime(_up.y, t);
      l.upZ.setValueAtTime(_up.z, t);
    } else {
      l.setOrientation(_fwd.x, _fwd.y, _fwd.z, _up.x, _up.y, _up.z);
    }
  }

  play(name, { at = null, volume = 1, rate = 1, jitter = 0.06, ref = 6, max = 90 } = {}) {
    const buffer = this.buffers[name];
    if (!buffer || this.ctx.state !== 'running') return;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);

    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);

    if (at) {
      const pan = this.ctx.createPanner();
      pan.panningModel = 'equalpower';
      pan.distanceModel = 'inverse';
      pan.refDistance = ref;
      pan.maxDistance = max;
      pan.rolloffFactor = 1.2;
      if (pan.positionX) {
        pan.positionX.value = at.x;
        pan.positionY.value = at.y;
        pan.positionZ.value = at.z;
      } else {
        pan.setPosition(at.x, at.y, at.z);
      }
      gain.connect(pan);
      pan.connect(this.sfx);
    } else {
      gain.connect(this.sfx);
    }
    src.start();
  }

  startWind() {
    const ctx = this.ctx;
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(filter.frequency);

    const gain = ctx.createGain();
    gain.gain.value = 0.18;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    lfo.start();
    this.wind = gain;
  }
}
