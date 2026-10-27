import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { WEAPONS } from './weapons.js';
import { buildGun } from './guns.js';
import { solveArm, aimBone } from '../actors/ik.js';
import { curlFingers } from '../actors/Avatar.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _target = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _hq = new THREE.Quaternion();
const _hs = new THREE.Vector3();
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _wq = new THREE.Quaternion();
const _iq = new THREE.Quaternion();

const ARM_BONES = /^(upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)_/;
const ARM_SCALE = 1.45;
const ZERO = [0, 0, 0];
const AXIS_X = new THREE.Vector3(1, 0, 0);

function damp(a, b, k, dt) {
  return a + (b - a) * (1 - Math.exp(-k * dt));
}

function ease(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

function sample(track, t, out) {
  if (t <= track[0][0]) return typeof track[0][1] === 'number' ? track[0][1] : out.copy(track[0][1]);
  for (let i = 1; i < track.length; i++) {
    const [t1, v1] = track[i];
    if (t <= t1) {
      const [t0, v0] = track[i - 1];
      const k = ease((t - t0) / (t1 - t0 || 1));
      if (typeof v0 === 'number') return v0 + (v1 - v0) * k;
      return out.copy(v0).lerp(v1, k);
    }
  }
  const last = track[track.length - 1][1];
  return typeof last === 'number' ? last : out.copy(last);
}

function armsOnly(mesh) {
  const bones = mesh.skeleton.bones;
  const keep = bones.map((b) => ARM_BONES.test(b.name));
  const g = mesh.geometry;
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const dominant = (vi) => {
    let best = 0;
    let w = -1;
    for (let k = 0; k < 4; k++) {
      const wk = sw.getComponent(vi, k);
      if (wk > w) {
        w = wk;
        best = si.getComponent(vi, k);
      }
    }
    return keep[best];
  };
  const index = g.index ? g.index.array : Array.from({ length: g.attributes.position.count }, (_, i) => i);
  const out = [];
  for (let i = 0; i < index.length; i += 3) {
    if (dominant(index[i]) && dominant(index[i + 1]) && dominant(index[i + 2])) out.push(index[i], index[i + 1], index[i + 2]);
  }
  const geo = g.clone();
  geo.setIndex(out);
  geo.clearGroups();
  return geo;
}

function shellMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0xc8352b, roughness: 0.5 }));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.014, 8), new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.3, metalness: 0.8 }));
  cap.position.y = -0.03;
  g.add(body, cap);
  g.rotation.x = Math.PI / 2;
  return g;
}

function rig(def, fx) {
  const holder = new THREE.Group();
  const gun = buildGun(def.id);
  gun.root.scale.setScalar(def.view.scale);
  holder.add(gun.root);
  const points = {};
  for (const [k, p] of Object.entries(gun.points)) points[k] = p.clone().multiplyScalar(def.view.scale);
  points.fore ||= points.grip;
  if (def.view.flip) {
    gun.root.rotation.x = Math.PI;
    for (const p of Object.values(points)) p.applyAxisAngle(AXIS_X, Math.PI);
  }

  const muzzle = new THREE.Object3D();
  muzzle.position.copy(points.muzzle);
  holder.add(muzzle);

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: fx.muzzle_05,
    color: new THREE.Color(def.color).multiplyScalar(2.2),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  }));
  flash.visible = false;
  muzzle.add(flash);

  holder.visible = false;
  return {
    holder,
    gun,
    muzzle,
    flash,
    points,
    mag: gun.mag,
    magHome: gun.mag?.position.clone(),
    pump: gun.pump,
    pumpHome: gun.pump?.position.clone(),
  };
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const K = (t, x, y, z) => [t, V(x, y, z)];

