// Stargazing: lie back under a sky full of stars. Two gentle games, both played by simply looking
// at a star for a moment (or pointing and pinching), so you never need to hold your arm up:
//
//   Counting stars - stars wake one at a time; look at one and it settles into the sky beside the
//                    others while you count along. Each one comes a little slower, and every ten
//                    the night grows a little darker. (Counting sheep, under the stars.)
//   Star pictures  - a handful of dim stars waits; look at the glowing one and a trail of stardust
//                    joins it to the last. Count them as you go (twenty to thirty-odd stars) until a random picture
//                    appears (a teacup, a leaf, a sailboat...). Then it fades and a completely
//                    unrelated one begins, a little slower and dimmer. (The "cognitive shuffle".)
import * as THREE from 'three';
import { glowTexture, rand } from './util.js';

const DIST = 36;          // the game stars
const FIELD = 110;        // the background starfield (inside the sky dome, beyond the moon glow)
const DWELL = 1.0;        // seconds of looking to choose a star
const AIM = THREE.MathUtils.degToRad(5);
const NOTES = [146.83, 164.81, 196, 220, 246.94, 293.66, 329.63, 392];
const WARM = new THREE.Color(1.0, 0.86, 0.62), PALE = new THREE.Color(0.86, 0.9, 1.0), TRAIL = new THREE.Color(1.0, 0.84, 0.55);

// simple everyday pictures, drawn as strokes of points (x right, y up, about -1..1)
const SHAPES = [
  { name: 'a teacup', strokes: [[[-0.55, 0.45], [-0.45, -0.4], [0.35, -0.4], [0.45, 0.45]], [[0.42, 0.25], [0.8, 0.18], [0.72, -0.15], [0.38, -0.18]]] },
  { name: 'a leaf', strokes: [[[0, -0.9], [-0.45, -0.1], [-0.2, 0.55], [0, 0.95], [0.2, 0.55], [0.45, -0.1], [0, -0.9]]] },
  { name: 'a key', strokes: [[[-0.62, 0.3], [-0.38, 0.05], [-0.62, -0.2], [-0.86, 0.05], [-0.62, 0.3]], [[-0.38, 0.05], [0.85, 0.05], [0.85, -0.22]], [[0.55, 0.05], [0.55, -0.22]]] },
  { name: 'a sailboat', strokes: [[[-0.8, -0.4], [0.8, -0.4], [0.5, -0.72], [-0.5, -0.72], [-0.8, -0.4]], [[-0.05, -0.4], [-0.05, 0.9], [0.62, -0.28]]] },
  { name: 'a little house', strokes: [[[-0.6, -0.7], [-0.6, 0.1], [0, 0.72], [0.6, 0.1], [0.6, -0.7], [-0.6, -0.7]], [[-0.15, -0.7], [-0.15, -0.25], [0.15, -0.25], [0.15, -0.7]]] },
  { name: 'a kite', strokes: [[[0, 0.9], [0.45, 0.2], [0, -0.55], [-0.45, 0.2], [0, 0.9]], [[0, -0.55], [0.18, -0.8], [-0.05, -1.02]]] },
  { name: 'a fish', strokes: [[[-0.55, 0], [-0.05, 0.38], [0.6, 0], [-0.05, -0.38], [-0.55, 0]], [[-0.55, 0], [-0.95, 0.32], [-0.95, -0.32], [-0.55, 0]]] },
  { name: 'an umbrella', strokes: [[[-0.82, 0.1], [-0.45, 0.55], [0, 0.72], [0.45, 0.55], [0.82, 0.1]], [[0, 0.72], [0, -0.62], [-0.22, -0.78]]] },
  { name: 'a bell', strokes: [[[-0.15, 0.75], [0.15, 0.75], [0.38, 0.05], [0.62, -0.5], [-0.62, -0.5], [-0.38, 0.05], [-0.15, 0.75]], [[0, -0.5], [0, -0.75]]] },
  { name: 'a boot', strokes: [[[-0.42, 0.82], [-0.42, -0.55], [0.65, -0.55], [0.65, -0.25], [0.02, -0.12], [0.02, 0.82], [-0.42, 0.82]]] },
  { name: 'a mushroom', strokes: [[[-0.82, 0.08], [-0.42, 0.6], [0.42, 0.6], [0.82, 0.08], [-0.82, 0.08]], [[-0.2, 0.08], [-0.24, -0.72], [0.24, -0.72], [0.2, 0.08]]] },
  { name: 'a candle', strokes: [[[-0.25, -0.82], [-0.25, 0.3], [0.25, 0.3], [0.25, -0.82], [-0.25, -0.82]], [[0, 0.3], [0, 0.78]]] },
  { name: 'a heart', strokes: [[[0, -0.8], [-0.72, 0.1], [-0.4, 0.62], [0, 0.32], [0.4, 0.62], [0.72, 0.1], [0, -0.8]]] },
  { name: 'a feather', strokes: [[[0, -0.95], [0, 0.92], [0.36, 0.25], [0.16, -0.6]], [[0, 0.92], [-0.36, 0.25], [-0.16, -0.6]]] },
  { name: 'a pear', strokes: [[[0, 0.62], [-0.28, 0.25], [-0.55, -0.35], [0, -0.8], [0.55, -0.35], [0.28, 0.25], [0, 0.62]], [[0, 0.62], [0.12, 0.9]]] },
  { name: 'a mitten', strokes: [[[-0.4, -0.85], [-0.45, 0.55], [0.05, 0.85], [0.42, 0.55], [0.42, -0.85], [-0.4, -0.85]], [[0.42, 0.05], [0.75, 0.3], [0.62, -0.25]]] },
  { name: 'a crescent moon', strokes: [[[0.2, 0.9], [-0.42, 0.55], [-0.62, 0], [-0.42, -0.55], [0.2, -0.9], [-0.05, -0.42], [-0.15, 0], [-0.05, 0.42], [0.2, 0.9]]] },
  { name: 'a watering can', strokes: [[[-0.55, 0.35], [-0.55, -0.6], [0.3, -0.6], [0.3, 0.35], [-0.55, 0.35]], [[0.3, -0.25], [0.88, 0.42]], [[-0.55, 0.12], [-0.85, -0.05], [-0.55, -0.32]]] },
];

