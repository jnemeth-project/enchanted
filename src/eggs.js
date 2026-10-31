// Little surprises for people who poke at things. None of them ask anything of you or pop up uninvited:
// each one only answers something you did.
//  - Boop the butterfly: it does a happy little loop. Keep poking it and it has words for you.
//  - Knock three times on the white tree: "Nobody's home... or are they?" Knock again and its lights glow.
//  - Wave up at the moon: it winks back.
//  - Sing to the mushrooms (an option on the start screen, uses the microphone): the ones near you glow along.
//  - Up past midnight: the owls approve.
import * as THREE from 'three';
import { tweens } from './util.js';

const v3 = () => new THREE.Vector3();

export class Eggs {
  constructor({ W, guide, sound, effects, say, eye, look, shelfLights, touch, resumeGuide }) {
    Object.assign(this, { W, guide, sound, effects, say, eye, look, shelfLights, touch, resumeGuide });
    this.t = 0;
    this.pokes = []; this.inBfly = [false, false]; this.enoughAt = -99; this.awakeAt = -99;
    this.tree = W.byName.WiseTree || W.byName.G_WiseTree;
    this.treeBox = this.tree ? new THREE.Box3().setFromObject(this.tree) : null;
    if (this.treeBox) this.treeBox.max.y = Math.min(this.treeBox.max.y, 2.2);
    this.ray = new THREE.Raycaster(); this.knocks = []; this.knockCool = [0, 0]; this.toldHome = -99;
    this.wave = { last: 0, flips: [], said: -99 };
    this.voice = null;
  }

  // ------------------------------------------------------------ the butterfly
  _bfly(input) {
    const g = this.guide; if (!g.group.visible) return;
    const calm = ['hover', 'perch', 'rest', 'twirl'].includes(g.mode); if (!calm) return;
    input.hands.forEach((h, i) => {
      let inside = false;
      if (h.present) for (let k = 1; k < 5 && !inside; k++) if (h.tips[k] && h.tips[k].distanceTo(g.pos) < 0.065) inside = true;
      if (inside && !this.inBfly[i]) this._boop();
      this.inBfly[i] = inside;
    });
  }
  _boop() {
    const g = this.guide, now = this.t;
    this.pokes = this.pokes.filter((x) => now - x < 3.5); this.pokes.push(now);
    this.sound.boop(g.pos.clone(), 700 + Math.random() * 120);
    this.effects.sparkle(g.pos.clone(), 0xfff1c8, 6, 0.04);
    if (this.pokes.length >= 6 && now - this.enoughAt > 25) {
      // that is quite enough poking: it flutters off a little way, then comes back when you have settled
      this.enoughAt = now; this.pokes = [];
      this.say("Okay, all right…\nthat's enough 😄", { hold: 3 });
      const away = g.pos.clone().add(new THREE.Vector3(0.25, 0.3, -0.35));
      g.goTo(away, { speed: 1.4 });
      tweens.add(0.1, () => {}, { delay: 5, done: () => this.resumeGuide && this.resumeGuide() });
      return;
    }
    if (this.pokes.length === 3 && now - this.awakeAt > 25) { this.awakeAt = now; this.say("Okay, okay,\nI'm awake!", { hold: 2.4 }); }
    if (g.mode !== 'twirl') {
      const mode = g.mode, at = g.target.clone();
      g.twirl(() => { if (mode === 'rest') g.rest(at); else if (mode === 'perch') g.perch(at); else g.goTo(at, { speed: 0.6 }); });
    }
  }

