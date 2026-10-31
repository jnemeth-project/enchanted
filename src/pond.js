// The pond: a small, still pool that reflects the night sky. The water mirrors a painted star map (made in
// Blender) along the reflected view, so the stars sit deep in the water and move as you move your head; the
// moon's reflection is drawn from tonight's moon. Its edges glow softly, a few tiny lights drift beneath
// the surface, and anything that touches the water sends out rings of light.
import * as THREE from 'three';
import { glowTexture } from './util.js';

const RIPPLES = 8, LANTERNS = 24;
const LCOL = [[1.0, 0.62, 0.22], [1.0, 0.45, 0.32], [1.0, 0.42, 0.66], [0.35, 1.0, 0.72], [1.0, 0.8, 0.38]];
const GCOL = [[1.0, 0.82, 0.45], [0.6, 1.0, 0.82], [1.0, 0.7, 0.85]];
const VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FS = `
#define LANTERNS ${LANTERNS}
uniform sampler2D sky; uniform float time; uniform float rain; uniform vec4 rip[${RIPPLES}]; uniform vec3 moonDir; uniform vec3 centre; uniform vec2 radii; uniform vec4 lant[LANTERNS]; uniform vec3 lcol[LANTERNS];
varying vec3 vW;
#define PI 3.14159265
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 q = vW.xz;
  vec3 n = vec3(0., 1., 0.);
  float ring = 0.;
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = rip[i]; float age = time - r.z;
    if (age < 0. || age > 4.5) continue;
    vec2 d = q - r.xy; float dist = length(d) + 1e-4; float front = 0.05 + age * 0.3;
    float env = exp(-age * 1.0) * r.w * exp(-pow((dist - front) * 13., 2.));
    n.xz += d / dist * sin((dist - front) * 75.) * env * 0.22; ring += env;
  }
  // rain: little rings popping up all over the water, each spreading and fading in about a second
  if (rain > 0.02) {
    for (int L = 0; L < 2; L++) {
      float sc = L == 0 ? 7. : 11.; vec2 g = q * sc + float(L) * 3.7; vec2 cell = floor(g); vec2 f = fract(g);
      float h = hash(cell + float(L) * 7.1);
      if (h < rain) {
        float per = 0.8 + h * 0.7; float ph = fract(time / per + hash(cell + 2.9));
        vec2 c = vec2(hash(cell + 2.3), hash(cell + 4.7)) * 0.6 + 0.2; vec2 dd = f - c; float d = length(dd) + 1e-4;
        float rr = ph * 0.42, env = (1. - ph) * (1. - ph) * exp(-pow((d - rr) * 30., 2.));
        n.xz += dd / d * sin((d - rr) * 95.) * env * 0.12; ring += env * 0.35;
      }
    }
  }
  // a faint slow breath across the surface, so it is still but never frozen
  n.x += 0.01 * sin(q.x * 9. + time * 0.7) + 0.006 * sin(q.y * 13. - time * 0.5);
  n.z += 0.01 * sin(q.y * 8. - time * 0.6) + 0.006 * sin(q.x * 11. + time * 0.4);
  n = normalize(n);
  vec3 v = normalize(vW - cameraPosition);
  vec3 r = reflect(v, n);
  vec2 uv = vec2(atan(r.x, -r.z) / (2. * PI) + 0.5, asin(clamp(r.y, -1., 1.)) / PI + 0.5);
  float fres = 0.45 + 0.55 * pow(1. - max(dot(-v, n), 0.), 3.);
  vec3 col = texture2D(sky, uv).rgb * 2.0 * fres;
  // crisp little stars in the water (on top of the painted sky), each twinkling on its own
  vec2 su = uv * vec2(420., 210.); vec2 sc = floor(su); float sh = hash(sc);
  if (sh > 0.972 && uv.y > 0.56) {
    vec2 sp = fract(su) - 0.5 - (vec2(hash(sc + 5.3), hash(sc + 9.1)) - 0.5) * 0.5;
    float tw = 0.6 + 0.4 * sin(time * (1.2 + sh * 3.) + sh * 50.);
    col += vec3(0.9, 0.95, 1.) * smoothstep(0.22, 0.0, length(sp)) * (0.5 + 1.5 * fract(sh * 37.)) * tw * fres;
  }
  float m = max(dot(r, moonDir), 0.);
  col += vec3(1., 0.96, 0.86) * (pow(m, 1500.) * 3. + pow(m, 80.) * 0.15);
  // the lanterns, reflected: each a warm glow deep in the water that shimmers as the surface moves
  vec3 P = vW;
  for (int i = 0; i < LANTERNS; i++) {
    vec4 L = lant[i]; if (L.w <= 0.) continue;
    vec3 dl = normalize(L.xyz - P); float c = max(dot(r, dl), 0.);
    col += lcol[i] * L.w * (pow(c, 2600.) * 2.2 + pow(c, 160.) * 0.18 + pow(c, 18.) * 0.025);
  }
  // glitter: tiny points of light that flash on and off across the surface, as if the water were full of stars
  vec2 gq = q * 26.; vec2 gc = floor(gq); float gh = hash(gc + 11.3);
  if (gh > 0.9) {
    vec2 gf = fract(gq) - 0.5 - (vec2(hash(gc + 4.1), hash(gc + 8.7)) - 0.5) * 0.6;
    float fl = pow(0.5 + 0.5 * sin(time * (1.5 + gh * 4.) + gh * 80.), 14.);
    col += mix(vec3(1., 0.9, 0.7), vec3(0.6, 1., 0.9), fract(gh * 13.)) * smoothstep(0.16, 0.0, length(gf)) * fl * 1.6;
  }
  vec2 e = (q - centre.xz) / radii; float er = length(e);
  vec3 deep = vec3(0.004, 0.012, 0.03) + vec3(0.01, 0.04, 0.06) * max(0., 1. - er) * 0.5;
  vec3 edge = vec3(0.25, 0.95, 0.75) * smoothstep(0.9, 1.04, er) * 0.08 * (0.85 + 0.15 * sin(time * 0.8));
  vec3 rings = vec3(0.45, 1., 0.85) * min(ring, 1.5) * 0.35;
  vec2 g = q * 14. + vec2(time * 0.05, -time * 0.03); vec2 cell = floor(g); vec2 f = fract(g) - 0.5;
  float h = hash(cell); vec2 o = vec2(hash(cell + 1.7), hash(cell + 3.1)) - 0.5;
  float mote = step(0.8, h) * smoothstep(0.12, 0., length(f - o * 0.6)) * (0.5 + 0.5 * sin(time * (1. + h * 2.) + h * 30.));
  float clear = smoothstep(0.55, 1.0, er);
  gl_FragColor = vec4(deep + col + edge + rings + vec3(0.5, 1., 0.85) * mote * 0.45, mix(0.96, 0.42, clear));
  #include <colorspace_fragment>
}`;

