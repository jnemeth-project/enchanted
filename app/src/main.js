// Enchanted: a seated, hands-first wind-down in a glowing night forest.
// Each night you choose (the butterfly and a few words show you how, the first time):
//   Fireflies  - a memory game that grows a level each night, then water your mushroom in the rain.
//   Stargazing - the trees part overhead under a sky full of stars: count the stars home, or join them into pictures.
import * as THREE from 'three';
import { World, createSystem } from '@iwsdk/core';
import { loadWorld, shaderMats, EYE, setSeat, atEye } from './world.js';
import { Input, DesktopControls } from './input.js';
import { Sound } from './audio.js';
import { Effects } from './effects.js';
import { Sleep } from './sleep.js';
import { Fireflies } from './fireflies.js';
import { Touch } from './touch.js';
import { Rain } from './rain.js';
import { Seed } from './seed.js';
import { Guide } from './guide.js';
import { Gaze } from './gaze.js';
import { Captions } from './captions.js';
import { SkyGames } from './skygames.js';
import { Twirls, Pebbles, Crystals, DirtDrawing, MushroomThrow, SoundGuides, Outlines, Playfield, Butterflies, DrawStick, FairyJar, ShelfLights, AirTrails } from './play.js';
import { Choice } from './choice.js';
import { Menu } from './menu.js';
import { ThingsMenu } from './thingsmenu.js';
import { SleepyMushrooms } from './sleepy.js';
import { Hoops } from './hoops.js';
import { Seek } from './seek.js';
import { WakeField, Waterfall, Fairies, Squirrels, Intro } from './intro.js';
import { Pond } from './pond.js';
import { ShootingStars } from './wishes.js';
import { Eggs } from './eggs.js';
import { tweens, clamp, glowTexture } from './util.js';
import { loadState, beginNight, saveState, wateredTonight, nightKey } from './save.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
// Options chosen on the start screen (remembered on this device)
const OPT_KEY = 'enchanted.options', OLD_OPT_KEY = 'lightsout.options';   // (kept from when the game was called Lights Out)
const options = (() => { try { return { look: false, sit: false, bright: false, volume: 0.8, ...JSON.parse(localStorage.getItem(OPT_KEY) || localStorage.getItem(OLD_OPT_KEY) || '{}') }; } catch { return { look: false, sit: false, bright: false, volume: 0.8 }; } })();
delete options.seatNow;   // (asked fresh every time: where you are tonight may not be where you were last time)
if (params.get('mode') === 'sit') options.sit = true;
if (params.has('look')) options.look = true;
let JUST_SIT = options.sit;

const ui = {
  overlay: document.getElementById('overlay'), bar: document.getElementById('bar'), status: document.getElementById('status'),
  vr: document.getElementById('enter-vr'), screen: document.getElementById('enter-screen'), hint: document.getElementById('hint'),
  howto: document.getElementById('how-to'),
};

// The world runs on Meta's Immersive Web SDK (IWSDK): it owns the renderer, the scene, the player rig and the
// render loop; the game runs as one IWSDK system each frame (see GameSystem below).
// The VR session is only started when you pick "Enter the forest" (never offered by itself), always seated and
// on the local floor, with hand tracking. IWSDK's own pointers, rays and hand models are switched off: the forest
// draws its own soft hands and everything is touched directly.
// ?emulate (testing only): a Meta Quest 3 with tracked hands is emulated in the browser by Meta's IWER,
// so the headset and hand play can be checked without a headset. Never loaded otherwise.
if (new URLSearchParams(location.search).has('emulate')) {
  const { XRDevice, metaQuest3 } = await import('iwer');
  const dev = new XRDevice(metaQuest3); dev.installRuntime({ forceInstall: true }); dev.primaryInputMode = 'hand';
  dev.position.set(0, 0.82, 0);
  window.__xrdev = dev;
}
// The headset draws the forest the same proven way as before IWSDK: without the "layers" feature (the projection
// layer with multiview), which made textures flash in the Quest. IWSDK offers it by default, so it is taken out of
// the session request here.
if (navigator.xr && navigator.xr.requestSession && !navigator.xr.__noLayers) {
  const req = navigator.xr.requestSession.bind(navigator.xr);
  navigator.xr.requestSession = (mode, init = {}) => req(mode, { ...init,
    optionalFeatures: (init.optionalFeatures || []).filter((f) => f !== 'layers'),
    requiredFeatures: (init.requiredFeatures || []).filter((f) => f !== 'layers') });
  navigator.xr.__noLayers = true;
}
const world = await World.create(document.getElementById('scene-container'), {
  xr: { sessionMode: 'immersive-vr', offer: 'none', referenceSpace: 'local-floor', features: { handTracking: true }, restoreCameraOnExit: false },
  render: { fov: 70, near: 0.03, far: 400 },
  input: { canvasPointerEvents: false },
  features: { locomotion: false, grabbing: false, physics: false, sceneUnderstanding: false, environmentRaycast: false, spatialUI: false },
});
const renderer = world.renderer;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.xr.setFoveation(0.4); // a light touch at the very edges of the lenses (hardly visible) keeps the frame rate smooth; "Calm motion" softens them more
renderer.domElement.style.display = 'block';
// (checked every frame: IWSDK builds its hand and controller models when a hand first appears)
function quietIwsdkInput() {
  const va = world.input && world.input.visualAdapters; if (!va) return;
  for (const side of ['left', 'right']) {
    for (const a of [va.hand && va.hand[side], va.controller && va.controller[side]]) {
      if (!a) continue;
      if (a.visualsEnabled) a.toggleVisual(false);
      if (a.visual && a.visual.model && a.visual.model.visible) { a.visual.toggle(false); a.visual.model.visible = false; }
    }
  }
}
quietIwsdkInput();
for (const side of ['left', 'right']) for (const k of ['ray', 'grab', 'touch']) try { world.input.multiPointers[side].toggleSubPointer(k, false); } catch (e) {}

const scene = world.scene;
scene.background = new THREE.Color(0x05040b);
scene.fog = new THREE.FogExp2(0x1b2650, 0.02); // a soft blue night haze all round the forest: the trees fade into gentle blue, not black
const camera = world.camera;
const rig = world.player;   // IWSDK's player rig (XROrigin): the camera and your hands live in it
camera.position.copy(EYE);
// "Soft edges" (an option for people sensitive to motion): the edges of your view softly darken,
// so what moves at the side of your vision is calmer. Off by default: full, clear side vision.
const vignette = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
  uniforms: { strength: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false, fog: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: 'uniform float strength; varying vec2 vUv; void main(){ float r = length(vUv * 2. - 1.); float a = smoothstep(0.17, 0.42, r); gl_FragColor = vec4(0.0, 0.0, 0.01, a * strength); }',
}));
vignette.position.set(0, 0, -0.2); vignette.renderOrder = 999; vignette.frustumCulled = false; // only added to the view while Calm motion is on
// a black veil that fades in and out around a re-centre, so the world never jumps (Calm motion)
const veil = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
veil.position.set(0, 0, -0.15); veil.renderOrder = 1000; // only in the view for the moment it fades
let MOTION = 1; // how lively the twirling and drifting is (Calm motion slows it)
function setSoftEdges(on) { if (on) camera.add(vignette); else camera.remove(vignette); vignette.visible = on; vignette.material.uniforms.strength.value = on ? 0.92 : 0; renderer.xr.setFoveation(on ? 1 : 0.4); }

const sound = new Sound();
const effects = new Effects(scene);
const input = new Input(renderer, rig, camera);
const desktop = new DesktopControls(renderer.domElement, camera, input);
const guide = new Guide(scene);
const gaze = new Gaze(scene, renderer, camera, input);
const captions = new Captions(scene);
const choice = new Choice(scene, sound, () => eyeRay());
const sky = new SkyGames(scene, sound, EYE, eyeRay, viewQuat);
const SKY = (m) => m === 'count' || m === 'shapes';
const GROW_WORDS = ['', 'Your little seed has sprouted\nIt will grow, day by day', 'Your magic mushroom is growing\nday by day', 'Your magic mushroom\nhas bloomed'];
const abovePot = () => seed.target.clone().add(new THREE.Vector3(0, 0.42, 0));
const state = loadState();
const newNight = beginNight(state); saveState(state);
// First-time guidance (the butterfly's demonstrations and the words) shows on the very first visit,
// or whenever asked for (?tutorial=1, or "Show me how to play").
let TUTORIAL = !options.sit && (params.has('tutorial') || params.has('demo') || !state.tutorialDone);
if (params.has('tutorial') || params.has('demo')) state.memoryShown = false;

