import * as THREE from 'three';
import { buildGun } from '../combat/guns.js';
import { WEAPONS } from '../combat/weapons.js';
import { setFastShading } from '../core/shading.js';

const LIMIT = 12;
const LIFE = 45;
const RANK = { glock: 1, deagle: 2, mp5: 3, nova: 3, scout: 4, m4a1: 5, ak47: 5, awp: 4 };
const _v = new THREE.Vector3();

export class Drops {
  constructor(game) {
    this.game = game;
    this.items = [];
  }

  clear() {
    for (const it of this.items) this.remove(it, false);
    this.items = [];
  }

  remove(it, splice = true) {
    this.game.renderer.scene.remove(it.mesh);
    it.mesh.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    if (splice) this.items.splice(this.items.indexOf(it), 1);
  }

  spawn(id, at, ammo, toss) {
    const w = WEAPONS[id];
    if (!w || w.melee || w.grenade || w.bomb) return null;
    if (this.items.length >= LIMIT) this.remove(this.items[0]);
    const mesh = buildGun(id).root;
    mesh.scale.setScalar(1.15);
    setFastShading(mesh, this.game.renderer.fast);
    mesh.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
    const it = {
      id,
      mesh,
      ammo: ammo ? { mag: ammo.mag, reserve: ammo.reserve } : { mag: w.mag, reserve: Math.ceil(w.reserve / 2) },
      position: at.clone(),
      vel: toss ? toss.clone() : new THREE.Vector3((Math.random() - 0.5) * 1.5, 2.5, (Math.random() - 0.5) * 1.5),
      t: 0,
      spin: (Math.random() - 0.5) * 8,
      rest: false,
    };
    mesh.position.copy(it.position);
    mesh.rotation.set(0, Math.random() * 6.28, 0);
    this.game.renderer.scene.add(mesh);
    this.items.push(it);
    return it;
  }

  nearest(actor, range = 1.7) {
    let best = null;
    let bestD = range * range;
    for (const it of this.items) {
      if (it.t < 0.4) continue;
      const d = it.position.distanceToSquared(actor.position.clone().setY(it.position.y));
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  better(bot, it) {
    return (RANK[it.id] || 0) > (RANK[bot.weapon] || 0);
  }

  update(dt) {
    const game = this.game;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (!it.rest) {
        it.vel.y -= 18 * dt;
        it.position.addScaledVector(it.vel, dt);
        const floor = game.physics.groundHeight(it.position.x, it.position.z, 0.15) + 0.04;
        if (it.position.y <= floor) {
          it.position.y = floor;
          if (Math.abs(it.vel.y) < 2) {
            it.rest = true;
            it.mesh.rotation.x = 0;
            it.mesh.rotation.z = Math.PI / 2;
          } else {
            it.vel.y *= -0.3;
            it.vel.x *= 0.5;
            it.vel.z *= 0.5;
            game.audio.play('bounce', { at: it.position, volume: 0.35, rate: 0.7 });
          }
        }
        it.mesh.rotation.x += it.spin * dt;
        it.mesh.position.copy(it.position);
      }
      if (it.t > LIFE && game.mode.respawn) {
        this.remove(it);
        continue;
      }
      if (it.t < 1 || game.mode.arms) continue;
      for (const b of game.bots) {
        if (!b.alive || b.frozen) continue;
        if (b.position.distanceToSquared(_v.copy(it.position).setY(b.position.y)) > 1.4) continue;
        if (!this.better(b, it)) continue;
        const old = b.weapon;
        b.equip(it.id);
        b.mag = it.ammo.mag || WEAPONS[it.id].mag;
        game.audio.play('pickup', { at: b.position, volume: 0.4 });
        this.remove(it);
        this.spawn(old, b.position.clone().setY(b.position.y + 1), null);
        break;
      }
    }
  }
}
