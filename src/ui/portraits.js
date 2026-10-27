import * as THREE from 'three';
import { Avatar } from '../actors/Avatar.js';

const POSES = [
  { yaw: 0.35, pitch: 0.05, time: 0.3 },
  { yaw: -0.25, pitch: -0.25, time: 1.1, weapon: 'deagle' },
  { yaw: 0.6, pitch: 0.3, time: 0.7, weapon: 'awp' },
  { yaw: 0.15, pitch: -0.45, time: 1.7, weapon: 'mp5' },
  { yaw: -0.5, pitch: 0.1, time: 0.5, weapon: 'nova' },
  { yaw: 0.45, pitch: -0.1, time: 2.1, crouch: 0.5 },
];

export function renderPortraits(renderer, assets) {
  const W = 240;
  const H = 320;
  const target = new THREE.WebGLRenderTarget(W, H);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(1.5, 3, 4);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 20);
  camera.position.set(0.55, 1.45, 3.6);
  camera.lookAt(0, 1.0, 0);
  const pixels = new Uint8Array(W * H * 4);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(W, H);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  const out = {};
  for (const c of assets.characters) {
    const a = new Avatar(assets.hq, c);
    const i = assets.characters.indexOf(c);
    const pose = POSES[i % POSES.length];
    a.setWeapon(pose.weapon || (c.team === 'A' ? 'm4a1' : 'ak47'));
    scene.add(a.root);
    a.update(pose.time, { yaw: pose.yaw, pitch: pose.pitch, crouch: pose.crouch || 0 });
    a.root.updateMatrixWorld(true);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
    for (let y = 0; y < H; y++) {
      const src = (H - 1 - y) * W * 4;
      image.data.set(pixels.subarray(src, src + W * 4), y * W * 4);
    }
    ctx.putImageData(image, 0, 0);
    out[c.id] = canvas.toDataURL();
    scene.remove(a.root);
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  target.dispose();
  return out;
}