let potToldRain = false;
let seek, hoops, waterfall, fairies, squirrels, wake, intro, INTRO = false, W, sleep, flies, touch, rain, seed, menu, twirls, pebbles, crystals, dirt, mushThrow, potGroup, potShown = false, guides, outlines, playfield, jar, flutter, stick, shelfLights, things, sleepy, airTrails, pond, shooting, eggs;
// Calm motion (for people who get motion sick): darker soft edges, slower twirls, fewer sparkles, gentler rain, and no sudden jumps
function setCalm(on) {
  options.calm = on; setSoftEdges(on); MOTION = on ? 0.4 : 1;
  effects.motion = on ? 0.5 : 1; if (rain) rain.calm = on;
}
// re-centre the view; with Calm motion, behind a quick soft fade so nothing jumps
function gentleRecenter(always = false) {
  if (!renderer.xr.isPresenting || !headTracked()) return;
  if (!options.calm && !always) { recenter(); return; }
  camera.add(veil); veil.visible = true;
  tweens.add(0.3, (k) => { veil.material.opacity = k; }, { done: () => { recenter(); tweens.add(0.6, (k) => { veil.material.opacity = 1 - k; }, { done: () => { veil.visible = false; camera.remove(veil); } }); } });
}
// Read aloud: the words that appear are also spoken, softly and slowly
function speak(text) {
  try {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\n/g, '. ')); u.rate = 0.88; u.pitch = 1.0; u.volume = 0.9;
    const v = speechSynthesis.getVoices().find((x) => /en[-_]GB/i.test(x.lang)) || speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang)); if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch {}
}
function applyAccess() {
  captions.large = !!options.large; captions.speak = options.speak ? speak : null;
  if (guides) guides.on = !!options.guides;
  if (outlines) outlines.set(!!options.outlines);
}
const phase = { name: 'loading', t: 0, rainT: 0, mode: null };
const session = { t: 0, len: 600, warned: false };
const remaining = () => session.len - session.t;
const clock = new THREE.Clock();
let time = 0, xrFrames = 0;

async function init() {
  try {
    W = await loadWorld(scene, (k) => { ui.bar.style.width = `${Math.round(k * 100)}%`; });
  } catch (e) {
    console.error(e); ui.status.textContent = 'The forest could not load. Check your connection and refresh.'; return;
  }
  ui.bar.style.width = '100%';
  sleep = new Sleep(W, 12);
  touch = new Touch(W, sound, effects);
  seed = new Seed(scene, W, state, sound, effects, touch);
  flies = new Fireflies(scene, sleep, sound);
  flies.model = { body: W.byName.G_FireflyBody, wing: W.byName.G_FireflyWing }; // cute cartoon fireflies, made in Blender
  rain = new Rain(scene, sound, effects, seed);
  menu = new Menu(scene, W, input, sound);
  twirls = new Twirls(W, sound, effects); pebbles = new Pebbles(W, sound, effects); crystals = new Crystals(W, sound, effects);
  dirt = new DirtDrawing(scene, W, sound, effects);
  mushThrow = new MushroomThrow(touch, W, sound, effects);
  playfield = new Playfield(W, touch, sound, effects); pebbles.field = mushThrow.field = playfield;
  flutter = { update() {} };   // (no wandering butterflies: the guide is the only butterfly in the forest)
  // the wise tree's shelves: the drawing stick and the fairy light jar
  stick = new DrawStick(W, sound, dirt); stick.air = airTrails = new AirTrails(scene);
  touch.tools.push(() => (stick.held ? stick.tip() : null)); jar = new FairyJar(W, scene, sound, effects);
  // the pond: pebbles plop in, or skip across if thrown flat and fast
  pond = new Pond(W, scene); pebbles.pond = pond;
  // the hoops game: rings of light in front of you to throw pebbles through (never inside a tree)
  hoops = new Hoops(scene, sound, effects); pebbles.hoops = hoops;
  // Hidden glow: find the thing in a colour found nowhere else in the forest, just by resting your eyes on it
  seek = new Seek(scene, W, sound, effects);
  seek.onShow = (def) => say(`Find this ${def.name}\nhidden somewhere in the forest`, { hold: 4.2 });
  seek.onFound = (def, n) => say(n === 1 ? 'You found it!' : ['Found it!', 'Well spotted!', 'There it is!'][n % 3], { hold: 2 });
  // the waterfall at the back of the pond, and the fairies who live in the old lilac giant
  waterfall = new Waterfall(W, sound); fairies = new Fairies(scene, W, sound, effects); squirrels = new Squirrels(scene, W, sound, effects);
  // the first night (or ?intro): the forest starts fast asleep, and wakes with the butterfly
  wake = new WakeField();
  intro = new Intro({ W, scene, sleep, guide, sound, effects, wake, fairies, squirrels, say, eyePos, atEye, lights: [W.hemi, W.moonLight].filter(Boolean).map((light) => ({ light, base: light.intensity })) });
  INTRO = !JUST_SIT && (params.has('intro') || !state.introDone);
  if (INTRO) wake.patch(W.root);
  intro.onDone = () => { state.introDone = true; saveState(state); if (things.halo) things.halo.visible = true; greet(); };
  touch.onAny = (kind, at) => { if (intro.running) intro.touched(at || null); };
  crystals.onAny = (at) => { if (intro.running) intro.touched(at || null); };
  hoops.blocked = (x, z) => playfield.trunks.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + 0.6);
  hoops.onScore = (n) => { if (n === 1) say('Lovely', { hold: 1.6 }); else if (n % 5 === 0) say(`${n} rings`, { width: 0.7, hold: 1.8 }); };
  pebbles.onSkips = (n) => { if (time - (pebbles.skipSaid ?? -99) < 4 || n < 3) return; pebbles.skipSaid = time; say(n >= 4 ? `${n === 4 ? 'Four' : n === 5 ? 'Five' : 'Six'} skips!\nThe frogs can't believe it 🐸` : 'Three skips!\nThe frogs are impressed 🐸', { hold: 3 }); };
  // shooting stars, and a wish if you saw one
  shooting = new ShootingStars(scene);
  shooting.onWish = () => {
    effects.sparkle(ahead(0.9, 0.05), 0xffe2a0, 26, 0.12); sound.chime(ahead(0.9, 0.05), 880);
    if (!shooting.told) { shooting.told = true; say('Make a wish ✨', { hold: 2.6 }); }
  };
  // a heart drawn in the air with the stick floats up into the sky
  airTrails.eye = eyePos;
  airTrails.onHeart = (c) => { effects.sparkle(c.clone(), 0xff8cc6, 30, 0.14); sound.chime(c.clone(), 698.46); };
  stick.onThrow = (at) => {
    if (time - (stick.toldAt ?? -99) < 20) return; stick.toldAt = time;
    effects.sparkle(at, 0xffe2b0, 12, 0.08);
    say('Sticks are for drawing,\nnot for fetching 🐾', { hold: 3.2 });
  };
  eggs = new Eggs({ W, guide, sound, effects, say, touch, shelfLights,
    eye: eyePos, look: () => eyeRay().direction.clone(),
    resumeGuide: () => { if (phase.name === 'relax' && !phase.mode) restGuide(); else guide.goTo(atEye(-0.3, 0.95, -0.75), { speed: 0.9 }); } });
  eggs.busy = () => intro && intro.running;   // during the intro the butterfly keeps to its errand (a poke doesn't send it off course)
  if (options.voice) eggs.startVoice(sound.ctx);
  // a little surprise for anyone who tries to throw the jar away
  jar.onThrow = (at) => {
    if (time - (jar.toldAt ?? -99) < 20) return; jar.toldAt = time;
    effects.sparkle(at, 0xffe2b0, 14, 0.08);
    say('No littering\nin the enchanted forest 🙂', { hold: 3.2 });
  }; shelfLights = new ShelfLights(W, scene); eggs.shelfLights = shelfLights;
  // the magic mushroom pot only appears when the rain comes (it has nothing to do before then)
  potGroup = new THREE.Group(); scene.add(potGroup);
  for (const o of [W.magic.stump, W.byName.G_Shadow_SeedStump, W.magic.dust, ...(W.magic.stages || [])]) if (o) potGroup.attach(o);
  potGroup.visible = false;
  menu.softEdges = !!options.calm;
  menu.onSoftEdges = (on) => { setCalm(on); try { localStorage.setItem(OPT_KEY, JSON.stringify(options)); } catch {} };
  guides = new SoundGuides(sound, () => [
    ...touch.items.filter((it) => (it.kind === 'boop' || it.kind === 'dandelion') && !it.away && !it.blown).map((it) => ({ at: it.center, r: it.radius, hz: it.kind === 'boop' ? it.hz * 2 : 440 })),
    ...crystals.list.map((c) => ({ at: c.c, r: c.r, hz: c.hz })),
    ...pebbles.list.filter((p) => p.state === 'rest').map((p) => ({ at: p.o.position, r: 0.06, hz: 247 })),
  ]);
  outlines = new Outlines([...W.boops, ...W.crystals, ...W.pebbles, ...W.dandelions, ...W.puffs, W.stick].filter(Boolean)); // (not the glass jar: an outline would hide the lights inside)
  applyAccess();
  menu.volume = options.volume; menu.muted = !!options.muted;
  menu.getView = () => ({ pos: ahead(1.05, -0.04), quat: viewQuat() }); // a comfortable distance, not in your face
  menu.onMainMenu = toMainMenu; menu.onSwap = swapMode; menu.onRecenter = () => gentleRecenter(true);
  // the menu of things to do, on the top shelf of the white tree: the only place games are offered
  // the sleepy mushrooms game: little mushrooms on the ground in front of you that hum a tune to copy
  sleepy = new SleepyMushrooms(scene, W, sound, effects);
  sleepy.tools.push(() => (stick && stick.held ? stick.tip() : null));   // drum on the sleepy mushrooms with the stick
  sleepy.onFirst = () => say('Now tap them in the same order', { hold: 3 });
  // the Stop mushroom and the Stop firefly: touch either and that game ends, back to simply sitting in the forest
  sleepy.onStop = () => stopGame();
  flies.onStop = () => { if (phase.mode === 'fireflies') stopGame(); };
  input.addPicker((r) => sleepy.pick(r), { ui: true, handsOnly: true });
  things = new ThingsMenu(scene, W, sound, effects);
  things.onStart = playGame; things.onStop = stopGame;
  menu.onStop = stopGame; menu.onThings = () => things.show(eyeRay().origin);
  input.addPicker((r) => things.pick(r), { ui: true });
  menu.onVolume = (v, vol, muted) => { sound.setVolume(v); options.volume = vol; options.muted = muted; try { localStorage.setItem(OPT_KEY, JSON.stringify(options)); } catch {} };
  input.addPicker((r) => choice.pickRay(r), { ui: true }); // the lanterns come first: they float in front of the door
  input.addPicker((r) => menu.pick(r), { ui: true });
  input.addPicker((r) => (SKY(phase.mode) ? sky.pick(r) : null), { ui: true });
  input.addPicker((r) => flies.pick(r));
  input.addPicker((r) => pebbles.pick(r), { handsOnly: true });
  input.addPicker((r) => crystals.pick(r), { handsOnly: true });
  input.addPicker((r) => (potShown ? seed.pick(r) : null));
  input.addPicker((r) => rain.pick(r));
  input.addPicker((r) => touch.pick(r), { handsOnly: true });
  phase.firstNight = state.collection.length === 0 && state.nights === 1;
  seed.multiGrow = phase.firstNight; // first night: every watering grows it, so you keep a bloom on night one
  seed.onPlace = (at) => {
    captions.show('yours to keep', at.clone().add(new THREE.Vector3(0, 0.5, 0)), { width: 0.56, hold: 2.4 });
    if (phase.mode === 'fireflies' && phase.firstNight) tweens.add(0.1, () => {}, { delay: 3, done: goodnight });
  };
  seed.onGrow = onGrow;
  guide.fx = effects; guide.snd = sound;
  let neutral = null; const bloom = W.magic.stages[3]; if (bloom) bloom.traverse((m) => { if (m.isMesh && m.material.map) neutral = m.material.map; });
  touch.setPalette(seed.palette, neutral);
  flies.onMatch = onPairFound;
  flies.onMiss = () => { if (!state.memoryShown && !phase.saidMiss) { phase.saidMiss = true; say('Not the same colour\nThey fade back and wait', { hold: 2.6 }); } };
  flies.onAllDone = onAllPairs;
  flies.onPeek = (secs) => say(`Remember the colours\nYou have ${secs} seconds`, { hold: secs - 3 });
  flies.onPeekEnd = () => { if (state.memoryShown || JUST_SIT) say('Now find the pairs', { hold: 2.4 }); };
  sky.onCount = onSkyCount;
  sky.onTen = (n) => say(`${n} stars`, { width: 0.7, hold: 2 });
  sky.onShapeStart = (n) => { if (phase.shapesSeen++ > 0) say(`A new picture\n${n} stars this time`, { hold: 3 }); };
  sky.onIdle = () => { if (!JUST_SIT) say(phase.mode === 'count' ? 'Look at the star inside the ring\nand hold your gaze until it fills' : 'Look at the star inside the ring\nto draw the next line', { hold: 4 }); };
  sky.onShapeDone = onShapeDone;
  choice.onPick = (k) => (k === 'bed' ? goToBed() : k === 'snooze' ? snooze() : startMode(k));
  ui.status.textContent = newNight ? `Night ${state.nights}` : `Night ${state.nights}, again`;
  // Get every shader and texture ready on the GPU now, while the start screen is up, instead of the first time
  // each thing comes into view: otherwise turning round, a first splash or a first sparkle could stall the
  // headset for a moment (a jolt, or a black flash). Hidden things (the pot, the fairies, the games) included.
  ui.status.textContent = 'Waking the forest gently…';
  await new Promise((r) => setTimeout(r, 30));
  warmUp();
  ui.status.textContent = newNight ? `Night ${state.nights}` : `Night ${state.nights}, again`;
  const xrOK = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  loaded = { xr: !!xrOK }; ui.vr.textContent = xrOK ? 'Enter the forest' : 'Headset not found';
  updateEnter();
  world.registerSystem(GameSystem);
}

