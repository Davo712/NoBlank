import { WEAPONS } from '../combat/weapons.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const MEDAL_STYLE = {
  first_blood: 'red',
  headshot: 'red',
  double_kill: '',
  triple_kill: 'gold',
  rampage: 'gold',
  dominating: 'gold',
  unstoppable: 'red',
  payback: '',
  final_stand: 'gold',
  annihilation: 'gold',
};

export const CROSS_COLORS = {
  green: '#4dff6a',
  cyan: '#5ef2ff',
  yellow: '#ffe14d',
  white: '#ffffff',
  pink: '#ff5ccd',
};

const KEYS = { primary: 1, secondary: 2, melee: 3, grenade: 4, bomb: 5 };

export class Hud {
  constructor() {
    this.root = $('hud');
    this.crosshair = $('crosshair');
    this.hit = $('hitmarker');
    this.ring = $('damageRing');
    this.feed = $('killfeed');
    this.board = $('board');
    this.tag = $('tag');
    this.tagName = $('tagName');
    this.tagHp = $('tagHp');
    this.tagged = null;
    this.hurtEl = $('hurt');
    this.smokeEl = $('smokeFx');
    this.flashEl = $('flashFx');
    this.fpsEl = $('fps');
    this.scopeEl = $('scope');
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.hurtValue = -1;
    this.smokeValue = -1;
    this.icons = {};
    this.dynamic = true;
    this.el = {
      hpNum: $('hpNum'),
      mag: $('mag'),
      reserve: $('reserve'),
      ammo: $('ammo'),
      slots: $('slots'),
      timer: $('timer'),
      clock: $('clock'),
      limitLine: $('limitLine'),
      chipA: $('chipA'),
      chipB: $('chipB'),
      labelA: $('labelA'),
      labelB: $('labelB'),
      scoreA: $('scoreA'),
      scoreB: $('scoreB'),
      pipsA: $('pipsA'),
      pipsB: $('pipsB'),
      notice: $('notice'),
      toast: $('toast'),
      medal: $('medal'),
      banner: $('banner'),
      death: $('death'),
      deathTimer: $('deathTimer'),
      killerName: $('killerName'),
      progress: $('progress'),
      progressFill: $('progressFill'),
      progressLabel: $('progressLabel'),
      spec: $('spec'),
      specName: $('specName'),
      hint: $('hint'),
      resume: $('resumeHint'),
    };
    this.hitT = 0;
    this.noticeT = 0;
    this.toastT = 0;
    this.bannerT = 0;
    this.medals = [];
    this.medalT = 0;
    this.last = {};
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
    if (!v) {
      this.scopeEl.classList.add('hidden');
      this.smoke(0);
    }
  }

