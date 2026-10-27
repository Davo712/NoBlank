import * as THREE from 'three';
import { Actor } from './Actor.js';
import { WEAPONS, GRENADES } from '../combat/weapons.js';

const GRAVITY = 22;
const JUMP = 7.6;
const RUN = 7.3;
const WALK = 0.52;
const ORDER = ['primary', 'secondary', 'melee', 'grenade', 'bomb'];
const KEYS = { Digit1: 'primary', Digit2: 'secondary', Digit3: 'melee', Digit4: 'grenade', Digit5: 'bomb' };

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _look = new THREE.Vector3();
const _up = new THREE.Vector3();
const _side = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export class Player extends Actor {
  constructor(name) {
    super(name, '#7fe9ff');
    this.isPlayer = true;
    this.sensitivity = 1;
    this.inventory = {};
    this.weapon = null;
    this.lastWeapon = null;
    this.nextFire = 0;
    this.queuedShot = -1;
    this.reloading = false;
    this.reloadT = 0;
    this.switchT = 0;
    this.bloom = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.spray = 0;
    this.shake = 0;
    this.ads = false;
    this.zoom = 0;
    this.resumeZoom = 0;
    this.boltUntil = 0;
    this.throwing = null;
    this.swing = null;
    this.planting = false;
    this.walking = false;
    this.stepT = 0;
    this.wasGrounded = true;
    this.fallSpeed = 0;
    this.roll = 0;
  }

  resetTimers() {
    this.nextFire = 0;
    this.queuedShot = -1;
    this.boltUntil = 0;
    this.throwing = null;
    this.swing = null;
    this.planting = false;
    this.reloading = false;
    this.ads = false;
    this.zoom = 0;
    this.resumeZoom = 0;
    this.spray = 0;
    this.bloom = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
  }

  get slots() {
    return Object.keys(this.inventory).sort((a, b) => {
      const d = ORDER.indexOf(WEAPONS[a].slot) - ORDER.indexOf(WEAPONS[b].slot);
      return d || GRENADES.indexOf(a) - GRENADES.indexOf(b);
    });
  }

  owned(slot) {
    return this.slots.filter((id) => WEAPONS[id].slot === slot);
  }

  stock(id) {
    const w = WEAPONS[id];
    if (w.grenade) return { count: 1 };
    if (w.melee || w.bomb) return {};
    return { mag: w.mag, reserve: w.reserve };
  }

  setLoadout(ids, extras = [], melee = 'knife') {
    this.inventory = {};
    for (const id of ids.filter(Boolean)) this.inventory[id] = this.stock(id);
    this.melee = WEAPONS[melee]?.melee ? melee : 'knife';
    this.inventory[this.melee] = {};
    for (const id of extras) this.give(id);
    this.weapon = this.slots[0];
    this.lastWeapon = this.slots[1] || null;
    this.resetTimers();
    this.switchT = 0.35;
  }

  give(id) {
    const w = WEAPONS[id];
    if (w.grenade) {
      const have = this.inventory[id];
      if (have) have.count = Math.min(w.max, have.count + 1);
      else this.inventory[id] = { count: 1 };
      return;
    }
    if (w.slot === 'primary' || w.slot === 'secondary') {
      for (const other of this.owned(w.slot)) if (other !== id) delete this.inventory[other];
    }
    this.inventory[id] = this.stock(id);
  }

  take(id, game) {
    if (!this.inventory[id]) return;
    delete this.inventory[id];
    if (this.weapon === id) this.switchTo(this.best(), game, true);
    if (this.lastWeapon === id) this.lastWeapon = null;
  }

  best() {
    return this.owned('primary')[0] || this.owned('secondary')[0] || this.owned('melee')[0];
  }

  giveWeapon(id, game) {
    const melee = this.melee || 'knife';
    this.inventory = { [id]: this.stock(id), [melee]: {} };
    this.resetTimers();
    this.weapon = id;
    this.lastWeapon = WEAPONS[id].melee ? null : melee;
    this.switchT = 0.35;
    this.nextFire = game.time + 0.35;
    game.viewmodel.show(id);
  }

  get def() {
    return WEAPONS[this.weapon];
  }

  get ammo() {
    const a = this.inventory[this.weapon];
    return a && a.mag !== undefined ? a : null;
  }

  get scoped() {
    return this.zoom > 0;
  }

  spread() {
    const w = this.def;
    if (!w || w.melee || w.grenade || w.bomb) return 0;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    let s = (w.scope && !this.scoped ? w.hipSpread : w.spread) + w.moveSpread * Math.min(1, speed / 6) + this.bloom;
    if (!this.grounded) s += 0.05;
    if (this.crouch > 0.5) s *= 0.75;
    if (this.ads && !w.scope) s *= w.pellets > 1 ? 0.7 : 0.35;
    return s;
  }

  unzoom() {
    this.zoom = 0;
    this.resumeZoom = 0;
    this.ads = false;
  }

  switchTo(id, game, force = false) {
    if (!id || !this.inventory[id] || (id === this.weapon && !force)) return;
    if (this.throwing || this.planting) return;
    if (id !== this.weapon) this.lastWeapon = this.weapon;
    this.weapon = id;
    this.reloading = false;
    this.swing = null;
    this.unzoom();
    const w = WEAPONS[id];
    this.switchT = w.melee ? 0.3 : 0.4;
    this.nextFire = Math.max(this.nextFire, game.time + this.switchT);
    game.viewmodel.show(id);
  }

  cycle(slot, game) {
    const list = this.owned(slot);
    if (!list.length) return;
    const i = list.indexOf(this.weapon);
    this.switchTo(list[(i + 1) % list.length], game);
  }

  startReload(game) {
    const a = this.ammo;
    const w = this.def;
    if (!a || this.reloading || a.mag >= w.mag || a.reserve <= 0 || this.switchT > 0) return;
    this.reloading = true;
    this.reloadT = 0;
    this.unzoom();
    game.viewmodel.startReload(this.weapon, w.reload, w.mag - a.mag);
  }

  update(dt, game) {
    const { input, physics, camera } = game;

    if (!this.alive) {
      this.recoilPitch = 0;
      this.unzoom();
      this.planting = false;
      return;
    }

    this.invulnerable = Math.max(0, this.invulnerable - dt);
    const w = this.def;

    const zoomFov = this.scoped ? w.zoom[this.zoom - 1] : 0;
    const sens = 0.0022 * this.sensitivity * (this.scoped ? zoomFov / 78 : this.ads ? 0.6 : 1);
    this.yaw -= input.dx * sens;
    this.pitch -= input.dy * sens;
    this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch));

    const locked = this.frozen || this.planting;
    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const f = locked ? 0 : (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const s = locked ? 0 : (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    _wish.set(0, 0, 0).addScaledVector(_fwd, f).addScaledVector(_right, s);
    if (_wish.lengthSq() > 0) _wish.normalize();

    const ctrl = input.keyboardLocked;
    const crouchKey = input.down('KeyC') || (ctrl && input.down('ControlLeft'));
    const crouchTarget = crouchKey || this.planting ? 1 : 0;
    this.crouch += (crouchTarget - this.crouch) * Math.min(1, dt * 12);
    this.height = this.standHeight - this.crouch * 0.6;
    this.walking = input.down('ShiftLeft') || input.down('ShiftRight');

    let max = RUN * w.speed;
    if (this.walking) max *= WALK;
    if (this.crouch > 0.5) max = Math.min(max, RUN * 0.36);
    if (this.ads) max = Math.min(max, RUN * 0.62);
    if (this.scoped) max = Math.min(max, RUN * 0.42);

    const accel = this.grounded ? 14 : 2.6;
    const k = Math.min(1, accel * dt);
    this.velocity.x += (_wish.x * max - this.velocity.x) * k;
    this.velocity.z += (_wish.z * max - this.velocity.z) * k;

    if (this.grounded && input.hit('Space') && !locked) {
      this.velocity.y = JUMP;
      this.grounded = false;
    }
    this.velocity.y -= GRAVITY * dt;
    if (!this.grounded) this.fallSpeed = Math.max(this.fallSpeed, -this.velocity.y);

    this.position.addScaledVector(this.velocity, dt);
    physics.resolve(this);
    game.checkPads?.(this);

    if (this.grounded && !this.wasGrounded) {
      game.viewmodel.landed(this.fallSpeed);
      if (this.fallSpeed > 4) game.audio.play(`step${Math.floor(Math.random() * 5)}`, { volume: 0.7, rate: 0.8 });
      this.fallSpeed = 0;
    }
    this.wasGrounded = this.grounded;

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.grounded && speed > 1.5) {
      this.stepT -= dt * (speed / 6.2);
      if (this.stepT <= 0) {
        this.stepT = 0.36;
        if (this.crouch < 0.5 && speed > RUN * 0.6) {
          game.audio.play(`step${Math.floor(Math.random() * 5)}`, { volume: 0.3 });
          game.noise(this.position, 22, this);
        }
      }
    }

    this.updateWeapon(dt, game);

    this.recoilPitch *= Math.max(0, 1 - dt * 8);
    this.recoilYaw *= Math.max(0, 1 - dt * 8);
    this.spray = Math.max(0, this.spray - dt * 3.5);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.roll += (-s * 0.012 - this.roll) * Math.min(1, dt * 8);

    const eyeY = this.position.y + this.eyeHeight();
    const bob = this.grounded ? Math.sin(game.viewmodel.bobPhase * 2) * 0.03 * Math.min(1, speed / 6) : 0;
    camera.position.set(this.position.x, eyeY + bob, this.position.z);
    const sh = this.shake * this.shake;
    _euler.set(
      this.pitch + this.recoilPitch + (Math.random() - 0.5) * sh * 0.04,
      this.yaw + this.recoilYaw + (Math.random() - 0.5) * sh * 0.04,
      this.roll + (Math.random() - 0.5) * sh * 0.03,
    );
    camera.quaternion.setFromEuler(_euler);

    const targetFov = this.ads ? w.view.fov : 78;
    const scoped = this.scoped && !game.viewmodel.busy;
    const want = scoped ? zoomFov : targetFov * game.fovScale;
    camera.fov += (want - camera.fov) * Math.min(1, dt * (scoped ? 30 : 12));
    camera.updateProjectionMatrix();
  }

  updateWeapon(dt, game) {
    const { input } = game;
    this.bloom = Math.max(0, this.bloom - dt * 0.14);
    this.switchT = Math.max(0, this.switchT - dt);

    for (const [code, slot] of Object.entries(KEYS)) {
      if (input.hit(code)) {
        if (slot === 'grenade') this.cycle(slot, game);
        else this.switchTo(this.owned(slot)[0], game);
      }
    }
    if (input.hit('KeyQ')) this.switchTo(this.lastWeapon, game);
    if (input.wheel) {
      const list = this.slots;
      const i = list.indexOf(this.weapon);
      this.switchTo(list[(i + input.wheel + list.length) % list.length], game);
    }
    if (input.hit('KeyR')) this.startReload(game);
    if (input.hit('KeyF') && !this.reloading && !this.scoped) game.viewmodel.inspect();

    const w = this.def;
    const a = this.ammo;
    const trigger = input.mouse(0);
    const pressed = input.mouseHit(0);
    const alt = input.mouseHit(2);
    const ready = this.switchT <= 0 && !this.frozen;

    if (input.hit('KeyG')) {
      game.dropWeapon(this);
      return;
    }
    if (input.hit('KeyE') && !this.planting && game.pickup(this)) return;
    const using = input.down('KeyE') || (w.bomb && trigger);
    this.planting = game.bomb ? game.bomb.use(this, using, dt) : false;

    if (this.throwing) {
      this.updateThrow(dt, game);
      return;
    }

    if (w.melee) {
      this.updateMelee(game, trigger, input.mouse(2), ready);
      return;
    }

    if (w.grenade) {
      if ((pressed || alt) && ready && game.time >= this.nextFire) {
        this.throwing = { t: 0, lob: alt && !pressed, id: this.weapon, released: false };
        game.viewmodel.throwGrenade(this.throwing.lob);
      }
      return;
    }

    if (!a) return;

    if (alt && ready && !this.reloading) {
      if (w.scope) {
        this.zoom = (this.zoom + 1) % (w.zoom.length + 1);
        this.resumeZoom = 0;
        game.audio.play('click', { volume: 0.25, rate: 1.6 });
      } else {
        this.ads = !this.ads;
      }
    }
    if (this.resumeZoom && game.time >= this.boltUntil && !this.reloading) {
      this.zoom = this.resumeZoom;
      this.resumeZoom = 0;
    }

    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadT >= w.reload) {
        const need = w.mag - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        a.reserve -= take;
        this.reloading = false;
      }
    }

    if (pressed) this.queuedShot = game.time;
    const queued = this.queuedShot >= 0 && game.time - this.queuedShot < 0.22;
    const wants = w.auto ? trigger || queued : queued;
    if (!trigger) this.spray = Math.min(this.spray, 0.5);

    if (pressed && this.reloading && w.reloadStyle === 'shells' && a.mag > 0) {
      const loaded = Math.min(a.reserve, Math.floor((this.reloadT / w.reload) * (w.mag - a.mag)));
      a.mag += loaded;
      a.reserve -= loaded;
      this.reloading = false;
      game.viewmodel.cancelAction();
    }

    if (wants && !this.reloading && ready && !this.planting && game.time >= this.nextFire) {
      this.queuedShot = -1;
      if (a.mag <= 0) {
        if (pressed) game.audio.play('empty', { volume: 0.5 });
        this.startReload(game);
        this.nextFire = game.time + 0.25;
      } else {
        this.fire(game);
      }
    }
    if (!trigger && a.mag === 0 && a.reserve > 0 && !this.reloading && game.time > this.nextFire + 0.2) {
      this.startReload(game);
    }
  }

  updateMelee(game, light, heavy, ready) {
    const w = this.def;
    if (this.swing && game.time >= this.swing.at) {
      game.melee(this, this.swing.heavy);
      this.swing = null;
    }
    if (!ready || this.planting || game.time < this.nextFire || this.swing) return;
    if (heavy) {
      this.nextFire = game.time + 60 / w.heavyRpm;
      this.swing = { at: game.time + w.anim.heavyHit, heavy: true };
      game.viewmodel.melee(true);
    } else if (light) {
      this.nextFire = game.time + 60 / w.rpm;
      this.swing = { at: game.time + w.anim.lightHit, heavy: false };
      game.viewmodel.melee(false);
    }
  }

  updateThrow(dt, game) {
    const th = this.throwing;
    th.t += dt;
    if (!th.released && th.t >= 0.27) {
      th.released = true;
      const cam = game.camera;
      cam.updateMatrixWorld();
      const fwd = cam.getWorldDirection(_look);
      const from = _from.copy(cam.position).addScaledVector(fwd, 0.45).add(_up.set(0, -0.08, 0));
      const power = th.lob ? 9.5 : 21;
      _vel.copy(fwd).multiplyScalar(power).add(_up.set(0, th.lob ? 3.2 : 2.6, 0)).addScaledVector(this.velocity, 0.7);
      game.grenades.throw(this, from, _vel, th.id);
      game.audio.play('swoosh', { volume: 0.4, rate: 0.75 });
      game.noise(this.position, 12, this);
      const inv = this.inventory[th.id];
      if (inv) inv.count--;
    }
    if (th.t < 0.62) return;
    this.throwing = null;
    this.nextFire = game.time + 0.1;
    const inv = this.inventory[th.id];
    if (inv && inv.count <= 0) {
      delete this.inventory[th.id];
      const next = this.owned('grenade')[0];
      const back = this.lastWeapon && this.inventory[this.lastWeapon] ? this.lastWeapon : this.best();
      this.switchTo(next || back, game, true);
    } else {
      this.switchTo(th.id, game, true);
    }
  }

  fire(game) {
    const w = this.def;
    const a = this.ammo;
    a.mag--;
    this.nextFire = game.time + 60 / w.rpm;

    const cam = game.camera;
    cam.updateMatrixWorld();
    game.viewmodel.fire(w.id === 'nova' && a.mag > 0);
    const muzzle = game.viewmodel.muzzleWorld(cam, _from);
    if (this.scoped) muzzle.copy(cam.position).addScaledVector(cam.getWorldDirection(_look), 0.3).add(_side.set(0, -0.15, 0));
    const spread = this.spread();

    const origin = cam.getWorldPosition(_origin);
    const fwd = cam.getWorldDirection(_look);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    _side.crossVectors(fwd, _up);

    let hitAny = false;
    let headAny = false;
    for (let i = 0; i < w.pellets; i++) {
      const r = Math.sqrt(Math.random()) * spread;
      const t = Math.random() * Math.PI * 2;
      _dir.copy(fwd).addScaledVector(_side, Math.cos(t) * r).addScaledVector(_up, Math.sin(t) * r).normalize();
      const res = game.shoot(this, origin, _dir, w, muzzle, i === 0 || i % 3 === 0);
      if (res?.actor) {
        hitAny = true;
        headAny ||= res.head;
      }
    }
    if (hitAny) game.hud.hitmarker(headAny);

    const auto = w.auto ? Math.min(1, this.spray / 6) : 0;
    this.spray += 1;
    this.bloom = Math.min(0.06, this.bloom + w.kick * 0.3);
    this.recoilPitch += w.kick * (this.ads ? 0.6 : 1) * (1 + auto * 0.8);
    this.recoilYaw += (Math.random() - 0.5) * w.kick * (0.6 + auto * 1.6);
    this.pitch += w.kick * (0.3 + auto * 0.35);
    game.audio.play(w.sound, { volume: w.volume, rate: w.pitch || 1 });
    game.noise(this.position, 50, this);

    if (w.scope) {
      const bolt = (60 / w.rpm) * 0.85;
      if (this.zoom) this.resumeZoom = this.zoom;
      this.zoom = 0;
      this.boltUntil = game.time + bolt;
      game.viewmodel.startBolt(w.id, bolt);
    }
  }
}