  // ------------------------------------------------------------ knocking on the white tree
  _knock(input, dt) {
    if (!this.tree) return;
    input.hands.forEach((h, i) => {
      this.knockCool[i] = Math.max(0, this.knockCool[i] - dt);
      if (!h.present || h._holding || this.knockCool[i] > 0 || (h.speed || 0) < 0.7) return;
      if (this.treeBox.distanceToPoint(h.palm) > 0.25) return;
      // the knuckles (the middle finger's tip area, or the palm) moving fast toward the bark
      const p = h.tips[3] || h.palm, vel = h.palmVel.clone(), sp = vel.length(); if (sp < 0.7) return;
      const dir = vel.divideScalar(sp);
      this.ray.set(p.clone().addScaledVector(dir, -0.04), dir); this.ray.far = 0.04 + Math.min(0.08, sp * dt * 1.5);
      const hit = this.ray.intersectObject(this.tree, true)[0];
      if (!hit || (hit.face && hit.face.normal && hit.face.normal.clone().transformDirection(hit.object.matrixWorld).dot(dir) > -0.4)) return;
      this.knockCool[i] = 0.22;
      this.sound.knock(hit.point.clone());
      this.knocks = this.knocks.filter((x) => this.t - x < 1.4 * (this.knocks.length + 1)); this.knocks.push(this.t); this.lastKnockAt = hit.point.clone();
      if (this.t - this.toldHome < 9 && this.toldHome > 0) { this._glowTree(); this.toldHome = -99; this.knocks = []; }
    });
    // three knocks, then a pause: is anybody in?
    if (this.knocks.length && this.t - this.knocks[this.knocks.length - 1] > 1.0) {
      if (this.knocks.length >= 3) { this.say("Nobody's home…\nor are they?", { hold: 3 }); this.toldHome = this.t; }
      this.knocks = [];
    }
  }
  _glowTree() {
    // somebody is home after all: every fairy light in the tree glows up warmly for a moment
    if (this.shelfLights) this.shelfLights.boost = 2.5;
    this.sound.chime(this.lastKnockAt || this.eye(), 659.25);
    if (this.lastKnockAt) this.effects.sparkle(this.lastKnockAt.clone(), 0xffd9a0, 22, 0.15);
  }

  // ------------------------------------------------------------ waving at the moon
  _moon(input) {
    const W = this.W, disc = W.moon && W.moon.disc; if (!disc || !W.moonDir || W.moonDir.y < 0.05) return;
    const eye = this.eye(), look = this.look();
    if (look.dot(W.moonDir) < Math.cos(THREE.MathUtils.degToRad(40))) { this.wave.flips = []; return; }
    const right = new THREE.Vector3().crossVectors(look, new THREE.Vector3(0, 1, 0)).normalize();
    input.hands.forEach((h) => {
      if (!h.present || h.palm.y < eye.y - 0.1) return;           // a hand raised up toward the sky
      const vx = h.palmVel.dot(right);
      if (Math.abs(vx) < 0.3) return;
      const sgn = Math.sign(vx);
      if (sgn !== this.wave.last) { this.wave.last = sgn; this.wave.flips.push(this.t); }
    });
    this.wave.flips = this.wave.flips.filter((x) => this.t - x < 2.5);
    if (this.wave.flips.length >= 4 && this.t - this.wave.said > 20) {
      this.wave.said = this.t; this.wave.flips = [];
      // a slow wink: the moon closes like an eyelid, then opens again
      const s0 = disc.scale.y;
      tweens.add(0.28, (e) => { disc.scale.y = s0 * (1 - 0.9 * e); }, { done: () => tweens.add(0.4, (e) => { disc.scale.y = s0 * (0.1 + 0.9 * e); }, { delay: 0.15, done: () => { disc.scale.y = s0; } }) });
      this.sound.chime(eye.clone().addScaledVector(W.moonDir, 3), 783.99);
    }
  }

  // ------------------------------------------------------------ singing to the mushrooms
  async startVoice(ctx) {
    if (this.voice || !ctx || !navigator.mediaDevices) return;
    this.voice = { level: 0, floor: 0.01 };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
      this.voice.an = an; this.voice.buf = new Float32Array(an.fftSize);
    } catch { this.voice.off = true; }
  }
  _voice(dt) {
    const V = this.voice; if (!V || !V.an || !this.touch) return;
    V.an.getFloatTimeDomainData(V.buf);
    let s = 0; for (const x of V.buf) s += x * x; const rms = Math.sqrt(s / V.buf.length);
    // follow the room's quiet level slowly, so only your voice (not the background) makes them glow
    V.floor = rms < V.floor ? V.floor * 0.9 + rms * 0.1 : V.floor * 0.999 + rms * 0.001;
    const target = Math.min(1, Math.max(0, (rms - V.floor * 2.2) * 18));
    V.level += (target - V.level) * Math.min(1, dt * (target > V.level ? 12 : 3));
    if (V.level < 0.03) return;
    const eye = this.eye();
    for (const it of this.touch.items) if (it.kind === 'boop' && it.center && it.center.distanceTo(eye) < 2.6) it.flash = Math.max(it.flash, V.level * 0.7);
  }

  // ------------------------------------------------------------ up late
  lateWelcome() {
    const h = new Date().getHours();
    if (h >= 0 && h < 4) tweens.add(0.1, () => {}, { delay: 6, done: () => this.say("You're up late 🌙\nThe owls approve", { hold: 3.2 }) });
  }

  update(dt, input) {
    this.t += dt;
    this._bfly(input); this._knock(input, dt); this._moon(input); this._voice(dt);
  }
}
