// Small shared helpers: easing, tweens, springs, random picks, generated textures.
import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const rand = (a, b) => a + Math.random() * (b - a);
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));

export class Tweens {
  constructor() { this.list = []; }
  add(duration, fn, { delay = 0, ease = smooth, done = null } = {}) {
    const t = { t: -delay, duration, fn, ease, done };
    this.list.push(t);
    return t;
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      t.t += dt;
      if (t.t < 0) continue;
      const k = Math.min(1, t.t / t.duration);
      t.fn(t.ease(k));
      if (k >= 1) { this.list.splice(i, 1); if (t.done) t.done(); }
    }
  }
}
export const tweens = new Tweens();

// Critically-ish damped spring used for wobbles and sways.
export class Spring {
  constructor(k = 140, d = 9) { this.k = k; this.d = d; this.x = 0; this.v = 0; }
  kick(v) { this.v += v; }
  update(dt) {
    const steps = Math.ceil(dt / 0.008);
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -this.k * this.x - this.d * this.v;
      this.v += a * h; this.x += this.v * h;
    }
    return this.x;
  }
}

export function weightedPick(items, key = 'weight') {
  const total = items.reduce((s, it) => s + (it[key] || 0), 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) { r -= items[i][key] || 0; if (r <= 0) return i; }
  return items.length - 1;
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

// World-space sphere around an object (or around its cap, for mushrooms).
export function worldSphere(obj, { cap = false, shrink = 0.8 } = {}) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  if (cap) c.y = box.max.y - size.y * 0.18;
  return { center: c, radius: Math.max(size.x, size.z) * 0.5 * shrink, box };
}

// Give an object its own copies of its materials so it can fade or dim independently.
export function ownMaterials(obj) {
  const mats = [];
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const conv = (mat) => {
      const c = mat.clone();
      c.userData = { ...mat.userData, baseEmissive: mat.emissiveIntensity ?? 1, baseOpacity: mat.opacity ?? 1 };
      mats.push(c);
      return c;
    };
    m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
  });
  return mats;
}

export function setEmissiveScale(mats, k) {
  for (const m of mats) {
    if (m.emissiveIntensity !== undefined && m.userData.baseEmissive !== undefined) m.emissiveIntensity = m.userData.baseEmissive * k;
    if (m.uniforms && m.uniforms.fade) m.uniforms.fade.value = k;
  }
}

export function parseJSON(s, fallback = null) { try { return JSON.parse(s); } catch { return fallback; } }
