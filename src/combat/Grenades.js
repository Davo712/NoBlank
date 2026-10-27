import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { buildGun } from './guns.js';
import { setFastShading } from '../core/shading.js';

const GRAVITY = 17;
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Vector3();

const PUFFS = 16;

export class Grenades {
  constructor(scene, assets) {
    this.scene = scene;
    this.flying = [];
    this.clouds = [];
    this.templates = {};
    for (const id of ['he', 'smoke']) {
      const g = buildGun(id).root;
      g.scale.setScalar(1.25);
      this.templates[id] = g;
    }
    this.smokeMat = new THREE.SpriteMaterial({
      map: assets.fx.smoke_04,
      color: 0xc9ced4,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.pool = [];
  }

  throw(owner, from, velocity, id) {
    const mesh = this.templates[id].clone();
    setFastShading(mesh, this.fast);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.flying.push({
      id,
      def: WEAPONS[id],
      owner,
      mesh,
      pos: mesh.position,
      vel: velocity.clone(),
      t: 0,
      still: 0,
      bounces: 0,
      spin: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 6, Math.random() * 8 - 4),
    });
  }

  clear() {
    for (const g of this.flying) this.scene.remove(g.mesh);
    for (const c of this.clouds) for (const s of c.puffs) this.release(s);
    this.flying = [];
    this.clouds = [];
  }

  sprite() {
    const s = this.pool.pop() || new THREE.Sprite(this.smokeMat.clone());
    s.visible = true;
    this.scene.add(s);
    return s;
  }

  release(s) {
    s.visible = false;
    this.scene.remove(s);
    this.pool.push(s);
  }

  step(g, dt, physics, game) {
    const speed = g.vel.length();
    if (speed > 0.01) {
      _d.copy(g.vel).divideScalar(speed);
      const hit = physics.raycast(g.pos, _d, speed * dt + 0.06);
      if (hit) {
        _n.copy(hit.normal);
        g.pos.copy(hit.point).addScaledVector(_n, 0.065);
        const vn = g.vel.dot(_n);
        g.vel.addScaledVector(_n, -vn * 1.45);
        _w.copy(_n).multiplyScalar(g.vel.dot(_n));
        g.vel.sub(_w).multiplyScalar(0.72).add(_w);
        g.spin.multiplyScalar(0.6);
        if (Math.abs(vn) > 2.2) {
          g.bounces++;
          game.audio.play('bounce', { at: g.pos, volume: Math.min(0.6, Math.abs(vn) * 0.08), rate: g.id === 'smoke' ? 0.8 : 1.15, ref: 4 });
        }
        if (_n.y > 0.7 && Math.abs(g.vel.y) < 1.2) {
          g.vel.y = 0;
          g.vel.x *= Math.max(0, 1 - dt * 4);
          g.vel.z *= Math.max(0, 1 - dt * 4);
          g.still += dt;
          return;
        }
        return;
      }
    }
    g.pos.addScaledVector(g.vel, dt);
    g.vel.y -= GRAVITY * dt;
  }

  update(dt, game) {
    const { physics } = game;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const g = this.flying[i];
      g.t += dt;
      const sub = Math.max(1, Math.ceil((g.vel.length() * dt) / 0.3));
      for (let k = 0; k < sub; k++) this.step(g, dt / sub, physics, game);
      g.mesh.rotation.x += g.spin.x * dt;
      g.mesh.rotation.y += g.spin.y * dt;
      g.mesh.rotation.z += g.spin.z * dt;
      const settled = g.still > 0.25 && g.vel.lengthSq() < 0.3;
      const ready = g.id === 'he' ? g.t >= g.def.fuse : g.t >= g.def.fuse && (settled || g.t > 3.5);
      if (!ready) continue;
      this.scene.remove(g.mesh);
      this.flying.splice(i, 1);
      if (g.id === 'he') game.explode(g.pos.clone().setY(Math.max(g.pos.y, 0.15)), g.owner, g.def);
      else this.deploy(g.pos.clone(), g.def, game);
    }

    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.t += dt;
      const grow = Math.min(1, c.t / 0.8);
      const ease = 1 - (1 - grow) * (1 - grow);
      const left = c.duration - c.t;
      const fade = Math.min(1, Math.max(0, left / 2.5));
      c.radius = c.max * (0.35 + 0.65 * ease) * (0.75 + 0.25 * fade);
      c.density = fade;
      for (const s of c.puffs) {
        const o = s.userData;
        s.position.copy(c.center).addScaledVector(o.dir, o.dist * c.radius);
        s.position.y = Math.max(0.7, s.position.y) + Math.sin(c.t * 0.4 + o.phase) * 0.14 + Math.min(0.5, c.t * 0.02);
        s.scale.setScalar(o.size * (0.5 + 0.5 * ease));
        s.material.opacity = 0.95 * fade * Math.min(1, c.t * 4);
        s.material.rotation += dt * o.spin;
      }
      if (left <= 0) {
        for (const s of c.puffs) this.release(s);
        this.clouds.splice(i, 1);
      }
    }
  }

  deploy(at, def, game) {
    at.y = Math.max(at.y, 0.1);
    const c = { center: at.clone().setY(at.y + 1.3), max: def.radius, radius: 0.5, t: 0, duration: def.duration, density: 1, puffs: [] };
    for (let i = 0; i < PUFFS; i++) {
      const s = this.sprite();
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      s.userData = {
        dir: new THREE.Vector3(Math.cos(a) * r, u * 0.55, Math.sin(a) * r),
        dist: 0.25 + Math.random() * 0.62,
        size: 5 + Math.random() * 2.6,
        spin: (Math.random() - 0.5) * 0.3,
        phase: Math.random() * 6,
      };
      s.material.rotation = Math.random() * 6.28;
      s.material.opacity = 0;
      c.puffs.push(s);
    }
    this.clouds.push(c);
    game.audio.play('smoke', { at, volume: 0.9, rate: 0.55, ref: 5 });
    game.audio.play('hiss', { at, volume: 0.5, ref: 5 });
    game.effects.puff(at, { count: 6, size: 2.4, life: 1.6, rise: 1.4, alpha: 0.5, spread: 3 });
  }

  blocks(a, b) {
    if (!this.clouds.length) return false;
    _d.subVectors(b, a);
    const len2 = _d.lengthSq();
    for (const c of this.clouds) {
      if (c.density < 0.35) continue;
      const t = len2 > 1e-6 ? Math.max(0, Math.min(1, _c.subVectors(c.center, a).dot(_d) / len2)) : 0;
      _c.copy(a).addScaledVector(_d, t);
      const r = c.radius * 0.88;
      const dy = (_c.y - c.center.y) * 0.75;
      const dx = _c.x - c.center.x;
      const dz = _c.z - c.center.z;
      if (dx * dx + dy * dy + dz * dz < r * r) return true;
    }
    return false;
  }

  inside(p) {
    let best = 0;
    for (const c of this.clouds) {
      const dx = p.x - c.center.x;
      const dy = (p.y - c.center.y) * 0.75;
      const dz = p.z - c.center.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      best = Math.max(best, Math.min(1, (c.radius - d) / 1.4 + 0.2) * c.density);
    }
    return Math.max(0, best);
  }
}
