// Lights Out: a seated, hands-first wind-down in a glowing night forest.
// Each night you choose (the butterfly and a few words show you how, the first time):
//   Fireflies  - a memory game that grows a level each night, then water your mushroom in the rain.
//   Stargazing - the trees part overhead under a sky full of stars: count the stars home, or join them into pictures.
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
import { SkyGames } from './skygames.js';
import { Twirls, Pebbles, Crystals, DirtDrawing, MushroomThrow, SoundGuides, Outlines } from './play.js';
import { Choice } from './choice.js';
import { Menu } from './menu.js';
import { tweens, clamp, glowTexture } from './util.js';
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
renderer.xr.setFoveation(0); // full, sharp vision; "Soft edges" in the options blurs the edges for comfort
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05040b);
scene.fog = new THREE.FogExp2(0x0b0816, 0.018);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 400);
const rig = new THREE.Group(); scene.add(rig); rig.add(camera);
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
function setSoftEdges(on) { if (on) camera.add(vignette); else camera.remove(vignette); vignette.visible = on; vignette.material.uniforms.strength.value = on ? 0.92 : 0; renderer.xr.setFoveation(on ? 1 : 0); }
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

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

let W, sleep, flies, touch, rain, seed, menu, twirls, pebbles, crystals, dirt, mushThrow, potGroup, potShown = false, guides, outlines;
// Calm motion (for people who get motion sick): darker soft edges, slower twirls, fewer sparkles, gentler rain, and no sudden jumps
function setCalm(on) {
  options.calm = on; setSoftEdges(on); MOTION = on ? 0.4 : 1;
  effects.motion = on ? 0.5 : 1; if (rain) rain.calm = on;
}
// re-centre the view; with Calm motion, behind a quick soft fade so nothing jumps
function gentleRecenter() {
  if (!renderer.xr.isPresenting) return;
  if (!options.calm) { recenter(); return; }
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
  rain = new Rain(scene, sound, effects, seed);
  menu = new Menu(scene, W, input, sound);
  twirls = new Twirls(W, sound, effects); pebbles = new Pebbles(W, sound, effects); crystals = new Crystals(W, sound, effects);
  dirt = new DirtDrawing(scene, W, sound, effects);
  mushThrow = new MushroomThrow(touch, W, sound, effects);
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
  outlines = new Outlines([...W.boops, ...W.crystals, ...W.pebbles, ...W.dandelions, ...W.puffs]);
  applyAccess();
  menu.volume = options.volume; menu.muted = !!options.muted;
  menu.getView = () => ({ pos: ahead(1.05, -0.04), quat: viewQuat() }); // a comfortable distance, not in your face
  menu.onMainMenu = toMainMenu; menu.onSwap = swapMode;
  menu.onVolume = (v, vol, muted) => { sound.setVolume(v); options.volume = vol; options.muted = muted; try { localStorage.setItem(OPT_KEY, JSON.stringify(options)); } catch {} };
  input.addPicker((r) => choice.pickRay(r), { ui: true }); // the lanterns come first: they float in front of the door
  input.addPicker((r) => menu.pick(r), { ui: true });
  input.addPicker((r) => (SKY(phase.mode) ? sky.pick(r) : null), { ui: true });
  input.addPicker((r) => flies.pick(r));
  input.addPicker((r) => pebbles.pick(r));
  input.addPicker((r) => crystals.pick(r));
  input.addPicker((r) => (potShown ? seed.pick(r) : null));
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
  sky.onCount = onSkyCount;
  sky.onTen = (n) => say(`${n} stars`, { width: 0.7, hold: 2 });
  sky.onShapeStart = (n) => { if (phase.shapesSeen++ > 0) say(`A new picture\n${n} stars this time`, { hold: 3 }); };
  sky.onIdle = () => { if (!JUST_SIT) say(phase.mode === 'count' ? 'Look at the star inside the ring\nand hold your gaze until it fills' : 'Look at the star inside the ring\nto draw the next line', { hold: 4 }); };
  sky.onShapeDone = onShapeDone;
  choice.onPick = (k) => (k === 'bed' ? goToBed() : k === 'snooze' ? snooze() : startMode(k));
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
  if (q('opt-sit')) { options.sit = q('opt-sit').checked; options.bright = q('opt-bright').checked; options.calm = !!(q('opt-calm') && q('opt-calm').checked);
    for (const k of ['large', 'speak', 'guides', 'outlines']) options[k] = !!(q('opt-' + k) && q('opt-' + k).checked); options.volume = +q('opt-volume').value; }
  const sel = document.querySelector('#session button.on'); if (sel) options.session = +sel.dataset.min;
  try { localStorage.setItem(OPT_KEY, JSON.stringify(options)); } catch {}
  JUST_SIT = options.sit;
  if (JUST_SIT) TUTORIAL = false;
  gaze.enabled = true; // looking always works (the door and the options need a long, deliberate look)
  setCalm(!!options.calm); applyAccess();
  if (flies) flies.big = options.bright;
  if (touch) touch.highlight = options.bright ? 0.35 : 0;
}
for (const [id, key] of [['opt-sit', 'sit'], ['opt-bright', 'bright'], ['opt-calm', 'calm'], ['opt-large', 'large'], ['opt-speak', 'speak'], ['opt-guides', 'guides'], ['opt-outlines', 'outlines']]) { const el = document.getElementById(id); if (el) el.checked = options[key]; }
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
    camera.position.set(0, 0, 0); xrFrames = 0; xrCentred = 0; desktop.enabled = false;
    session.addEventListener('end', () => { rig.position.set(0, 0, 0); camera.position.copy(EYE); desktop.enabled = true; });
    begin();
  } catch (e) { console.error(e); ui.status.textContent = 'Could not start VR on this device.'; }
});
ui.screen.addEventListener('click', () => { begin(); ui.hint.classList.add('show'); setTimeout(() => ui.hint.classList.remove('show'), 7000); });
if (ui.howto) ui.howto.addEventListener('click', () => { TUTORIAL = true; state.memoryShown = false; ui.status.textContent = 'The butterfly will show you how'; ui.howto.disabled = true; });

