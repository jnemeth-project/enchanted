// Lights Out: a seated, hands-only wind-down in a glowing night forest.
// Night flow: arrival -> tucking the forest in with glowdrops -> rain and watering -> goodnight.
import * as THREE from 'three';
import { loadWorld, shaderMats, EYE } from './world.js';
import { Input, DesktopControls } from './input.js';
import { Sound } from './audio.js';
import { Effects } from './effects.js';
import { Sleep } from './sleep.js';
import { Glowdrops } from './glowdrops.js';
import { Touch } from './touch.js';
import { Rain } from './rain.js';
import { Seed } from './seed.js';
import { Guide } from './guide.js';
import { Gaze } from './gaze.js';
import { Captions } from './captions.js';
import { tweens, clamp, worldSphere } from './util.js';
import { loadState, beginNight, saveState, wateredTonight } from './save.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
// Options chosen on the start screen (remembered on this device)
const OPT_KEY = 'lightsout.options';
const options = (() => { try { return { look: false, sit: false, bright: false, volume: 0.8, ...JSON.parse(localStorage.getItem(OPT_KEY) || '{}') }; } catch { return { look: false, sit: false, bright: false, volume: 0.8 }; } })();
if (params.get('mode') === 'sit') options.sit = true;
if (params.has('look')) options.look = true;
let JUST_SIT = options.sit;
const DEMO = params.has('demo'); // jumps straight to a glowdrop with the butterfly, looking at it

const ui = {
  overlay: document.getElementById('overlay'), bar: document.getElementById('bar'), status: document.getElementById('status'),
  vr: document.getElementById('enter-vr'), screen: document.getElementById('enter-screen'), hint: document.getElementById('hint'),
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
const GROW_WORDS = ['', 'it sprouts', 'it grows', 'it blooms'];
const abovePot = () => seed.target.clone().add(new THREE.Vector3(0, 0.42, 0));
const state = loadState();
const newNight = beginNight(state); saveState(state);

let W, sleep, drops, touch, rain, seed;
const phase = { name: 'loading', t: 0, rainT: 0 };
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
  drops = new Glowdrops(scene, sleep, sound, effects, rig);
  rain = new Rain(scene, sound, effects, seed);
  input.addPicker((r) => drops.pick(r));
  input.addPicker((r) => seed.pick(r));
  input.addPicker((r) => rain.pick(r));
  input.addPicker((r) => touch.pick(r));
  // First night ever: every watering grows the mushroom, so you see it bloom and keep it on night one.
  phase.firstNight = !DEMO && state.collection.length === 0 && state.nights === 1;
  seed.multiGrow = phase.firstNight;
  seed.onPlace = (at) => {
    captions.show('yours to keep', at.clone().add(new THREE.Vector3(0, 0.5, 0)), { width: 0.28, hold: 2.4 });
    if (!DEMO && phase.firstNight) tweens.add(0.1, () => {}, { delay: 3, done: goodnight });
  };
  seed.onGrow = (stage) => { if (!DEMO && phase.firstNight && stage === 3 && !phase.carryScheduled) { phase.carryScheduled = true; scheduleCarry(); }
    if (!DEMO) captions.show(GROW_WORDS[stage], abovePot(), { width: 0.26 });
    seed.invite = phase.firstNight && stage < 3; guide.goTo(seed.target.clone().add(new THREE.Vector3(0, 0.3, 0)), { orbit: 0.12, speed: 0.9 }); };
  guide.fx = effects; guide.snd = sound;
  let neutral = null; const bloom = W.magic.stages[3]; if (bloom) bloom.traverse((m) => { if (m.isMesh && m.material.map) neutral = m.material.map; });
  touch.setPalette(seed.palette, neutral);
  drops.onSquish = (d) => {
    if (phase.name === 'arrival') phase.name = 'tuck';
    if (drops.squished > 2 && guide.clapTarget !== d.mesh) return;
    // the butterfly celebrates the first two squishes with a quick twirl, then goes to rest on the stump
    if (drops.squished === 2) phase.secondSquishAt = phase.t;
    if (drops.squished <= 2) guide.twirl(() => { if (drops.squished >= 2) guide.perch(rimPoint()); else guide.goTo(new THREE.Vector3(-0.3, 1.25, -0.6), { speed: 0.8 }); });
    else guide.perch(rimPoint());
  };
  ui.status.textContent = newNight ? `Night ${state.nights}` : `Night ${state.nights}, again`;
  const xrOK = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  ui.vr.disabled = !xrOK; ui.vr.textContent = xrOK ? 'Enter the forest' : 'Headset not found';
  ui.screen.disabled = false;
  renderer.setAnimationLoop(loop);
  if (DEMO) {
    begin(); ui.hint.classList.add('show');
    touch.count = 1; phase.t = 41; drops.fast = true; seed.demo = true; state.stage = 0; seed.show(0, false);
    // the demo always starts with an empty pot and no saved mushrooms around you
    for (const c of seed.collection) { scene.remove(c.o); touch.removeObject(c.o); }
    seed.collection = []; state.collection = [];
    desktop.yaw = 0.15; desktop.pitch = -0.32;
  }
}

