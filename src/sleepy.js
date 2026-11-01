// Sleepy mushrooms: twelve little mushrooms pop up out of the ground in front of you, three rows of four,
// all dozing with a faint glow. A few wake up one after another, each glowing bright and humming its note;
// then you tap them in the same order. Get it right and they all glow happily, and next time one more joins
// the tune. Get it wrong and nothing bad happens: they simply show you the same tune again. No timer, no score.
import * as THREE from 'three';
import { tweens, glowTexture } from './util.js';

// a soft pentatonic scale, one note per mushroom (low at the front left, rising to the back right)
const NOTES = [196, 220, 246.94, 293.66, 329.63, 392, 440, 493.88, 587.33, 659.25, 739.99, 783.99];
const COLS = [-0.255, -0.085, 0.085, 0.255], ROWS = [-0.4, -0.55, -0.7];
const HEIGHT = 0.13;      // each little mushroom stands about 13 cm tall

export class SleepyMushrooms {
  constructor(scene, W, sound, effects) {
    this.scene = scene; this.sound = sound; this.effects = effects;
    this.srcs = ['Boop_0', 'Boop_1', 'Boop_2', 'Boop_3', 'Boop_4'].map((n) => W.byName[n]).filter(Boolean);
    this.grounds = [W.byName.Ground].filter(Boolean); this.ray = new THREE.Raycaster();
    // the mossy mound they grow on (made in Blender): hidden until the game starts, then it rises out of the
    // moss with the mushrooms on top, at a height your hands can reach
    this.root = new THREE.Group(); this.root.visible = false; scene.add(this.root);
    this.mound = W.byName.G_SleepyMound || null;
    if (this.mound) { this.root.attach(this.mound); this.mound.updateMatrixWorld(true); this.moundSY = this.mound.scale.y; }
    this.list = []; this.active = false; this.seq = []; this.phase = 'idle'; this.t = 0; this.i = 0; this.rounds = 0; this.wrong = 0;
    this.onFirst = null; this.onRound = null;
  }

