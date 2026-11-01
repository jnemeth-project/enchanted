// Lightweight glowing particle bursts: motes, spores, dandelion seeds, water, sparkles.
import * as THREE from 'three';
import { glowTexture } from './util.js';

export class Effects {
  constructor(scene) { this.scene = scene; this.bursts = []; }

  // spec: { count, size, color, life:[a,b], init(i, p, vel, data), step(i, p, vel, data, age, dt) -> alpha 0..1, done }
  burst(spec) {
    if (this.motion !== undefined && this.motion < 1) spec.count = Math.max(4, Math.round(spec.count * this.motion));
    const n = spec.count;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: spec.size || 0.03, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 4;
    this.scene.add(pts);
    const base = new THREE.Color(spec.color ?? 0xffffff);
    const P = [], V = [], D = [], life = [];
    for (let i = 0; i < n; i++) {
      const p = new THREE.Vector3(), vel = new THREE.Vector3(), d = {};
      spec.init(i, p, vel, d);
      P.push(p); V.push(vel); D.push(d);
      life.push(spec.life ? spec.life[0] + Math.random() * (spec.life[1] - spec.life[0]) : 2);
    }
    const b = { pts, geo, mat, P, V, D, life, age: 0, spec, base, n };
    this.bursts.push(b);
    this.update(0);
    return b;
  }

  update(dt) {
    for (let k = this.bursts.length - 1; k >= 0; k--) {
      const b = this.bursts[k]; b.age += dt;
      const pos = b.geo.attributes.position.array, col = b.geo.attributes.color.array;
      let alive = 0;
      for (let i = 0; i < b.n; i++) {
        const t = b.age / b.life[i];
        let a = 0;
        if (t < 1) {
          a = b.spec.step ? b.spec.step(i, b.P[i], b.V[i], b.D[i], b.age, dt, t) : 1;
          if (!b.spec.step) b.P[i].addScaledVector(b.V[i], dt);
          alive++;
        }
        pos[i * 3] = b.P[i].x; pos[i * 3 + 1] = b.P[i].y; pos[i * 3 + 2] = b.P[i].z;
        col[i * 3] = b.base.r * a; col[i * 3 + 1] = b.base.g * a; col[i * 3 + 2] = b.base.b * a;
      }
      b.geo.attributes.position.needsUpdate = true; b.geo.attributes.color.needsUpdate = true;
      if (!alive) {
        this.scene.remove(b.pts); b.geo.dispose(); b.mat.dispose(); this.bursts.splice(k, 1);
        if (b.spec.done) b.spec.done();
      }
    }
  }

  // Golden motes flowing from a squished glowdrop home to its cluster.
  motes(from, to, onArrive) {
    let arrived = false;
    return this.burst({
      count: 16, size: 0.035, color: 0xffc56b, life: [2.2, 3.0],
      init: (i, p, vel, d) => {
        p.copy(from); d.from = from.clone(); d.to = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8));
        d.mid = d.from.clone().lerp(d.to, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2));
        d.delay = Math.random() * 0.4;
      },
      step: (i, p, vel, d, age, dt, t) => {
        const u = Math.max(0, Math.min(1, (age - d.delay) / 2.0));
        const e = u * u * (3 - 2 * u);
        p.copy(d.from).multiplyScalar((1 - e) * (1 - e)).addScaledVector(d.mid, 2 * (1 - e) * e).addScaledVector(d.to, e * e);
        if (u >= 1 && !arrived) { arrived = true; onArrive && onArrive(); }
        return Math.sin(Math.min(1, t) * Math.PI) * 0.9 + 0.1;
      },
    });
  }

  spores(at, color, count = 26) {
    return this.burst({
      count, size: 0.028, color, life: [2.2, 3.6],
      init: (i, p, vel) => { p.copy(at); const a = Math.random() * 6.283; vel.set(Math.cos(a) * 0.25 * Math.random(), 0.25 + Math.random() * 0.35, Math.sin(a) * 0.25 * Math.random()); },
      step: (i, p, vel, d, age, dt, t) => { vel.multiplyScalar(1 - dt * 0.9); vel.y += dt * 0.02; p.addScaledVector(vel, dt); return (1 - t) * Math.min(1, t * 8); },
    });
  }

  seeds(at, count = 36) {
    const wind = new THREE.Vector3(0.35 + Math.random() * 0.2, 0.08, -0.1 + Math.random() * 0.2);
    return this.burst({
      count, size: 0.022, color: 0xfff1d8, life: [6, 10],
      init: (i, p, vel, d) => { p.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1)); vel.set((Math.random() - 0.5) * 0.25, 0.15 + Math.random() * 0.2, (Math.random() - 0.5) * 0.25); d.ph = Math.random() * 6.28; },
      step: (i, p, vel, d, age, dt, t) => { vel.lerp(wind, dt * 0.4); p.addScaledVector(vel, dt); p.x += Math.sin(age * 1.3 + d.ph) * dt * 0.05; return (1 - t) * Math.min(1, t * 10); },
    });
  }

  sparkle(at, color = 0xcfe4ff, count = 40, radius = 0.25) {
    return this.burst({
      count, size: 0.03, color, life: [1.6, 2.8],
      init: (i, p, vel) => { const a = Math.random() * 6.283, r = Math.random() * radius; p.copy(at).add(new THREE.Vector3(Math.cos(a) * r, Math.random() * radius * 1.5, Math.sin(a) * r)); vel.set(0, 0.12 + Math.random() * 0.1, 0); },
      step: (i, p, vel, d, age, dt, t) => { p.addScaledVector(vel, dt); return Math.sin(t * Math.PI); },
    });
  }

  water(from, aim) { // a short glowing stream falling from a tipped palm
    return this.burst({
      count: 6, size: 0.018, color: 0xa9d6ff, life: [0.5, 0.8],
      init: (i, p, vel) => { p.copy(from).add(new THREE.Vector3((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.02)); vel.set(aim.x * 0.2, -0.2, aim.z * 0.2); },
      step: (i, p, vel, d, age, dt, t) => { vel.y -= 9.8 * dt; p.addScaledVector(vel, dt); return 1 - t * 0.5; },
    });
  }
}
