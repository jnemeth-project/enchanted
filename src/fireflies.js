// Fireflies: they drift in from the forest in a group of ten and hover within reach.
// Boop one (touch it, pinch it, point at it or look at it) and its light gently goes out;
// the little dark firefly floats down into the ferns to sleep. Nothing is squished.
import * as THREE from 'three';
import { glowTexture, rand, clamp } from './util.js';

const WARM = new THREE.Color(0.86, 1.0, 0.42);   // firefly yellow-green
const CORE = new THREE.Color(1.0, 0.98, 0.8);

// A loose cloud of spots in comfortable seated reach (player faces -Z), never too close together.
function cloudSlots(n, rnd = Math.random) {
  const out = [];
  for (let tries = 0; out.length < n && tries < 2000; tries++) {
    const p = new THREE.Vector3(-0.42 + rnd() * 0.84, 0.86 + rnd() * 0.5, -0.32 - rnd() * 0.3);
    const ang = Math.atan2(p.x, -p.z); if (Math.abs(ang) > 0.85) continue;
    if (out.every((q) => q.distanceTo(p) > 0.12)) out.push(p);
  }
  return out;
}

export class Fireflies {
  constructor(scene, sleep, sound) {
    this.scene = scene; this.sleep = sleep; this.sound = sound;
    this.list = []; this.batch = 0; this.batches = 1; this.batchSize = 10; this.outCount = 0;
    this.fast = false; this.big = false;
    this.bodyGeo = new THREE.SphereGeometry(1, 10, 8);
    this.bodyMat = new THREE.MeshBasicMaterial({ color: 0x1c1a12 });
    this.onOut = null; this.onBatchDone = null;
  }

  // plan how many groups of fireflies tonight, so each one tucks in its share of the forest
  plan(batches, size = 10) { this.batches = batches; this.batchSize = size; this.batch = 0; this.outCount = 0; this.dismissed = false; }

  startBatch() {
    const slots = cloudSlots(this.batchSize);
    const homes = this.sleep.order.map((gi) => this.sleep.homeOf(gi));
    slots.forEach((to, k) => {
      const from = homes[(this.batch * 3 + k) % homes.length].clone().add(new THREE.Vector3(rand(-0.6, 0.6), rand(0, 0.8), rand(-0.6, 0.6)));
      this._spawn(from, to, k * (this.fast ? 0.12 : 0.35), this.batch * this.batchSize + k);
    });
    this.batch++;
  }

