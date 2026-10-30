// "What would you like tonight?" Two glowing lanterns float in front of you.
// Touch one, pinch it, point at it, look at it (look-to-select) or click it.
import * as THREE from 'three';
import { glowTexture, tweens } from './util.js';

function label(title, sub) {
  const W = 1024, H = 360, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(190, 200, 255, 0.85)'; g.shadowBlur = 30;
  g.font = '140px "Iowan Old Style", "Palatino Linotype", Georgia, serif'; g.fillStyle = 'rgba(246, 242, 255, 0.97)';
  g.fillText(title, W / 2, 120); g.shadowBlur = 10; g.fillText(title, W / 2, 120);
  g.shadowBlur = 18; g.font = '74px "Iowan Old Style", "Palatino Linotype", Georgia, serif'; g.fillStyle = 'rgba(214, 226, 255, 0.85)';
  sub.split('\n').forEach((line, i) => g.fillText(line, W / 2, 250 + i * 84));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { t, aspect: W / H };
}

// the lanterns float well out in front of you (not in your lap), and are drawn larger to match
const DIST = 1.35, S = 1.85, Y = 0.98, SPREAD = THREE.MathUtils.degToRad(28);

export class Choice {
  constructor(scene, sound, eyeRay = null) {
    this.scene = scene; this.sound = sound; this.eyeRay = eyeRay; this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.options = []; this.onPick = null; this.k = 0; this.active = false;
  }

  // opts: [{ key, title, sub, color }]
  show(opts) {
    this.group.clear(); this.options = [];
    opts.forEach((o, i) => {
      const a = (i - (opts.length - 1) / 2) * SPREAD * (opts.length === 2 ? 1.2 : 1);
      const at = new THREE.Vector3(Math.sin(a) * DIST, Y, -Math.cos(a) * DIST);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: o.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(0.22 * S); halo.position.copy(at);
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      core.scale.setScalar(0.06 * S); core.position.copy(at);
      const { t, aspect } = label(o.title, o.sub);
      const text = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false }));
      const w = 0.3 * S; text.scale.set(w, w / aspect, 1); const tw = w, th = w / aspect; text.position.copy(at).add(new THREE.Vector3(0, -0.1 * S, 0));
      halo.renderOrder = core.renderOrder = 25; text.renderOrder = 26;
      this.group.add(halo, core, text);
      this.options.push({ ...o, at, halo, core, text, tw, th, hot: 0, inside: [false, false], open: false });
    });
    this.group.visible = true; this.active = true; this.k = 0;
    // nothing can be chosen straight away: wait a moment, and until hands and eyes have moved off whatever they rested on
    this.armT = 0; this.armed = false;
    tweens.add(1.4, (k) => { this.k = k; });
  }

  hide() {
    this.active = false;
    const from = this.k;
    tweens.add(1.2, (k) => { this.k = from * (1 - k); }, { done: () => { this.group.visible = false; } });
  }

  update(dt, time, input) {
    if (!this.group.visible) return;
    this.armT = (this.armT || 0) + dt;
    if (!this.armed && this.armT > 2.2) this.armed = true;
    // whatever your eyes were resting on when the lanterns appeared can't be chosen until you look away from it
    const eye = this.eyeRay ? this.eyeRay() : null;
    if (this.armed) for (const o of this.options) if (!o.open && !(eye && this._rayHits(o, eye))) o.open = true;
    for (const o of this.options) {
      let hot = 0;
      if (this.active) input.hands.forEach((h, hi) => {
        if (!h.present) { o.inside[hi] = false; return; }
        // the whole option counts, the words as well as the light
        let inside = h.pinching && this._inBox(o, h.pinchPoint, 0.03);
        for (let k = 1; k < 5 && !inside; k++) if (this._inBox(o, h.tips[k], 0)) inside = true;
        if (this._inBox(o, h.index, 0.08)) hot = 1;
        if (inside && !o.inside[hi]) this.pick(o);
        o.inside[hi] = inside;
      });
      if (input.aim) for (const a of input.aim) if (a && this._rayHits(o, a.ray)) hot = 1;
      o.hot += (hot - o.hot) * Math.min(1, dt * 6);
      const breath = 0.8 + 0.2 * Math.sin(time * 1.4 + o.at.x * 9);
      o.halo.material.opacity = this.k * (0.75 + 0.25 * o.hot) * breath;
      o.core.material.opacity = this.k * 0.9;
      o.text.material.opacity = this.k * (0.85 + 0.15 * o.hot);
      o.text.scale.set(o.tw * (1 + 0.06 * o.hot), o.th * (1 + 0.06 * o.hot), 1);
      o.halo.scale.setScalar(0.22 * S * (1 + 0.35 * o.hot));
      o.halo.position.y = o.core.position.y = o.at.y + Math.sin(time * 0.8 + o.at.x * 5) * 0.008 * S;
    }
  }

  pick(o) {
    if (!this.active || !this.armed || !o.open) return;
    this.active = false;
    this.sound.boop(o.at, 164.81);
    tweens.add(0.6, (k) => { o.halo.scale.setScalar(0.16 * S * (1.35 + k)); });
    this.hide();
    if (this.onPick) this.onPick(o.key);
  }

  pickRay(ray) {
    if (!this.active) return null;
    if (!this.armed) return null;
    for (const o of this.options) if (o.open && this._rayHits(o, ray)) return { key: o, size: 0.22 * S, dwell: 2.2, point: this._centre(o), fire: () => this.pick(o) };
    return null;
  }

  // each option is a soft box around its light and its words
  _centre(o) { return o.at.clone().add(new THREE.Vector3(0, -0.06 * S, 0)); }
  _inBox(o, p, pad) {
    const c = this._centre(o);
    return Math.abs(p.x - c.x) < 0.16 * S + pad && Math.abs(p.y - c.y) < 0.12 * S + pad && Math.abs(p.z - c.z) < 0.09 * S + pad;
  }
  _rayHits(o, ray) {
    const c = this._centre(o), t = c.clone().sub(ray.origin).dot(ray.direction);
    if (t <= 0) return false;
    const p = ray.origin.clone().addScaledVector(ray.direction, t);
    return Math.abs(p.x - c.x) < 0.16 * S && Math.abs(p.y - c.y) < 0.12 * S;
  }
}
