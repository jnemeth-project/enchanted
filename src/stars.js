// Stargazing: the trees overhead part, and a few bright, sleepy stars wait in the open sky.
// Point at one (hand, controller, gaze or mouse) and pinch or tap: it softly dims and goes to sleep.
// The star you are pointing at brightens a little, so it is always clear which one you will touch.
import * as THREE from 'three';
import { glowTexture, rand } from './util.js';

const DIST = 36;
// three loose little constellations, overhead and a little in front (azimuth, elevation in degrees)
const SHAPES = [
  [[-38, 52], [-30, 58], [-22, 55], [-16, 62], [-25, 66]],
  [[-4, 74], [6, 70], [14, 76], [8, 82], [-2, 84], [20, 68]],
  [[30, 50], [38, 56], [46, 52], [52, 60], [42, 64]],
];
const PALE = new THREE.Color(0.86, 0.9, 1.0), WARMSTAR = new THREE.Color(1.0, 0.92, 0.8);

export class Stars {
  constructor(scene, sound, eye) {
    this.scene = scene; this.sound = sound; this.eye = eye.clone();
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.list = []; this.level = 0; this.target = 0; this.out = 0; this.hover = null;
    const tex = glowTexture();
    let n = 0;
    for (const shape of SHAPES) for (const [az, el] of shape) {
      const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el + rand(-1.5, 1.5));
      const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
      const col = n % 3 === 0 ? WARMSTAR : PALE;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
      const size = rand(1.2, 1.8);
      glow.scale.setScalar(size * 2.2); core.scale.setScalar(size * 0.6);
      glow.renderOrder = core.renderOrder = -4;
      const p = this.eye.clone().addScaledVector(dir, DIST);
      glow.position.copy(p); core.position.copy(p);
      this.group.add(glow, core);
      this.list.push({ dir, p, glow, core, size, ph: Math.random() * 10, light: 1, state: 'awake', hot: 0, outT: 0, note: [146.83, 164.81, 196, 220, 246.94][n % 5] });
      n++;
    }
    this.onOut = null; this.onAllOut = null;
  }

  get total() { return this.list.length; }
  get awake() { return this.list.filter((s) => s.state === 'awake'); }

  start() { this.group.visible = true; this.target = 1; }

  // a fresh sky of awake stars, scattered overhead (used for later waves in a longer session)
  wake(scatter = true) {
    for (const st of this.list) {
      if (scatter) {
        const a = THREE.MathUtils.degToRad(rand(-55, 55)), e = THREE.MathUtils.degToRad(rand(42, 84));
        st.dir.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
        st.p.copy(this.eye).addScaledVector(st.dir, DIST); st.glow.position.copy(st.p); st.core.position.copy(st.p);
      }
      st.state = 'awake'; st.light = 0; st.outT = 0; st.hot = 0;
    }
    this.out = 0; this.allFired = false; this.start();
  }
  stop() { this.target = 0; }

  // which star a ray points at: the closest within a few degrees
  _aim(ray) {
    let best = null, bd = THREE.MathUtils.degToRad(4.5);
    for (const s of this.list) {
      if (s.state !== 'awake') continue;
      const to = s.p.clone().sub(ray.origin).normalize();
      const ang = to.angleTo(ray.direction);
      if (ang < bd) { bd = ang; best = s; }
    }
    return best;
  }

  update(dt, time, input) {
    this.level += (this.target - this.level) * Math.min(1, dt * 0.5);
    if (!this.group.visible) return;
    // highlight whatever a hand or controller is pointing at
    let hover = null;
    if (input.aim) for (const a of input.aim) if (a) { const s = this._aim(a.ray); if (s) hover = s; }
    this.hover = hover;
    for (const s of this.list) {
      s.hot += ((s === hover ? 1 : 0) - s.hot) * Math.min(1, dt * 6);
      if (s.state === 'out') { s.outT += dt; s.light = Math.max(0.06, 1 - s.outT / 2.4); }
      else s.light = Math.min(1, s.light + dt * 0.5); // new stars fade in
      const tw = 0.8 + 0.2 * Math.sin(time * (1.1 + (s.ph % 1)) + s.ph);
      const L = this.level * s.light * tw;
      s.glow.material.opacity = 0.55 * L * (1 + 0.6 * s.hot);
      s.core.material.opacity = Math.min(1, 0.95 * L * (1 + 0.3 * s.hot));
      s.glow.scale.setScalar(s.size * 2.2 * (1 + 0.45 * s.hot));
    }
  }

  pick(ray) {
    const s = this._aim(ray);
    return s ? { key: s, size: 2.6, point: s.p.clone(), fire: () => this.putOut(s) } : null;
  }

  putOut(s) {
    if (s.state !== 'awake') return;
    s.state = 'out'; s.outT = 0; this.out++;
    this.sound.hush(this.eye.clone().addScaledVector(s.dir, 3), s.note);
    if (this.onOut) this.onOut(s);
    if (this.out >= this.total && this.onAllOut) this.onAllOut();
  }
}