const MOVES = {
  swipe: {
    mirror: true,
    pos: [K(0, 0, 0, 0), K(0.18, 0.06, 0.04, 0.04), K(0.42, -0.16, -0.02, -0.08), K(0.6, -0.2, -0.07, -0.04), K(1, 0, 0, 0)],
    yaw: [[0, 0], [0.18, -0.5], [0.42, 0.95], [0.6, 1.1], [1, 0]],
    roll: [[0, 0], [0.18, 0.5], [0.42, -1], [0.6, -1.1], [1, 0]],
    pitch: [[0, 0], [0.18, 0.15], [0.42, -0.25], [0.6, -0.35], [1, 0]],
  },
  sweep: {
    mirror: true,
    pos: [K(0, 0, 0, 0), K(0.22, 0.1, 0.05, 0.06), K(0.45, -0.24, -0.02, -0.1), K(0.64, -0.3, -0.08, -0.04), K(1, 0, 0, 0)],
    yaw: [[0, 0], [0.22, -0.8], [0.45, 1.3], [0.64, 1.5], [1, 0]],
    roll: [[0, 0], [0.22, 0.6], [0.45, -1.1], [0.64, -1.2], [1, 0]],
    pitch: [[0, 0], [0.22, 0.2], [0.45, -0.2], [0.64, -0.3], [1, 0]],
  },
  stab: {
    pos: [K(0, 0, 0, 0), K(0.3, 0.02, 0.05, 0.1), K(0.45, -0.06, -0.01, -0.24), K(0.62, -0.06, -0.02, -0.22), K(1, 0, 0, 0)],
    yaw: [[0, 0], [0.3, -0.15], [0.45, 0.1], [1, 0]],
    roll: [[0, 0], [0.3, -0.3], [0.45, -0.1], [1, 0]],
    pitch: [[0, 0], [0.3, 0.35], [0.45, -0.15], [0.62, -0.12], [1, 0]],
    jolt: 0.45,
  },
  chop: {
    mirror: true,
    pos: [K(0, 0, 0, 0), K(0.28, 0.04, 0.1, 0.06), K(0.48, -0.1, -0.12, -0.12), K(0.62, -0.12, -0.15, -0.08), K(1, 0, 0, 0)],
    yaw: [[0, 0], [0.28, -0.2], [0.48, 0.45], [0.62, 0.5], [1, 0]],
    roll: [[0, 0], [0.28, 0.35], [0.48, -0.5], [0.62, -0.55], [1, 0]],
    pitch: [[0, 0], [0.28, 0.85], [0.48, -0.75], [0.62, -0.85], [1, 0]],
  },
  diagonal: {
    pos: [K(0, 0, 0, 0), K(0.25, 0.07, 0.14, 0.04), K(0.48, -0.18, -0.14, -0.1), K(0.65, -0.2, -0.2, -0.05), K(1, 0, 0, 0)],
    yaw: [[0, 0], [0.25, -0.35], [0.48, 0.7], [0.65, 0.75], [1, 0]],
    roll: [[0, 0], [0.25, 0.7], [0.48, -0.8], [0.65, -0.9], [1, 0]],
    pitch: [[0, 0], [0.25, 0.7], [0.48, -0.8], [0.65, -0.95], [1, 0]],
  },
  overhead: {
    pos: [K(0, 0, 0, 0), K(0.4, -0.04, 0.26, 0.14), K(0.55, -0.06, -0.14, -0.2), K(0.7, -0.06, -0.16, -0.18), K(1, 0, 0, 0)],
    yaw: [[0, 0], [0.4, 0.2], [0.55, -0.1], [1, 0]],
    roll: [[0, 0], [0.4, -0.2], [0.55, 0], [1, 0]],
    pitch: [[0, 0], [0.4, 1.5], [0.55, -1.1], [0.7, -1.05], [1, 0]],
    jolt: 0.55,
  },
  hammer: {
    pos: [K(0, 0, 0, 0), K(0.3, -0.02, 0.2, 0.06), K(0.45, -0.06, -0.14, -0.16), K(0.6, -0.06, -0.15, -0.15), K(1, 0, 0, 0)],
    yaw: [[0, 0], [0.3, 0.15], [0.45, -0.1], [1, 0]],
    roll: [[0, 0], [0.3, -0.2], [0.45, 0.05], [1, 0]],
    pitch: [[0, 0], [0.3, 0.7], [0.45, -0.8], [0.6, -0.75], [1, 0]],
    jolt: 0.45,
  },
  slam: {
    pos: [K(0, 0, 0, 0), K(0.42, -0.05, 0.28, 0.1), K(0.58, -0.08, -0.2, -0.22), K(0.72, -0.08, -0.21, -0.2), K(1, 0, 0, 0)],
    yaw: [[0, 0], [0.42, 0.25], [0.58, -0.15], [1, 0]],
    roll: [[0, 0], [0.42, -0.35], [0.58, 0.1], [1, 0]],
    pitch: [[0, 0], [0.42, 1], [0.58, -1.1], [0.72, -1.05], [1, 0]],
    jolt: 0.58,
  },
  throw: {
    pos: [K(0, 0, 0, 0), K(0.14, -0.03, 0.04, 0), K(0.24, -0.02, 0.03, 0.02), K(0.4, 0.07, 0.13, 0.2), K(0.48, -0.08, 0.03, -0.26), K(0.62, -0.12, -0.2, -0.14), K(1, -0.12, -0.45, 0)],
    pitch: [[0, 0], [0.14, 0.2], [0.24, 0.25], [0.4, 0.95], [0.48, -0.55], [0.62, -1], [1, -1.2]],
    roll: [[0, 0], [0.14, -0.15], [0.4, 0.35], [0.48, 0], [0.62, -0.25], [1, -0.3]],
    yaw: [[0, 0], [0.4, -0.25], [0.48, 0.15], [1, 0.2]],
    hand: [K(0, -0.22, -0.2, 0.15), K(0.1, -0.03, 0.08, 0.01), K(0.16, -0.02, 0.07, 0), K(0.26, -0.14, 0.02, 0.1), K(0.4, -0.3, -0.18, 0.15), K(1, -0.35, -0.3, 0.2)],
    pin: 0.17,
    hide: 0.5,
  },
  lob: {
    pos: [K(0, 0, 0, 0), K(0.14, -0.03, 0.04, 0), K(0.24, -0.02, 0.02, 0.02), K(0.4, 0.04, -0.14, 0.12), K(0.5, -0.04, 0.02, -0.22), K(0.66, -0.06, 0.06, -0.18), K(1, -0.06, -0.4, 0)],
    pitch: [[0, 0], [0.14, 0.2], [0.4, -0.6], [0.5, 0.35], [0.66, 0.5], [1, 0]],
    roll: [[0, 0], [0.14, -0.15], [0.4, -0.2], [0.5, 0.1], [1, 0]],
    yaw: [[0, 0], [0.4, 0.15], [0.5, -0.05], [1, 0]],
    hand: [K(0, -0.22, -0.2, 0.15), K(0.1, -0.03, 0.08, 0.01), K(0.16, -0.02, 0.07, 0), K(0.26, -0.14, 0.02, 0.1), K(0.4, -0.3, -0.18, 0.15), K(1, -0.35, -0.3, 0.2)],
    pin: 0.17,
    hide: 0.52,
  },
};

