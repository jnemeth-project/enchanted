// Firefly memory: fireflies drift in and settle in a gentle arc within reach, all glowing the same
// soft firefly gold. Each one is secretly a colour. Boop one and it shows its colour (and hums its
// note); boop a second: if the colours match, the pair glows together and goes to sleep, and a part
// of the forest sleeps with them. If not, they fade back to gold and wait. No timer, no score, no fail.
import * as THREE from 'three';
import { glowTexture, rand, clamp } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const HIDDEN = new THREE.Color(1.0, 0.9, 0.62);    // plain firefly glow: pale gold, so every colour stands out from it
const CORE = new THREE.Color(1.0, 0.98, 0.8);
// six soft colours that stay easy to tell apart at night, each with its own low note
export const COLOURS = [
  { c: new THREE.Color(1.0, 0.45, 0.78), hz: 164.81 },  // rose
  { c: new THREE.Color(1.0, 0.62, 0.22), hz: 185.0 },   // amber
  { c: new THREE.Color(0.35, 1.0, 0.72), hz: 220.0 },   // mint
  { c: new THREE.Color(0.38, 0.7, 1.0), hz: 246.94 },   // sky
  { c: new THREE.Color(0.68, 0.5, 1.0), hz: 293.66 },   // violet
  { c: new THREE.Color(0.95, 0.96, 1.0), hz: 329.63 },  // moon white
];

