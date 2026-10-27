import * as THREE from 'three';

const PARTS = [
  [/^(Head|neck_01)$/, 'skin'],
  [/^(hand_|index_|middle_|ring_|pinky_|thumb_)/, 'hand'],
  [/^(foot_|ball_)/, 'boot'],
  [/^(thigh_|calf_)/, 'pants'],
  [/^lowerarm_/, 'sleeve'],
  [/.*/, 'shirt'],
];

const STYLE = {
  A: { shirt: '#26313f', sleeve: '#26313f', pants: '#1e252e', boot: '#0f1114', hand: '#3b4149', camo: null },
  B: { shirt: '#8f7b55', sleeve: '#8f7b55', pants: '#6b5a3d', boot: '#3a2b1d', hand: null, camo: ['#7a6745', '#a08b62', '#5f5236'] },
};

function rng(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function partOf(name) {
  for (const [re, part] of PARTS) if (re.test(name)) return part;
  return 'shirt';
}

export function paintUniform(image, mesh, team, seed = 1) {
  const S = image.width;
  const style = STYLE[team];
  const r = rng(seed * 7 + 3);
  const geo = mesh.geometry;
  const uv = geo.attributes.uv;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const bones = mesh.skeleton.bones.map((b) => partOf(b.name));
  const index = geo.index ? geo.index.array : null;
  const count = index ? index.length : uv.count;
  const part = (v) => {
    let best = 0;
    let w = -1;
    for (let k = 0; k < 4; k++) {
      const wk = sw.getComponent(v, k);
      if (wk > w) {
        w = wk;
        best = si.getComponent(v, k);
      }
    }
    return bones[best];
  };

  const out = document.createElement('canvas');
  out.width = out.height = S;
  const g = out.getContext('2d');
  g.drawImage(image, 0, 0, S, S);

  const layer = document.createElement('canvas');
  layer.width = layer.height = S;
  const l = layer.getContext('2d');
  const mask = document.createElement('canvas');
  mask.width = mask.height = S;
  const m = mask.getContext('2d');
  l.lineJoin = m.lineJoin = 'round';
  l.lineWidth = m.lineWidth = 3;

  for (let i = 0; i < count; i += 3) {
    const a = index ? index[i] : i;
    const b = index ? index[i + 1] : i + 1;
    const c = index ? index[i + 2] : i + 2;
    const pa = part(a);
    if (pa === 'skin') continue;
    const color = style[pa];
    if (!color) continue;
    for (const ctx of [l, m]) {
      ctx.fillStyle = ctx.strokeStyle = ctx === l ? color : '#fff';
      ctx.beginPath();
      ctx.moveTo(uv.getX(a) * S, uv.getY(a) * S);
      ctx.lineTo(uv.getX(b) * S, uv.getY(b) * S);
      ctx.lineTo(uv.getX(c) * S, uv.getY(c) * S);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  if (style.camo) {
    l.save();
    l.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 260; i++) {
      l.fillStyle = style.camo[i % style.camo.length];
      l.beginPath();
      l.ellipse(r() * S, r() * S, 10 + r() * 34, 6 + r() * 20, r() * 3, 0, Math.PI * 2);
      l.fill();
    }
    l.restore();
  }
  l.save();
  l.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 4000; i++) {
    l.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.07)';
    l.fillRect(r() * S, r() * S, 2 + r() * 4, 1 + r() * 2);
  }
  l.globalCompositeOperation = 'multiply';
  l.globalAlpha = 0.55;
  l.filter = 'grayscale(1) brightness(1.55) contrast(1.15)';
  l.drawImage(image, 0, 0, S, S);
  l.restore();
  l.globalCompositeOperation = 'destination-in';
  l.drawImage(mask, 0, 0);

  g.drawImage(layer, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  return t;
}
