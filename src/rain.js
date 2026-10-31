// Soft rain at the end of the night. Cup a palm to catch it, tip it over the stump to water the seed.
import * as THREE from 'three';
import { damp, rand } from './util.js';

const N = 900, R = 7, TOP = 9;

export class Rain {
  constructor(scene, sound, effects, seed) {
    this.scene = scene; this.sound = sound; this.effects = effects; this.seed = seed;
    this.level = 0; this.target = 0; this.time = 0; this.catchRate = 0.12; this.onPour = null;
    const pos = new Float32Array(N * 6);
    this.drops = [];
    for (let i = 0; i < N; i++) this.drops.push(this._respawn({}, true));
    this.geo = new THREE.BufferGeometry(); this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xa8d0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.lines = new THREE.LineSegments(this.geo, this.mat); this.lines.frustumCulled = false; this.lines.visible = false;
    scene.add(this.lines);
    // the water you catch: a little pool of clear blue water sitting in your palm, filling up as you catch,
    // with a bright rippling surface and raindrops you can see falling into it and splashing
    const dome = new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const dropGeo = new THREE.SphereGeometry(1, 8, 6);
    this.palms = [0, 1].map(() => {
      const g = new THREE.Group(); g.visible = false; scene.add(g);
      const body = new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ color: 0x2f8cff, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide }));
      body.rotation.x = Math.PI / 2; // the dome bulges out of the palm
      const shine = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.95, 28), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      const glint = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      glint.position.set(-0.3, 0.3, 0.02);
      const surf = new THREE.Group(); surf.add(shine, glint);
      g.add(body, surf);
      const drops = [0, 1, 2, 3, 4, 5].map(() => { const d = new THREE.Mesh(dropGeo, new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.9, depthWrite: false })); d.visible = false; d.scale.set(0.0035, 0.011, 0.0035); scene.add(d); return { m: d, y: 0, on: false }; });
      return { g, body, surf, shine, drops, water: 0, pouring: false, stop: null, dripT: 0, dropT: 0 };
    });
    this.tmpQ = new THREE.Quaternion();
  }

  _respawn(d, anywhere = false) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
    d.x = Math.cos(a) * r; d.z = Math.sin(a) * r; d.y = anywhere ? Math.random() * TOP : TOP + Math.random() * 2;
    d.v = rand(4.2, 5.6); d.len = rand(0.14, 0.26);
    return d;
  }

  start() { this.target = 1; this.lines.visible = true; }
  // how much rain the fullest hand is holding (0..1)
  get held() { return Math.max(this.palms[0].water, this.palms[1].water); }
  stop() { this.target = 0; }
  get active() { return this.level > 0.05; }

  update(dt, input) {
    this.time += dt;
    this.level = damp(this.level, this.target, 0.35, dt);
    this.sound.rain(this.level);
    this.mat.opacity = 0.45 * this.level; // a little easier to see
    if (this.level < 0.01 && this.target === 0) this.lines.visible = false;
    if (this.lines.visible) {
      const p = this.geo.attributes.position.array, live = Math.floor(N * this.level * (this.calm ? 0.45 : 1)), sp = this.calm ? 0.5 : 1; // Calm motion: fewer, slower drops
      for (let i = 0; i < N; i++) {
        const d = this.drops[i];
        if (i < live) { d.y -= d.v * dt * sp; if (d.y < 0) this._respawn(d); } else d.y = -10;
        p[i * 6] = d.x; p[i * 6 + 1] = d.y; p[i * 6 + 2] = d.z;
        p[i * 6 + 3] = d.x + 0.01; p[i * 6 + 4] = d.y + d.len; p[i * 6 + 5] = d.z;
      }
      this.geo.attributes.position.needsUpdate = true;
    }
    // Catching and pouring with each hand.
    input.hands.forEach((h, i) => {
      const P = this.palms[i];
      if (!h.present) { P.g.visible = false; for (const d of P.drops) { d.on = false; d.m.visible = false; } if (P.stop) { P.stop(); P.stop = null; } return; }
      const up = h.palmNormal.y;
      if (this.level > 0.3 && up > 0.55) {
        P.water = Math.min(1, P.water + dt * this.catchRate * this.level);
        P.dripT -= dt; if (P.dripT <= 0) { P.dripT = rand(0.25, 0.6); this.sound.drip(h.palm); }
        // a raindrop you can see, falling into your hand
        P.dropT -= dt;
        if (P.dropT <= 0) { P.dropT = rand(0.08, 0.2); const d = P.drops.find((x) => !x.on); if (d) { d.on = true; d.y = rand(0.25, 0.45); d.ox = rand(-0.025, 0.025); d.oz = rand(-0.025, 0.025); d.m.visible = true; } }
      }
      for (const d of P.drops) {
        if (!d.on) continue;
        d.y -= dt * 2.6;
        d.m.position.set(h.palm.x + d.ox, h.palm.y + 0.012 + Math.max(0, d.y), h.palm.z + d.oz);
        if (d.y <= 0) { d.on = false; d.m.visible = false; this.effects.sparkle(d.m.position.clone(), 0x9fd4ff, 4, 0.02); }
      }
      const pouring = P.water > 0.03 && up < 0.2;
      if (pouring) {
        const flow = Math.min(P.water, dt * 0.45); P.water -= flow;
        const lip = h.palm.clone().addScaledVector(h.palmNormal, 0.015);
        if (Math.random() < 0.7) this.effects.water(lip, new THREE.Vector3(h.palmNormal.x, 0, h.palmNormal.z));
        if (!P.stop) P.stop = this.sound.trickle(lip);
        const tgt = this.seed.target;
        const horiz = Math.hypot(lip.x - tgt.x, lip.z - tgt.z);
        if (horiz < 0.22 && lip.y > tgt.y - 0.02) { this.seed.receiveWater(flow * 1.6); if (this.onPour) this.onPour(); }
      } else if (P.stop) { P.stop(); P.stop = null; }
      P.g.visible = P.water > 0.02;
      if (P.g.visible) {
        // the pool grows wider and deeper as you catch more
        const r = 0.022 + 0.026 * P.water, depth = 0.004 + 0.016 * P.water;
        P.g.position.copy(h.palm).addScaledVector(h.palmNormal, 0.008);
        P.g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), h.palmNormal);
        P.body.scale.set(r, depth, r);
        P.surf.position.z = depth; P.surf.scale.setScalar(r * (1 + 0.04 * Math.sin(this.time * 7)));
        P.shine.rotation.z = this.time * 0.6;
        P.shine.material.opacity = 0.35 + 0.2 * Math.sin(this.time * 5);
        P.body.material.opacity = 0.62 + 0.25 * P.water;
      }
    });
  }

  // Gaze, controller or mouse: point at the stump while it rains to pour the rain you've gathered.
  pick(ray) {
    if (this.level < 0.3) return null;
    const tgt = this.seed.target;
    if (ray.distanceToPoint(tgt) >= 0.28) return null;
    return { key: 'stump', size: 0.42, point: tgt.clone(), fire: () => {
      const from = tgt.clone().add(new THREE.Vector3(0, 0.6, 0));
      for (let i = 0; i < 12; i++) setTimeout(() => this.effects.water(from, new THREE.Vector3()), i * 120);
      const stop = this.sound.trickle(tgt); setTimeout(stop, 1600);
      setTimeout(() => { this.seed.receiveWater(1); if (this.onPour) this.onPour(); }, 1200);
    } };
  }
}
