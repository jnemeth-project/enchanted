// The pond: a small, still pool that reflects the night sky. The water mirrors a painted star map (made in
// Blender) along the reflected view, so the stars sit deep in the water and move as you move your head; the
// moon's reflection is drawn from tonight's moon. Its edges glow softly, a few tiny lights drift beneath
// the surface, and anything that touches the water sends out rings of light.
import * as THREE from 'three';

const RIPPLES = 8;
const VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FS = `
uniform sampler2D sky; uniform float time; uniform float rain; uniform vec4 rip[${RIPPLES}]; uniform vec3 moonDir; uniform vec3 centre; uniform vec2 radii;
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
  vec2 e = (q - centre.xz) / radii; float er = length(e);
  vec3 deep = vec3(0.004, 0.012, 0.03) + vec3(0.01, 0.04, 0.06) * max(0., 1. - er) * 0.5;
  vec3 edge = vec3(0.25, 0.95, 0.75) * smoothstep(0.9, 1.04, er) * 0.08 * (0.85 + 0.15 * sin(time * 0.8));
  vec3 rings = vec3(0.45, 1., 0.85) * min(ring, 1.5) * 0.35;
  vec2 g = q * 14. + vec2(time * 0.05, -time * 0.03); vec2 cell = floor(g); vec2 f = fract(g) - 0.5;
  float h = hash(cell); vec2 o = vec2(hash(cell + 1.7), hash(cell + 3.1)) - 0.5;
  float mote = step(0.88, h) * smoothstep(0.12, 0., length(f - o * 0.6)) * (0.5 + 0.5 * sin(time * (1. + h * 2.) + h * 30.));
  float clear = smoothstep(0.55, 1.0, er);
  gl_FragColor = vec4(deep + col + edge + rings + vec3(0.5, 1., 0.85) * mote * 0.3, mix(0.96, 0.42, clear));
  #include <colorspace_fragment>
}`;

export class Pond {
  constructor(W) {
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
    };
    o.traverse((m) => {
      if (!m.isMesh) return;
      this.u.sky.value = m.material.emissiveMap || m.material.map;
      m.material = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VS, fragmentShader: FS, fog: false, transparent: true, depthWrite: false });
      m.renderOrder = 1;
    });
    this.W = W;
  }
  // is this point over the water (a little inside the wavy shore)?
  inside(p) { if (!this.ok) return false; const x = (p.x - this.centre.x) / this.rx, z = (p.z - this.centre.z) / this.rz; return x * x + z * z < 0.86; }
  ripple(p, strength = 1) { if (!this.ok) return; const r = this.u.rip.value[this.i++ % RIPPLES]; r.set(p.x, p.z, this.u.time.value, strength); }
  update(time, rain = 0) { if (!this.ok) return; this.u.time.value = time; this.u.rain.value = rain; if (this.W.moonDir) this.u.moonDir.value.copy(this.W.moonDir).normalize(); }
}