function begin() {
  readOptions(); applySeat();
  ui.overlay.classList.add('gone');
  sound.setVolume(options.muted ? 0 : options.volume);
  sound.start();
  if (options.voice && eggs) eggs.startVoice(sound.ctx);
  phase.name = 'arrival'; phase.t = 0;
  session.t = 0; session.len = (options.session || 10) * 60;
  waterfall.start();
  if (INTRO) {
    // asleep: no lights, no night sounds, only the waterfall; the first touch brings the butterfly
    phase.name = 'intro'; intro.start(); if (things.halo) things.halo.visible = false;
    session.len += 90;   // (the intro doesn't eat into your chosen time)
  } else { fairies.settle(); squirrels.settle(); }
  // a quiet arrival: no words at first, just the forest. The pot appears later, when the rain comes.
}

function readOptions() {
  const q = (id) => document.getElementById(id);
  if (q('opt-sit')) { options.sit = q('opt-sit').checked; options.bright = q('opt-bright').checked; options.calm = !!(q('opt-calm') && q('opt-calm').checked);
    for (const k of ['large', 'speak', 'guides', 'outlines', 'voice']) options[k] = !!(q('opt-' + k) && q('opt-' + k).checked); options.volume = +q('opt-volume').value; }
  const sel = document.querySelector('#session button.on'); if (sel) options.session = +sel.dataset.min;
  try { localStorage.setItem(OPT_KEY, JSON.stringify(options)); } catch {}
  JUST_SIT = options.sit;
  if (JUST_SIT) TUTORIAL = false;
  gaze.enabled = true; // looking always works (the door and the options need a long, deliberate look)
  setCalm(!!options.calm); applyAccess();
  if (flies) flies.big = options.bright;
  if (touch) touch.highlight = options.bright ? 0.35 : 0;
}
for (const [id, key] of [['opt-sit', 'sit'], ['opt-bright', 'bright'], ['opt-calm', 'calm'], ['opt-large', 'large'], ['opt-speak', 'speak'], ['opt-guides', 'guides'], ['opt-outlines', 'outlines'], ['opt-voice', 'voice']]) { const el = document.getElementById(id); if (el) el.checked = options[key]; }
{ const v = document.getElementById('opt-volume'); if (v) v.value = options.volume; }
// how long tonight's session lasts: 5, 10, 15 or 20 minutes (remembered)
for (const b of document.querySelectorAll('#session button')) {
  b.classList.toggle('on', +b.dataset.min === (options.session || 10));
  b.addEventListener('click', () => { for (const x of document.querySelectorAll('#session button')) x.classList.toggle('on', x === b); options.session = +b.dataset.min; try { localStorage.setItem(OPT_KEY, JSON.stringify(options)); } catch {} });
}

