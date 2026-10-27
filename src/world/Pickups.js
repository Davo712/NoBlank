import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WEAPONS } from '../combat/weapons.js';
import { t } from '../ui/i18n.js';

const HEALTH_RESPAWN = 22;
const AMMO_RESPAWN = 18;

function crossGeometry() {
  return mergeGeometries([new THREE.BoxGeometry(0.62, 0.2, 0.2), new THREE.BoxGeometry(0.2, 0.62, 0.2)]);
}

export class Pickups {
  constructor(scene, assets, spots) {
    this.items = [];
    const ringGeo = new THREE.RingGeometry(0.55, 0.75, 48);
    const cross = crossGeometry();

    for (const p of spots.health) {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(cross, new THREE.MeshStandardMaterial({
        color: 0x3dff8f,
        emissive: 0x2bff7a,
        emissiveIntensity: 1.1,
        roughness: 0.3,
      }));
      mesh.castShadow = true;
      group.add(mesh);
      this.items.push(this.makeItem('health', p, group, 0x3dff8f, ringGeo, scene));
    }

    for (const p of spots.ammo) {
      const group = new THREE.Group();
      const crate = assets.clone('crate-medium');
      crate.scale.setScalar(0.9);
      crate.position.y = -0.2;
      group.add(crate);
      this.items.push(this.makeItem('ammo', p, group, 0xffb347, ringGeo, scene));
    }
  }

  makeItem(type, p, visual, color, ringGeo, scene) {
    const root = new THREE.Group();
    root.position.copy(p);
    visual.position.y = 0.9;
    root.add(visual);

    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2.5),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    root.add(ring);

    scene.add(root);
    return {
      type,
      position: p.clone(),
      root,
      visual,
      ring,
      active: true,
      respawn: 0,
      phase: Math.random() * 6,
    };
  }

  nearestHealth(pos) {
    if (this.enabled === false) return null;
    let best = null;
    let bestD = Infinity;
    for (const it of this.items) {
      if (it.type !== 'health' || !it.active) continue;
      const d = it.position.distanceToSquared(pos);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  dispose() {
    for (const it of this.items) it.root.removeFromParent();
    this.items = [];
  }

  setEnabled(v) {
    this.enabled = v;
    for (const it of this.items) it.root.visible = v;
  }

  reset() {
    for (const it of this.items) this.setActive(it, true);
  }

  setActive(it, v) {
    it.active = v;
    it.visual.visible = v;
    it.ring.material.opacity = v ? 0.85 : 0.15;
  }

  animate(dt) {
    for (const it of this.items) {
      it.phase += dt;
      if (!it.active) continue;
      it.visual.rotation.y += dt * 1.6;
      it.visual.position.y = 0.95 + Math.sin(it.phase * 2.2) * 0.12;
      it.ring.scale.setScalar(1 + Math.sin(it.phase * 3) * 0.06);
    }
  }

  update(dt, game) {
    if (this.enabled === false) return;
    this.animate(dt);
    for (const it of this.items) {
      if (!it.active) {
        it.respawn -= dt;
        if (it.respawn <= 0) {
          this.setActive(it, true);
          game.effects.spawnBeam(it.position, it.type === 'health' ? 0x3dff8f : 0xffb347);
        }
        continue;
      }
      for (const a of game.actors) {
        if (!a.alive) continue;
        const dx = a.position.x - it.position.x;
        const dz = a.position.z - it.position.z;
        if (dx * dx + dz * dz > 1.3 || Math.abs(a.position.y - it.position.y) > 1.5) continue;
        if (this.consume(it, a, game)) break;
      }
    }
  }

  consume(it, actor, game) {
    if (it.type === 'health') {
      if (actor.health >= 100) return false;
      actor.health = Math.min(100, actor.health + 50);
      this.setActive(it, false);
      it.respawn = HEALTH_RESPAWN;
    } else {
      if (!actor.isPlayer) return false;
      let gained = false;
      for (const id of Object.keys(actor.inventory)) {
        const inv = actor.inventory[id];
        const cap = WEAPONS[id].reserve;
        if (inv.reserve === undefined) continue;
        if (inv.reserve < cap) {
          inv.reserve = Math.min(cap, inv.reserve + Math.ceil(cap * 0.5));
          gained = true;
        }
      }
      if (!gained) return false;
      this.setActive(it, false);
      it.respawn = AMMO_RESPAWN;
    }
    if (actor.isPlayer) {
      game.audio.play('pickup', { volume: 0.7 });
      game.hud.toast(t(it.type === 'health' ? 'hp' : 'ammo'));
    }
    return true;
  }
}