function begin() {
  readOptions();
  ui.overlay.classList.add('gone');
  sound.setVolume(options.volume);
  sound.start();
  phase.name = 'arrival'; phase.t = 0;
  if (!DEMO) tweens.add(0.1, () => {}, { delay: 1.2, done: () => captions.show(`Night ${state.nights}`, new THREE.Vector3(0, 1.38, -1.7), { width: 0.6, hold: 3.2 }) });
}

function readOptions() {
  const q = (id) => document.getElementById(id);
  if (q('opt-look')) { options.look = q('opt-look').checked; options.sit = q('opt-sit').checked; options.bright = q('opt-bright').checked; options.volume = +q('opt-volume').value; }
  try { localStorage.setItem(OPT_KEY, JSON.stringify(options)); } catch {}
  JUST_SIT = options.sit;
  gaze.enabled = options.look;
  if (drops) drops.big = options.bright;
  if (touch) touch.highlight = options.bright ? 0.35 : 0;
}
for (const [id, key] of [['opt-look', 'look'], ['opt-sit', 'sit'], ['opt-bright', 'bright']]) { const el = document.getElementById(id); if (el) el.checked = options[key]; }
{ const v = document.getElementById('opt-volume'); if (v) v.value = options.volume; }

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

// Put the player's head exactly at the seat, at seated eye height, whatever their real posture.
function recenter() {
  const head = new THREE.Vector3(); renderer.xr.getCamera().getWorldPosition(head);
  const local = head.clone().sub(rig.position);
  rig.position.set(-local.x, clamp(EYE.y - local.y, -0.8, 0.9), -local.z);
}

