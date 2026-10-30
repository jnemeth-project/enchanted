// Lights Out: a seated, hands-first wind-down in a glowing night forest.
// Each night you choose (the butterfly and a few words show you how, the first time):
//   Fireflies  - a memory game that grows a level each night, then water your mushroom in the rain.
//   Stargazing - the trees part overhead; lie back and put the stars to sleep one by one.
import * as THREE from 'three';
import { loadWorld, shaderMats, EYE } from './world.js';
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
import { Stars } from './stars.js';
import { Choice } from './choice.js';
import { Menu } from './menu.js';
import { tweens, clamp } from './util.js';
import { loadState, beginNight, saveState, wateredTonight, nightKey } from './save.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
// Options chosen on the start screen (remembered on this device)
const OPT_KEY = 'lightsout.options';
const options = (() => { try { return { look: false, sit: false, bright: false, volume: 0.8, ...JSON.parse(localStorage.getItem(OPT_KEY) || '{}') }; } catch { return { look: false, sit: false, bright: false, volume: 0.8 }; } })();
if (params.get('mode') === 'sit') options.sit = true;
if (params.has('look')) options.look = true;
let JUST_SIT = options.sit;

const ui = {
  overlay: document.getElementById('overlay'), bar: document.getElementById('bar'), status: document.getElementById('status'),
  vr: document.getElementById('enter-vr'), screen: document.getElementById('enter-screen'), hint: document.getElementById('hint'),
  howto: document.getElementById('how-to'),
};

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05040b);
scene.fog = new THREE.FogExp2(0x0b0816, 0.018);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 400);
const rig = new THREE.Group(); scene.add(rig); rig.add(camera);
camera.position.copy(EYE);
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

const sound = new Sound();
const effects = new Effects(scene);
const input = new Input(renderer, rig, camera);
const desktop = new DesktopControls(renderer.domElement, camera, input);
const guide = new Guide(scene);
const gaze = new Gaze(scene, renderer, camera, input);
const captions = new Captions(scene);
const choice = new Choice(scene, sound);
const stars = new Stars(scene, sound, EYE);
const GROW_WORDS = ['', 'it sprouts', 'it grows', 'it blooms'];
const abovePot = () => seed.target.clone().add(new THREE.Vector3(0, 0.42, 0));
const state = loadState();
const newNight = beginNight(state); saveState(state);
// First-time guidance (the butterfly's demonstrations and the words) shows on the very first visit,
// or whenever asked for (?tutorial=1, or "Show me how to play").
let TUTORIAL = !options.sit && (params.has('tutorial') || params.has('demo') || !state.tutorialDone);
if (params.has('tutorial') || params.has('demo')) state.memoryShown = false;

let W, sleep, flies, touch, rain, seed, menu;
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
  rain = new Rain(scene, sound, effects, seed);
  menu = new Menu(scene, W, input, sound);
  menu.volume = options.volume; menu.muted = !!options.muted;
  menu.getView = () => ({ pos: ahead(0.62, -0.02), quat: viewQuat() });
  menu.onMainMenu = toMainMenu; menu.onSwap = swapMode;
  menu.onVolume = (v, vol, muted) => { sound.setVolume(v); options.volume = vol; options.muted = muted; try { localStorage.setItem(OPT_KEY, JSON.stringify(options)); } catch {} };
  input.addPicker((r) => menu.pick(r), { ui: true });
  input.addPicker((r) => choice.pickRay(r), { ui: true });
  input.addPicker((r) => (phase.mode === 'stars' ? stars.pick(r) : null), { ui: true });
  input.addPicker((r) => flies.pick(r));
  input.addPicker((r) => seed.pick(r));
  input.addPicker((r) => rain.pick(r));
  input.addPicker((r) => touch.pick(r));
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
  stars.onOut = onStarOut;
  stars.onAllOut = onSkyAsleep;
  choice.onPick = startMode;
  ui.status.textContent = newNight ? `Night ${state.nights}` : `Night ${state.nights}, again`;
  const xrOK = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  ui.vr.disabled = !xrOK; ui.vr.textContent = xrOK ? 'Enter the forest' : 'Headset not found';
  ui.screen.disabled = false;
  renderer.setAnimationLoop(loop);
}

