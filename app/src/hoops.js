// Hoops: glowing rings of light float up in front of you, one at a time. Pick up a pebble (from the right-hand
// platform or the shelf) and throw it through the ring: it rings like a bell, bursts into fairy dust and drifts
// away, and the next one appears somewhere new. Nothing to lose, no timer: a near miss just tries again.
// Rings stay in front of you, so there is no need to turn round. A throw roughly at the ring is helped along.
import * as THREE from 'three';
import { glowTexture, rand, tweens } from './util.js';

const COLS = [0x8ff5d4, 0xffd38a, 0xc9a6ff, 0xff9fc4, 0x9fd4ff];
const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 987.77, 1046.5];

export class Hoops {
  constructor(scene, sound, effects) {
    this.scene = scene; this.sound = sound; this.effects = effects;
    this.active = false; this.hoop = null; this.count = 0; this.eye = new THREE.Vector3(0, 0.82, 0);
    this.onScore = null; this.onFirst = null;
    this.blocked = null;   // (x, z) -> true where a ring must not stand (trees, pond); set by the game
  }

  start(eye) {
    this.stop(true);
    this.active = true; this.count = 0; if (eye) this.eye.copy(eye);
    tweens.add(0.1, () => {}, { delay: 1.2, done: () => { if (this.active) this._next(); } });
  }

  stop(now = false) {
    this.active = false;
    const h = this.hoop; this.hoop = null;
    if (h) { if (now) this._remove(h); else tweens.add(0.8, (k) => { h.k = 1 - k; }, { done: () => this._remove(h) }); }
  }

  _remove(h) { this.scene.remove(h.g); h.g.traverse((m) => { if (m.material) m.material.dispose(); if (m.geometry && m.geometry !== this._ringGeo) m.geometry.dispose(); }); }

  // where the next ring goes: in front of you (within about 40 degrees either side), a comfortable throw away,
  // a little higher or lower each time, and never right where the last one was
  _spot() {
    const e = this.eye, n = this.count;
    const far = Math.min(3.6, 1.7 + n * 0.12);
    let best = null;
    for (let tries = 0; tries < 40; tries++) {
      const a = THREE.MathUtils.degToRad(rand(-38, 38)), d = rand(1.5, far);
      const p = new THREE.Vector3(Math.sin(a) * d, e.y + rand(-0.15, 0.55), -Math.cos(a) * d);
      if (this.blocked && this.blocked(p.x, p.z)) continue;
      if (this.last && p.distanceTo(this.last) < 0.8) continue;
      best = p; break;
    }
    return best || new THREE.Vector3(rand(-0.6, 0.6), e.y + 0.2, -2);
  }

  _next() {
    if (!this.active) return;
    const at = this._spot(); this.last = at.clone();
    const R = Math.max(0.2, 0.34 - this.count * 0.008), col = new THREE.Color(COLS[this.count % COLS.length]);
    const g = new THREE.Group(); g.position.copy(at);
    this._ringGeo = this._ringGeo || new THREE.TorusGeometry(1, 0.045, 10, 48);
    const ring = new THREE.Mesh(this._ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    ring.scale.setScalar(R); g.add(ring);
    // a soft glow filling the ring, so it reads as "through here"
    const fill = new THREE.Mesh(new THREE.CircleGeometry(R * 0.96, 40), new THREE.MeshBasicMaterial({ map: glowTexture(), color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    g.add(fill);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(R * 3.2); g.add(halo);
    g.lookAt(this.eye.x, at.y, this.eye.z);   // upright, facing you
    this.scene.add(g);
    const h = { g, ring, fill, halo, R, col, k: 0, t: 0, done: false, ph: Math.random() * 6 };
    this.hoop = h;
    tweens.add(0.9, (k) => { h.k = k * k * (3 - 2 * k); });
    this.sound.boop(at.clone(), 330);
    if (this.effects) this.effects.sparkle(at.clone(), col.getHex(), 10, R * 0.6);
  }

  // where a throw aimed roughly at the ring should go (for the pebbles' gentle aim help)
  get target() { return this.hoop && !this.hoop.done ? this.hoop.g.position : null; }

  // a thrown thing moved from a to b this frame: did it pass through the ring?
  check(a, b) {
    const h = this.hoop; if (!this.active || !h || h.done || h.k < 0.5) return false;
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(h.g.quaternion), c = h.g.position;
    const da = a.clone().sub(c).dot(n), db = b.clone().sub(c).dot(n);
    if (da * db > 0 || da === db) return false;
    const p = a.clone().lerp(b, da / (da - db));
    if (p.distanceTo(c) > h.R * 1.08) return false;
    this._score(h, p);
    return true;
  }

  _score(h, p) {
    h.done = true; this.count++;
    const hz = NOTES[(this.count - 1) % NOTES.length];
    this.sound.chime(p.clone(), hz); setTimeout(() => this.sound.chime(p.clone(), hz * 1.5), 140);
    if (this.effects) { this.effects.sparkle(h.g.position.clone(), h.col.getHex(), 40, h.R); this.effects.sparkle(p.clone(), 0xfff1c8, 16, 0.08); }
    // it glows bright, swells a little and floats up and away
    const y0 = h.g.position.y;
    tweens.add(1.6, (k) => { h.flash = 1 - k; h.g.position.y = y0 + k * k * 0.6; h.k = 1 - k * k; h.g.scale.setScalar(1 + 0.25 * k); }, { done: () => { this._remove(h); if (this.hoop === h) this.hoop = null; } });
    if (this.onScore) this.onScore(this.count);
    tweens.add(0.1, () => {}, { delay: 1.9, done: () => { if (this.active && !this.hoop) this._next(); } });
  }

  update(dt, time) {
    const h = this.hoop; if (!h) return;
    h.t += dt;
    const breath = 0.85 + 0.15 * Math.sin(time * 1.6 + h.ph), f = h.flash || 0;
    h.ring.material.opacity = Math.min(1, h.k * (0.85 * breath + f));
    h.fill.material.opacity = h.k * (0.12 + 0.05 * Math.sin(time * 1.3 + h.ph) + 0.5 * f);
    h.halo.material.opacity = h.k * (0.22 * breath + 0.6 * f);
    if (!h.done) h.g.position.y += Math.sin(time * 0.9 + h.ph) * 0.0006;   // a slow, gentle bob
  }
}
