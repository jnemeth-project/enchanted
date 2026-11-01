// The first night: you arrive in a forest that is fast asleep. Every light is out; the only sound is the little
// waterfall at the back of the pond. Reach out and touch something, and the butterfly comes to say hello, then
// flies off to spread the word: wherever it lands, the light wakes and spreads out from there, and the night
// sounds grow. Last of all it rings the doorbell of the fairies' home in the old lilac giant: the window lights
// up, the fairies come out, twirl round the mushroom, and settle on the flowers nearby, where they stay.
import * as THREE from 'three';
import { tweens, glowTexture, rand } from './util.js';

// ------------------------------------------------------------------ the light that spreads (one shared uniform set)
// Every glowing material in the forest is dimmed by wakeK(), which is the brighter of a faint base glow and any
// "wake sphere" that has reached it. Once the whole forest is awake (wakeAll = 1) it costs nothing.
const N_SPHERES = 10;
const GLSL = `
uniform vec4 wakeS[${N_SPHERES}]; uniform float wakeAll; uniform float wakeBase; varying vec3 vWakeW;
float wakeK() {
  if (wakeAll > 0.999) return 1.0;
  float w = wakeBase;
  for (int i = 0; i < ${N_SPHERES}; i++) { vec4 s = wakeS[i]; if (s.w > 0.0) w = max(w, 1.0 - smoothstep(s.w * 0.72, s.w, distance(vWakeW, s.xyz))); }
  return mix(w, 1.0, wakeAll);
}
`;
const VPOS = `
#ifdef USE_INSTANCING
  vWakeW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vWakeW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
`;

export class WakeField {
  constructor() {
    this.U = {
      wakeS: { value: Array.from({ length: N_SPHERES }, () => new THREE.Vector4(0, -99, 0, 0)) },
      wakeAll: { value: 1 }, wakeBase: { value: 0.05 },
    };
    this.next = 0;
  }

