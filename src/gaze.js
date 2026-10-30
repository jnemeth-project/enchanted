// Look to select: for people who can't use their hands. Look at something you can touch and a soft
// ring fills around it; when it is full, the thing is squished, booped, poured on or picked up.
import * as THREE from 'three';

const DWELL = 1.4;

const ringFS = `
uniform float progress; uniform float opacity; varying vec2 vUv;
void main(){
  vec2 p = vUv * 2. - 1.; float r = length(p);
  float band = smoothstep(0.74, 0.79, r) * (1. - smoothstep(0.93, 0.98, r));
  float a = atan(p.x, p.y) / 6.2831853 + 0.5;          // 0..1 clockwise from the top
  float fill = step(a, progress);
  vec3 c = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.55), fill);
  gl_FragColor = vec4(c, band * (0.4 + 0.6 * fill) * opacity);
}`;
const ringVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

export class Gaze {
  constructor(scene, renderer, camera, input) {
    this.renderer = renderer; this.camera = camera; this.input = input; this.enabled = false;
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: { progress: { value: 0 }, opacity: { value: 0 } }, vertexShader: ringVS, fragmentShader: ringFS,
      transparent: true, depthTest: false, depthWrite: false,
    }));
    this.ring.renderOrder = 20; scene.add(this.ring);
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false }));
    this.dot.renderOrder = 21; scene.add(this.dot);
    this.key = null; this.t = 0; this.cool = 0; this.fade = 0;
  }

  update(dt) {
    this.ring.visible = this.dot.visible = this.enabled;
    if (!this.enabled) return;
    const cam = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
    const o = new THREE.Vector3(), q = new THREE.Quaternion();
    cam.getWorldPosition(o); cam.getWorldQuaternion(q);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const ray = new THREE.Ray(o, dir);
    // a small soft dot shows where you are looking
    this.dot.position.copy(o).addScaledVector(dir, 1.2); this.dot.quaternion.copy(q); this.dot.scale.setScalar(0.004);
    this.cool = Math.max(0, this.cool - dt);
    const c = this.cool > 0 ? null : this.input.pick(ray);
    if (c && c.key === this.key) this.t += dt; else { this.key = c ? c.key : null; this.t = 0; }
    this.fade += ((c ? 1 : 0) - this.fade) * Math.min(1, dt * 8);
    const m = this.ring.material.uniforms;
    // some things ask for a longer, deliberate look (the door out of the forest, the options)
    const need = (c && c.dwell) || DWELL;
    m.opacity.value = this.fade; m.progress.value = Math.min(1, this.t / need);
    if (c) {
      const d = c.point.distanceTo(o);
      this.ring.position.copy(c.point); this.ring.quaternion.copy(q); this.ring.scale.setScalar(Math.max(d * 0.07, (c.size || 0.06) * 1.9));
    }
    if (c && this.t >= need) { c.fire(); this.t = 0; this.cool = 0.9; this.key = null; }
  }
}
