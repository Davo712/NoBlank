import * as THREE from 'three';
import { Actor } from './Actor.js';
import { WEAPONS } from '../combat/weapons.js';

const GRAVITY_THROW = 17;

const GRAVITY = 22;

export const SKILLS = {
  easy: { reaction: 0.75, turn: 3.4, error: 0.08, damage: 0.45, cone: 0.14, burst: [2, 4], pause: [0.55, 1], fov: 0.35, vision: 45, speed: 5.2 },
  normal: { reaction: 0.42, turn: 5.6, error: 0.048, damage: 0.65, cone: 0.1, burst: [3, 6], pause: [0.3, 0.6], fov: 0.2, vision: 65, speed: 5.9 },
  hard: { reaction: 0.24, turn: 8.5, error: 0.026, damage: 0.85, cone: 0.07, burst: [4, 9], pause: [0.18, 0.4], fov: 0.05, vision: 80, speed: 6.5 },
};

export const STYLES = {
  rusher: { speed: 1.1, range: 0.55, jump: 0.28, strafe: 0.7, hold: [1, 3], crouch: 0, chase: 9, nades: 1, quiet: false, retreat: false },
  rifler: { speed: 1, range: 1, jump: 0.12, strafe: 1, hold: [3, 6], crouch: 0.25, chase: 6, nades: 1, quiet: false, retreat: false },
  anchor: { speed: 0.92, range: 1.35, jump: 0.03, strafe: 1.6, hold: [8, 14], crouch: 0.6, chase: 3, nades: 1, quiet: true, retreat: false },
  lurker: { speed: 0.96, range: 1.1, jump: 0.06, strafe: 1.2, hold: [5, 9], crouch: 0.35, chase: 5, nades: 1, quiet: true, retreat: true },
  support: { speed: 1, range: 1.15, jump: 0.1, strafe: 1.1, hold: [3, 7], crouch: 0.3, chase: 5, nades: 2, quiet: false, retreat: false },
};

const _to = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _move = new THREE.Vector3();
const _probe = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