function begin() {
  readOptions();
  ui.overlay.classList.add('gone');
  sound.setVolume(options.muted ? 0 : options.volume);
  sound.start();
  phase.name = 'arrival'; phase.t = 0;
  session.t = 0; session.len = (options.session || 10) * 60;
  if (!TUTORIAL) tweens.add(0.1, () => {}, { delay: 1.2, done: () => say(`Night ${state.nights}`, { width: 1.2, hold: 2.6 }) });
}

function readOptions() {
  const q = (id) => document.getElementById(id);
  if (q('opt-look')) { options.look = q('opt-look').checked; options.sit = q('opt-sit').checked; options.bright = q('opt-bright').checked; options.volume = +q('opt-volume').value; }
  const sel = document.querySelector('#session button.on'); if (sel) options.session = +sel.dataset.min;
  try { localStorage.setItem(OPT_KEY, JSON.stringify(options)); } catch {}
  JUST_SIT = options.sit;
  if (JUST_SIT) TUTORIAL = false;
  gaze.enabled = options.look;
  if (flies) flies.big = options.bright;
  if (touch) touch.highlight = options.bright ? 0.35 : 0;
}
for (const [id, key] of [['opt-look', 'look'], ['opt-sit', 'sit'], ['opt-bright', 'bright']]) { const el = document.getElementById(id); if (el) el.checked = options[key]; }
{ const v = document.getElementById('opt-volume'); if (v) v.value = options.volume; }
// how long tonight's session lasts: 5, 10, 15 or 20 minutes (remembered)
for (const b of document.querySelectorAll('#session button')) {
  b.classList.toggle('on', +b.dataset.min === (options.session || 10));
  b.addEventListener('click', () => { for (const x of document.querySelectorAll('#session button')) x.classList.toggle('on', x === b); options.session = +b.dataset.min; try { localStorage.setItem(OPT_KEY, JSON.stringify(options)); } catch {} });
}

ui.vr.addEventListener('click', async () => {
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] });
    await renderer.xr.setSession(session);
    camera.position.set(0, 0, 0); xrFrames = 0; desktop.enabled = false;
    session.addEventListener('end', () => { rig.position.set(0, 0, 0); camera.position.copy(EYE); desktop.enabled = true; });
    begin();
  } catch (e) { console.error(e); ui.status.textContent = 'Could not start VR on this device.'; }
});
ui.screen.addEventListener('click', () => { begin(); ui.hint.classList.add('show'); setTimeout(() => ui.hint.classList.remove('show'), 7000); });
if (ui.howto) ui.howto.addEventListener('click', () => { TUTORIAL = true; state.memoryShown = false; ui.status.textContent = 'The butterfly will show you how'; ui.howto.disabled = true; });