  // dims everything glowing under root (the forest): lit materials' glow, and additive glows
  patch(root) {
    const done = new Set(), U = this.U;
    root.traverse((o) => {
      if (!o.material) return;
      for (const m of [].concat(o.material)) {
        if (done.has(m)) continue; done.add(m);
        if (m.isShaderMaterial || /Moon|StarSky|StarField|^Sky/i.test(m.name || '')) continue;
        const lit = m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial;
        const glow = (m.isMeshBasicMaterial || m.isPointsMaterial || m.isSpriteMaterial) && m.blending === THREE.AdditiveBlending;
        if (!lit && !glow) continue;
        const prev = m.onBeforeCompile, key = m.customProgramCacheKey.call(m);
        m.onBeforeCompile = (sh, r) => {
          if (prev) prev.call(m, sh, r);
          Object.assign(sh.uniforms, U);
          sh.vertexShader = 'varying vec3 vWakeW;\n' + (m.isSpriteMaterial
            ? sh.vertexShader.replace('#include <fog_vertex>', 'vWakeW = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;\n#include <fog_vertex>')
            : sh.vertexShader.replace('#include <fog_vertex>', VPOS + '#include <fog_vertex>'));
          sh.fragmentShader = GLSL + (lit
            ? sh.fragmentShader.replace('#include <lights_fragment_begin>', 'totalEmissiveRadiance *= wakeK();\n#include <lights_fragment_begin>')
            : sh.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb *= wakeK();'));
        };
        m.customProgramCacheKey = () => key + '|wake';
        m.needsUpdate = true;
      }
    });
  }

  // a sphere of light that grows from centre out to radius R over dur seconds
  add(centre, R, dur = 3) {
    const v = this.U.wakeS.value[this.next++ % N_SPHERES];
    v.set(centre.x, centre.y, centre.z, 0.001);
    tweens.add(dur, (k) => { v.w = R * (1 - (1 - k) * (1 - k)); });
    return v;
  }
  covers(p) { return this.U.wakeAll.value > 0.99 || this.U.wakeS.value.some((s) => s.w > 0 && p.distanceTo(new THREE.Vector3(s.x, s.y, s.z)) < s.w * 0.8); }
  set all(k) { this.U.wakeAll.value = k; }
  get all() { return this.U.wakeAll.value; }
}

// ------------------------------------------------------------------ the waterfall: flowing water, rippling foam, its sound
const WATER_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const WATER_FS = `uniform float time; varying vec2 vUv;
void main(){
  float u = vUv.x, v = vUv.y;          // v: 0 at the top of the ribbon (where it leaves the rock), 1 at the pond
  float a = sin((v * 5.0 - time * 1.6) * 6.2832 + sin(u * 9.0 + v * 3.0) * 1.6) * 0.5 + 0.5;
  float b = sin((v * 9.0 - time * 2.4) * 6.2832 + u * 14.0) * 0.5 + 0.5;
  float line = smoothstep(0.62, 1.0, a) * 0.8 + smoothstep(0.8, 1.0, b) * 0.5;
  float edge = smoothstep(0.0, 0.22, u) * smoothstep(1.0, 0.78, u);
  float alpha = (0.32 + 0.45 * line) * edge * smoothstep(1.0, 0.95, v) * (0.85 + 0.15 * smoothstep(0.0, 0.08, v));
  vec3 col = mix(vec3(0.42, 0.66, 0.82), vec3(0.92, 0.98, 1.0), clamp(line, 0.0, 1.0));
  gl_FragColor = vec4(col * 0.95, alpha);
}`;
const FOAM_FS = `uniform float time; varying vec2 vUv;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float rings = sin(r * 11.0 - time * 3.2) * 0.5 + 0.5;
  float fizz = sin(atan(vUv.y - 0.5, vUv.x - 0.5) * 9.0 + time * 1.7 + r * 6.0) * 0.5 + 0.5;
  float alpha = smoothstep(1.0, 0.25, r) * (0.18 + 0.32 * rings * (0.6 + 0.4 * fizz));
  gl_FragColor = vec4(vec3(0.85, 0.95, 1.0) * 0.8, alpha);
}`;

export class Waterfall {
  constructor(W, sound) {
    this.sound = sound; this.u = { time: { value: 0 } };
    this.water = W.byName.G_WaterfallWater; this.foam = W.byName.G_WaterfallFoam;
    const mk = (fs) => new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: WATER_VS, fragmentShader: fs, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    if (this.water) this.water.traverse((m) => { if (m.isMesh) { m.material = mk(WATER_FS); m.renderOrder = 3; } });
    if (this.foam) this.foam.traverse((m) => { if (m.isMesh) { m.material = mk(FOAM_FS); m.renderOrder = 3; } });
    const s = W.byName.G_WaterfallSound; this.at = s ? s.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(6.2, 0.2, -4.7);
  }
  start() { this.sound.waterfall(this.at); }
  update(dt, time, eye, dir) { this.u.time.value = time; this.sound.waterfallTick(dt, eye, dir); }
}

// ------------------------------------------------------------------ the fairies (they live in the old lilac giant)
const TINTS = [0xc9a6ff, 0x8ff5d4, 0xffc3a0, 0x9fd4ff];

export class Fairies {
  constructor(scene, W, sound, effects) {
    this.scene = scene; this.sound = sound; this.effects = effects;
    const get = (n) => W.byName[n];
    this.model = get('G_FairyModel'); this.wingsModel = get('G_FairyWings');
    this.window = get('G_FairyWindowSpot') ? get('G_FairyWindowSpot').getWorldPosition(new THREE.Vector3()) : null;
    this.bell = get('G_FairyBellSpot') ? get('G_FairyBellSpot').getWorldPosition(new THREE.Vector3()) : null;
    this.bellObj = get('G_FairyBell');
    this.rests = [0, 1, 2, 3].map((i) => get('G_FairyRest_' + i)).filter(Boolean).map((o) => o.getWorldPosition(new THREE.Vector3()));
    this.glass = []; const g = get('G_FairyWindowGlass');
    if (g) g.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.emissive.setRGB(1.0, 0.72, 0.38); m.material.emissiveIntensity = 0; this.glass.push(m.material); } });
    // a warm glow in front of the window when it is lit, so you can see the light come on from where you sit
    if (this.window) {
      this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc070, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      const toYou = new THREE.Vector3(-this.window.x, 0, -this.window.z).normalize();   // a little out from the stem, so the stem never hides it
      this.halo.position.copy(this.window).addScaledVector(toYou, 0.55); this.halo.scale.setScalar(1.3); scene.add(this.halo);
    }
    // the giant's stem: the fairies twirl round it
    this.axis = this.window ? new THREE.Vector3(this.window.x, 0, this.window.z) : null;
    if (this.window) { const out = new THREE.Vector3(this.window.x, 0, this.window.z).normalize(); this.axis.addScaledVector(out, 0.6); }
    this.list = []; this.home = false;
    if (!this.model || !this.window || !this.rests.length) return;
    for (let i = 0; i < 4; i++) this.list.push(this._make(i));
  }

  get ok() { return this.list.length > 0; }

  _make(i) {
    const g = new THREE.Group(); g.visible = false;
    const body = this.model.clone(true); body.visible = true; body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); body.scale.setScalar(2.0);
    const tint = new THREE.Color(TINTS[i % TINTS.length]);
    const tintMat = (mm) => { const c = mm.clone(); if (/Dress/.test(mm.name) && c.emissive) { c.color.copy(tint); c.emissive.copy(tint); } return c; };
    body.traverse((m) => { m.visible = true; if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(tintMat) : tintMat(m.material); });
    g.add(body);
    let wings = null;
    if (this.wingsModel) { wings = this.wingsModel.clone(true); wings.visible = true; wings.position.set(0, 0, 0); wings.rotation.set(0, 0, 0); wings.scale.setScalar(2.0); wings.traverse((m) => { m.visible = true; }); g.add(wings); }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: tint.clone().lerp(new THREE.Color(1, 1, 1), 0.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.y = 0.08; glow.scale.setScalar(0.62); g.add(glow);
    this.scene.add(g);
    return { g, body, wings, glow, tint, state: 'home', t: 0, ph: i * 1.7, rest: i % this.rests.length, from: new THREE.Vector3(), mid: new THREE.Vector3(), to: new THREE.Vector3(), dur: 2, hop: rand(15, 35) };
  }

  // a later night: the fairies are already out, resting on their flowers, and their window is lit
  settle() {
    if (!this.ok) return;
    this.home = true; for (const m of this.glass) m.emissiveIntensity = 1.4; if (this.halo) this.halo.material.opacity = 0.75;
    this.list.forEach((f) => { f.state = 'rest'; f.g.visible = true; f.g.position.copy(this.rests[f.rest]); f.light = 1; });
  }

  // the bell rings: the window lights, and one after another the fairies come out and twirl round the giant
  wake(onSettled) {
    if (!this.ok) { if (onSettled) onSettled(); return; }
    this.home = true;
    tweens.add(1.4, (k) => { for (const m of this.glass) m.emissiveIntensity = 1.4 * k * k; if (this.halo) this.halo.material.opacity = 0.75 * k * k; }, { delay: 0.8 });
    this.list.forEach((f, i) => {
      tweens.add(0.1, () => {}, { delay: 2.2 + i * 0.7, done: () => {
        f.state = 'twirl'; f.t = 0; f.g.visible = true; f.g.position.copy(this.window); f.light = 0;
        if (this.effects) this.effects.sparkle(this.window.clone(), f.tint.getHex(), 8, 0.08);
        this.sound.chime(this.window.clone(), 784 + i * 98);
      } });
    });
    tweens.add(0.1, () => {}, { delay: 2.2 + 3 * 0.7 + 7.5 + 3.2, done: () => { if (onSettled) onSettled(); } });
  }

  _fly(f, to, dur) {
    f.from.copy(f.g.position); f.to.copy(to); f.dur = dur; f.t = 0; f.state = 'fly';
    f.mid.copy(f.from).lerp(f.to, 0.5); f.mid.y = Math.max(f.from.y, f.to.y) + 0.5;
  }

  update(dt, time, eye) {
    for (const f of this.list) {
      if (f.state === 'home') continue;
      f.t += dt; f.light = Math.min(1, (f.light || 0) + dt);
      const p = f.g.position;
      if (f.state === 'twirl') {
        // out of the window, then a slow rising spiral round the stem, each fairy on its own track
        const T = 7.5, u = Math.min(1, f.t / T), a = f.ph + u * Math.PI * 3.2, R = 0.85 + 0.25 * Math.sin(u * Math.PI);
        const out = Math.min(1, f.t / 0.8);
        const goal = new THREE.Vector3(this.axis.x + Math.cos(a) * R, this.window.y + 0.2 + u * 1.1 + 0.12 * Math.sin(f.t * 2.5 + f.ph), this.axis.z + Math.sin(a) * R);
        p.lerp(goal, out < 1 ? out * 0.15 : 1 - Math.exp(-4 * dt));
        if (u >= 1) this._fly(f, this.rests[f.rest].clone().add(new THREE.Vector3(0, 0.02, 0)), 3.0);
      } else if (f.state === 'fly') {
        const u = Math.min(1, f.t / f.dur), e = u * u * (3 - 2 * u);
        p.copy(f.from).multiplyScalar((1 - e) * (1 - e)).addScaledVector(f.mid, 2 * (1 - e) * e).addScaledVector(f.to, e * e);
        if (u >= 1) { f.state = 'rest'; f.t = 0; f.hop = rand(18, 40); }
      } else if (f.state === 'rest') {
        // resting on a flower: a tiny sway; now and then a little flit to another free flower
        p.y = this.rests[f.rest].y + 0.02 + Math.sin(time * 1.3 + f.ph) * 0.006;
        if (f.t > f.hop) {
          const taken = new Set(this.list.map((x) => x.rest)); const free = this.rests.map((_, k) => k).filter((k) => !taken.has(k));
          if (free.length) { f.rest = free[Math.floor(Math.random() * free.length)]; this._fly(f, this.rests[f.rest].clone().add(new THREE.Vector3(0, 0.02, 0)), 2.6); }
          else { f.t = 0; f.hop = rand(18, 40); }
        }
      }
      // facing: where it flies, or towards you while it rests
      const look = f.state === 'rest' ? eye : f.state === 'fly' ? f.to : p.clone().add(new THREE.Vector3(-(p.z - this.axis.z), 0, p.x - this.axis.x));
      f.body.lookAt(look.x, p.y + (f.state === 'rest' ? 0 : 0.0), look.z); f.body.rotateY(Math.PI);
      if (f.wings) { f.wings.quaternion.copy(f.body.quaternion); const fast = f.state !== 'rest'; f.wings.scale.set(2.0 * (fast ? 0.45 + 0.55 * Math.abs(Math.sin(time * 28 + f.ph)) : 0.8 + 0.2 * Math.sin(time * 3 + f.ph)), 2.0, 2.0); }
      f.glow.material.opacity = f.light * (0.85 + 0.15 * Math.sin(time * 2 + f.ph));
    }
  }
}