const DRAWS = {
  gun: {
    pos: [K(0, 0.07, -0.3, 0.06), K(0.55, -0.004, 0.012, -0.008), K(0.78, 0.002, -0.004, 0.002), K(1, 0, 0, 0)],
    pitch: [[0, -0.95], [0.55, 0.07], [0.78, -0.02], [1, 0]],
    roll: [[0, 0.7], [0.55, -0.05], [1, 0]],
    yaw: [[0, -0.35], [0.55, 0.04], [1, 0]],
    sounds: [[0.55, 'jolt', 0.5]],
  },
  flip: {
    pos: [K(0, 0.05, -0.26, 0.04), K(0.35, 0.02, -0.04, 0.02), K(0.7, -0.004, 0.01, 0), K(1, 0, 0, 0)],
    pitch: [[0, -0.7], [0.35, -0.2], [0.7, 0.05], [1, 0]],
    roll: [[0, -3.14], [0.35, -1.2], [0.7, 0.08], [1, 0]],
    yaw: [[0, 0.3], [0.7, -0.03], [1, 0]],
    sounds: [[0.7, 'jolt', 0.4]],
  },
  toss: {
    pos: [K(0, 0.02, -0.18, 0), K(0.2, 0, 0.02, 0), K(0.5, -0.02, 0.14, -0.02), K(0.74, 0, 0.0, 0), K(0.86, 0, -0.012, 0), K(1, 0, 0, 0)],
    pitch: [[0, -0.4], [0.2, 0], [0.74, -6.28], [1, -6.28]],
    roll: [[0, 0.3], [0.2, 0], [1, 0]],
    yaw: [[0, 0], [1, 0]],
    sounds: [[0.22, 'swoosh', 1.4], [0.74, 'jolt', 0.9]],
  },
  sheath: {
    pos: [K(0, 0.14, 0.28, 0.14), K(0.45, 0.01, 0.02, 0.01), K(0.7, -0.004, -0.012, 0), K(1, 0, 0, 0)],
    pitch: [[0, 1.3], [0.45, -0.1], [0.7, 0.03], [1, 0]],
    roll: [[0, 1.2], [0.45, -0.08], [1, 0]],
    yaw: [[0, -0.5], [0.45, 0.05], [1, 0]],
    sounds: [[0.45, 'jolt', 0.6]],
  },
  catch: {
    pos: [K(0, 0.04, -0.26, 0.04), K(0.6, -0.003, 0.012, -0.004), K(0.82, 0.001, -0.004, 0.001), K(1, 0, 0, 0)],
    pitch: [[0, -0.7], [0.6, 0.08], [0.82, -0.02], [1, 0]],
    roll: [[0, 0.55], [0.6, -0.05], [1, 0]],
    yaw: [[0, -0.35], [0.6, 0.04], [1, 0]],
    sounds: [[0.6, 'jolt', 0.5]],
  },
};

const INSPECT = {
  pos: [[0, V(0, 0, 0)], [0.18, V(-0.09, 0.05, 0.07)], [0.5, V(-0.09, 0.05, 0.07)], [0.62, V(-0.05, 0.08, 0.05)], [0.86, V(-0.05, 0.08, 0.05)], [1, V(0, 0, 0)]],
  yaw: [[0, 0], [0.18, 0.95], [0.48, 1.05], [0.62, -0.15], [0.86, -0.25], [1, 0]],
  roll: [[0, 0], [0.18, -0.55], [0.48, -0.6], [0.62, 0.75], [0.86, 0.8], [1, 0]],
  pitch: [[0, 0], [0.18, 0.12], [0.5, 0.18], [0.62, 0.25], [0.86, 0.2], [1, 0]],
};

export class Viewmodel {
  constructor(renderer, assets, audio) {
    this.audio = audio;
    this.camera = renderer.viewCamera;
    this.scene = renderer.viewScene;
    this.scene.add(this.camera);
    this.scene.environment = assets.sky;
    this.scene.environmentIntensity = 0.8;

    const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
    key.position.set(-40, 62, 28);
    this.fill = new THREE.HemisphereLight(0xd8e6ff, 0x5a4a3c, 0.9);
    this.scene.add(key, this.fill);

    this.light = new THREE.PointLight(0xffaa55, 0, 3, 2);
    this.camera.add(this.light);

    this.rig = new THREE.Group();
    this.camera.add(this.rig);

    this.models = {};
    for (const w of Object.values(WEAPONS)) {
      const r = rig(w, assets.fx);
      this.rig.add(r.holder);
      this.models[w.id] = r;
    }

    this.buildArms(assets.hq.male);

    this.loose = [];
    this.spare = null;
    this.shell = shellMesh();
    this.shell.visible = false;
    this.rig.add(this.shell);

    this.current = null;
    this.sway = new THREE.Vector2();
    this.swayVel = new THREE.Vector2();
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.kick = 0;
    this.kickRot = 0;
    this.jolt = 0;
    this.flashT = 0;
    this.ads = 0;
    this.land = 0;
    this.tilt = 0;
    this.crouch = 0;
    this.planting = 0;
    this.action = null;
  }