// Put the player's head exactly at the seat, at seated eye height, whatever their real posture
// (sitting, or lying back for the stars).
let xrCentred = 0;
function headTracked() {
  const head = new THREE.Vector3(); renderer.xr.getCamera().getWorldPosition(head);
  const y = head.y - rig.position.y;
  return y > 0.35 && y < 2.4; // a real head, sitting or standing, above the floor
}
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
// the line you are looking along (for choosing stars by looking, while lying back)
function eyeRay() { const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera; const o = new THREE.Vector3(); cam.getWorldPosition(o); return new THREE.Ray(o, new THREE.Vector3(0, 0, -1).applyQuaternion(viewQuat())); }
function viewQuat() { const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera; const q = new THREE.Quaternion(); cam.getWorldQuaternion(q); return q; }
function say(text, { width = 1.1, hold = 3.4, at = null } = {}) { return captions.show(text, at || (flies.active ? ahead(1.25, 0.42) : ahead()), { width, hold }); } // under the fireflies while they play

// ---------------------------------------------------------------- the night
function updatePhases(dt) {
  phase.t += dt;
  const P = phase.name;
  if (P === 'arrival') {
    if (phase.t > 1.0 && !guide.group.visible) { guide.appear(sleep.homeOf(sleep.order[0])); guide.goTo(new THREE.Vector3(-0.3, 0.95, -0.75), { speed: 0.9 }); }
    if (JUST_SIT) { if (phase.t > 3) startMode('fireflies'); return; }
    if (!TUTORIAL) { if (phase.t > 4) askChoice(); return; }
    // tutorial step 1: the butterfly boops a mushroom, the words say what to do
    const b = touch.items.find((it) => it.kind === 'boop');
    if (phase.t > 2.2 && touch.count === 0 && b && guide.mode !== 'tap') guide.tap(b.center, () => { b.flash = Math.max(b.flash, 0.6); sound.boop(b.center, b.hz); });
    if (phase.t > 2.6 && !phase.saidBoop) { phase.saidBoop = true; say('Boop the mushrooms\nEach one has its own note'); }
    if (touch.count > 0 && guide.mode === 'tap') guide.goTo(new THREE.Vector3(-0.35, 1.0, -0.8), { orbit: 0.08, speed: 0.9 });
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
          guide.tap(b.g.position.clone(), () => { flies.boop(b); state.memoryShown = true; saveState(state); guide.twirl(() => guide.goTo(new THREE.Vector3(-0.8, 0.72, -0.8), { orbit: 0.05, speed: 0.9 })); });
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
  } else if (P === 'sky') {
    if (JUST_SIT && phase.t > 8 && phase.t - (phase.autoStar ?? 0) > 5) { phase.autoStar = phase.t; sky.autoStep(); }
    // near the end: if your mushroom still needs water, the sky closes and the rain comes
    if (remaining() < 80 && !phase.wrapping && needsWater()) wrapUpSky();
    else if (remaining() < 28 && !phase.wrapping) { say('The sky is asleep', { hold: 3 }); sky.stop(); goodnight(); }
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
  guide.goTo(new THREE.Vector3(0, 1.3, -1.3), { orbit: 0.05, speed: 0.8 });
  say('What would you like tonight?\nPoint and pinch, or look at one', { hold: 3.2 });
  tweens.add(0.1, () => {}, { delay: 1.6, done: () => choice.show([
    { key: 'fireflies', title: 'Firefly memory', sub: 'find the matching colours\nand water your mushroom', color: 0xd8ff7a },
    { key: 'count', title: 'Counting stars', sub: 'lie back and count\nthe stars home', color: 0xbfd2ff },
    { key: 'shapes', title: 'Star pictures', sub: 'lie back and join\nthe stars together', color: 0xffd9a8 },
  ]) });
}

function startMode(mode) {
  if (mode === 'stars') mode = 'count';
  const skyWasOpen = SKY(phase.mode);
  phase.mode = mode; phase.t = 0; phase.lastOutAt = 0; phase.shownOnce = false; phase.showing = false; phase.saidFlies = false; phase.wrapping = false;
  menu.mode = mode;
  if (guide.mode === 'tap') guide.goTo(new THREE.Vector3(-0.42, 1.0, -0.7), { orbit: 0.06, speed: 0.9 }); // stop showing the boop
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
    const steps = mode === 'count' ? [
      ['Counting stars', 2.6], ['Lie back and look up\nat the sky', 3.4],
      ['One star at a time will glow\ninside a ring of light', 4], ['Look at it and hold your gaze\nuntil the ring fills', 4],
      ['Then count it in your head\nand wait for the next one', 4],
    ] : [
      ['Star pictures', 2.6], ['Lie back and look up\nat the sky', 3.4],
      ['Some faint stars hide a picture\nOne glows inside a ring of light', 4.4], ['Look at it and hold your gaze\nuntil the ring fills', 4],
      ['Each star you choose draws a line\nKeep going until the picture appears', 4.4],
    ];
    if (JUST_SIT) steps.splice(2);
    let at = 0.5; for (const [text, hold] of steps) { tweens.add(0.1, () => {}, { delay: at, done: () => { if (phase.mode === mode) say(text, { hold }); } }); at += hold + 0.6; }

    // if you lie down, the forest follows: re-centre once you have settled
    for (const d of [4, 10]) tweens.add(0.1, () => {}, { delay: d, done: () => gentleRecenter() });
    guide.goTo(new THREE.Vector3(0.3, 1.6, -0.6), { orbit: 0.1, speed: 0.6 });
  }
}

