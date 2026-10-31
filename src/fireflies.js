// Firefly memory: fireflies drift in and settle in a gentle arc within reach, all glowing the same
// soft firefly gold. Each one is secretly a colour. Boop one and it shows its colour (and hums its
// note); boop a second: if the colours match, the pair glows together and goes to sleep, and a part
// of the forest sleeps with them. If not, they fade back to gold and wait. No timer, no score, no fail.
import * as THREE from 'three';
import { glowTexture, rand, clamp } from './util.js';

const HIDDEN = new THREE.Color(1.0, 0.9, 0.62);    // plain firefly glow: pale gold, so every colour stands out from it
const CORE = new THREE.Color(1.0, 0.98, 0.8);
// six strong colours that are easy to tell apart at night. Each also has its own shape and its own note,
// so a pair can be matched by colour, by shape or by sound (colour blind players included).
export const COLOURS = [
  { c: new THREE.Color(1.0, 0.16, 0.14), hz: 164.81, shape: 'heart' },    // red
  { c: new THREE.Color(1.0, 0.86, 0.08), hz: 196.0, shape: 'star' },      // yellow
  { c: new THREE.Color(0.18, 1.0, 0.28), hz: 220.0, shape: 'leaf' },      // green
  { c: new THREE.Color(0.16, 0.42, 1.0), hz: 261.63, shape: 'drop' },     // blue
  { c: new THREE.Color(1.0, 0.2, 0.95), hz: 293.66, shape: 'moon' },      // magenta
  { c: new THREE.Color(1.0, 1.0, 1.0), hz: 349.23, shape: 'diamond' },    // white
];

// the symbol drawn inside a revealed firefly: white with a dark edge, readable on any colour
const iconCache = {};
function iconTex(shape) {
  if (iconCache[shape]) return iconCache[shape];
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.translate(64, 64); g.beginPath();
  if (shape === 'heart') { g.moveTo(0, 34); g.bezierCurveTo(-50, 0, -34, -42, 0, -16); g.bezierCurveTo(34, -42, 50, 0, 0, 34); }
  else if (shape === 'star') { for (let i = 0; i < 10; i++) { const r = i % 2 ? 17 : 40, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); }
  else if (shape === 'leaf') { g.moveTo(0, -40); g.quadraticCurveTo(38, 0, 0, 40); g.quadraticCurveTo(-38, 0, 0, -40); }
  else if (shape === 'drop') { g.moveTo(0, -42); g.bezierCurveTo(10, -18, 34, 4, 26, 22); g.arc(0, 18, 26, 0.15, Math.PI - 0.15); g.bezierCurveTo(-34, 4, -10, -18, 0, -42); }
  else if (shape === 'moon') { g.arc(0, 0, 36, 0.6, Math.PI * 2 - 0.6); g.arc(16, 0, 26, Math.PI * 2 - 1.0, 1.0, true); g.closePath(); }
  else { g.moveTo(0, -40); g.lineTo(30, 0); g.lineTo(0, 40); g.lineTo(-30, 0); g.closePath(); }
  g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = 'rgba(10, 8, 20, 0.85)'; g.stroke(); g.fillStyle = '#ffffff'; g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; iconCache[shape] = t; return t;
}

