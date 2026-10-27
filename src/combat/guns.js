import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const std = (color, roughness = 0.55, metalness = 0.25) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });

const M = {
  dark: std(0x3d4550, 0.45, 0.5),
  steel: std(0x8f9aa8, 0.35, 0.6),
  black: std(0x2e333b, 0.7, 0.1),
  wood: std(0xb06a32, 0.6, 0.05),
  woodDark: std(0x7c4521, 0.6, 0.05),
  tan: std(0xc7a878, 0.7, 0.05),
  olive: std(0x6f8048, 0.65, 0.1),
  chrome: std(0xd5dbe3, 0.22, 0.85),
  gold: std(0xe0b24a, 0.3, 0.8),
  bakelite: std(0x8f3a1a, 0.5, 0.1),
  glass: new THREE.MeshStandardMaterial({ color: 0x7fd8ff, roughness: 0.1, metalness: 0.2, emissive: 0x1d5f7a, emissiveIntensity: 0.6 }),
};

const SURFACE = { dark: 'metal', steel: 'metal', black: 'metal', chrome: 'metal', gold: 'metal', wood: 'wood', woodDark: 'wood', bakelite: 'wood', tan: 'concrete', olive: 'concrete' };

export function texturizeGuns(pbr) {
  for (const [key, tex] of Object.entries(SURFACE)) {
    const set = pbr?.[tex];
    if (!set) continue;
    const m = M[key];
    m.map = set.map;
    m.normalMap = set.normal;
    m.normalScale.set(0.6, 0.6);
    m.roughnessMap = set.rough;
    if (tex === 'metal') m.color.multiplyScalar(1.25);
    m.flatShading = false;
    m.needsUpdate = true;
  }
}

function boxUV(g) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  const s = 1 / 0.22;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) * s, p.getZ(i) * s);
    else if (ax >= az) uv.setXY(i, p.getZ(i) * s, p.getY(i) * s);
    else uv.setXY(i, p.getX(i) * s, p.getY(i) * s);
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();

class Kit {
  constructor() {
    this.parts = new Map();
  }

  add(mat, geo, x, y, z, rx = 0, ry = 0, rz = 0) {
    _q.setFromEuler(_e.set(rx, ry, rz));
    _m.compose(_p.set(x, y, z), _q, _s);
    geo.applyMatrix4(_m);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(geo.index ? geo.toNonIndexed() : geo);
    return this;
  }

