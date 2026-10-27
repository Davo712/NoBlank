import * as THREE from 'three';
import { buildGun } from '../combat/guns.js';
import { WEAPONS } from '../combat/weapons.js';

export function renderIcons(renderer) {
  const W = 256;
  const H = 96;
  const target = new THREE.WebGLRenderTarget(W, H);
  const scene = new THREE.Scene();
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  const pixels = new Uint8Array(W * H * 4);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(W, H);
  const icons = {};
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  for (const id of Object.keys(WEAPONS)) {
    const gun = buildGun(id).root;
    gun.traverse((o) => {
      if (o.isMesh) o.material = white;
    });
    gun.rotation.y = -Math.PI / 2;
    scene.add(gun);
    gun.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gun);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const aspect = W / H;
    const halfW = Math.max(size.x / 2, (size.y / 2) * aspect) * 1.08;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfW / aspect;
    camera.bottom = -halfW / aspect;
    camera.position.set(center.x, center.y, center.z + 5);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
    for (let y = 0; y < H; y++) {
      const src = (H - 1 - y) * W * 4;
      image.data.set(pixels.subarray(src, src + W * 4), y * W * 4);
    }
    ctx.clearRect(0, 0, W, H);
    ctx.putImageData(image, 0, 0);
    icons[id] = canvas.toDataURL();
    scene.remove(gun);
  }

  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.toneMapping = prevTone;
  target.dispose();
  return icons;
}
