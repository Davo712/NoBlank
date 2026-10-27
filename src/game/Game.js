import * as THREE from 'three';
import { Renderer } from '../core/Renderer.js';
import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { Input } from '../core/Input.js';
import { setFastShading } from '../core/shading.js';
import { Arena } from '../world/Arena.js';
import { MAPS } from '../world/maps.js';
import { Pickups } from '../world/Pickups.js';
import { Effects } from '../fx/Effects.js';
import { Viewmodel } from '../combat/Viewmodel.js';
import { texturizeGuns } from '../combat/guns.js';
import { Grenades } from '../combat/Grenades.js';
import { WEAPONS, ARMS_RACE, BOT_PRIMARIES } from '../combat/weapons.js';
import { Player } from '../actors/Player.js';
import { Bot, SKILLS, STYLES } from '../actors/Bot.js';
import { Avatar } from '../actors/Avatar.js';
import { Hud } from '../ui/Hud.js';
import { Menu } from '../ui/Menu.js';
import { Radar } from '../ui/Radar.js';
import { renderIcons } from '../ui/icons.js';
import { renderPortraits } from '../ui/portraits.js';
import { t } from '../ui/i18n.js';
import { MODES } from './modes.js';
import { Bomb } from './Bomb.js';
import { Drops } from './Drops.js';

const BOT_NAMES = ['Viper', 'Ghost', 'Rook', 'Nova', 'Havoc', 'Jinx', 'Blitz', 'Echo', 'Raven', 'Kilo', 'Mako', 'Sable', 'Onyx', 'Dash'];
const FFA_COLORS = ['#ff6b6b', '#ffd166', '#c77dff', '#06d6a0', '#ff9f1c', '#f15bb5', '#9bf6ff', '#a0c4ff', '#caffbf', '#ffadad', '#fdffb6', '#bdb2ff'];
const TEAM_COLORS = { A: '#5aa9ff', B: '#ff9a3c' };

const _v = new THREE.Vector3();
const _look = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _to = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _up = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

export class Game {
  constructor(container) {
    this.container = container;
    this.state = 'loading';
    this.time = 0;
    this.clock = 0;
    this.actors = [];
    this.bots = [];
    this.fovScale = 1;
    this.orbit = 0;
    this.hurt = 0;
    this.mode = MODES.dm;
    this.teamScore = { A: 0, B: 0 };
    this.timer = new THREE.Clock();
    this.attackers = 'B';
    this.roundTimer = 0;
    this.errorAt = -10;
  }

  async boot() {
    this.menu = new Menu({
      play: (s) => this.startMatch(s),
      resume: () => this.resume(),
      quit: () => this.quit(),
      change: (s) => this.applySettings(s),
      loadout: (s) => this.applyLoadout(s),
      click: () => {
        this.audio.unlock();
        this.audio.play('click', { volume: 0.5 });
      },
    });
    this.renderer = new Renderer(this.container, this.menu.settings.quality);
    this.camera = this.renderer.camera;
    this.audio = new Audio();
    this.input = new Input(this.renderer.gl.domElement);
    this.hud = new Hud();
    this.menu.show('loading');

    await this.renderer.measureRefresh();
    this.renderer.gl.setAnimationLoop(() => this.frame());

    this.assets = new Assets(this.audio);
    await this.assets.load((p) => this.menu.progress(p * 0.9));
    this.menu.progress(0.95, 'building');
    await nextFrame();

    texturizeGuns(this.assets.pbr);
    this.effects = new Effects(this.renderer.scene, this.assets);
    this.grenades = new Grenades(this.renderer.scene, this.assets);
    this.viewmodel = new Viewmodel(this.renderer, this.assets, this.audio);
    this.viewmodel.rig.visible = false;
    this.player = new Player('Player');
    this.icons = renderIcons(this.renderer.gl);
    this.hud.icons = this.icons;
    this.menu.setIcons(this.icons);
    this.menu.setPortraits(this.assets.characters, renderPortraits(this.renderer.gl, this.assets));
    this.loadMap(this.menu.settings.map);
    this.bomb = new Bomb(this);
    this.drops = new Drops(this);

    this.input.onUnlock = () => {
      if (this.state !== 'playing' || this.input.switching || this.time - this.startedAt < 1.5) return;
      this.pause();
      if (this.wantLoadout) this.menu.openLoadout('pause');
      this.wantLoadout = false;
    };
    this.input.onEscape = () => {
      if (this.state === 'paused' && performance.now() - this.pausedAt > 300 && !document.getElementById('pause').classList.contains('hidden')) {
        this.resume();
      } else if (this.state === 'playing' && this.input.locked) {
        this.input.unlock();
      }
    };
    addEventListener('mousedown', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.lock().catch(() => {});
    });
    addEventListener('beforeunload', (e) => {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      e.preventDefault();
      e.returnValue = '';
    });

