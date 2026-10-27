import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const T = 0.25;
const DOOR_W = 1.6;
const DOOR_H = 2.4;
const WIN_W = 1.3;
const WIN_Y0 = 1.05;
const WIN_Y1 = 2.15;
const STEP_RISE = 0.38;
const STEP_RUN = 0.42;

const materials = new Map();
const TILE = { tiles: 2.4, marble: 2.5, plaster: 3, paint: 2.5, brick: 1.6, greybrick: 1.8, concrete: 3, wood: 1.6, metal: 2 };
const NEUTRAL = new Set(['brick', 'greybrick', 'wood', 'tiles']);
let textures = {};

export function useTextures(set) {
  textures = set || {};
  materials.clear();
}

function mat(color, roughness = 0.85, glow = 0, tex = null) {
  const key = `${color}:${roughness}:${glow}:${tex}`;
  if (!materials.has(key)) {
    const t = tex && textures[tex];
    const m = new THREE.MeshStandardMaterial({ color, roughness: t ? 1 : roughness, metalness: 0 });
    if (t) {
      if (NEUTRAL.has(tex)) m.color.lerp(new THREE.Color(0xffffff), 0.75);
      m.map = t.map;
      m.normalMap = t.normal;
      m.normalScale.set(0.8, 0.8);
      m.roughnessMap = t.rough;
      m.userData.tile = TILE[tex];
    }
    if (glow) {
      m.emissive.set(color);
      m.emissiveIntensity = glow;
    }
    materials.set(key, m);
  }
  return materials.get(key);
}

function worldUV(g, tile) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
    else if (ax >= az) uv.setXY(i, p.getZ(i) / tile, p.getY(i) / tile);
    else uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile);
  }
}

function tint(a, b, k) {
  return new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();
}