// ------------------------------------------------------------------ the intro itself
export class Intro {
  // ctx: { W, scene, sleep, guide, sound, effects, wake, fairies, say(text, opts), eyePos(), atEye(x, y, z), lights: [{ light, base }] }
  constructor(ctx) {
    this.c = ctx; this.state = 'off'; this.t = 0; this.hopI = -1; this.hops = []; this.progress = 0;
  }
  get running() { return this.state !== 'off' && this.state !== 'done'; }

  start() {
    const c = this.c;
    this.state = 'asleep'; this.t = 0; this.progress = 0;
    c.wake.all = 0; c.sleep.sleepNow();
    c.sound.setAmbience(0.0001, 0.3);
    for (const L of c.lights) L.light.intensity = L.base * 0.45;
    // the giants' ribbons of light are out too, until the light reaches their giant
    this.ribbons = [];
    c.W.root.traverse((o) => {
      if (!o.isMesh || !/GiantRibbon/.test(o.name + (o.parent ? o.parent.name : ''))) return;
      for (const m of [].concat(o.material)) if (m.uniforms && m.uniforms.fade) {
        const centre = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
        m.uniforms.fade.value = 0; this.ribbons.push({ m, centre, k: 0, on: false });
      }
    });
    // where the butterfly goes, in order: around you, along the path ahead, the pond and its waterfall, the left
    // side, and last the fairies' giant
    const f = c.fairies, giant = f && f.window ? f.window.clone() : new THREE.Vector3(-4.9, 1.45, -8.9);
    const P = (x, y, z) => new THREE.Vector3(x, y, z);
    this.hops = [
      { at: P(0.35, 0.6, -1.7), R: 3.4 },
      { at: P(1.6, 0.9, -4.6), R: 6.5 },
      { at: P(5.3, 0.6, -3.2), R: 6.5 },
      { at: P(-3.4, 0.8, -2.6), R: 7 },
      { at: giant, R: 7.5, fairies: true },
    ];
  }

