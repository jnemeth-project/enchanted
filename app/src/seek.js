// Hidden glow: a hide-and-seek game for your eyes. A little thing in a colour found nowhere else in the forest
// (a neon green mushroom, an electric blue crystal, a bright orange bubble mushroom, a hot pink one) floats in
// front of you so you know what to look for, then hides somewhere in the forest you can see from your seat.
// Find it and rest your eyes on it for a moment: a ring fills around it, and it comes to you with a sparkle.
// Very forgiving: anywhere near it counts. If you are searching a while, a soft hum helps: it rises and grows
// the closer your gaze comes to it (warmer, warmer...). With "Sound guides" on, the hum is there from the start.
import * as THREE from 'three';
import { tweens, glowTexture, rand } from './util.js';

const ITEMS = [
  { name: 'neon green mushroom', src: 'boop', color: 0x39ff14 },
  { name: 'electric blue crystal', src: 'crystal', color: 0x00b4ff },
  { name: 'bright orange mushroom', src: 'bubble', color: 0xff7a00 },
  { name: 'hot pink mushroom', src: 'boop', color: 0xff1f8f },
  { name: 'neon yellow crystal', src: 'crystal', color: 0xf4ff1a },
];
const DWELL = 1.1;

function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { c, t, g: c.getContext('2d') };
}

export class Seek {
  constructor(scene, W, sound, effects) {
    this.scene = scene; this.W = W; this.sound = sound; this.effects = effects;
    this.srcs = {
      boop: W.byName.Boop_0 || W.boops && W.boops[0],
      crystal: W.crystals && W.crystals[0],
      bubble: W.bubbles && W.bubbles[0],
    };
    this.active = false; this.round = 0; this.found = 0; this.item = null; this.hum = false; this.alwaysHum = false;
    this.ray = new THREE.Raycaster();
    this.ring = ringTexture();
    this.ringSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ring.t, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    this.ringSprite.renderOrder = 28; this.ringSprite.visible = false; scene.add(this.ringSprite);
    this.onShow = null; this.onFound = null;
  }

