import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Physics } from './Physics.js';
import { NavGrid } from './NavGrid.js';
import { BuildingKit, useTextures } from './Building.js';

function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Arena {
  constructor(assets, scene, map) {
    this.assets = assets;
    this.scene = scene;
    this.map = map;
    this.half = map.half;
    this.rng = mulberry(map.seed || 712);

    this.root = new THREE.Group();
    this.root.name = 'arena';
    this.far = new THREE.Group();
    this.far.name = 'far';
    this.lights = new THREE.Group();
    scene.add(this.root, this.far, this.lights);

    this.physics = new Physics(this.half + 12);
    useTextures(assets.pbr);
    this.kit = new BuildingKit(this);
    this.spawns = [];
    this.teamSpawns = { A: [], B: [] };
    this.pickupSpots = { health: [], ammo: [] };
    this.pads = [];

    this.buildEnvironment(map.theme);
    this.buildGround(map.theme);
    map.build(this);
    this.markSites(map.sites || {});
    this.root.add(this.kit.finish());
    this.buildPads();

    this.root = this.bake(this.root);
    this.far = this.bake(this.far);
    this.physics.rasterize(this.root);
    this.physics.closeBounds(this.half + 3);

    this.nav = new NavGrid(this.physics, this.half, 1, 0.5);
    const fix = (list) => list.map((p) => this.nav.nearestFree(p.x, p.z));
    this.spawns = fix(this.spawns);
    this.teamSpawns.A = fix(this.teamSpawns.A);
    this.teamSpawns.B = fix(this.teamSpawns.B);
    this.pickupSpots.health = fix(this.pickupSpots.health);
    this.pickupSpots.ammo = fix(this.pickupSpots.ammo);
    this.sites = {};
    for (const [id, [x, z]] of Object.entries(map.sites || {})) {
      const p = this.nav.nearestFree(x, z);
      this.sites[id] = { id, x: p.x, z: p.z, r: 4.6 };
    }
  }

  markSites(sites) {
    for (const [id, [x, z]] of Object.entries(sites)) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      g.font = '900 200px "Exo 2", system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.strokeText(id, 128, 138);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillText(id, 128, 138);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const letter = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 3.2),
        new THREE.MeshBasicMaterial({ map: tex, color: 0xff7a5c, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
      );
      letter.rotation.x = -Math.PI / 2;
      letter.position.set(x, 0.03, z);
      letter.userData.noCollide = true;
      this.root.add(letter);
      this.decal(x, z, 1, 1, 0xff7a5c, 0.025, 0.85, new THREE.RingGeometry(4.35, 4.6, 64));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        this.decal(x + Math.cos(a) * 3.9, z + Math.sin(a) * 3.9, 0.7, 0.18, 0xff7a5c, 0.024, 0.6).rotation.z = -a;
      }
    }
  }

  dispose() {
    for (const g of [this.root, this.far, this.lights]) {
      this.scene.remove(g);
      g.traverse((o) => {
        if (o.isMesh) o.geometry.dispose();
      });
    }
    this.sun.shadow.map?.dispose();
  }

  bake(source) {
    source.updateMatrixWorld(true);
    const groups = new Map();
    const keep = [];
    source.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.dynamic || o.material.transparent || !o.geometry.attributes.normal) {
        keep.push(o);
        return;
      }
      const kit = o.material.userData.kit;
      const solid = o.userData.noCollide ? 0 : 1;
      const key = `${kit ? `${kit}/${o.material.name}` : o.material.uuid}:${o.castShadow ? 1 : 0}:${solid}`;
      if (!groups.has(key)) groups.set(key, { material: o.material, cast: o.castShadow, solid, list: [] });
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const name of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      }
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(o.matrixWorld);
      groups.get(key).list.push(g);
    });

    const baked = new THREE.Group();
    baked.name = source.name;
    for (const { material, cast, solid, list } of groups.values()) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      if (!solid) mesh.userData.noCollide = true;
      baked.add(mesh);
      list.forEach((g) => g.dispose());
    }

    for (const o of keep) {
      o.updateMatrixWorld(true);
      o.matrixWorld.decompose(o.position, o.quaternion, o.scale);
      o.removeFromParent();
      baked.add(o);
    }

    this.scene.remove(source);
    this.scene.add(baked);
    return baked;
  }

  buildEnvironment(theme) {
    const { sky } = this.assets;
    this.scene.background = sky;
    this.scene.environment = sky;
    this.scene.environmentIntensity = theme.env ?? 0.55;
    this.scene.backgroundIntensity = theme.skyIntensity ?? 0.9;
    this.scene.backgroundRotation.y = theme.skyRot ?? 1.2;
    this.scene.environmentRotation.y = theme.skyRot ?? 1.2;
    this.scene.fog = new THREE.Fog(theme.fog, theme.fogNear ?? 60, theme.fogFar ?? 240);

    const sun = new THREE.DirectionalLight(theme.sun, theme.sunIntensity ?? 3.1);
    sun.position.set(...(theme.sunPos || [-40, 62, 28]));
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const s = sun.shadow.camera;
    const r = this.half + 14;
    s.left = -r;
    s.right = r;
    s.top = r;
    s.bottom = -r;
    s.near = 10;
    s.far = 200;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    sun.shadow.autoUpdate = false;
    this.lights.add(sun, sun.target);
    this.sun = sun;

    this.hemi = new THREE.HemisphereLight(theme.skyColor ?? 0xcfe3ff, theme.groundColor ?? 0x6b5a48, 0.55);
    this.lights.add(this.hemi);
    this.theme = theme;
  }

  setDetail(level) {
    this.far.visible = level !== 'low';
  }

  setShading(fast) {
    this.hemi.intensity = fast ? 1.35 : 0.55;
    this.sun.intensity = (this.theme.sunIntensity ?? 3.1) * (fast ? 0.88 : 1);
  }

  buildGround(theme) {
    const set = theme.floorTex ? this.assets.pbr[theme.floorTex] : this.assets.ground;
    const map = set.map.clone();
    const normal = set.normal.clone();
    const rough = set.rough.clone();
    const size = 420;
    const repeat = size / (theme.groundScale || 5);
    for (const t of [map, normal, rough]) t.repeat.set(repeat, repeat);

    const mat = new THREE.MeshStandardMaterial({
      map,
      normalMap: normal,
      roughnessMap: rough,
      color: theme.ground ?? 0xd8d2c8,
      roughness: 1,
      metalness: 0,
      normalScale: new THREE.Vector2(0.9, 0.9),
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.noCollide = true;
    this.root.add(ground);
  }

  decal(x, z, w, d, color, y = 0.012, opacity = 1, geometry = new THREE.PlaneGeometry(w, d)) {
    const layer = y < 0.1 ? Math.min(4, Math.round(y * 100)) : -1;
    const m = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: opacity < 1, opacity, polygonOffset: layer >= 0, polygonOffsetFactor: -1 - layer, polygonOffsetUnits: -1 - layer }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.userData.noCollide = true;
    this.root.add(m);
    return m;
  }

  place(key, x, z, { rot = 0, scale = 7, y = 0, parent = this.root } = {}) {
    const obj = this.assets.clone(key);
    obj.scale.setScalar(scale);
    obj.rotation.y = rot;
    obj.position.set(x, y, z);
    parent.add(obj);
    return obj;
  }

  placeFitted(key, x, z, rot, scale, parent = this.root) {
    const obj = this.assets.clone(key);
    obj.scale.setScalar(scale);
    obj.rotation.y = rot;
    parent.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    obj.position.set(x - (box.min.x + box.max.x) / 2, 0, z - (box.min.z + box.max.z) / 2);
    obj.updateMatrixWorld(true);
    return obj;
  }

  quad(fn) {
    for (let q = 0; q < 4; q++) {
      const a = (q * Math.PI) / 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const at = (x, z) => [x * c + z * s, -x * s + z * c];
      fn(at, a, q);
    }
  }

  mirror(fn) {
    fn((x, z) => [x, z], 0, 0);
    fn((x, z) => [-x, -z], Math.PI, 1);
  }

  perimeter(models, scale = 7) {
    const edge = this.half + 0.5;
    const sides = [
      { rot: 0, along: (t) => [t, -edge], out: [0, -1] },
      { rot: Math.PI, along: (t) => [t, edge], out: [0, 1] },
      { rot: Math.PI / 2, along: (t) => [-edge, t], out: [-1, 0] },
      { rot: -Math.PI / 2, along: (t) => [edge, t], out: [1, 0] },
    ];
    for (const side of sides) {
      let t = -edge - 6;
      while (t < edge + 6) {
        const key = models[Math.floor(this.rng() * models.length)];
        const obj = this.assets.clone(key);
        obj.scale.setScalar(scale);
        obj.rotation.y = side.rot;
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj);
        const sizeAlong = side.out[0] === 0 ? box.max.x - box.min.x : box.max.z - box.min.z;
        const depth = side.out[0] === 0 ? box.max.z - box.min.z : box.max.x - box.min.x;
        const [ax, az] = side.along(t + sizeAlong / 2);
        const cx = ax + side.out[0] * (depth / 2);
        const cz = az + side.out[1] * (depth / 2);
        obj.position.set(cx - (box.min.x + box.max.x) / 2, 0, cz - (box.min.z + box.max.z) / 2);
        this.root.add(obj);
        t += sizeAlong + 0.1 + this.rng() * 0.3;
      }
    }
  }

  ring(models, count, r0, r1, s0, s1) {
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = r0 + this.rng() * (r1 - r0);
      const t = this.placeFitted(models[i % models.length], Math.cos(a) * r, Math.sin(a) * r, this.rng() * 6.3, s0 + this.rng() * (s1 - s0), this.far);
      t.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
      });
    }
  }

  pad(x, z, power = 15) {
    this.pads.push({ x, z, power });
  }

  buildPads() {
    if (!this.pads.length) return;
    const base = new THREE.CylinderGeometry(1.1, 1.25, 0.18, 24);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.4, metalness: 0.6 });
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x58f0ff).multiplyScalar(1.6) });
    for (const p of this.pads) {
      const m = new THREE.Mesh(base, baseMat);
      m.position.set(p.x, 0.09, p.z);
      m.userData.noCollide = true;
      this.root.add(m);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), glow);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(p.x, 0.185, p.z);
      disc.userData.noCollide = true;
      this.root.add(disc);
    }
  }
}