// where you are playing from: asked every time before you go in (a bed puts you down on the forest floor,
// a chair on a mossy stump with the forest floor on your room's floor), so everything is within reach
let loaded = null, seatApplied = null;
function updateEnter() {
  const ok = !!loaded && !!options.seatNow;
  ui.vr.disabled = !ok || !loaded.xr; ui.screen.disabled = !ok;
  const box = document.getElementById('seat'); if (box) box.classList.toggle('ask', !!loaded && !options.seatNow);
}
for (const b of document.querySelectorAll('#seat button')) b.addEventListener('click', () => {
  for (const x of document.querySelectorAll('#seat button')) x.classList.toggle('on', x === b);
  options.seatNow = b.dataset.seat; options.seat = b.dataset.seat; try { localStorage.setItem(OPT_KEY, JSON.stringify(options)); } catch {}
  updateEnter();
});
function applySeat() {
  const seat = options.seatNow || options.seat || 'bed'; setSeat(seat);
  if (!renderer.xr.isPresenting) camera.position.copy(EYE);
  if (seatApplied === seat) return; seatApplied = seat;
  // the pot's stump grows to sit beside a chair at hand height (and back down for the bed)
  const lift = seat === 'chair' ? 0.15 : 0, st = W && W.magic && W.magic.stump;
  if (potGroup && st) {
    const d = lift - (potGroup.userData.lift || 0); potGroup.userData.lift = lift;
    if (!st.userData.h) { const bb = new THREE.Box3().setFromObject(st); st.userData.h = Math.max(0.05, bb.max.y - bb.min.y); st.userData.sy = st.scale.y; st.userData.y = st.position.y; st.userData.base = bb.min.y; }
    potGroup.position.y += d;
    // keep the stump's foot on the ground while its top rises with the pot
    const k = (st.userData.h + lift) / st.userData.h; st.scale.y = st.userData.sy * k;
    st.position.y = st.userData.y; potGroup.updateMatrixWorld(true);
    const bb2 = new THREE.Box3().setFromObject(st); st.position.y += st.userData.base - bb2.min.y;
    const sh = W.byName.G_Shadow_SeedStump; if (sh) sh.position.y = (sh.userData.y ??= sh.position.y) - lift;
    if (seed && seed.target) seed.target.y += d;
  }
  if (sleepy && sleepy.setSeat) sleepy.setSeat(seat);
  // the mossy rocks within reach: taller beside a chair, with their crystals and bubble mushrooms lifted with them
  const k = seat === 'chair' ? 2.4 : 1.0;   // (rock tops at about 22 cm on the bed, 53 cm beside a chair)
  for (const r of W.reachRocks || []) {
    const top = r.userData.rock_top || 0.3, side = r.userData.side;
    if (r.userData.sy0 === undefined) r.userData.sy0 = r.scale.y;
    const lift = top * (k - 1) - (r.userData.lift || 0); r.userData.lift = top * (k - 1);
    r.scale.y = r.userData.sy0 * k;
    for (const o of [...(W.crystals || []), ...(W.bubbles || []), ...(W.pebbles || [])]) if (o.userData.on_rock === side) o.position.y += lift;
    if (pebbles) for (const p of pebbles.list) if (p.o.userData.on_rock === side) p.home.y += lift;   // where it goes back to rest
  }
  scene.updateMatrixWorld(true);
  if (touch && touch.refresh) touch.refresh();
  if (crystals && crystals.refresh) crystals.refresh();
}

// the little rock on the left stands where the sleepy mushrooms' mound rises: it sinks into the moss while that
// game is on (with its crystal and bubble mushroom) and comes back up afterwards
let nookSink = 0, nookWas = 0;
function sinkNook(dt) {
  const want = sleepy && sleepy.running ? 1 : 0;
  nookSink += (want - nookSink) * Math.min(1, dt * 1.6);
  if (Math.abs(nookSink - nookWas) < 1e-4) return;
  const d = (nookSink - nookWas) * -0.75; nookWas = nookSink;
  for (const r of W.reachRocks || []) {
    if (!r.userData.sink_for_sleepy) continue;
    r.position.y += d;
    for (const o of [...(W.crystals || []), ...(W.bubbles || [])]) if (o.userData.on_rock === r.userData.side) o.position.y += d;
    if (pebbles) for (const p of pebbles.list) if (p.o.userData.on_rock === r.userData.side) { p.home.y += d; if (p.state === 'rest') p.o.position.y += d; }
  }
  if (nookSink < 0.002 && want === 0) nookSink = 0;
  // (measure where everything is again, so nothing can be touched where it no longer is)
  scene.updateMatrixWorld(true); if (touch && touch.refresh) touch.refresh(); if (crystals && crystals.refresh) crystals.refresh();
}

// Looking at the pebbles on the white tree's shelf (to your left) for a moment shows, once a night, a quiet note that
// there are pebbles on your right too, by the pond: no turning from left to right to throw (easier on motion sickness)
let noteLook = 0, noteShown = 0, noteAt = -999;   // (it can show again a little later, up to three times a night)
// The fairy-light jar: hold it up in front of you and a line says what it is for (once a night)
let jarTold = false, jarLook = 0;
function jarHint(dt) {
  if (jarTold || !jar || !jar.o || !jar.held) { jarLook = 0; return; }
  const p = jar.o.getWorldPosition(new THREE.Vector3()), e = eyePos(), d = p.clone().sub(e), dist = d.length();
  const inFront = dist < 0.75 && d.normalize().dot(eyeRay().direction) > 0.75;
  jarLook = inFront ? jarLook + dt : 0;
  if (jarLook > 0.6) { jarTold = true; say('Pick the fairy lights around you\nand place them in the jar', { hold: 4.5, at: e.clone().add(p.clone().sub(e).normalize().multiplyScalar(0.95)).add(new THREE.Vector3(0, 0.16, 0)), width: 0.42 }); }   // a comfortable way beyond the jar, never close to your eyes
}
function pebbleNote(dt) {
  if (noteShown >= 3 || time - noteAt < 45 || !pebbles || phase.name === 'loading' || phase.name === 'intro' || (intro && intro.running)) return;
  const shelf = pebbles.list.filter((p) => !p.o.userData.on_rock);
  if (!shelf.length) return;
  const c = shelf.reduce((a, p) => a.add(p.home), new THREE.Vector3()).multiplyScalar(1 / shelf.length);
  const ray = eyeRay(); const near = ray.distanceToPoint(c) < 0.16 && ray.origin.distanceTo(c) < 1.6;
  noteLook = near ? noteLook + dt : Math.max(0, noteLook - dt * 2);
  if (noteLook > 1.0) {
    noteShown++; noteAt = time; noteLook = 0;
    { const e = eyePos(), toEye = e.clone().sub(c); toEye.y = 0; toEye.normalize();
      // just below the pebbles, on the shelf's brown wood (light words read clearly there), not too close to you
      say('If turning makes you feel queasy,\nthere are pebbles on your right too,\nnext to the pond', { hold: 5.5, at: c.clone().addScaledVector(toEye, 0.08).add(new THREE.Vector3(0, -0.13, 0)), width: 0.34 }); }
  }
}

ui.vr.addEventListener('click', async () => {
  try {
    // IWSDK starts the session (local floor, hand tracking); we carry on once it is running
    const started = new Promise((res, rej) => { renderer.xr.addEventListener('sessionstart', res, { once: true }); setTimeout(() => rej(new Error('no session')), 15000); });
    world.launchXR();
    await started;
    const session = renderer.xr.getSession();
    camera.position.set(0, 0, 0); xrFrames = 0; xrCentred = 0; desktop.enabled = false;
    session.addEventListener('end', () => { rig.position.set(0, 0, 0); camera.position.copy(EYE); desktop.enabled = true; });
    begin();
  } catch (e) { console.error(e); ui.status.textContent = 'Could not start VR on this device.'; }
});
ui.screen.addEventListener('click', () => { begin(); ui.hint.classList.add('show'); setTimeout(() => ui.hint.classList.remove('show'), 7000); });
if (ui.howto) ui.howto.addEventListener('click', () => { if (wake && !INTRO && !JUST_SIT) { INTRO = true; wake.patch(W.root); } TUTORIAL = true; state.memoryShown = false; ui.status.textContent = 'The butterfly will show you how'; ui.howto.disabled = true; });

// Put the player's head exactly at the seat, at seated eye height, whatever their real posture
// (sitting, or lying back for the stars).
let xrCentred = 0;
function eyesCentre(out) {
  // halfway between your two eyes. (Read straight from the eye cameras' world matrices, which the renderer sets
  // each frame: getWorldPosition() would recompute them without the player rig, as they have no parent.)
  const xc = renderer.xr.getCamera();
  if (xc.cameras && xc.cameras.length >= 2) { const a = new THREE.Vector3().setFromMatrixPosition(xc.cameras[0].matrixWorld), b = new THREE.Vector3().setFromMatrixPosition(xc.cameras[1].matrixWorld); return out.copy(a).add(b).multiplyScalar(0.5); }
  return xc.getWorldPosition(out);
}
// where your eyes are now (in the headset, or the screen camera)
function eyePos() { const v = new THREE.Vector3(); return renderer.xr.isPresenting ? eyesCentre(v) : camera.getWorldPosition(v); }
function headTracked() {
  const head = new THREE.Vector3(); eyesCentre(head);
  const y = head.y - rig.position.y;
  // a real head, sitting or standing, above the floor (after a couple of seconds take whatever the headset says,
  // so a headset whose floor is set wrong still puts you at the right height)
  return (y > 0.35 && y < 2.4) || xrFrames > 150;
}
function recenter() {
  const head = new THREE.Vector3(); eyesCentre(head);
  const local = head.clone().sub(rig.position);
  // on a chair the forest floor is your room's floor, so what you can reach in your room you can reach here
  // (unless the headset's floor looks wrong, then your eyes go to the usual chair height);
  // on a bed you sit on the forest floor, with your eyes 0.82 m above it
  const chair = (options.seatNow || options.seat) === 'chair';
  const y = chair && local.y > 0.95 && local.y < 1.5 ? 0 : EYE.y - local.y;
  rig.position.set(-local.x, clamp(y, -0.8, 1.1), -local.z);
}