function onPairFound() {
  // your first pair (after the butterfly's): a little twirl of joy
  if (flies.matched === 2 && !phase.praised) { phase.praised = true; if (guide.mode === 'hover') guide.twirl(() => guide.goTo(new THREE.Vector3(-0.8, 0.72, -0.8), { orbit: 0.05, speed: 0.9 })); }
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
function showPot() {
  if (potShown) return; potShown = true; potGroup.visible = true;
  const st = W.magic.stump; if (st) { const s0 = st.scale.clone(); st.scale.setScalar(0.001); tweens.add(1.6, (k) => st.scale.copy(s0).multiplyScalar(Math.max(0.001, 1 - Math.pow(1 - k, 3)))); }
  effects.sparkle(seed.target.clone(), 0xffe2a8, 40, 0.25); sound.grow(seed.target, false);
  say('A little pot has appeared beside you\nCatch the rain in your cupped hands\nand tip it in to grow a magic mushroom', { hold: 5.5 });
}

function startRain() {
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
  phase.name = 'goodnight'; phase.t = 0;
  flies.dismiss(); sleep.order.forEach((gi, i) => tweens.add(0.1, () => {}, { delay: i * 0.6, done: () => sleep.putToSleep(gi) }));
  tweens.add(1, () => {}, { delay: 6, done: () => rain.stop() });
  tweens.add(8, (k) => { touch.dimBoops(1 - 0.65 * k); for (const c of seed.collection) for (const m of c.mats) m.emissiveIntensity = m.userData.baseEmissive * (1 - 0.55 * k); });
  sound.setAwake(0);
  seed.invite = false;
  // the butterfly says goodbye: it bows in front of you, then drifts up toward the moon with a trail of light
  const sky = EYE.clone().addScaledVector(W.moonDir || new THREE.Vector3(0, 0.9, -0.4), 22);
  const front = SKY(phase.mode) ? ahead(0.5, 0) : new THREE.Vector3(0.05, 0.82, -0.42);
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
  guide.appear(sleep.homeOf(sleep.order[0])); guide.goTo(new THREE.Vector3(-0.3, 0.95, -0.75), { speed: 0.9 });
  say(session.snoozes >= MAX_SNOOZES ? 'Five more minutes\n(the last little while tonight)' : 'Five more minutes', { hold: 2.6 });
  phase.name = 'snoozing'; tweens.add(0.1, () => {}, { delay: 3.2, done: () => { phase.name = 'idle'; askChoice(); } });
}

// the forest falls asleep bit by bit as the stars are counted, or the pictures made
function sleepNext() { const G = sleep.order.length; if (phase.slept < G) sleep.putToSleep(sleep.order[phase.slept++]); }
function onSkyCount(n) {
  if (n % 3 === 0) sleepNext();
  if (n === 1) guide.twirl(() => guide.goTo(new THREE.Vector3(0.3, 1.6, -0.6), { orbit: 0.1, speed: 0.6 }));
}
function onShapeDone(name, k) {
  say(name, { width: 0.8, hold: 3 });
  sleepNext(); sleepNext();
  if (k === 1) guide.twirl(() => guide.goTo(new THREE.Vector3(0.3, 1.6, -0.6), { orbit: 0.1, speed: 0.6 }));
}

// every session ends with the rain for your mushroom, until it has fully grown
function needsWater() { return seed.state.stage < 3 && (phase.firstNight || !seed.grewThisSession); }

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
  guide.rainDemo(new THREE.Vector3(0.04, 0.76, -0.3), above, rimPoint(), () => {
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
    if (e.key === 't') { choice.hide(); startMode('count'); }
    if (e.key === 'y') { choice.hide(); startMode('shapes'); }
  });
  window.__lo = () => ({ W, sleep, flies, touch, rain, seed, guide, gaze, phase, state, renderer, scene, camera, options, desktop, sky, choice, input, captions, menu, session, twirls, pebbles, crystals, dirt, mushThrow, potGroup });
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
  if (W && phase.name !== 'loading') {
    updatePhases(dt);
    flies.update(dt, time, input);
    touch.update(dt, input);
    rain.update(dt, input);
    if (potShown) seed.update(dt, input);
    sleep.update(dt);
    choice.update(dt, time, input);
    twirls.update(dt, input); guides.update(dt, input); pebbles.update(dt, input); mushThrow.update(dt, input); crystals.update(dt, input); dirt.update(dt, input);

    menu.update(dt, input);
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
  renderer.render(scene, camera);
}

init();