  _spawn(from, to, delay, index) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat); body.scale.set(0.0045, 0.0045, 0.009); body.visible = false; g.add(body);
    const k = this.big ? 1.35 : 1;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: WARM, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(0.085 * k); halo.renderOrder = 4; g.add(halo);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: CORE, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    core.scale.setScalar(0.022 * k); core.renderOrder = 4; g.add(core);
    g.position.copy(from); g.visible = false; this.scene.add(g);
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(rand(-0.8, 0.8), rand(0.4, 1.2), rand(-0.5, 0.5)));
    const total = this.batches * this.batchSize;
    const gi = this.sleep.order[Math.min(this.sleep.order.length - 1, Math.floor(index * this.sleep.order.length / total))];
    this.list.push({
      g, body, halo, core, from, mid, to, gi, t: -delay, dur: this.fast ? rand(2.2, 2.8) : clamp(from.distanceTo(to) / 2.2, 3.5, 7),
      state: 'fly', light: 0, ph: Math.random() * 10, wait: 0, held: false, outT: 0, r: 0.045 * k,
    });
  }

  get lit() { return this.list.filter((f) => f.state === 'fly' || f.state === 'wait'); }
  get waiting() { return this.list.filter((f) => f.state === 'wait' && !f.held); }
  get allDone() { return this.batch >= this.batches && this.lit.length === 0; }

  update(dt, time, input) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      if (f.state === 'fly') {
        f.t += dt; if (f.t < 0) continue;
        f.g.visible = true;
        const u = Math.min(1, f.t / f.dur), e = u * u * (3 - 2 * u);
        f.g.position.copy(f.from).multiplyScalar((1 - e) * (1 - e)).addScaledVector(f.mid, 2 * (1 - e) * e).addScaledVector(f.to, e * e);
        f.light = Math.min(1, f.t / 0.8);
        if (u >= 1) f.state = 'wait';
        if (u > 0.7) this._touch(f, input);
      } else if (f.state === 'wait') {
        f.wait += dt;
        if (f.wait > 20 && !f.nudged) { f.nudged = true; f.to.lerp(new THREE.Vector3(0, 1.02, -0.3), 0.4); } // drift a little closer if missed
        if (!f.held) {
          const goal = f.to.clone().add(new THREE.Vector3(Math.sin(time * 0.6 + f.ph) * 0.035, Math.sin(time * 0.9 + f.ph * 1.7) * 0.025, Math.cos(time * 0.5 + f.ph) * 0.02));
          f.g.position.lerp(goal, 1 - Math.exp(-2.2 * dt));
        }
        this._touch(f, input);
      } else if (f.state === 'out') {
        // the light fades, then the dark little firefly floats down and away to sleep
        f.outT += dt;
        f.light = Math.max(0, 1 - f.outT / 0.9);
        if (f.outT > 0.6) { f.g.position.y -= dt * 0.12; f.g.position.x += Math.sin(f.outT * 2 + f.ph) * dt * 0.03; f.g.position.z -= dt * 0.08; }
        if (f.outT > 4) { this.scene.remove(f.g); f.halo.material.dispose(); f.core.material.dispose(); this.list.splice(i, 1); continue; }
      }
      // a slow firefly glow: breathes, with an occasional brighter flash
      const breath = 0.72 + 0.28 * Math.sin(time * 1.3 + f.ph);
      const flash = Math.pow(Math.max(0, Math.sin(time * 0.37 + f.ph * 2.1)), 16);
      const L = f.light * (breath + 0.45 * flash);
      f.halo.material.opacity = 0.9 * L; f.core.material.opacity = Math.min(1, 1.2 * L);
      f.halo.scale.setScalar(0.1 * (this.big ? 1.35 : 1) * (0.85 + 0.3 * L));
      f.body.visible = f.state === 'out' && f.light < 0.5; // the little dark firefly only shows once its light is out
    }
    if (!this.dismissed && this.batch > 0 && this.batch <= this.batches && this.lit.length === 0 && !this._doneFired) {
      this._doneFired = true; const b = this.batch;
      if (this.onBatchDone) this.onBatchDone(b);
    }
    if (this.lit.length > 0) this._doneFired = false;
  }

  _touch(f, input) {
    if (f.held) return;
    const c = f.g.position;
    for (const h of input.hands) {
      if (!h.present) continue;
      let hit = h.pinching && h.pinchPoint.distanceTo(c) < f.r * 1.4;
      for (let k = 1; k < 5 && !hit; k++) if (h.tips[k].distanceTo(c) < f.r) hit = true;
      if (!hit && h.palm.distanceTo(c) < f.r * 1.1) hit = true;
      if (hit) { this.putOut(f); return; }
    }
  }

  pick(ray) {
    let best = null, bd = 1e9;
    for (const f of this.list) {
      if ((f.state !== 'wait' && f.state !== 'fly') || f.t < 0 || f.held) continue;
      const along = f.g.position.distanceTo(ray.origin);
      if (ray.distanceToPoint(f.g.position) < Math.max(0.05, along * 0.035) && along < bd) { bd = along; best = f; }
    }
    return best ? { key: best, size: 0.07, point: best.g.position.clone(), fire: () => this.putOut(best) } : null;
  }

  putOut(f) {
    if (f.state === 'out') return;
    f.state = 'out'; f.outT = 0; f.held = false; this.outCount++;
    this.sound.hush(f.g.position, [196, 220, 246.94, 293.66, 329.63][this.outCount % 5]);
    this.sleep.putToSleep(f.gi);
    if (this.onOut) this.onOut(f);
  }

  // quietly let any still lit drift away (used when the night moves on)
  dismiss() { for (const f of this.list) if (f.state !== 'out') { f.state = 'out'; f.outT = 0; } this.dismissed = true; }
}
