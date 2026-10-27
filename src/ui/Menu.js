import { t, setLang } from './i18n.js';
import { WEAPONS, PRIMARIES, SECONDARIES, GRENADES, MELEE } from '../combat/weapons.js';
import { MODES } from '../game/modes.js';
import { logo, FAVICON } from './logo.js';

const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  name: 'Player',
  mode: 'defuse',
  map: 'luxville',
  difficulty: 'normal',
  bots: 9,
  limit: 0,
  minutes: 5,
  sensitivity: 1,
  fov: 78,
  volume: 80,
  quality: 'medium',
  showFps: 'on',
  lang: 'en',
  primary: 'ak47',
  secondary: 'glock',
  grenade: 'he',
  melee: 'knife',
  side: 'A',
  charA: 'sf1',
  charB: 'tr1',
  crosshair: 'green',
  crossStyle: 'static',
  fullscreen: 'on',
};

const MAP_IDS = ['luxville', 'outpost', 'downtown', 'dunes'];

const MODE_ICONS = {
  defuse: '<svg viewBox="0 0 32 32"><rect x="6" y="11" width="20" height="13" rx="2.5" fill="currentColor"/><rect x="10" y="15" width="8" height="4" rx="1" fill="#0b0f14" opacity=".55"/><circle cx="22" cy="17" r="1.6" fill="#ff4d4d"/><path d="M19 11c0-3 2-5 5-5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
  dm: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M16 3v7M16 22v7M3 16h7M22 16h7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="16" r="2" fill="currentColor"/></svg>',
  tdm: '<svg viewBox="0 0 32 32"><circle cx="11" cy="11" r="4" fill="currentColor"/><circle cx="21" cy="11" r="4" fill="currentColor" opacity=".6"/><path d="M4 26c0-5 3-8 7-8s7 3 7 8z" fill="currentColor"/><path d="M14 26c0-5 3-8 7-8s7 3 7 8z" fill="currentColor" opacity=".6"/></svg>',
  arms: '<svg viewBox="0 0 32 32"><path d="M16 4l9 10h-6v14h-6V14H7z" fill="currentColor"/></svg>',
  elim: '<svg viewBox="0 0 32 32"><path d="M16 4c6 0 10 4 10 10 0 4-2 6-4 7v4h-3v-3h-2v3h-2v-3h-2v3h-3v-4c-2-1-4-3-4-7 0-6 4-10 10-10z" fill="currentColor"/><circle cx="12" cy="14" r="2.6" fill="#0b0f14"/><circle cx="20" cy="14" r="2.6" fill="#0b0f14"/></svg>',
};

const KEY = 'outpost.settings';
const VERSION = 2;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (saved.v !== VERSION) {
      delete saved.mode;
      delete saved.bots;
      delete saved.limit;
      saved.v = VERSION;
    }
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS, v: VERSION };
  }
}