// Where the player is looking right now, a comfortable reading distance away.
function ahead(dist = 1.25, up = 0.16) {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const o = new THREE.Vector3(), q = new THREE.Quaternion(); cam.getWorldPosition(o); cam.getWorldQuaternion(q);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const u = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  return o.addScaledVector(f, dist).addScaledVector(u, up);
}
// on-screen words, always placed where you are looking
// the line you are looking along (for choosing stars by looking, while lying back)
function eyeRay() { const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera; const o = new THREE.Vector3(); cam.getWorldPosition(o); return new THREE.Ray(o, new THREE.Vector3(0, 0, -1).applyQuaternion(viewQuat())); }
function viewQuat() { const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera; const q = new THREE.Quaternion(); cam.getWorldQuaternion(q); return q; }
function say(text, { width = 1.1, hold = 3.4, at = null } = {}) { return captions.show(text, at || (flies.active ? ahead(1.25, 0.42) : ahead()), { width, hold }); } // under the fireflies while they play

// ---------------------------------------------------------------- the night
function updatePhases(dt) {
  phase.t += dt;
  const P = phase.name;
  if (P === 'arrival') {
    if (phase.t > 1.0 && !guide.group.visible) { guide.appear(sleep.homeOf(sleep.order[0])); guide.goTo(atEye(-0.3, 0.95, -0.75), { speed: 0.9 }); }
    if (JUST_SIT) { if (phase.t > 3) startMode('fireflies'); return; }
    // the very first night, the butterfly quietly boops a mushroom to show they make music (no words)
    const b = touch.items.find((it) => it.kind === 'boop');
    if (TUTORIAL && phase.t > 3 && !phase.tapped && b && guide.mode !== 'tap') { phase.tapped = true; guide.tap(b.center, () => { b.flash = Math.max(b.flash, 0.6); sound.boop(b.center, b.hz); guide.goTo(atEye(-0.3, 0.95, -0.75), { speed: 0.9 }); }); }
    if (phase.t > (TUTORIAL ? 9 : 6)) greet();
  } else if (P === 'relax') {
    // just sitting in the forest: nothing asked of you. Near the end, the rain comes if your mushroom needs it
    if (remaining() < 80 && needsWater() && !phase.wrapping) { phase.wrapping = true; startRain(); }
    else if (remaining() < 25 && !phase.wrapping) goodnight();
  } else if (P === 'fireflies') {
    // the butterfly shows the first boop on a firefly, and again if nothing happens for a while
    // the butterfly shows the game once: it boops one firefly, then the one with the same colour
    const all = flies.list.length && flies.list.every((f) => f.state !== 'fly');
    const free = guide.mode === 'hover' || guide.mode === 'perch';
    if (JUST_SIT) { if (all && phase.t - (phase.autoPair ?? 0) > 7) { phase.autoPair = phase.t; flies.autoPair(); } }
    else if (all && flies.ready && free && !phase.shownOnce && !state.memoryShown) {
      const a = flies.waiting[0], b = a && flies.partnerOf(a);
      if (a && b) {
        phase.shownOnce = true; a.held = b.held = true;
        say('Boop two fireflies\nthat share a colour', { hold: 4 });
        guide.tap(a.g.position.clone(), () => {
          flies.boop(a);
          guide.tap(b.g.position.clone(), () => { flies.boop(b); state.memoryShown = true; saveState(state); guide.twirl(() => guide.goTo(atEye(-0.8, 0.72, -0.8), { orbit: 0.05, speed: 0.9 })); });
        });
      }
    }
  } else if (P === 'rain') {
    phase.rainT += dt;
    if (phase.tellPour === undefined && rain.held > 0.4) { phase.tellPour = true; say('Now tip your hands\nover the pot', { at: abovePot().add(new THREE.Vector3(0, 0.12, 0)), width: 0.84 }); }
    // the butterfly shows it too, if no one has caught any rain yet
    if (!phase.rainShown && phase.rainT > 10 && rain.held < 0.1 && needsWater()) { phase.rainShown = true; showRainDemo(); }
    {
      if (seed.grewThisSession && phase.wateredAt === undefined) phase.wateredAt = phase.rainT;
      const done = remaining() < 22 || (!phase.firstNight && seed.grewThisSession && phase.rainT > phase.wateredAt + (seed.state.stage === 3 ? 12 : 8));
      if (done) goodnight();
      if (needsWater() && phase.rainShown && guide.mode === 'perch' && phase.rainT - (phase.demoEnd ?? 0) > 25) { phase.rainShown = false; }
    }
  } else if (P === 'sleepy') {
    // near the end: the little mushrooms go back to sleep, then the rain if your mushroom needs it
    if (remaining() < 80 && !phase.wrapping && !keepPlaying()) {
      phase.wrapping = true; sleepy.stop(); say('The little mushrooms are asleep', { hold: 2.6 });
      tweens.add(0.1, () => {}, { delay: 3, done: () => { if (phase.name !== 'goodnight') { if (needsWater() && remaining() > 40) startRain(); else goodnight(); } } });
    }
  } else if (P === 'seek') {
    if (remaining() < 80 && !phase.wrapping && !keepPlaying()) {
      phase.wrapping = true; seek.stop(); say('Everything is tucked away again', { hold: 2.6 });
      tweens.add(0.1, () => {}, { delay: 3, done: () => { if (phase.name !== 'goodnight') { if (needsWater() && remaining() > 40) startRain(); else goodnight(); } } });
    }
  } else if (P === 'hoops') {
    if (remaining() < 80 && !phase.wrapping && !keepPlaying()) {
      phase.wrapping = true; hoops.stop(); say('The rings drift away', { hold: 2.6 });
      tweens.add(0.1, () => {}, { delay: 3, done: () => { if (phase.name !== 'goodnight') { if (needsWater() && remaining() > 40) startRain(); else goodnight(); } } });
    }
  } else if (P === 'sky') {
    if (JUST_SIT && phase.t > 8 && phase.t - (phase.autoStar ?? 0) > 5) { phase.autoStar = phase.t; sky.autoStep(); }
    // near the end: if your mushroom still needs water, the sky closes and the rain comes
    if (remaining() < 80 && !phase.wrapping && needsWater() && !keepPlaying()) wrapUpSky();
    else if (remaining() < 28 && !phase.wrapping && !keepPlaying()) { say('The sky is asleep', { hold: 3 }); sky.stop(); goodnight(); }
  }
  // the session: a gentle note near the end, then the night winds down in time
  if (P !== 'goodnight' && P !== 'loading') {
    if (remaining() < 62 && !session.warned && !phase.mode) { session.warned = true; say('One more minute', { hold: 2.4 }); }
    if (P === 'fireflies' && remaining() < 80 && !phase.wrapping && !keepPlaying()) wrapUpFireflies();
    if (P === 'choose' && remaining() < 30) goodnight();
    if (remaining() <= 0 && !keepPlaying()) goodnight();
  }
  if (rain) guide.rainLevel = rain.level;
}

// The butterfly says hello (one short line), then settles by the menu on the white tree and rests there
function greet() {
  if (phase.name === 'relax') return;
  phase.name = 'relax'; phase.t = 0; phase.wrapping = false; state.tutorialDone = true; saveState(state);
  say(state.nights <= 1 ? 'Welcome\nStay as long as you like' : 'Welcome back', { hold: 3.6 });
  if (eggs) eggs.lateWelcome();
  tweens.add(0.1, () => {}, { delay: 3.4, done: restGuide });
}
// the butterfly rests close by, a little in front and to the left at chest height, where you can reach out and boop it
function restGuide() { guide.goTo(atEye(-0.3, 0.7, -0.42), { orbit: 0.03, speed: 0.5 }); }

// From the menu: start a game (stopping whatever was going on), or stop it and go back to just sitting
function playGame(mode, opts = {}) {
  if (phase.name === 'goodnight') return;
  if (mode === 'fireflies') phase.flyCount = opts.count || phase.flyCount || 12;
  swapMode(mode);
  things.setMode(mode);
  if (!state.stopHintShown) { state.stopHintShown = true; saveState(state); tweens.add(0.1, () => {}, { delay: 9, done: () => { if (phase.mode === mode) say('To stop, open the menu again', { hold: 3.2 }); } }); }
}
function stopGame() {
  const m = phase.mode; if (!m || phase.name === 'goodnight') return;
  if (m === 'fireflies') { flies.dismiss(); sleep.quiet(1); touch.dimBoops(1); }
  if (m === 'sleepy') sleepy.stop();
  if (m === 'hoops') hoops.stop();
  if (m === 'seek') seek.stop();
  if (SKY(m)) { sky.stop(); const from = W.canopy.uniform.value; tweens.add(5, (k) => W.canopy.set(from * (1 - k))); tweens.add(0.1, () => {}, { delay: 4, done: () => gentleRecenter() }); }
  phase.mode = null; menu.mode = null; things.setMode(null); input.farHands = false;
  phase.name = 'relax'; phase.t = 0; phase.wrapping = false;
  restGuide();
}