function updatePhases(dt) {
  phase.t += dt;
  const P = phase.name;
  if (P === 'arrival') {
    const b = touch.items.find((it) => it.kind === 'boop');
    if (phase.t > 1.5 && !guide.group.visible) { guide.appear(sleep.homeOf(sleep.order[0])); guide.goTo(new THREE.Vector3(-0.3, 1.25, -0.75), { speed: 0.7 }); }
    // the butterfly lands on the nearest mushroom and dips onto it; each dip makes it glow, as a boop would
    if (phase.t > 7 && touch.count === 0 && b && guide.mode !== 'tap') guide.tap(b.center, () => { b.flash = Math.max(b.flash, 0.6); });
    if (touch.count > 0 && guide.mode === 'tap') guide.goTo(new THREE.Vector3(-0.35, 1.3, -0.8), { orbit: 0.08, speed: 0.8 });
    const ready = (phase.t > 20 && touch.count > 0) || phase.t > 40;
    if (ready) startTuck();
  } else if (P === 'tuck') {
    // the butterfly closes its wings around a waiting glowdrop: squeeze it like that
    const w = drops.waiting[0];
    const free = guide.mode === 'hover' || guide.mode === 'perch';
    if (w && free && (drops.squished < 2 || w.wait > 25) && guide.clapTarget !== w.mesh) guide.clap(w.mesh);
    const ct = guide.clapTarget;
    if (ct && !drops.drops.some((d) => d.mesh === ct && d.state === 'wait')) guide.perch(rimPoint());
    if (DEMO && !rain.target && drops.squished >= 2 && phase.t > (phase.secondSquishAt ?? 1e9) + 2.5) startRain();
    if (!rain.target && (sleep.asleepCount >= sleep.groups.length - 2 || drops.done)) startRain();
    if (sleep.allAsleep()) { phase.name = 'rain'; phase.t = 0; }
  }
  if (rain && rain.target) phase.rainT += dt;
  if (rain) guide.rainLevel = rain.level;
  if (phase.rainDemoPending && phase.rainT >= phase.rainDemoAt && guide.mode !== 'twirl' && guide.mode !== 'bow' && guide.mode !== 'leave') {
    phase.rainDemoPending = false;
    const above = seed.target.clone().add(new THREE.Vector3(0, 0.13, 0));
    guide.fillRate = DEMO && phase.demoPours ? 0.9 : 0.6; // refills are quicker once you have seen it
    guide.rainDemo(new THREE.Vector3(0.04, 1.06, -0.3), above, rimPoint(), () => {
      phase.lastDemoEnd = phase.rainT;
      if (!DEMO) {
        // first night: the butterfly's pour sprouts the seed, then it's your turn
        if (phase.firstNight && seed.state.stage === 0) seed.grow(); else seed.receiveWater(0);
        if (phase.firstNight && seed.state.stage === 3) scheduleCarry();
        return;
      }
      // demo: every pour grows the mushroom a stage; after the third the butterfly carries it beside you
      phase.demoPours = (phase.demoPours || 0) + 1;
      if (seed.state.stage < 3) { seed.grow(); captions.show(`Night ${phase.demoPours}\n${GROW_WORDS[seed.state.stage]}`, abovePot(), { width: 0.3, hold: 2.4 }); }
      if (seed.state.stage < 3) showRain(0.4);
      else tweens.add(0.1, () => {}, { delay: 4.4, done: carryBloom });
    });
  }
  // still not watered a while after the demo: show it once more
  if (!DEMO && rain && rain.target && needsWater() && phase.lastDemoEnd !== undefined && !phase.rainDemoPending && guide.mode === 'perch' && phase.rainT - phase.lastDemoEnd > 25) showRain(0);
  if (phase.name === 'rain') {
    if (wateredTonight(state) && phase.wateredAt === undefined) phase.wateredAt = phase.rainT;
    const done = DEMO ? phase.rainT > 120
      : phase.firstNight ? phase.rainT > 240
      : wateredTonight(state) ? phase.rainT > phase.wateredAt + (seed.state.stage === 3 ? 12 : 8) : phase.rainT > 150;
    if (done) goodnight();
  }
}

function startTuck() {
  phase.name = 'tuck'; phase.t = 0;
  if (JUST_SIT) { sleep.order.forEach((gi, i) => tweens.add(0.1, () => {}, { delay: 6 + i * 25, done: () => sleep.putToSleep(gi) })); return; }
  drops.start(sleep.order);
}

function startRain() {
  rain.start();
  seed.invite = true;
  if (DEMO) { drops.dismiss(); sleep.order.forEach((gi, i) => tweens.add(0.1, () => {}, { delay: 2 + i * 1.2, done: () => sleep.putToSleep(gi) })); }
  showRain(1.2);
}

function goodnight() {
  if (phase.name === 'goodnight') return;
  phase.name = 'goodnight'; phase.t = 0;
  drops.dismiss(); sleep.order.forEach((gi, i) => tweens.add(0.1, () => {}, { delay: i * 0.6, done: () => sleep.putToSleep(gi) }));
  tweens.add(1, () => {}, { delay: 6, done: () => rain.stop() });
  tweens.add(8, (k) => { touch.dimBoops(1 - 0.65 * k); for (const c of seed.collection) for (const m of c.mats) m.emissiveIntensity = m.userData.baseEmissive * (1 - 0.55 * k); });
  sound.setAwake(0);
  seed.invite = false;
  // the butterfly says goodbye: it bows in front of you, then drifts up toward the moon with a trail of light
  const sky = EYE.clone().addScaledVector(W.moonDir || new THREE.Vector3(0, 0.9, -0.4), 22);
  tweens.add(0.1, () => {}, { delay: 2, done: () => guide.farewell(new THREE.Vector3(0.05, 1.12, -0.42), sky, nightComplete) });
}

