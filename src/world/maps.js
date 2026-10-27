import * as THREE from 'three';
import { PALETTES } from './Building.js';

const V = (x, z) => new THREE.Vector3(x, 0, z);
const CONTAINERS = ['shipping-container-a', 'shipping-container-b', 'shipping-container-c'];
const INDUSTRIAL_ROW = ['building-a', 'building-b', 'building-r', 'building-g', 'building-m', 'building-e', 'building-t', 'building-c'];

function container(arena, x, z, rot, stack = 1, variant = 0) {
  for (let i = 0; i < stack; i++) {
    const key = CONTAINERS[(variant + i) % CONTAINERS.length];
    arena.place(key, x, z, { rot: rot + (i ? (arena.rng() - 0.5) * 0.08 : 0), y: i * 2.45 });
  }
}

function tree(arena, key, x, z, scale, parent) {
  const t = arena.placeFitted(key, x, z, arena.rng() * 6.28, scale, parent);
  t.traverse((o) => {
    if (o.isMesh) o.userData.noCollide = true;
  });
  if (!parent || parent === arena.root) {
    arena.physics.addBox(new THREE.Vector3(x - 0.3, 0, z - 0.3), new THREE.Vector3(x + 0.3, 3, z + 0.3));
  }
  return t;
}

function towers(arena, count, r0, r1, colors) {
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + arena.rng() * 0.2;
    const r = r0 + arena.rng() * (r1 - r0);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.8 }));
    m.scale.set(10 + arena.rng() * 10, 20 + arena.rng() * 45, 10 + arena.rng() * 10);
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    m.rotation.y = arena.rng() * 1.5;
    arena.far.add(m);
  }
}

function shield(arena, z, spans, palette, h = 2.6) {
  for (const [x0, x1, dz = 0] of spans) {
    for (const sign of [-1, 1]) arena.kit.lowWall(sign * x0, sign * (z + dz), sign * x1, sign * (z + dz), h, palette);
  }
}

function cityEdge(arena, pal, h0 = 12, h1 = 9) {
  const k = arena.kit;
  const edge = arena.half + 0.5;
  for (const [axis, sign] of [['x', -1], ['x', 1], ['z', -1], ['z', 1]]) {
    let t = -edge - 6;
    let i = 0;
    while (t < edge + 6) {
      const w = 8 + arena.rng() * 5;
      const d = 10;
      const h = h0 + arena.rng() * h1;
      const c = t + w / 2;
      const p = pal[(i++ + (axis === 'x' ? 0 : 2)) % pal.length];
      if (axis === 'z') k.block({ x: c, z: sign * (edge + d / 2), w, d, h, palette: p });
      else k.block({ x: sign * (edge + d / 2), z: c, w: d, d: w, h, palette: p });
      t += w + 0.2;
    }
  }
}

function teamRows(arena, z, xs) {
  for (const x of xs) {
    arena.teamSpawns.A.push(V(x, -z));
    arena.teamSpawns.B.push(V(-x, z));
  }
}

