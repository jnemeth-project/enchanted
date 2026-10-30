// One place that turns hands, controllers, gaze-and-pinch and the desktop mouse into
// simple signals the rest of the game understands: fingertip points, palms, pinches and rays.
import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

const TIPS = ['thumb-tip', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'];
const v = () => new THREE.Vector3();

class HandState {
  constructor(i) {
    this.i = i; this.side = i === 0 ? 'left' : 'right'; this.present = false;
    this.tips = TIPS.map(v); this.prevTips = TIPS.map(v); this.tipVel = TIPS.map(v);
    this.palm = v(); this.prevPalm = v(); this.palmVel = v(); this.palmNormal = v(); this.wrist = v();
    this.pinching = false; this.pinchPoint = v(); this.pinchStarted = false; this.pinchEnded = false;
    this.speed = 0;
  }
  get index() { return this.tips[1]; }
  get thumb() { return this.tips[0]; }
  // fingertips inside a sphere
  countInside(c, r) { let n = 0; for (const t of this.tips) if (t.distanceTo(c) < r) n++; return n; }
}

export class Input {
  constructor(renderer, rig, camera) {
    this.renderer = renderer; this.rig = rig; this.camera = camera;
    this.hands = [new HandState(0), new HandState(1)];
    this.rayHandlers = []; this.mode = 'desktop';
    // Far pointing (stargazing): hands then aim with the headset's own hand ray and pinch to select.
    this.farHands = false; this.aim = [null, null]; this.beam = [false, false];
    this.handMat = new THREE.MeshBasicMaterial({ color: 0xbfe2ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    const factory = new XRHandModelFactory();
    this.xrHands = [0, 1].map((i) => {
      const h = renderer.xr.getHand(i); rig.add(h);
      const model = factory.createHandModel(h, 'mesh'); h.add(model);
      h.addEventListener('connected', (e) => { this.hands[i].side = e.data.handedness; h.userData.connected = true; });
      h.addEventListener('disconnected', () => { h.userData.connected = false; this.hands[i].present = false; });
      return { h, model, styled: false };
    });
    this.controllers = [0, 1].map((i) => {
      const c = renderer.xr.getController(i); rig.add(c);
      c.addEventListener('connected', (e) => {
        c.userData.source = e.data;
        if (e.data.targetRayMode === 'tracked-pointer') { const line = this._rayLine(); line.userData.hand = !!e.data.hand; c.userData.line = line; c.add(line); }
      });
      c.addEventListener('disconnected', () => { c.userData.source = null; c.clear(); });
      c.addEventListener('selectstart', () => {
        const src = c.userData.source;
        if (!src) return;
        const o = new THREE.Vector3(), q = new THREE.Quaternion();
        c.getWorldPosition(o); c.getWorldQuaternion(q);
        // a hand's pinch-at-a-distance only reaches the far-away things made for pointing (the door, the sign,
        // the options panel, stars); everything nearby is touched directly
        this.emitRay(new THREE.Ray(o, new THREE.Vector3(0, 0, -1).applyQuaternion(q)), !!src.hand && !this.farHands);
      });
      return c;
    });
  }

  _rayLine() {
    // a soft beam that fades out along its length
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.06), new THREE.Vector3(0, 0, -2.5)]);
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.8, 0.9, 1, 0, 0, 0], 3));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  }

  // each picker returns { key, point, fire } for what the ray points at, or null
  // ui pickers can be reached by pointing a hand from afar; the others only by gaze, mouse or controller
  addPicker(fn, { ui = false } = {}) { this.rayHandlers.push({ fn, ui }); }
  pick(ray, uiOnly = false) { for (const h of this.rayHandlers) { if (uiOnly && !h.ui) continue; const c = h.fn(ray); if (c) return c; } return null; }
  emitRay(ray, uiOnly = false) { const c = this.pick(ray, uiOnly); if (c) { c.fire(); return true; } return false; }
  setBeam(i, on) { this.beam[i] = on; }

  update(dt) {
    const xr = this.renderer.xr.isPresenting;
    this.mode = xr ? 'xr' : 'desktop';
    // pointing rays from controllers and (when allowed) hands
    this.controllers.forEach((c, i) => {
      const src = c.userData.source, line = c.userData.line;
      const usable = xr && c.visible && src && src.targetRayMode === 'tracked-pointer';
      if (line) line.visible = !!usable && (!src.hand || this.farHands || this.beam[i]);
      if (!usable) { this.aim[i] = null; return; }
      const o = new THREE.Vector3(), q = new THREE.Quaternion();
      c.getWorldPosition(o); c.getWorldQuaternion(q);
      this.aim[i] = { ray: new THREE.Ray(o, new THREE.Vector3(0, 0, -1).applyQuaternion(q)), hand: !!src.hand };
    });
    for (let i = 0; i < 2; i++) {
      const H = this.hands[i], X = this.xrHands[i];
      H.pinchStarted = H.pinchEnded = false;
      const j = X.h.joints;
      const wrist = j && j['wrist'];
      const ok = xr && X.h.userData.connected && wrist && wrist.visible;
      if (!ok) { if (H.present && H.pinching) H.pinchEnded = true; H.present = false; H.pinching = false; continue; }
      if (!X.styled && X.model.children.length) {
        X.model.traverse((m) => { if (m.isMesh) { m.material = this.handMat; m.renderOrder = 5; } });
        X.styled = true;
      }
      const wasPresent = H.present; H.present = true;
      TIPS.forEach((name, k) => {
        const jt = j[name]; if (!jt) return;
        H.prevTips[k].copy(H.tips[k]); jt.getWorldPosition(H.tips[k]);
        if (wasPresent && dt > 0) H.tipVel[k].subVectors(H.tips[k], H.prevTips[k]).divideScalar(dt); else H.tipVel[k].set(0, 0, 0);
      });
      wrist.getWorldPosition(H.wrist);
      const im = v(), pm = v(), mp = v();
      if (j['index-finger-metacarpal']) j['index-finger-metacarpal'].getWorldPosition(im);
      if (j['pinky-finger-metacarpal']) j['pinky-finger-metacarpal'].getWorldPosition(pm);
      if (j['middle-finger-phalanx-proximal']) j['middle-finger-phalanx-proximal'].getWorldPosition(mp);
      H.prevPalm.copy(H.palm); H.palm.lerpVectors(H.wrist, mp, 0.55);
      H.palmVel.subVectors(H.palm, H.prevPalm).divideScalar(Math.max(dt, 1e-3));
      if (!wasPresent) H.palmVel.set(0, 0, 0);
      H.speed = H.palmVel.length();
      const a = im.sub(H.wrist), b = pm.sub(H.wrist);
      H.palmNormal.crossVectors(a, b).normalize();
      if (H.side === 'left') H.palmNormal.negate();
      // Fingers curl toward the palm side: when they clearly do, trust that over handedness.
      const curl = v(); for (let k = 1; k < 5; k++) curl.add(H.tips[k]); curl.multiplyScalar(0.25).sub(H.palm);
      const side = curl.dot(H.palmNormal);
      if (side < -0.015) H.palmNormal.negate();
      const pd = H.thumb.distanceTo(H.index);
      const was = H.pinching;
      H.pinching = was ? pd < 0.04 : pd < 0.022;
      H.pinchPoint.lerpVectors(H.thumb, H.index, 0.5);
      H.pinchStarted = !was && H.pinching; H.pinchEnded = was && !H.pinching;
    }
  }

  get anyHand() { return this.hands.some((h) => h.present); }
}

// Desktop fallback: drag to look around, click to touch. Lets the game be tried without a headset.
export class DesktopControls {
  constructor(dom, camera, input) {
    this.camera = camera; this.yaw = 0; this.pitch = 0; this.down = null; this.enabled = true;
    const ray = new THREE.Raycaster();
    dom.addEventListener('pointerdown', (e) => { this.down = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, moved: false }; });
    dom.addEventListener('pointermove', (e) => {
      if (!this.down || !this.enabled) return;
      const dx = e.clientX - this.down.x, dy = e.clientY - this.down.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.down.moved = true;
      this.yaw = this.down.yaw - dx * 0.004; this.pitch = Math.max(-1.3, Math.min(1.3, this.down.pitch - dy * 0.004));
    });
    dom.addEventListener('pointerup', (e) => {
      if (this.down && !this.down.moved && this.enabled) {
        const r = dom.getBoundingClientRect();
        const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        input.emitRay(ray.ray.clone());
      }
      this.down = null;
    });
  }
  update() {
    if (!this.enabled) return;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