// a glossy glowing ball: brighter where it faces you, a soft rim, and a little highlight, so it reads as a solid thing
const orbVS = `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const orbFS = `uniform vec3 color; uniform float light; varying vec3 vN; varying vec3 vV;
void main(){ float f = max(dot(vN, vV), 0.); vec3 base = color * (0.35 + 0.75 * f);
  float rim = pow(1. - f, 2.2) * 0.55; float spec = pow(max(dot(vN, normalize(vec3(-0.35, 0.6, 0.72))), 0.), 28.) * 0.9;
  gl_FragColor = vec4((base + color * rim + vec3(spec)) * light, light); }`;

// A gentle arc in front of you, raised a little above the eyes so the fireflies glow against the dark trunks (player faces -Z): rows x columns, slightly staggered.
function arcSlots(n) {
  const rows = n > 12 ? 3 : 2, cols = Math.ceil(n / rows);
  const span = n > 24 ? 118 : n > 12 ? 100 : n > 6 ? 80 : 64, R = n > 12 ? 0.5 : 0.47, ys = rows === 3 ? [0.66, 0.8, 0.94] : [0.72, 0.88]; // chest height up to eye level: easy to reach without sitting up or looking down
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols && out.length < n; c++) {
    const a = THREE.MathUtils.degToRad(-span / 2 + span * (c + (r % 2 ? 0.5 : 0.25)) / cols);
    out.push(new THREE.Vector3(Math.sin(a) * R + rand(-0.012, 0.012), ys[r] + rand(-0.012, 0.012), -Math.cos(a) * R));
  }
  return out;
}
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class Fireflies {
  constructor(scene, sleep, sound) {
    this.scene = scene; this.sleep = sleep; this.sound = sound;
    this.list = []; this.pairs = 0; this.matched = 0; this.misses = 0; this.shown = [];
    this.fast = false; this.big = false; this.active = false;
    this.bodyGeo = new THREE.SphereGeometry(1, 10, 8);
    this.bodyMat = new THREE.MeshBasicMaterial({ color: 0x1c1a12 });
    this.onMatch = null; this.onMiss = null; this.onAllDone = null; this.onPeek = null; this.onPeekEnd = null;
    this.peekT = 0; this.peekDur = 10; this.peeked = false;
    this.sinceMatch = 0;
  }

  get outCount() { return this.matched; }
  get waiting() { return this.list.filter((f) => f.state === 'wait' && !f.held); }
  get lit() { return this.list.filter((f) => f.state !== 'out'); }
  get allDone() { return this.active && this.matched >= this.pairs; }

  // pairs: how many pairs to find (24 fireflies = 12 pairs)
  startMemory(pairs, memorize = 10) {
    this.clear();
    this.peekDur = memorize; this.peekT = 0; this.peeked = false;
    this.pairs = pairs; this.matched = 0; this.misses = 0; this.shown = []; this.active = true; this.sinceMatch = 0; this.doneFired = false;
    const n = pairs * 2;
    const slots = shuffle(arcSlots(n));
    const colourOf = []; for (let p = 0; p < pairs; p++) colourOf.push(p % COLOURS.length, p % COLOURS.length);
    shuffle(colourOf);
    const homes = this.sleep.order.map((gi) => this.sleep.homeOf(gi));
    slots.forEach((to, k) => {
      const from = homes[k % homes.length].clone().add(new THREE.Vector3(rand(-0.6, 0.6), rand(0, 0.8), rand(-0.6, 0.6)));
      this._spawn(from, to, k * (this.fast ? 0.06 : 0.14), colourOf[k]);
    });
  }

  _spawn(from, to, delay, ci) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat); body.scale.set(0.0045, 0.0045, 0.009); body.visible = false; g.add(body);
    const k = this.big ? 1.3 : 1;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: HIDDEN.clone(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(0.1 * k); halo.renderOrder = 4; g.add(halo);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: CORE.clone(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    core.scale.setScalar(0.024 * k); core.renderOrder = 4; g.add(core);
    if (!this.orbGeo) this.orbGeo = new THREE.SphereGeometry(1, 22, 16);
    const orb = new THREE.Mesh(this.orbGeo, new THREE.ShaderMaterial({ uniforms: { color: { value: HIDDEN.clone() }, light: { value: 0 } }, vertexShader: orbVS, fragmentShader: orbFS, transparent: true }));
    orb.scale.setScalar(0.021 * k); orb.renderOrder = 5; g.add(orb);
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex(COLOURS[ci].shape), transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    icon.scale.setScalar(0.026 * k); icon.renderOrder = 6; g.add(icon);
    g.position.copy(from); g.visible = false; this.scene.add(g);
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(rand(-0.8, 0.8), rand(0.4, 1.2), rand(-0.5, 0.5)));
    this.list.push({
      g, body, halo, core, orb, icon, from, mid, to, ci, t: -delay, dur: this.fast ? rand(1.8, 2.4) : clamp(from.distanceTo(to) / 2.4, 3, 6),
      state: 'fly', light: 0, ph: Math.random() * 10, reveal: 0, hint: 0, outT: 0, held: false, inside: [false, false], r: 0.045 * k,
    });
  }

  update(dt, time, input) {
    if (this.active && !this.allDone && this.ready) this.sinceMatch += dt;
    // a gentle hint if you have been searching for a while: one hidden pair shimmers its colour briefly
    if (this.active && this.ready && !this.allDone && (this.sinceMatch > 45 || this.misses >= 4) && !this.list.some((f) => f.hint > 0)) {
      const hidden = this.list.filter((f) => f.state === 'wait');
      const a = hidden[Math.floor(Math.random() * hidden.length)];
      const b = a && hidden.find((f) => f !== a && f.ci === a.ci);
      if (a && b) { a.hint = b.hint = 1.6; this.misses = 0; this.sinceMatch = 20; }
    }
    // once everyone has arrived: all the colours show for a while, so you can remember them
    const arrived = this.list.length && this.list.every((f) => f.state !== 'fly');
    if (this.active && arrived && !this.peeked) { this.peeked = true; this.peekT = this.peekDur; if (this.onPeek) this.onPeek(this.peekDur); }
    if (this.peekT > 0) { this.peekT = Math.max(0, this.peekT - dt); if (this.peekT === 0) { this.sinceMatch = 0; if (this.onPeekEnd) this.onPeekEnd(); } }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      if (f.state === 'fly') {
        f.t += dt; if (f.t < 0) continue;
        f.g.visible = true;
        const u = Math.min(1, f.t / f.dur), e = u * u * (3 - 2 * u);
        f.g.position.copy(f.from).multiplyScalar((1 - e) * (1 - e)).addScaledVector(f.mid, 2 * (1 - e) * e).addScaledVector(f.to, e * e);
        f.light = Math.min(1, f.t / 0.8);
        if (u >= 1) f.state = 'wait';
      } else if (f.state === 'wait' || f.state === 'shown' || f.state === 'pair') {
        // they hover almost still, so you can remember where each colour was
        if (!f.held) {
          const goal = f.to.clone().add(new THREE.Vector3(Math.sin(time * 0.5 + f.ph) * 0.008, Math.sin(time * 0.8 + f.ph * 1.7) * 0.01, 0));
          f.g.position.lerp(goal, 1 - Math.exp(-3 * dt));
        }
        if (f.state === 'wait' && this.ready) this._touch(f, input);
        if (f.state === 'pair') {
          // the matched pair glows together, rises a little, then goes to sleep
          f.outT += dt;
          if (f.outT > 1.1) { f.state = 'out'; f.outT = 0; }
        }
      } else if (f.state === 'out') {
        f.outT += dt;
        f.light = Math.max(0, 1 - f.outT / 1.1);
        if (f.outT > 0.6) { f.g.position.y -= dt * 0.1; f.g.position.z -= dt * 0.06; }
        if (f.outT > 4) { this.scene.remove(f.g); f.halo.material.dispose(); f.core.material.dispose(); f.orb.material.dispose(); f.icon.material.dispose(); this.list.splice(i, 1); continue; }
      }
      // colour: gold while hidden, its own colour while shown (or hinted)
      const want = f.state === 'shown' || f.state === 'pair' || f.state === 'out' ? 1 : 0;
      f.reveal += (want - f.reveal) * Math.min(1, dt * (want ? 8 : 2.5));
      if (f.hint > 0) f.hint = Math.max(0, f.hint - dt);
      const peek = this.peekT > 0 ? Math.min(1, this.peekT / 1.5, (this.peekDur - this.peekT) / 0.8) : 0; // fades in, holds, fades out
      const show = Math.max(f.reveal, peek, f.hint > 0 ? Math.sin(Math.min(1, (1.6 - f.hint) / 1.6) * Math.PI) * 0.85 : 0);
      f.halo.material.color.copy(HIDDEN).lerp(COLOURS[f.ci].c, show);
      f.core.material.color.copy(CORE).lerp(COLOURS[f.ci].c.clone().lerp(new THREE.Color(1, 1, 1), 0.2), show);
      const breath = 0.78 + 0.22 * Math.sin(time * 1.2 + f.ph);
      const bright = f.state === 'pair' ? 1.5 : 1 + 0.35 * show;
      const L = f.light * breath * bright;
      f.halo.material.opacity = Math.min(1, (0.85 + 0.15 * show) * L); f.core.material.opacity = Math.min(1, 1.1 * L);
      f.halo.scale.setScalar(0.1 * (this.big ? 1.3 : 1) * (0.9 + 0.8 * show + (f.state === 'pair' ? 0.3 : 0)));
      f.core.scale.setScalar(0.024 * (this.big ? 1.3 : 1) * (1 + 0.6 * show));
      f.body.visible = f.state === 'out' && f.light < 0.5;
      // the solid glowing ball, and the colour's symbol inside it while it shows
      f.orb.material.uniforms.color.value.copy(HIDDEN).lerp(COLOURS[f.ci].c, show);
      f.orb.material.uniforms.light.value = Math.min(1, f.light * (0.9 + 0.1 * breath));
      f.orb.scale.setScalar(0.021 * (this.big ? 1.3 : 1) * (1 + 0.25 * show));
      f.icon.material.opacity = Math.min(1, show * 1.2) * f.light;
      f.icon.scale.setScalar(0.026 * (this.big ? 1.3 : 1) * (1 + 0.25 * show));
      f.halo.material.opacity *= 0.7; // a softer glow around the ball, so the colour of the ball itself leads
    }
    if (this.allDone && !this.doneFired && !this.list.some((f) => f.state === 'pair')) { this.doneFired = true; if (this.onAllDone) this.onAllDone(); }
  }

  _touch(f, input) {
    if (f.held) return;
    const c = f.g.position;
    input.hands.forEach((h, hi) => {
      if (!h.present) { f.inside[hi] = false; return; }
      let hit = h.pinching && h.pinchPoint.distanceTo(c) < f.r * 1.4;
      for (let k = 1; k < 5 && !hit; k++) if (h.tips[k].distanceTo(c) < f.r) hit = true;
      if (hit && !f.inside[hi]) this.boop(f);
      f.inside[hi] = hit;
    });
  }

  // fireflies can be booped once the remembering time is over
  get ready() { return this.peeked && this.peekT === 0; }

  pick(ray) {
    if (!this.ready) return null;
    let best = null, bd = 1e9;
    for (const f of this.list) {
      if (f.state !== 'wait' || f.held) continue;
      const along = f.g.position.distanceTo(ray.origin);
      if (ray.distanceToPoint(f.g.position) < Math.max(0.045, along * 0.03) && along < bd) { bd = along; best = f; }
    }
    return best ? { key: best, size: 0.07, point: best.g.position.clone(), fire: () => this.boop(best) } : null;
  }

  // reveal a firefly's colour; with two shown, keep the pair or let them fade back
  boop(f) {
    if (f.state !== 'wait' || !this.ready) return;
    // a third touch while two different ones are still showing: tidy them away straight away
    if (this.shown.length >= 2) this._hideShown();
    f.state = 'shown'; f.held = false; this.shown.push(f);
    this.sound.boop(f.g.position, COLOURS[f.ci].hz);
    if (this.shown.length < 2) return;
    const [a, b] = this.shown;
    if (a.ci === b.ci) {
      this.shown = [];
      setTimeout(() => this._match(a, b), 450);
    } else {
      this.misses++;
      if (this.onMiss) this.onMiss(a, b);
      clearTimeout(this.hideT); this.hideT = setTimeout(() => this._hideShown(), 1700);
    }
  }

  _hideShown() { clearTimeout(this.hideT); for (const s of this.shown) if (s.state === 'shown') s.state = 'wait'; this.shown = []; }

  _match(a, b) {
    a.state = b.state = 'pair'; a.outT = b.outT = 0;
    a.to.y += 0.04; b.to.y += 0.04;
    this.matched++; this.misses = 0; this.sinceMatch = 0;
    this.sound.hush(a.g.position.clone().lerp(b.g.position, 0.5), COLOURS[a.ci].hz * 0.75);
    const G = this.sleep.order.length;
    this.sleep.putToSleep(this.sleep.order[Math.min(G - 1, Math.floor((this.matched - 1) * G / this.pairs))]);
    if (this.matched === this.pairs) this.sleep.order.forEach((gi) => this.sleep.putToSleep(gi));
    if (this.onMatch) this.onMatch(a, b);
  }

  // for "Just sit": pairs find each other on their own, slowly
  autoPair() {
    const hidden = this.list.filter((f) => f.state === 'wait');
    const a = hidden[0], b = a && hidden.find((f) => f !== a && f.ci === a.ci);
    if (a && b) { this.boop(a); this.boop(b); }
  }

  // a matching partner for a given firefly (the butterfly uses this to show the game)
  partnerOf(f) { return this.list.find((x) => x !== f && x.ci === f.ci && x.state === 'wait'); }

  clear() { for (const f of this.list) this.scene.remove(f.g); this.list = []; this.shown = []; }
  dismiss() { this.active = false; for (const f of this.list) if (f.state !== 'out') { f.state = 'out'; f.outT = 0; } }
}
