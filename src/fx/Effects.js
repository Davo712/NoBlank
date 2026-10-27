import * as THREE from 'three';

const MAX_PARTICLES = 1400;
const BLOOD_DECALS = 160;

function splatTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const blob = (x, y, r, a) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.7, `rgba(255,255,255,${a * 0.9})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  blob(64, 64, 30, 0.95);
  for (let i = 0; i < 9; i++) blob(64 + Math.cos(i * 2.3) * 22, 64 + Math.sin(i * 2.3) * 20, 10 + (i % 3) * 5, 0.9);
  for (let i = 0; i < 16; i++) {
    const a = i * 0.39 + (i % 2) * 0.2;
    const d = 34 + ((i * 7) % 5) * 5;
    blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2.5 + (i % 4), 0.85);
  }
  for (let i = 0; i < 5; i++) {
    const x = 44 + i * 10;
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(x, 70, 3, 18 + (i % 3) * 12);
    blob(x + 1.5, 90 + (i % 3) * 12, 3.5, 0.85);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const _v = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);

class Sparks {
  constructor(texture, blending) {
    this.count = MAX_PARTICLES;
    this.pos = new Float32Array(this.count * 3);
    this.vel = new Float32Array(this.count * 3);
    this.tint = new Float32Array(this.count * 4);
    this.size = new Float32Array(this.count);
    this.life = new Float32Array(this.count);
    this.maxLife = new Float32Array(this.count);
    this.base = new Float32Array(this.count);
    this.drag = new Float32Array(this.count);
    this.gravity = new Float32Array(this.count);
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, scale: { value: 600 } },
      vertexShader: `
        attribute float size;
        attribute vec4 tint;
        uniform float scale;
        varying vec4 vTint;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
          vTint = tint;
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        varying vec4 vTint;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          float a = t.a * vTint.a;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vTint.rgb * t.rgb, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(p, v, color, size, life, { drag = 2, gravity = 9 } = {}) {
    this.idle = 0;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.tint.set([color.r, color.g, color.b, 1], i * 4);
    this.base[i] = size;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
    this.gravity[i] = gravity;
  }

  update(dt) {
    if (this.idle && this.idle > 1) return;
    let live = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      live++;
      this.life[i] -= dt;
      const k = i * 3;
      if (this.life[i] <= 0) {
        this.tint[i * 4 + 3] = 0;
        this.size[i] = 0;
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= d;
      this.vel[k + 1] = this.vel[k + 1] * d - this.gravity[i] * dt;
      this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.02) {
        this.pos[k + 1] = 0.02;
        this.vel[k + 1] *= -0.35;
      }
      const t = this.life[i] / this.maxLife[i];
      this.tint[i * 4 + 3] = t * t;
      this.size[i] = this.base[i] * (0.4 + 0.6 * t);
    }
    this.idle = live ? 0 : (this.idle || 0) + 1;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.tint.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, assets) {
    this.scene = scene;
    this.fx = assets.fx;

    this.sparks = new Sparks(this.fx.spark_05, THREE.AdditiveBlending);
    this.glow = new Sparks(this.fx.circle_05, THREE.AdditiveBlending);
    this.gore = new Sparks(this.fx.circle_05, THREE.NormalBlending);
    scene.add(this.sparks.points, this.glow.points, this.gore.points);

    this.splats = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: splatTexture(),
        color: 0x6e0a10,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -5,
      }),
      BLOOD_DECALS,
    );
    this.splats.count = 0;
    this.splats.frustumCulled = false;
    this.splats.renderOrder = 2;
    this.splats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.splats);
    this.splatCursor = 0;

    this.bolts = [];
    const boltGeo = new THREE.BoxGeometry(0.028, 0.028, 1).translate(0, 0, 0.5);
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.bolts.push({ mesh: m, from: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, t: 0, speed: 0, len: 0, active: false });
    }

    this.flashes = [];
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.fx.muzzle_02,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }));
      s.visible = false;
      scene.add(s);
      this.flashes.push({ sprite: s, t: 0 });
    }

    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 9, 1.6);
      scene.add(l);
      this.lights.push({ light: l, t: 0, peak: 0 });
    }
    this.lightCursor = 0;

    this.smoke = [];
    for (let i = 0; i < 48; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.fx.smoke_04,
        transparent: true,
        depthWrite: false,
        color: 0xcfc8bf,
      }));
      s.visible = false;
      scene.add(s);
      this.smoke.push({ sprite: s, t: 0, life: 1, vel: new THREE.Vector3(), grow: 1, alpha: 0.4 });
    }
    this.smokeCursor = 0;

    const decalGeo = new THREE.PlaneGeometry(1, 1);
    const decalMat = new THREE.MeshBasicMaterial({
      map: this.fx.scorch_02,
      color: 0x1a1512,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.decals = new THREE.InstancedMesh(decalGeo, decalMat, 120);
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.decals);
    this.decalObj = new THREE.Object3D();
    this.decalCursor = 0;

    this.fireballs = [];
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.fx.flare_01,
        color: 0xffa040,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }));
      s.visible = false;
      scene.add(s);
      this.fireballs.push({ sprite: s, t: 1, life: 1, size: 1, vel: new THREE.Vector3() });
    }
    this.waves = [];
    const waveGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({
        color: 0xffd9a0,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));
      m.visible = false;
      scene.add(m);
      this.waves.push({ mesh: m, t: 1, life: 0.5, size: 1 });
    }
    this.beams = [];
    const beamGeo = new THREE.CylinderGeometry(0.7, 0.9, 1, 24, 1, true).translate(0, 0.5, 0);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
        color: 0x7fe9ff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        map: this.beamTexture(),
      }));
      m.visible = false;
      scene.add(m);
      this.beams.push({ mesh: m, t: 0 });
    }

    this._c = new THREE.Color();
  }

  beamTexture() {
    if (this._beamTex) return this._beamTex;
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    this._beamTex = new THREE.CanvasTexture(c);
    return this._beamTex;
  }

  warm(renderer, scene, camera) {
    const pools = [this.bolts.map((b) => b.mesh), this.flashes.map((f) => f.sprite), this.smoke.map((s) => s.sprite), this.fireballs.map((f) => f.sprite), this.waves.map((w) => w.mesh), this.beams.map((b) => b.mesh)];
    const shown = pools.map((list) => list[0]);
    const prev = shown.map((o) => o.visible);
    shown.forEach((o) => {
      o.visible = true;
    });
    const counts = [this.decals.count, this.splats.count];
    this.decals.count = 1;
    this.splats.count = 1;
    renderer.compile(scene, camera);
    shown.forEach((o, i) => {
      o.visible = prev[i];
    });
    this.decals.count = counts[0];
    this.splats.count = counts[1];
  }

  setScale(height, fov) {
    const s = height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    this.sparks.material.uniforms.scale.value = s;
    this.glow.material.uniforms.scale.value = s;
  }

  bolt(from, to, color, skip = 0, speed = 240) {
    const b = this.bolts.find((x) => !x.active);
    if (!b) return;
    b.active = true;
    b.from.copy(from);
    b.dir.subVectors(to, from);
    b.dist = b.dir.length();
    b.dir.divideScalar(b.dist || 1);
    b.skip = Math.min(skip, b.dist * 0.5);
    b.t = b.skip;
    b.speed = speed;
    b.len = Math.min(1.6, b.dist);
    b.mesh.material.color.set(color).multiplyScalar(3.2);
    b.mesh.quaternion.setFromUnitVectors(_z, b.dir);
    b.mesh.visible = true;
    this.updateBolt(b, 0);
  }

  updateBolt(b, dt) {
    b.t += dt * b.speed;
    const head = Math.min(b.t, b.dist);
    const tail = Math.max(b.skip, b.t - b.len);
    if (tail >= b.dist - 0.01) {
      b.active = false;
      b.mesh.visible = false;
      return;
    }
    b.mesh.position.copy(b.from).addScaledVector(b.dir, tail);
    b.mesh.scale.set(1, 1, Math.max(0.01, head - tail));
  }

  muzzle(pos, color, size = 0.55) {
    const f = this.flashes.find((x) => x.t <= 0) || this.flashes[0];
    f.t = 0.055;
    f.sprite.position.copy(pos);
    f.sprite.scale.setScalar(size * (0.8 + Math.random() * 0.4));
    f.sprite.material.rotation = Math.random() * Math.PI * 2;
    f.sprite.material.color.set(color).lerp(this._c.set(0xffffff), 0.5).multiplyScalar(2);
    f.sprite.visible = true;
    this.flashLight(pos, color, 6);
  }

  flashLight(pos, color, peak) {
    const l = this.lights[this.lightCursor];
    this.lightCursor = (this.lightCursor + 1) % this.lights.length;
    l.light.position.copy(pos);
    l.light.color.set(color);
    l.t = 0.07;
    l.peak = peak;
    l.light.intensity = peak;
  }

  puff(pos, { count = 2, size = 0.6, life = 1.2, rise = 0.6, alpha = 0.35, spread = 0.4, tint = 0xcfc8bf } = {}) {
    for (let i = 0; i < count; i++) {
      const s = this.smoke[this.smokeCursor];
      s.sprite.material.color.set(tint);
      this.smokeCursor = (this.smokeCursor + 1) % this.smoke.length;
      s.t = 0;
      s.life = life * (0.8 + Math.random() * 0.4);
      s.grow = size;
      s.alpha = alpha;
      s.vel.set((Math.random() - 0.5) * spread, rise * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * spread);
      s.sprite.position.copy(pos);
      s.sprite.material.rotation = Math.random() * 6.28;
      s.sprite.scale.setScalar(size * 0.4);
      s.sprite.visible = true;
    }
  }

  decal(point, normal, size = 0.35) {
    const m = this.decalObj;
    const d = this.decals;
    m.position.copy(point).addScaledVector(normal, 0.012);
    m.quaternion.setFromUnitVectors(_z, normal);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(size * (0.8 + Math.random() * 0.5));
    m.updateMatrix();
    d.setMatrixAt(this.decalCursor, m.matrix);
    this.decalCursor = (this.decalCursor + 1) % d.instanceMatrix.count;
    d.count = Math.max(d.count, this.decalCursor === 0 ? d.instanceMatrix.count : this.decalCursor);
    d.instanceMatrix.needsUpdate = true;
  }

  clearDecals() {
    this.decals.count = 0;
    this.decalCursor = 0;
    this.splats.count = 0;
    this.splatCursor = 0;
  }

  splat(point, normal, size = 0.6) {
    const m = this.decalObj;
    const d = this.splats;
    m.position.copy(point).addScaledVector(normal, 0.015 + Math.random() * 0.004);
    m.quaternion.setFromUnitVectors(_z, normal);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(size * (0.75 + Math.random() * 0.5));
    m.updateMatrix();
    d.setMatrixAt(this.splatCursor, m.matrix);
    this.splatCursor = (this.splatCursor + 1) % BLOOD_DECALS;
    d.count = Math.max(d.count, this.splatCursor === 0 ? BLOOD_DECALS : this.splatCursor);
    d.instanceMatrix.needsUpdate = true;
  }

  impact(point, normal, color, { decal = true, scale = 1 } = {}) {
    const c = this._c.set(color).multiplyScalar(3);
    const n = 7 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.6).add(normal).normalize()
        .multiplyScalar(3 + Math.random() * 6 * scale);
      this.sparks.emit(point, _v, c, 0.06 + Math.random() * 0.05, 0.25 + Math.random() * 0.3, { drag: 3, gravity: 14 });
    }
    this.glow.emit(point.clone().addScaledVector(normal, 0.05), _v.set(0, 0, 0), c, 0.5 * scale, 0.12, { drag: 0, gravity: 0 });
    this.puff(point.clone().addScaledVector(normal, 0.1), { count: 1, size: 0.45 * scale, life: 0.4, rise: 0.3, alpha: 0.22 });
    if (decal) this.decal(point, normal);
  }

  blood(point, dir, scale = 1) {
    const dark = this._c.set(0x8a0c12);
    for (let i = 0; i < 16 * scale; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.7, Math.random() - 0.5).multiplyScalar(1.6).addScaledVector(dir, 0.9 + Math.random())
        .multiplyScalar(1.5 + Math.random() * 3.5);
      this.gore.emit(point, _v, dark, 0.05 + Math.random() * 0.07, 0.35 + Math.random() * 0.4, { drag: 1.5, gravity: 14 });
    }
    for (let i = 0; i < 6 * scale; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5).multiplyScalar(1.2).addScaledVector(dir, -0.8)
        .multiplyScalar(1 + Math.random() * 2);
      this.gore.emit(point, _v, dark, 0.04 + Math.random() * 0.04, 0.3 + Math.random() * 0.3, { drag: 2, gravity: 12 });
    }
    this.puff(point, { count: 1, size: 0.5 * scale, life: 0.35, rise: 0.1, alpha: 0.35, spread: 0.3, tint: 0x9a1a1e });
  }

  burst(point, color) {
    const c = this._c.set(color).multiplyScalar(3);
    for (let i = 0; i < 46; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 7);
      this.sparks.emit(point, _v, c, 0.08 + Math.random() * 0.08, 0.5 + Math.random() * 0.6, { drag: 2.2, gravity: 9 });
    }
    for (let i = 0; i < 18; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.6 + 0.2, Math.random() - 0.5).multiplyScalar(3);
      this.glow.emit(point, _v, c, 0.25 + Math.random() * 0.2, 0.4 + Math.random() * 0.4, { drag: 3, gravity: 2 });
    }
    this.flashLight(point, color, 18);
    this.puff(point, { count: 5, size: 1.6, life: 1.6, rise: 0.8, alpha: 0.3, spread: 1.6 });
  }

  fireball(point, size, life, vel, color) {
    const f = this.fireballs.find((x) => x.t >= x.life) || this.fireballs[0];
    f.t = 0;
    f.life = life;
    f.size = size;
    f.vel.copy(vel);
    f.sprite.position.copy(point);
    f.sprite.material.color.set(color).multiplyScalar(2.4);
    f.sprite.material.rotation = Math.random() * 6.28;
    f.sprite.visible = true;
  }

  explosion(point, scale = 1) {
    const hot = this._c.set(0xffb060).multiplyScalar(3);
    const n = Math.round(90 * Math.min(2.2, scale));
    for (let i = 0; i < n; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize().multiplyScalar((5 + Math.random() * 16) * scale);
      this.sparks.emit(point, _v, hot, 0.14 + Math.random() * 0.14, 0.5 + Math.random() * 0.9, { drag: 1.8, gravity: 13 });
    }
    const debris = this._c.set(0x2a2622);
    for (let i = 0; i < 40 * Math.min(2, scale); i++) {
      _v.set(Math.random() - 0.5, Math.random() * 1.2 + 0.3, Math.random() - 0.5).normalize().multiplyScalar((4 + Math.random() * 10) * scale);
      this.gore.emit(point, _v, debris, 0.08 + Math.random() * 0.12, 0.8 + Math.random() * 1.2, { drag: 0.8, gravity: 16 });
    }
    for (let i = 0; i < 30; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.7, Math.random() - 0.5).multiplyScalar(6 * scale);
      this.glow.emit(point, _v, hot, (1.1 + Math.random() * 1.1) * scale, 0.3 + Math.random() * 0.3, { drag: 4, gravity: -2 });
    }
    this.fireball(point, 5.5 * scale, 0.42, _v.set(0, 2, 0), 0xffc070);
    for (let i = 0; i < 5; i++) {
      _v.set(Math.random() - 0.5, 0.6 + Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(3.5 * scale);
      this.fireball(point, (2.4 + Math.random() * 2) * scale, 0.55 + Math.random() * 0.3, _v, i % 2 ? 0xff7a30 : 0xffa040);
    }
    const w = this.waves.find((x) => x.t >= x.life) || this.waves[0];
    w.t = 0;
    w.life = 0.5;
    w.size = 9 * scale;
    w.mesh.position.copy(point).setY(point.y - 0.25);
    w.mesh.visible = true;
    this.flashLight(point, 0xffa040, 60 * scale);
    this.puff(point, { count: Math.round(4 * Math.min(2, scale)), size: 4.5 * scale, life: 2.6, rise: 1.8, alpha: 0.6, spread: 5 * scale, tint: 0x4a4440 });
    this.puff(point, { count: 2, size: 3.4 * scale, life: 1.4, rise: 0.6, alpha: 0.4, spread: 7 * scale, tint: 0xb8aa96 });
    this.decal(point.clone().setY(0.01), _v.set(0, 1, 0), 3.2 * scale);
  }

  spawnBeam(pos, color = 0x7fe9ff) {
    const b = this.beams.find((x) => x.t <= 0) || this.beams[0];
    b.t = 0.9;
    b.mesh.position.copy(pos);
    b.mesh.material.color.set(color).multiplyScalar(1.3);
    b.mesh.visible = true;
    const c = this._c.set(color).multiplyScalar(3);
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = _v.set(Math.cos(a) * 0.8, Math.random() * 2, Math.sin(a) * 0.8).add(pos);
      this.glow.emit(p, new THREE.Vector3(0, 1.5 + Math.random() * 2, 0), c, 0.1, 0.6 + Math.random() * 0.4, { drag: 1, gravity: -1 });
    }
  }

  update(dt) {
    this.sparks.update(dt);
    this.glow.update(dt);
    this.gore.update(dt);

    for (const b of this.bolts) if (b.active) this.updateBolt(b, dt);

    for (const f of this.flashes) {
      if (f.t <= 0) continue;
      f.t -= dt;
      if (f.t <= 0) f.sprite.visible = false;
    }

    for (const l of this.lights) {
      if (l.t <= 0) continue;
      l.t -= dt;
      l.light.intensity = Math.max(0, l.t / 0.07) * l.peak;
    }

    for (const s of this.smoke) {
      if (!s.sprite.visible) continue;
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) {
        s.sprite.visible = false;
        continue;
      }
      s.sprite.position.addScaledVector(s.vel, dt);
      s.vel.multiplyScalar(1 - dt * 1.2);
      s.sprite.scale.setScalar(s.grow * (0.4 + k * 1.2));
      s.sprite.material.opacity = s.alpha * Math.sin(Math.PI * Math.min(1, k * 1.15));
      s.sprite.material.rotation += dt * 0.3;
    }

    for (const f of this.fireballs) {
      if (f.t >= f.life) continue;
      f.t += dt;
      const k = Math.min(1, f.t / f.life);
      f.sprite.position.addScaledVector(f.vel, dt);
      f.vel.multiplyScalar(1 - dt * 2);
      f.sprite.scale.setScalar(f.size * (0.35 + 0.9 * Math.sqrt(k)));
      f.sprite.material.opacity = (1 - k) ** 1.5;
      f.sprite.material.rotation += dt * 0.8;
      if (k >= 1) f.sprite.visible = false;
    }

    for (const w of this.waves) {
      if (w.t >= w.life) continue;
      w.t += dt;
      const k = Math.min(1, w.t / w.life);
      w.mesh.scale.setScalar(0.5 + w.size * (1 - (1 - k) ** 3));
      w.mesh.material.opacity = (1 - k) * 0.85;
      if (k >= 1) w.mesh.visible = false;
    }

    for (const b of this.beams) {
      if (b.t <= 0) continue;
      b.t -= dt;
      const k = Math.max(0, b.t / 0.9);
      b.mesh.material.opacity = k * k;
      b.mesh.scale.set(1 + (1 - k) * 0.6, 3.5 * (0.4 + k * 0.6), 1 + (1 - k) * 0.6);
      if (b.t <= 0) b.mesh.visible = false;
    }
  }
}