// a few richer pictures for grown-ups, built from arcs and lines
const arc = (cx, cy, r, a0, a1, n, ry = r) => Array.from({ length: n + 1 }, (_, i) => { const a = THREE.MathUtils.degToRad(a0 + (a1 - a0) * i / n); return [+(cx + Math.cos(a) * r).toFixed(3), +(cy + Math.sin(a) * ry).toFixed(3)]; });
SHAPES.push(
  { name: 'a lighthouse', strokes: [[[-0.32, -0.9], [-0.18, 0.35], [0.18, 0.35], [0.32, -0.9], [-0.32, -0.9]], [[-0.24, 0.35], [-0.24, 0.6], [0.24, 0.6], [0.24, 0.35]], [[-0.24, 0.6], [0, 0.85], [0.24, 0.6]], [[0.3, 0.5], [0.9, 0.7]], [[0.3, 0.45], [0.9, 0.25]], [[-0.27, -0.3], [0.27, -0.3]]] },
  { name: 'a teapot', strokes: [arc(0, -0.1, 0.55, 0, 180, 6, 0.5).concat([[-0.55, -0.1], [-0.45, -0.55], [0.45, -0.55], [0.55, -0.1]]), [[0.45, -0.3], [0.85, 0.15], [0.95, 0.3]], arc(-0.6, -0.25, 0.22, 90, 270, 4), [[-0.12, 0.4], [0, 0.55], [0.12, 0.4]]] },
  { name: 'a swan', strokes: [[[-0.8, -0.35], [-0.5, -0.65], [0.35, -0.65], [0.7, -0.35], [0.4, -0.15], [-0.2, -0.2], [-0.8, -0.35]], [[0.4, -0.15], [0.48, 0.25], [0.3, 0.55], [0.38, 0.8], [0.6, 0.78], [0.75, 0.7]], [[-0.2, -0.2], [-0.45, 0.05], [-0.62, -0.18]]] },
  { name: 'a whale', strokes: [[[-0.9, 0.0], [-0.55, 0.35], [0.1, 0.38], [0.6, 0.1], [0.75, -0.25], [0.3, -0.42], [-0.4, -0.35], [-0.9, 0.0]], [[0.6, 0.1], [0.92, 0.45], [0.95, 0.05], [0.75, -0.25]], [[-0.55, 0.35], [-0.6, 0.62], [-0.45, 0.8]], [[-0.6, 0.62], [-0.78, 0.78]]] },
  { name: 'a butterfly', strokes: [[[0, -0.6], [0, 0.45]], [[0, 0.3], [-0.45, 0.8], [-0.9, 0.55], [-0.6, 0.05], [0, 0.05]], [[0, 0.3], [0.45, 0.8], [0.9, 0.55], [0.6, 0.05], [0, 0.05]], [[0, 0.0], [-0.55, -0.15], [-0.6, -0.6], [0, -0.3]], [[0, 0.0], [0.55, -0.15], [0.6, -0.6], [0, -0.3]], [[0, 0.45], [-0.18, 0.72]], [[0, 0.45], [0.18, 0.72]]] },
  { name: 'a bicycle', strokes: [arc(-0.55, -0.35, 0.36, 0, 360, 10), arc(0.55, -0.35, 0.36, 0, 360, 10), [[-0.55, -0.35], [-0.12, 0.2], [0.42, 0.2], [0.55, -0.35]], [[-0.12, 0.2], [0.02, -0.35], [0.42, 0.2]], [[-0.18, 0.32], [0.02, 0.32]], [[0.42, 0.2], [0.38, 0.42], [0.55, 0.45]]] },
  { name: 'an anchor', strokes: [[[0, 0.62], [0, -0.75]], arc(0, 0.78, 0.15, 0, 360, 8), [[-0.35, 0.35], [0.35, 0.35]], arc(0, -0.25, 0.62, 190, 350, 8)] },
  { name: 'an owl', strokes: [arc(0, -0.05, 0.62, 0, 360, 14, 0.82), arc(-0.25, 0.25, 0.17, 0, 360, 6), arc(0.25, 0.25, 0.17, 0, 360, 6), [[-0.08, 0.05], [0, -0.1], [0.08, 0.05]], [[-0.5, 0.6], [-0.42, 0.95], [-0.22, 0.72]], [[0.5, 0.6], [0.42, 0.95], [0.22, 0.72]]] },
  { name: 'a crown', strokes: [[[-0.8, -0.5], [0.8, -0.5], [0.85, 0.45], [0.42, 0.0], [0, 0.65], [-0.42, 0.0], [-0.85, 0.45], [-0.8, -0.5]], [[-0.8, -0.28], [0.8, -0.28]]] },
);