const rand = (a, b) => a + Math.random() * (b - a);

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Bot extends Actor {
  constructor(name, color, avatar, skill) {
    super(name, color);
    this.avatar = avatar;
    this.skill = skill;

    this.state = 'roam';
    this.path = [];
    this.goal = new THREE.Vector3();
    this.target = null;
    this.lastSeen = new THREE.Vector3();
    this.lastSeenAt = -99;
    this.seenSince = 0;
    this.visible = false;

    this.weapon = null;
    this.mag = 0;
    this.reloadT = 0;
    this.nextFire = 0;
    this.burst = 0;

    this.errorOffset = new THREE.Vector3();
    this.errorT = 0;
    this.tracking = 0;

    this.strafe = 1;
    this.strafeT = 0;
    this.senseT = Math.random() * 0.2;
    this.repathT = 0;
    this.stuckT = 0;
    this.lookT = 0;
    this.lookYaw = 0;
    this.stepT = 0;
    this.preferRange = rand(9, 20);
    this.grenades = { he: 0, smoke: 0 };
    this.nadeT = rand(2, 5);
    this.holdT = 0;
    this.spot = null;
    this.swingAt = 0;
    this.plan = null;
    this.via = null;
    this.direct = null;
    this.duck = 0;
    this.duckT = 0;
    this.passT = 0;
    this.heardAt = -9;
    this.setStyle('rifler');
  }

  setStyle(name) {
    this.styleName = name;
    this.style = STYLES[name] || STYLES.rifler;
  }

  onBombPlanted(game) {
    this.spot = null;
    if (game.roleOf(this) === 'defend') this.plan = null;
    this.holdT = 0;
    if (this.state === 'roam' || this.state === 'hunt') this.setState('roam', game);
  }

  spawn(at, yaw) {
    super.spawn(at, yaw);
    this.avatar.revive();
    this.avatar.setVisible(true);
    this.state = 'roam';
    this.path = [];
    this.target = null;
    this.mag = this.def.mag || 0;
    this.reloadT = 0;
    this.tracking = 0;
    this.lastSeenAt = -99;
    this.spot = null;
    this.holdT = 0;
    this.plan = null;
    this.via = null;
    this.direct = null;
    this.duck = 0;
    this.nadeT = rand(2, 5) / this.style.nades;
    this.passT = rand(1, 3);
  }

  get def() {
    return WEAPONS[this.weapon];
  }

  equip(id) {
    this.weapon = id;
    this.mag = WEAPONS[id].mag || 0;
    this.reloadT = 0;
    this.avatar.setWeapon(id);
    const w = WEAPONS[id];
    const k = this.style?.range ?? 1;
    this.preferRange = w.melee ? 0.8 : w.scope ? rand(22, 34) : w.pellets > 1 ? rand(4, 8) : rand(9, 20) * k;
  }

  forward(out) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  onDamaged(attacker, game) {
    if (!attacker || attacker === this || game.allies(this, attacker)) return;
    if (!this.target || !this.visible || attacker === this.target) {
      this.target = attacker;
      this.lastSeen.copy(attacker.position);
      this.lastSeenAt = game.time;
      if (this.state !== 'fight') this.setState('hunt', game);
    }
  }

  hear(pos, source, game) {
    if (this.state === 'fight' || source === this || !source || game.allies(this, source)) return;
    if (this.state === 'retreat') return;
    if (game.mode.bomb && (game.bomb.carrier === this || this.planting)) return;
    if (game.mode.bomb && this.styleName === 'anchor' && this.position.distanceTo(pos) > 18) return;
    if (this.state === 'hunt' && game.time - this.heardAt < 1.2) {
      this.lastSeen.copy(pos);
      return;
    }
    this.heardAt = game.time;
    this.lastSeen.copy(pos).add(_probe.set(rand(-3, 3), 0, rand(-3, 3)));
    this.target = source;
    this.lastSeenAt = game.time - 1;
    this.setState('hunt', game);
  }

  setState(state, game) {
    this.state = state;
    this.repathT = 0;
    if (state === 'hunt') this.goTo(this.lastSeen, game);
    if (state === 'roam') this.pickRoam(game);
  }

  goTo(point, game) {
    this.goal.copy(point);
    this.path = game.nav.findPath(this.position, point) || [];
  }

  objective(game) {
    const role = game.roleOf(this);
    const bomb = game.bomb;
    if (!role) return null;
    if (role === 'attack') {
      if (bomb.state === 'dropped' && game.bombRunner(this)) return bomb.position;
      if (bomb.planted) return this.near(bomb.position, this.styleName === 'anchor' ? 5 : 11, game);
      const plan = game.attackPlanFor();
      const s = game.arena.sites[plan.site];
      if (this.via === null) this.via = this.routeVia(s, game);
      if (this.via && this.position.distanceTo(this.via) < 3) this.via = false;
      if (this.via) return this.via;
      if (bomb.carrier === this) return this.spot || (this.spot = game.nav.nearestFree(s.x + rand(-1.5, 1.5), s.z + rand(-1.5, 1.5)));
      return this.near(s, this.styleName === 'rusher' ? 4 : 8, game);
    }
    if (bomb.planted) {
      if (!game.bombKnown && this.position.distanceTo(bomb.position) < 14) game.bombKnown = true;
      if (game.bombKnown) return bomb.position;
      if (!this.plan || this.plan === 'mid') this.plan = game.defendPlanFor(this) === 'B' ? 'B' : 'A';
      const site = game.arena.sites[this.plan];
      if (Math.hypot(this.position.x - site.x, this.position.z - site.z) < 5) {
        this.plan = this.plan === 'A' ? 'B' : 'A';
        this.spot = null;
      }
      return this.near(game.arena.sites[this.plan], 3, game);
    }
    if (!this.plan) this.plan = game.defendPlanFor(this);
    if (this.plan === 'mid') return this.near(game.arena.midPoint || { x: 0, z: 0 }, 10, game);
    return this.near(game.arena.sites[this.plan], this.styleName === 'anchor' ? 4 : 8, game);
  }

  routeVia(site, game) {
    const kind = game.attackPlan?.kind;
    if (kind === 'rush' || (kind !== 'split' && (this.styleName === 'rusher' || Math.random() < 0.3))) return false;
    const dx = site.x - this.position.x;
    const dz = site.z - this.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const side = (Math.random() < 0.5 ? -1 : 1) * rand(8, 16);
    const t = rand(0.45, 0.65);
    return game.nav.nearestFree(this.position.x + dx * t - (dz / len) * side, this.position.z + dz * t + (dx / len) * side);
  }

  passBomb(dt, game) {
    const bomb = game.bomb;
    if (bomb.carrier !== this || this.frozen) return;
    this.passT -= dt;
    if (this.passT > 0) return;
    this.passT = rand(2, 4);
    const mate = game.actors.find((a) => a !== this && a.alive && !a.isPlayer && a.team === this.team && a.position.distanceTo(this.position) < 5);
    const weak = this.health < 35;
    const wrong = (this.styleName === 'lurker' || this.styleName === 'anchor') && mate?.styleName === 'rusher';
    if (!mate || this.visible || !(weak || wrong || Math.random() < 0.08)) return;
    _to.subVectors(mate.position, this.position).setY(0).normalize();
    bomb.drop(this, _to);
    game.radio(this, 'bombPass');
  }

  near(c, r, game) {
    if (!this.spot || this.spotFor !== c) {
      const a = Math.random() * Math.PI * 2;
      this.spotFor = c;
      this.spot = game.nav.nearestFree(c.x + Math.cos(a) * rand(1, r), c.z + Math.sin(a) * rand(1, r));
    }
    return this.spot;
  }

  act(dt, game) {
    const goal = this.objective(game);
    if (!goal) {
      this.pickRoam(game);
      return false;
    }
    const bomb = game.bomb;
    const role = game.roleOf(this);
    this.direct = null;
    if (role === 'attack' && bomb.carrier === this && bomb.siteAt(this.position)) return bomb.use(this, true, dt);
    const defusing = role === 'defend' && bomb.planted;
    if (defusing && this.position.distanceTo(bomb.position) < 1.3) return bomb.use(this, true, dt);
    this.repathT -= dt;
    const dist = this.position.distanceTo(goal);
    if (dist > (defusing ? 1.1 : 2.2)) {
      if (dist < 3.5) {
        this.direct = goal;
        return false;
      }
      if (this.repathT <= 0) {
        this.repathT = 0.8;
        this.goTo(goal, game);
        if (!this.path.length) this.spot = null;
      }
      return false;
    }
    this.holdT -= dt;
    this.lookT += dt;
    if (this.lookT > 1.4) {
      this.lookT = 0;
      this.lookYaw = this.yaw + rand(-1.8, 1.8);
    }
    this.yaw += angleDiff(this.yaw, this.lookYaw) * Math.min(1, dt * 2.5);
    if (this.holdT <= 0) {
      this.holdT = rand(this.style.hold[0], this.style.hold[1]);
      if (!bomb.planted || role === 'attack') this.spot = null;
    }
    return false;
  }

  throwAt(target, id, game) {
    this.eye(_eye);
    const T = 1.15;
    _dir.set((target.x - _eye.x) / T, (target.y + 0.2 - _eye.y + 0.5 * GRAVITY_THROW * T * T) / T, (target.z - _eye.z) / T);
    if (_dir.length() > 24) _dir.setLength(24);
    _aim.copy(_eye).addScaledVector(_dir.clone().normalize(), 0.5);
    game.grenades.throw(this, _aim, _dir, id);
    game.audio.play('swoosh', { at: _eye, volume: 0.4, rate: 0.75 });
    this.grenades[id]--;
    this.nadeT = rand(5, 9) / this.style.nades;
    this.avatar.fire();
  }

  nades(dt, game) {
    this.nadeT -= dt;
    if (this.nadeT > 0 || this.frozen) return;
    if (this.grenades.he > 0 && this.state === 'hunt' && !this.visible && game.time - this.lastSeenAt < 4) {
      const d = this.position.distanceTo(this.lastSeen);
      if (d > 8 && d < 30) {
        this.throwAt(this.lastSeen, 'he', game);
        return;
      }
    }
    if (this.grenades.smoke > 0 && game.roleOf(this) === 'attack' && !game.bomb.planted && game.attackPlan && (game.siteSmokes || 0) < 2) {
      const s = game.arena.sites[game.attackPlan.site];
      const d = Math.hypot(this.position.x - s.x, this.position.z - s.z);
      if (d < 26 && d > 9) {
        game.siteSmokes = (game.siteSmokes || 0) + 1;
        _to.set(s.x + rand(-2, 2), 0, s.z + Math.sign(s.z - this.position.z || 1) * 4);
        this.throwAt(_to, 'smoke', game);
      }
    }
  }

  pickRoam(game) {
    const goal = this.objective(game);
    if (goal) {
      this.goTo(goal, game);
      return;
    }
    const enemies = game.actors.filter((a) => a !== this && a.alive && !game.allies(this, a));
    let p;
    if (enemies.length && Math.random() < 0.55) {
      const e = enemies[Math.floor(Math.random() * enemies.length)];
      p = game.nav.nearestFree(e.position.x + rand(-12, 12), e.position.z + rand(-12, 12));
    } else {
      p = game.nav.randomPoint();
    }
    this.goTo(p, game);
  }

  sense(game) {
    const s = this.skill;
    this.eye(_eye);
    const fwd = this.forward(_dir);
    let best = null;
    let bestScore = Infinity;
    for (const a of game.actors) {
      if (a === this || !a.alive || game.allies(this, a)) continue;
      _to.subVectors(a.position, this.position);
      const dist = _to.length();
      if (dist > s.vision) continue;
      if (dist > 26 && game.time - game.freezeEnd < 2.5) continue;
      _to.y = 0;
      _to.normalize();
      const facing = _to.dot(fwd);
      const close = dist < 7;
      const limit = a === this.target && game.time - this.lastSeenAt < 2 ? -0.3 : s.fov;
      if (!close && facing < limit) continue;
      const head = a.eye(_aim);
      let seen = game.visible(_eye, head);
      if (!seen) seen = game.visible(_eye, a.chest(_aim));
      if (!seen) continue;
      const score = dist * (a === this.target ? 0.6 : 1) * (a.isPlayer ? 0.9 : 1);
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }

    const wasVisible = this.visible;
    if (best) {
      if (best !== this.target || !wasVisible) {
        this.seenSince = game.time;
        this.tracking = 0;
      }
      this.target = best;
      this.visible = true;
      this.lastSeen.copy(best.position);
      this.lastSeenAt = game.time;
    } else {
      this.visible = false;
    }
  }

  think(game) {
    if (this.style.retreat && this.health < 38 && this.state !== 'retreat') {
      const pack = game.pickups.nearestHealth(this.position);
      if (pack && pack.position.distanceTo(this.position) < 40) {
        this.state = 'retreat';
        this.goTo(pack.position, game);
        return;
      }
    }

    if (this.state === 'retreat') {
      const pack = game.pickups.nearestHealth(this.position);
      if (!pack || this.health >= 70) this.setState(this.visible ? 'fight' : 'roam', game);
      return;
    }

    if (this.visible && this.target?.alive) {
      if (this.state !== 'fight') {
        this.state = 'fight';
        this.path = [];
      }
      return;
    }

    if (this.state === 'fight') {
      const keep = game.mode.bomb && game.bomb.carrier === this ? 2 : this.style.chase;
      if (this.target?.alive && game.time - this.lastSeenAt < keep) this.setState('hunt', game);
      else this.setState('roam', game);
    }
    if (!this.visible && this.def.mag && this.mag < this.def.mag * 0.4 && this.reloadT <= 0) this.reloadT = this.def.reload;
  }

  update(dt, game) {
    const av = this.avatar;
    if (!this.alive) {
      if (!this.grounded || Math.abs(this.velocity.x) + Math.abs(this.velocity.z) > 0.05) {
        this.velocity.x *= Math.max(0, 1 - dt * 6);
        this.velocity.z *= Math.max(0, 1 - dt * 6);
        this.velocity.y -= GRAVITY * dt;
        this.position.addScaledVector(this.velocity, dt);
        game.physics.resolve(this);
        av.root.position.copy(this.position);
      }
      av.update(dt, {});
      return;
    }

    this.invulnerable = Math.max(0, this.invulnerable - dt);

    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = 0.14 + Math.random() * 0.06;
      this.sense(game);
      this.think(game);
    }

    if (this.target && !this.target.alive) {
      this.target = null;
      this.visible = false;
      if (this.state === 'fight' || this.state === 'hunt') this.setState('roam', game);
    }

    _move.set(0, 0, 0);
    let speed = this.skill.speed * (this.def.speed || 1);
    let faceMove = true;
    let acting = false;

    if (this.state === 'fight' && this.target) {
      faceMove = false;
      _to.subVectors(this.target.position, this.position);
      _to.y = 0;
      const dist = _to.length();
      _to.normalize();
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeT = rand(0.45, 1.5) * this.style.strafe;
        this.strafe = Math.random() < 0.5 ? -1 : 1;
        if (Math.random() < this.style.jump && this.grounded && dist > 4) this.velocity.y = 6.8;
        this.duck = dist > 10 && Math.random() < this.style.crouch ? 1 : 0;
      }
      _move.set(-_to.z * this.strafe, 0, _to.x * this.strafe);
      if (this.def.melee) _move.multiplyScalar(dist > 4 ? 0.35 : 0.1).addScaledVector(_to, dist > 1.2 ? 1.4 : 0);
      else if (dist > this.preferRange + 6) _move.addScaledVector(_to, 1.2);
      else if (dist < this.preferRange - 5) _move.addScaledVector(_to, -0.8);
      _move.normalize();
      _probe.copy(this.position).addScaledVector(_move, 1.4);
      if (!game.nav.isFree(_probe.x, _probe.z)) {
        this.strafe *= -1;
        _move.set(-_to.z * this.strafe, 0, _to.x * this.strafe);
        _probe.copy(this.position).addScaledVector(_move, 1.4);
        if (!game.nav.isFree(_probe.x, _probe.z)) _move.set(0, 0, 0);
      }
      speed = this.skill.speed * 0.8 * (this.duck ? 0.45 : 1);
    } else {
      this.duck = 0;
      if (this.state === 'retreat') speed = this.skill.speed + 0.8;
      if (this.direct && !this.path.length) {
        _to.subVectors(this.direct, this.position).setY(0);
        if (_to.lengthSq() > 0.04) _move.copy(_to).normalize();
      } else if (this.path.length) {
        const next = this.path[0];
        _to.subVectors(next, this.position);
        _to.y = 0;
        const d = _to.length();
        if (d < 0.8) {
          this.path.shift();
        } else {
          _move.copy(_to).divideScalar(d);
        }
      } else if (this.state === 'hunt') {
        this.lookT += dt;
        faceMove = false;
        if (this.lookT > 0.7) {
          this.lookT = 0;
          this.lookYaw = this.yaw + rand(-2, 2);
        }
        this.yaw += angleDiff(this.yaw, this.lookYaw) * Math.min(1, dt * 3);
        if (game.time - this.lastSeenAt > 5) this.setState('roam', game);
      } else if (this.state === 'roam') {
        if (game.mode.bomb) {
          faceMove = false;
          acting = this.act(dt, game);
        } else {
          this.pickRoam(game);
        }
      } else if (this.state === 'retreat') {
        this.setState('roam', game);
      }
    }

    if (this.frozen || acting) _move.set(0, 0, 0);
    if (game.mode.bomb && !acting && this.planting) game.bomb.use(this, false, dt);
    if (!this.frozen) this.nades(dt, game);
    if (game.mode.bomb) this.passBomb(dt, game);
    speed *= this.style.speed;
    if (this.style.quiet && this.state !== 'fight' && !this.visible) speed *= 0.72;
    this.crouch += ((this.duck || this.planting ? 1 : 0) - this.crouch) * Math.min(1, dt * 8);
    const k = Math.min(1, (this.grounded ? 10 : 2) * dt);
    this.velocity.x += (_move.x * speed - this.velocity.x) * k;
    this.velocity.z += (_move.z * speed - this.velocity.z) * k;
    this.velocity.y -= GRAVITY * dt;
    this.position.addScaledVector(this.velocity, dt);
    game.physics.resolve(this);
    game.checkPads?.(this);

    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    if (_move.lengthSq() > 0.1 && hs < 0.6) {
      this.stuckT += dt;
      if (this.stuckT > 0.7) {
        this.stuckT = 0;
        if (this.grounded) this.velocity.y = 6.8;
        if (this.state !== 'fight') this.goTo(this.goal, game);
      }
    } else {
      this.stuckT = 0;
    }

    if (this.grounded && hs > 1.5) {
      this.stepT -= dt * hs / 5.5;
      if (this.stepT <= 0) {
        this.stepT = 0.38;
        const d2 = this.position.distanceToSquared(game.camera.position);
        const loud = hs > 4.6 && this.crouch < 0.5;
        if (loud && d2 < 900) game.audio.play(`step${Math.floor(Math.random() * 5)}`, { at: this.position, volume: 0.85, ref: 4, max: 40 });
        if (loud) game.noise(this.position, 16, this);
      }
    }

    this.aimAndShoot(dt, game, faceMove);

    av.root.position.copy(this.position);
    const d2 = this.position.distanceToSquared(game.camera.position);
    const far = d2 > 1600;
    av.setDetail(d2 > 225 / (game.renderer.fast ? 2 : 1));
    this.lodFrame = (this.lodFrame || 0) + 1;
    const reload = this.reloadT > 0 && this.def.reload ? 1 - this.reloadT / this.def.reload : 0;
    av.update(dt, {
      speed: hs,
      grounded: this.grounded,
      yaw: this.yaw,
      pitch: -this.pitch,
      vx: this.velocity.x,
      vz: this.velocity.z,
      reload,
      crouch: this.crouch,
      lod: far && this.lodFrame % 2 ? 2 : 0,
    });
  }

  aimAndShoot(dt, game, faceMove) {
    const s = this.skill;
    let wantYaw = this.yaw;
    let wantPitch = 0;
    const engaged = this.state === 'fight' && this.target && this.visible;

    if (engaged) {
      this.tracking = Math.min(1, this.tracking + dt / 1.6);
      this.errorT -= dt;
      if (this.errorT <= 0) {
        this.errorT = rand(0.25, 0.55);
        const tSpeed = Math.hypot(this.target.velocity.x, this.target.velocity.z);
        const mag = s.error * (1.15 - this.tracking * 0.75) * (1 + tSpeed / 9);
        this.errorOffset.set(rand(-1, 1), rand(-0.6, 0.8), rand(-1, 1)).normalize().multiplyScalar(mag);
      }
      this.eye(_eye);
      const t = this.target;
      _aim.copy(t.position).setY(t.position.y + (Math.random() < 0.2 ? t.eyeHeight() : 1.1 - t.crouch * 0.4));
      const dist = _eye.distanceTo(_aim);
      _aim.addScaledVector(this.errorOffset, dist);
      _dir.subVectors(_aim, _eye);
      wantYaw = Math.atan2(_dir.x, _dir.z);
      wantPitch = Math.atan2(_dir.y, Math.hypot(_dir.x, _dir.z));
    } else if (faceMove) {
      const h = Math.hypot(this.velocity.x, this.velocity.z);
      if (h > 0.8) wantYaw = Math.atan2(this.velocity.x, this.velocity.z);
    } else if (this.state !== 'fight') {
      wantYaw = this.yaw;
    }

    if (!engaged && this.state === 'hunt' && this.path.length) {
      _dir.subVectors(this.lastSeen, this.position);
      if (_dir.lengthSq() < 400) wantYaw = Math.atan2(_dir.x, _dir.z);
    }

    const maxTurn = s.turn * dt;
    const dy = angleDiff(this.yaw, wantYaw);
    this.yaw += Math.max(-maxTurn, Math.min(maxTurn, dy));
    this.pitch += Math.max(-maxTurn, Math.min(maxTurn, wantPitch - this.pitch));

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.mag = this.def.mag;
      return;
    }

    if (!engaged || this.frozen) return;
    if (game.time - this.seenSince < s.reaction * (this.def.scope ? 1.6 : 1)) return;
    if (this.def.melee) {
      const d = this.position.distanceTo(this.target.position);
      if (d < 1.9 && Math.abs(dy) < 0.5 && game.time >= this.nextFire) {
        const heavy = Math.random() < 0.35;
        this.nextFire = game.time + (heavy ? 1.1 : 0.55);
        this.avatar.fire();
        game.audio.play('swoosh', { at: this.position, volume: 0.5 });
        game.melee(this, heavy);
      }
      return;
    }
    if (Math.abs(dy) > s.cone || Math.abs(wantPitch - this.pitch) > s.cone) return;
    if (game.time < this.nextFire) return;

    if (this.burst <= 0) {
      this.burst = Math.round(rand(s.burst[0], s.burst[1]));
    }

    this.shoot(game);
    this.burst--;
    const w = this.def;
    this.nextFire = game.time + 60 / w.rpm * (w.auto ? 1 : 1.35);
    if (!w.auto) this.burst = Math.min(this.burst, 1);
    if (this.burst <= 0) this.nextFire += rand(s.pause[0], s.pause[1]);
  }

  shoot(game) {
    const w = this.def;
    this.mag--;
    this.lastShot = game.time;
    if (this.mag <= 0) this.reloadT = w.reload;

    this.eye(_eye);
    this.avatar.fire();
    this.avatar.muzzle.getWorldPosition(_muzzle);
    game.effects.muzzle(_muzzle, w.color, w.pellets > 1 || w.damage > 50 ? 0.6 : 0.42);
    const spread = (w.scope ? w.spread * 2 : w.spread * 1.6) + 0.004;
    const dmg = { ...w, damage: w.damage * this.skill.damage };
    for (let i = 0; i < w.pellets; i++) {
      const cp = Math.cos(this.pitch);
      _dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
      const sp = w.pellets > 1 ? w.spread : spread;
      _dir.x += rand(-1, 1) * sp;
      _dir.y += rand(-1, 1) * sp;
      _dir.z += rand(-1, 1) * sp;
      _dir.normalize();
      game.shoot(this, _eye, _dir, dmg, _muzzle, i % 3 === 0);
    }
    const d2 = _muzzle.distanceToSquared(game.camera.position);
    game.audio.play(d2 > 900 ? 'far' : w.sound, { at: _muzzle, volume: w.volume * 0.9, ref: 6, rate: w.pitch || 1 });
    game.noise(this.position, 45, this);
  }
}
