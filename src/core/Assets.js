import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { CHARACTERS } from './factions.js';
import { paintUniform } from './uniform.js';
import { GRIP } from '../actors/Avatar.js';

const ROOT = 'assets/';

const INDUSTRIAL = [
  'building-a', 'building-b', 'building-c', 'building-e', 'building-g', 'building-l',
  'building-m', 'building-r', 'building-t',
  'chimney-large', 'chimney-medium', 'detail-tank', 'detail-tank-large',
  'shipping-container-a', 'shipping-container-b', 'shipping-container-c',
  'solar-panel-landscape-group', 'water-tower', 'windmill',
];

const SURVIVAL = ['barrel', 'box', 'box-large', 'rock-b', 'tree', 'tree-tall', 'tent-canvas'];

const CARS = ['sedan', 'taxi', 'police', 'suv', 'van', 'hatchback-sports', 'delivery', 'truck'];

const NATURE = ['cactus_tall', 'rock_tallA', 'rock_largeC', 'tree_palmTall', 'tree_palmBend', 'tree_oak'];

const WEAPONS = ['crate-medium'];

const SKINS = [
  'survivorMaleB', 'survivorFemaleA', 'criminalMaleA', 'cyborgFemaleA',
  'skaterMaleA', 'skaterFemaleA', 'zombieA', 'zombieC',
];

const FX = ['muzzle_02', 'muzzle_05', 'smoke_04', 'spark_05', 'scorch_02', 'circle_05', 'light_01', 'flare_01'];

const VOICE = [
  'start', 'rampage', 'double_kill', 'triple_kill', 'dominating', 'unstoppable', 'first_blood', 'headshot',
  'team_deathmatch', 'elimination', 'last_man_standing', 'round_winner', 'mission_failed', 'mission_accomplished',
  'final_stand', 'annihilation', 'payback', 'game_over',
];

const SOUNDS = [
  'ak.wav', 'm4.wav', 'mp5.wav', 'awp.wav', 'nova.wav', 'glock.wav', 'deagle.wav', 'far.wav',
  'death', 'spawn', 'ricochet', 'impact', 'magout', 'magin', 'slide', 'shell', 'pump',
  'step0', 'step1', 'step2', 'step3', 'step4', 'hit', 'kill', 'pickup', 'click', 'switch', 'empty',
  'boom', 'crunch', 'bounce', 'stab', 'slash', 'smoke',
];

function simplified(geo, ratio) {
  const pos = geo.attributes.position;
  const flat = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    flat[i * 3] = pos.getX(i);
    flat[i * 3 + 1] = pos.getY(i);
    flat[i * 3 + 2] = pos.getZ(i);
  }
  const src = geo.index ? Uint32Array.from(geo.index.array) : Uint32Array.from({ length: pos.count }, (_, i) => i);
  const target = Math.floor((src.length * ratio) / 3) * 3;
  const [index] = MeshoptSimplifier.simplify(src, flat, 3, target, 0.02, ['Prune']);
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) out.setAttribute(name, attr);
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

export class Assets {
  constructor(audio) {
    this.audio = audio;
    this.manager = new THREE.LoadingManager();
    this.gltf = new GLTFLoader(this.manager);
    this.fbx = new FBXLoader(this.manager);
    this.rgbe = new RGBELoader(this.manager);
    this.textures = new THREE.TextureLoader(this.manager);
    this.files = new THREE.FileLoader(this.manager).setResponseType('arraybuffer');

    this.models = {};
    this.skins = {};
    this.fx = {};
    this.ground = {};
    this.character = null;
    this.sky = null;
  }