  box(mat, w, h, d, x, y, z, rx, ry, rz) {
    return this.add(mat, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  }

  cyl(mat, r, len, x, y, z, { axis = 'z', seg = 8, r2 = r } = {}) {
    const g = new THREE.CylinderGeometry(r2, r, len, seg);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    return this.add(mat, g, x, y, z);
  }

  build(name) {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, list] of this.parts) {
      for (const g of list) {
        for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
      }
      const merged = mergeGeometries(list);
      boxUV(merged);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

const v = (x, y, z) => new THREE.Vector3(x, y, z);

function blade(profile, thick) {
  const shape = new THREE.Shape(profile.map(([u, h]) => new THREE.Vector2(u, h)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-thick / 2, 0, 0);
  return g;
}

const BUILDERS = {
  ak47() {
    const k = new Kit()
      .box(M.dark, 0.055, 0.075, 0.3, 0, 0, -0.02)
      .cyl(M.dark, 0.03, 0.28, 0, 0.034, -0.02, { seg: 10 })
      .box(M.dark, 0.03, 0.022, 0.04, 0, 0.06, -0.16)
      .cyl(M.steel, 0.011, 0.3, 0, 0.015, -0.32)
      .cyl(M.dark, 0.013, 0.2, 0, 0.044, -0.27)
      .box(M.wood, 0.05, 0.03, 0.15, 0, 0.048, -0.24)
      .box(M.wood, 0.064, 0.055, 0.17, 0, -0.006, -0.255)
      .box(M.dark, 0.012, 0.05, 0.018, 0, 0.046, -0.43)
      .cyl(M.dark, 0.016, 0.045, 0, 0.015, -0.49)
      .box(M.woodDark, 0.036, 0.1, 0.045, 0, -0.08, 0.065, -0.35)
      .box(M.steel, 0.008, 0.01, 0.06, 0, -0.045, 0.005)
      .box(M.wood, 0.046, 0.075, 0.27, 0, -0.03, 0.265, 0.12)
      .box(M.dark, 0.05, 0.1, 0.02, 0, -0.055, 0.4, 0.12);
    const mag = new Kit()
      .box(M.bakelite, 0.03, 0.09, 0.07, 0, -0.045, 0.005, 0.15)
      .box(M.bakelite, 0.03, 0.085, 0.066, 0, -0.12, 0.03, 0.45)
      .build('mag');
    return { k, mag, magAt: v(0, -0.035, -0.085), points: { grip: v(0, -0.07, 0.065), fore: v(0, -0.025, -0.26), well: v(0, -0.04, -0.085), handle: v(0.045, 0.02, -0.05), muzzle: v(0, 0.015, -0.515) } };
  },

  m4a1() {
    const k = new Kit()
      .box(M.black, 0.05, 0.07, 0.22, 0, -0.01, 0)
      .box(M.black, 0.05, 0.05, 0.27, 0, 0.045, -0.03)
      .box(M.dark, 0.026, 0.012, 0.25, 0, 0.076, -0.03)
      .cyl(M.tan, 0.031, 0.21, 0, 0.036, -0.27, { seg: 8 })
      .cyl(M.dark, 0.01, 0.2, 0, 0.036, -0.46)
      .cyl(M.black, 0.014, 0.05, 0, 0.036, -0.58, { seg: 6 })
      .box(M.black, 0.012, 0.065, 0.02, 0, 0.072, -0.385)
      .box(M.black, 0.022, 0.032, 0.03, 0, 0.096, -0.11)
      .box(M.tan, 0.033, 0.095, 0.04, 0, -0.078, 0.06, -0.3)
      .box(M.steel, 0.008, 0.01, 0.055, 0, -0.05, 0.005)
      .cyl(M.black, 0.015, 0.14, 0, 0.032, 0.18)
      .box(M.tan, 0.045, 0.085, 0.16, 0, 0.005, 0.28)
      .box(M.black, 0.05, 0.1, 0.02, 0, -0.005, 0.37);
    const mag = new Kit()
      .box(M.steel, 0.028, 0.155, 0.068, 0, -0.07, 0.008, 0.14)
      .box(M.black, 0.032, 0.015, 0.075, 0, -0.15, 0.02, 0.14)
      .build('mag');
    return { k, mag, magAt: v(0, -0.035, -0.055), points: { grip: v(0, -0.065, 0.06), fore: v(0, 0.0, -0.27), well: v(0, -0.04, -0.055), handle: v(0.035, 0.07, 0.09), muzzle: v(0, 0.036, -0.61) } };
  },

  mp5() {
    const k = new Kit()
      .cyl(M.black, 0.028, 0.3, 0, 0.02, -0.06, { seg: 10 })
      .box(M.black, 0.022, 0.032, 0.035, 0, 0.056, 0.05)
      .cyl(M.black, 0.018, 0.02, 0, 0.05, -0.2, { seg: 8 })
      .cyl(M.dark, 0.024, 0.21, 0, 0.02, -0.31, { seg: 12 })
      .box(M.black, 0.052, 0.05, 0.13, 0, -0.012, -0.15)
      .box(M.black, 0.032, 0.09, 0.04, 0, -0.065, 0.05, -0.25)
      .box(M.steel, 0.008, 0.01, 0.05, 0, -0.03, 0.0)
      .cyl(M.steel, 0.006, 0.19, 0.02, 0.01, 0.17)
      .cyl(M.steel, 0.006, 0.19, -0.02, 0.01, 0.17)
      .box(M.black, 0.055, 0.08, 0.02, 0, -0.01, 0.265)
      .box(M.dark, 0.012, 0.012, 0.05, -0.035, 0.04, -0.13);
    const mag = new Kit()
      .box(M.dark, 0.025, 0.07, 0.048, 0, -0.035, 0.0, 0.18)
      .box(M.dark, 0.025, 0.065, 0.046, 0, -0.095, 0.022, 0.38)
      .build('mag');
    return { k, mag, magAt: v(0, -0.005, -0.07), points: { grip: v(0, -0.055, 0.05), fore: v(0, -0.035, -0.15), well: v(0, -0.01, -0.07), handle: v(-0.04, 0.04, -0.13), muzzle: v(0, 0.02, -0.42) } };
  },

  awp() {
    const k = new Kit()
      .box(M.olive, 0.052, 0.062, 0.32, 0, 0, 0)
      .cyl(M.dark, 0.013, 0.56, 0, 0.012, -0.43)
      .cyl(M.dark, 0.021, 0.07, 0, 0.012, -0.73, { seg: 6 })
      .cyl(M.black, 0.022, 0.3, 0, 0.088, -0.03, { seg: 12 })
      .cyl(M.black, 0.033, 0.075, 0, 0.088, -0.21, { seg: 12, r2: 0.024 })
      .cyl(M.black, 0.029, 0.05, 0, 0.088, 0.14, { seg: 12, r2: 0.024 })
      .cyl(M.glass, 0.028, 0.004, 0, 0.088, -0.249, { seg: 12 })
      .cyl(M.dark, 0.012, 0.03, 0, 0.122, -0.03, { axis: 'y' })
      .box(M.black, 0.02, 0.04, 0.02, 0, 0.05, -0.1)
      .box(M.black, 0.02, 0.04, 0.02, 0, 0.05, 0.05)
      .box(M.olive, 0.056, 0.115, 0.38, 0, -0.03, 0.31)
      .box(M.olive, 0.04, 0.03, 0.15, 0, 0.04, 0.28)
      .box(M.black, 0.06, 0.125, 0.02, 0, -0.03, 0.505)
      .box(M.olive, 0.056, 0.06, 0.26, 0, -0.02, -0.28)
      .box(M.olive, 0.036, 0.09, 0.045, 0, -0.08, 0.11, -0.25)
      .cyl(M.steel, 0.006, 0.05, 0.035, 0.022, 0.09, { axis: 'x' })
      .box(M.steel, 0.018, 0.018, 0.018, 0.064, 0.022, 0.09);
    const mag = new Kit().box(M.black, 0.034, 0.05, 0.08, 0, -0.025, 0).build('mag');
    return { k, mag, magAt: v(0, -0.03, -0.03), points: { grip: v(0, -0.07, 0.11), fore: v(0, -0.045, -0.27), well: v(0, -0.03, -0.03), handle: v(0.066, 0.022, 0.09), muzzle: v(0, 0.012, -0.77), scope: v(0, 0.088, 0.17) } };
  },

  scout() {
    const k = new Kit()
      .box(M.black, 0.044, 0.056, 0.28, 0, 0, 0)
      .cyl(M.dark, 0.011, 0.5, 0, 0.012, -0.39)
      .cyl(M.dark, 0.016, 0.05, 0, 0.012, -0.66, { seg: 8 })
      .cyl(M.dark, 0.019, 0.24, 0, 0.078, -0.02, { seg: 12 })
      .cyl(M.dark, 0.027, 0.06, 0, 0.078, -0.16, { seg: 12, r2: 0.02 })
      .cyl(M.dark, 0.024, 0.04, 0, 0.078, 0.12, { seg: 12, r2: 0.02 })
      .cyl(M.glass, 0.024, 0.004, 0, 0.078, -0.19, { seg: 12 })
      .box(M.dark, 0.016, 0.034, 0.016, 0, 0.044, -0.08)
      .box(M.dark, 0.016, 0.034, 0.016, 0, 0.044, 0.05)
      .box(M.steel, 0.048, 0.1, 0.34, 0, -0.03, 0.28)
      .box(M.black, 0.05, 0.11, 0.02, 0, -0.03, 0.455)
      .box(M.steel, 0.048, 0.05, 0.22, 0, -0.018, -0.25)
      .box(M.black, 0.032, 0.085, 0.04, 0, -0.075, 0.1, -0.25)
      .cyl(M.chrome, 0.005, 0.045, 0.032, 0.02, 0.08, { axis: 'x' })
      .box(M.chrome, 0.015, 0.015, 0.015, 0.058, 0.02, 0.08);
    const mag = new Kit().box(M.black, 0.03, 0.045, 0.07, 0, -0.022, 0).build('mag');
    return { k, mag, magAt: v(0, -0.03, -0.03), points: { grip: v(0, -0.066, 0.1), fore: v(0, -0.04, -0.25), well: v(0, -0.03, -0.03), handle: v(0.058, 0.02, 0.08), muzzle: v(0, 0.012, -0.69), scope: v(0, 0.078, 0.14) } };
  },

  nova() {
    const k = new Kit()
      .box(M.black, 0.05, 0.072, 0.22, 0, 0, 0)
      .cyl(M.dark, 0.015, 0.46, 0, 0.026, -0.34)
      .cyl(M.dark, 0.012, 0.36, 0, -0.014, -0.29)
      .box(M.dark, 0.008, 0.008, 0.4, 0, 0.044, -0.3)
      .cyl(M.gold, 0.004, 0.008, 0, 0.052, -0.55, { axis: 'y' })
      .box(M.black, 0.046, 0.09, 0.3, 0, -0.03, 0.25, 0.08)
      .box(M.black, 0.036, 0.075, 0.05, 0, -0.06, 0.07, -0.3)
      .box(M.steel, 0.008, 0.01, 0.05, 0, -0.04, 0.0)
      .box(M.dark, 0.05, 0.1, 0.02, 0, -0.04, 0.4, 0.08);
    const pump = new Kit()
      .box(M.black, 0.056, 0.05, 0.14, 0, 0, 0)
      .box(M.dark, 0.06, 0.012, 0.02, 0, 0, -0.04)
      .box(M.dark, 0.06, 0.012, 0.02, 0, 0, 0.0)
      .box(M.dark, 0.06, 0.012, 0.02, 0, 0, 0.04)
      .build('pump');
    return { k, pump, pumpAt: v(0, -0.014, -0.29), points: { grip: v(0, -0.06, 0.07), fore: v(0, -0.04, -0.29), well: v(0, -0.04, -0.02), port: v(0, -0.04, -0.03), handle: v(0, -0.04, -0.29), muzzle: v(0, 0.026, -0.575) } };
  },

  glock() {
    const k = new Kit()
      .box(M.dark, 0.028, 0.032, 0.19, 0, 0.03, -0.03)
      .box(M.black, 0.026, 0.022, 0.17, 0, 0.004, -0.02)
      .cyl(M.black, 0.007, 0.004, 0, 0.03, -0.126)
      .box(M.black, 0.029, 0.095, 0.046, 0, -0.045, 0.045, -0.3)
      .box(M.black, 0.006, 0.008, 0.04, 0, -0.012, -0.02)
      .box(M.black, 0.006, 0.01, 0.01, 0, 0.05, -0.115)
      .box(M.black, 0.02, 0.01, 0.01, 0, 0.05, 0.055)
      .box(M.steel, 0.004, 0.012, 0.004, 0, -0.008, 0.005);
    const mag = new Kit().box(M.black, 0.024, 0.02, 0.042, 0, -0.01, 0, -0.3).build('mag');
    return { k, mag, magAt: v(0, -0.09, 0.07), points: { grip: v(0, -0.04, 0.045), fore: v(-0.022, -0.06, 0.05), well: v(0, -0.09, 0.07), handle: v(0, 0.035, 0.05), muzzle: v(0, 0.03, -0.13) } };
  },

  deagle() {
    const k = new Kit()
      .box(M.chrome, 0.034, 0.045, 0.25, 0, 0.036, -0.05)
      .box(M.chrome, 0.02, 0.014, 0.21, 0, 0.064, -0.07)
      .box(M.dark, 0.031, 0.026, 0.2, 0, 0.0, -0.04)
      .cyl(M.dark, 0.009, 0.004, 0, 0.04, -0.176)
      .box(M.black, 0.033, 0.105, 0.052, 0, -0.058, 0.05, -0.28)
      .box(M.gold, 0.008, 0.012, 0.045, 0, -0.016, -0.03)
      .box(M.gold, 0.012, 0.022, 0.012, 0, 0.05, 0.085, 0.3)
      .box(M.dark, 0.008, 0.012, 0.01, 0, 0.076, -0.165)
      .box(M.dark, 0.022, 0.012, 0.01, 0, 0.076, 0.06);
    const mag = new Kit().box(M.dark, 0.028, 0.022, 0.048, 0, -0.011, 0, -0.28).build('mag');
    return { k, mag, magAt: v(0, -0.11, 0.08), points: { grip: v(0, -0.05, 0.05), fore: v(-0.024, -0.07, 0.055), well: v(0, -0.11, 0.08), handle: v(0, 0.04, 0.05), muzzle: v(0, 0.04, -0.18) } };
  },

  knife() {
    const k = new Kit()
      .add(M.chrome, blade([[0, 0.014], [0.18, 0.014], [0.225, -0.003], [0.16, -0.02], [0, -0.02]], 0.007), 0, 0, -0.02)
      .box(M.steel, 0.004, 0.01, 0.17, 0, 0.012, -0.1)
      .box(M.dark, 0.026, 0.066, 0.014, 0, -0.004, -0.012)
      .box(M.black, 0.022, 0.034, 0.12, 0, -0.004, 0.06)
      .box(M.dark, 0.024, 0.006, 0.11, 0, -0.004, 0.06)
      .box(M.steel, 0.024, 0.036, 0.014, 0, -0.004, 0.126);
    return { k, points: { grip: v(0, -0.01, 0.1), fore: v(0, -0.004, 0.06), well: v(0, -0.004, 0.06), handle: v(0, -0.004, 0.06), muzzle: v(0, 0, -0.25) } };
  },

  kukri() {
    const k = new Kit()
      .add(M.steel, blade([[0, 0.012], [0.08, 0.022], [0.19, 0.032], [0.26, 0.016], [0.275, -0.016], [0.22, -0.046], [0.12, -0.038], [0.05, -0.024], [0, -0.017]], 0.009), 0, 0, -0.02, -0.18, 0, 0)
      .box(M.gold, 0.024, 0.04, 0.018, 0, -0.002, -0.014)
      .box(M.woodDark, 0.026, 0.036, 0.11, 0, -0.004, 0.052, 0.12)
      .box(M.gold, 0.028, 0.04, 0.014, 0, -0.01, 0.112, 0.12);
    return { k, points: { grip: v(0, -0.014, 0.095), fore: v(0, -0.006, 0.055), well: v(0, -0.006, 0.055), handle: v(0, -0.006, 0.055), muzzle: v(0, -0.02, -0.29) } };
  },

  machete() {
    const k = new Kit()
      .add(M.dark, blade([[0, 0.02], [0.3, 0.03], [0.42, 0.034], [0.5, 0.012], [0.49, -0.03], [0.4, -0.046], [0.2, -0.04], [0, -0.03]], 0.007), 0, 0, -0.02)
      .add(M.chrome, blade([[0.02, -0.03], [0.2, -0.04], [0.4, -0.046], [0.49, -0.03], [0.48, -0.024], [0.4, -0.039], [0.2, -0.033], [0.02, -0.024]], 0.008), 0, 0, -0.02)
      .box(M.steel, 0.004, 0.006, 0.26, 0, 0.026, -0.17)
      .box(M.black, 0.03, 0.074, 0.014, 0, -0.008, -0.014)
      .box(M.black, 0.026, 0.04, 0.14, 0, -0.004, 0.066)
      .box(M.dark, 0.028, 0.008, 0.13, 0, -0.004, 0.066)
      .box(M.black, 0.012, 0.012, 0.15, 0, -0.05, 0.07)
      .box(M.black, 0.012, 0.05, 0.012, 0, -0.03, 0.14)
      .box(M.steel, 0.03, 0.044, 0.016, 0, -0.006, 0.14);
    return { k, points: { grip: v(0, -0.008, 0.07), fore: v(0, -0.004, 0.065), well: v(0, -0.004, 0.065), handle: v(0, -0.004, 0.065), muzzle: v(0, 0, -0.52) } };
  },

  he() {
    const k = new Kit()
      .add(M.olive, new THREE.SphereGeometry(0.036, 10, 8).scale(1, 1.18, 1), 0, 0, 0)
      .cyl(M.dark, 0.014, 0.022, 0, 0.048, 0, { axis: 'y', seg: 8 })
      .box(M.steel, 0.012, 0.075, 0.008, 0.028, 0.02, 0, 0, 0, -0.25)
      .add(M.steel, new THREE.TorusGeometry(0.011, 0.0025, 4, 10), -0.016, 0.058, 0, 0, Math.PI / 2, 0)
      .box(M.black, 0.074, 0.006, 0.074, 0, -0.012, 0);
    return { k, points: { grip: v(0, -0.01, 0.03), fore: v(-0.1, -0.12, 0.12), well: v(0, 0, 0), handle: v(0, 0, 0), muzzle: v(0, 0.06, 0) } };
  },

  smoke() {
    const k = new Kit()
      .cyl(M.steel, 0.03, 0.11, 0, 0, 0, { axis: 'y', seg: 10 })
      .cyl(M.black, 0.031, 0.02, 0, 0.03, 0, { axis: 'y', seg: 10 })
      .cyl(M.dark, 0.016, 0.02, 0, 0.065, 0, { axis: 'y', seg: 8 })
      .box(M.steel, 0.012, 0.09, 0.008, 0.032, 0.02, 0, 0, 0, -0.18)
      .add(M.steel, new THREE.TorusGeometry(0.011, 0.0025, 4, 10), -0.016, 0.072, 0, 0, Math.PI / 2, 0);
    return { k, points: { grip: v(0, -0.01, 0.03), fore: v(-0.1, -0.12, 0.12), well: v(0, 0, 0), handle: v(0, 0, 0), muzzle: v(0, 0.07, 0) } };
  },

  c4() {
    const k = new Kit()
      .box(M.tan, 0.2, 0.055, 0.13, 0, 0, 0)
      .box(M.black, 0.09, 0.012, 0.075, -0.03, 0.033, 0.01)
      .box(M.glass, 0.05, 0.004, 0.02, -0.03, 0.04, -0.015)
      .box(M.dark, 0.012, 0.004, 0.012, -0.05, 0.04, 0.02)
      .box(M.dark, 0.012, 0.004, 0.012, -0.03, 0.04, 0.02)
      .box(M.dark, 0.012, 0.004, 0.012, -0.01, 0.04, 0.02)
      .box(M.bakelite, 0.008, 0.06, 0.135, 0.06, 0, 0)
      .box(M.olive, 0.2, 0.06, 0.012, 0, 0, 0.05)
      .box(M.olive, 0.2, 0.06, 0.012, 0, 0, -0.05);
    return { k, points: { grip: v(0.09, -0.02, 0.04), fore: v(-0.09, -0.02, 0.04), well: v(0, 0, 0), handle: v(0, 0, 0), muzzle: v(0, 0.04, -0.07) } };
  },
};

export function buildGun(id) {
  const def = BUILDERS[id]();
  const root = def.k.build(id);
  const out = { root, points: def.points, mag: null, pump: null };
  if (def.mag) {
    def.mag.position.copy(def.magAt);
    root.add(def.mag);
    out.mag = def.mag;
  }
  if (def.pump) {
    def.pump.position.copy(def.pumpAt);
    root.add(def.pump);
    out.pump = def.pump;
  }
  return out;
}