// Put the player's head exactly at the seat, at seated eye height, whatever their real posture
// (sitting, or lying back for the stars).
function recenter() {
  const head = new THREE.Vector3(); renderer.xr.getCamera().getWorldPosition(head);
  const local = head.clone().sub(rig.position);
  rig.position.set(-local.x, clamp(EYE.y - local.y, -0.8, 1.1), -local.z);
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
function viewQuat() { const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera; const q = new THREE.Quaternion(); cam.getWorldQuaternion(q); return q; }
function say(text, { width = 1.1, hold = 3.4, at = null } = {}) { return captions.show(text, at || (flies.active ? ahead(1.25, -0.32) : ahead()), { width, hold }); } // under the fireflies while they play

// ---------------------------------------------------------------- the night
function updatePhases(dt) {
  phase.t += dt;
  const P = phase.name;
  if (P === 'arrival') {
    if (phase.t > 1.0 && !guide.group.visible) { guide.appear(sleep.homeOf(sleep.order[0])); guide.goTo(new THREE.Vector3(-0.3, 1.25, -0.75), { speed: 0.9 }); }
    if (JUST_SIT) { if (phase.t > 3) startMode('fireflies'); return; }
    if (!TUTORIAL) { if (phase.t > 4) askChoice(); return; }
    // tutorial step 1: the butterfly boops a mushroom, the words say what to do
    const b = touch.items.find((it) => it.kind === 'boop');
    if (phase.t > 2.2 && touch.count === 0 && b && guide.mode !== 'tap') guide.tap(b.center, () => { b.flash = Math.max(b.flash, 0.6); sound.boop(b.center, b.hz); });
    if (phase.t > 2.6 && !phase.saidBoop) { phase.saidBoop = true; say('Boop the mushrooms\nEach one has its own note'); }
    if (touch.count > 0 && guide.mode === 'tap') guide.goTo(new THREE.Vector3(-0.35, 1.3, -0.8), { orbit: 0.08, speed: 0.9 });
    if ((touch.count >= 2 && phase.t > 7) || phase.t > 14) askChoice();
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
          guide.tap(b.g.position.clone(), () => { flies.boop(b); state.memoryShown = true; saveState(state); guide.twirl(() => guide.goTo(new THREE.Vector3(-0.8, 1.02, -0.8), { orbit: 0.05, speed: 0.9 })); });
        });
      }
    }
  } else if (P === 'rain') {
    phase.rainT += dt;
    if (phase.tellPour === undefined && rain.held > 0.4) { phase.tellPour = true; say('Now tip your hands\nover the pot', { at: abovePot().add(new THREE.Vector3(0, 0.12, 0)), width: 0.84 }); }
    // the butterfly shows it too, if no one has caught any rain yet
    if (!phase.rainShown && phase.rainT > 10 && rain.held < 0.1 && needsWater()) { phase.rainShown = true; showRainDemo(); }
    {
      if (wateredTonight(state) && phase.wateredAt === undefined) phase.wateredAt = phase.rainT;
      const done = remaining() < 22 || (!phase.firstNight && wateredTonight(state) && phase.rainT > phase.wateredAt + (seed.state.stage === 3 ? 12 : 8));
      if (done) goodnight();
      if (needsWater() && phase.rainShown && guide.mode === 'perch' && phase.rainT - (phase.demoEnd ?? 0) > 25) { phase.rainShown = false; }
    }
  } else if (P === 'stars') {
    if (JUST_SIT && phase.t > 8 && stars.awake.length && phase.t - (phase.autoStar ?? 0) > 6) { phase.autoStar = phase.t; stars.putOut(stars.awake[0]); }
    if (remaining() < 28) { say('The sky is asleep', { hold: 3 }); goodnight(); }
  }
  // the session: a gentle note near the end, then the night winds down in time
  if (P !== 'goodnight' && P !== 'loading') {
    if (remaining() < 62 && !session.warned) { session.warned = true; say('One more minute', { hold: 2.4 }); }
    if (P === 'fireflies' && remaining() < 80 && !phase.wrapping) wrapUpFireflies();
    if (P === 'choose' && remaining() < 30) goodnight();
    if (remaining() <= 0) goodnight();
  }
  if (rain) guide.rainLevel = rain.level;
}

function askChoice() {
  if (phase.name === 'choose') return;
  phase.name = 'choose'; phase.t = 0;
  guide.goTo(new THREE.Vector3(0, 1.32, -0.62), { orbit: 0.05, speed: 0.8 });
  say('What would you like tonight?\nTouch one to choose', { hold: 3.2 });
  tweens.add(0.1, () => {}, { delay: 1.6, done: () => choice.show([
    { key: 'fireflies', title: 'Firefly memory', sub: 'find the matching colours\nand water your mushroom', color: 0xd8ff7a },
    { key: 'stars', title: 'Stargazing', sub: 'lie back and put\nthe stars to sleep', color: 0xbfd2ff },
  ]) });
}