// every picture is drawn with plenty of stars: long lines get extra stars along them (each a touch off the
// ruler-straight line, as real stars would be), so a picture takes 20 to 32 stars to join
function densify(def, target) {
  const segs = []; let total = 0;
  for (const st of def.strokes) for (let i = 1; i < st.length; i++) { const d = Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]); segs.push(d); total += d; }
  const corners = new Set(def.strokes.flat().map((q) => q[0].toFixed(2) + ',' + q[1].toFixed(2))).size;
  const extra = Math.max(0, target - corners), step = total / Math.max(1, extra + segs.length);
  return { ...def, strokes: def.strokes.map((st) => {
    const out = [st[0]];
    for (let i = 1; i < st.length; i++) {
      const a = st[i - 1], b = st[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(0, Math.round(d / step) - 1);
      const nx = -(b[1] - a[1]) / (d || 1), ny = (b[0] - a[0]) / (d || 1);
      for (let k = 1; k <= n; k++) { const t = k / (n + 1), j = (Math.random() - 0.5) * 0.05; out.push([a[0] + (b[0] - a[0]) * t + nx * j, a[1] + (b[1] - a[1]) * t + ny * j]); }
      out.push(b);
    }
    return out;
  }) };
}

// the ring around the star to look at: always there, and it fills up while you look
const ringVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const ringFS = `uniform float progress; uniform float opacity; varying vec2 vUv;
void main(){ vec2 p = vUv * 2. - 1.; float r = length(p);
  float band = smoothstep(0.72, 0.78, r) * (1. - smoothstep(0.9, 0.96, r));
  float a = atan(p.x, p.y) / 6.2831853 + 0.5; float fill = step(a, progress);
  vec3 c = mix(vec3(0.75, 0.84, 1.0), vec3(1.0, 0.84, 0.5), fill);
  gl_FragColor = vec4(c, band * (0.35 + 0.65 * fill) * opacity); }`;