export class Pond {
  constructor(W, scene) {
    const o = W.byName.G_PondWater; this.ok = !!o; if (!o) return;
    const info = String(o.userData.pond || '').split(',').map(Number);
    if (info.length === 5 && info.every(Number.isFinite)) {
      const [cx, cy, wz, a, b] = info; this.centre = new THREE.Vector3(cx, wz, -cy); this.rx = a; this.rz = b; // Blender to the game's axes
    } else {
      const box = new THREE.Box3().setFromObject(o); this.centre = box.getCenter(new THREE.Vector3()); this.centre.y = box.max.y;
      this.rx = (box.max.x - box.min.x) / 2.2; this.rz = (box.max.z - box.min.z) / 2.2;
    }
    this.y = this.centre.y; this.i = 0;
    this.u = {
      sky: { value: null }, time: { value: 0 }, rain: { value: 0 }, rip: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0)) },
      moonDir: { value: (W.moonDir || new THREE.Vector3(0, 0.5, -1)).clone().normalize() }, centre: { value: this.centre }, radii: { value: new THREE.Vector2(this.rx, this.rz) },
      lant: { value: Array.from({ length: LANTERNS }, () => new THREE.Vector4(0, 0, 0, 0)) }, lcol: { value: Array.from({ length: LANTERNS }, () => new THREE.Color()) },
    };
    // the lanterns hanging above the water: each gets a soft halo that flickers gently, like a candle inside paper
    const tex = glowTexture();
    this.lanterns = String(o.userData.lanterns || '').split(';').filter(Boolean).map((t, i) => {
      const [x, y, z, ci, r = 0.09] = t.split(',').map(Number), p = new THREE.Vector3(x, z, -y), col = new THREE.Color(...LCOL[ci % LCOL.length]);
      // two halos: a warm bright glow hugging the paper, and a wide soft one lighting the air around it
      const mk = (op, sc) => { const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); h.position.copy(p); h.scale.setScalar(sc); scene.add(h); return h; };
      return { p, col, halo: mk(0.85, r * 5.5), wide: mk(0.28, r * 16), ph: Math.random() * 10 };
    });
    // reflect the lanterns nearest the middle of the pond (the shader has room for a couple of dozen)
    this.lanterns.slice().sort((a, b) => a.p.distanceTo(this.centre) - b.p.distanceTo(this.centre)).slice(0, LANTERNS).forEach((L, i) => { L.ref = i; this.u.lant.value[i].set(L.p.x, L.p.y, L.p.z, 1); this.u.lcol.value[i].copy(L.col); });
    // fairy dust drifting over the water: hundreds of tiny twinkling motes in mint, gold, rose and lilac
    const N = this.N = 520, pos = new Float32Array(N * 3), colr = new Float32Array(N * 3); this.mote = [];
    const pal = [0x9dffe0, 0xffe2a0, 0xffb3d9, 0xd2b8ff, 0xffffff].map((c) => new THREE.Color(c));
    for (let i = 0; i < N; i++) {
      let u, v; do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; } while (u * u + v * v > 1);
      this.mote.push({ x: this.centre.x + u * this.rx * 1.15, z: this.centre.z + v * this.rz * 1.15, y: this.y + 0.05 + Math.pow(Math.random(), 1.6) * 2.2, ph: Math.random() * 50, sp: 0.2 + Math.random() * 0.6, r: 0.05 + Math.random() * 0.25, c: pal[i % pal.length] });
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ map: tex, size: 0.07, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dust.frustumCulled = false; this.dust.renderOrder = 5; scene.add(this.dust);
    o.traverse((m) => {
      if (!m.isMesh) return;
      this.u.sky.value = m.material.emissiveMap || m.material.map;
      m.material = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VS, fragmentShader: FS, fog: false, transparent: true, depthWrite: false });
      m.renderOrder = 1;
    });
    // little lights resting high on trees all through the forest, like fireflies settled for the night: each one
    // breathes slowly on its own rhythm, now and then glowing a little brighter
    this.glows = String(o.userData.treeglows || '').split(';').filter(Boolean).map((t) => {
      const [x, y, z, ci] = t.split(',').map(Number), col = new THREE.Color(...GCOL[ci % GCOL.length]);
      const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      h.position.set(x, z, -y); scene.add(h);
      // (a little bigger the further away it is, so the distant ones still read as a soft light)
      const size = 0.7 + Math.min(1.2, Math.hypot(x, y) * 0.045);
      return { h, size, ph: Math.random() * 30, sp: 0.25 + Math.random() * 0.35 };
    });
    this.W = W;
  }
  // is this point over the water (a little inside the wavy shore)?
  inside(p) { if (!this.ok) return false; const x = (p.x - this.centre.x) / this.rx, z = (p.z - this.centre.z) / this.rz; return x * x + z * z < 0.86; }
  ripple(p, strength = 1) { if (!this.ok) return; const r = this.u.rip.value[this.i++ % RIPPLES]; r.set(p.x, p.z, this.u.time.value, strength); }
  update(time, rain = 0) {
    if (!this.ok) return; this.u.time.value = time; this.u.rain.value = rain; if (this.W.moonDir) this.u.moonDir.value.copy(this.W.moonDir).normalize();
    for (const L of this.lanterns) {
      const f = 0.85 + 0.1 * Math.sin(time * 2.3 + L.ph) + 0.05 * Math.sin(time * 7.1 + L.ph * 3);
      L.halo.material.opacity = 0.85 * f; L.wide.material.opacity = 0.28 * f; if (L.ref !== undefined) this.u.lant.value[L.ref].w = f * 1.4;
    }
    for (const g of this.glows) { const b = 0.5 + 0.5 * Math.sin(time * g.sp + g.ph); g.h.material.opacity = 0.45 + 0.5 * b * b; g.h.scale.setScalar(g.size * (0.85 + 0.3 * b)); }
    const pos = this.dust.geometry.attributes.position.array, col = this.dust.geometry.attributes.color.array;
    for (let i = 0; i < this.N; i++) {
      const m = this.mote[i], t = time * m.sp + m.ph;
      pos[i * 3] = m.x + Math.sin(t * 0.7) * m.r; pos[i * 3 + 1] = m.y + Math.sin(t * 0.5 + 1.3) * 0.12; pos[i * 3 + 2] = m.z + Math.cos(t * 0.6) * m.r;
      const tw = Math.pow(0.5 + 0.5 * Math.sin(time * (1 + m.sp * 3) + m.ph * 7), 3) * 1.3 + 0.25;
      col[i * 3] = m.c.r * tw; col[i * 3 + 1] = m.c.g * tw; col[i * 3 + 2] = m.c.b * tw;
    }
    this.dust.geometry.attributes.position.needsUpdate = true; this.dust.geometry.attributes.color.needsUpdate = true;
  }
}