  set(key, value, fn) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    fn(value);
  }

  setCrosshair(s) {
    this.crosshair.style.setProperty('--ch', CROSS_COLORS[s.crosshair] || CROSS_COLORS.green);
    this.dynamic = s.crossStyle !== 'static';
  }

  reset() {
    this.feed.innerHTML = '';
    this.ring.innerHTML = '';
    this.last = {};
    this.medals = [];
    this.medalT = 0;
    this.el.medal.className = 'medal';
    this.el.notice.classList.remove('on');
    this.el.toast.classList.remove('on');
    this.el.death.classList.remove('on');
    this.el.banner.classList.remove('on');
  }

  slotsHtml(p) {
    return p.slots.map((id) => {
      const w = WEAPONS[id];
      const count = p.inventory[id]?.count > 1 ? `<em>×${p.inventory[id].count}</em>` : '';
      const img = this.icons[id] ? `<img src="${this.icons[id]}" alt="">` : `<span>${esc(w.name)}</span>`;
      return `<div class="slot ${id === p.weapon ? 'on' : ''} s-${w.slot}"><kbd>${KEYS[w.slot]}</kbd>${img}${count}</div>`;
    }).join('');
  }

  update(dt, game) {
    const p = game.player;
    const e = this.el;
    const mode = game.mode;

    const hp = Math.max(0, Math.ceil(p.health));
    this.set('hp', hp, (v) => {
      e.hpNum.textContent = v;
      e.hpNum.parentElement.classList.toggle('low', v <= 30);
    });

    const a = p.ammo;
    const w = p.def;
    this.set('ammoMode', a ? 'gun' : 'none', (v) => e.ammo.classList.toggle('hidden', v === 'none'));
    if (a) {
      this.set('mag', a.mag, (v) => {
        e.mag.textContent = v;
        e.ammo.classList.toggle('empty', v === 0);
        e.ammo.classList.toggle('lowmag', v > 0 && v <= Math.ceil(w.mag * 0.25));
      });
      this.set('reserve', a.reserve, (v) => { e.reserve.textContent = v; });
    }
    const inv = p.slots.map((id) => `${id}:${p.inventory[id]?.count ?? ''}`).join();
    this.set('slots', `${p.weapon}|${inv}`, () => { e.slots.innerHTML = this.slotsHtml(p); });


    const planted = mode.bomb && game.bomb.planted;
    this.set('planted', planted, (v) => e.clock.classList.toggle('bomb', v));
    const left = Math.max(0, game.clock);
    const m = Math.floor(left / 60);
    const s = Math.floor(left % 60);
    const freeze = mode.rounds && game.freezeUntil && game.time < game.freezeUntil;
    const clockText = planted ? '' : freeze ? `0:${String(Math.ceil(game.freezeUntil - game.time)).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
    this.set('timer', clockText, (v) => { e.timer.textContent = v; });
    this.set('freeze', !!freeze, (v) => e.clock.classList.toggle('freeze', v));
    if (planted) e.clock.style.setProperty('--blink', game.bomb.light.material.opacity > 0.5 ? 1 : 0.35);
    this.set('limit', game.limitText(), (v) => { e.limitLine.textContent = v; });

    if (mode.teams) {
      const role = (team) => t(`team_${team}`);
      this.set('teamLabels', `${role('A')}|${role('B')}`, () => {
        e.labelA.textContent = role('A');
        e.labelB.textContent = role('B');
        e.chipA.className = 'score-chip team-a';
        e.chipB.className = 'score-chip team-b';
      });
      this.set('scoreA', game.teamScore.A, (v) => { e.scoreA.textContent = v; });
      this.set('scoreB', game.teamScore.B, (v) => { e.scoreB.textContent = v; });
      for (const team of ['A', 'B']) {
        const list = game.actors.filter((x) => x.team === team);
        const key = list.map((x) => (x.alive ? 1 : 0)).join('');
        this.set(`pips${team}`, key, () => {
          e[`pips${team}`].innerHTML = list.map((x) => `<i class="${x.alive ? 'on' : ''} ${x.isPlayer ? 'me' : ''}"></i>`).join('');
        });
      }
    } else {
      this.set('teamLabels', 'ffa', () => {
        e.labelA.textContent = t('you');
        e.chipA.className = 'score-chip you';
        e.chipB.className = 'score-chip lead';
        e.pipsA.innerHTML = '';
        e.pipsB.innerHTML = '';
      });
      this.set('scoreA', game.score(p), (v) => { e.scoreA.textContent = v; });
      const leader = game.actors.filter((x) => x !== p).sort((x, y) => game.score(y) - game.score(x))[0];
      if (leader) {
        this.set('leaderName', leader.name, (v) => { e.labelB.textContent = v; });
        this.set('scoreB', game.score(leader), (v) => { e.scoreB.textContent = v; });
      }
    }

    const spread = p.alive ? p.spread() : 0;
    const moving = Math.min(1, Math.hypot(p.velocity.x, p.velocity.z) / 8);
    const gap = this.dynamic ? 4 + spread * 480 + moving * 5 : 4;
    this.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    const melee = w?.melee || w?.grenade || w?.bomb;
    this.crosshair.classList.toggle('dot-only', !!melee);
    const hideCross = !p.alive || p.scoped || (w?.scope && !p.scoped) || p.ads;
    this.crosshair.style.opacity = hideCross ? '0' : '';
    this.crosshair.classList.toggle('ads-dot', p.ads && !w?.scope);
    this.scopeEl.classList.toggle('hidden', !(p.alive && p.scoped && !game.viewmodel.busy));

    if (this.hitT > 0) {
      this.hitT -= dt;
      this.hit.style.opacity = Math.max(0, this.hitT / 0.25).toFixed(2);
    }

    const bomb = game.bomb;
    const busy = mode.bomb && bomb.user === p && p.planting;
    this.set('progressOn', busy, (v) => e.progress.classList.toggle('on', v));
    if (busy) {
      this.set('progressLabel', bomb.planted ? t('defusing') : t('planting'), (v) => { e.progressLabel.textContent = v; });
      e.progressFill.style.transform = `scaleX(${Math.min(1, bomb.progress / bomb.total).toFixed(3)})`;
    }

    let hint = '';
    if (mode.bomb && p.alive && !busy) {
      if (bomb.carrier === p && bomb.siteAt(p.position)) hint = t('hintPlant');
      else if (game.roleOf(p) === 'defend' && bomb.planted && p.position.distanceTo(bomb.position) < 1.7) hint = t('hintDefuse');
    }
    const drop = p.alive && !busy ? game.drops.nearest(p) : null;
    if (!hint && drop) hint = `${t('hintPickup')} ${WEAPONS[drop.id].name}`;
    if (!hint && !mode.arms && game.freezeUntil && game.time < game.freezeUntil && game.round <= 2) hint = t('hintLoadout');
    this.set('hint', hint, (v) => {
      e.hint.textContent = v;
      e.hint.classList.toggle('on', !!v);
    });
    this.set('resume', game.state === 'playing' && !game.input.locked && game.time - game.startedAt > 6 && game.time - game.lockedAt > 1, (v) => e.resume.classList.toggle('on', v));

    if (this.noticeT > 0) {
      this.noticeT -= dt;
      if (this.noticeT <= 0) e.notice.classList.remove('on');
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) e.toast.classList.remove('on');
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) e.banner.classList.remove('on');
    }
    this.medalT -= dt;
    if (this.medalT <= 0 && this.medals.length) this.playMedal(game);

    const dead = !p.alive && game.state === 'playing';
    const watching = !!game.spectate;
    e.death.classList.toggle('on', dead && !watching);
    this.root.classList.toggle('dead', dead);
    if (dead && !watching) {
      const text = mode.respawn ? `${t('respawnIn')} <span>${Math.max(0, Math.ceil(p.respawnAt - game.time))}</span>` : t('spectating');
      this.set('deathTimer', text, (v) => { e.deathTimer.innerHTML = v; });
    }
    this.set('spec', watching ? game.spectate.target.name : '', (v) => {
      e.spec.classList.toggle('on', !!v);
      e.specName.textContent = v;
    });

    for (const arc of this.ring.children) {
      const yaw = Math.atan2(arc._from.x - p.position.x, arc._from.z - p.position.z);
      const rel = yaw - p.yaw - Math.PI;
      arc.style.transform = `rotate(${-rel}rad)`;
    }

    if (game.input.down('Tab') && game.state === 'playing') {
      this.board.classList.remove('hidden');
      this.renderBoard(this.board, game);
    } else {
      this.board.classList.add('hidden');
    }
  }

  renderBoard(target, game) {
    const head = `<div class="board-head"><span>${t('player')}</span><span>${t('k')}</span><span>${t('d')}</span><span>${t('streak')}</span></div>`;
    const row = (a) => `
      <div class="board-row ${a.isPlayer ? 'me' : ''} ${a.alive ? '' : 'dead'}">
        <span class="${a.team ? `team-${a.team.toLowerCase()}` : ''}"><i class="dot" style="background:${a.color}"></i>${esc(a.name)}${a.hasBomb && game.allies(game.player, a) ? ' <b class="c4tag">C4</b>' : ''}</span>
        <span>${a.kills}</span><span>${a.deaths}</span><span>${a.bestStreak || 0}</span>
      </div>`;
    const sort = (list) => [...list].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    if (game.mode.teams) {
      let html = head;
      for (const team of ['A', 'B']) {
        const side = game.mode.bomb ? ` · ${team === game.attackers ? t('side_t') : t('side_ct')}` : '';
        html += `<div class="board-team ${team.toLowerCase()}">${t(`team_${team}`)}${side} · ${game.teamScore[team]}</div>`;
        html += sort(game.actors.filter((a) => a.team === team)).map(row).join('');
      }
      target.innerHTML = html;
    } else {
      target.innerHTML = head + sort(game.actors).map(row).join('');
    }
  }

  hurt(v) {
    const r = Math.round(v * 50) / 50;
    if (r === this.hurtValue) return;
    this.hurtValue = r;
    this.hurtEl.style.opacity = r;
  }

  flash(v) {
    const el = this.flashEl;
    el.style.transition = 'none';
    el.style.opacity = v.toFixed(2);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.9s ease-out';
      el.style.opacity = '0';
    }));
  }

  smoke(v) {
    const r = Math.round(Math.min(1, v) * 40) / 40;
    if (r === this.smokeValue) return;
    this.smokeValue = r;
    this.smokeEl.style.opacity = r;
  }

  showFps(v) {
    this.fpsEl.classList.toggle('hidden', v !== 'on');
  }

  tickFps(dt) {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fpsEl.textContent = `${Math.round(this.fpsFrames / this.fpsTime)} FPS`;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
  }

  target(actor) {
    if (actor) {
      if (this.tagged !== actor) {
        this.tagName.textContent = actor.name;
        this.tagName.style.color = actor.color;
      }
      this.tagHp.style.transform = `scaleX(${Math.max(0, actor.health) / 100})`;
    }
    if (!!actor !== !!this.tagged) this.tag.classList.toggle('on', !!actor);
    this.tagged = actor;
  }

  hitmarker(head, kill = false) {
    this.hit.classList.toggle('head', head);
    this.hit.classList.toggle('kill', kill);
    this.hitT = kill ? 0.45 : 0.25;
    this.hit.style.opacity = '1';
  }

  damageFrom(pos) {
    const arc = document.createElement('div');
    arc.className = 'arc';
    arc._from = pos.clone();
    this.ring.appendChild(arc);
    requestAnimationFrame(() => { arc.style.opacity = '0'; });
    setTimeout(() => arc.remove(), 950);
  }

  killfeed(killer, victim, weapon, head, mine) {
    const row = document.createElement('div');
    row.className = `kf ${mine ? 'mine' : ''}`;
    const k = killer && killer !== victim ? `<span style="color:${killer.color}">${esc(killer.name)}</span>` : '';
    const icon = this.icons[weapon] ? `<img src="${this.icons[weapon]}" alt="">` : `<span class="w">${esc(WEAPONS[weapon]?.name || '')}</span>`;
    row.innerHTML = `${k}${icon}${head ? '<span class="hs">◉</span>' : ''}<span style="color:${victim.color}">${esc(victim.name)}</span>`;
    this.feed.prepend(row);
    while (this.feed.children.length > 5) this.feed.lastChild.remove();
    setTimeout(() => { row.style.opacity = '0'; }, 5000);
    setTimeout(() => row.remove(), 5600);
  }

  radio(actor, text) {
    const row = document.createElement('div');
    row.className = 'kf radio';
    row.innerHTML = `<span style="color:${actor.color}">${esc(actor.name)}</span><span>${esc(text)}</span>`;
    this.feed.appendChild(row);
    setTimeout(() => { row.style.opacity = '0'; }, 3500);
    setTimeout(() => row.remove(), 4100);
  }

  notice(html, time = 1.6) {
    this.el.notice.innerHTML = html;
    this.el.notice.classList.add('on');
    this.noticeT = time;
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('on');
    this.toastT = 1.6;
  }

  banner(title, sub = '', color = '', time = 2.5) {
    const b = this.el.banner;
    b.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    b.style.color = color;
    b.classList.add('on');
    this.bannerT = time;
  }

  medal(id) {
    if (this.medals.length > 3) this.medals.shift();
    this.medals.push(id);
  }

  playMedal(game) {
    const id = this.medals.shift();
    const el = this.el.medal;
    el.textContent = t(`medal_${id}`);
    el.className = `medal ${MEDAL_STYLE[id] || ''}`;
    void el.offsetWidth;
    el.classList.add('on');
    game.audio.play(`vo_${id}`, { volume: 0.9, jitter: 0 });
    this.medalT = 1.25;
  }

  died(killer) {
    this.el.killerName.textContent = killer ? killer.name : '';
    this.el.killerName.parentElement.style.visibility = killer ? 'visible' : 'hidden';
  }

  resultsBoard(target, game) {
    this.renderBoard(target, game);
  }
}