function startMode(mode) {
  phase.mode = mode; phase.t = 0; phase.lastOutAt = 0; phase.shownOnce = false; phase.showing = false; phase.saidFlies = false; phase.wrapping = false;
  menu.mode = mode;
  if (guide.mode === 'tap') guide.goTo(new THREE.Vector3(-0.42, 1.3, -0.7), { orbit: 0.06, speed: 0.9 }); // stop showing the boop
  if (mode === 'fireflies') {
    phase.name = 'fireflies';
    input.farHands = false;
    // the forest's own glow quiets down so the fireflies stand out clearly in front of you
    sleep.quiet(0.32); touch.dimBoops(0.55);
    // levels: 5 pairs (10 fireflies) to start, two more pairs for every board you finish, for as long as the session lasts
    state.tutorialDone = true; saveState(state);
    startLevel();
  } else {
    phase.name = 'stars';
    input.farHands = true;
    state.tutorialDone = true; saveState(state);
    // the trees overhead part slowly and the sky opens up
    tweens.add(8, (k) => W.canopy.set(k * k * (3 - 2 * k)));
    tweens.add(0.1, () => {}, { delay: 2.5, done: () => stars.start() });
    say('Lie back and enjoy', { hold: 3.2 });
    tweens.add(0.1, () => {}, { delay: 6.5, done: () => { if (!JUST_SIT) say('Point at a star\nand pinch to put it to sleep', { hold: 4 }); } });
    // if you lie down, the forest follows: re-centre once you have settled
    for (const d of [4, 10]) tweens.add(0.1, () => {}, { delay: d, done: () => { if (renderer.xr.isPresenting) recenter(); } });
    guide.goTo(new THREE.Vector3(0.3, 1.9, -0.6), { orbit: 0.1, speed: 0.6 });
  }
}

function onPairFound() {
  // your first pair (after the butterfly's): a little twirl of joy
  if (flies.matched === 2 && !phase.praised) { phase.praised = true; if (guide.mode === 'hover') guide.twirl(() => guide.goTo(new THREE.Vector3(-0.8, 1.02, -0.8), { orbit: 0.05, speed: 0.9 })); }
  if (flies.pairs > 5 && flies.matched === flies.pairs - 1) say('One pair left', { hold: 2 });
}

// every pair found: the forest is asleep, and the rain comes
function onAllPairs() {
  // level up, every board: no limit, as far as you can go within the session
  state.memoryLevel = (state.memoryLevel || 1) + 1; saveState(state);
  if (phase.name !== 'fireflies' || phase.wrapping) return;
  if (remaining() < 100) { wrapUpFireflies(true); return; }
  say('Well remembered', { hold: 1.8 });
  tweens.add(0.1, () => {}, { delay: 3, done: () => { if (phase.name === 'fireflies' && !phase.wrapping) startLevel(); } });
}
// two more pairs each level up to 30 fireflies; after that the remembering time gets a little shorter
function memoryPairs(level = state.memoryLevel || 1) { return Math.min(15, 5 + 2 * (level - 1)); }
function memorizeTime(level = state.memoryLevel || 1) { return level <= 6 ? 10 : Math.max(5, 10 - (level - 6)); }
function startLevel() {
  const level = state.memoryLevel || 1, pairs = memoryPairs(level);
  say(`Level ${level}\n${pairs * 2} fireflies`, { width: 0.9, hold: 2.2 });
  tweens.add(0.1, () => {}, { delay: 2.6, done: () => { if (phase.name === 'fireflies' && !phase.wrapping) flies.startMemory(pairs, memorizeTime(level)); } });
}
// the session is nearly over: the fireflies drift home, then the rain (if your mushroom needs it) and goodnight
function wrapUpFireflies(finished = false) {
  phase.wrapping = true;
  flies.dismiss(); sleep.quiet(1); touch.dimBoops(1);
  say(finished ? 'Well remembered\nTime to rest now' : 'Time to rest now', { hold: 2.6 });
  tweens.add(0.1, () => {}, { delay: 3.5, done: () => { if (phase.name !== 'goodnight') { if (needsWater() && remaining() > 40) startRain(); else goodnight(); } } });
}
function onSkyAsleep() {
  if (remaining() > 70) {
    // still time: a new sky of stars wakes up
    tweens.add(0.1, () => {}, { delay: 2.5, done: () => { say('More stars are waking', { hold: 2.4 }); stars.wake(true); } });
  } else tweens.add(0.1, () => {}, { delay: 2.5, done: () => { say('The sky is asleep', { hold: 3 }); tweens.add(0.1, () => {}, { delay: 4, done: goodnight }); } });
}

