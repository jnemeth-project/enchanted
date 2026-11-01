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
    // the confirm step: a second, smaller ring with a tick, just beside the thing you chose
    this.ring2 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: { progress: { value: 0 }, opacity: { value: 0 } }, vertexShader: ringVS, fragmentShader: ringFS,
      transparent: true, depthTest: false, depthWrite: false,
    }));
    this.ring2.renderOrder = 22; this.ring2.visible = false; scene.add(this.ring2);
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.strokeStyle = '#fff3cf'; g.lineWidth = 14; g.lineCap = 'round'; g.lineJoin = 'round'; g.shadowColor = 'rgba(255,220,150,0.9)'; g.shadowBlur = 14;
    g.beginPath(); g.moveTo(36, 66); g.lineTo(56, 86); g.lineTo(94, 44); g.stroke();
    const tt = new THREE.CanvasTexture(c); tt.colorSpace = THREE.SRGBColorSpace;
    this.tick = new THREE.Sprite(new THREE.SpriteMaterial({ map: tt, transparent: true, depthTest: false, depthWrite: false }));
    this.tick.renderOrder = 23; this.tick.visible = false; scene.add(this.tick);
    this.confirm = null;
  }

  update(dt) {
    this.ring.visible = this.dot.visible = this.enabled;
    if (!this.enabled) return;
    const xr = this.renderer.xr.isPresenting, cam = xr ? this.renderer.xr.getCamera() : this.camera;
    const o = new THREE.Vector3(), q = new THREE.Quaternion();
    // in the headset, look from exactly between your two eyes (the combined XR camera sits a little behind and off-centre)
    if (xr && cam.cameras && cam.cameras.length >= 2) {
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      // (read straight from the eye cameras' world matrices: getWorldPosition() would recompute them without the rig)
      a.setFromMatrixPosition(cam.cameras[0].matrixWorld); b.setFromMatrixPosition(cam.cameras[1].matrixWorld); o.copy(a).add(b).multiplyScalar(0.5);
      cam.cameras[0].matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    } else { cam.getWorldPosition(o); cam.getWorldQuaternion(q); }
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const ray = new THREE.Ray(o, dir);
    // a small soft dot shows where you are looking
    this.dot.position.copy(o).addScaledVector(dir, 1.2); this.dot.quaternion.copy(q); this.dot.scale.setScalar(0.004);
    this.dot.visible = !xr && this.enabled; // no pointer dot in the headset (it sat too close to one eye)
    this.cool = Math.max(0, this.cool - dt);
    // waiting for a confirm: look at the little tick beside it until its ring fills too
    if (this.confirm) {
      const k = this.confirm;
      k.life -= dt;
      const on = ray.distanceToPoint(k.at) < k.r;
      k.t = on ? k.t + dt : Math.max(0, k.t - dt * 1.5);
      const u2 = this.ring2.material.uniforms; u2.progress.value = Math.min(1, k.t / 1.1); u2.opacity.value = Math.min(1, (k.life > 0 ? 1 : 0) + 0.0);
      this.ring2.position.copy(k.at); this.ring2.quaternion.copy(q); this.ring2.scale.setScalar(k.r * 2.4);
      this.tick.position.copy(k.at); this.tick.scale.setScalar(k.r * 1.5); this.tick.material.opacity = 0.75 + 0.25 * Math.sin(performance.now() / 180);
      this.ring2.visible = this.tick.visible = true;
      this.ring.material.uniforms.opacity.value = 0.6; this.ring.material.uniforms.progress.value = 1;
      if (k.t >= 1.1) { const c0 = k.c; this._endConfirm(); this.cool = 0.9; c0.fire(); return; }
      if (k.life <= 0 && !on) { this._endConfirm(); this.cool = 0.4; }
      return;
    }
    let c = this.cool > 0 ? null : this.input.pick(ray, false, true);
    // things within arm's reach are for your hands: looking only chooses things further away
    // (except what is meant to be used by looking, like the fireflies in their game or the options panel)
    if (c && !c.gazeNear && c.point && c.point.distanceTo(o) < 1.2) c = null;
    if (c && c.point && c.point.distanceTo(o) < 0.5) c = null; // never put a ring right in front of your eyes
    if (c && c.handsOnly) c = null; // plants, stones and crystals are for your hands, never chosen by looking
    if (c && c.key === this.key) this.t += dt; else { this.key = c ? c.key : null; this.t = 0; }
    this.fade += ((c ? 1 : 0) - this.fade) * Math.min(1, dt * 3); // the ring eases in gently, never pops on
    const m = this.ring.material.uniforms;
    // some things ask for a longer, deliberate look (the door out of the forest, the options)
    const need = (c && c.dwell) || DWELL;
    m.opacity.value = this.fade; m.progress.value = Math.min(1, this.t / need);
    if (c) {
      const d = c.point.distanceTo(o);
      this.ring.position.copy(c.point); this.ring.quaternion.copy(q); this.ring.scale.setScalar(Math.min(d * 0.16, Math.max(d * 0.07, (c.size || 0.06) * 1.9)) * (0.7 + 0.3 * this.fade)); // small, and never bigger than a little part of your view
    }
    if (c && this.t >= need) {
      this.t = 0; this.key = null;
      if (c.confirm) {
        // the second step: a tick appears just to the right of what you chose
        const d = c.point.distanceTo(o), right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
        const r = Math.max(0.035, d * 0.045);
        this.confirm = { c, at: c.point.clone().addScaledVector(right, Math.max((c.size || 0.06) * 0.9, d * 0.13) + r), r, t: 0, life: 4 };
      } else { c.fire(); this.cool = 0.9; }
    }
  }

  _endConfirm() { this.confirm = null; this.ring2.visible = this.tick.visible = false; this.ring2.material.uniforms.progress.value = 0; }
}