function startMode(mode) {
  if (mode === 'stars') mode = 'count';
  const skyWasOpen = SKY(phase.mode);
  phase.mode = mode; phase.t = 0; phase.lastOutAt = 0; phase.shownOnce = false; phase.showing = false; phase.saidFlies = false; phase.wrapping = false;
  menu.mode = mode; if (things) things.setMode(mode);
  if (guide.mode === 'tap') guide.goTo(atEye(-0.42, 1.0, -0.7), { orbit: 0.06, speed: 0.9 }); // stop showing the boop
  if (mode === 'seek') {
    phase.name = 'seek'; input.farHands = false;
    state.tutorialDone = true; saveState(state);
    seek.alwaysHum = !!options.guides;
    seek.start(eyePos(), eyeRay().direction);
    tweens.add(0.1, () => {}, { delay: 5.2, done: () => { if (phase.mode === 'seek' && seek.found === 0) say('Look around. When you see it,\nrest your eyes on it', { hold: 3.6 }); } });
    guide.goTo(atEye(-0.42, 1.0, -0.7), { orbit: 0.06, speed: 0.9 });
    return;
  }
  if (mode === 'hoops') {
    phase.name = 'hoops'; input.farHands = false;
    state.tutorialDone = true; saveState(state);
    hoops.start(eyePos());
    say('Pick up a pebble\nand throw it through the ring', { hold: 4 });
    // the butterfly waits by the pebbles on your right, to show where they are
    const pr = pebbles.list.find((pb) => pb.o.userData.on_rock === 'R');
    if (pr) guide.goTo(pr.home.clone().add(new THREE.Vector3(0.05, 0.16, -0.05)), { orbit: 0.04, speed: 0.8 }); else guide.goTo(atEye(0.4, 0.95, -0.6), { orbit: 0.06, speed: 0.9 });
    tweens.add(0.1, () => {}, { delay: 9, done: () => { if (phase.mode === 'hoops') guide.goTo(atEye(-0.42, 1.0, -0.7), { orbit: 0.06, speed: 0.9 }); } });
    return;
  }
  if (mode === 'sleepy') {
    phase.name = 'sleepy'; input.farHands = false;
    state.tutorialDone = true; saveState(state);
    sleepy.start();
    say('Watch which ones wake up', { hold: 2.6 });
    guide.goTo(atEye(-0.42, 1.0, -0.7), { orbit: 0.06, speed: 0.9 });
    return;
  }
  if (mode === 'fireflies') {
    phase.name = 'fireflies';
    input.farHands = false;
    // the forest's own glow quiets down so the fireflies stand out clearly in front of you
    sleep.quiet(0.32); touch.dimBoops(1); // the musical mushrooms keep their full colour (the fireflies are solid and bright enough now)
    // levels: 5 pairs (10 fireflies) to start, two more pairs for every board you finish, for as long as the session lasts
    state.tutorialDone = true; saveState(state);
    startLevel();
  } else {
    phase.name = 'sky'; phase.slept = 0; phase.saidShape = false;
    input.farHands = true;
    state.tutorialDone = true; saveState(state);
    // the trees overhead part slowly and the sky opens up, full of stars
    if (!skyWasOpen) { const from = W.canopy.uniform.value; tweens.add(8, (k) => W.canopy.set(from + (1 - from) * k * k * (3 - 2 * k))); }
    sky.start(mode); phase.shapesSeen = 0;
    // clear, step by step directions while the sky opens (each line waits for the last)
    const steps = [['Lie back and look up', 3], ['Look at the star in the ring\nuntil it fills', 4]];
    if (JUST_SIT) steps.splice(1);
    let at = 0.5; for (const [text, hold] of steps) { tweens.add(0.1, () => {}, { delay: at, done: () => { if (phase.mode === mode) say(text, { hold }); } }); at += hold + 0.6; }

    // if you lie down, the forest follows: re-centre once you have settled
    for (const d of [4, 10]) tweens.add(0.1, () => {}, { delay: d, done: () => gentleRecenter() });
    guide.goTo(atEye(0.3, 1.6, -0.6), { orbit: 0.1, speed: 0.6 });
  }
}

function onPairFound() {
  // your first pair (after the butterfly's): a little twirl of joy
  if (flies.matched === 2 && !phase.praised) { phase.praised = true; if (guide.mode === 'hover') guide.twirl(() => guide.goTo(atEye(-0.8, 0.72, -0.8), { orbit: 0.05, speed: 0.9 })); }
  if (flies.pairs > 5 && flies.matched === flies.pairs - 1) say('One pair left', { hold: 2 });
}

// every pair found: the forest is asleep, and the rain comes
function onAllPairs() {
  // a new board of the same size you chose, for as long as you like
  if (phase.name !== 'fireflies' || phase.wrapping) return;
  if (remaining() < 100 && !keepPlaying()) { wrapUpFireflies(true); return; }
  say('Well remembered', { hold: 1.8 });
  tweens.add(0.1, () => {}, { delay: 3, done: () => { if (phase.name === 'fireflies' && !phase.wrapping) startLevel(); } });
}
// two more pairs each level up to 30 fireflies; after that the remembering time gets a little shorter
function memoryPairs(level = state.memoryLevel || 1) { return Math.min(15, 5 + 2 * (level - 1)); }
function memorizeTime(level = state.memoryLevel || 1) { return level <= 6 ? 10 : Math.max(5, 10 - (level - 6)); }
function startLevel() {
  // the size you chose on the menu: 12, 20 or 26 fireflies (with a little longer to remember the bigger ones)
  const n = phase.flyCount || 12, pairs = n / 2, look = n <= 12 ? 10 : n <= 20 ? 13 : 16;
  say(`${n} fireflies`, { width: 0.9, hold: 2.2 });
  tweens.add(0.1, () => {}, { delay: 2.6, done: () => { if (phase.name === 'fireflies' && !phase.wrapping) flies.startMemory(pairs, look); } });
}
// the session is nearly over: the fireflies drift home, then the rain (if your mushroom needs it) and goodnight
function wrapUpFireflies(finished = false) {
  phase.wrapping = true;
  flies.dismiss(); sleep.quiet(1); touch.dimBoops(1);
  say(finished ? 'Well remembered\nTime to rest now' : 'Time to rest now', { hold: 2.6 });
  tweens.add(0.1, () => {}, { delay: 3.5, done: () => { if (phase.name !== 'goodnight') { if (needsWater() && remaining() > 40) startRain(); else goodnight(); } } });
}
function wrapUpSky() {
  phase.wrapping = true;
  sky.stop();
  say('Time to sit up\nThe rain is coming for your mushroom', { hold: 4 });
  const from = W.canopy.uniform.value; tweens.add(6, (k) => W.canopy.set(from * (1 - k)));
  // sitting back up: seat the player again once they have had a moment
  tweens.add(0.1, () => {}, { delay: 4.5, done: () => gentleRecenter() });
  tweens.add(0.1, () => {}, { delay: 5, done: () => { if (phase.name !== 'goodnight') startRain(); } });
}

// Options: swap to the other activity at any time
function swapMode(mode) {
  if (phase.name === 'goodnight') return;
  if (choice.active) choice.hide();
  if (phase.mode === 'fireflies') { phase.wrapping = true; flies.dismiss(); sleep.quiet(1); touch.dimBoops(1); }
  if (phase.name === 'rain') rain.stop();
  if (phase.mode === 'sleepy') sleepy.stop();
  if (phase.mode === 'hoops') hoops.stop();
  if (phase.mode === 'seek') seek.stop();
  if (SKY(phase.mode) && !SKY(mode)) { sky.stop(); const from = W.canopy.uniform.value; tweens.add(5, (k) => W.canopy.set(from * (1 - k))); }
  startMode(mode);
}

// The door: back to the main menu (the start screen), from anywhere
function toMainMenu() {
  say('See you soon', { hold: 1.4 });
  sound.setAwake(0);
  setTimeout(() => {
    const s = renderer.xr.getSession && renderer.xr.getSession();
    const go = () => { location.href = location.pathname + (DEBUG ? '?debug=1' : ''); };
    if (s) s.end().then(go, go); else go();
  }, 1600);
}

