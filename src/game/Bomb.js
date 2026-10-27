import * as THREE from 'three';
import { buildGun } from '../combat/guns.js';
import { WEAPONS } from '../combat/weapons.js';
import { t } from '../ui/i18n.js';

export const PLANT_TIME = 3.2;
export const DEFUSE_TIME = 6;
export const FUSE = 40;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Bomb {
  constructor(game) {
    this.game = game;
    this.mesh = buildGun('c4').root;
    this.mesh.scale.setScalar(1.7);
    this.mesh.visible = false;
    this.light = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xff3b30,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    this.light.scale.setScalar(0.5);
    this.light.position.set(-0.03, 0.06, -0.015);
    this.mesh.add(this.light);
    game.renderer.scene.add(this.mesh);
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.carrier = null;
    this.position = new THREE.Vector3();
    this.site = null;
    this.timer = 0;
    this.progress = 0;
    this.user = null;
    this.beepT = 0;
    this.tickT = 0;
    this.mesh.visible = false;
  }

  get planted() {
    return this.state === 'planted';
  }

  get sites() {
    return this.game.arena.sites;
  }

  siteAt(p) {
    for (const [id, s] of Object.entries(this.sites)) {
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      if (dx * dx + dz * dz < s.r * s.r && p.y < 2) return id;
    }
    return null;
  }

  give(actor) {
    this.state = 'carried';
    this.carrier = actor;
    actor.hasBomb = true;
    this.mesh.visible = false;
    if (actor.isPlayer) {
      actor.give('c4');
      this.game.hud.toast(t('bombCarrier'));
    }
  }

  drop(actor, toward) {
    if (this.carrier !== actor || this.state !== 'carried') return;
    actor.hasBomb = false;
    if (actor.isPlayer) actor.take('c4', this.game);
    this.carrier = null;
    this.state = 'dropped';
    this.droppedBy = actor;
    this.droppedAt = this.game.time;
    const x = actor.position.x + (toward ? toward.x * 1.6 : 0);
    const z = actor.position.z + (toward ? toward.z * 1.6 : 0);
    const free = this.game.nav.nearestFree(x, z);
    const g = this.game.physics.groundHeight(free.x, free.z, 0.2);
    this.position.set(free.x, g, free.z);
    this.place();
    this.light.visible = false;
  }

  place() {
    this.mesh.position.copy(this.position).setY(this.position.y + 0.05);
    this.mesh.rotation.set(0, Math.random() * 6.28, 0);
    this.mesh.visible = true;
  }

  use(actor, holding, dt) {
    const game = this.game;
    if (!actor.alive || game.roundOver || actor.frozen) holding = false;
    const role = game.roleOf(actor);
    let busy = false;
    if (role === 'attack' && this.state === 'carried' && this.carrier === actor) {
      busy = holding && actor.grounded && !!this.siteAt(actor.position);
      if (busy) this.advance(actor, dt, PLANT_TIME, () => this.plant(actor));
    } else if (role === 'defend' && this.planted) {
      const near = actor.position.distanceTo(this.position) < 1.7;
      busy = holding && near;
      if (busy) this.advance(actor, dt, DEFUSE_TIME, () => this.defuse(actor));
    }
    if (!busy && this.user === actor) {
      this.user = null;
      this.progress = 0;
    }
    actor.planting = busy;
    return busy;
  }

  advance(actor, dt, total, done) {
    if (this.user && this.user !== actor && this.user.alive && this.user.planting) return;
    if (this.user !== actor) {
      this.user = actor;
      this.progress = 0;
      this.tickT = 0;
      if (!actor.isPlayer) this.game.radio(actor, this.planted ? 'defusing' : 'planting');
      if (this.planted) this.game.audio.play('tick', { at: this.position, volume: 0.7, rate: 0.7 });
    }
    this.total = total;
    this.progress += dt;
    this.tickT -= dt;
    if (this.tickT <= 0 && !this.planted) {
      this.tickT = 0.42;
      this.game.audio.play('tick', { at: actor.isPlayer ? null : actor.position, volume: 0.6, rate: 0.9 + Math.random() * 0.3 });
    }
    if (this.progress >= total) {
      this.user = null;
      this.progress = 0;
      actor.planting = false;
      done();
    }
  }

  plant(actor) {
    const game = this.game;
    this.site = this.siteAt(actor.position);
    this.position.copy(actor.position);
    this.position.y = game.physics.groundHeight(actor.position.x, actor.position.z, 0.2);
    actor.hasBomb = false;
    if (actor.isPlayer) actor.take('c4', game);
    this.carrier = null;
    this.state = 'planted';
    this.timer = FUSE;
    this.beepT = 0;
    this.place();
    this.light.visible = true;
    game.audio.play('armed', { at: this.position, volume: 0.9, jitter: 0 });
    game.onPlanted(actor, this.site);
  }

  defuse(actor) {
    this.state = 'defused';
    this.light.visible = false;
    this.game.audio.play('armed', { at: this.position, volume: 0.9, rate: 0.7, jitter: 0 });
    this.game.onDefused(actor);
  }

  update(dt) {
    const game = this.game;
    if (this.state === 'dropped') {
      for (const a of game.actors) {
        if (!a.alive || game.roleOf(a) !== 'attack') continue;
        if (a === this.droppedBy && game.time - this.droppedAt < 2) continue;
        if (a.position.distanceToSquared(this.position) < 1.3) {
          this.give(a);
          game.audio.play('pickup', { at: a.isPlayer ? null : a.position, volume: 0.6 });
          break;
        }
      }
      this.mesh.rotation.y += dt * 0.6;
    }
    if (this.state !== 'planted') return;
    this.timer -= dt;
    const k = Math.max(0, this.timer / FUSE);
    const interval = 0.12 + 0.88 * k * k;
    this.beepT -= dt;
    if (this.beepT <= 0) {
      this.beepT = interval;
      game.audio.play('beep', { at: this.position, volume: 0.75, ref: 5, jitter: 0, rate: this.timer < 2 ? 1.15 : 1 });
    }
    const blink = this.beepT > interval - 0.08;
    this.light.material.opacity = blink ? 1 : 0.15;
    this.light.scale.setScalar(blink ? 0.6 : 0.4);
    if (this.timer <= 0) {
      this.state = 'exploded';
      this.mesh.visible = false;
      game.explode(this.position.clone().setY(this.position.y + 0.4), null, WEAPONS.c4, 3.2);
      game.onExploded();
    }
  }
}
