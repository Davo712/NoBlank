import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { solveArm } from './ik.js';
import { buildGun } from '../combat/guns.js';
import { setFastShading } from '../core/shading.js';

const GUN_SCALE = 0.85;
const UP = new THREE.Vector3(0, 1, 0);

const BONES = {
  Hips: 'pelvis',
  Spine: 'spine_01',
  Chest: 'spine_02',
  UpperChest: 'spine_03',
  Neck: 'neck_01',
  Head: 'Head',
  RightArm: 'upperarm_r',
  RightForeArm: 'lowerarm_r',
  RightHand: 'hand_r',
  LeftArm: 'upperarm_l',
  LeftForeArm: 'lowerarm_l',
  LeftHand: 'hand_l',
};

const FINGERS = ['index', 'middle', 'ring', 'pinky'];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _grip = new THREE.Vector3();
const _fore = new THREE.Vector3();
const _poleR = new THREE.Vector3();
const _poleL = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();

let blobTexture = null;
let markerTexture = null;

function blob() {
  if (!blobTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    blobTexture = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.renderOrder = 1;
  m.userData.noCollide = true;
  return m;
}

function marker() {
  if (!markerTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(32, 58);
    g.lineTo(12, 22);
    g.lineTo(52, 22);
    g.closePath();
    g.fill();
    markerTexture = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture, depthTest: false, transparent: true }));
  s.scale.setScalar(0.28);
  s.position.y = 2.15;
  s.renderOrder = 10;
  s.visible = false;
  return s;
}