export class Menu {
  constructor(handlers) {
    this.handlers = handlers;
    this.settings = load();
    this.settings.v = VERSION;
    this.screens = ['loading', 'menu', 'settings', 'pause', 'results', 'loadoutScreen', 'sideScreen', 'charScreen'];
    this.settingsReturn = 'menu';
    this.loadoutReturn = 'menu';
    this.icons = {};
    for (const el of document.querySelectorAll('.brand')) el.innerHTML = logo();
    $('favicon').href = FAVICON;
    setLang(this.settings.lang);

    for (const seg of document.querySelectorAll('.seg')) {
      const key = seg.dataset.key;
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        handlers.click?.();
        const v = b.dataset.v;
        this.settings[key] = Number.isNaN(Number(v)) ? v : Number(v);
        if (key === 'lang') {
          setLang(v);
          this.buildCards();
        }
        this.sync();
        this.save();
      });
    }

    this.bindRange('botsInput', 'bots', (v) => `${v}`, 'botsVal');
    this.bindRange('sensInput', 'sensitivity', (v) => v.toFixed(2), 'sensVal');
    this.bindRange('fovInput', 'fov', (v) => `${v}`, 'fovVal');
    this.bindRange('volInput', 'volume', (v) => `${v}`, 'volVal');

    const name = $('nameInput');
    name.value = this.settings.name;
    name.addEventListener('input', () => {
      this.settings.name = name.value.trim().slice(0, 14) || 'Player';
      this.save();
    });
    name.addEventListener('keydown', (e) => e.stopPropagation());

    const click = (id, fn) => $(id).addEventListener('click', () => {
      handlers.click?.();
      fn();
    });
    click('playBtn', () => {
      if ((MODES[this.settings.mode] || MODES.dm).teams) this.show('sideScreen');
      else this.openChars();
    });
    for (const card of document.querySelectorAll('.side-card')) {
      card.addEventListener('click', () => {
        handlers.click?.();
        this.settings.side = card.dataset.side;
        this.save();
        this.openChars();
      });
    }
    click('sideBack', () => this.show('menu'));
    click('charBack', () => this.show((MODES[this.settings.mode] || MODES.dm).teams ? 'sideScreen' : 'menu'));
    click('charNext', () => {
      if ((MODES[this.settings.mode] || MODES.dm).arms) handlers.play(this.settings);
      else this.openLoadout('play');
    });
    click('againBtn', () => handlers.play(this.settings));
    click('settingsBtn', () => this.openSettings('menu'));
    click('pauseSettingsBtn', () => this.openSettings('pause'));
    click('settingsBack', () => this.show(this.settingsReturn));
    click('pauseLoadoutBtn', () => this.openLoadout('pause'));
    click('loadoutBack', () => {
      if (this.loadoutReturn === 'play') {
        handlers.play(this.settings);
        return;
      }
      handlers.loadout?.(this.settings);
      if (this.loadoutReturn === 'pause') handlers.resume();
      else this.show(this.loadoutReturn);
    });
    click('loadoutCancel', () => this.show('charScreen'));
    click('resumeBtn', () => handlers.resume());
    click('quitBtn', () => handlers.quit());
    click('menuBtn', () => handlers.quit());

    this.buildCards();
    this.sync();
  }

  setIcons(icons) {
    this.icons = icons;
    this.buildGunCards();
  }

  setPortraits(characters, portraits) {
    this.characters = characters;
    this.portraits = portraits;
    $('sideArtA').src = portraits[characters.find((c) => c.team === 'A').id];
    $('sideArtB').src = portraits[characters.find((c) => c.team === 'B').id];
    this.buildChars();
  }

  openChars() {
    this.buildChars();
    this.show('charScreen');
  }

  buildChars() {
    const el = $('charCards');
    if (!this.characters) return;
    const side = this.settings.side === 'B' ? 'B' : 'A';
    const mode = MODES[this.settings.mode] || MODES.dm;
    const list = this.characters.filter((c) => !mode.teams || c.team === side);
    el.innerHTML = '';
    for (const c of list) {
      const b = document.createElement('button');
      b.className = `card char team-${c.team.toLowerCase()}`;
      b.dataset.v = c.id;
      b.innerHTML = `<img src="${this.portraits[c.id]}" alt=""><b>${c.name}</b>`;
      b.addEventListener('click', () => {
        this.handlers.click?.();
        this.settings[`char${c.team}`] = c.id;
        if (!mode.teams) this.settings.side = c.team;
        this.syncChars();
        this.save();
      });
      el.appendChild(b);
    }
    this.syncChars();
  }

  syncChars() {
    const s = this.settings;
    for (const c of document.querySelectorAll('#charCards .card')) {
      const team = c.classList.contains('team-b') ? 'B' : 'A';
      c.classList.toggle('on', s[`char${team}`] === c.dataset.v && ((MODES[s.mode] || MODES.dm).teams || s.side === team));
    }
  }

  buildCards() {
    const modes = $('modeCards');
    modes.innerHTML = '';
    for (const id of Object.keys(MODES)) {
      const b = document.createElement('button');
      b.className = 'card mode';
      b.dataset.v = id;
      b.innerHTML = `<i class="mode-icon">${MODE_ICONS[id]}</i><b>${t(`m_${id}`)}</b><small>${t(`m_${id}_d`)}</small>`;
      b.addEventListener('click', () => {
        this.handlers.click?.();
        this.settings.mode = id;
        this.sync();
        this.save();
      });
      modes.appendChild(b);
    }

    const maps = $('mapCards');
    maps.innerHTML = '';
    for (const id of MAP_IDS) {
      const b = document.createElement('button');
      b.className = 'card map';
      b.dataset.v = id;
      b.innerHTML = `<img src="assets/maps/${id}.jpg" alt="" loading="lazy"><div class="map-text"><b>${t(`map_${id}`)}</b><small>${t(`map_${id}_d`)}</small></div><span class="sites">A · B</span>`;
      b.addEventListener('click', () => {
        this.handlers.click?.();
        this.settings.map = id;
        this.sync();
        this.save();
      });
      maps.appendChild(b);
    }
    this.buildGunCards();
  }

  buildGunCards() {
    const stat = (w) => {
      const dps = (w.damage * w.pellets * w.rpm) / 60;
      return [
        ['dmg', Math.min(1, (w.damage * w.pellets) / 130)],
        ['rof', Math.min(1, w.rpm / 850)],
        ['dps', Math.min(1, dps / 420)],
        ['mob', Math.min(1, (w.speed - 0.8) / 0.28)],
      ];
    };
    const labels = ['statDmg', 'statRof', 'statDps', 'statMob'];
    for (const [list, el, key] of [[PRIMARIES, $('primaryCards'), 'primary'], [SECONDARIES, $('secondaryCards'), 'secondary'], [GRENADES, $('grenadeCards'), 'grenade'], [MELEE, $('fixedCards'), 'melee']]) {
      el.innerHTML = '';
      for (const id of list) {
        const w = WEAPONS[id];
        const b = document.createElement('button');
        b.className = 'card gun';
        b.dataset.key = key;
        b.dataset.v = id;
        const bars = w.grenade || w.melee ? `<small>${t(`desc_${id}`)}</small>` : `<div class="bars">${stat(w).map(([, v], i) => `<span>${t(labels[i])}</span><i style="--v:${Math.round(v * 100)}%"></i>`).join('')}</div>`;
        b.innerHTML = `${this.icons[id] ? `<img src="${this.icons[id]}" alt="">` : ''}<b>${w.name}<em>${w.weight.toFixed(1)} ${t('kg')}</em></b>${bars}`;
        b.addEventListener('click', () => {
          this.handlers.click?.();
          this.settings[key] = id;
          this.sync();
          this.save();
        });
        el.appendChild(b);
      }
    }
    this.sync();
  }

  bindRange(id, key, fmt, label) {
    const el = $(id);
    el.value = this.settings[key];
    $(label).textContent = fmt(Number(el.value));
    el.addEventListener('input', () => {
      this.settings[key] = Number(el.value);
      $(label).textContent = fmt(this.settings[key]);
      this.save();
      this.handlers.change?.(this.settings);
    });
  }

  openSettings(from) {
    this.settingsReturn = from;
    this.show('settings');
  }

  openLoadout(from) {
    this.loadoutReturn = from;
    const start = from === 'play';
    $('loadoutBack').textContent = t(start ? 'startMatch' : 'done');
    $('loadoutCancel').classList.toggle('hidden', !start);
    $('loadoutSteps').classList.toggle('hidden', !start);
    $('loadoutHintLine').classList.toggle('hidden', start);
    this.show('loadoutScreen');
  }

  sync() {
    const s = this.settings;
    for (const seg of document.querySelectorAll('.seg')) {
      const v = String(s[seg.dataset.key]);
      for (const b of seg.children) b.classList.toggle('on', b.dataset.v === v);
    }
    for (const c of document.querySelectorAll('#modeCards .card')) c.classList.toggle('on', c.dataset.v === s.mode);
    for (const c of document.querySelectorAll('#mapCards .card')) c.classList.toggle('on', c.dataset.v === s.map);
    for (const c of document.querySelectorAll('.card.gun')) c.classList.toggle('on', s[c.dataset.key] === c.dataset.v);

    const mode = MODES[s.mode] || MODES.dm;
    const seg = $('limitSeg');
    [...seg.children].forEach((b, i) => {
      b.textContent = mode.limits[i];
    });
    seg.parentElement.classList.toggle('hidden', !!mode.fixedLimit);
    $('limitLabel').textContent = t(mode.rounds ? 'roundsToWin' : 'limit');

    $('timeField').classList.toggle('hidden', !!mode.rounds);
    $('modeInfo').innerHTML = `<i class="mode-icon">${MODE_ICONS[mode.id]}</i><div><b>${t(`m_${mode.id}`)}</b><p>${t(`m_${mode.id}_long`)}</p></div>`;
    $('lobbyBg').style.backgroundImage = `url(assets/maps/${s.map}.jpg)`;
    $('controlsLine').innerHTML = t('controls').split(' · ').filter((c) => !c.startsWith('B ')).map((c) => {
      const [k, ...rest] = c.split(' ');
      return `<span><kbd>${k}</kbd> ${rest.join(' ')}</span>`;
    }).join('');
    this.handlers.change?.(s);
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      return;
    }
  }

  progress(p, label) {
    $('loadFill').style.width = `${Math.round(p * 100)}%`;
    if (label) $('loadText').textContent = t(label);
  }

  show(id) {
    for (const s of this.screens) $(s).classList.toggle('hidden', s !== id);
  }

  hide() {
    this.show(null);
  }

  results(title, sub) {
    $('resultTitle').textContent = title;
    $('resultSub').textContent = sub;
    this.show('results');
    return $('resultBoard');
  }
}