function overlaps(a, b) {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

export const PALETTES = {
  plaster: { wall: 0xe8dcc7, base: 0x8d7b67, trim: 0x5b6470, floor: 0x9b7653, roof: 0x7a7f88, tex: 'paint' },
  brick: { wall: 0xc9a08f, base: 0x5e3b30, trim: 0xe9e2d6, floor: 0x8a6a4c, roof: 0x4b5058, tex: 'brick' },
  concrete: { wall: 0xc9ced4, base: 0x6b737c, trim: 0x2f3742, floor: 0x7d8288, roof: 0x5b626b, tex: 'concrete' },
  teal: { wall: 0x7fb7b0, base: 0x3e5d5a, trim: 0xf2efe6, floor: 0x9b7653, roof: 0x55606b, tex: 'paint' },
  adobe: { wall: 0xd9b382, base: 0xa4774a, trim: 0x7a4f2c, floor: 0xc49a6c, roof: 0xc29b6c, tex: 'plaster' },
  adobeLight: { wall: 0xe8cfa6, base: 0xb48a5a, trim: 0x6d4b2e, floor: 0xc49a6c, roof: 0xd4b285, tex: 'plaster' },
  navy: { wall: 0x4a5a78, base: 0x2a3346, trim: 0xe7c06a, floor: 0x7d8288, roof: 0x3c4352, tex: 'paint' },
  greybrick: { wall: 0xd0d0d0, base: 0x4b4f55, trim: 0x2f3742, floor: 0x7d8288, roof: 0x5b626b, tex: 'greybrick' },
};

export class BuildingKit {
  constructor(arena) {
    this.arena = arena;
    this.parts = new Map();
  }

  quad(rot, cx, cz) {
    const c = Math.round(Math.cos(rot));
    const s = Math.round(Math.sin(rot));
    return (x, z) => [cx + x * c + z * s, cz - x * s + z * c];
  }

  box(tf, x0, y0, z0, x1, y1, z1, material, collide = true, visible = true) {
    const [ax, az] = tf(x0, z0);
    const [bx, bz] = tf(x1, z1);
    const min = new THREE.Vector3(Math.min(ax, bx), Math.min(y0, y1), Math.min(az, bz));
    const max = new THREE.Vector3(Math.max(ax, bx), Math.max(y0, y1), Math.max(az, bz));
    if (max.x - min.x < 0.01 || max.y - min.y < 0.01 || max.z - min.z < 0.01) return;
    if (collide) this.arena.physics.addBox(min, max);
    if (!visible || !material) return;
    const g = new THREE.BoxGeometry(max.x - min.x, max.y - min.y, max.z - min.z);
    g.translate((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
    if (material.userData.tile) worldUV(g, material.userData.tile);
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(g.toNonIndexed());
  }

  wall(tf, x0, z0, x1, z1, y0, y1, openings, m, inner = m, inward = 1) {
    const horizontal = Math.abs(z1 - z0) < Math.abs(x1 - x0);
    const len = horizontal ? x1 - x0 : z1 - z0;
    const sorted = [...openings].sort((a, b) => a.at - b.at);
    let cursor = 0;
    const h = T / 2;
    const seg = (a, b, ya, yb) => {
      if (b - a < 0.01 || yb - ya < 0.01) return;
      if (horizontal) {
        this.box(tf, x0 + a, ya, z0 - h, x0 + b, yb, z0 + h, m, true, false);
        this.box(tf, x0 + a, ya, z0 - h * inward, x0 + b, yb, z0, m, false);
        this.box(tf, x0 + a, ya, z0, x0 + b, yb, z0 + h * inward, inner, false);
      } else {
        this.box(tf, x0 - h, ya, z0 + a, x0 + h, yb, z0 + b, m, true, false);
        this.box(tf, x0 - h * inward, ya, z0 + a, x0, yb, z0 + b, m, false);
        this.box(tf, x0, ya, z0 + a, x0 + h * inward, yb, z0 + b, inner, false);
      }
    };
    for (const o of sorted) {
      const a = o.at - o.width / 2;
      const b = o.at + o.width / 2;
      seg(cursor, a, y0, y1);
      seg(a, b, y0, y0 + o.y0);
      seg(a, b, y0 + o.y1, y1);
      cursor = b;
    }
    seg(cursor, len, y0, y1);
  }

  stairPlan(hw, hd, doors, h) {
    const stairW = 1.2;
    const steps = Math.ceil(h / STEP_RISE);
    const run = steps * STEP_RUN;
    const zn = -hd + T / 2 + 0.2;
    const zs = hd - T / 2 - 0.2;
    const xe = hw - T / 2 - stairW;
    const xw = -hw + T / 2;
    const blocked = doors.map(({ side, at = 0, width = DOOR_W }) => {
      const r = width / 2 + 0.45;
      if (side === 's') return [at - r, hd - 2, at + r, hd];
      if (side === 'n') return [at - r, -hd, at + r, -hd + 2];
      if (side === 'e') return [hw - 2, at - r, hw, at + r];
      return [-hw, at - r, -hw + 2, at + r];
    });
    const options = [
      { x0: xe, z0: zn, dir: 1 }, { x0: xw, z0: zn, dir: 1 },
      { x0: xe, z0: zs, dir: -1 }, { x0: xw, z0: zs, dir: -1 },
    ];
    for (const o of options) {
      const end = o.z0 + o.dir * (run + 1.3);
      const rect = [o.x0 - 0.3, Math.min(o.z0, end), o.x0 + stairW + 0.3, Math.max(o.z0, end)];
      if (!blocked.some((b) => overlaps(rect, b))) return { ...o, stairW, steps, run };
    }
    return { ...options[0], stairW, steps, run };
  }

  build({ x, z, w, d, h = 3.4, floors = 1, rot = 0, palette = PALETTES.plaster, doors = [], windows = true, roof = true, stairs = true, parapet = 0.9 }) {
    const tf = this.quad(rot, x, z);
    const hw = w / 2;
    const hd = d / 2;
    const wallM = mat(palette.wall, 0.85, 0, palette.tex);
    const innerM = mat(tint(palette.wall, 0xf4efe6, 0.5), 0.9, 0.3, 'paint');
    const baseM = mat(palette.base, 0.85, 0, 'concrete');
    const trimM = mat(palette.trim, 0.6);
    const floorM = mat(palette.floor, 0.85, 0.22, 'wood');
    const stepM = mat(tint(palette.floor, 0xffffff, 0.15), 0.8, 0.25, 'wood');
    const ceilM = mat(0xe9e4da, 0.95, 0.4, 'paint');
    const roofM = mat(palette.roof);

    const sides = {
      s: { from: [-hw, hd], to: [hw, hd], len: w, inward: -1 },
      n: { from: [-hw, -hd], to: [hw, -hd], len: w, inward: 1 },
      e: { from: [hw, -hd], to: [hw, hd], len: d, inward: -1 },
      w: { from: [-hw, -hd], to: [-hw, hd], len: d, inward: 1 },
    };
    const plan = floors > 1 && stairs ? this.stairPlan(hw, hd, doors, h) : null;
    const slab = (x0, z0, x1, z1, y, m) => {
      this.box(tf, x0, y, z0, x1, y + 0.25, z1, m);
      this.box(tf, x0, y - 0.015, z0, x1, y, z1, ceilM, false);
    };

    for (let f = 0; f < floors; f++) {
      const y0 = f * h;
      const y1 = y0 + h;
      for (const [key, side] of Object.entries(sides)) {
        const openings = [];
        if (f === 0) {
          for (const door of doors.filter((dd) => dd.side === key)) {
            openings.push({ at: side.len / 2 + (door.at || 0), width: door.width || DOOR_W, y0: 0, y1: DOOR_H });
          }
        }
        if (windows) {
          const count = Math.floor((side.len - 1) / 3.2);
          for (let i = 0; i < count; i++) {
            const at = ((i + 0.5) / count) * side.len;
            if (openings.some((o) => Math.abs(o.at - at) < (o.width + WIN_W) / 2 + 0.4)) continue;
            if (at < 1 || at > side.len - 1) continue;
            openings.push({ at, width: WIN_W, y0: WIN_Y0, y1: WIN_Y1 });
          }
        }
        const [fx, fz] = side.from;
        const [tx, tz] = side.to;
        this.wall(tf, fx, fz, tx, tz, y0, y1, openings, wallM, innerM, side.inward);
        for (const o of openings) {
          const a = o.at - o.width / 2 - 0.08;
          const b = o.at + o.width / 2 + 0.08;
          const horizontal = key === 's' || key === 'n';
          const off = key === 's' || key === 'e' ? T / 2 + 0.03 : -T / 2 - 0.03;
          if (horizontal) {
            this.box(tf, fx + a, y0 + o.y1, fz + off - 0.04, fx + b, y0 + o.y1 + 0.14, fz + off + 0.04, trimM, false);
            if (o.y0 > 0) this.box(tf, fx + a, y0 + o.y0 - 0.1, fz + off - 0.08, fx + b, y0 + o.y0, fz + off + 0.08, trimM, false);
          } else {
            this.box(tf, fx + off - 0.04, y0 + o.y1, fz + a, fx + off + 0.04, y0 + o.y1 + 0.14, fz + b, trimM, false);
            if (o.y0 > 0) this.box(tf, fx + off - 0.08, y0 + o.y0 - 0.1, fz + a, fx + off + 0.08, y0 + o.y0, fz + b, trimM, false);
          }
        }
      }

      this.box(tf, -hw + T / 2, y0 + 0.005, -hd + T / 2, hw - T / 2, y0 + 0.02, hd - T / 2, floorM, false);
      if (f < floors - 1 && plan) {
        const { x0: sx0, z0: sz0, dir, stairW, steps, run } = plan;
        for (let i = 0; i < steps; i++) {
          const top = Math.min(h, (i + 1) * STEP_RISE);
          const za = sz0 + dir * i * STEP_RUN;
          const zb = sz0 + dir * (i + 1) * STEP_RUN;
          this.box(tf, sx0, y0, za, sx0 + stairW, y0 + top, zb, stepM);
          this.box(tf, sx0, y0 + top - 0.04, za, sx0 + stairW, y0 + top + 0.01, za + dir * 0.06, trimM, false);
        }
        const x0 = -hw + T / 2;
        const x1 = hw - T / 2;
        const z0 = -hd + T / 2;
        const z1 = hd - T / 2;
        const holeA = Math.min(sz0, sz0 + dir * run);
        const holeB = Math.max(sz0, sz0 + dir * run);
        if (sx0 > x0 + 0.01) slab(x0, z0, sx0, z1, y1, floorM);
        if (sx0 + stairW < x1 - 0.01) slab(sx0 + stairW, z0, x1, z1, y1, floorM);
        if (holeA > z0 + 0.01) slab(sx0, z0, sx0 + stairW, holeA, y1, floorM);
        if (holeB < z1 - 0.01) slab(sx0, holeB, sx0 + stairW, z1, y1, floorM);
        const railX = sx0 > x0 + 0.01 ? sx0 - 0.08 : sx0 + stairW;
        this.box(tf, railX, y1 + 0.25, holeA, railX + 0.08, y1 + 1.1, holeB, trimM);
      } else if (roof || f < floors - 1) {
        this.box(tf, -hw, y1, -hd, hw, y1 + 0.3, hd, roofM);
        this.box(tf, -hw + T / 2, y1 - 0.015, -hd + T / 2, hw - T / 2, y1, hd - T / 2, ceilM, false);
      }
    }

    const top = floors * h;
    if (roof && parapet > 0) {
      this.box(tf, -hw, top + 0.3, -hd, hw, top + 0.3 + parapet, -hd + T, trimM);
      this.box(tf, -hw, top + 0.3, hd - T, hw, top + 0.3 + parapet, hd, trimM);
      this.box(tf, -hw, top + 0.3, -hd + T, -hw + T, top + 0.3 + parapet, hd - T, trimM);
      this.box(tf, hw - T, top + 0.3, -hd + T, hw, top + 0.3 + parapet, hd - T, trimM);
    }

    const gaps = (key, len) => doors.filter((dd) => dd.side === key).map((dd) => len / 2 + (dd.at || 0)).sort((a, b) => a - b);
    const along = (key, len, fn) => {
      let c = -0.06;
      for (const at of gaps(key, len)) {
        fn(c, at - DOOR_W / 2);
        c = at + DOOR_W / 2;
      }
      fn(c, len + 0.06);
    };
    along('n', w, (a, b) => b > a && this.box(tf, -hw + a, 0, -hd - 0.06, -hw + b, 0.4, -hd + 0.01, baseM, false));
    along('s', w, (a, b) => b > a && this.box(tf, -hw + a, 0, hd - 0.01, -hw + b, 0.4, hd + 0.06, baseM, false));
    along('w', d, (a, b) => b > a && this.box(tf, -hw - 0.055, 0, -hd + Math.max(-0.005, a), -hw + 0.01, 0.395, -hd + Math.min(d + 0.005, b), baseM, false));
    along('e', d, (a, b) => b > a && this.box(tf, hw - 0.01, 0, -hd + Math.max(-0.005, a), hw + 0.055, 0.395, -hd + Math.min(d + 0.005, b), baseM, false));
    for (let f = 1; f <= floors; f++) {
      const y = f * h;
      this.box(tf, -hw - 0.1, y - 0.05, -hd - 0.1, hw + 0.1, y + 0.18, -hd + 0.01, trimM, false);
      this.box(tf, -hw - 0.1, y - 0.05, hd - 0.01, hw + 0.1, y + 0.18, hd + 0.1, trimM, false);
      this.box(tf, -hw - 0.095, y - 0.045, -hd - 0.005, -hw + 0.01, y + 0.175, hd + 0.005, trimM, false);
      this.box(tf, hw - 0.01, y - 0.045, -hd - 0.005, hw + 0.095, y + 0.175, hd + 0.005, trimM, false);
    }
  }

  block({ x, z, w, d, h, rot = 0, palette = PALETTES.concrete, rows }) {
    const tf = this.quad(rot, x, z);
    const hw = w / 2;
    const hd = d / 2;
    this.box(tf, -hw, 0, -hd, hw, h, hd, mat(palette.wall, 0.85, 0, palette.tex));
    this.box(tf, -hw - 0.1, h, -hd - 0.1, hw + 0.1, h + 0.35, hd + 0.1, mat(palette.trim, 0.6));
    this.box(tf, -hw - 0.05, 0, -hd - 0.05, hw + 0.05, 0.5, hd + 0.05, mat(palette.base, 0.85, 0, 'concrete'), false);
    const glass = mat(0x7ea4c4, 0.2, 0.18);
    const frame = mat(palette.trim, 0.6);
    const levels = rows || Math.max(1, Math.floor((h - 4) / 3.2));
    for (const [sx, sz, len, horiz] of [[-hw, hd, w, true], [-hw, -hd, w, true], [hw, -hd, d, false], [-hw, -hd, d, false]]) {
      const cols = Math.floor(len / 2.6);
      const out = horiz ? Math.sign(sz) : Math.sign(sx);
      if (horiz) this.box(tf, sx - 0.06, 3.1, sz + out * 0.01, sx + len + 0.06, 3.35, sz + out * 0.08, frame, false);
      else this.box(tf, sx + out * 0.01, 3.1, sz - 0.06, sx + out * 0.08, 3.35, sz + len + 0.06, frame, false);
      for (let r = 0; r < levels; r++) {
        const y0 = 4.1 + r * 3.2;
        if (y0 + 1.5 > h - 0.4) break;
        for (let c = 0; c < cols; c++) {
          const a = ((c + 0.5) / cols) * len - 0.55;
          if (horiz) {
            this.box(tf, sx + a - 0.07, y0 - 0.07, sz + out * 0.01, sx + a + 1.17, y0 + 1.57, sz + out * 0.05, frame, false);
            this.box(tf, sx + a, y0, sz + out * 0.05, sx + a + 1.1, y0 + 1.5, sz + out * 0.07, glass, false);
          } else {
            this.box(tf, sx + out * 0.01, y0 - 0.07, sz + a - 0.07, sx + out * 0.05, y0 + 1.57, sz + a + 1.17, frame, false);
            this.box(tf, sx + out * 0.05, y0, sz + a, sx + out * 0.07, y0 + 1.5, sz + a + 1.1, glass, false);
          }
        }
      }
    }
  }

  arch({ x, z, w, d, y0 = 3.6, h = 4, rot = 0, palette = PALETTES.plaster, pillar = 1.2 }) {
    const tf = this.quad(rot, x, z);
    const hw = w / 2;
    const hd = d / 2;
    const wall = mat(palette.wall);
    const trim = mat(palette.trim, 0.6);
    this.box(tf, -hw, y0, -hd, hw, y0 + h, hd, wall);
    this.box(tf, -hw - 0.1, y0 + h, -hd - 0.1, hw + 0.1, y0 + h + 0.3, hd + 0.1, trim);
    this.box(tf, -hw - 0.05, y0 - 0.25, -hd - 0.05, hw + 0.05, y0, hd + 0.05, trim, false);
    this.box(tf, -hw, 0, -hd, -hw + pillar, y0, hd, wall);
    this.box(tf, hw - pillar, 0, -hd, hw, y0, hd, wall);
  }

  solid(x0, z0, x1, z1, h, style) {
    const tf = (a, b) => [a, b];
    this.arena.physics.fillRect(x0, z0, x1, z1, h);
    this.box(tf, x0, 0, z0, x1, 1.15, z1, mat(style.band, 0.75, 0.18, 'marble'), false);
    this.box(tf, x0, 1.15, z0, x1, 1.28, z1, mat(style.trim, 0.45, 0.25), false);
    this.box(tf, x0, 1.28, z0, x1, h - 0.55, z1, mat(style.wall, 0.85, 0.24, 'plaster'), false);
    this.box(tf, x0, h - 0.55, z0, x1, h - 0.42, z1, mat(style.trim, 0.45, 0.25), false);
    this.box(tf, x0, h - 0.42, z0, x1, h, z1, mat(style.top, 0.85, 0.2), false);
  }

  span(x0, z0, x1, z1, y0, y1, style) {
    const tf = (a, b) => [a, b];
    this.box(tf, x0, y0, z0, x1, y1, z1, mat(style.wall, 0.85, 0.24, 'plaster'), false);
    this.box(tf, x0 - 0.03, y0 - 0.14, z0 - 0.03, x1 + 0.03, y0, z1 + 0.03, mat(style.trim, 0.45, 0.25), false);
  }

  ceiling(half, y, cell, open, style) {
    const tf = (a, b) => [a, b];
    const top = mat(0xefe6d2, 0.9, 0.35, 'paint');
    const beam = mat(style.trim, 0.5, 0.25);
    const n = Math.ceil((half * 2) / cell);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x0 = -half + i * cell;
        const z0 = -half + j * cell;
        if (open(x0 + cell / 2, z0 + cell / 2)) {
          this.box(tf, x0 + 0.3, y + 0.6, z0 + 0.3, x0 + cell - 0.3, y + 0.66, z0 + cell - 0.3, mat(0xbfe4ff, 0.1, 0.4), false);
          continue;
        }
        this.box(tf, x0, y, z0, x0 + cell, y + 0.12, z0 + cell, top, false);
      }
    }
    for (let t = -half; t <= half; t += cell) {
      this.box(tf, t - 0.18, y - 0.32, -half, t + 0.18, y, half, beam, false);
      this.box(tf, -half, y - 0.32, t - 0.18, half, y, t + 0.18, beam, false);
    }
  }

  shelf(x, z, w, d, rot = 0, h = 1.9) {
    const tf = this.quad(rot, x, z);
    const hw = w / 2;
    const hd = d / 2;
    const white = mat(0x8a5a35, 0.7, 0.12, 'wood');
    this.box(tf, -hw, 0, -hd, hw, h, hd, null, true, false);
    this.box(tf, -hw, 0, -hd, hw, 0.12, hd, white, false);
    this.box(tf, -hw, h - 0.1, -hd, hw, h, hd, white, false);
    this.box(tf, -hw, 0, -hd, -hw + 0.07, h, hd, white, false);
    this.box(tf, hw - 0.07, 0, -hd, hw, h, hd, white, false);
    this.box(tf, -hw + 0.07, 0.12, -0.03, hw - 0.07, h - 0.1, 0.03, white, false);
    const books = [0x7b2d26, 0x2f4a6b, 0x6b5a2a, 0x3d5a3a, 0x8a6a3a];
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const y0 = 0.16 + r * ((h - 0.3) / rows);
      const y1 = y0 + (h - 0.3) / rows - 0.12;
      this.box(tf, -hw + 0.08, y0, -hd + 0.03, hw - 0.08, y0 + 0.05, hd - 0.03, white, false);
      let t = -hw + 0.09;
      let i = r * 2;
      while (t < hw - 0.12) {
        const bw = 0.12 + ((i * 37) % 5) * 0.03;
        const top = y1 - ((i * 13) % 3) * 0.05;
        const c = books[i++ % books.length];
        const e = Math.min(t + bw, hw - 0.09);
        this.box(tf, t, y0 + 0.05, -hd + 0.05, e, top, -0.035, mat(c, 0.8, 0.12), false);
        this.box(tf, t, y0 + 0.05, 0.035, e, top, hd - 0.05, mat(books[(i + 2) % books.length], 0.8, 0.12), false);
        t = e + 0.01;
      }
    }
  }

  podium(x, z, rot = 0) {
    const tf = this.quad(rot, x, z);
    const white = mat(0xe7e1d3, 0.7, 0.2, 'marble');
    this.box(tf, -0.7, 0, -0.45, 0.7, 1.05, 0.45, white);
    this.box(tf, -0.6, 1.05, -0.38, 0.6, 1.12, 0.38, mat(0x1d2a44, 0.3, 0.2), false);
    this.box(tf, -0.75, 0, -0.5, 0.75, 0.12, 0.5, mat(0xc9a24a, 0.45, 0.2), false);
  }

  pillar(x, z, h, style, r = 0.55) {
    const tf = (a, b) => [a, b];
    this.box(tf, x - r, 0, z - r, x + r, h, z + r, mat(style.wall, 0.8, 0.24, 'marble'));
    this.box(tf, x - r - 0.12, 0, z - r - 0.12, x + r + 0.12, 0.45, z + r + 0.12, mat(style.band, 0.75, 0.18, 'marble'), false);
    this.box(tf, x - r - 0.12, h - 0.35, z - r - 0.12, x + r + 0.12, h, z + r + 0.12, mat(style.trim, 0.45, 0.25), false);
  }

  fountain(x, z, r = 3.2, palette = PALETTES.concrete) {
    const n = 10;
    const tf = (a, b) => [a, b];
    const stone = mat(palette.wall, 0.85, 0, 'marble');
    const water = mat(0x5fb7d6, 0.15, 0.25);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cx = x + Math.cos(a) * r;
      const cz = z + Math.sin(a) * r;
      const s = r * Math.sin(Math.PI / n) + 0.25;
      this.box(tf, cx - s, 0, cz - s, cx + s, 0.75, cz + s, stone);
    }
    this.box(tf, x - r + 0.4, 0.02, z - r + 0.4, x + r - 0.4, 0.45, z + r - 0.4, water, false);
    this.box(tf, x - 0.5, 0, z - 0.5, x + 0.5, 2.6, z + 0.5, stone);
    this.box(tf, x - 0.9, 2.6, z - 0.9, x + 0.9, 2.85, z + 0.9, mat(palette.trim, 0.6));
  }

  lowWall(x0, z0, x1, z1, h = 1.1, palette = PALETTES.adobe) {
    const tf = (x, z) => [x, z];
    const t = 0.35;
    if (Math.abs(x1 - x0) > Math.abs(z1 - z0)) {
      this.box(tf, Math.min(x0, x1), 0, z0 - t / 2, Math.max(x0, x1), h, z0 + t / 2, mat(palette.wall, 0.85, 0, palette.tex));
      this.box(tf, Math.min(x0, x1) - 0.05, h, z0 - t / 2 - 0.05, Math.max(x0, x1) + 0.05, h + 0.1, z0 + t / 2 + 0.05, mat(palette.trim, 0.6), false);
    } else {
      this.box(tf, x0 - t / 2, 0, Math.min(z0, z1), x0 + t / 2, h, Math.max(z0, z1), mat(palette.wall, 0.85, 0, palette.tex));
      this.box(tf, x0 - t / 2 - 0.05, h, Math.min(z0, z1) - 0.05, x0 + t / 2 + 0.05, h + 0.1, Math.max(z0, z1) + 0.05, mat(palette.trim, 0.6), false);
    }
  }

  finish() {
    const group = new THREE.Group();
    group.name = 'buildings';
    for (const [material, list] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.noCollide = true;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}