    this.applySettings(this.menu.settings);
    this.state = 'menu';
    this.menu.show('menu');
    window.dispatchEvent(new Event('outpost:ready'));
  }

  loadMap(id) {
    const map = MAPS[id] || MAPS.outpost;
    if (this.arena?.map === map) return;
    if (this.arena) {
      this.arena.dispose();
      this.pickups.dispose();
    }
    this.arena = new Arena(this.assets, this.renderer.scene, map);
    this.physics = this.arena.physics;
    this.nav = this.arena.nav;
    this.pickups = new Pickups(this.renderer.scene, this.assets, this.arena.pickupSpots);
    this.radar = new Radar(document.getElementById('radar'), this.physics, this.arena.half, this.arena.sites);
    this.applyShadows();
    this.applyShading();
    this.effects?.warm(this.renderer.gl, this.renderer.scene, this.camera);
    const extras = [this.bomb?.mesh, ...Object.values(this.grenades?.templates || {})].filter(Boolean);
    const hidden = extras.map((o) => {
      const parent = o.parent;
      const visible = o.visible;
      if (!parent) this.renderer.scene.add(o);
      o.visible = true;
      return { o, parent, visible };
    });
    this.renderer.gl.compile(this.renderer.scene, this.camera);
    for (const { o, parent, visible } of hidden) {
      o.visible = visible;
      if (!parent) this.renderer.scene.remove(o);
    }
    if (this.arena.theme.indoor) this.arena.sun.castShadow = false;
  }

  applySettings(s) {
    if (!this.player) return;
    this.player.sensitivity = s.sensitivity;
    this.fovScale = s.fov / 78;
    this.audio.setVolume((s.volume / 100) * 0.9);
    this.hud.showFps(s.showFps);
    this.hud.setCrosshair(s);
    if (this.renderer.quality !== s.quality) {
      this.renderer.setQuality(s.quality);
      this.applyShadows();
      this.applyShading();
    }
  }

  applyLoadout(s) {
    if (this.state !== 'paused' || this.mode.arms) return;
    const p = this.player;
    if (p.alive && this.time - p.spawnedAt < 8 && !this.mode.rounds) {
      p.setLoadout([s.primary, s.secondary], this.extras(), s.melee);
      this.viewmodel.show(p.weapon);
    } else if (this.mode.rounds && p.alive && this.freezeUntil && this.time < this.freezeUntil) {
      p.setLoadout([s.primary, s.secondary], this.extras(), s.melee);
      this.viewmodel.show(p.weapon);
    } else {
      this.hud.toast(t('loadoutHint'));
    }
  }

  extras() {
    if (this.mode.arms) return [];
    const s = this.settings || this.menu.settings;
    return [s.grenade === 'smoke' ? 'smoke' : 'he'];
  }

  downgrade() {
    const order = ['high', 'medium', 'low'];
    const i = order.indexOf(this.renderer.quality);
    if (i < 0 || i >= order.length - 1) return;
    this.menu.settings.quality = order[i + 1];
    this.menu.save();
    this.menu.sync();
    this.hud.toast(t('graphicsLowered'));
  }

  applyShading() {
    if (!this.arena) return;
    const fast = this.renderer.fast;
    setFastShading(this.renderer.scene, fast);
    setFastShading(this.renderer.viewScene, fast);
    this.grenades.fast = fast;
    this.viewmodel.setShading(fast);
    this.arena.setShading(fast);
    for (const b of this.bots) b.avatar.setShading(fast);
  }

  applyShadows() {
    if (!this.arena) return;
    const dynamic = this.renderer.dynamicShadows;
    const sun = this.arena.sun;
    const size = this.renderer.shadowSize;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    sun.shadow.autoUpdate = false;
    sun.shadow.needsUpdate = true;
    for (const b of this.bots) b.avatar.setShadowMode(dynamic);
    this.arena.setDetail(this.renderer.quality);
    this.renderer.scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true;
    });
  }

  allies(a, b) {
    return this.mode.teams && !!a.team && a.team === b.team;
  }

  roleOf(a) {
    if (!this.mode.bomb || !a.team) return null;
    return a.team === this.attackers ? 'attack' : 'defend';
  }

  score(a) {
    return this.mode.arms ? a.level + 1 : a.kills;
  }

  limitText() {
    if (this.mode.arms) return t('level', { n: this.player.level + 1, m: ARMS_RACE.length });
    if (this.mode.rounds) return `${t('round')} ${this.round}`;
    return `${t('to')} ${this.limit}`;
  }

  async startMatch(settings) {
    this.audio.unlock();
    this.input.lock().catch(() => {});
    const screen = settings.fullscreen !== 'off' ? this.input.fullscreen() : null;
    clearTimeout(this.roundTimer);
    this.settings = settings;
    this.applySettings(settings);
    this.mode = MODES[settings.mode] || MODES.dm;
    this.limit = this.mode.arms ? ARMS_RACE.length : this.mode.limits[settings.limit] ?? this.mode.limits[1];

    if (this.arena?.map.id !== settings.map) {
      this.menu.show('loading');
      this.menu.progress(1, 'building');
      await nextFrame();
      this.loadMap(settings.map);
    }

    for (const b of this.bots) this.renderer.scene.remove(b.avatar.root);
    this.bots = [];
    this.grenades.clear();
    this.drops.clear();
    this.effects.clearDecals();
    this.bomb.reset();

    const skill = SKILLS[settings.difficulty] || SKILLS.normal;
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const teams = this.mode.teams;
    const side = settings.side === 'B' ? 'B' : 'A';
    const other = side === 'A' ? 'B' : 'A';
    const total = settings.bots + 1;
    const mine = Math.ceil(total / 2) - 1;
    const chars = this.assets.characters;
    const mineChar = settings[`char${teams ? side : settings.side === 'B' ? 'B' : 'A'}`];
    for (let i = 0; i < settings.bots; i++) {
      const team = teams ? (i < mine ? side : other) : null;
      const pool = chars.filter((c) => (team ? c.team === team : c.id !== mineChar));
      const pick = pool[(i + Math.floor(Math.random() * pool.length)) % pool.length];
      const avatar = new Avatar(this.assets.hq, pick);
      avatar.setVisible(false);
      avatar.setShadowMode(this.renderer.dynamicShadows);
      avatar.setShading(this.renderer.fast);
      this.renderer.scene.add(avatar.root);
      const color = team ? TEAM_COLORS[team] : FFA_COLORS[i % FFA_COLORS.length];
      const bot = new Bot(names[i % names.length], color, avatar, skill);
      bot.team = team;
      const styles = Object.keys(STYLES);
      bot.setStyle(styles[(i + Math.floor(Math.random() * styles.length)) % styles.length]);
      bot.equip(this.mode.arms ? ARMS_RACE[0] : BOT_PRIMARIES[i % BOT_PRIMARIES.length]);
      setFastShading(avatar.root, this.renderer.fast);
      avatar.setMarker(team && team === side ? TEAM_COLORS[side] : null);
      this.bots.push(bot);
    }

    this.warmFrames = 3;

    const p = this.player;
    p.name = settings.name || 'Player';
    p.team = teams ? side : null;
    p.color = teams ? TEAM_COLORS[side] : '#7fe9ff';
    const me = chars.find((c) => c.id === mineChar) || chars.find((c) => c.team === side) || chars[0];
    this.viewmodel.setSkin(me.skin);
    p.resetTimers();
    this.actors = [p, ...this.bots];
    for (const a of this.actors) {
      a.kills = 0;
      a.deaths = 0;
      a.streak = 0;
      a.bestStreak = 0;
      a.level = 0;
      a.alive = false;
      a.respawnAt = 0;
      a.frozen = false;
      a.hasBomb = false;
      a.planting = false;
      a.nextFire = 0;
    }

    this.clock = settings.minutes * 60;
    this.teamScore = { A: 0, B: 0 };
    this.attackers = 'B';
    this.round = 0;
    this.roundOver = false;
    this.firstBlood = false;
    this.ending = false;
    this.multi = 0;
    this.lastKillAt = -99;
    this.freezeUntil = 0;
    this.freezeEnd = -99;
    this.spectate = null;
    this.pickups.reset();
    this.pickups.setEnabled(!this.mode.rounds);
    this.hud.reset();
    this.viewmodel.rig.visible = true;

    if (this.mode.rounds) {
      this.startRound();
    } else {
      this.respawn(p);
      this.bots.forEach((b, i) => {
        b.respawnAt = this.time + 0.2 + i * 0.15;
      });
    }

    this.state = 'playing';
    this.startedAt = this.time;
    this.menu.hide();
    this.hud.show(true);
    this.audio.play(`vo_${this.mode.voice}`, { volume: 0.9, jitter: 0 });
    await screen;
    if (!this.input.locked) this.input.lock().catch(() => {});
    this.timer.getDelta();
  }

  prewarm() {
    const gl = this.renderer.gl;
    const scene = this.renderer.scene;
    const cam = this.camera;
    cam.updateMatrixWorld();
    const fwd = cam.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const base = cam.position.clone();
    for (const c of this.assets.characters) gl.initTexture(c.skin);
    const temp = [];
    const show = (o, x, z) => {
      temp.push([o, o.visible, o.position.clone(), o.parent]);
      if (!o.parent) scene.add(o);
      o.visible = true;
      o.position.copy(base).addScaledVector(side, x).addScaledVector(fwd, -z);
      o.position.y -= 0.8;
      o.updateMatrixWorld(true);
    };
    this.bots.forEach((b, i) => show(b.avatar.root, (i % 5) - 2, -4 - Math.floor(i / 5)));
    const fx = this.effects;
    [fx.bolts[0].mesh, fx.flashes[0].sprite, fx.smoke[0].sprite, fx.fireballs[0].sprite, fx.waves[0].mesh, fx.beams[0].mesh].forEach((o, i) => show(o, i - 3, -3));
    if (this.bomb) show(this.bomb.mesh, 2, -3);
    Object.values(this.grenades.templates).forEach((o, i) => show(o, -2 + i, -2.5));
    const puff = this.grenades.sprite();
    show(puff, 0, -4);
    const warmDrops = ['ak47', 'm4a1', 'mp5', 'awp', 'scout', 'nova', 'glock', 'deagle'].map((id) => this.drops.spawn(id, base, null));
    warmDrops.forEach((it, i) => show(it.mesh, i - 3, -2));
    fx.decals.count = Math.max(fx.decals.count, 1);
    fx.splats.count = Math.max(fx.splats.count, 1);
    const culled = [];
    scene.traverse((o) => {
      if ((o.isMesh || o.isPoints || o.isSprite) && o.frustumCulled) {
        o.frustumCulled = false;
        culled.push(o);
      }
    });
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(null);
    gl.render(scene, cam);
    for (const o of culled) o.frustumCulled = true;
    const models = Object.values(this.viewmodel.models);
    const shown = models.map((m) => m.holder.visible);
    models.forEach((m) => {
      m.holder.visible = true;
    });
    this.viewmodel.rig.visible = true;
    gl.render(this.renderer.viewScene, this.renderer.viewCamera);
    models.forEach((m, i) => {
      m.holder.visible = shown[i];
    });
    gl.setRenderTarget(prev);
    for (const [o, visible, pos, parent] of temp) {
      o.visible = visible;
      o.position.copy(pos);
      if (!parent) scene.remove(o);
    }
    for (const b of this.bots) b.avatar.setVisible(false);
    for (const it of warmDrops) this.drops.remove(it);
    this.grenades.release(puff);
  }

  teamSpawnList(a) {
    if (this.mode.bomb) return this.arena.teamSpawns[a.team === this.attackers ? 'B' : 'A'];
    return this.arena.teamSpawns[a.team];
  }

  startRound() {
    this.round++;
    this.roundOver = false;
    this.roundReason = null;
    this.clock = this.mode.roundTime;
    this.freezeUntil = this.time + this.mode.freeze;
    this.finalStand = false;
    this.spectate = null;
    this.attackPlan = null;
    this.bombKnown = false;
    this.defendSplit = 0;
    this.siteSmokes = 0;
    this.grenades.clear();
    this.drops.clear();
    this.bomb.reset();
    const used = { A: 0, B: 0 };
    for (const a of this.actors) {
      const list = this.teamSpawnList(a);
      const base = list[used[a.team]++ % list.length].clone();
      base.x += (Math.random() - 0.5) * 1.5;
      base.z += (Math.random() - 0.5) * 1.5;
      const spot = this.nav.nearestFree(base.x, base.z);
      this.placeActor(a, spot);
      a.frozen = true;
      a.respawnAt = Infinity;
    }
    if (this.mode.bomb) {
      const team = this.actors.filter((a) => a.team === this.attackers);
      this.bomb.give(team[Math.floor(Math.random() * team.length)]);
    }
    const goal = this.mode.bomb ? t(this.roleOf(this.player) === 'attack' ? 'goalAttack' : 'goalDefend') : t('freeze');
    this.hud.banner(`${t('round')} ${this.round}`, goal, '', this.mode.freeze);
    this.effects.update(0);
  }

  endRound(winner, reason = 'elim') {
    if (this.roundOver) return;
    this.roundOver = true;
    this.roundReason = reason;
    if (winner) this.teamScore[winner]++;
    const mine = winner === this.player.team;
    const title = !winner ? t('roundDraw') : mine ? t('roundWon') : t('roundLost');
    const why = reason === 'bomb' ? t('whyBomb') : reason === 'defuse' ? t('whyDefuse') : reason === 'time' ? t('whyTime') : '';
    this.hud.banner(title, `${why ? `${why} · ` : ''}${this.teamScore.A} : ${this.teamScore.B}`, !winner ? '' : mine ? 'var(--team-a)' : 'var(--team-b)', 3);
    if (mine) {
      this.audio.play('vo_round_winner', { volume: 0.9, jitter: 0 });
      if (this.player.alive && this.actors.every((a) => a.team === this.player.team || !a.alive)) this.hud.medal('annihilation');
    }
    clearTimeout(this.roundTimer);
    this.roundTimer = setTimeout(() => {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      const maxRounds = this.mode.bomb ? this.limit * 2 - 1 : Infinity;
      if (this.teamScore.A >= this.limit || this.teamScore.B >= this.limit || this.round >= maxRounds) {
        this.endMatch();
        return;
      }
      this.startRound();
    }, 3600);
  }

  onPlanted(actor, site) {
    this.clock = Math.max(this.clock, 0);
    const mine = this.roleOf(this.player) === 'attack';
    this.hud.banner(t('bombPlanted'), mine ? `${t('site')} ${site}` : '', 'var(--danger)', 2.2);
    for (const b of this.bots) b.onBombPlanted?.(this);
  }

  onDefused() {
    if (!this.roundOver) this.endRound(this.defenders, 'defuse');
  }

  onExploded() {
    if (!this.roundOver) this.endRound(this.attackers, 'bomb');
  }

  attackPlanFor() {
    if (!this.attackPlan) {
      const kind = ['rush', 'default', 'split', 'fake'][Math.floor(Math.random() * 4)];
      const site = Math.random() < 0.5 ? 'A' : 'B';
      this.attackPlan = { kind, site, start: this.time, swap: kind === 'fake' ? this.time + this.mode.freeze + 14 + Math.random() * 8 : Infinity };
    }
    const plan = this.attackPlan;
    if (this.time > plan.swap && !this.bomb.planted) {
      plan.site = plan.site === 'A' ? 'B' : 'A';
      plan.swap = Infinity;
      for (const b of this.bots) {
        b.spot = null;
        b.via = false;
      }
    }
    return plan;
  }

  defendPlanFor(bot) {
    const n = this.defendSplit++;
    if (bot.styleName === 'rusher' && n % 3 === 2) return 'mid';
    return n % 2 ? 'B' : 'A';
  }

  bombRunner(bot) {
    let best = null;
    let bestD = Infinity;
    for (const a of this.actors) {
      if (!a.alive || a.isPlayer || this.roleOf(a) !== 'attack') continue;
      const d = a.position.distanceToSquared(this.bomb.position);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best === bot;
  }

  radio(actor, key) {
    if (!this.allies(actor, this.player) || !this.player.alive) return;
    this.hud.radio(actor, t(`radio_${key}`));
  }

  get defenders() {
    return this.attackers === 'A' ? 'B' : 'A';
  }

  pause() {
    this.state = 'paused';
    this.pausedAt = performance.now();
    this.menu.show('pause');
  }

  async resume() {
    this.state = 'playing';
    this.menu.hide();
    this.input.lock().catch(() => {});
    if (this.settings?.fullscreen !== 'off' && !document.fullscreenElement) await this.input.fullscreen();
    if (!this.input.locked) this.input.lock().catch(() => {});
    this.timer.getDelta();
  }

  quit() {
    clearTimeout(this.roundTimer);
    this.state = 'menu';
    this.hud.show(false);
    this.viewmodel.rig.visible = false;
    this.grenades.clear();
    this.drops.clear();
    this.bomb.reset();
    for (const b of this.bots) b.avatar.setVisible(false);
    this.input.unlock();
    this.input.leaveFullscreen();
    this.menu.show('menu');
  }

  endMatch() {
    if (this.state === 'over') return;
    clearTimeout(this.roundTimer);
    this.state = 'over';
    this.input.unlock();
    this.hud.show(false);
    const p = this.player;
    let title;
    let sub;
    let won;
    if (this.mode.teams) {
      const a = this.teamScore.A;
      const b = this.teamScore.B;
      won = a > b;
      title = a === b ? t('draw') : won ? t('victory') : t('defeat');
      sub = `${t('team_A')} ${a} : ${b} ${t('team_B')}`;
    } else {
      const ranking = [...this.actors].sort((x, y) => this.score(y) - this.score(x) || x.deaths - y.deaths);
      const place = ranking.indexOf(p) + 1;
      won = place === 1;
      title = won ? t('victory') : t('place', { n: place });
      sub = t('summary', { k: p.kills, d: p.deaths, s: p.bestStreak });
    }
    const board = this.menu.results(title, sub);
    this.hud.resultsBoard(board, this);
    this.audio.play(won ? 'vo_mission_accomplished' : 'vo_mission_failed', { volume: 0.9, jitter: 0 });
  }

  pickSpawn(actor) {
    const enemies = this.actors.filter((a) => a !== actor && a.alive && !this.allies(actor, a));
    let pool = this.arena.spawns;
    if (this.mode.teams) {
      const own = this.arena.teamSpawns[actor.team];
      const side = Math.sign(own[0]?.z || 1);
      pool = [...own, ...this.arena.spawns.filter((p) => Math.sign(p.z) === side)];
    }
    const scored = pool.map((p) => {
      let d = Infinity;
      for (const e of enemies) d = Math.min(d, e.position.distanceTo(p));
      let seen = 0;
      for (const e of enemies) {
        if (e.position.distanceTo(p) < 40 && this.physics.lineClear(e.eye(_v), _look.copy(p).setY(1.5))) seen++;
      }
      return { p, score: Math.min(d, 60) - seen * 15 + Math.random() * 10 };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].p.clone();
  }

  placeActor(actor, at) {
    at.y = this.physics.groundHeight(at.x, at.z, 0.4);
    const look = this.openDirection(at);
    actor.spawn(at, actor.isPlayer ? look + Math.PI : look);
    actor.spawnedAt = this.time;
    if (actor.isPlayer) {
      const s = this.settings || this.menu.settings;
      if (this.mode.arms) actor.giveWeapon(ARMS_RACE[actor.level], this);
      else actor.setLoadout([s.primary, s.secondary], this.extras(), s.melee);
      this.viewmodel.show(actor.weapon);
      this.hud.died(null);
      this.deathCam = null;
      this.spectate = null;
    } else {
      if (this.mode.arms) actor.equip(ARMS_RACE[actor.level]);
      else actor.mag = actor.def.mag;
      const smoke = this.mode.bomb && this.roleOf(actor) === 'attack' && Math.random() < 0.5;
      actor.grenades = this.mode.arms ? { he: 0, smoke: 0 } : { he: smoke ? 0 : 1, smoke: smoke ? 1 : 0 };
      actor.avatar.setVisible(true);
    }
  }

  respawn(actor) {
    const at = this.pickSpawn(actor);
    if (!actor.isPlayer) actor.avatar.setVisible(false);
    this.placeActor(actor, at);
    if (!actor.isPlayer) this.effects.spawnBeam(at, actor.team === 'A' ? 0x5aa9ff : 0xff6b8b);
    this.audio.play('spawn', { at: actor.isPlayer ? null : at, volume: actor.isPlayer ? 0.35 : 0.5 });
  }

  openDirection(at) {
    const origin = _v.copy(at).setY(at.y + 1.6);
    const center = Math.atan2(-at.x, -at.z);
    let best = center;
    let bestScore = -Infinity;
    for (let i = 0; i < 16; i++) {
      const yaw = (i / 16) * Math.PI * 2;
      _dir.set(Math.sin(yaw), 0, Math.cos(yaw));
      const hit = this.physics.raycast(origin, _dir, 40);
      const open = hit ? hit.distance : 40;
      const score = open - Math.abs(Math.atan2(Math.sin(yaw - center), Math.cos(yaw - center))) * 4;
      if (score > bestScore) {
        bestScore = score;
        best = yaw;
      }
    }
    return best;
  }

  checkPads(actor) {
    if (!actor.grounded) return;
    for (const p of this.arena.pads) {
      const dx = actor.position.x - p.x;
      const dz = actor.position.z - p.z;
      if (dx * dx + dz * dz > 1.2 || actor.position.y > 0.5) continue;
      actor.velocity.y = p.power;
      actor.grounded = false;
      const h = Math.hypot(actor.velocity.x, actor.velocity.z);
      if (h > 0.5) {
        actor.velocity.x *= 6 / h;
        actor.velocity.z *= 6 / h;
      }
      this.audio.play('spawn', { at: actor.isPlayer ? null : actor.position, volume: 0.5, rate: 1.6 });
      this.effects.spawnBeam(_v.set(p.x, 0, p.z), 0x58f0ff);
    }
  }

  noise(pos, radius, source) {
    for (const b of this.bots) {
      if (!b.alive || b === source) continue;
      if (b.position.distanceTo(pos) < radius) b.hear(pos, source, this);
    }
  }

  visible(a, b) {
    return this.physics.lineClear(a, b) && !this.grenades.blocks(a, b);
  }

  shoot(shooter, origin, dir, w, muzzle, visual) {
    const wall = this.physics.raycast(origin, dir, w.range);
    let dist = wall ? wall.distance : w.range;
    let target = null;
    let head = false;
    for (const a of this.actors) {
      if (a === shooter || this.allies(shooter, a)) continue;
      const h = a.rayHit(origin, dir);
      if (h && h.distance < dist) {
        dist = h.distance;
        target = a;
        head = h.head;
      }
    }
    const end = origin.clone().addScaledVector(dir, dist);
    if (visual) this.effects.bolt(muzzle, end, w.color, shooter.isPlayer ? 3 : 0.4, 900);

    if (target) {
      let dmg = w.damage * (head ? w.headshot : 1);
      if (w.pellets > 1 && dist > 10) dmg *= Math.max(0.25, 1 - (dist - 10) / 30);
      if (!w.scope && dist > 40) dmg *= Math.max(0.7, 1 - (dist - 40) / 150);
      this.bleed(end, dir, head ? 1.4 : 1, visual);
      this.damage(target, dmg, shooter, dir, head, w);
      return { actor: target, head };
    }

    if (wall && visual) {
      this.effects.impact(wall.point, wall.normal, w.color);
      if (Math.random() < 0.3 && wall.point.distanceTo(this.camera.position) < 30) {
        this.audio.play(Math.random() < 0.5 ? 'ricochet' : 'impact', { at: wall.point, volume: 0.35, ref: 3 });
      }
    }
    return null;
  }

  pickup(p) {
    const it = this.drops.nearest(p);
    if (!it) return false;
    const w = WEAPONS[it.id];
    const same = p.owned(w.slot)[0];
    if (same) {
      const fwd = _dir.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      this.drops.spawn(same, p.position.clone().setY(p.position.y + 1.2), p.inventory[same], fwd.multiplyScalar(3).setY(2));
      delete p.inventory[same];
    }
    p.inventory[it.id] = { mag: it.ammo.mag, reserve: it.ammo.reserve };
    this.drops.remove(it);
    p.switchTo(it.id, this, true);
    this.audio.play('pickup', { volume: 0.6 });
    return true;
  }

  dropWeapon(p) {
    const w = p.def;
    const fwd = this.camera.getWorldDirection(_dir);
    if (w.bomb) {
      this.bomb.drop(p, fwd.setY(0).normalize());
      return;
    }
    if (w.melee || w.grenade || this.mode.arms) return;
    const id = p.weapon;
    const from = this.camera.position.clone().addScaledVector(fwd, 0.6).setY(this.camera.position.y - 0.25);
    this.drops.spawn(id, from, p.inventory[id], fwd.clone().multiplyScalar(7).add(_up.set(0, 1.6, 0)).addScaledVector(p.velocity, 0.6));
    delete p.inventory[id];
    p.switchTo(p.best(), this, true);
    this.audio.play('swoosh', { volume: 0.35, rate: 0.7 });
  }

  bleed(point, dir, scale, decals) {
    this.effects.blood(point, dir, scale);
    if (!decals) return;
    const wall = this.physics.raycast(point, dir, 6);
    if (wall) this.effects.splat(wall.point, wall.normal, (0.55 + Math.random() * 0.4) * scale);
    if (Math.random() < 0.65) {
      _to.copy(point).addScaledVector(dir, 0.6 + Math.random() * 1.2);
      _to.x += (Math.random() - 0.5) * 0.8;
      _to.z += (Math.random() - 0.5) * 0.8;
      _to.y = this.physics.groundHeight(_to.x, _to.z, 0.1);
      if (_to.y < point.y) this.effects.splat(_to, _up.set(0, 1, 0), (0.35 + Math.random() * 0.35) * scale);
    }
  }

  aimOf(actor, out) {
    if (actor.isPlayer) return this.camera.getWorldDirection(out);
    const cp = Math.cos(actor.pitch);
    return out.set(Math.sin(actor.yaw) * cp, Math.sin(actor.pitch), Math.cos(actor.yaw) * cp);
  }

  melee(attacker, heavy) {
    const w = attacker.def?.melee ? attacker.def : WEAPONS.knife;
    const eye = attacker.eye(_v);
    const fwd = this.aimOf(attacker, _fwd);
    let best = null;
    let bestD = Infinity;
    for (const a of this.actors) {
      if (a === attacker || !a.alive || this.allies(attacker, a)) continue;
      a.chest(_chest);
      _to.subVectors(_chest, eye);
      const d = _to.length();
      if (d > w.range + 0.5) continue;
      _to.divideScalar(d || 1);
      if (_to.dot(fwd) < (d < 1 ? 0.2 : 0.72)) continue;
      if (!this.physics.lineClear(eye, _chest)) continue;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    if (best) {
      _to.subVectors(best.position, attacker.position).setY(0).normalize();
      const facing = best.isPlayer ? _dir.set(-Math.sin(best.yaw), 0, -Math.cos(best.yaw)) : _dir.set(Math.sin(best.yaw), 0, Math.cos(best.yaw));
      const back = facing.dot(_to) > 0.45;
      const dmg = heavy ? (back ? w.backstab[1] : w.heavy) : back ? w.backstab[0] : w.damage;
      best.chest(_chest);
      this.bleed(_chest, fwd, heavy ? 1.6 : 1.1, true);
      this.audio.play('stab', { at: attacker.isPlayer ? null : _chest, volume: 0.8, rate: heavy ? 0.85 : 1 });
      this.damage(best, dmg, attacker, fwd, false, w);
      if (attacker.isPlayer) this.hud.hitmarker(false);
      return best;
    }
    const hit = this.physics.raycast(eye, fwd, w.range);
    if (hit) {
      this.effects.impact(hit.point, hit.normal, 0xdddddd, { decal: true, scale: 0.4 });
      this.audio.play('slash', { at: attacker.isPlayer ? null : hit.point, volume: 0.6 });
    }
    return null;
  }

  explode(pos, owner, def, scale = 1.2) {
    this.effects.explosion(pos, scale);
    this.audio.play('boom', { at: pos, volume: 1, ref: 12, max: 200, jitter: 0.04 });
    this.audio.play('crunch', { at: pos, volume: 0.8, ref: 10, max: 200, rate: 0.7 });
    const near = this.camera.position.distanceTo(pos);
    const felt = Math.max(0, 1 - near / (def.radius * 2.6));
    this.player.shake = Math.min(1.6, this.player.shake + felt * 1.5);
    if (felt > 0.15) this.hud.flash(Math.min(0.75, felt * 0.9));
    _cam.copy(pos).setY(pos.y + 0.3);
    for (const a of this.actors) {
      if (!a.alive) continue;
      if (owner && a !== owner && this.allies(owner, a)) continue;
      a.chest(_chest);
      const d = _chest.distanceTo(pos);
      if (d > def.radius) continue;
      const cover = d > 1.5 && !this.physics.lineClear(_cam, _chest) ? (def.bomb ? 0.92 : 0.55) : 1;
      const k = 1 - d / def.radius;
      this.damage(a, def.damage * k * Math.sqrt(k) * cover, owner || a, _dir.subVectors(_chest, pos).normalize(), false, def);
    }
    this.noise(pos, 30, owner);
  }

  damage(victim, amount, attacker, dir, head, w) {
    if (!victim.alive || victim.invulnerable > 0 || this.state !== 'playing' || this.roundOver) return;
    victim.health -= amount;
    victim.lastHurt = this.time;
    victim.lastAttacker = attacker;

    if (victim.isPlayer) {
      victim.shake = Math.min(1, victim.shake + amount / 35);
      if (attacker && attacker !== victim) this.hud.damageFrom(attacker.position);
      this.audio.play('impact', { volume: 0.6, rate: 0.8 });
    } else {
      victim.avatar.hit();
      victim.onDamaged(attacker, this);
    }
    if (attacker?.isPlayer && victim !== attacker) this.audio.play('hit', { volume: head ? 0.9 : 0.6, rate: head ? 1.35 : 1 });

    if (victim.health <= 0) this.kill(victim, attacker, dir, head, w);
  }

  kill(victim, killer, dir, head, w) {
    victim.alive = false;
    victim.health = 0;
    victim.deaths++;
    victim.streak = 0;
    victim.planting = false;
    victim.respawnAt = this.mode.respawn ? this.time + this.mode.respawnTime + (victim.isPlayer ? 0.8 : 0) : Infinity;
    victim.lastKiller = killer;
    if (this.mode.bomb) this.bomb.drop(victim);
    if (!this.mode.arms) {
      const at = victim.position.clone().setY(victim.position.y + 1);
      if (victim.isPlayer) {
        const gun = victim.owned('primary')[0] || victim.owned('secondary')[0];
        if (gun) this.drops.spawn(gun, at, victim.inventory[gun]);
      } else {
        this.drops.spawn(victim.weapon, at, { mag: victim.mag, reserve: Math.ceil((victim.def.reserve || 0) / 2) });
      }
    }

    const mine = killer?.isPlayer || victim.isPlayer;
    const enemy = killer && killer !== victim && !this.allies(killer, victim);
    if (enemy) {
      killer.kills++;
      killer.streak++;
      killer.bestStreak = Math.max(killer.bestStreak || 0, killer.streak);
      if (this.mode.teams && !this.mode.rounds) this.teamScore[killer.team]++;
    }
    this.hud.killfeed(killer, victim, w.id, head, mine);

    const chest = victim.chest(new THREE.Vector3());
    this.effects.blood(chest, dir || _dir.set(0, 0.3, 0), 1.8);
    const floor = this.physics.groundHeight(victim.position.x, victim.position.z, 0.2);
    setTimeout(() => {
      if (this.state === 'playing' || this.state === 'paused') this.effects.splat(_v.set(victim.position.x, floor, victim.position.z), _look.set(0, 1, 0), 1.7);
    }, 700);
    this.audio.play('death', { at: victim.isPlayer ? null : chest, volume: 0.7 });
    if (!victim.isPlayer) victim.avatar.die(dir);

    if (killer?.isPlayer && victim !== killer) this.playerKill(victim, head);
    else if (killer && !this.firstBlood) this.firstBlood = true;

    if (victim.isPlayer) {
      this.hud.died(killer !== victim ? killer : null);
      this.deathCam = { killer, from: this.camera.position.clone(), t: 0 };
    }

    if (this.mode.arms && enemy) this.advance(killer);
    this.checkWin(killer);
  }

  playerKill(victim, head) {
    const p = this.player;
    this.hud.hitmarker(head, true);
    this.audio.play('kill', { volume: 0.55 });
    const tag = head ? t('headshotTag') : p.streak >= 3 ? t('streakTag', { n: p.streak }) : '';
    this.hud.notice(`${t('killed')} ${victim.name.toUpperCase()}${tag ? `<small>${tag}</small>` : ''}`);

    this.multi = this.time - this.lastKillAt < 4 ? this.multi + 1 : 1;
    this.lastKillAt = this.time;
    const medals = [];
    if (!this.firstBlood) {
      this.firstBlood = true;
      medals.push('first_blood');
    }
    if (this.multi === 2) medals.push('double_kill');
    else if (this.multi === 3) medals.push('triple_kill');
    else if (this.multi >= 4) medals.push('rampage');
    if (p.streak === 5) medals.push('dominating');
    if (p.streak === 8 || p.streak === 12) medals.push('unstoppable');
    if (victim === p.lastKiller) {
      medals.push('payback');
      p.lastKiller = null;
    }
    if (!medals.length && head) medals.push('headshot');
    for (const m of medals) this.hud.medal(m);
  }

  advance(killer) {
    killer.level++;
    if (killer.level >= ARMS_RACE.length) {
      killer.level = ARMS_RACE.length - 1;
      this.finishSoon();
      return;
    }
    const id = ARMS_RACE[killer.level];
    if (killer.isPlayer) {
      killer.giveWeapon(id, this);
      this.audio.play('pickup', { volume: 0.7, rate: 1.2 });
      this.hud.toast(`${WEAPONS[id].name}`);
    } else {
      killer.equip(id);
    }
  }

  finishSoon() {
    if (this.ending) return;
    this.ending = true;
    setTimeout(() => this.state === 'playing' && this.endMatch(), 1400);
  }

  alive() {
    const n = { A: 0, B: 0 };
    for (const a of this.actors) if (a.alive && a.team) n[a.team]++;
    return n;
  }

  checkWin(killer) {
    const m = this.mode;
    if (m.rounds) {
      if (this.roundOver) return;
      const alive = this.alive();
      const p = this.player;
      if (p.alive && alive[p.team] === 1 && !this.finalStand && alive[p.team === 'A' ? 'B' : 'A'] > 1) {
        this.finalStand = true;
        this.hud.medal('final_stand');
      }
      if (m.bomb) {
        const att = this.attackers;
        const def = this.defenders;
        if (!alive[def]) this.endRound(att);
        else if (!alive[att] && this.bomb.state !== 'planted' && this.bomb.state !== 'exploded') this.endRound(def);
        return;
      }
      if (!alive.A || !alive.B) this.endRound(alive.A ? 'A' : alive.B ? 'B' : null);
      return;
    }
    if (m.arms) return;
    if (m.teams) {
      if (this.teamScore.A >= this.limit || this.teamScore.B >= this.limit) this.finishSoon();
    } else if (killer && killer.kills >= this.limit) {
      this.finishSoon();
    }
  }

  separate() {
    const list = this.actors;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6 || Math.abs(a.position.y - b.position.y) > 1.6) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / d / 2;
        a.position.x -= dx * push;
        a.position.z -= dz * push;
        b.position.x += dx * push;
        b.position.z += dz * push;
      }
    }
  }

  frame() {
    const raw = this.timer.getDelta();
    const dt = Math.min(0.05, raw);
    if (this.warmFrames > 0 && this.state === 'playing') {
      this.warmFrames--;
      this.prewarm();
    }
    try {
      if (this.state === 'playing' && this.renderer.adapt(raw)) this.downgrade();
      if (this.state === 'playing') this.update(dt);
      else if (this.state === 'menu' || this.state === 'loading') this.idle(dt);
    } catch (err) {
      this.report(err);
    }

    if (this.effects) this.effects.setScale(this.renderer.gl.domElement.height, this.camera.fov);
    this.audio.updateListener(this.camera);
    this.renderer.render(this.arena?.sun);
    this.hud.tickFps(raw);
    this.input.endFrame();
  }

  report(err) {
    if (this.time - this.errorAt > 2) console.error(err);
    this.errorAt = this.time;
  }

  idle(dt) {
    this.hud.hurt(0);
    if (!this.arena) return;
    this.orbit += dt * 0.05;
    const r = this.arena.half * 0.9;
    this.camera.position.set(Math.cos(this.orbit) * r, 13 + Math.sin(this.orbit * 2) * 2, Math.sin(this.orbit) * r);
    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 2, 0);
    this.pickups.animate(dt);
    this.effects.update(dt);
  }

  update(dt) {
    this.time += dt;
    if (this.input.locked) this.lockedAt = this.time;
    if (!this.roundOver && !(this.mode.bomb && this.bomb.planted)) this.clock -= dt;

    if (this.mode.rounds && this.freezeUntil && this.time >= this.freezeUntil) {
      this.freezeUntil = 0;
      this.freezeEnd = this.time;
      for (const a of this.actors) a.frozen = false;
      this.audio.play('vo_start', { volume: 0.8, jitter: 0 });
    }

    for (const a of this.actors) {
      if (!a.alive && a.respawnAt && this.time >= a.respawnAt) this.respawn(a);
      if (!a.alive && !a.isPlayer && a.avatar.deathT > 2.4) a.avatar.setVisible(false);
    }

    if (this.input.hit('KeyB') && !this.mode.arms) {
      this.wantLoadout = true;
      this.input.unlock();
    }

    this.player.update(dt, this);
    for (const b of this.bots) {
      try {
        b.update(dt, this);
      } catch (err) {
        this.report(err);
      }
    }
    this.separate();

    if (!this.player.alive && this.deathCam) this.updateDeathCam(dt);

    this.pickups.update(dt, this);
    this.drops.update(dt);
    this.grenades.update(dt, this);
    if (this.mode.bomb) this.bomb.update(dt);
    this.effects.update(dt);

    const p = this.player;
    this.viewmodel.update(dt, {
      alive: p.alive && !this.spectate,
      mouseX: this.input.dx,
      mouseY: this.input.dy,
      speed: Math.hypot(p.velocity.x, p.velocity.z),
      grounded: p.grounded,
      ads: p.ads,
      sprint: false,
      slide: false,
      crouch: p.crouch,
      planting: p.planting,
      scoped: p.scoped && !this.viewmodel.busy,
      mainCamera: this.camera,
    });

    const hurt = p.alive ? Math.max(0, 1 - p.health / 100) : 1;
    const recent = Math.max(0, 1 - (this.time - p.lastHurt) * 2);
    this.hurt += (Math.min(1, hurt * 0.5 + recent * 0.6) - this.hurt) * Math.min(1, dt * 8);
    this.hud.hurt(this.spectate ? 0 : this.hurt);
    this.hud.smoke(this.grenades.inside(this.camera.position));

    this.hud.target(p.alive ? this.aimedActor() : null);
    this.hud.update(dt, this);
    this.radar.draw(this);

    if (this.clock <= 0 && !this.roundOver) {
      this.clock = 0;
      if (this.mode.bomb) {
        if (!this.bomb.planted) this.endRound(this.defenders, 'time');
      } else if (this.mode.rounds) {
        const alive = this.alive();
        this.endRound(alive.A === alive.B ? null : alive.A > alive.B ? 'A' : 'B', 'time');
      } else {
        this.endMatch();
      }
    }
  }

  aimedActor() {
    const origin = this.camera.getWorldPosition(_v);
    const dir = this.camera.getWorldDirection(_look);
    const wall = this.physics.raycast(origin, dir, 60);
    let dist = wall ? wall.distance : 60;
    let found = null;
    for (const b of this.bots) {
      const h = b.rayHit(origin, dir);
      if (h && h.distance < dist) {
        dist = h.distance;
        found = b;
      }
    }
    if (found && this.grenades.blocks(origin, found.chest(_chest))) return null;
    return found;
  }

  updateDeathCam(dt) {
    const dc = this.deathCam;
    if (!dc.init) {
      dc.init = true;
      dc.yaw = this.player.yaw;
      dc.pitch = this.player.pitch;
      dc.roll = (Math.random() < 0.5 ? -1 : 1) * 0.5;
    }
    dc.t += dt;
    if (this.mode.rounds && dc.t > 2.6) {
      this.updateSpectate(dt);
      return;
    }
    const k = Math.min(1, dc.t / 0.55);
    const fall = k * k;
    const p = this.player.position;
    this.camera.position.set(p.x, p.y + THREE.MathUtils.lerp(1.62, 0.32, fall), p.z);

    const killer = dc.killer && dc.killer !== this.player && dc.killer.alive ? dc.killer : null;
    if (killer && dc.t > 0.6) {
      killer.chest(_dir).sub(this.camera.position);
      const yaw = Math.atan2(-_dir.x, -_dir.z);
      const pitch = Math.atan2(_dir.y, Math.hypot(_dir.x, _dir.z));
      const d = Math.atan2(Math.sin(yaw - dc.yaw), Math.cos(yaw - dc.yaw));
      const s = Math.min(1, dt * 2.5);
      dc.yaw += d * s;
      dc.pitch += (pitch - dc.pitch) * s;
    } else {
      dc.pitch += (-0.15 - dc.pitch) * Math.min(1, dt * 3);
    }
    this.camera.quaternion.setFromEuler(_euler.set(dc.pitch, dc.yaw, dc.roll * fall));
    this.camera.fov += (70 - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
  }

  updateSpectate(dt) {
    const p = this.player;
    const pool = this.bots.filter((b) => b.alive && (!p.team || b.team === p.team));
    const list = pool.length ? pool : this.bots.filter((b) => b.alive);
    if (!list.length) return;
    let s = this.spectate;
    const next = this.input.mouseHit(0) || this.input.hit('Space');
    if (!s || !s.target.alive || next) {
      const i = s ? list.indexOf(s.target) : -1;
      const target = list[(i + 1) % list.length];
      s = this.spectate = { target, yaw: target.yaw, init: !s };
    }
    const b = s.target;
    s.yaw += Math.atan2(Math.sin(b.yaw - s.yaw), Math.cos(b.yaw - s.yaw)) * Math.min(1, dt * 6);
    const eye = b.eye(_v);
    _dir.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    _look.copy(eye).addScaledVector(_dir, 3.1).setY(eye.y + 0.55);
    _to.subVectors(_look, eye);
    const len = _to.length();
    _to.divideScalar(len);
    const hit = this.physics.raycast(eye, _to, len);
    this.camera.position.copy(eye).addScaledVector(_to, hit ? Math.max(0.3, hit.distance - 0.3) : len);
    _chest.copy(eye).addScaledVector(_fwd.set(Math.sin(s.yaw), 0, Math.cos(s.yaw)), 6);
    this.camera.lookAt(_chest);
    this.camera.fov += (74 - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
  }
}