  async load(onProgress) {
    this.manager.onProgress = (_, loaded, total) => onProgress?.(loaded / total);

    const jobs = [];
    const model = (key, url) =>
      jobs.push(this.gltf.loadAsync(url).then((g) => {
        const kit = url.slice(0, url.lastIndexOf('/'));
        g.scene.traverse((o) => {
          if (o.isMesh) {
            o.material.userData.kit = kit;
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.models[key] = g.scene;
      }));

    INDUSTRIAL.forEach((n) => model(n, `${ROOT}props/industrial/${n}.glb`));
    SURVIVAL.forEach((n) => model(n, `${ROOT}props/survival/${n}.glb`));
    WEAPONS.forEach((n) => model(n, `${ROOT}weapons/${n}.glb`));
    CARS.forEach((n) => model(n, `${ROOT}props/cars/${n}.glb`));
    NATURE.forEach((n) => model(n, `${ROOT}props/nature/${n}.glb`));
    VOICE.forEach((n) => jobs.push(this.files.loadAsync(`${ROOT}audio/voice/${n}.wav`).then((buf) => this.audio.decode(`vo_${n}`, buf))));

    SKINS.forEach((n) =>
      jobs.push(this.textures.loadAsync(`${ROOT}characters/skins/${n}.png`).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        this.skins[n] = t;
      })));

    FX.forEach((n) =>
      jobs.push(this.textures.loadAsync(`${ROOT}fx/${n}.png`).then((t) => {
        this.fx[n] = t;
      })));

    for (const [key, file] of [['map', 'diff'], ['normal', 'nor_gl'], ['rough', 'rough']]) {
      jobs.push(this.textures.loadAsync(`${ROOT}textures/concrete_${file}.jpg`).then((t) => {
        if (key === 'map') t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        this.ground[key] = t;
      }));
    }

    this.pbr = {};
    for (const key of ['tiles', 'marble', 'plaster', 'paint', 'brick', 'greybrick', 'concrete', 'wood', 'metal']) {
      const set = (this.pbr[key] = {});
      for (const [slot, suffix] of [['map', 'c'], ['normal', 'n'], ['rough', 'r']]) {
        jobs.push(this.textures.loadAsync(`${ROOT}textures/pbr/${key}_${suffix}.jpg`).then((t) => {
          if (slot === 'map') t.colorSpace = THREE.SRGBColorSpace;
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = 8;
          set[slot] = t;
        }));
      }
    }

    jobs.push(this.rgbe.loadAsync(`${ROOT}env/sky.hdr`).then((t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      this.sky = t;
    }));

    SOUNDS.forEach((file) => {
      const [name, ext = 'ogg'] = file.split('.');
      jobs.push(this.files.loadAsync(`${ROOT}audio/${name}.${ext}`).then((buf) => this.audio.decode(name, buf)));
    });

    jobs.push(this.loadCharacter());
    jobs.push(this.loadHQ());

    await Promise.all(jobs);
    this.characters = CHARACTERS.map((c, i) => {
      const kind = c.female ? this.hq.female : this.hq.male;
      return { ...c, skin: paintUniform(kind.tones[c.tone || 'dark'], kind.skinned, c.team, i * 31 + 7) };
    });
    onProgress?.(1);
  }

  async loadHQ() {
    const dir = `${ROOT}characters/hq/`;
    const files = ['Superhero_Male_FullBody', 'Superhero_Female_FullBody', 'Hair_Buzzed', 'Hair_SimpleParted', 'Hair_Buns', 'Hair_Long', 'Hair_Beard'];
    const [male, female, ...hair] = await Promise.all(files.map((f) => this.gltf.loadAsync(`${dir}${f}.gltf`)));
    const anims = await this.gltf.loadAsync(`${dir}anims.glb`);
    await MeshoptSimplifier.ready;
    const image = (url) => this.textures.loadAsync(url).then((t) => t.image);
    const [md, ml, fd, fl] = await Promise.all(['T_Superhero_Male_Dark.jpg', 'T_Superhero_Male_Light.jpg', 'T_Superhero_Female_Dark_BaseColor.jpg', 'T_Superhero_Female_Light.jpg'].map((f) => image(dir + f)));
    const kind = (g, material, dark, light) => {
      let skinned = null;
      g.scene.traverse((o) => {
        if (o.isSkinnedMesh && o.material.name === material) skinned = o;
      });
      return { scene: g.scene, skinned, bodyMaterial: material, tones: { dark, light }, lod: simplified(skinned.geometry, 0.22) };
    };
    const pick = (name) => {
      const clip = anims.animations.find((a) => a.name === name).clone();
      clip.tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion') || t.name === 'pelvis.position');
      return clip;
    };
    this.hq = {
      male: kind(male, 'MI_Superhero_Male', md, ml),
      female: kind(female, 'MI_Superhero_Female', fd, fl),
      hair: {},
      clips: {
        idle: pick('Idle_Loop'),
        walk: pick('Walk_Loop'),
        run: pick('Jog_Fwd_Loop'),
        crouch: pick('Crouch_Idle_Loop'),
        crouchRun: pick('Crouch_Fwd_Loop'),
        jump: pick('Jump_Loop'),
        death: pick('Death01'),
        hit: pick('Hit_Chest'),
      },
    };
    const grip = anims.animations.find((a) => a.name === 'Pistol_Idle_Loop');
    for (const track of grip.tracks) {
      const m = /^((index|middle|ring|pinky|thumb)_0[123]_[lr])\.quaternion$/.exec(track.name);
      if (m) GRIP[m[1]] = new THREE.Quaternion().fromArray(track.values, 0);
    }
    files.slice(2).forEach((f, i) => {
      const list = [];
      hair[i].scene.traverse((o) => {
        if (o.isSkinnedMesh) list.push(o);
      });
      this.hq.hair[f] = list;
    });
  }

  async loadCharacter() {
    const [model, idle, run, jump] = await Promise.all(
      ['character', 'idle', 'run', 'jump'].map((n) => this.fbx.loadAsync(`${ROOT}characters/${n}.fbx`)),
    );

    const pick = (src, name) => {
      const clip = [...src.animations].sort((a, b) => b.duration - a.duration)[0].clone();
      clip.name = name;
      clip.tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion'));
      return clip;
    };

    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });

    const box = new THREE.Box3().setFromObject(model);
    const height = box.max.y - box.min.y;

    this.character = {
      model,
      scale: 1.8 / height,
      clips: {
        idle: pick(idle, 'idle'),
        run: pick(run, 'run'),
        jump: pick(jump, 'jump'),
      },
    };
  }

  clone(key) {
    return this.models[key].clone(true);
  }
}

export { SKINS };
