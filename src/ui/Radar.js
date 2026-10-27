const SIZE = 168;
const RANGE = 36;

export class Radar {
  constructor(canvas, physics, half, sites = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    this.ctx.scale(dpr, dpr);

    this.half = half;
    this.ppm = 1 / physics.cell;
    const px = Math.ceil(half * 2 * this.ppm);
    this.map = document.createElement('canvas');
    this.map.width = px;
    this.map.height = px;
    const m = this.map.getContext('2d');
    const img = m.createImageData(px, px);
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        const wx = -half + (x + 0.5) / this.ppm;
        const wz = -half + (y + 0.5) / this.ppm;
        const h = physics.heightAt(wx, wz);
        const o = (y * px + x) * 4;
        img.data[o] = 210;
        img.data[o + 1] = 225;
        img.data[o + 2] = 240;
        img.data[o + 3] = h > 0.3 ? Math.min(140, 50 + h * 22) : 12;
      }
    }
    m.putImageData(img, 0, 0);
    m.strokeStyle = 'rgba(127,233,255,0.35)';
    m.lineWidth = 2;
    m.strokeRect(1, 1, px - 2, px - 2);
    this.sites = Object.values(sites);
  }

  draw(game) {
    const c = this.ctx;
    const p = game.player;
    const s = SIZE / 2;
    const scale = s / RANGE;

    c.clearRect(0, 0, SIZE, SIZE);
    c.save();
    c.beginPath();
    c.arc(s, s, s - 1, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = 'rgba(10,14,20,0.62)';
    c.fillRect(0, 0, SIZE, SIZE);

    c.translate(s, s);
    c.rotate(p.yaw);
    const k = scale / this.ppm;
    c.drawImage(
      this.map,
      (-p.position.x - this.half) * scale,
      (-p.position.z - this.half) * scale,
      this.map.width * k,
      this.map.height * k,
    );

    for (const b of game.bots) {
      if (!b.alive) continue;
      const ally = game.allies(game.player, b);
      const fresh = ally ? 0 : game.time - (b.lastShot ?? -99);
      if (fresh > 1.6) continue;
      const x = (b.position.x - p.position.x) * scale;
      const z = (b.position.z - p.position.z) * scale;
      c.globalAlpha = Math.max(0, 1 - fresh / 1.6);
      c.fillStyle = ally ? '#5aa9ff' : '#ff4d6d';
      c.beginPath();
      c.arc(x, z, 3.5, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;

    for (const site of this.sites) {
      const x = (site.x - p.position.x) * scale;
      const z = (site.z - p.position.z) * scale;
      c.fillStyle = 'rgba(255,122,92,0.16)';
      c.beginPath();
      c.arc(x, z, site.r * scale, 0, Math.PI * 2);
      c.fill();
      c.save();
      c.translate(x, z);
      c.rotate(-p.yaw);
      c.fillStyle = 'rgba(255,150,120,0.95)';
      c.font = '800 13px "Exo 2", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(site.id, 0, 0);
      c.restore();
    }

    const bomb = game.mode.bomb ? game.bomb : null;
    if (bomb && (bomb.state === 'dropped' || bomb.planted) && game.roleOf(p) === 'attack') {
      const x = (bomb.position.x - p.position.x) * scale;
      const z = (bomb.position.z - p.position.z) * scale;
      c.fillStyle = bomb.planted && bomb.light.material.opacity > 0.5 ? '#ff3b30' : '#ffb347';
      c.fillRect(x - 3.5, z - 2.5, 7, 5);
    }
    if (bomb?.carrier && bomb.carrier !== p && game.allies(p, bomb.carrier)) {
      const x = (bomb.carrier.position.x - p.position.x) * scale;
      const z = (bomb.carrier.position.z - p.position.z) * scale;
      c.strokeStyle = '#ffb347';
      c.lineWidth = 1.5;
      c.strokeRect(x - 5, z - 5, 10, 10);
    }

    for (const it of game.pickups.items) {
      if (!it.active) continue;
      const x = (it.position.x - p.position.x) * scale;
      const z = (it.position.z - p.position.z) * scale;
      c.fillStyle = it.type === 'health' ? '#3dff8f' : '#ffb347';
      c.fillRect(x - 2, z - 2, 4, 4);
    }
    c.restore();

    c.fillStyle = '#7fe9ff';
    c.beginPath();
    c.moveTo(s, s - 7);
    c.lineTo(s + 5, s + 5);
    c.lineTo(s, s + 2.5);
    c.lineTo(s - 5, s + 5);
    c.closePath();
    c.fill();

    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(s, s, s - 1, 0, Math.PI * 2);
    c.stroke();
  }
}