// a soft chevron at the edge of your view, pointing to the star when it is out of sight
function arrowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.shadowColor = 'rgba(255, 220, 160, 0.9)'; g.shadowBlur = 26; g.strokeStyle = 'rgba(255, 240, 215, 0.95)'; g.lineWidth = 16; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(34, 78); g.lineTo(64, 44); g.lineTo(94, 78); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// a sky full of stars: thousands of points, most tiny, a few bright, and a soft Milky Way band
function starfield(eye) {
  const N = 2600, B = 4200, pos = [], col = [], size = [], ph = [];
  const add = (d, s, c) => { const p = d.multiplyScalar(FIELD).add(eye); pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); size.push(s); ph.push(Math.random() * 100); };
  const tint = () => { const r = Math.random(); return r < 0.15 ? new THREE.Color(1.0, 0.85, 0.7) : r < 0.35 ? new THREE.Color(0.75, 0.85, 1.0) : new THREE.Color(0.95, 0.96, 1.0); };
  for (let i = 0; i < N; i++) {
    const z = rand(0.08, 1), a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    const big = Math.random();
    add(new THREE.Vector3(Math.cos(a) * r, z, Math.sin(a) * r), big > 0.985 ? rand(5, 7.5) : big > 0.9 ? rand(3, 4.5) : rand(1.4, 2.6), tint());
  }
  // the Milky Way: a tilted great circle, dense and faint, a little clumpy
  const n = new THREE.Vector3(0.55, 0.25, 0.8).normalize(), u = new THREE.Vector3(1, 0, 0).cross(n).normalize(), v = n.clone().cross(u);
  for (let i = 0; i < B; i++) {
    const t = Math.random() * Math.PI * 2, clump = 0.5 + 0.5 * Math.sin(t * 5 + 1.3) * Math.sin(t * 3.1);
    const spread = (Math.random() + Math.random() + Math.random() - 1.5) * (0.1 + 0.08 * clump);
    const d = u.clone().multiplyScalar(Math.cos(t)).addScaledVector(v, Math.sin(t)).addScaledVector(n, spread).normalize();
    if (d.y < 0.06) continue;
    add(d, rand(1.1, 2.2), new THREE.Color(0.82, 0.86, 1.0).multiplyScalar(rand(0.45, 0.85)));
  }
  // ...and its soft glowing haze: big, very faint puffs along the band
  for (let i = 0; i < 420; i++) {
    const t = Math.random() * Math.PI * 2, clump = 0.5 + 0.5 * Math.sin(t * 5 + 1.3) * Math.sin(t * 3.1);
    const d = u.clone().multiplyScalar(Math.cos(t)).addScaledVector(v, Math.sin(t)).addScaledVector(n, (Math.random() - 0.5) * 0.16).normalize();
    if (d.y < 0.06) continue;
    add(d, rand(16, 30), new THREE.Color(0.3, 0.33, 0.48).multiplyScalar(0.08 + 0.12 * clump));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute('phase', new THREE.Float32BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { level: { value: 0 }, time: { value: 0 }, scale: { value: 1 } },
    vertexShader: `attribute float size; attribute float phase; attribute vec3 color; uniform float time; uniform float scale; varying vec3 vC; varying float vT;
      void main(){ vC = color; vT = 0.72 + 0.28 * sin(time * (0.6 + fract(phase) * 1.6) + phase);
        gl_PointSize = size * scale * 2.4; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float level; varying vec3 vC; varying float vT;
      void main(){ vec2 p = gl_PointCoord * 2. - 1.; float r = dot(p, p); if (r > 1.) discard;
        float a = exp(-r * 4.5); gl_FragColor = vec4(vC * a * vT * level * 1.3, 1.0); }`,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
  });
  const pts = new THREE.Points(g, m); pts.renderOrder = -9; pts.frustumCulled = false;
  return pts;
}