// the pot grows up out of the moss beside you, with a little sparkle
function showPot(quiet = false) {
  if (potShown) { if (!quiet && !potToldRain) { potToldRain = true; say('Catch the rain in your cupped hands\nand tip it into the pot\nto grow your magic mushroom', { hold: 5 }); } return; }
  potShown = true; potGroup.visible = true; potToldRain = !quiet;
  const st = W.magic.stump; if (st) { const s0 = st.scale.clone(); st.scale.setScalar(0.001); tweens.add(1.6, (k) => st.scale.copy(s0).multiplyScalar(Math.max(0.001, 1 - Math.pow(1 - k, 3)))); }
  effects.sparkle(seed.target.clone(), 0xffe2a8, 40, 0.25); sound.grow(seed.target, false);
  if (!quiet) say('A little pot has appeared beside you\nCatch the rain in your cupped hands\nand tip it in to grow a magic mushroom', { hold: 5.5 });
  // a new seed sends up its first sprout soon after the pot appears, so something is growing from the first night
  if (seed.state.stage === 0) tweens.add(0.1, () => {}, { delay: 3, done: () => seed.sprout() });
}

function startRain() {
  // the game (if any) is over for tonight: the rain is the night's last gentle thing
  phase.mode = null; menu.mode = null; if (things) things.setMode(null);
  phase.name = 'rain'; phase.rainT = 0; phase.tellPour = undefined; phase.rainShown = false;
  showPot();
  rain.start(); seed.invite = true;
  sleep.order.forEach((gi, i) => tweens.add(0.1, () => {}, { delay: i * 0.4, done: () => sleep.putToSleep(gi) }));
  tweens.add(0.1, () => {}, { delay: 6.5, done: () => say('Cup your hands together\nto catch the rain', { hold: 4.5 }) });
  guide.perch(rimPoint());
}

function onGrow(stage) {
  if (phase.firstNight && stage === 3 && !phase.carryScheduled) { phase.carryScheduled = true; scheduleCarry(); }
  captions.show(GROW_WORDS[stage], abovePot(), { width: 0.62, hold: 4 });
  seed.invite = phase.firstNight && stage < 3;
  guide.goTo(seed.target.clone().add(new THREE.Vector3(0, 0.3, 0)), { orbit: 0.12, speed: 0.9 });
}

function goodnight() {
  if (phase.name === 'goodnight') return;
  if (sleepy && sleepy.running) sleepy.stop();
  phase.name = 'goodnight'; phase.t = 0;
  flies.dismiss(); sleep.order.forEach((gi, i) => tweens.add(0.1, () => {}, { delay: i * 0.6, done: () => sleep.putToSleep(gi) }));
  tweens.add(1, () => {}, { delay: 6, done: () => rain.stop() });
  tweens.add(8, (k) => { touch.dimBoops(1 - 0.65 * k); for (const c of seed.collection) for (const m of c.mats) m.emissiveIntensity = m.userData.baseEmissive * (1 - 0.55 * k); });
  sound.setAwake(0);
  seed.invite = false;
  // the butterfly says goodbye: it bows in front of you, then drifts up toward the moon with a trail of light
  const sky = EYE.clone().addScaledVector(W.moonDir || new THREE.Vector3(0, 0.9, -0.4), 22);
  const front = SKY(phase.mode) ? ahead(0.5, 0) : atEye(0.05, 0.82, -0.42);
  phase.nightDone = false;
  tweens.add(0.1, () => {}, { delay: 2, done: () => { if (guide.group.visible) guide.farewell(front, sky, nightComplete); else nightComplete(); } });
  tweens.add(0.1, () => {}, { delay: 18, done: () => { if (phase.name === 'goodnight') nightComplete(); } }); // never wait forever for the butterfly
}

// After the butterfly has gone, say clearly that the night is over.
// ...then a gentle choice: time for bed, or (up to twice a night) five more minutes
const MAX_SNOOZES = 2;
function nightComplete() {
  if (phase.nightDone) return; phase.nightDone = true;
  say('Goodnight', { width: 1.0, hold: 3 });
  tweens.add(0.1, () => {}, { delay: 5.5, done: () => {
    if (phase.name !== 'goodnight') return;
    const left = MAX_SNOOZES - (session.snoozes || 0);
    say(left > 0 ? 'Time for bed?' : 'Come back tomorrow night\nto see what grows', { hold: 3.2 });
    const opts = [{ key: 'bed', title: 'Time for bed', sub: 'end the night\nand rest well', color: 0xbfd2ff }];
    if (left > 0) opts.push({ key: 'snooze', title: '5 more minutes', sub: left === 1 ? 'one last little while' : 'stay a little longer', color: 0xffd9a8 });
    tweens.add(0.1, () => {}, { delay: 1.6, done: () => { if (phase.name === 'goodnight') choice.show(opts); } });
  } });
}

// Time for bed: a last soft goodnight, the forest fades to dark, and the headset leaves the forest
function goToBed() {
  say('Sleep well', { width: 1.0, hold: 2.4 });
  camera.add(veil); veil.visible = true; veil.material.opacity = 0;
  tweens.add(3, (k) => { veil.material.opacity = k; sound.setVolume(Math.max(0, (options.muted ? 0 : options.volume) * (1 - k))); }, { delay: 1.5, done: () => {
    const s = renderer.xr.getSession && renderer.xr.getSession();
    const go = () => { location.href = location.pathname + (DEBUG ? '?debug=1' : ''); };
    if (s) s.end().then(go, go); else go();
  } });
}

// Five more minutes: the forest wakes softly, the butterfly comes back, and you choose again
function snooze() {
  session.snoozes = (session.snoozes || 0) + 1;
  session.len = session.t + 300; session.warned = false;
  phase.mode = null; phase.wrapping = false;
  sleep.wakeAll(4); touch.dimBoops(1); sound.setAwake(1);
  if (W.canopy && W.canopy.uniform.value > 0.01) { const from = W.canopy.uniform.value; tweens.add(5, (k) => W.canopy.set(from * (1 - k))); sky.stop(); }
  for (const c of seed.collection) for (const m of c.mats) if (m.userData.baseEmissive !== undefined) m.emissiveIntensity = m.userData.baseEmissive;
  guide.appear(sleep.homeOf(sleep.order[0])); guide.goTo(atEye(-0.3, 0.95, -0.75), { speed: 0.9 });
  say(session.snoozes >= MAX_SNOOZES ? 'Five more minutes\n(the last little while tonight)' : 'Five more minutes', { hold: 2.6 });
  phase.name = 'snoozing'; tweens.add(0.1, () => {}, { delay: 3.2, done: () => { phase.name = 'relax'; phase.t = 0; phase.wrapping = false; restGuide(); } });
}

// the forest falls asleep bit by bit as the stars are counted, or the pictures made
function sleepNext() { const G = sleep.order.length; if (phase.slept < G) sleep.putToSleep(sleep.order[phase.slept++]); }
function onSkyCount(n) {
  if (n % 3 === 0) sleepNext();
  if (n === 1) guide.twirl(() => guide.goTo(atEye(0.3, 1.6, -0.6), { orbit: 0.1, speed: 0.6 }));
}
function onShapeDone(name, k) {
  say(name, { width: 0.8, hold: 3 });
  sleepNext(); sleepNext();
  if (k === 1) guide.twirl(() => guide.goTo(atEye(0.3, 1.6, -0.6), { orbit: 0.1, speed: 0.6 }));
}

// The night's length is a gentle guide, never a cut-off: while you are in the middle of a game, the time
// stretches (a couple of minutes at a time, up to ten more) and the night only winds down once you stop.
function keepPlaying() {
  if (!phase.mode || phase.wrapping || (session.over || 0) >= 600) return false;
  session.len += 120; session.over = (session.over || 0) + 120;
  if (!session.lateSaid) { session.lateSaid = true; say("It's getting late\nStop whenever you're ready", { hold: 3.4 }); }
  return true;
}

// every session ends with the rain for your mushroom, until it has fully grown
function needsWater() { return seed.state.stage < 3 && (phase.firstNight || !seed.grewThisSession); }

// The butterfly lifts the grown mushroom out of the pot and sets it in your little garden, at the edge of your space
// (to the sides, never under you or in the dirt in front of you); each new one gets its own spot.
const GARDEN = [112, -118, 128, -132, 100, -146, 140, -106];
function besideYou() { const n = seed.state.collection.length, a = THREE.MathUtils.degToRad(GARDEN[n % GARDEN.length]), r = 1.1 + 0.18 * Math.floor(n / GARDEN.length); return new THREE.Vector3(Math.sin(a) * r, 0, -Math.cos(a) * r); }
function carryBloom() {
  if (seed.state.stage !== 3 || seed.held || seed.desktopHeld) return;
  guide.carryMushroom(seed.stages[3], seed.bloomTop(), besideYou(), () => seed._place(seed.stages[3].position.clone()));
}
function scheduleCarry() { tweens.add(0.1, () => {}, { delay: 16, done: carryBloom }); }

function rimPoint() {
  const tgt = seed.target, toYou = new THREE.Vector3(-tgt.x, 0, -tgt.z).normalize();
  return tgt.clone().addScaledVector(toYou, 0.17).add(new THREE.Vector3(0, 0.025, 0));
}