function rotateWorld(bone, axis, angle) {
  if (!angle) return;
  _q.setFromAxisAngle(axis, angle);
  bone.getWorldQuaternion(_qw).premultiply(_q);
  bone.parent.getWorldQuaternion(_qp).invert();
  bone.quaternion.copy(_qp.multiply(_qw));
  bone.updateMatrixWorld(true);
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const GRIP = {};

const _gq = new THREE.Quaternion();

export function curlFingers(bones, side, amount = 1) {
  for (const f of [...FINGERS, 'thumb']) {
    for (let i = 1; i <= 3; i++) {
      const name = `${f}_0${i}_${side}`;
      const b = bones[name];
      const q = GRIP[name];
      if (!b || !q) continue;
      if (amount >= 1) b.quaternion.copy(q);
      else b.quaternion.slerp(_gq.copy(q), amount);
    }
  }
}

export class Avatar {
  constructor(hq, look) {
    const kind = look.female ? hq.female : hq.male;
    this.root = new THREE.Group();
    this.body = cloneSkinned(kind.scene);
    const slim = look.female ? 0.97 : 1;
    this.body.scale.set(slim, 1, slim);
    this.root.add(this.body);

    this.bones = {};
    this.meshes = [];
    let skinned = null;
    this.body.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) {
        o.castShadow = true;
        if (o.material.name === kind.bodyMaterial) skinned = o;
        this.meshes.push(o);
      }
    });
    for (const [alias, name] of Object.entries(BONES)) this.bones[alias] = this.bones[name];

    this.pbr = skinned.material.clone();
    this.pbr.map = look.skin;
    this.pbr.vertexColors = false;
    this.pbr.emissive = new THREE.Color(0xffffff);
    this.pbr.emissiveIntensity = 0;
    this.fast = new THREE.MeshLambertMaterial({ map: look.skin, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0 });
    this.material = this.pbr;
    this.skinned = skinned;
    this.detail = skinned.geometry;
    this.coarse = kind.lod || skinned.geometry;
    this.small = this.meshes.filter((m) => /^Eye/.test(m.name));
    skinned.material = this.pbr;
    skinned.userData.ownShading = true;
    const hairColor = new THREE.Color(look.hairColor ?? (look.tone === 'dark' ? 0x1c140f : 0x4a3526));
    for (const m of this.meshes) {
      if (m === skinned) continue;
      m.material = m.material.clone();
      m.material.vertexColors = false;
      if (/Hair/.test(m.material.name)) m.material.color.copy(hairColor);
    }

    if (look.hair) for (const h of look.hair) this.attachHair(hq.hair[h], skinned, hairColor);

    this.mixer = new THREE.AnimationMixer(this.body);
    this.actions = {};
    for (const [name, clip] of Object.entries(hq.clips)) {
      const action = this.mixer.clipAction(clip);
      if (name === 'death' || name === 'hit') {
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;
      } else {
        action.play();
      }
      action.setEffectiveWeight(name === 'idle' ? 1 : 0);
      action.time = Math.random() * clip.duration;
      this.actions[name] = action;
    }
    this.weights = { idle: 1, run: 0, walk: 0, crouch: 0, crouchRun: 0, jump: 0 };

    this.gun = new THREE.Group();
    this.root.add(this.gun);
    this.guns = {};
    this.weapon = null;
    this.points = null;
    this.muzzle = new THREE.Object3D();
    this.gun.add(this.muzzle);

    this.shadow = blob();
    this.shadow.visible = false;
    this.root.add(this.shadow);
    this.marker = marker();
    this.root.add(this.marker);

    this.pitch = 0;
    this.flash = 0;
    this.flinch = 0;
    this.recoil = 0;
    this.twist = 0;
    this.crouch = 0;
    this.dead = false;
    this.deathT = 0;
    this.side = 1;
    this.castShadows = true;
    this.resolveSide();
    this.bound();
  }

  bound() {
    this.body.updateMatrixWorld(true);
    const sphere = new THREE.Sphere();
    this.skinned.computeBoundingSphere();
    sphere.copy(this.skinned.boundingSphere);
    sphere.radius *= 1.7;
    for (const m of this.meshes) m.boundingSphere = sphere;
  }

  setDetail(far) {
    if (this.far === far) return;
    this.far = far;
    this.skinned.geometry = far ? this.coarse : this.detail;
    for (const m of this.small) m.visible = !far;
  }

  attachHair(src, skinned, color) {
    if (!src) return;
    for (const piece of src) {
      const bones = piece.skeleton.bones.map((b) => this.bones[b.name] || this.bones.Head);
      const mesh = new THREE.SkinnedMesh(piece.geometry, piece.material.clone());
      mesh.material.vertexColors = false;
      mesh.material.color.copy(color);
      mesh.castShadow = true;
      skinned.parent.add(mesh);
      mesh.bind(new THREE.Skeleton(bones, piece.skeleton.boneInverses), piece.bindMatrix);
      this.meshes.push(mesh);
    }
  }

  resolveSide() {
    this.body.updateMatrixWorld(true);
    const toe = this.bones.ball_l.getWorldPosition(new THREE.Vector3()).z - this.bones.foot_l.getWorldPosition(new THREE.Vector3()).z;
    this.front = Math.sign(toe) || 1;
    const r = this.bones.RightArm.getWorldPosition(new THREE.Vector3());
    this.side = Math.sign(r.x) || -1;
  }

  setWeapon(id) {
    if (this.weapon === id) return;
    if (this.weapon) this.guns[this.weapon].root.visible = false;
    if (!this.guns[id]) {
      const g = buildGun(id);
      g.root.rotation.y = Math.PI;
      g.root.scale.setScalar(GUN_SCALE);
      g.root.traverse((o) => {
        if (o.isMesh) o.castShadow = this.castShadows;
      });
      setFastShading(g.root, this.material === this.fast);
      const toLocal = (p) => new THREE.Vector3(-p.x, p.y, -p.z).multiplyScalar(GUN_SCALE);
      g.local = {
        grip: toLocal(g.points.grip),
        fore: toLocal(g.points.fore),
        well: toLocal(g.points.well),
        muzzle: toLocal(g.points.muzzle),
      };
      this.gun.add(g.root);
      this.guns[id] = g;
    }
    this.weapon = id;
    const g = this.guns[id];
    g.root.visible = true;
    this.points = g.local;
    this.muzzle.position.copy(g.local.muzzle);
  }

  setShading(fast) {
    const next = fast ? this.fast : this.pbr;
    if (next === this.material) return;
    next.opacity = this.material.opacity;
    next.transparent = this.material.transparent;
    this.material = next;
    this.skinned.material = next;
    for (const m of this.meshes) {
      if (m === this.skinned) continue;
      setFastShading(m, fast);
    }
  }

  setShadowMode(dynamic) {
    this.castShadows = dynamic;
    this.root.traverse((o) => {
      if (o.isMesh && o !== this.shadow) o.castShadow = dynamic;
    });
    this.blobOn = !dynamic;
    this.shadow.visible = this.blobOn && !this.dead;
  }

  setMarker(color) {
    this.marker.visible = !!color;
    if (color) this.marker.material.color.set(color);
  }

  setVisible(v) {
    this.root.visible = v;
  }

  hit() {
    this.flash = 1;
    this.flinch = 1;
  }

  fire() {
    this.recoil = 1;
  }

  die() {
    this.dead = true;
    this.flash = 0;
    this.material.emissiveIntensity = 0;
    this.gun.visible = false;
    this.deathT = 0;
    this.shadow.visible = false;
    this.marker.visible = false;
    for (const [name, a] of Object.entries(this.actions)) {
      if (name !== 'death') a.fadeOut(0.15);
    }
    const d = this.actions.death;
    d.reset();
    d.setEffectiveWeight(1);
    d.fadeIn(0.1);
    d.play();
  }

  revive() {
    this.dead = false;
    this.gun.visible = true;
    this.deathT = 0;
    this.root.quaternion.identity();
    this.root.position.y = 0;
    this.body.position.set(0, 0, 0);
    this.actions.death.stop();
    for (const [name, a] of Object.entries(this.actions)) {
      if (name === 'death' || name === 'hit') continue;
      a.stop();
      a.play();
      a.setEffectiveWeight(name === 'idle' ? 1 : 0);
    }
    for (const k of Object.keys(this.weights)) this.weights[k] = k === 'idle' ? 1 : 0;
    this.material.opacity = 1;
    this.material.transparent = false;
    for (const m of this.meshes) {
      m.material.opacity = 1;
      m.material.transparent = false;
    }
    this.shadow.visible = !!this.blobOn;
  }

  update(dt, { speed = 0, grounded = true, yaw = 0, pitch = 0, crouch = 0, vx = 0, vz = 0, reload = 0, lod = 0 }) {
    if (lod > 1 && !this.dead) {
      this.skipped = (this.skipped || 0) + dt;
      this.root.rotation.set(0, yaw, 0);
      return;
    }
    dt += this.skipped || 0;
    this.skipped = 0;

    if (this.dead) {
      this.mixer.update(dt);
      this.deathT += dt;
      if (this.deathT > 2.2) {
        const o = Math.max(0, 1 - (this.deathT - 2.2) / 0.6);
        for (const m of this.meshes) {
          m.material.transparent = true;
          m.material.opacity = o;
        }
      }
      return;
    }

    const moveYaw = Math.atan2(vx, vz);
    const rel = speed > 0.6 ? angleDiff(yaw, moveYaw) : 0;
    const backwards = Math.abs(rel) > Math.PI * 0.62;
    const move = Math.min(1, speed / 3.2);
    const low = crouch > 0.5;
    const runK = Math.min(1, Math.max(0, (speed - 2.6) / 2));
    const target = {
      jump: grounded ? 0 : 1,
      crouch: grounded && low ? 1 - move : 0,
      crouchRun: grounded && low ? move : 0,
      idle: grounded && !low ? 1 - move : 0,
      walk: grounded && !low ? move * (1 - runK) : 0,
      run: grounded && !low ? move * runK : 0,
    };
    for (const k of Object.keys(this.weights)) {
      this.weights[k] += (target[k] - this.weights[k]) * Math.min(1, dt * 10);
      this.actions[k].setEffectiveWeight(this.weights[k]);
    }
    const dir = backwards ? -1 : 1;
    this.actions.run.timeScale = (0.75 + speed / 9) * dir;
    this.actions.walk.timeScale = (0.6 + speed / 4) * dir;
    this.actions.crouchRun.timeScale = (0.6 + speed / 4) * dir;
    this.mixer.update(dt);

    this.flash = Math.max(0, this.flash - dt * 7);
    this.flinch = Math.max(0, this.flinch - dt * 6);
    this.material.emissiveIntensity = this.flash * 0.45;
    this.recoil = Math.max(0, this.recoil - dt * 9);

    let twistTarget = 0;
    if (speed > 0.6) {
      const r = backwards ? angleDiff(0, rel + Math.PI) : rel;
      twistTarget = Math.max(-1.05, Math.min(1.05, r));
    }
    this.twist += (twistTarget - this.twist) * Math.min(1, dt * 10);
    this.crouch += (crouch - this.crouch) * Math.min(1, dt * 10);

    this.root.rotation.set(0, yaw, 0);
    this.pitch += (pitch - this.pitch) * Math.min(1, dt * 14);
    this.pose(this.crouch, reload);
  }

  pose(crouch, reload) {
    const b = this.bones;
    const p = this.pitch;
    this.root.updateMatrixWorld(true);

    if (Math.abs(this.twist) > 0.01) {
      rotateWorld(b.Hips, UP, this.twist);
      rotateWorld(b.Spine, UP, -this.twist * 0.6);
      rotateWorld(b.Chest, UP, -this.twist * 0.4);
    }
    if (this.flinch > 0.01) {
      _axis.set(1, 0, 0).applyQuaternion(this.root.quaternion);
      rotateWorld(b.UpperChest, _axis, -this.flinch * 0.25);
    }

    const fwd = _a.set(0, -Math.sin(p), Math.cos(p));
    const kick = this.recoil * 0.05;
    const pts = this.points;
    const shoulder = b.RightArm.getWorldPosition(_b);
    this.root.worldToLocal(shoulder);
    this.gun.position.set(this.side * 0.1, shoulder.y - 0.12 - reload * 0.08, 0).addScaledVector(fwd, 0.34 - kick);
    this.gun.quaternion.setFromUnitVectors(_b.set(0, 0, 1), fwd);
    if (reload > 0) this.gun.rotateZ(reload * 0.6 * this.side);
    this.gun.updateMatrixWorld(true);

    const grip = _grip.copy(pts.grip).applyMatrix4(this.gun.matrixWorld);
    const fore = _fore.copy(reload > 0 ? pts.well : pts.fore);
    if (reload > 0) fore.y -= Math.sin(reload * Math.PI) * 0.25;
    fore.applyMatrix4(this.gun.matrixWorld);

    const poleR = _poleR.set(this.side, -1.2, -0.6).applyQuaternion(this.root.quaternion);
    const poleL = _poleL.set(-this.side, -1.2, -0.4).applyQuaternion(this.root.quaternion);
    solveArm(b.RightArm, b.RightForeArm, b.RightHand, grip, poleR);
    solveArm(b.LeftArm, b.LeftForeArm, b.LeftHand, fore, poleL);
    curlFingers(b, 'r');
    curlFingers(b, 'l');
  }
}