// a small soft number that appears beside a star while you count
const numCache = new Map();
function numberTex(n) {
  if (numCache.has(n)) return numCache.get(n);
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '84px "Iowan Old Style", "Palatino Linotype", Georgia, serif';
  g.shadowColor = 'rgba(255, 220, 160, 0.9)'; g.shadowBlur = 16; g.fillStyle = 'rgba(255, 244, 225, 0.95)'; g.fillText(String(n), 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; numCache.set(n, t); return t;
}

export class SkyGames {
  constructor(scene, sound, eye, eyeRay, viewQuat) {
    this.scene = scene; this.sound = sound; this.eye = eye.clone(); this.eyeRay = eyeRay;
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.field = starfield(this.eye); this.group.add(this.field);
    this.tex = glowTexture();
    this.mode = null; this.level = 0; this.target = 0; this.dim = 1; this.ownDwell = true;
    this.stars = []; this.trails = []; this.numbers = []; this.kept = [];
    this.count = 0; this.spawnT = 0; this.shapeIdx = 0; this.order = []; this.shape = null; this.pause = 0; this.shapesDone = 0;
    this.hover = null; this.dwell = 0; this.cool = 0; this.viewQuat = viewQuat; this.idle = 0;
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: { progress: { value: 0 }, opacity: { value: 0 } }, vertexShader: ringVS, fragmentShader: ringFS, transparent: true, depthTest: false, depthWrite: false, fog: false }));
    this.ring.renderOrder = -2; this.group.add(this.ring);
    this.arrow = new THREE.Sprite(new THREE.SpriteMaterial({ map: arrowTex(), transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
    this.arrow.renderOrder = 31; this.arrow.scale.setScalar(0.07); scene.add(this.arrow); this.arrowK = 0;
    // callbacks for the night: a counted star, every ten, a picture started / finished
    this.onIdle = null; this.onCount = null; this.onTen = null; this.onShapeStart = null; this.onShapeDone = null;
  }

  // ---------------------------------------------------------------- lifecycle
  start(mode) {
    this.clearStars(); this.mode = mode; this.group.visible = true; this.target = 1; this.dim = 1;
    this.count = 0; this.spawnT = 7; this.shapesDone = 0; this.pause = 7; // the first star wakes as the directions mention the ring
    this.order = shuffle(SHAPES.map((_, i) => i)); this.shapeIdx = 0; this.shape = null;
  }
  stop() { this.target = 0; this.mode = null; for (const s of this.stars) s.fadeOut = true; for (const t of this.trails) t.fadeOut = true; }
  get active() { return !!this.mode; }

  clearStars() {
    for (const s of this.stars) this.group.remove(s.glow, s.core);
    for (const t of this.trails) this.group.remove(t.pts);
    for (const n of this.numbers) this.group.remove(n.sp);
    for (const k of this.kept) this.group.remove(k.sp);
    this.stars = []; this.trails = []; this.numbers = []; this.kept = [];
  }

  // ---------------------------------------------------------------- stars
  _dirAt(azDeg, elDeg) {
    const a = THREE.MathUtils.degToRad(azDeg), e = THREE.MathUtils.degToRad(elDeg);
    return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
  }

  // the direction you rest your eyes on (followed slowly), kept up in the open sky, and the picture's "up"
  _rest() {
    let c = this.restDir ? this.restDir.clone() : this._dirAt(0, 70);
    const minEl = Math.sin(THREE.MathUtils.degToRad(48));
    if (c.y < minEl) { const h = new THREE.Vector3(c.x, 0, c.z); if (h.lengthSq() < 1e-6) h.set(0, 0, -1); h.normalize().multiplyScalar(Math.sqrt(1 - minEl * minEl)); c = h.setY(minEl).normalize(); }
    let up = this.viewQuat ? new THREE.Vector3(0, 1, 0).applyQuaternion(this.viewQuat()) : new THREE.Vector3(0, 0, 1);
    up.addScaledVector(c, -up.dot(c));
    if (up.lengthSq() < 1e-4) up = new THREE.Vector3(0, 0, 1).addScaledVector(c, -c.z);
    up.normalize();
    return { c, up, right: c.clone().cross(up).normalize() };
  }
  _near(b, degX, degY) { return b.c.clone().addScaledVector(b.right, Math.tan(THREE.MathUtils.degToRad(degX))).addScaledVector(b.up, Math.tan(THREE.MathUtils.degToRad(degY))).normalize(); }

  _star(dir, { size = 1.6, color = PALE, state = 'waiting', bright = 0 } = {}) {
    const p = this.eye.clone().addScaledVector(dir, DIST);
    const mk = (c, s) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: c.clone(), transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false })); sp.scale.setScalar(s); sp.position.copy(p); sp.renderOrder = -4; this.group.add(sp); return sp; };
    const s = { dir, p, size, glow: mk(color, size * 2.2), core: mk(new THREE.Color(1, 1, 1), size * 0.6), state, light: 0, bright, hot: 0, prog: 0, ph: Math.random() * 10, fadeOut: false, t: 0 };
    this.stars.push(s); return s;
  }

  _number(n, at) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: numberTex(n), transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }));
    sp.scale.setScalar(2.2); sp.position.copy(at); sp.renderOrder = -3; this.group.add(sp);
    this.numbers.push({ sp, t: 0 });
  }

  // a trail of stardust drawn from one star to another
  _trail(a, b) {
    const len = a.distanceTo(b), n = Math.max(6, Math.round(len / 0.35)), pos = [], k = [];
    for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); pos.push(p.x, p.y, p.z); k.push(i / n); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('k', new THREE.Float32BufferAttribute(k, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { grow: { value: 0 }, alpha: { value: 1 }, color: { value: TRAIL.clone() }, scale: { value: this.field.material.uniforms.scale.value } },
      vertexShader: `attribute float k; uniform float grow; uniform float scale; varying float vA;
        void main(){ vA = step(k, grow); gl_PointSize = 5.0 * scale; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float alpha; uniform vec3 color; varying float vA;
        void main(){ vec2 p = gl_PointCoord * 2. - 1.; float r = dot(p, p); if (r > 1. || vA < 0.5) discard; gl_FragColor = vec4(color * exp(-r * 3.5) * alpha * 0.8, 1.0); }`,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false,
    });
    const pts = new THREE.Points(g, m); pts.renderOrder = -4; pts.frustumCulled = false; this.group.add(pts);
    const t = { pts, grow: 0, fadeOut: false, alpha: 1 }; this.trails.push(t); return t;
  }

  // ---------------------------------------------------------------- counting stars
  _spawnCountStar() {
    // within easy eye movement of where you are looking: no turning your head
    const b = this._rest(), a = Math.random() * Math.PI * 2, r = rand(3, 11);
    const s = this._star(this._near(b, Math.cos(a) * r, Math.sin(a) * r * 0.75), { size: rand(1.4, 1.9), color: Math.random() < 0.35 ? WARM : PALE, state: 'next' });
    s.bright = 1;
  }

  _collect(s) {
    this.count++;
    s.state = 'kept'; s.t = 0;
    this.sound.hush(this.eye.clone().addScaledVector(s.dir, 3), NOTES[(this.count - 1) % NOTES.length]);
    this._number(this.count, s.p.clone().add(new THREE.Vector3(0, 0, 0)).addScaledVector(this._sideOf(s.dir), 2.6));
    if (this.onCount) this.onCount(this.count);
    if (this.count % 10 === 0) { this.dim *= 0.9; if (this.onTen) this.onTen(this.count); }
  }

  _sideOf(dir) { return new THREE.Vector3(1, 0, 0).sub(dir.clone().multiplyScalar(dir.x)).normalize(); }

  // ---------------------------------------------------------------- star pictures
  _nextShape() {
    // pictures grow richer as the night goes on: about 20 stars at first, up to about 32
    const def = densify(SHAPES[this.order[this.shapeIdx % this.order.length]], Math.min(32, 20 + this.shapesDone * 3)); this.shapeIdx++;
    if (this.shapeIdx % this.order.length === 0) this.order = shuffle(this.order);
    // a patch of sky, high overhead, its "up" toward your head when you lie back
    // right where you are looking, small enough to take in with your eyes alone, upright to you
    const b = this._rest(), c = b.c, zUp = b.up, right = b.right;
    const half = THREE.MathUtils.degToRad(rand(11.5, 12.5)); // about 24 degrees across: room for many stars, still within easy eye movement
    const toDir = ([x, y]) => c.clone().addScaledVector(right, Math.tan(half) * x).addScaledVector(zUp, Math.tan(half) * y).normalize();
    // stars are shared where strokes meet; steps are the stars to look at, in order
    const stars = [], key = (q) => q[0].toFixed(2) + ',' + q[1].toFixed(2), byKey = new Map(), steps = [];
    for (const stroke of def.strokes) stroke.forEach((q, i) => {
      let s = byKey.get(key(q));
      if (!s) { s = this._star(toDir(q), { size: 1.25, color: PALE, state: 'dim' }); byKey.set(key(q), s); stars.push(s); }
      steps.push({ s, from: i > 0 ? byKey.get(key(stroke[i - 1])) : null });
    });
    this.shape = { def, stars, steps, i: 0, done: false, t: 0 };
    this._advance(true);
    if (this.onShapeStart) this.onShapeStart(stars.length);
  }

  // move to the next star to look at; stars already lit (closing a loop) join up by themselves
  _advance(first = false) {
    const sh = this.shape;
    while (sh.i < sh.steps.length) {
      const st = sh.steps[sh.i];
      if (st.s.state === 'lit') { if (st.from) this._trail(st.from.p, st.s.p); sh.i++; continue; }
      if (!st.from || st.from.state === 'lit') { st.s.state = 'next'; return; }
      sh.i++;
    }
    if (!first) this._finishShape();
  }

  _light(s) {
    const sh = this.shape, st = sh.steps[sh.i];
    s.state = 'lit'; s.t = 0; this.count++;
    this.sound.hush(this.eye.clone().addScaledVector(s.dir, 3), NOTES[(sh.stars.filter((x) => x.state === 'lit').length - 1) % NOTES.length]);
    this._number(sh.stars.filter((x) => x.state === 'lit').length, s.p.clone().addScaledVector(this._sideOf(s.dir), 2.2));
    if (st.from) this._trail(st.from.p, s.p);
    sh.i++; this._advance();
  }

  _finishShape() {
    const sh = this.shape; if (sh.done) return;
    sh.done = true; sh.t = 0; this.shapesDone++; this.dim *= 0.93;
    if (this.onShapeDone) this.onShapeDone(sh.def.name, this.shapesDone);
  }

  // ---------------------------------------------------------------- choosing: look, or point and pinch
  _target() { return this.stars.find((s) => s.state === 'next' && !s.fadeOut) || null; }

  _aimed(ray) {
    const s = this._target(); if (!s) return null;
    return s.p.clone().sub(ray.origin).normalize().angleTo(ray.direction) < AIM ? s : null;
  }

  pick(ray) {
    if (!this.mode) return null;
    const s = this._aimed(ray);
    return s ? { key: s, size: 2.6, point: s.p.clone(), fire: () => this.choose(s) } : null;
  }

  choose(s) {
    if (!s || s.state !== 'next' || this.cool > 0) return;
    this.cool = 0.5; this.dwell = 0; this.idle = 0;
    if (this.mode === 'count') this._collect(s); else this._light(s);
  }

  // for "just sit and watch": the night plays itself
  autoStep() { const s = this._target(); if (s) this.choose(s); }

  // ---------------------------------------------------------------- every frame
  update(dt, time, input, pixelScale = 1) {
    this.level += (this.target - this.level) * Math.min(1, dt * 0.45);
    if (!this.group.visible) { this.arrow.visible = false; return; }
    if (!this.mode) this.arrowK = 0;
    if (this.level < 0.003 && this.target === 0) { this.group.visible = false; this.clearStars(); return; }
    const fu = this.field.material.uniforms; fu.level.value = this.level * this.dim; fu.time.value = time; fu.scale.value = pixelScale;
    this.cool = Math.max(0, this.cool - dt);

    if (this.mode === 'count') {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && !this.stars.some((s) => s.state === 'next')) { this._spawnCountStar(); this.spawnT = Math.min(7.5, 2.4 + this.count * 0.11); }
    } else if (this.mode === 'shapes') {
      if (!this.shape) { this.pause -= dt; if (this.pause <= 0) this._nextShape(); }
      else if (this.shape.done) {
        this.shape.t += dt;
        if (this.shape.t > 5) { for (const s of this.shape.stars) s.fadeOut = true; for (const t of this.trails) t.fadeOut = true; this.shape = null; this.pause = Math.min(6, 2.5 + this.shapesDone * 0.4); }
      }
    }

    // what are you looking at (or pointing at)? looking long enough chooses it
    let hover = null;
    if (input && input.aim) for (const a of input.aim) if (a) { const s = this._aimed(a.ray); if (s) hover = s; }
    const look = this.eyeRay && this.eyeRay();
    if (look) { if (!this.restDir) this.restDir = look.direction.clone(); else this.restDir.lerp(look.direction, Math.min(1, dt * 0.12)).normalize(); }
    const looked = look ? this._aimed(look) : null;
    if (looked) hover = looked;
    if (looked && this.ownDwell && this.cool <= 0) { this.dwell += dt; if (this.dwell >= DWELL) this.choose(looked); } else this.dwell = Math.max(0, this.dwell - dt * 2);

    // where to look: a ring round the star that fills while you look, and an arrow when it is out of sight
    const tgt = this._target();
    const ru = this.ring.material.uniforms;
    if (tgt && look) {
      this.ring.position.copy(tgt.p); this.ring.lookAt(look.origin); this.ring.scale.setScalar(tgt.size * 3.2 * (1 + 0.06 * Math.sin(time * 2.2)));
      ru.opacity.value += ((this.level * tgt.light) * 0.9 - ru.opacity.value) * Math.min(1, dt * 4);
      ru.progress.value = looked === tgt ? Math.min(1, this.dwell / DWELL) : 0;
      this.idle += dt; if (this.idle > 14 && this.onIdle) { this.idle = -10; this.onIdle(); }
    } else { ru.opacity.value = Math.max(0, ru.opacity.value - dt * 3); this.idle = 0; }
    let away = 0;
    if (tgt && look && this.viewQuat) {
      const q = this.viewQuat(), local = tgt.p.clone().sub(look.origin).applyQuaternion(q.clone().invert());
      const ang = local.clone().normalize().angleTo(new THREE.Vector3(0, 0, -1));
      if (ang > THREE.MathUtils.degToRad(24)) {
        away = 1;
        const d = new THREE.Vector2(local.x, local.y); if (d.lengthSq() < 1e-6) d.set(0, 1); d.normalize();
        const off = new THREE.Vector3(d.x * 0.2, d.y * 0.2, -0.75).applyQuaternion(q);
        this.arrow.position.copy(look.origin).add(off);
        this.arrow.material.rotation = Math.atan2(d.y, d.x) - Math.PI / 2;
        this.arrow.scale.setScalar(0.12 * (1 + 0.12 * Math.sin(time * 3)));
      }
    }
    this.arrowK += (away * this.level - this.arrowK) * Math.min(1, dt * 3);
    this.arrow.material.opacity = 0.8 * this.arrowK; this.arrow.visible = this.arrowK > 0.01;

    const showing = this.shape && this.shape.done ? Math.min(1, this.shape.t / 0.6) : 0;
    for (const s of [...this.stars]) {
      s.t += dt;
      s.hot += ((s === hover ? 1 : 0) - s.hot) * Math.min(1, dt * 6);
      const tw = 0.82 + 0.18 * Math.sin(time * (1.1 + (s.ph % 1)) + s.ph);
      let op = 0, grow = 1;
      if (s.fadeOut) { s.light = Math.max(0, s.light - dt * 0.5); if (s.light <= 0) { this.group.remove(s.glow, s.core); this.stars.splice(this.stars.indexOf(s), 1); continue; } }
      else s.light = Math.min(1, s.light + dt * 0.6);
      if (s.state === 'dim') op = 0.28;
      else if (s.state === 'next') { op = 0.75 + 0.25 * Math.sin(time * 2.2 + s.ph); grow = 1 + 0.25 * Math.sin(time * 2.2 + s.ph) + (s === looked ? 0.8 * this.dwell / DWELL : 0) + 0.25 * s.hot; }
      else if (s.state === 'lit') { op = 0.95 + 0.4 * showing * (0.5 + 0.5 * Math.sin(time * 4 + s.ph)); grow = 1.15 + 0.3 * Math.max(0, 1 - s.t * 2); s.glow.material.color.lerp(WARM, Math.min(1, dt * 2)); }
      else if (s.state === 'kept') {
        // a counted star settles into the sky: it shrinks to a small warm star and stays
        const k = Math.min(1, s.t / 1.6); op = 0.85 - 0.35 * k; grow = 1.3 - 0.65 * k; s.glow.material.color.lerp(WARM, Math.min(1, dt * 2));
      }
      const L = this.level * this.dim * s.light * tw;
      s.glow.material.opacity = 0.6 * L * op;
      s.core.material.opacity = Math.min(1, 0.95 * L * op);
      s.glow.scale.setScalar(s.size * 2.2 * grow); s.core.scale.setScalar(s.size * 0.6 * Math.min(1.3, grow));
    }
    // counted stars stay, but the oldest ones fade if the sky gets very full
    const kept = this.stars.filter((s) => s.state === 'kept' && !s.fadeOut);
    if (kept.length > 120) kept[0].fadeOut = true;

    for (const t of [...this.trails]) {
      t.grow = Math.min(1, t.grow + dt * 1.4);
      if (t.fadeOut) { t.alpha = Math.max(0, t.alpha - dt * 0.5); if (t.alpha <= 0) { this.group.remove(t.pts); this.trails.splice(this.trails.indexOf(t), 1); continue; } }
      const u = t.pts.material.uniforms; u.grow.value = t.grow; u.alpha.value = t.alpha * this.level * this.dim * (1 + 0.5 * showing); u.scale.value = pixelScale;
    }
    for (const n of [...this.numbers]) {
      n.t += dt; const a = n.t < 0.4 ? n.t / 0.4 : Math.max(0, 1 - (n.t - 1.4) / 1.2);
      n.sp.material.opacity = 0.85 * a * this.level;
      if (n.t > 2.6) { this.group.remove(n.sp); this.numbers.splice(this.numbers.indexOf(n), 1); }
    }
  }
}
