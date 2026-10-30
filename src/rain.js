// Soft rain at the end of the night. Cup a palm to catch it, tip it over the stump to water the seed.
import * as THREE from 'three';
import { damp, rand } from './util.js';

const N = 900, R = 7, TOP = 9;

export class Rain {
  constructor(scene, sound, effects, seed) {
    this.scene = scene; this.sound = sound; this.effects = effects; this.seed = seed;
    this.level = 0; this.target = 0; this.time = 0;
    const pos = new Float32Array(N * 6);
    this.drops = [];
    for (let i = 0; i < N; i++) this.drops.push(this._respawn({}, true));
    this.geo = new THREE.BufferGeometry(); this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.lines = new THREE.LineSegments(this.geo, this.mat); this.lines.frustumCulled = false; this.lines.visible = false;
    scene.add(this.lines);
    this.palms = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x8fc8ff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false; scene.add(m);
      return { mesh: m, water: 0, pouring: false, stop: null, dripT: 0 };
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
  stop() { this.target = 0; }
  get active() { return this.level > 0.05; }

  update(dt, input) {
    this.time += dt;
    this.level = damp(this.level, this.target, 0.35, dt);
    this.sound.rain(this.level);
    this.mat.opacity = 0.32 * this.level;
    if (this.level < 0.01 && this.target === 0) this.lines.visible = false;
    if (this.lines.visible) {
      const p = this.geo.attributes.position.array, live = Math.floor(N * this.level);
      for (let i = 0; i < N; i++) {
        const d = this.drops[i];
        if (i < live) { d.y -= d.v * dt; if (d.y < 0) this._respawn(d); } else d.y = -10;
        p[i * 6] = d.x; p[i * 6 + 1] = d.y; p[i * 6 + 2] = d.z;
        p[i * 6 + 3] = d.x + 0.01; p[i * 6 + 4] = d.y + d.len; p[i * 6 + 5] = d.z;
      }
      this.geo.attributes.position.needsUpdate = true;
    }
    // Catching and pouring with each hand.
    input.hands.forEach((h, i) => {
      const P = this.palms[i];
      if (!h.present) { P.mesh.visible = false; if (P.stop) { P.stop(); P.stop = null; } return; }
      const up = h.palmNormal.y;
      if (this.level > 0.3 && up > 0.55) {
        P.water = Math.min(1, P.water + dt * 0.12 * this.level);
        P.dripT -= dt; if (P.dripT <= 0) { P.dripT = rand(0.25, 0.6); this.sound.drip(h.palm); }
      }
      const pouring = P.water > 0.03 && up < 0.2;
      if (pouring) {
        const flow = Math.min(P.water, dt * 0.45); P.water -= flow;
        const lip = h.palm.clone().addScaledVector(h.palmNormal, 0.015);
        if (Math.random() < 0.7) this.effects.water(lip, new THREE.Vector3(h.palmNormal.x, 0, h.palmNormal.z));
        if (!P.stop) P.stop = this.sound.trickle(lip);
        const tgt = this.seed.target;
        const horiz = Math.hypot(lip.x - tgt.x, lip.z - tgt.z);
        if (horiz < 0.22 && lip.y > tgt.y - 0.02) this.seed.receiveWater(flow * 1.6);
      } else if (P.stop) { P.stop(); P.stop = null; }
      P.mesh.visible = P.water > 0.02;
      if (P.mesh.visible) {
        P.mesh.position.copy(h.palm).addScaledVector(h.palmNormal, 0.012);
        P.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), h.palmNormal);
        P.mesh.scale.setScalar(0.018 + 0.03 * P.water);
        P.mesh.material.opacity = 0.35 + 0.3 * Math.sin(this.time * 3) * 0.2 + 0.25 * P.water;
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
      setTimeout(() => this.seed.receiveWater(1), 1200);
    } };
  }
}
