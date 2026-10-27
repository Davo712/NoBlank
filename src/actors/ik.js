import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _s = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();

export function aimBone(bone, child, target) {
  const origin = bone.getWorldPosition(_a);
  const cur = child.getWorldPosition(_b).sub(origin).normalize();
  const want = _c.copy(target).sub(origin).normalize();
  _q.setFromUnitVectors(cur, want);
  bone.getWorldQuaternion(_qw).premultiply(_q);
  bone.parent.getWorldQuaternion(_qp).invert();
  bone.quaternion.copy(_qp.multiply(_qw));
  bone.updateMatrixWorld(true);
}

export function solveArm(upper, lower, hand, target, pole) {
  const s = upper.getWorldPosition(_s);
  const l1 = s.distanceTo(lower.getWorldPosition(_d));
  const l2 = _d.distanceTo(hand.getWorldPosition(_e));
  const toT = _e.copy(target).sub(s);
  const dist = Math.min(toT.length(), (l1 + l2) * 0.999);
  toT.normalize();
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const bend = _d.copy(pole).addScaledVector(toT, -pole.dot(toT)).normalize();
  _elbow.copy(s).addScaledVector(toT, a).addScaledVector(bend, h);
  aimBone(upper, lower, _elbow);
  aimBone(lower, hand, target);
}