  // something was touched (or clicked) for the first time: the butterfly comes
  touched(point) {
    if (this.state !== 'asleep') return;
    const c = this.c; this.state = 'hello'; this.t = 0;
    if (point) c.wake.add(point, 0.8, 1.2);
    tweens.add(0.1, () => {}, { delay: 1.0, done: () => {
      const eye = c.eyePos();
      c.guide.appear(eye.clone().add(new THREE.Vector3(0.6, 1.2, -3.2)));
      c.guide.goTo(c.atEye(0.22, 0.92, -0.55), { orbit: 0.03, speed: 1.4 });
      c.sound.chime(eye.clone().add(new THREE.Vector3(0.4, 0.4, -1.5)), 523.25);
    } });
    const lines = [['Oh, hello!', 2.2], ["It's been a while\nsince we had a visitor", 3.4], ["We're so excited to see you", 3.0], ['Let me spread the word', 2.6]];
    let at = 3.2;
    for (const [text, hold] of lines) { tweens.add(0.1, () => {}, { delay: at, done: () => c.say(text, { hold }) }); at += hold + 0.9; }
    tweens.add(0.1, () => {}, { delay: at + 0.2, done: () => this._nextHop() });
  }

  _nextHop() {
    const c = this.c;
    this.hopI++;
    const h = this.hops[this.hopI];
    if (!h) { this._finish(); return; }
    this.state = 'fly'; this.t = 0;
    if (h.fairies && c.fairies && c.fairies.bell) {
      // to the doorbell: it lands beside it and rings it
      const bell = c.fairies.bell;
      const ring = this.bellTap = () => {
        if (this.rang) return; this.rang = true;
        c.sound.doorbell(bell.clone());
        if (c.fairies.bellObj) { const o = c.fairies.bellObj, r0 = o.rotation.z; tweens.add(1.6, (k) => { o.rotation.z = r0 + Math.sin(k * Math.PI * 5) * 0.25 * (1 - k); }); }
        this._wakeAt(h, 0.6);
        c.fairies.wake(() => this._finish());
        tweens.add(0.1, () => {}, { delay: 2.2, done: () => c.guide.goTo(c.atEye(-0.3, 0.95, -0.75), { orbit: 0.05, speed: 1.6 }) });
      };
      this.bellAt = bell.clone().add(new THREE.Vector3(0, -0.03, 0));
      c.guide.tap(this.bellAt, ring);
      this.state = 'bell'; this.t = 0;
      return;
    }
    c.guide.goTo(h.at.clone().add(new THREE.Vector3(0, 0.25, 0)), { speed: 2.4 });
    this.hop = h;
  }

