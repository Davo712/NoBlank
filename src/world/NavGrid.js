import * as THREE from 'three';

const SQRT2 = Math.SQRT2;
const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

class Heap {
  constructor(score) {
    this.items = [];
    this.score = score;
  }

  get size() {
    return this.items.length;
  }

  push(v) {
    const a = this.items;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.score[a[p]] <= this.score[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l;
        if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export class NavGrid {
  constructor(physics, half, cell = 1, clearance = 0.5) {
    this.half = half;
    this.cell = cell;
    this.size = Math.ceil((half * 2) / cell);
    this.blocked = new Uint8Array(this.size * this.size);
    this.g = new Float32Array(this.size * this.size);
    this.f = new Float32Array(this.size * this.size);
    this.from = new Int32Array(this.size * this.size);
    this.stamp = new Uint32Array(this.size * this.size);
    this.closed = new Uint32Array(this.size * this.size);
    this.run = 0;
    this.build(physics, clearance);
  }

  build(physics, clearance) {
    const n = this.size;
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const wx = this.toWorld(x);
        const wz = this.toWorld(z);
        const edge = Math.abs(wx) > this.half - clearance || Math.abs(wz) > this.half - clearance;
        this.blocked[z * n + x] = edge || physics.maxHeight(wx, wz, clearance) > 0.45 ? 1 : 0;
      }
    }
  }

  toCell(w) {
    return Math.max(0, Math.min(this.size - 1, Math.floor((w + this.half) / this.cell)));
  }

  toWorld(c) {
    return -this.half + (c + 0.5) * this.cell;
  }

  isFree(x, z) {
    return !this.blocked[this.toCell(z) * this.size + this.toCell(x)];
  }

  nearestFree(x, z) {
    const cx = this.toCell(x);
    const cz = this.toCell(z);
    const n = this.size;
    if (!this.blocked[cz * n + cx]) return new THREE.Vector3(x, 0, z);
    for (let r = 1; r < 20; r++) {
      let best = null;
      let bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const ix = cx + dx;
          const iz = cz + dz;
          if (ix < 0 || iz < 0 || ix >= n || iz >= n || this.blocked[iz * n + ix]) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = [ix, iz];
          }
        }
      }
      if (best) return new THREE.Vector3(this.toWorld(best[0]), 0, this.toWorld(best[1]));
    }
    return new THREE.Vector3(x, 0, z);
  }

  randomPoint(rng = Math.random) {
    for (let i = 0; i < 200; i++) {
      const x = Math.floor(rng() * this.size);
      const z = Math.floor(rng() * this.size);
      if (!this.blocked[z * this.size + x]) {
        return new THREE.Vector3(this.toWorld(x), 0, this.toWorld(z));
      }
    }
    return new THREE.Vector3();
  }

  walkable(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / (this.cell * 0.35));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.isFree(ax + dx * t, az + dz * t)) return false;
    }
    return true;
  }

  findPath(start, goal) {
    const n = this.size;
    let sx = this.toCell(start.x);
    let sz = this.toCell(start.z);
    let gx = this.toCell(goal.x);
    let gz = this.toCell(goal.z);

    if (this.blocked[sz * n + sx]) {
      const p = this.nearestFree(start.x, start.z);
      sx = this.toCell(p.x);
      sz = this.toCell(p.z);
    }
    if (this.blocked[gz * n + gx]) {
      const p = this.nearestFree(goal.x, goal.z);
      gx = this.toCell(p.x);
      gz = this.toCell(p.z);
    }

    const run = ++this.run;
    const s = sz * n + sx;
    const goalIndex = gz * n + gx;
    const heap = new Heap(this.f);
    const h = (x, z) => {
      const ddx = Math.abs(x - gx);
      const ddz = Math.abs(z - gz);
      return ddx + ddz + (SQRT2 - 2) * Math.min(ddx, ddz);
    };

    this.stamp[s] = run;
    this.g[s] = 0;
    this.f[s] = h(sx, sz);
    this.from[s] = -1;
    heap.push(s);

    let found = false;
    let iterations = 0;
    while (heap.size && iterations++ < 6000) {
      const cur = heap.pop();
      if (this.closed[cur] === run) continue;
      this.closed[cur] = run;
      if (cur === goalIndex) {
        found = true;
        break;
      }
      const cx = cur % n;
      const cz = (cur / n) | 0;
      for (const [ox, oz, cost] of NEIGHBORS) {
        const nx = cx + ox;
        const nz = cz + oz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const ni = nz * n + nx;
        if (this.blocked[ni] || this.closed[ni] === run) continue;
        if (ox && oz && (this.blocked[cz * n + nx] || this.blocked[nz * n + cx])) continue;
        const g = this.g[cur] + cost;
        if (this.stamp[ni] !== run || g < this.g[ni]) {
          this.stamp[ni] = run;
          this.g[ni] = g;
          this.f[ni] = g + h(nx, nz);
          this.from[ni] = cur;
          heap.push(ni);
        }
      }
    }

    if (!found) return null;

    const cells = [];
    for (let c = goalIndex; c !== -1; c = this.from[c]) cells.push(c);
    cells.reverse();

    const points = cells.map((c) => new THREE.Vector3(this.toWorld(c % n), 0, this.toWorld((c / n) | 0)));
    if (points.length) {
      points[points.length - 1].set(goal.x, 0, goal.z);
      if (!this.isFree(goal.x, goal.z)) {
        points[points.length - 1].set(this.toWorld(gx), 0, this.toWorld(gz));
      }
    }
    return this.smooth(start, points);
  }

  smooth(start, points) {
    if (points.length < 3) return points;
    const out = [];
    let anchor = start;
    let i = 0;
    while (i < points.length) {
      let j = Math.min(points.length - 1, i + 40);
      while (j > i && !this.walkable(anchor.x, anchor.z, points[j].x, points[j].z)) j--;
      out.push(points[j]);
      anchor = points[j];
      i = j + 1;
    }
    return out;
  }
}
