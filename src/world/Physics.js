import * as THREE from 'three';

const STEP_HEIGHT = 0.55;
const WALL = 40;
const SAMPLES = [[0, 0], [-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class Physics {
  constructor(extent, cell = 0.25) {
    this.extent = extent;
    this.cell = cell;
    this.size = Math.ceil((extent * 2) / cell);
    this.height = new Float32Array(this.size * this.size);
    this.boxes = [];
  }

  addBox(min, max) {
    this.boxes.push({ min: min.clone(), max: max.clone() });
  }

  index(x, z) {
    const ix = Math.floor((x + this.extent) / this.cell);
    const iz = Math.floor((z + this.extent) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.size || iz >= this.size) return -1;
    return iz * this.size + ix;
  }

  heightAt(x, z) {
    const i = this.index(x, z);
    let h = i < 0 ? WALL : this.height[i];
    for (const b of this.boxes) {
      if (b.min.y < 1.6 && x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y > h) h = b.max.y;
    }
    return h;
  }

  maxHeight(x, z, r) {
    const c = this.cell;
    const e = this.extent;
    const n = this.size;
    const x0 = Math.floor((x - r + e) / c);
    const x1 = Math.floor((x + r + e) / c);
    const z0 = Math.floor((z - r + e) / c);
    const z1 = Math.floor((z + r + e) / c);
    let m = 0;
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        if (ix < 0 || iz < 0 || ix >= n || iz >= n) return WALL;
        const h = this.height[iz * n + ix];
        if (h > m) m = h;
      }
    }
    for (const b of this.boxes) {
      if (b.min.y > 1.6 || b.max.y < 0.3) continue;
      if (x + r < b.min.x || x - r > b.max.x || z + r < b.min.z || z - r > b.max.z) continue;
      if (b.max.y > m) m = b.max.y;
    }
    return m;
  }

  fillRect(x0, z0, x1, z1, h) {
    const c = this.cell;
    const e = this.extent;
    const n = this.size;
    const ix0 = Math.max(0, Math.round((x0 + e) / c));
    const ix1 = Math.min(n, Math.round((x1 + e) / c));
    const iz0 = Math.max(0, Math.round((z0 + e) / c));
    const iz1 = Math.min(n, Math.round((z1 + e) / c));
    for (let iz = iz0; iz < iz1; iz++) {
      for (let ix = ix0; ix < ix1; ix++) {
        const i = iz * n + ix;
        if (h > this.height[i]) this.height[i] = h;
      }
    }
  }

  rasterize(root) {
    root.updateMatrixWorld(true);
    const c = this.cell;
    const e = this.extent;
    const n = this.size;
    const H = this.height;

    root.traverse((o) => {
      if (!o.isMesh || o.userData.noCollide) return;
      const pos = o.geometry.attributes.position;
      const index = o.geometry.index;
      const count = index ? index.count : pos.count;
      const vert = (k, out) => out.fromBufferAttribute(pos, index ? index.getX(k) : k).applyMatrix4(o.matrixWorld);

      for (let k = 0; k < count; k += 3) {
        vert(k, _a);
        vert(k + 1, _b);
        vert(k + 2, _c);
        const minX = Math.min(_a.x, _b.x, _c.x);
        const maxX = Math.max(_a.x, _b.x, _c.x);
        const minZ = Math.min(_a.z, _b.z, _c.z);
        const maxZ = Math.max(_a.z, _b.z, _c.z);
        if (maxX < -e || minX > e || maxZ < -e || minZ > e) continue;
        const top = Math.max(_a.y, _b.y, _c.y);
        if (top < 0.05) continue;

        const det = (_b.z - _c.z) * (_a.x - _c.x) + (_c.x - _b.x) * (_a.z - _c.z);
        const flat = Math.abs(det) < 1e-9;
        const ix0 = Math.max(0, Math.floor((minX + e) / c));
        const ix1 = Math.min(n - 1, Math.floor((maxX + e) / c));
        const iz0 = Math.max(0, Math.floor((minZ + e) / c));
        const iz1 = Math.min(n - 1, Math.floor((maxZ + e) / c));

        for (let iz = iz0; iz <= iz1; iz++) {
          for (let ix = ix0; ix <= ix1; ix++) {
            const i = iz * n + ix;
            if (flat) {
              if (maxX - minX < c * 1.5 && maxZ - minZ < c * 1.5 && top > H[i]) H[i] = top;
              continue;
            }
            for (const [sx, sz] of SAMPLES) {
              const px = -e + (ix + 0.5 + sx) * c;
              const pz = -e + (iz + 0.5 + sz) * c;
              const l1 = ((_b.z - _c.z) * (px - _c.x) + (_c.x - _b.x) * (pz - _c.z)) / det;
              const l2 = ((_c.z - _a.z) * (px - _c.x) + (_a.x - _c.x) * (pz - _c.z)) / det;
              const l3 = 1 - l1 - l2;
              if (l1 < -0.001 || l2 < -0.001 || l3 < -0.001) continue;
              const y = l1 * _a.y + l2 * _b.y + l3 * _c.y;
              if (y > H[i]) H[i] = y;
            }
          }
        }
      }
    });

    for (let i = 0; i < H.length; i++) if (H[i] < 0.12) H[i] = 0;
  }

  closeBounds(half, minHeight = 2.2) {
    const n = this.size;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = -this.extent + (ix + 0.5) * this.cell;
        const z = -this.extent + (iz + 0.5) * this.cell;
        if (Math.abs(x) < half && Math.abs(z) < half) continue;
        const i = iz * n + ix;
        if (this.height[i] < minHeight) this.height[i] = WALL;
      }
    }
  }

  resolve(body) {
    const p = body.position;
    const v = body.velocity;
    const r = body.radius;
    const c = this.cell;
    const e = this.extent;
    const n = this.size;
    const H = this.height;
    body.grounded = false;

    for (let pass = 0; pass < 2; pass++) {
      const x0 = Math.floor((p.x - r + e) / c);
      const x1 = Math.floor((p.x + r + e) / c);
      const z0 = Math.floor((p.z - r + e) / c);
      const z1 = Math.floor((p.z + r + e) / c);
      for (let iz = z0; iz <= z1; iz++) {
        for (let ix = x0; ix <= x1; ix++) {
          const out = ix < 0 || iz < 0 || ix >= n || iz >= n;
          const h = out ? WALL : H[iz * n + ix];
          if (h <= p.y + STEP_HEIGHT) continue;
          const minX = -e + ix * c;
          const minZ = -e + iz * c;
          const cx = Math.max(minX, Math.min(p.x, minX + c));
          const cz = Math.max(minZ, Math.min(p.z, minZ + c));
          const dx = p.x - cx;
          const dz = p.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            const push = (r - d) / d;
            p.x += dx * push;
            p.z += dz * push;
            const nx = dx / d;
            const nz = dz / d;
            const vn = v.x * nx + v.z * nz;
            if (vn < 0) {
              v.x -= vn * nx;
              v.z -= vn * nz;
            }
          } else {
            const ox = p.x - (minX + c / 2);
            const oz = p.z - (minZ + c / 2);
            if (Math.abs(ox) > Math.abs(oz)) p.x = ox > 0 ? minX + c + r : minX - r;
            else p.z = oz > 0 ? minZ + c + r : minZ - r;
          }
        }
      }
    }

    for (const b of this.boxes) {
      const cx = Math.max(b.min.x, Math.min(p.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(p.z, b.max.z));
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      const h = body.height;
      if (p.y >= b.max.y - 0.001 || p.y + h <= b.min.y) continue;
      if (b.max.y - p.y <= STEP_HEIGHT && body.prevY >= b.max.y - STEP_HEIGHT - 0.05) continue;
      if (body.prevY + h <= b.min.y + 0.05 && v.y > 0) {
        p.y = b.min.y - h;
        v.y = 0;
        continue;
      }
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        p.x += dx * push;
        p.z += dz * push;
        const nx = dx / d;
        const nz = dz / d;
        const vn = v.x * nx + v.z * nz;
        if (vn < 0) {
          v.x -= vn * nx;
          v.z -= vn * nz;
        }
      } else {
        const m = Math.min(p.x - b.min.x, b.max.x - p.x, p.z - b.min.z, b.max.z - p.z);
        if (m === p.x - b.min.x) p.x = b.min.x - r;
        else if (m === b.max.x - p.x) p.x = b.max.x + r;
        else if (m === p.z - b.min.z) p.z = b.min.z - r;
        else p.z = b.max.z + r;
      }
    }

    let floor = 0;
    const fr = r * 0.55;
    const fx0 = Math.floor((p.x - fr + e) / c);
    const fx1 = Math.floor((p.x + fr + e) / c);
    const fz0 = Math.floor((p.z - fr + e) / c);
    const fz1 = Math.floor((p.z + fr + e) / c);
    for (let iz = fz0; iz <= fz1; iz++) {
      for (let ix = fx0; ix <= fx1; ix++) {
        if (ix < 0 || iz < 0 || ix >= n || iz >= n) continue;
        const h = H[iz * n + ix];
        if (h > floor && h <= p.y + STEP_HEIGHT) floor = h;
      }
    }
    for (const b of this.boxes) {
      if (p.x + fr < b.min.x || p.x - fr > b.max.x || p.z + fr < b.min.z || p.z - fr > b.max.z) continue;
      if (b.max.y > floor && b.max.y <= p.y + STEP_HEIGHT && b.max.y >= p.y - 0.6) floor = b.max.y;
    }
    if (p.y <= floor + 0.02 && v.y <= 0.5) {
      p.y = floor;
      if (v.y < 0) v.y = 0;
      body.grounded = true;
    }
    body.prevY = p.y;
  }

  raycast(o, d, maxDist = Infinity) {
    let best = maxDist;
    let normal = null;
    if (d.y < -1e-6) {
      const tg = -o.y / d.y;
      if (tg >= 0 && tg < best) {
        best = tg;
        normal = 'ground';
      }
    }

    const c = this.cell;
    const e = this.extent;
    const n = this.size;
    const H = this.height;
    let ix = Math.floor((o.x + e) / c);
    let iz = Math.floor((o.z + e) / c);
    const stepX = d.x > 0 ? 1 : -1;
    const stepZ = d.z > 0 ? 1 : -1;
    const ax = Math.abs(d.x);
    const az = Math.abs(d.z);
    const dX = ax > 1e-9 ? c / ax : Infinity;
    const dZ = az > 1e-9 ? c / az : Infinity;
    let tX = ax > 1e-9 ? ((-e + (ix + (stepX > 0 ? 1 : 0)) * c) - o.x) / d.x : Infinity;
    let tZ = az > 1e-9 ? ((-e + (iz + (stepZ > 0 ? 1 : 0)) * c) - o.z) / d.z : Infinity;
    let t = 0;
    let axis = -1;
    let hitNormal = null;

    for (let guard = 0; guard < 4000 && t < best; guard++) {
      const inside = ix >= 0 && iz >= 0 && ix < n && iz < n;
      if (!inside && t > 0) {
        const leavingX = (ix < 0 && stepX < 0) || (ix >= n && stepX > 0);
        const leavingZ = (iz < 0 && stepZ < 0) || (iz >= n && stepZ > 0);
        if (leavingX || leavingZ) break;
      }
      const tExit = Math.min(tX, tZ, best);
      if (inside) {
        const h = H[iz * n + ix];
        if (h > 0) {
          const yIn = o.y + d.y * t;
          const yOut = o.y + d.y * tExit;
          if (yIn < h && axis >= 0) {
            best = t;
            hitNormal = axis === 0 ? new THREE.Vector3(-stepX, 0, 0) : new THREE.Vector3(0, 0, -stepZ);
            break;
          }
          if (yIn >= h && yOut < h && d.y < 0) {
            best = (h - o.y) / d.y;
            hitNormal = new THREE.Vector3(0, 1, 0);
            break;
          }
        }
      }
      if (tX < tZ) {
        t = tX;
        tX += dX;
        ix += stepX;
        axis = 0;
      } else {
        t = tZ;
        tZ += dZ;
        iz += stepZ;
        axis = 2;
      }
    }

    const ix0 = 1 / d.x;
    const iy0 = 1 / d.y;
    const iz0 = 1 / d.z;
    for (const b of this.boxes) {
      let t1 = (b.min.x - o.x) * ix0;
      let t2 = (b.max.x - o.x) * ix0;
      let tmin = Math.min(t1, t2);
      let tmax = Math.max(t1, t2);
      let ax = 0;
      let sg = ix0 < 0 ? 1 : -1;
      t1 = (b.min.y - o.y) * iy0;
      t2 = (b.max.y - o.y) * iy0;
      let nn = Math.min(t1, t2);
      if (nn > tmin) { tmin = nn; ax = 1; sg = iy0 < 0 ? 1 : -1; }
      tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (b.min.z - o.z) * iz0;
      t2 = (b.max.z - o.z) * iz0;
      nn = Math.min(t1, t2);
      if (nn > tmin) { tmin = nn; ax = 2; sg = iz0 < 0 ? 1 : -1; }
      tmax = Math.min(tmax, Math.max(t1, t2));
      if (tmax < 0 || tmin > tmax || tmin < 0 || tmin >= best) continue;
      best = tmin;
      hitNormal = new THREE.Vector3();
      hitNormal.setComponent(ax, sg);
    }

    if (hitNormal) {
      return { distance: best, point: o.clone().addScaledVector(d, best), normal: hitNormal, ground: false };
    }
    if (normal === 'ground' && best < maxDist) {
      return { distance: best, point: o.clone().addScaledVector(d, best), normal: new THREE.Vector3(0, 1, 0), ground: true };
    }
    return null;
  }

  lineClear(a, b) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-4) return true;
    _dir.divideScalar(len);
    return !this.raycast(a, _dir, len);
  }

  groundHeight(x, z, r = 0.3) {
    const h = this.maxHeight(x, z, r);
    return h >= WALL ? 0 : h;
  }
}
