// Mixed reality: your own room, seen at eye level all the way round, between the forest floor below and the
// night sky and treetops above. Everything near you (the shelf, the pot, your hands, the games in front of you)
// stays in front of the room.
// How: in the headset's mixed reality mode (an immersive-ar session) the picture is see-through wherever it is
// transparent. A wide ring round the seat, a few metres out, makes a soft horizontal band transparent: it
// multiplies what is already drawn behind it towards clear (and blocks the far forest's glows there), with
// feathered edges, so the room fades in gently rather than as a hard cut. Things nearer than the ring are not
// touched. Turning it on or off fades over a couple of seconds.
// Where the headset has no mixed reality (or outside the headset) none of this is shown.
import * as THREE from 'three';

const R = 3.9;                       // metres from the seat: the ring toss rings (up to 3.6 m) stay in front
const LO = -8, HI = 22, FEATHER = 6; // the band, in degrees above the horizon from your eyes, and its soft edges
const deg = THREE.MathUtils.degToRad;

export class Passthrough {
  constructor(scene, bg) {
    this.scene = scene; this.on = false; this.ar = false; this.hold = false; this.k = 0;
    // in mixed reality the headset clears to see-through, so the forest gets its own night background
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.MeshBasicMaterial({ color: bg, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    this.dome.renderOrder = -100; this.dome.frustumCulled = false; this.dome.visible = false; scene.add(this.dome);
    const y0 = R * Math.tan(deg(LO - FEATHER)), y1 = R * Math.tan(deg(HI + FEATHER));
    const geo = new THREE.CylinderGeometry(R, R, y1 - y0, 72, 1, true); geo.translate(0, (y0 + y1) / 2, 0);
    this.uni = { amount: { value: 0 }, winC: { value: 0 }, winH: { value: -10 } };
    this.ring = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uni,
      vertexShader: `varying float vEl; varying vec3 vP; void main() { vP = position; vEl = degrees(atan(position.y, ${R.toFixed(2)})); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float amount, winC, winH; varying float vEl; varying vec3 vP;
        void main() {
          float band = smoothstep(${(LO - FEATHER).toFixed(1)}, ${LO.toFixed(1)}, vEl) * (1.0 - smoothstep(${HI.toFixed(1)}, ${(HI + FEATHER).toFixed(1)}, vEl));
          // a window of forest left open round the way out (the magic door and the Options sign)
          float az = degrees(atan(vP.x, -vP.z)), d = abs(mod(az - winC + 540.0, 360.0) - 180.0);
          band *= smoothstep(winH, winH + 6.0, d);
          float keep = 1.0 - amount * band;
          if (keep > 0.995) discard;
          gl_FragColor = vec4(0.0, 0.0, 0.0, keep);
        }`,
      side: THREE.BackSide, fog: false, transparent: false, depthWrite: true, depthTest: true,
      // what is already drawn there is multiplied by "keep", colour and alpha alike (alpha 0 = your room)
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.SrcAlphaFactor,
    }));
    // drawn after the rest of the solid forest, before anything see-through (glows, words, panels)
    this.ring.renderOrder = 20; this.ring.frustumCulled = false; this.ring.visible = false; scene.add(this.ring);
  }

  // keep the forest showing round these things (seen from the seat), so the way out can always be found
  keepVisible(objs, eye) {
    const az = []; const v = new THREE.Vector3();
    for (const o of objs) { if (!o) continue; const b = new THREE.Box3().setFromObject(o);
      for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) { v.set(x - eye.x, 0, z - eye.z); az.push(THREE.MathUtils.radToDeg(Math.atan2(v.x, -v.z))); } }
    if (!az.length) return;
    const lo = Math.min(...az), hi = Math.max(...az);   // (the door and sign are ahead-right: no wrap at 180°)
    this.uni.winC.value = (lo + hi) / 2; this.uni.winH.value = (hi - lo) / 2 + 3;
  }

  // the session decides whether the room can be shown at all
  setSession(session) {
    const m = session && session.environmentBlendMode;
    this.ar = m === 'alpha-blend' || m === 'additive';
    this.dome.visible = this.ar;
    if (!this.ar) { this.k = 0; this.ring.visible = false; }
  }

  get showing() { return this.ar && this.k > 0.5; }

  update(dt, seatEye) {
    const target = this.ar && this.on && !this.hold ? 1 : 0;
    this.k += Math.sign(target - this.k) * Math.min(Math.abs(target - this.k), dt / 2.0);
    this.uni.amount.value = this.k * this.k * (3 - 2 * this.k);
    this.ring.visible = this.ar && this.k > 0.001;
    if (this.ring.visible) this.ring.position.copy(seatEye);
    if (this.dome.visible) this.dome.position.copy(seatEye);
  }
}
