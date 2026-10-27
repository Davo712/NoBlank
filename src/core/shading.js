import * as THREE from 'three';

const cache = new WeakMap();

function lambertOf(m) {
  let l = cache.get(m);
  if (l) return l;
  l = new THREE.MeshLambertMaterial({
    map: m.map,
    color: m.color,
    emissive: m.emissive,
    emissiveMap: m.emissiveMap,
    emissiveIntensity: m.emissiveIntensity,
    normalMap: m.normalMap,
    normalScale: m.normalScale,
    transparent: m.transparent,
    opacity: m.opacity,
    side: m.side,
    alphaTest: m.alphaTest,
    depthWrite: m.depthWrite,
    polygonOffset: m.polygonOffset,
    polygonOffsetFactor: m.polygonOffsetFactor,
  });
  l.name = m.name;
  cache.set(m, l);
  return l;
}

export function setFastShading(root, fast) {
  root.traverse((o) => {
    if (!o.isMesh || o.userData.ownShading) return;
    if (!o.userData.pbr?.isMaterial) {
      if (!o.material?.isMeshStandardMaterial) return;
      o.userData.pbr = o.material;
    }
    o.material = fast ? lambertOf(o.userData.pbr) : o.userData.pbr;
  });
}
