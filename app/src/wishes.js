// Shooting stars: every so often, a single soft streak of light slides across the sky low over the trees
// (more often, and higher, while the canopy is open for stargazing). It is quiet and brief. If you happen to
// be looking at it, a little gold wish sparkle appears in front of you with a soft chime; the very first
// time, a gentle "Make a wish".
import * as THREE from 'three';
import { glowTexture } from './util.js';

const N = 46;
const rnd = (a, b) => a + Math.random() * (b - a);

export class ShootingStars {
  constructor(scene) {
    this.pos = new Float32Array(N * 3).fill(-9999); this.col = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTexture(), size: 2.2, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.pts.frustumCulled = false; this.pts.renderOrder = -4; this.pts.visible = false; scene.add(this.pts);
    this.t = 0; this.next = rnd(25, 45); this.cur = null; this.onWish = null; this.skyOpen = false;
  }
  _spawn(eye, look) {
    // somewhere roughly where you are facing, so there is a fair chance to see it
    const yaw = Math.atan2(look.x, -look.z) + rnd(-1.0, 1.0);
    const el = this.skyOpen ? rnd(0.6, 1.15) : rnd(0.2, 0.5);
    const dir = (az, e) => new THREE.Vector3(Math.sin(az) * Math.cos(e), Math.sin(e), -Math.cos(az) * Math.cos(e));
    const side = Math.random() < 0.5 ? -1 : 1, span = rnd(0.2, 0.32);
    const R = 110;
    this.cur = { a: eye.clone().addScaledVector(dir(yaw, el + 0.05), R), b: eye.clone().addScaledVector(dir(yaw + side * span, el - span * 0.45), R), u: 0, dur: rnd(0.8, 1.15), seen: false };
    this.pts.visible = true;
  }
  update(dt, eye, look) {
    this.t += dt;
    if (!this.cur && this.t > this.next) { this.t = 0; this.next = this.skyOpen ? rnd(18, 35) : rnd(45, 90); this._spawn(eye, look); }
    const c = this.cur; if (!c) return;
    c.u += dt / c.dur;
    const fade = Math.min(1, c.u * 5) * Math.min(1, (1 - c.u) * 4 + 0.15);
    const head = new THREE.Vector3();
    for (let k = 0; k < N; k++) {
      const s = Math.max(0, Math.min(1, c.u - k * 0.008));
      const p = head.copy(c.a).lerp(c.b, 1 - (1 - s) * (1 - s));
      this.pos[k * 3] = p.x; this.pos[k * 3 + 1] = p.y; this.pos[k * 3 + 2] = p.z;
      const b = Math.pow(1 - k / N, 1.6) * fade * (k === 0 ? 1.4 : 1);
      this.col[k * 3] = b; this.col[k * 3 + 1] = b * 0.96; this.col[k * 3 + 2] = b * 0.86;
    }
    this.pts.geometry.attributes.position.needsUpdate = true; this.pts.geometry.attributes.color.needsUpdate = true;
    // were you looking at it?
    head.copy(c.a).lerp(c.b, c.u).sub(eye).normalize();
    if (head.dot(look) > Math.cos(THREE.MathUtils.degToRad(22))) c.seen = true;
    if (c.u >= 1) { this.pts.visible = false; this.cur = null; if (c.seen && this.onWish) this.onWish(); }
  }
}