  _wakeAt(h, delay = 0) {
    const c = this.c;
    tweens.add(0.1, () => {}, { delay, done: () => {
      c.wake.add(h.at, h.R, 3.2);
      if (c.effects) c.effects.sparkle(h.at.clone(), 0xfff1c8, 30, 0.35);
      c.sound.chime(h.at.clone(), [392, 440, 523.25, 587.33, 659.25][this.hopI % 5]);
      this.progress = Math.min(1, (this.hopI + 1) / (this.hops.length + 1));
      c.sound.setAmbience(0.12 + 0.6 * this.progress, 2.5);
    } });
  }

  _finish() {
    if (this.state === 'done' || this.finishing) return; this.finishing = true;
    const c = this.c;
    // the rest of the forest, out to the far trees, wakes softly together
    tweens.add(4, (k) => { c.wake.all = k * k * (3 - 2 * k); for (const L of c.lights) L.light.intensity = L.base * (0.45 + 0.55 * (this.progress + (1 - this.progress) * k)); }, { done: () => {
      c.sleep.groups.forEach((g, gi) => c.sleep.wakeGroup(gi, 2));
      for (const r of this.ribbons || []) { r.on = true; r.k = 1; r.m.uniforms.fade.value = 1; }
      this.state = 'done'; if (this.onDone) this.onDone();
    } });
    c.sound.setAmbience(1, 3);
  }

