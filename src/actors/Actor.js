import * as THREE from 'three';

const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _p = new THREE.Vector3();
const _ha = new THREE.Vector3();
const _hb = new THREE.Vector3();
const HIT_HEAD = { distance: 0, head: true };
const HIT_BODY = { distance: 0, head: false };

function raySphere(o, d, c, r) {
  _w.subVectors(o, c);
  const b = _w.dot(d);
  const q = _w.lengthSq() - r * r;
  const disc = b * b - q;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : Infinity;
}

function rayCapsule(o, d, a, b, r) {
  _u.subVectors(b, a);
  _w.subVectors(o, a);
  const uu = _u.dot(_u);
  const ud = _u.dot(d);
  const uw = _u.dot(_w);
  const dw = d.dot(_w);
  const den = uu - ud * ud;
  let s = den > 1e-8 ? (uw - ud * dw) / den : 0;
  s = Math.max(0, Math.min(1, s));
  _p.copy(a).addScaledVector(_u, s);
  return raySphere(o, d, _p, r);
}

let nextId = 1;

export class Actor {
  constructor(name, color) {
    this.id = nextId++;
    this.name = name;
    this.color = color;
    this.isPlayer = false;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.radius = 0.38;
    this.height = 1.8;
    this.standHeight = 1.8;
    this.grounded = false;
    this.prevY = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.crouch = 0;

    this.health = 100;
    this.alive = false;
    this.respawnAt = 0;
    this.kills = 0;
    this.deaths = 0;
    this.streak = 0;
    this.lastHurt = 0;
    this.lastAttacker = null;
    this.invulnerable = 0;
    this.team = null;
    this.level = 0;
    this.frozen = false;
    this.spawnedAt = 0;
    this.planting = false;
  }

  eyeHeight() {
    return 1.62 - this.crouch * 0.55;
  }

  eye(out = new THREE.Vector3()) {
    return out.copy(this.position).setY(this.position.y + this.eyeHeight());
  }

  chest(out = new THREE.Vector3()) {
    return out.copy(this.position).setY(this.position.y + 1.15 - this.crouch * 0.4);
  }

  rayHit(origin, dir) {
    if (!this.alive) return null;
    const head = _p.copy(this.position).setY(this.position.y + this.eyeHeight() + 0.04);
    const th = raySphere(origin, dir, head, 0.24);
    _ha.set(this.position.x, this.position.y + 0.25, this.position.z);
    _hb.set(this.position.x, this.position.y + this.eyeHeight() - 0.32, this.position.z);
    const tb = rayCapsule(origin, dir, _ha, _hb, 0.36);
    if (th === Infinity && tb === Infinity) return null;
    const hit = th <= tb ? HIT_HEAD : HIT_BODY;
    hit.distance = Math.min(th, tb);
    return hit;
  }

  spawn(at, yaw) {
    this.position.copy(at);
    this.prevY = at.y;
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = 100;
    this.alive = true;
    this.crouch = 0;
    this.height = this.standHeight;
    this.invulnerable = 1.5;
    this.lastAttacker = null;
  }
}