  buildArms(kind) {
    const body = cloneSkinned(kind.scene);
    body.scale.setScalar(ARM_SCALE);
    body.rotation.y = Math.PI;
    this.armsPbr = new THREE.MeshStandardMaterial({ roughness: 0.75 });
    this.armsFast = new THREE.MeshLambertMaterial();
    this.bones = {};
    const drop = [];
    body.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) {
        if (o.material.name !== kind.bodyMaterial) {
          drop.push(o);
          return;
        }
        o.geometry = armsOnly(o);
        o.material = this.armsPbr;
        o.userData.ownShading = true;
        o.frustumCulled = false;
        o.castShadow = false;
        this.armMesh = o;
      }
    });
    for (const o of drop) o.removeFromParent();
    const alias = { RightArm: 'upperarm_r', RightForeArm: 'lowerarm_r', RightHand: 'hand_r', LeftArm: 'upperarm_l', LeftForeArm: 'lowerarm_l', LeftHand: 'hand_l', RightHandIndex3_end: 'middle_01_r', LeftHandIndex3_end: 'middle_01_l' };
    for (const [k, v] of Object.entries(alias)) this.bones[k] = this.bones[v];
    this.arms = body;
    this.rig.add(body);
    body.updateMatrixWorld(true);
    const shoulder = this.bones.RightArm.getWorldPosition(new THREE.Vector3());
    this.camera.worldToLocal(shoulder);
    body.position.set(0.05, -0.45 - shoulder.y, 0.12 - shoulder.z);
    this.rest = new Map(Object.values(this.bones).map((b) => [b, b.quaternion.clone()]));
  }

  setSkin(skin) {
    this.armsPbr.map = skin;
    this.armsFast.map = skin;
    this.armsPbr.needsUpdate = true;
    this.armsFast.needsUpdate = true;
  }

  setShading(fast) {
    this.armMesh.material = fast ? this.armsFast : this.armsPbr;
    this.fill.intensity = fast ? 1.6 : 0.9;
  }

  show(id) {
    for (const [k, m] of Object.entries(this.models)) {
      m.holder.visible = k === id;
      m.gun.root.visible = true;
      m.flash.visible = false;
    }
    this.flashT = 0;
    this.current = id;
    this.cancelAction();
    const def = WEAPONS[id];
    const kind = def?.anim?.draw || 'gun';
    const time = { gun: def?.slot === 'secondary' ? 0.42 : 0.55, flip: 0.5, toss: 0.62, sheath: 0.6, catch: 0.55 }[kind] || 0.5;
    this.action = { id, duration: time, t: 0, fired: new Set(), style: 'draw', kind };
  }

  get busy() {
    return !!this.action && this.action.style !== 'inspect' && this.action.style !== 'draw';
  }

  cancelAction() {
    const a = this.action;
    if (a) {
      const m = this.models[a.id];
      if (m.mag) {
        m.mag.visible = true;
        m.mag.position.copy(m.magHome);
      }
      if (m.pump) m.pump.position.copy(m.pumpHome);
    }
    this.action = null;
    if (this.spare) this.spare.visible = false;
    this.shell.visible = false;
  }

  startReload(id, duration, rounds) {
    this.cancelAction();
    const def = WEAPONS[id];
    const m = this.models[id];
    const style = def.reloadStyle;
    this.action = { id, duration, t: 0, rounds: Math.max(1, Math.min(4, rounds)), fired: new Set(), style };
    if (style !== 'shells') this.action.track = this.magTrack(m, style === 'pistol');
    if (m.mag) {
      if (this.spare) this.spare.removeFromParent();
      this.spare = m.mag.clone();
      this.spare.visible = false;
      this.rig.add(this.spare);
    }
  }

  startBolt(id, duration) {
    this.cancelAction();
    this.action = { id, duration, t: 0, fired: new Set(), style: 'bolt' };
  }

  melee(heavy) {
    const anim = WEAPONS[this.current].anim;
    const side = this.lastSide === 1 ? -1 : 1;
    this.lastSide = side;
    this.cancelAction();
    this.action = { id: this.current, duration: heavy ? anim.heavyTime : anim.lightTime, t: 0, fired: new Set(), style: heavy ? anim.heavy : anim.light, side };
    const big = heavy || anim.light === 'sweep';
    this.audio.play('swoosh', { volume: big ? 0.6 : 0.45, rate: (heavy ? 0.8 : 1.1) * (anim.light === 'sweep' ? 0.85 : 1) });
  }

  throwGrenade(lob) {
    this.cancelAction();
    this.action = { id: this.current, duration: 0.62, t: 0, fired: new Set(), style: lob ? 'lob' : 'throw', lob };
  }

  inspect() {
    if (this.action || !this.current) return;
    const def = WEAPONS[this.current];
    this.action = { id: this.current, duration: def.melee ? 2 : 2.6, t: 0, fired: new Set(), style: 'inspect' };
  }

  magTrack(m, pistol) {
    const p = m.points;
    const at = (base, x, y, z) => base.clone().add(V(x, y, z));
    if (pistol) {
      const below = at(p.well, -0.04, -0.18, 0.03);
      return {
        hand: [
          [0, p.fore], [0.12, at(p.well, -0.01, -0.02, 0)], [0.2, at(p.well, -0.02, -0.12, 0)], [0.36, below], [0.5, below],
          [0.6, at(p.well, 0, -0.07, 0)], [0.66, at(p.well, 0, -0.01, 0)], [0.74, at(p.handle, -0.03, 0.03, -0.04)],
          [0.8, at(p.handle, -0.01, 0.02, -0.03)], [0.86, at(p.handle, -0.01, 0.02, 0.06)], [1, p.fore],
        ],
        pos: [[0, V(0, 0, 0)], [0.12, V(-0.05, 0.04, 0.03)], [0.66, V(-0.05, 0.04, 0.03)], [0.8, V(-0.03, 0.02, 0.01)], [1, V(0, 0, 0)]],
        roll: [[0, 0], [0.12, -0.7], [0.62, -0.62], [0.7, -0.2], [0.8, 0.35], [0.9, 0.2], [1, 0]],
        pitch: [[0, 0], [0.12, 0.3], [0.62, 0.26], [0.68, 0.42], [0.8, 0.12], [1, 0]],
        yaw: [[0, 0], [0.12, 0.25], [0.66, 0.22], [0.8, -0.15], [1, 0]],
        events: [[0.18, 'out'], [0.4, 'grab'], [0.65, 'in'], [0.86, 'slide']],
      };
    }
    const below = at(p.well, 0.05, -0.2, 0.02);
    return {
      hand: [
        [0, p.fore], [0.1, at(p.well, 0, -0.02, 0)], [0.17, at(p.well, 0, -0.12, 0.01)], [0.32, below], [0.46, below],
        [0.58, at(p.well, 0, -0.09, 0)], [0.64, at(p.well, 0, -0.01, 0)], [0.71, at(p.well, 0, -0.03, 0.02)],
        [0.78, at(p.handle, 0, 0.01, -0.02)], [0.84, at(p.handle, 0, 0.01, 0.08)], [0.9, at(p.handle, 0, 0.01, 0.02)], [1, p.fore],
      ],
      pos: [[0, V(0, 0, 0)], [0.1, V(-0.025, -0.015, 0.05)], [0.62, V(-0.03, -0.01, 0.05)], [0.78, V(-0.02, 0.03, 0.03)], [0.9, V(-0.015, 0.025, 0.02)], [1, V(0, 0, 0)]],
      roll: [[0, 0], [0.1, 0.52], [0.6, 0.48], [0.66, 0.34], [0.76, -0.28], [0.9, -0.24], [1, 0]],
      pitch: [[0, 0], [0.1, 0.2], [0.6, 0.16], [0.64, 0.3], [0.7, 0.14], [0.84, 0.08], [1, 0]],
      yaw: [[0, 0], [0.1, -0.18], [0.62, -0.16], [0.76, 0.22], [0.9, 0.18], [1, 0]],
      events: [[0.16, 'out'], [0.4, 'grab'], [0.63, 'in'], [0.84, 'slide']],
    };
  }

  updateAction(dt, holder, m, pose) {
    const mdl = m;
    const a = this.action;
    a.t += dt / a.duration;
    const t = Math.min(1, a.t);
    const p = m.points;

    if (a.style === 'bolt') {
      const k = Math.sin(Math.min(1, t / 0.85) * Math.PI);
      pose.hand = p.handle.clone().lerp(p.fore, 1 - Math.min(1, k * 2.2));
      if (k > 0.35) pose.hand = p.handle.clone().add(_w.set(0.02, 0.02, 0.06 * Math.sin(Math.min(1, (t - 0.2) / 0.5) * Math.PI)));
      pose.roll = 0.3 * k;
      pose.pitch = 0.1 * k;
      pose.yaw = -0.15 * k;
      if (t > 0.35 && !a.fired.has('b')) {
        a.fired.add('b');
        this.audio.play('slide', { volume: 0.55, rate: 0.85 });
      }
    } else if (a.style === 'shells') {
      const loops = a.rounds;
      const span = 0.78;
      if (t <= span) {
        const k = (t / span) * loops;
        const i = Math.min(loops - 1, Math.floor(k));
        const f = k - i;
        const away = p.port.clone().add(_w.set(0.04, -0.22, -0.02));
        const port = p.port.clone().add(_w.set(0, -0.015, 0));
        pose.hand = f < 0.45 ? away.lerp(port, ease(f / 0.45)) : port.add(_w.set(0, 0, -0.05 * ease((f - 0.45) / 0.55)));
        this.shell.visible = f < 0.72;
        if (this.shell.visible) {
          this.shell.position.copy(pose.hand).add(_w.set(0, 0.012, 0)).applyMatrix4(holder.matrix);
          this.shell.quaternion.copy(holder.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
        }
        if (f > 0.55 && !a.fired.has(`s${i}`)) {
          a.fired.add(`s${i}`);
          this.audio.play('shell', { volume: 0.45, rate: 1.3 });
          this.jolt = 0.35;
        }
        pose.roll = -0.55 * ease(t / 0.1);
        pose.pitch = 0.16 * ease(t / 0.1);
        pose.yaw = 0.2 * ease(t / 0.1);
        pose.pos.set(-0.04, 0.03, 0.02).multiplyScalar(ease(t / 0.1));
      } else {
        this.shell.visible = false;
        const f = (t - span) / (1 - span);
        const back = Math.sin(Math.min(1, f / 0.7) * Math.PI);
        if (m.pump) m.pump.position.z = m.pumpHome.z + 0.09 * back;
        pose.hand = p.fore.clone().add(_w.set(0, 0, 0.09 * back));
        pose.roll = -0.55 * (1 - ease(f)) + back * 0.15;
        pose.pitch = 0.16 * (1 - ease(f)) + back * 0.06;
        pose.yaw = 0.2 * (1 - ease(f));
        pose.pos.set(-0.04, 0.03, 0.02).multiplyScalar(1 - ease(f));
        if (f > 0.15 && !a.fired.has('pump')) {
          a.fired.add('pump');
          this.audio.play('pump', { volume: 0.6 });
        }
      }
    } else if (a.style === 'pump') {
      const back = Math.sin(Math.min(1, t / 0.8) * Math.PI);
      if (m.pump) m.pump.position.z = m.pumpHome.z + 0.09 * back;
      pose.hand = p.fore.clone().add(_w.set(0, 0, 0.09 * back));
      pose.pitch = back * 0.08;
      pose.roll = back * 0.18;
      if (t > 0.1 && !a.fired.has('pump')) {
        a.fired.add('pump');
        this.audio.play('pump', { volume: 0.5, rate: 1.1 });
      }
    } else if (a.style === 'draw') {
      const d = DRAWS[a.kind] || DRAWS.gun;
      pose.pos.copy(sample(d.pos, t, _w));
      pose.pitch = sample(d.pitch, t);
      pose.roll = sample(d.roll, t);
      pose.yaw = sample(d.yaw, t);
      for (const [at, sound, rate] of d.sounds || []) {
        if (t < at || a.fired.has(at)) continue;
        a.fired.add(at);
        if (sound === 'jolt') this.jolt = rate;
        else this.audio.play(sound, { volume: 0.35, rate });
      }
      for (const [at, sound, rate, volume] of WEAPONS[a.id].drawSounds || []) {
        const key = `w${at}${sound}`;
        if (t < at || a.fired.has(key)) continue;
        a.fired.add(key);
        this.audio.play(sound, { volume, rate });
      }
    } else if (MOVES[a.style]) {
      const m = MOVES[a.style];
      const side = a.side || 1;
      const k = sample(m.pos, t, _w);
      pose.pos.set(k.x * (m.mirror ? side : 1), k.y, k.z);
      pose.pitch = sample(m.pitch, t);
      pose.roll = sample(m.roll, t) * (m.mirror ? side : 1);
      pose.yaw = sample(m.yaw, t) * (m.mirror ? side : 1);
      if (m.hand) {
        const h = sample(m.hand, t, _hand);
        pose.hand = p.grip.clone().add(h);
      }
      if (m.pin && t >= m.pin && !a.fired.has('pin')) {
        a.fired.add('pin');
        this.audio.play('slide', { volume: 0.4, rate: 1.7 });
      }
      if (m.hide && t >= m.hide) mdl.gun.root.visible = false;
      if (m.jolt && t >= m.jolt && !a.fired.has('jolt')) {
        a.fired.add('jolt');
        this.jolt = -0.9;
      }
    } else if (a.style === 'inspect') {
      pose.pos.copy(sample(INSPECT.pos, t, _w));
      pose.yaw = sample(INSPECT.yaw, t);
      pose.roll = sample(INSPECT.roll, t);
      pose.pitch = sample(INSPECT.pitch, t);
    } else {
      const tr = a.track;
      pose.hand = sample(tr.hand, t, new THREE.Vector3());
      pose.roll = sample(tr.roll, t);
      pose.pitch = sample(tr.pitch, t);
      pose.yaw = sample(tr.yaw, t);
      pose.pos.copy(sample(tr.pos, t, _w));
      for (const [at, name] of tr.events) {
        if (t < at || a.fired.has(name)) continue;
        a.fired.add(name);
        if (name === 'out') {
          this.audio.play('magout', { volume: 0.55 });
          this.jolt = -0.5;
          if (m.mag) {
            m.mag.visible = false;
            this.dropMag(m, holder);
          }
        } else if (name === 'grab') {
          if (this.spare) this.spare.visible = true;
        } else if (name === 'in') {
          this.audio.play('magin', { volume: 0.7 });
          this.jolt = 1;
          if (this.spare) this.spare.visible = false;
          if (m.mag) m.mag.visible = true;
        } else if (name === 'slide') {
          this.audio.play('slide', { volume: 0.6, rate: 1.2 });
          this.kick = 0.7;
          this.jolt = 0.6;
        }
      }
      if (this.spare?.visible && m.mag) {
        _hand.copy(pose.hand);
        _hand.y = Math.min(_hand.y - 0.02, m.magHome.y);
        this.spare.scale.copy(m.mag.scale).multiplyScalar(m.gun.root.scale.x);
        this.spare.position.copy(_hand).applyMatrix4(holder.matrix);
        this.spare.quaternion.copy(holder.quaternion).multiply(m.mag.quaternion);
      }
    }

    if (a.t >= 1) {
      const done = a.style;
      this.cancelAction();
      if (done === 'throw' || done === 'lob') m.gun.root.visible = false;
    }
  }

  dropMag(m, holder) {
    const loose = m.mag.clone();
    loose.visible = true;
    loose.scale.multiplyScalar(m.gun.root.scale.x);
    holder.updateMatrix();
    loose.position.copy(m.magHome).multiplyScalar(m.gun.root.scale.x).applyMatrix4(holder.matrix);
    loose.quaternion.copy(holder.quaternion);
    this.rig.add(loose);
    this.loose.push({ obj: loose, vel: new THREE.Vector3(-0.2, -0.7, 0.08), spin: new THREE.Vector3(3, 0.5, 4), t: 0 });
  }

  fire(pump) {
    const w = WEAPONS[this.current];
    if (this.action?.style === 'inspect') this.cancelAction();
    this.kick = Math.min(1.6, this.kick + 1);
    this.kickRot = Math.min(1.5, this.kickRot + 1 + w.kick * 10);
    this.flashT = 0.045;
    const m = this.models[this.current];
    m.flash.visible = true;
    m.flash.material.rotation = Math.random() * Math.PI * 2;
    m.flash.scale.setScalar(0.1 + Math.random() * 0.06 + (w.pellets > 1 ? 0.08 : 0) + (w.damage > 50 ? 0.06 : 0));
    this.light.color.set(w.color);
    this.light.intensity = 4;
    if (pump) {
      this.cancelAction();
      this.action = { id: this.current, duration: 0.55, t: -0.35, fired: new Set(), style: 'pump' };
    }
  }

  landed(speed) {
    this.land = Math.min(1, speed / 12);
  }

  muzzleWorld(mainCamera, out) {
    const m = this.models[this.current];
    m.muzzle.updateWorldMatrix(true, false);
    m.muzzle.getWorldPosition(_v);
    this.camera.worldToLocal(_v);
    return out.copy(_v).applyMatrix4(mainCamera.matrixWorld);
  }

  poseArms(holder, m, leftTarget, oneHand) {
    for (const [b, q] of this.rest) b.quaternion.copy(q);
    this.arms.updateMatrixWorld(true);
    holder.updateMatrixWorld(true);

    const b = this.bones;
    const grip = _target.copy(m.points.grip).applyMatrix4(holder.matrixWorld);
    _pole.set(0.6, -1, 0.4).applyQuaternion(this.camera.quaternion);
    solveArm(b.RightArm, b.RightForeArm, b.RightHand, grip, _pole);
    const hand = WEAPONS[this.current]?.view.hand;
    if (hand) _aim.set(hand[0], hand[1], hand[2]);
    else _aim.set(0, -0.02, -0.12);
    _aim.applyQuaternion(holder.quaternion).applyQuaternion(this.camera.quaternion).add(grip);
    const def = WEAPONS[this.current];
    const locked = def?.view.grip;
    holder.getWorldQuaternion(_wq);
    if (locked && m.handRest) {
      b.RightHand.parent.getWorldQuaternion(_iq).invert();
      b.RightHand.quaternion.copy(_iq.multiply(_wq).multiply(m.handRest));
      b.RightHand.updateMatrixWorld(true);
    } else {
      aimBone(b.RightHand, b.RightHandIndex3_end, _aim);
      if (locked && !this.action) m.handRest = _wq.invert().multiply(b.RightHand.getWorldQuaternion(_iq)).clone();
    }
    curlFingers(b, 'r');
    if (!oneHand) curlFingers(b, 'l');

    let fore;
    if (oneHand && !leftTarget) {
      fore = _target.set(-0.3, -0.62, -0.12).applyMatrix4(this.camera.matrixWorld);
    } else {
      fore = _target.copy(leftTarget || m.points.fore).applyMatrix4(holder.matrixWorld);
    }
    _pole.set(-0.8, -1, 0.2).applyQuaternion(this.camera.quaternion);
    solveArm(b.LeftArm, b.LeftForeArm, b.LeftHand, fore, _pole);
    _aim.set(0.05, 0.03, -0.1).applyQuaternion(holder.quaternion).applyQuaternion(this.camera.quaternion).add(fore);
    aimBone(b.LeftHand, b.LeftHandIndex3_end, _aim);
  }

  attach(m, g) {
    const hand = this.bones.RightHand;
    hand.updateMatrixWorld(true);
    hand.matrixWorld.decompose(_hp, _hq, _hs);
    const axis = (v, out) => out.set(v[0], v[1], v[2]).applyQuaternion(_hq).normalize();
    axis(g.blade, _bz).negate();
    axis(g.up, _by);
    _by.addScaledVector(_bz, -_by.dot(_bz)).normalize();
    _bx.crossVectors(_by, _bz);
    _basis.makeBasis(_bx, _by, _bz);
    _wq.setFromRotationMatrix(_basis);
    _hp.add(axis(g.at, _v).multiplyScalar(g.at[3]));
    const root = m.gun.root;
    _hp.sub(_w.copy(m.points.grip).applyQuaternion(_wq));
    m.holder.updateMatrixWorld(true);
    m.holder.getWorldQuaternion(_iq).invert();
    root.quaternion.copy(_iq).multiply(_wq);
    root.position.copy(m.holder.worldToLocal(_hp));
  }

  update(dt, { mouseX, mouseY, speed, grounded, ads, sprint, slide, crouch = 0, planting = false, mainCamera, scoped, alive }) {
    this.camera.quaternion.copy(mainCamera.quaternion);
    this.camera.position.set(0, 0, 0);
    this.camera.updateMatrixWorld(true);
    const w = WEAPONS[this.current];
    if (!w) return;
    const m = this.models[this.current];
    this.rig.visible = alive && !scoped;
    if (!this.rig.visible) {
      this.flashT = 0;
      m.flash.visible = false;
      this.light.intensity = 0;
      return;
    }

    const oneHand = !!(w.melee || w.grenade);
    this.ads = damp(this.ads, ads && !this.busy ? 1 : 0, 14, dt);

    const swayScale = 1 - this.ads * 0.8;
    this.swayVel.x += (-mouseX * 0.0009 * swayScale - this.sway.x) * 60 * dt;
    this.swayVel.y += (mouseY * 0.0009 * swayScale - this.sway.y) * 60 * dt;
    this.swayVel.multiplyScalar(Math.max(0, 1 - dt * 14));
    this.sway.addScaledVector(this.swayVel, dt * 10);
    this.sway.clampScalar(-0.06, 0.06);

    const moving = grounded ? Math.min(1, speed / 6) : 0;
    this.bobAmount = damp(this.bobAmount, moving, 8, dt);
    this.bobPhase += dt * (6 + speed * 1.15);
    const bobX = Math.sin(this.bobPhase) * 0.012 * this.bobAmount * (1 - this.ads * 0.85);
    const bobY = Math.abs(Math.cos(this.bobPhase)) * -0.012 * this.bobAmount * (1 - this.ads * 0.85);

    this.kick = damp(this.kick, 0, 18, dt);
    this.kickRot = damp(this.kickRot, 0, 12, dt);
    this.jolt = damp(this.jolt, 0, 11, dt);
    this.land = damp(this.land, 0, 6, dt);
    this.crouch = damp(this.crouch, crouch, 10, dt);
    this.planting = damp(this.planting, planting ? 1 : 0, 9, dt);
    this.tilt = damp(this.tilt, (sprint || slide) && !this.action ? 1 : 0, 8, dt);

    const pose = { hand: null, roll: 0, pitch: 0, yaw: 0, pos: _rest.set(0, 0, 0) };
    if (this.action && this.action.id === this.current) {
      if (this.action.t < 0) this.action.t += dt / this.action.duration;
      else this.updateAction(dt, m.holder, m, pose);
    }

    const base = w.view.pos;
    const aim = w.view.ads;
    const px = THREE.MathUtils.lerp(base[0], aim[0], this.ads);
    const py = THREE.MathUtils.lerp(base[1], aim[1], this.ads);
    const pz = THREE.MathUtils.lerp(base[2], aim[2], this.ads);
    const tap = this.planting * Math.max(0, Math.sin(performance.now() * 0.018)) * 0.012;

    m.holder.position.set(
      px + this.sway.x + bobX - this.tilt * 0.04 + pose.pos.x,
      py + this.sway.y + bobY - this.land * 0.04 - this.tilt * 0.03 + pose.pos.y + this.jolt * 0.012 - this.planting * 0.12 - tap + this.crouch * 0.008,
      pz + this.kick * 0.04 * (w.pellets > 1 || w.damage > 50 ? 1.8 : 1) + pose.pos.z + this.planting * 0.05,
    );
    const rot = w.view.rot || ZERO;
    m.holder.rotation.set(
      rot[0] + this.kickRot * w.kick * 2.2 + pose.pitch + this.sway.y * 2 - this.tilt * 0.15 + this.jolt * 0.06 - this.planting * 0.5,
      rot[1] + this.sway.x * 2 + this.tilt * 0.5 + 0.08 * (1 - this.ads) + pose.yaw,
      rot[2] + pose.roll + this.sway.x * 3 + this.tilt * 0.25 - 0.08 * (1 - this.ads),
    );
    m.holder.updateMatrix();

    this.poseArms(m.holder, m, pose.hand, oneHand);
    if (w.view.grip) this.attach(m, w.view.grip);

    for (let i = this.loose.length - 1; i >= 0; i--) {
      const l = this.loose[i];
      l.t += dt;
      l.vel.y -= 4 * dt;
      l.obj.position.addScaledVector(l.vel, dt);
      l.obj.rotation.x += l.spin.x * dt;
      l.obj.rotation.z += l.spin.z * dt;
      if (l.t > 0.8) {
        l.obj.removeFromParent();
        this.loose.splice(i, 1);
      }
    }

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) m.flash.visible = false;
    }
    this.light.intensity = damp(this.light.intensity, 0, 30, dt);
    m.muzzle.getWorldPosition(_v);
    this.light.position.copy(this.camera.worldToLocal(_v));

    const fov = THREE.MathUtils.lerp(58, w.view.fov - 4, this.ads);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