export const MAPS = {
  luxville: {
    id: 'luxville',
    name: 'Luxville',
    half: 66,
    seed: 1907,
    accent: '#c9a24a',
    sites: {},
    theme: {
      sun: 0xfff0d8, sunIntensity: 3, sunPos: [-30, 80, 22], fog: 0xd9d2c4, fogNear: 80, fogFar: 300,
      ground: 0xe8e0d4, groundScale: 2.6, floorTex: 'tiles', skyRot: 0.9, env: 0.75, skyColor: 0xfff4e2, groundColor: 0x8a7a68, indoor: true,
    },
    build(arena) {
      const k = arena.kit;
      const style = { wall: 0xe4d6b6, band: 0x6e3530, trim: 0xc9a24a, top: 0xd9ccb0 };
      const plum = { wall: 0xd8cbb4, band: 0x4a3446, trim: 0xc9a24a, top: 0xd2c4ab };
      const C = 7.6;
      const X = (px) => ((px - 397) / 44) * C;
      const U = C / 5.4;
      this.sites = { A: [X(375), X(200)], B: [X(240), X(462)] };
      const rooms = [
        [165, 95, 575, 160], [528, 95, 575, 262], [318, 150, 432, 292], [320, 285, 362, 368], [418, 150, 474, 252],
        [165, 95, 212, 212], [148, 195, 286, 247], [222, 230, 286, 368], [25, 222, 234, 332], [25, 222, 104, 648],
        [25, 598, 238, 648], [108, 345, 360, 577], [222, 560, 266, 628], [214, 604, 402, 678], [385, 636, 472, 678],
        [426, 598, 472, 678], [430, 195, 718, 252], [430, 195, 576, 362], [644, 195, 718, 362], [430, 324, 718, 362],
        [430, 340, 718, 426], [430, 410, 470, 476], [534, 410, 718, 476], [394, 460, 752, 612],
        [90, 425, 122, 495], [350, 392, 444, 432],
      ].map(([x0, y0, x1, y1]) => [X(x0), X(y0), X(x1), X(y1)]);

      const half = arena.half;
      const n = Math.ceil(half * 2);
      const free = new Uint8Array(n * n);
      for (const [x0, z0, x1, z1] of rooms) {
        for (let j = Math.max(0, Math.round(z0 + half + 0.6)); j < Math.min(n, Math.round(z1 + half - 0.6)); j++) {
          for (let i = Math.max(0, Math.round(x0 + half + 0.6)); i < Math.min(n, Math.round(x1 + half - 0.6)); i++) free[j * n + i] = 1;
        }
      }
      const used = new Uint8Array(n * n);
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          if (free[j * n + i] || used[j * n + i]) continue;
          let w = 1;
          while (i + w < n && !free[j * n + i + w] && !used[j * n + i + w]) w++;
          let h = 1;
          grow: while (j + h < n) {
            for (let q = i; q < i + w; q++) if (free[(j + h) * n + q] || used[(j + h) * n + q]) break grow;
            h++;
          }
          for (let b = j; b < j + h; b++) for (let q = i; q < i + w; q++) used[b * n + q] = 1;
          const x0 = i - half;
          const z0 = j - half;
          const tall = 6.6;
          k.solid(x0, z0, x0 + w, z0 + h, tall, x0 > X(420) && z0 > X(190) ? plum : style);
        }
      }

      const bx0 = X(148);
      const bx1 = X(328);
      const bz0 = X(362);
      const bz1 = X(560);
      const bcx = (bx0 + bx1) / 2;
      const bcz = (bz0 + bz1) / 2;
      for (const sz of [bz0, bz1]) {
        k.shelf(bx0 + 4.2 * U, sz, 7.4 * U, 0.7, 0, 2.4);
        k.shelf(bx1 - 4.2 * U, sz, 7.4 * U, 0.7, 0, 2.4);
      }
      for (const sx of [bx0, bx1]) {
        k.shelf(sx, bz0 + 5.2 * U, 0.7, 9.4 * U, 0, 2.4);
        k.shelf(sx, bz1 - 5.2 * U, 0.7, 9.4 * U, 0, 2.4);
      }
      for (const [gx, gz, r] of [[-7, -5.5, 0.5], [7, -5.5, -0.5], [-7, 5.5, -0.5], [7, 5.5, 0.5]]) k.shelf(bcx + gx * U, bcz + gz * U, 3.4, 0.7, r);
      for (const gx of [-13, -9.5, 9.5, 13]) {
        for (const gz of [-9, -3, 3, 9]) {
          if (Math.abs(gx) < 11 && Math.abs(gz) < 6) continue;
          k.shelf(bcx + gx, bcz + gz, 0.7, 3.6, 0, 2.1);
        }
      }
      for (const gx of [-5, 0, 5]) {
        for (const gz of [-13, 13]) k.shelf(bcx + gx, bcz + gz, 3.6, 0.7, 0, 2.1);
      }
      for (const [gx, gz] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) k.pillar(bcx + gx, bcz + gz, 9, style, 0.7);
      k.podium(bcx + 0.2, bcz - 2.6);
      k.podium(bcx - 2.8, bcz + 2.4, Math.PI / 2);
      k.podium(bcx + 3.2, bcz + 1.6, 0.4);

      const ax = X(375);
      const az = X(225);
      k.shelf(ax - 5.2, az + 4.6, 4, 0.7);
      k.shelf(ax + 5.6, az - 2, 0.7, 4);
      k.podium(ax + 1.5, az + 3.2);
      k.podium(ax - 2.5, az - 3);
      for (const [x, z] of [[X(250), X(128)], [X(500), X(128)], [X(75), X(420)], [X(75), X(520)], [X(470), X(215)], [X(690), X(225)], [X(600), X(540)], [X(480), X(400)]]) k.pillar(x, z, 9, style);

      for (const [x0, z0, x1, z1] of [[553, 392, 623, 404], [612, 490, 626, 528], [645, 520, 690, 534], [440, 530, 476, 542], [492, 470, 504, 506]]) {
        k.solid(X(x0), X(z0), X(x1), X(z1), 1.25, plum);
      }
      for (const [x, z, r] of [[X(700), X(560), 0.4], [X(712), X(578), 1.1], [X(455), X(495), 0.2], [X(600), X(260), 0], [X(660), X(410), 0.6], [X(110), X(260), 0.3], [X(60), X(610), 0.9], [X(300), X(220), 0.2]]) {
        arena.place('crate-medium', x, z, { rot: r, scale: 2.4 });
      }
      for (const [x, z, r] of [[X(60), X(360), 0], [X(60), X(560), 0.3], [X(560), X(300), 0.2], [X(650), X(300), 0], [X(420), X(560), 0.5], [X(200), X(140), 0]]) {
        k.podium(x, z, r);
      }
      for (const [x, z] of [[X(540), X(130)], [X(190), X(625)], [X(450), X(650)], [X(700), X(440)], [X(60), X(300)]]) {
        arena.place('barrel', x, z, { scale: 3.4, rot: arena.rng() * 6 });
      }
      k.lowWall(X(240), X(640), X(330), X(640), 1.2, { wall: 0x6e3530, trim: 0xc9a24a });
      k.lowWall(X(330), X(118), X(410), X(118), 1.2, { wall: 0x6e3530, trim: 0xc9a24a });

      const H = 6.6;
      const sky = [[X(240), X(462)], [X(375), X(225)], [X(575), X(530)], [X(60), X(430)], [X(370), X(128)], [X(600), X(290)], [X(300), X(640)]];
      k.ceiling(half, H, C, (x, z) => sky.some(([sx, sz]) => Math.abs(x - sx) < C * 0.9 && Math.abs(z - sz) < C * 0.9), style);
      arena.physics.addBox(new THREE.Vector3(-half, H, -half), new THREE.Vector3(half, H + 0.6, half));
      const door = (x, z0, z1, gaps, horizontal = false) => {
        let c = z0;
        for (const [g0, g1] of gaps) {
          if (horizontal) k.solid(c, x - 0.5, g0, x + 0.5, H, style);
          else k.solid(x - 0.5, c, x + 0.5, g0, H, plum);
          if (horizontal) k.span(g0, x - 0.5, g1, x + 0.5, 3.1, H, style);
          else k.span(x - 0.5, g0, x + 0.5, g1, 3.1, H, plum);
          c = g1;
        }
        if (horizontal) k.solid(c, x - 0.5, z1, x + 0.5, H, style);
        else k.solid(x - 0.5, c, x + 0.5, z1, H, plum);
      };
      door(X(575), X(460), X(612), [[X(482), X(508)], [X(560), X(586)]]);
      door(X(128), X(165), X(575), [[X(240), X(270)], [X(470), X(500)]], true);
      door(X(286), X(25), X(234), [[X(70), X(100)], [X(160), X(190)]], true);

      const pts = [
        [370, 125], [520, 125], [190, 130], [380, 260], [455, 220], [260, 220], [60, 260], [180, 290], [60, 400], [60, 520],
        [120, 625], [300, 640], [440, 655], [450, 600], [600, 560], [720, 500], [500, 440], [690, 400], [600, 340], [470, 300],
        [690, 230], [130, 380], [330, 470], [130, 540], [245, 400],
      ];
      for (const [x, y] of pts) arena.spawns.push(V(X(x), X(y)));
      for (const [x, y] of [[300, 122], [340, 140], [380, 122], [420, 140], [455, 122], [495, 140]]) arena.teamSpawns.A.push(V(X(x), X(y)));
      for (const [x, y] of [[240, 640], [270, 660], [300, 625], [330, 660], [360, 640], [410, 660]]) arena.teamSpawns.B.push(V(X(x), X(y)));
      arena.pickupSpots.health.push(V(X(60), X(470)), V(X(640), X(580)), V(X(500), X(225)));
      arena.pickupSpots.ammo.push(V(X(300), X(260)), V(X(560), X(380)), V(X(160), X(625)));
    },
  },

  outpost: {
    id: 'outpost',
    name: 'Outpost',
    half: 34,
    seed: 712,
    accent: '#7fe9ff',
    sites: { A: [-17, -2], B: [17, -3] },
    theme: { sun: 0xfff1dc, sunIntensity: 3.1, fog: 0xb9c7d6, ground: 0xd8d2c8, skyRot: 1.2 },
    build(arena) {
      arena.perimeter(INDUSTRIAL_ROW);
      const edge = arena.half + 0.5;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        arena.placeFitted('detail-tank-large', sx * (edge + 7), sz * (edge + 7), arena.rng() * Math.PI, 7.7);
      }
      for (const [key, x, z, s] of [
        ['water-tower', -70, -20, 8.5], ['water-tower', 64, 58, 9], ['windmill', 90, -40, 10], ['windmill', 100, -10, 11],
        ['windmill', -95, 50, 10], ['chimney-large', -62, 70, 9], ['chimney-medium', -55, 72, 11], ['chimney-medium', 75, -70, 12],
        ['chimney-large', 70, -66, 8], ['building-l', -75, -75, 9], ['building-l', 80, 80, 9],
      ]) {
        arena.placeFitted(key, x, z, arena.rng() * Math.PI * 2, s, arena.far);
      }
      arena.ring(['tree', 'tree-tall'], 60, 72, 130, 7, 12);

      arena.decal(0, 0, 1, 1, 0xf2c14e, 0.012, 1, new THREE.RingGeometry(5.6, 5.9, 64));
      for (const s of [-1, 1]) {
        arena.decal(s * 20, 0, 0.25, 30, 0xf2c14e);
        arena.decal(0, s * 20, 30, 0.25, 0xf2c14e, 0.017);
      }

      arena.placeFitted('detail-tank-large', 0, 0, 0.3, 4.6);

      arena.quad((at, a, q) => {
        let [x, z] = at(7.5, 11);
        container(arena, x, z, a + Math.PI / 2, 1, q);
        [x, z] = at(13, 7);
        container(arena, x, z, a, q % 2 ? 2 : 1, q + 1);
        [x, z] = at(21, 20);
        container(arena, x, z, a, 2, q + 2);
        [x, z] = at(16.5, 24.5);
        container(arena, x, z, a + Math.PI / 2, 1, q);

        [x, z] = at(0, 25);
        arena.kit.build({
          x, z, w: 12, d: 7.5, rot: a, floors: q % 2 ? 1 : 2,
          palette: q % 2 ? PALETTES.teal : PALETTES.concrete,
          doors: [{ side: 'n', at: -2.5 }, { side: 's', at: 3 }, { side: 'e' }, { side: 'w' }],
        });

        [x, z] = at(28, 5);
        arena.place('solar-panel-landscape-group', x, z, { rot: a + Math.PI / 2 });
        [x, z] = at(10.5, 17.5);
        arena.place('crate-medium', x, z, { rot: a + 0.3, scale: 2.4 });
        [x, z] = at(5.5, 18.5);
        arena.place('crate-medium', x, z, { rot: a - 0.2, scale: 2.4 });
        for (const [bx, bz] of [[15.5, 13.5], [16.4, 14.1], [15.7, 14.9], [-6.5, 6.5], [-7.2, 7.4]]) {
          [x, z] = at(bx, bz);
          arena.place('barrel', x, z, { scale: 3.4, rot: arena.rng() * 6 });
        }
        for (const [bx, bz, big] of [[-11.5, 15, 1], [-12.8, 15.6, 0], [-12.1, 14.1, 0], [29, 25, 1], [30, 23.6, 0]]) {
          [x, z] = at(bx, bz);
          arena.place(big ? 'box-large' : 'box', x, z, { scale: 3.9, rot: a + (arena.rng() - 0.5) * 0.4 });
        }
        [x, z] = at(-20.5, 11);
        arena.place('detail-tank', x, z, { rot: a, scale: 6.65 });
        [x, z] = at(-25, 28.5);
        arena.place('rock-b', x, z, { scale: 5.5, rot: arena.rng() * 6 });
        [x, z] = at(-28, -2);
        container(arena, x, z, a, 1, q + 1);
        [x, z] = at(22, 6.5);
        arena.place('barrel', x, z, { scale: 3.4, rot: arena.rng() * 6 });
        [x, z] = at(18.2, 19);
        arena.pad(x, z, 16.5);

        for (const [sx, sz] of [[5, 30.5], [29.5, 29.5], [25, 13]]) {
          [x, z] = at(sx, sz);
          arena.spawns.push(V(x, z));
        }
        [x, z] = at(24.5, 16);
        arena.pickupSpots.health.push(V(x, z));
        [x, z] = at(-16, 20);
        arena.pickupSpots.ammo.push(V(x, z));
      });
      shield(arena, 27.5, [[-16, -3], [3, 16], [-4.5, 4.5, -1.6], [-30, -21], [21, 30]], PALETTES.concrete);
      teamRows(arena, 31, [-12, -6, 6, 12, -27, 27]);
    },
  },

  downtown: {
    id: 'downtown',
    name: 'Downtown',
    half: 36,
    seed: 31,
    accent: '#ffd166',
    sites: { A: [-25, -3], B: [25, -3] },
    theme: { sun: 0xfff4e6, sunIntensity: 2.9, sunPos: [35, 70, -20], fog: 0xc4ccd6, fogNear: 55, fogFar: 230, ground: 0x8e939b, groundScale: 6, skyRot: 2.6 },
    build(arena) {
      const k = arena.kit;
      const pal = [PALETTES.brick, PALETTES.concrete, PALETTES.navy, PALETTES.plaster];
      cityEdge(arena, pal, 13, 10);
      towers(arena, 26, 70, 120, [0x9aa3ae, 0x7d8794, 0xb5a28f, 0x6f7a88]);

      for (const s of [-1, 1]) {
        arena.decal(s * 6.2, 0, 2.4, arena.half * 2, 0xb8b6b0, 0.02);
        arena.decal(0, s * 6.2, arena.half * 2, 2.4, 0xb8b6b0, 0.03);
      }
      for (let i = -32; i <= 32; i += 4) {
        if (Math.abs(i) < 8) continue;
        arena.decal(0, i, 0.18, 2, 0xf2f2ea, 0.04);
        arena.decal(i, 0, 2, 0.18, 0xf2f2ea, 0.04);
      }
      for (let i = -3; i <= 3; i++) {
        arena.decal(i * 1.2, -7.6, 0.6, 2.4, 0xf2f2ea, 0.04);
        arena.decal(i * 1.2, 7.6, 0.6, 2.4, 0xf2f2ea, 0.04);
        arena.decal(-7.6, i * 1.2, 2.4, 0.6, 0xf2f2ea, 0.04);
        arena.decal(7.6, i * 1.2, 2.4, 0.6, 0xf2f2ea, 0.04);
      }

      k.lowWall(-2.4, -2.4, 2.4, -2.4, 0.8, PALETTES.concrete);
      k.lowWall(-2.4, 2.4, 2.4, 2.4, 0.8, PALETTES.concrete);
      k.lowWall(-2.4, -2.4, -2.4, 2.4, 0.8, PALETTES.concrete);
      k.lowWall(2.4, -2.4, 2.4, 2.4, 0.8, PALETTES.concrete);
      arena.decal(0, 0, 4.5, 4.5, 0x4fa3c7, 0.55);
      k.lowWall(-0.4, 0, 0.4, 0, 2.2, PALETTES.plaster);

      const cars = ['sedan', 'taxi', 'police', 'suv', 'van', 'hatchback-sports', 'delivery', 'truck'];
      arena.quad((at, a, q) => {
        let [x, z] = at(16, 15);
        k.build({
          x, z, w: 12, d: 9, rot: a, floors: 2, palette: pal[q],
          doors: [{ side: 'n', at: -3 }, { side: 'w', at: 1.5 }, { side: 'e', at: -1 }],
        });
        [x, z] = at(28, 14);
        k.block({ x, z, w: 7, d: 10, h: 11 + q * 1.5, rot: a, palette: pal[(q + 1) % 4] });
        [x, z] = at(14.5, 28.5);
        k.build({ x, z, w: 11, d: 7, rot: a, floors: 1, palette: pal[(q + 2) % 4], doors: [{ side: 'n' }, { side: 'e', at: 1 }] });
        [x, z] = at(27, 28);
        arena.place('box-large', x, z, { scale: 3.9, rot: a });
        [x, z] = at(25.5, 27);
        arena.place('barrel', x, z, { scale: 3.4 });
        [x, z] = at(8.8, 24);
        arena.place('crate-medium', x, z, { rot: a + Math.PI / 2, scale: 2.4 });

        [x, z] = at(3, 14 + q);
        arena.placeFitted(cars[q * 2], x, z, a + (arena.rng() - 0.5) * 0.15, 1.75);
        [x, z] = at(-3, 24 - q);
        arena.placeFitted(cars[q * 2 + 1], x, z, a + Math.PI + (arena.rng() - 0.5) * 0.15, 1.75);
        [x, z] = at(9.5, 9.5);
        tree(arena, 'tree_oak', x, z, 5.5);

        for (const [sx, sz] of [[4, 31], [31, 4], [22, 22]]) {
          [x, z] = at(sx, sz);
          arena.spawns.push(V(x, z));
        }
        [x, z] = at(22, 9);
        arena.pickupSpots.health.push(V(x, z));
        [x, z] = at(9, 31);
        arena.pickupSpots.ammo.push(V(x, z));
      });
      shield(arena, 29, [[-5.5, -0.8], [0.8, 5.5], [-2.2, 2.2, -1.5]], PALETTES.concrete);
      teamRows(arena, 33, [-3, 3, -1, 1, -4.5, 4.5]);
    },
  },

  dunes: {
    id: 'dunes',
    name: 'Dunes',
    half: 34,
    seed: 4242,
    accent: '#ffb347',
    sites: { A: [-17, -4], B: [17, -5] },
    theme: {
      sun: 0xffe2b8, sunIntensity: 3.4, sunPos: [-50, 55, -30], fog: 0xe6d3b3, fogNear: 50, fogFar: 210,
      ground: 0xeacb9a, groundScale: 7, skyColor: 0xffefd6, groundColor: 0xa47a4c, skyRot: 0.4, env: 0.6,
    },
    build(arena) {
      const k = arena.kit;
      const e = arena.half + 0.3;
      k.lowWall(-e, -e, e, -e, 4.5, PALETTES.adobe);
      k.lowWall(-e, e, e, e, 4.5, PALETTES.adobe);
      k.lowWall(-e, -e, -e, e, 4.5, PALETTES.adobe);
      k.lowWall(e, -e, e, e, 4.5, PALETTES.adobe);

      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const r = 44 + arena.rng() * 10;
        arena.placeFitted(i % 2 ? 'rock_tallA' : 'rock_largeC', Math.cos(a) * r, Math.sin(a) * r, arena.rng() * 6, 9 + arena.rng() * 6, arena.far);
      }
      for (let i = 0; i < 24; i++) {
        const a = arena.rng() * Math.PI * 2;
        const r = 40 + arena.rng() * 40;
        tree(arena, i % 3 ? 'tree_palmTall' : 'tree_palmBend', Math.cos(a) * r, Math.sin(a) * r, 6 + arena.rng() * 3, arena.far);
      }

      arena.mirror((at, a, q) => {
        let [x, z] = at(-18, -12);
        k.build({ x, z, w: 14, d: 7, rot: a, floors: 1, palette: PALETTES.adobe, doors: [{ side: 'n', at: -4 }, { side: 's', at: 2 }, { side: 'e' }] });
        [x, z] = at(-14, 16);
        k.build({ x, z, w: 10, d: 9, rot: a, floors: 2, palette: PALETTES.adobeLight, doors: [{ side: 'n' }, { side: 'e', at: 1.5 }] });
        [x, z] = at(4, -24);
        k.build({ x, z, w: 9, d: 6, rot: a, floors: 1, palette: PALETTES.adobeLight, doors: [{ side: 's' }, { side: 'w' }] });
        [x, z] = at(22, 18);
        k.build({ x, z, w: 8, d: 10, rot: a, floors: 2, palette: PALETTES.adobe, doors: [{ side: 'w', at: -2 }, { side: 'n' }] });

        const wall = (x0, z0, x1, z1, h = 1.2) => {
          const [ax, az] = at(x0, z0);
          const [bx, bz] = at(x1, z1);
          k.lowWall(ax, az, bx, bz, h, PALETTES.adobe);
        };
        wall(-8, -6, -8, 4);
        wall(-8, 10, 2, 10);
        wall(10, -14, 20, -14, 2.6);
        wall(26, -4, 26, 6, 2.6);
        wall(-30, 2, -22, 2);

        [x, z] = at(-5, 1);
        arena.place('tent-canvas', x, z, { rot: a + Math.PI / 2, scale: 4.2 });
        for (const [bx, bz] of [[24, -24], [25.5, -24], [24.7, -22.6], [-2, 22]]) {
          [x, z] = at(bx, bz);
          arena.place('crate-medium', x, z, { rot: a + arena.rng() * 0.3, scale: 2.4 });
        }
        for (const [bx, bz] of [[12, 4], [12.8, 4.7], [-24, -26], [8, -6]]) {
          [x, z] = at(bx, bz);
          arena.place('barrel', x, z, { scale: 3.4, rot: arena.rng() * 6 });
        }
        [x, z] = at(16, 2);
        arena.place('box-large', x, z, { scale: 3.9, rot: a + 0.2 });
        [x, z] = at(-28, 24);
        arena.place('rock_tallA', x, z, { scale: 4.5, rot: arena.rng() * 6 });
        [x, z] = at(6, 12);
        tree(arena, 'tree_palmTall', x, z, 6.5);
        [x, z] = at(-26, -14);
        arena.place('cactus_tall', x, z, { scale: 3.5 });

        for (const [sx, sz] of [[0, 30], [-28, 28], [28, 30], [30, 6], [-30, 8], [12, 26]]) {
          [x, z] = at(sx, sz);
          arena.spawns.push(V(x, z));
        }
        [x, z] = at(0, 6);
        arena.pickupSpots.health.push(V(x, z));
        [x, z] = at(-22, -4);
        arena.pickupSpots.health.push(V(x, z));
        [x, z] = at(28, -12);
        arena.pickupSpots.ammo.push(V(x, z));
      });
      shield(arena, 27.5, [[-14, -2], [2, 14], [-3, 3, -1.6], [16, 24], [12.5, 17.5, -1.6]], PALETTES.adobe);
      teamRows(arena, 31, [-10, -5, 0, 5, 10, 20]);
    },
  },
};