  _groundAt(x, z) {
    this.ray.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));
    const h = this.ray.intersectObjects(this.mound ? [this.mound] : this.grounds, true)[0] || this.ray.intersectObjects(this.grounds, true)[0]; return h ? h.point.y : 0;
  }

  _make(k) {
    const src = this.srcs[k % this.srcs.length];
    const g = new THREE.Group(), m = src.clone(true); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
    // its own glow (so each can light up on its own), and none of the outline shells
    const mats = [];
    m.traverse((o) => { if (o.isMesh) { if (o.material && o.material.type === 'ShaderMaterial') { o.visible = false; return; } o.material = o.material.clone(); mats.push(o.material); } });
    const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
    const s = HEIGHT / Math.max(size.y, 1e-3); m.scale.setScalar(s); m.position.y = -box.min.y * s;
    g.add(m);
    // a soft halo over its cap that blooms when it wakes, so it is easy to see which one lit up
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff0c8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.y = HEIGHT * 0.8; halo.scale.setScalar(0.2); g.add(halo);
    const r = k % 4, row = Math.floor(k / 4);
    const x = COLS[r] + (row % 2 ? 0.02 : -0.02), z = ROWS[row];
    g.position.set(x, this._groundAt(x, z), z); g.rotation.y = Math.random() * Math.PI * 2;
    const base = mats.map((mm) => mm.emissiveIntensity ?? 1);
    const cap = new THREE.Vector3(x, g.position.y + HEIGHT * 0.82, z);
    return { g, m, halo, mats, base, cap, r: Math.max(size.x, size.z) * s * 0.5, hz: NOTES[k], glow: 0, bounce: 0, grow: 0, inside: [false, false] };
  }

  // the mound's height follows where you are playing from, so the caps are at your hands:
  // about 45 cm up sitting on the bed (the forest floor), about 72 cm up beside a chair
  setSeat(seat) { if (this.mound) { this.mound.scale.y = this.moundSY * (seat === 'chair' ? 1.43 : 0.79); this.mound.updateMatrixWorld(true); } }

  get running() { return this.active; }

  start() {
    this.stop(true);
    this.active = true; this.rounds = 0; this.seq = []; this.wrong = 0;
    this.root.position.y = 0; this.root.updateMatrixWorld(true); this.root.visible = true;
    // the mound rises gently out of the moss (it starts below the ground), then the mushrooms pop up on it
    if (this.mound) { const r = this.root; tweens.add(1.4, (e) => { r.position.y = -0.3 * (1 - e) * (1 - e); }); }
    for (let k = 0; k < 12; k++) {
      const mu = this._make(k); mu.g.scale.setScalar(0.001); this.root.add(mu.g); this.list.push(mu);
      // they pop up out of the moss one after another
      tweens.add(0.6, (e) => { const b = e < 0.7 ? e / 0.7 * 1.12 : 1.12 - (e - 0.7) / 0.3 * 0.12; mu.g.scale.setScalar(Math.max(0.001, b)); }, { delay: 1.0 + 0.12 * k });
    }
    this.seq = [this._pick(), this._pick()];
    this._show(3.6);
  }

  stop(now = false) {
    this.active = false; this.phase = 'idle';
    const old = this.list; this.list = [];
    old.forEach((mu, k) => {
      if (now) { this.root.remove(mu.g); return; }
      const s0 = mu.g.scale.x;
      tweens.add(0.5, (e) => mu.g.scale.setScalar(Math.max(0.001, s0 * (1 - e))), { delay: 0.05 * k, done: () => this.root.remove(mu.g) });
    });
    // and the mound sinks back into the moss
    if (now) { this.root.visible = false; }
    else if (old.length) { const r = this.root; tweens.add(1.2, (e) => { r.position.y = -0.3 * e * e; }, { delay: 0.7, done: () => { if (!this.active) r.visible = false; } }); }
  }

  _pick() {
    // a new mushroom for the tune, never the same as the one just before it
    let k; do k = Math.floor(Math.random() * 12); while (this.seq.length && k === this.seq[this.seq.length - 1]);
    return k;
  }

  _show(delay = 1.0) { this.phase = 'wait'; this.t = -delay; this.i = 0; }

  _light(mu, strong = 1) {
    mu.glow = strong; mu.bounce = 1;
    this.sound.boop(mu.cap.clone(), mu.hz);
    if (this.effects) this.effects.sparkle(mu.cap.clone().add(new THREE.Vector3(0, 0.02, 0)), 0xfff1c8, 8, 0.04);
  }

  tap(k) {
    if (!this.active || this.phase !== 'input') return;
    const mu = this.list[k]; if (!mu) return;
    this._light(mu);
    if (k === this.seq[this.i]) {
      this.i++;
      if (this.i >= this.seq.length) {
        // the whole tune, right: they all wake and glow together, then the tune grows by one
        this.phase = 'happy'; this.t = 0; this.rounds++; this.wrong = 0;
        tweens.add(0.1, () => {}, { delay: 0.35, done: () => {
          this.list.forEach((m2, j) => tweens.add(0.1, () => {}, { delay: j * 0.04, done: () => { m2.glow = 0.8; m2.bounce = 0.6; } }));
          this.sound.hush(new THREE.Vector3(0, 0.3, -0.55), NOTES[0] * 2);
          if (this.effects) this.effects.sparkle(new THREE.Vector3(0, 0.2, -0.55), 0xfff1c8, 36, 0.3);
          if (this.onRound) this.onRound(this.rounds, this.seq.length);
        } });
        this.seq.push(this._pick());
        this._show(2.4);
      }
    } else {
      // not quite: a soft low hum, and they show the same tune again
      this.phase = 'oops'; this.t = 0; this.wrong++;
      this.sound.boop(mu.cap.clone(), 98);
      this.list.forEach((m2) => { m2.glow = Math.max(m2.glow, 0.25); });
      this._show(1.6);
    }
  }

  pick(ray) {
    if (!this.active || this.phase !== 'input') return null;
    let best = null, bd = 9;
    this.list.forEach((mu, k) => { const d = ray.distanceToPoint(mu.cap); if (d < Math.max(0.05, mu.r * 1.2)) { const a = ray.origin.distanceTo(mu.cap); if (a < bd) { bd = a; best = k; } } });
    // (hands only: just looking at a mushroom while you remember the tune must never count as a tap)
    return best === null ? null : { key: 'sleepy' + best, size: 0.08, handsOnly: true, point: this.list[best].cap.clone(), fire: () => this.tap(best) };
  }

  update(dt, input, time) {
    if (!this.list.length) return;
    // playing the tune: one mushroom wakes every 0.8 s
    if (this.active && this.phase === 'wait') {
      this.t += dt;
      const step = 1.0, n = Math.floor(this.t / step);
      if (this.t >= 0 && n >= this.i && this.i < this.seq.length) { this._light(this.list[this.seq[this.i]]); this.i++; }
      if (this.i >= this.seq.length && this.t > this.seq.length * step + 0.3) { this.phase = 'input'; this.i = 0; if (this.onFirst && this.rounds === 0 && !this.toldTurn) { this.toldTurn = true; this.onFirst('turn'); } }
    }
    // tapping: any fingertip (or a pinch) coming down onto a cap. Generous on purpose: anywhere over the cap,
    // from a little above it to a little below its rim, counts, and only the nearest mushroom is tapped
    if (this.active && this.phase === 'input') input.hands.forEach((h, hi) => {
      if (!h.present) { this.list.forEach((mu) => { mu.inside[hi] = false; }); return; }
      const pts = []; for (let t = 1; t < 5; t++) if (h.tips && h.tips[t]) pts.push(h.tips[t]);
      if (h.index) pts.push(h.index); if (h.pinching && h.pinchPoint) pts.push(h.pinchPoint);
      let best = -1, bd = 9;
      this.list.forEach((mu, k) => {
        const R = Math.max(0.065, mu.r * 1.4);
        for (const p of pts) {
          const dy = p.y - mu.cap.y; if (dy < -0.08 || dy > 0.1) continue;
          const d = Math.hypot(p.x - mu.cap.x, p.z - mu.cap.z); if (d < R && d < bd) { bd = d; best = k; }
        }
      });
      this.list.forEach((mu, k) => {
        const inside = k === best;
        if (inside && !mu.inside[hi]) this.tap(k);
        mu.inside[hi] = inside;
      });
    });
    // the look of each one: a faint dozing glow that breathes, bright when awake, a little bounce when lit
    this.list.forEach((mu, k) => {
      mu.glow = Math.max(0, mu.glow - dt * 1.4); mu.bounce = Math.max(0, mu.bounce - dt * 3);
      const doze = 0.28 + 0.06 * Math.sin(time * 0.9 + k * 1.3);
      mu.mats.forEach((mm, j) => { if (mm.emissiveIntensity !== undefined) mm.emissiveIntensity = mu.base[j] * (doze + 3.6 * mu.glow); });
      mu.m.scale.y = mu.m.scale.x * (1 + 0.22 * Math.sin(mu.bounce * Math.PI) * mu.bounce);
      mu.halo.material.opacity = Math.min(1, mu.glow * 1.1); mu.halo.scale.setScalar(0.14 + 0.12 * mu.glow);
    });
  }
}