  _make(def) {
    const src = this.srcs[def.src] || this.srcs.boop; if (!src) return null;
    const g = new THREE.Group(), m = src.clone(true); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
    const col = new THREE.Color(def.color);
    m.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material && o.material.isShaderMaterial) { o.visible = false; return; }
      const re = (mm) => { const c = mm.clone(); if (c.color) c.color.copy(col); if (c.emissive) { c.emissive.copy(col); c.emissiveIntensity = 1.3; } if (c.map && def.src !== 'crystal') c.map = null; return c; };
      o.material = Array.isArray(o.material) ? o.material.map(re) : re(o.material);
    });
    const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
    const s = 0.2 / Math.max(size.y, 1e-3); m.scale.setScalar(s); m.position.y = -box.min.y * s; g.add(m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.y = 0.1; glow.scale.setScalar(0.4); g.add(glow);
    this.scene.add(g);
    return { g, m, glow, col, def };
  }

  // somewhere it can be seen from your seat (both seat heights), a few metres away, among other things,
  // never straight behind you
  _spot(eye) {
    const grounds = this.W.grounds;
    const solid = []; this.W.root.traverse((o) => { if (o.isMesh && o.visible && o.material && !o.material.transparent) solid.push(o); });
    // with your room showing at eye level (mixed reality), it hides on the forest floor nearer you, low enough
    // to be seen below the room
    const room = this.roomShown && this.roomShown();
    const dMax = room ? Math.max(2.4, Math.min(8.5, eye.y / Math.tan(THREE.MathUtils.degToRad(16)))) : 8.5, dMin = Math.min(3, dMax - 0.5);
    for (let tries = 0; tries < 80; tries++) {
      const a = THREE.MathUtils.degToRad(rand(-110, 110)), d = rand(dMin, dMax);
      const x = Math.sin(a) * d, z = -Math.cos(a) * d;
      this.ray.set(new THREE.Vector3(x, 6, z), new THREE.Vector3(0, -1, 0)); this.ray.far = 12;
      const h = this.ray.intersectObjects(grounds, true)[0]; if (!h) continue;
      const top = this.ray.intersectObjects(solid, false)[0];
      if (top && top.point.y > h.point.y + 0.05) continue;   // something stands right there
      const p = h.point.clone();
      let ok = true;
      for (const ey of [eye.y, eye.y + 0.38]) {
        const e = new THREE.Vector3(eye.x, ey, eye.z), to = p.clone().add(new THREE.Vector3(0, 0.12, 0)).sub(e), L = to.length();
        this.ray.set(e, to.normalize()); this.ray.far = L - 0.12;
        if (this.ray.intersectObjects(solid, false).length) { ok = false; break; }
      }
      if (ok) return p;
    }
    return new THREE.Vector3(rand(-1.5, 1.5), 0, -4);
  }

  start(eye, look) {
    this.stop(true);
    this.active = true; this.round = 0; this.found = 0;
    this._next(eye, look);
  }

  _next(eye, look) {
    if (!this.active) return;
    const def = ITEMS[this.round % ITEMS.length]; this.round++;
    const it = this.item = this._make(def); if (!it) return;
    it.state = 'show'; it.t = 0; it.dwell = 0; it.search = 0;
    // first it floats in front of you, turning slowly, so you know what to look for
    const f = look.clone(); f.y = 0; f.normalize();
    it.g.position.copy(eye).addScaledVector(f, 0.9).add(new THREE.Vector3(0, -0.15, 0));
    it.g.scale.setScalar(0.001); tweens.add(0.6, (k) => it.g.scale.setScalar(Math.max(0.001, k * 1.2)));
    if (this.effects) this.effects.sparkle(it.g.position.clone().add(new THREE.Vector3(0, 0.1, 0)), def.color, 16, 0.12);
    this.sound.chime(it.g.position.clone(), 659.25);
    if (this.onShow) this.onShow(def, it.g.position.clone());
    it.spot = this._spot(eye);
  }

  stop(now = false) {
    this.active = false; this._hum(0);
    const it = this.item; this.item = null; this.ringSprite.visible = false;
    if (it) { if (now) this.scene.remove(it.g); else tweens.add(0.6, (k) => it.g.scale.setScalar(Math.max(0.001, (1 - k) * it.g.scale.x)), { done: () => this.scene.remove(it.g) }); }
  }

  _hum(level, pitch = 0) {
    const s = this.sound; if (!s.enabled) return;
    const ctx = s.ctx;
    if (!this.humNode) {
      if (level <= 0) return;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 180;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 270;
      const g = ctx.createGain(); g.gain.value = 0.0001; const g2 = ctx.createGain(); g2.gain.value = 0.35;
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(s.master); o.start(); o2.start();
      this.humNode = { o, o2, g };
    }
    const t = ctx.currentTime;
    this.humNode.g.gain.setTargetAtTime(Math.max(0.0001, level * 0.07), t, 0.15);
    this.humNode.o.frequency.setTargetAtTime(170 + 190 * pitch, t, 0.15); this.humNode.o2.frequency.setTargetAtTime((170 + 190 * pitch) * 1.5, t, 0.15);
  }

  _drawRing(k) {
    const { g, c, t } = this.ring; g.clearRect(0, 0, 128, 128);
    g.lineWidth = 10; g.lineCap = 'round';
    g.strokeStyle = 'rgba(255, 255, 255, 0.25)'; g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255, 246, 214, 0.95)'; g.beginPath(); g.arc(64, 64, 50, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke();
    t.needsUpdate = true;
  }

  update(dt, time, eye, dir) {
    const it = this.item; if (!this.active || !it) return;
    it.t += dt;
    if (it.state === 'show') {
      it.m.rotation.y += dt * 0.8;
      if (it.t > 4.5) {
        // it zips off and hides
        it.state = 'hide'; it.t = 0; it.from = it.g.position.clone();
        if (this.effects) this.effects.sparkle(it.from.clone(), it.def.color, 12, 0.1);
      }
    } else if (it.state === 'hide') {
      const u = Math.min(1, it.t / 1.2), e = u * u;
      it.g.scale.setScalar(Math.max(0.001, 1.2 * (1 - e)));
      if (u >= 1) { it.state = 'hidden'; it.t = 0; it.g.position.copy(it.spot); it.g.scale.setScalar(0.001); tweens.add(0.8, (k) => it.g.scale.setScalar(Math.max(0.001, k))); it.m.rotation.y = Math.random() * 6; }
    } else if (it.state === 'hidden') {
      it.search += dt;
      // how close is your gaze? (very forgiving: anywhere near it counts)
      const c = it.g.position.clone().add(new THREE.Vector3(0, 0.1, 0)), to = c.clone().sub(eye), d = to.length(); to.normalize();
      const ang = Math.acos(Math.min(1, Math.max(-1, to.dot(dir))));
      const tol = Math.max(THREE.MathUtils.degToRad(6), Math.atan(0.5 / d));
      if (ang < tol) it.dwell += dt; else it.dwell = Math.max(0, it.dwell - dt * 0.8);
      it.glow.material.opacity = 0.3 + 0.1 * Math.sin(time * 2) + (it.search > 60 ? 0.3 * (0.5 + 0.5 * Math.sin(time * 4)) : 0);
      // the ring that fills while you look at it
      this.ringSprite.visible = it.dwell > 0.05; this.ringSprite.position.copy(c); this.ringSprite.scale.setScalar(Math.max(0.25, d * 0.09));
      this.ringSprite.material.opacity = Math.min(1, it.dwell * 4); this._drawRing(Math.min(1, it.dwell / DWELL));
      // the warm / cold hum
      if (this.alwaysHum || it.search > 30) { const warm = Math.max(0, 1 - ang / 1.2); this._hum(0.25 + 0.75 * warm * warm, warm); } else this._hum(0);
      if (it.dwell >= DWELL) this._found(it, eye, dir);
    } else if (it.state === 'found') {
      const u = Math.min(1, it.t / 1.4), e = 1 - (1 - u) * (1 - u);
      it.g.position.copy(it.from).lerp(it.to, e); it.m.rotation.y += dt * 3;
      if (u >= 1 && !it.gone) { it.gone = true; tweens.add(0.6, (k) => it.g.scale.setScalar(Math.max(0.001, 1 - k)), { done: () => this.scene.remove(it.g) }); tweens.add(0.1, () => {}, { delay: 2.4, done: () => { if (this.active && this.item === it) this._next(this.lastEye || eye, this.lastDir || dir); } }); }
    }
    this.lastEye = eye.clone(); this.lastDir = dir.clone();
  }

  _found(it, eye, dir) {
    it.state = 'found'; it.t = 0; it.from = it.g.position.clone(); this.found++;
    const f = dir.clone(); f.y = 0; f.normalize(); it.to = eye.clone().addScaledVector(f, 0.8).add(new THREE.Vector3(0, -0.1, 0));
    this.ringSprite.visible = false; this._hum(0);
    if (this.effects) { this.effects.sparkle(it.from.clone().add(new THREE.Vector3(0, 0.1, 0)), it.def.color, 40, 0.25); }
    [523.25, 659.25, 783.99].forEach((hz, i) => setTimeout(() => this.sound.chime(it.from.clone(), hz), i * 140));
    if (this.onFound) this.onFound(it.def, this.found);
  }
}