// A gentle arc in front of you, at seated reach (player faces -Z): rows x columns, slightly staggered.
function arcSlots(n, lift = false) {
  const rows = n > 12 ? 3 : 2, cols = Math.ceil(n / rows);
  const span = n > 24 ? 124 : n > 12 ? 104 : n > 6 ? 80 : 64, R = n > 12 ? 0.56 : 0.52;
  // lifted: at eye level, in front of the dark treeline instead of the glowing ground
  const ys = lift ? (rows === 3 ? [1.08, 1.26, 1.44] : [1.16, 1.34]) : (rows === 3 ? [0.86, 1.04, 1.22] : [0.94, 1.12]);
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
    this.bugs = false; this.lift = false; this.bugMesh = null;
  }

  // Little firefly bodies, all drawn together (three draws for every bug): body, lantern, wings.
  _makeBugs() {
    const N = 32, parts = [];
    const part = (sx, sy, sz, x, y, z, rgb, rz = 0) => {
      const g = new THREE.SphereGeometry(1, 10, 8); g.scale(sx, sy, sz); g.rotateZ(rz); g.translate(x, y, z);
      const c = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) { c[i] = rgb[0]; c[i + 1] = rgb[1]; c[i + 2] = rgb[2]; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
    };
    // forward is +Z (the head); the lantern is the tip of the abdomen at -Z
    parts.push(part(0.0062, 0.0052, 0.0105, 0, 0, 0.002, [0.09, 0.07, 0.05]));          // body
    parts.push(part(0.0068, 0.0028, 0.0062, 0, 0.0034, 0.0125, [0.85, 0.45, 0.28]));  // pinkish-orange head shield
    parts.push(part(0.0016, 0.0012, 0.0012, 0, 0.0046, 0.0128, [0.12, 0.05, 0.04]));  // its dark spot
    parts.push(part(0.0034, 0.0032, 0.0034, 0, -0.0006, 0.0185, [0.06, 0.05, 0.04])); // head
    parts.push(part(0.0016, 0.0016, 0.0016, 0.0024, 0.0008, 0.0205, [0.9, 0.85, 0.7])); // eyes
    parts.push(part(0.0016, 0.0016, 0.0016, -0.0024, 0.0008, 0.0205, [0.9, 0.85, 0.7]));
    parts.push(part(0.0038, 0.0016, 0.0125, 0.0031, 0.0042, -0.003, [0.16, 0.12, 0.08], 0.25)); // wing cases
    parts.push(part(0.0038, 0.0016, 0.0125, -0.0031, 0.0042, -0.003, [0.16, 0.12, 0.08], -0.25));
    const body = mergeGeometries(parts);
    const bodyMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.bugMesh = new THREE.InstancedMesh(body, bodyMat, N);
    const lantern = new THREE.SphereGeometry(1, 12, 10); lantern.scale(0.0055, 0.0048, 0.0075); lantern.translate(0, -0.0008, -0.0125);
    this.lanternMesh = new THREE.InstancedMesh(lantern, new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    const w = new THREE.PlaneGeometry(0.011, 0.02); w.rotateX(-Math.PI / 2);
    const wl = w.clone(); wl.rotateZ(0.5); wl.translate(0.007, 0.006, -0.004); const wr = w.clone(); wr.rotateZ(-0.5); wr.translate(-0.007, 0.006, -0.004);
    this.wingMesh = new THREE.InstancedMesh(mergeGeometries([wl, wr]), new THREE.MeshBasicMaterial({ color: 0xcfd8ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }), N);
    for (const m of [this.bugMesh, this.lanternMesh, this.wingMesh]) { m.count = 0; m.frustumCulled = false; this.scene.add(m); }
    this.lanternMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
  }

  get outCount() { return this.matched; }
  get waiting() { return this.list.filter((f) => f.state === 'wait' && !f.held); }
  get lit() { return this.list.filter((f) => f.state !== 'out'); }
  get allDone() { return this.active && this.matched >= this.pairs; }

  // pairs: how many pairs to find (24 fireflies = 12 pairs)
  startMemory(pairs, memorize = 10) {
    this.clear();
    if (this.bugs && !this.bugMesh) this._makeBugs();
    this.peekDur = memorize; this.peekT = 0; this.peeked = false;
    this.pairs = pairs; this.matched = 0; this.misses = 0; this.shown = []; this.active = true; this.sinceMatch = 0; this.doneFired = false;
    const n = pairs * 2;
    const slots = shuffle(arcSlots(n, this.lift));
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
    g.position.copy(from); g.visible = false; this.scene.add(g);
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(rand(-0.8, 0.8), rand(0.4, 1.2), rand(-0.5, 0.5)));
    this.list.push({
      g, body, halo, core, from, mid, to, ci, t: -delay, dur: this.fast ? rand(1.8, 2.4) : clamp(from.distanceTo(to) / 2.4, 3, 6),
      state: 'fly', light: 0, ph: Math.random() * 10, reveal: 0, hint: 0, outT: 0, held: false, inside: [false, false], r: 0.045 * k,
      turn: 0, yaw: 0, prev: from.clone(), size: (this.big ? 1.3 : 1) * 1.15,
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
        if (f.outT > 4) { this.scene.remove(f.g); f.halo.material.dispose(); f.core.material.dispose(); this.list.splice(i, 1); continue; }
      }
      if (this.bugs) this._pose(f, dt);
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
      f.body.visible = !this.bugs && f.state === 'out' && f.light < 0.5;
      if (this.bugs) {
        // facing you, the lantern is hidden behind the body: only a soft glow spills round it
        const back = f.turn;
        f.halo.material.opacity *= 0.35 + 0.65 * back; f.core.material.opacity *= back;
        f.show = show;
      }
    }
    if (this.bugs && this.bugMesh) this._drawBugs(time);
    if (this.allDone && !this.doneFired && !this.list.some((f) => f.state === 'pair')) { this.doneFired = true; if (this.onAllDone) this.onAllDone(); }
  }

  // Each bug faces you while it waits (its lantern hidden), and turns round to show its glowing
  // backside when it shows its colour: while you remember, when booped, and when it finds its pair.
  _pose(f, dt) {
    const p = f.g.position, eye = new THREE.Vector3(0, 1.2, 0);
    const vel = p.clone().sub(f.prev); f.prev.copy(p);
    let face;
    if (f.state === 'fly' && vel.lengthSq() > 1e-7) face = Math.atan2(vel.x, vel.z);
    else { const d = eye.clone().sub(p); face = Math.atan2(d.x, d.z); }
    const showing = f.state === 'shown' || f.state === 'pair' || f.state === 'out' || (this.peekT > 0 && f.state === 'wait') || f.hint > 0.4;
    const target = showing && f.state !== 'fly' ? 1 : 0;
    f.turn += (target - f.turn) * Math.min(1, dt * 4.5);
    let d = face - f.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); f.yaw += d * Math.min(1, dt * 6);
    const yaw = f.yaw + f.turn * Math.PI;
    // the glow sits at the tip of the abdomen, wherever the bug is facing
    const off = -0.0125 * f.size;
    for (const s of [f.halo, f.core]) s.position.set(Math.sin(yaw) * off, -0.001, Math.cos(yaw) * off);
    f.drawYaw = yaw;
  }

  _drawBugs(time) {
    let n = 0;
    const col = new THREE.Color();
    for (const f of this.list) {
      if (!f.g.visible) continue;
      const fade = f.state === 'out' ? Math.max(0, 1 - Math.max(0, f.outT - 2.5) / 1.5) : 1;
      if (fade <= 0) continue;
      this._q.setFromEuler(this._e.set(0, f.drawYaw || 0, 0));
      this._s.setScalar(f.size * fade);
      this._m.compose(f.g.position, this._q, this._s);
      this.bugMesh.setMatrixAt(n, this._m);
      this.lanternMesh.setMatrixAt(n, this._m);
      // wings flutter (fast while flying, a slow shimmer while hovering)
      const flap = f.state === 'fly' ? 0.55 + 0.45 * Math.sin(time * 38 + f.ph) : 0.85 + 0.15 * Math.sin(time * 6 + f.ph);
      this._s.set(f.size * fade * flap, f.size * fade, f.size * fade);
      this._m.compose(f.g.position, this._q, this._s);
      this.wingMesh.setMatrixAt(n, this._m);
      const s = f.show || 0, L = f.light;
      col.copy(HIDDEN).lerp(COLOURS[f.ci].c, s).multiplyScalar(0.25 + 0.95 * L);
      this.lanternMesh.setColorAt(n, col);
      n++;
    }
    for (const m of [this.bugMesh, this.lanternMesh, this.wingMesh]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
    if (this.lanternMesh.instanceColor) this.lanternMesh.instanceColor.needsUpdate = true;
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