// After the butterfly has gone, say clearly that the night is over.
function nightComplete() {
  const ahead = new THREE.Vector3(0, 1.32, -1.5);
  captions.show('Goodnight', ahead, { width: 0.55, hold: 3 });
  tweens.add(0.1, () => {}, { delay: 6, done: () => {
    if (DEMO) captions.show('Now your own first night\ncan begin', ahead, { width: 0.6, hold: 3 });
    else captions.show('Come back tomorrow night\nto see what grows', ahead, { width: 0.6, hold: 4.5 });
  } });
  if (DEMO) tweens.add(0.1, () => {}, { delay: 12, done: endDemo });
}

// The demo hands over to the real game: back to the start screen, with a button for your first night.
function endDemo() {
  const go = () => { location.href = location.pathname + (DEBUG ? '?debug=1' : ''); };
  const session = renderer.xr.getSession && renderer.xr.getSession();
  if (session) session.end().catch(() => {});
  ui.status.textContent = 'That was three nights in one minute. Your own first night starts here.';
  for (const key of ['vr', 'screen']) {
    const fresh = ui[key].cloneNode(true); ui[key].replaceWith(fresh); ui[key] = fresh;
  }
  ui.vr.textContent = 'Begin your first night'; ui.vr.disabled = false; ui.vr.classList.remove('quiet');
  ui.vr.addEventListener('click', go);
  ui.screen.style.display = 'none';
  ui.overlay.classList.remove('gone');
}

function needsWater() { return phase.firstNight ? seed.state.stage < 3 : !wateredTonight(state); }

// The butterfly lifts the grown mushroom out of the stump and sets it on the moss beside you.
const BESIDE_YOU = new THREE.Vector3(-0.35, 0, -0.32);
function carryBloom() {
  if (seed.state.stage !== 3 || seed.held || seed.desktopHeld) return;
  guide.carryMushroom(seed.stages[3], seed.bloomTop(), BESIDE_YOU, () => {
    seed._place(seed.stages[3].position.clone());
    if (DEMO) tweens.add(0.1, () => {}, { delay: 1.2, done: goodnight });
  });
}
// first night: if you haven't picked up your new mushroom a little after it blooms, the butterfly does it
function scheduleCarry() { tweens.add(0.1, () => {}, { delay: 16, done: carryBloom }); }

function rimPoint() {
  const tgt = seed.target, toYou = new THREE.Vector3(-tgt.x, 0, -tgt.z).normalize();
  return tgt.clone().addScaledVector(toYou, 0.17).add(new THREE.Vector3(0, 0.025, 0));
}

// The butterfly, right in front of you, holds its wings up like cupped hands until rain fills them,
// then carries the water slowly to the stump and pours it in. Then it waits for you to do the same.
function showRain(delay = 0) {
  phase.rainDemoAt = phase.rainT + delay;
  phase.rainDemoPending = true;
}

if (DEBUG) {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'g') { const d = drops.drops[0]; if (d) drops.squish(d); }
    if (e.key === 'r') startRain();
    if (e.key === 'w') seed.receiveWater(1);
    if (e.key === 'n') { state.wateredNight = null; saveState(state); }
    if (e.key === 's') sleep.order.forEach((gi) => sleep.putToSleep(gi));
  });
  window.__lo = () => ({ W, sleep, drops, touch, rain, seed, guide, gaze, phase, state, renderer, scene, camera, options, desktop });
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
    drops.update(dt, time, input);
    touch.update(dt, input);
    rain.update(dt, input);
    seed.update(dt, input);
    sleep.update(dt);
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