  update(dt) {
    if (!this.running) return;
    const c = this.c; this.t += dt;
    // nothing touched for a long while: the butterfly comes anyway (nobody waits in the dark)
    if (this.state === 'asleep' && this.t > 45) this.touched(null);
    // keep the butterfly on its errand: if anything else moved it, send it on again; and never wait forever
    if (this.state === 'fly' && this.hop) {
      const goal = this.hop.at.clone().add(new THREE.Vector3(0, 0.25, 0));
      if (c.guide.mode !== 'twirl' && (c.guide.mode !== 'hover' || c.guide.target.distanceTo(goal) > 0.05)) c.guide.goTo(goal, { speed: 2.4 });
      if (this.t > 14) c.guide.pos.lerp(goal, 0.2);
    }
    if (this.state === 'bell' && !this.rang && c.guide.mode !== 'tap' && c.guide.mode !== 'twirl' && this.bellAt) c.guide.tap(this.bellAt, this.bellTap);
    if (this.state === 'bell' && !this.rang && this.t > 20 && this.bellTap) this.bellTap();
    if (this.state === 'fly' && this.hop && c.guide.pos.distanceTo(this.hop.at.clone().add(new THREE.Vector3(0, 0.25, 0))) < 0.25) {
      // it lands on the cluster, and the light spreads out from there
      const h = this.hop; this.hop = null; this.state = 'land';
      c.guide.perch(h.at.clone().add(new THREE.Vector3(0, 0.12, 0)));
      this._wakeAt(h, 0.5);
      tweens.add(0.1, () => {}, { delay: 3.6, done: () => this._nextHop() });
    }
    // the mushroom clusters (and their fairy dust and ribbons) wake as the light reaches them
    c.sleep.groups.forEach((g, gi) => { if (!g.woken && c.wake.covers(g.centroid)) c.sleep.wakeGroup(gi, 3); });
    for (const r of this.ribbons || []) { if (!r.on && c.wake.covers(r.centre)) r.on = true; if (r.on && r.k < 1) { r.k = Math.min(1, r.k + dt / 3); r.m.uniforms.fade.value = r.k * r.k; } }
    if (this.state !== 'done' && !this.finishing) for (const L of c.lights) L.light.intensity = L.base * (0.45 + 0.55 * this.progress);
  }
}