// Options: swap to the other activity at any time
function swapMode(mode) {
  if (phase.name === 'goodnight') return;
  if (choice.active) choice.hide();
  if (phase.mode === 'fireflies') { phase.wrapping = true; flies.dismiss(); sleep.quiet(1); touch.dimBoops(1); }
  if (phase.name === 'rain') rain.stop();
  if (phase.mode === 'stars') { stars.stop(); const from = W.canopy.uniform.value; tweens.add(5, (k) => W.canopy.set(from * (1 - k))); }
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

function startRain() {
  phase.name = 'rain'; phase.rainT = 0; phase.tellPour = undefined; phase.rainShown = false;
  rain.start(); seed.invite = true;
  sleep.order.forEach((gi, i) => tweens.add(0.1, () => {}, { delay: i * 0.4, done: () => sleep.putToSleep(gi) }));
  tweens.add(0.1, () => {}, { delay: 1.5, done: () => say('Cup your hands together\nto catch the rain', { hold: 4.5 }) });
  guide.perch(rimPoint());
}

function onGrow(stage) {
  if (phase.firstNight && stage === 3 && !phase.carryScheduled) { phase.carryScheduled = true; scheduleCarry(); }
  captions.show(GROW_WORDS[stage], abovePot(), { width: 0.52 });
  seed.invite = phase.firstNight && stage < 3;
  guide.goTo(seed.target.clone().add(new THREE.Vector3(0, 0.3, 0)), { orbit: 0.12, speed: 0.9 });
}

function goodnight() {
  if (phase.name === 'goodnight') return;
  phase.name = 'goodnight'; phase.t = 0;
  flies.dismiss(); sleep.order.forEach((gi, i) => tweens.add(0.1, () => {}, { delay: i * 0.6, done: () => sleep.putToSleep(gi) }));
  tweens.add(1, () => {}, { delay: 6, done: () => rain.stop() });
  tweens.add(8, (k) => { touch.dimBoops(1 - 0.65 * k); for (const c of seed.collection) for (const m of c.mats) m.emissiveIntensity = m.userData.baseEmissive * (1 - 0.55 * k); });
  sound.setAwake(0);
  seed.invite = false;
  // the butterfly says goodbye: it bows in front of you, then drifts up toward the moon with a trail of light
  const sky = EYE.clone().addScaledVector(W.moonDir || new THREE.Vector3(0, 0.9, -0.4), 22);
  const front = phase.mode === 'stars' ? ahead(0.5, 0) : new THREE.Vector3(0.05, 1.12, -0.42);
  tweens.add(0.1, () => {}, { delay: 2, done: () => guide.farewell(front, sky, nightComplete) });
}

// After the butterfly has gone, say clearly that the night is over.
function nightComplete() {
  say('Goodnight', { width: 1.0, hold: 3 });
  tweens.add(0.1, () => {}, { delay: 14, done: () => say('The little door in the tree\ntakes you back to the main menu', { hold: 4.5 }) });
  tweens.add(0.1, () => {}, { delay: 6, done: () => say('Come back tomorrow night\nto see what grows', { hold: 4.5 }) });
}

function onStarOut() {
  // each star that sleeps tucks in part of the forest and dims the sky a little
  const i = stars.out - 1, G = sleep.order.length;
  const gi = sleep.order[Math.min(G - 1, Math.floor(i * G / stars.total))];
  sleep.putToSleep(gi);
  if (W.sky && W.moonLevel) { const k = 1 - 0.55 * (stars.out / stars.total); W.sky.traverse((m) => { if (m.isMesh) m.material.color.setScalar(5.5 * W.moonLevel.stars * k); }); }
  if (stars.out === 1) guide.twirl(() => guide.goTo(new THREE.Vector3(0.3, 1.9, -0.6), { orbit: 0.1, speed: 0.6 }));
}

function needsWater() { return phase.firstNight ? seed.state.stage < 3 : !wateredTonight(state); }

// The butterfly lifts the grown mushroom out of the pot and sets it on the moss beside you.
const BESIDE_YOU = new THREE.Vector3(-0.35, 0, -0.32);
function carryBloom() {
  if (seed.state.stage !== 3 || seed.held || seed.desktopHeld) return;
  guide.carryMushroom(seed.stages[3], seed.bloomTop(), BESIDE_YOU, () => seed._place(seed.stages[3].position.clone()));
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
  guide.rainDemo(new THREE.Vector3(0.04, 1.06, -0.3), above, rimPoint(), () => {
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
    if (e.key === 't') { choice.hide(); startMode('stars'); }
  });
  window.__lo = () => ({ W, sleep, flies, touch, rain, seed, guide, gaze, phase, state, renderer, scene, camera, options, desktop, stars, choice, input, captions, menu, session });
}

// Taking the headset off (or hiding the tab) pauses everything, sound included; putting it back resumes.
let paused = false;
function setPaused(p) { if (p === paused) return; paused = p; if (p) sound.pause(); else { sound.resume(); clock.getDelta(); } }
document.addEventListener('visibilitychange', () => setPaused(document.hidden));
renderer.xr.addEventListener('sessionstart', () => {
  const s = renderer.xr.getSession();
  s.addEventListener('visibilitychange', () => setPaused(s.visibilityState !== 'visible'));
});

function loop() { step(paused ? 0 : Math.min(clock.getDelta(), 0.05)); }
if (DEBUG) window.__tick = (seconds, dt = 1 / 30) => { for (let i = 0; i < seconds / dt; i++) step(dt); };

function step(dt) {
  time += dt;
  if (renderer.xr.isPresenting) { xrFrames++; if (xrFrames === 4) recenter(); }
  desktop.update();
  input.update(dt);
  if (W && phase.name !== 'loading') {
    updatePhases(dt);
    flies.update(dt, time, input);
    touch.update(dt, input);
    rain.update(dt, input);
    seed.update(dt, input);
    sleep.update(dt);
    choice.update(dt, time, input);
    menu.update(dt, input);
    if (phase.name !== 'goodnight') session.t += dt;
    stars.update(dt, time, input);
    if (phase.name !== 'goodnight' && sound.amb) sound.setAwake(1 - sleep.shown * 0.7);
  }
  if (W) {
    for (const m of shaderMats) m.uniforms.time.value = time;
    for (const o of W.dust) o.rotation.y += (o.userData.twirl_speed || 0.2) * (o.userData.twirlScale ?? 1) * dt;
    for (const o of W.ribbons) o.rotation.y += (o.userData.twirl_speed || 0.15) * dt;
    if (W.magic.dust) W.magic.dust.rotation.y += 0.2 * dt;
    const sp = W.dim.Spores; if (sp && sp.position) sp.position.y = Math.sin(time * 0.4) * 0.05;
  }
  guide.update(dt, time);
  gaze.update(dt);
  tweens.update(dt);
  effects.update(dt);
  sound.updateListener(camera);
  renderer.render(scene, camera);
}

init();