// The butterfly holds its wings up like cupped hands until rain fills them, then pours it into the pot.
function showRainDemo() {
  const above = seed.target.clone().add(new THREE.Vector3(0, 0.13, 0));
  guide.fillRate = 0.9;
  guide.rainDemo(atEye(0.04, 0.76, -0.3), above, rimPoint(), () => {
    phase.demoEnd = phase.rainT;
    if (phase.firstNight && seed.state.stage === 0) seed.grow(); else seed.receiveWater(0);
  });
}

if (DEBUG) {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'g') flies.autoPair();
    if (e.key === 'r') startRain();
    if (e.key === 'w') seed.receiveWater(1);
    if (e.key === 'n') { state.wateredNight = null; saveState(state); }
    if (e.key === 's') sleep.order.forEach((gi) => sleep.putToSleep(gi));
    if (e.key === 'f') { choice.hide(); startMode('fireflies'); }
    if (e.key === 't') { choice.hide(); startMode('hoops'); }
    if (e.key === 'y') { choice.hide(); startMode('shapes'); }
  });
  window.__lo = () => ({ seek, squirrels, errors, intro, wake, fairies, waterfall, hoops, startMode, stopGame, world, recenter, EYE, rig, pond, shooting, eggs, airTrails, W, sleep, flies, touch, rain, seed, guide, gaze, phase, state, renderer, scene, camera, options, desktop, sky, choice, input, captions, menu, session, twirls, pebbles, crystals, dirt, mushThrow, potGroup, playfield, flutter, stick, jar, things, sleepy });
}

// Taking the headset off (or hiding the tab) pauses everything, sound included; putting it back resumes.
let paused = false;
function setPaused(p) { if (p === paused) return; paused = p; if (p) sound.pause(); else { sound.resume(); clock.getDelta(); } }
document.addEventListener('visibilitychange', () => setPaused(document.hidden));
renderer.xr.addEventListener('sessionstart', () => {
  const s = renderer.xr.getSession();
  s.addEventListener('visibilitychange', () => {
    setPaused(s.visibilityState !== 'visible');
    // back from the Meta menu (or the headset's own recentre): seat the player again once the head is tracked
    if (s.visibilityState === 'visible') reseat();
  });
  const ref = renderer.xr.getReferenceSpace();
  if (ref && ref.addEventListener) ref.addEventListener('reset', reseat);
});
function reseat() { xrCentred = 0; xrFrames = 0; }

// The Meta menu gesture (palm turned to face you, then a thumb-index pinch) belongs to the headset, not the game:
// a pinch that starts in that pose is ignored here, so it never picks, grabs or draws anything.
function guardSystemGesture() {
  if (!renderer.xr.isPresenting) return;
  const head = new THREE.Vector3(); eyesCentre(head);
  input.hands.forEach((h) => {
    if (!h.present) { h.system = false; h.sysBlock = false; return; }
    const to = head.clone().sub(h.palm), d = to.length(); to.normalize();
    h.system = h.palmNormal.dot(to) > (h.system ? 0.45 : 0.6) && d < 0.7 && h.palm.y > head.y - 0.5;
    if (h.pinchStarted && h.system) h.sysBlock = true;
    if (h.sysBlock) {
      if (!h.pinching) { h.sysBlock = false; h.pinchEnded = false; return; }
      h.pinching = false; h.pinchStarted = false; h.pinchEnded = false;
    }
  });
}

function warmUp() {
  const hidden = [], textures = new Set();
  scene.traverse((o) => {
    if (!o.visible) { hidden.push(o); o.visible = true; }
    if (o.material) for (const m of [].concat(o.material)) for (const k of ['map', 'emissiveMap', 'normalMap', 'alphaMap', 'roughnessMap', 'aoMap']) if (m[k] && m[k].isTexture) textures.add(m[k]);
  });
  try { renderer.compile(scene, camera); } catch (e) { console.warn('warm-up compile', e); }
  try { for (const t of textures) renderer.initTexture(t); } catch (e) { console.warn('warm-up textures', e); }
  for (const o of hidden) o.visible = false;
}

// A slip in one frame's game code must never cost a frame of picture (in the headset a skipped frame shows as
// black): the error is noted (shown with ?debug) and the forest carries on.
const errors = [];
function loop() {
  try { step(paused ? 0 : Math.min(clock.getDelta(), 0.05)); }
  catch (e) { if (errors.length < 20) { errors.push(String(e && e.stack || e).slice(0, 400)); console.error(e); if (DEBUG) say('Error: ' + String(e && e.message || e).slice(0, 80), { hold: 3 }); } }
}
if (DEBUG) window.__tick = (seconds, dt = 1 / 30) => { for (let i = 0; i < seconds / dt; i++) step(dt); };

function step(dt) {
  time += dt;
  // seat the player at seated eye height once the headset really knows where their head is
  // (in the first frames the head can read as being on the floor, which would lift the world's eyes a metre too high),
  // then once more a couple of seconds later, when they have settled
  if (renderer.xr.isPresenting) {
    xrFrames++;
    if (!xrCentred && xrFrames > 3 && headTracked()) { recenter(); xrCentred = performance.now(); }
    else if (xrCentred > 0 && performance.now() - xrCentred > 2500) { recenter(); xrCentred = -1; }
  }
  desktop.update();
  input.update(dt);
  guardSystemGesture();
  if (W && phase.name !== 'loading') {
    updatePhases(dt);
    flies.update(dt, time, input);
    touch.update(dt, input);
    rain.update(dt, input);
    if (potShown) seed.update(dt, input);
    sleep.update(dt);
    choice.update(dt, time, input);
    twirls.update(dt, input); guides.update(dt, input); pebbles.update(dt, input); pebbleNote(dt); mushThrow.update(dt, input); playfield.update(dt); flutter.update(dt, time); stick.update(dt, input); airTrails.update(dt); pond.update(time, rain ? rain.level : 0); eggs.update(dt, input); waterfall.update(dt, time, eyePos(), eyeRay().direction); fairies.update(dt, time, eyePos()); squirrels.update(dt, time, eyePos()); intro.update(dt);
    shooting.skyOpen = phase.mode === 'count' || phase.mode === 'shapes'; shooting.update(dt, eyePos(), eyeRay().direction); jar.update(dt, input, time); jarHint(dt); shelfLights.update(time); crystals.update(dt, input); dirt.update(dt, input);

    menu.update(dt, input);
    things.update(dt, input, time, eyeRay());
    hoops.update(dt, time); seek.update(dt, time, eyePos(), eyeRay().direction); sleepy.update(dt, input, time); dirt.enabled = !sleepy.running; sinkNook(dt);
    if (phase.name !== 'goodnight') session.t += dt;
    sky.ownDwell = !gaze.enabled;
    sky.update(dt, time, input, renderer.xr.isPresenting ? 1.8 : renderer.domElement.height / 900);
    if (phase.name !== 'goodnight' && sound.amb) sound.setAwake(1 - sleep.shown * 0.7);
  }
  if (W) {
    for (const m of shaderMats) m.uniforms.time.value = time;
    for (const o of W.dust) o.rotation.y += (o.userData.twirl_speed || 0.2) * (o.userData.twirlScale ?? 1) * MOTION * dt;
    for (const o of W.ribbons) o.rotation.y += (o.userData.twirl_speed || 0.15) * MOTION * dt;
    if (W.magic.dust) W.magic.dust.rotation.y += 0.2 * dt;
    const sp = W.dim.Spores; if (sp && sp.position) sp.position.y = Math.sin(time * 0.4) * 0.05;
  }
  guide.update(dt, time);
  gaze.update(dt);
  tweens.update(dt);
  effects.update(dt);
  sound.updateListener(camera);
  // (IWSDK draws the frame after its systems have run)
}

// ?fps: a small frame-rate readout low in your view (for checking it holds 60+ on the Quest; never shown otherwise)
const fpsMeter = (() => {
  if (!params.has('fps')) return null;
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  spr.scale.set(0.12, 0.03, 1); spr.position.set(0, -0.16, -0.6); spr.renderOrder = 1001; camera.add(spr);
  let frames = 0, t0 = performance.now(), low = 999;
  return () => {
    frames++; const now = performance.now();
    if (now - t0 < 1000) return;
    const fps = frames * 1000 / (now - t0); frames = 0; t0 = now; low = Math.min(low, fps);
    g.clearRect(0, 0, 256, 64); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = fps >= 59 ? '#8ff5d4' : fps >= 45 ? '#ffd88a' : '#ff9a9a'; g.font = '32px sans-serif'; g.textBaseline = 'middle';
    g.fillText(`${fps.toFixed(0)} fps  (low ${low.toFixed(0)})`, 12, 32); tex.needsUpdate = true;
  };
})();

// the whole game, run by IWSDK once a frame
const GameSystem = class extends createSystem({}) { update() { quietIwsdkInput(); loop(); if (fpsMeter) fpsMeter(); } };

init();
