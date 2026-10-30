// Golden jelly glowdrops: they rise sleepily from a mushroom cluster, drift into reach,
// and wobble until squished. Any squish works: a grab, a pinch or a poke.
import * as THREE from 'three';
import { glowTexture, rand, clamp } from './util.js';

// Shaded like a small lit sphere of jelly: soft light from above, a glossy highlight,
// a darker underside and a bright core glowing through, so it reads as round from every angle.
const jellyVS = `
uniform float time, seed, squash; varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  vec3 p=position;
  p*=1.+sin(time*0.9+seed)*0.006;                       // barely-there breathing, no wobble
  p.y*=1.-squash*0.72; p.xz*=1.+squash*0.55;
  vP=position;
  vec4 mv=modelViewMatrix*vec4(p,1.); vV=normalize(-mv.xyz); vN=normalize(normalMatrix*normal);
  gl_Position=projectionMatrix*mv;
}`;
const jellyFS = `
uniform vec3 core, rim; uniform float glow, opacity, time, seed, pulse; uniform vec3 lightDir;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  vec3 n=normalize(vN), v=normalize(vV), l=normalize(lightDir);
  float ndv=max(dot(n,v),0.);
  float diff=dot(n,l)*0.5+0.5;                          // wrapped light: soft, no hard terminator
  float under=smoothstep(-0.2,-0.95,vP.y);              // underside falls into shadow
  float centre=pow(max(dot(n,normalize(v+l*0.6)),0.),4.); // glow through the jelly, offset toward the light
  vec3 h=normalize(l+v);
  float spec=pow(max(dot(n,h),0.),70.)*1.4;             // glossy jelly highlight
  float rimF=pow(1.-ndv,3.);
  vec3 body=mix(core*vec3(0.55,0.22,0.08),core*1.05,diff*diff)*(1.-under*0.5);
  float bounce=pow(1.-ndv,2.)*smoothstep(0.1,-0.9,vP.y)*0.5;   // light caught inside the lower edge, like jelly
  vec3 c=body*glow + vec3(1.,0.95,0.86)*centre*(0.2+1.0*pulse)*glow + rim*rimF*0.5*glow + core*bounce*glow + vec3(1.,0.97,0.9)*spec;
  gl_FragColor=vec4(c, 1.);
  #include <colorspace_fragment>
}`;
const LIGHT = new THREE.Vector3(-0.35, 0.85, 0.4).normalize(); // view space: upper left, slightly in front

// Hover spots in comfortable seated reach (three.js coords, player faces -Z).
const SLOTS = [new THREE.Vector3(-0.28, 1.0, -0.46), new THREE.Vector3(0.06, 0.92, -0.52), new THREE.Vector3(-0.08, 1.16, -0.42), new THREE.Vector3(0.28, 1.06, -0.4)];

export class Glowdrops {
  constructor(scene, sleep, sound, effects, rig) {
    this.scene = scene; this.sleep = sleep; this.sound = sound; this.effects = effects; this.rig = rig;
    this.drops = []; this.queue = []; this.active = false; this.cooldown = 0; this.maxLive = 1; this.squished = 0;
    this.geo = new THREE.SphereGeometry(1, 40, 28);
    this.onFirstSquish = null; this.onSquish = null;
  }

  start(order) { this.queue = order.slice(); this.active = true; this.cooldown = this.fast ? 0.3 : 1.5; }
  get waiting() { return this.drops.filter((d) => d.state === 'wait'); }

  _slotFree() {
    const used = new Set(this.drops.map((d) => d.slot));
    const free = SLOTS.map((s, i) => i).filter((i) => !used.has(i));
    return free.length ? free[Math.floor(Math.random() * free.length)] : -1;
  }

  spawn(gi) {
    const slot = this._slotFree(); if (slot < 0) { this.queue.unshift(gi); return; }
    const r = rand(0.032, 0.037) * (this.big ? 1.3 : 1); // about 7 cm across: a comfortable pinch
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, seed: { value: Math.random() * 10 }, squash: { value: 0 }, core: { value: new THREE.Color(1.0, 0.42, 0.03) }, rim: { value: new THREE.Color(1.0, 0.7, 0.25) }, glow: { value: 1.35 }, opacity: { value: 0.95 }, lightDir: { value: LIGHT }, pulse: { value: 0.5 } },
      vertexShader: jellyVS, fragmentShader: jellyFS, transparent: false,
    });
    const mesh = new THREE.Mesh(this.geo, mat); mesh.scale.setScalar(r * 0.3); mesh.renderOrder = 3;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb860, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(3.4); halo.material.opacity = 0.45; mesh.add(halo);
    const from = this.sleep.homeOf(gi);
    const to = SLOTS[slot].clone();
    const mid = from.clone().lerp(to, 0.45).add(new THREE.Vector3(rand(-1.5, 1.5), 2.2, rand(-1, 1)));
    mesh.position.copy(from); this.scene.add(mesh);
    const dist = from.distanceTo(to);
    this.drops.push({ mesh, mat, halo, r, gi, slot, from, mid, to, t: 0, dur: this.fast ? 3.5 : clamp(dist / 2.4, 5, 11), state: 'fly', wait: 0, phase: Math.random() * 6, squashT: 0 });
    this.sound.boop(from, 140); // a faint low note so a drop rising behind you can be heard
  }

  update(dt, time, input) {
    if (this.active && this.queue.length) {
      this.cooldown -= dt;
      const live = this.drops.filter((d) => d.state !== 'gone').length;
      if (this.cooldown <= 0 && live < this.maxLive) { this.spawn(this.queue.shift()); this.cooldown = this.fast ? 2 : rand(3, 5); }
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]; d.mat.uniforms.time.value = time;
      if (d.state === 'fly') {
        d.t += dt; const u = Math.min(1, d.t / d.dur), e = u * u * (3 - 2 * u);
        d.mesh.position.copy(d.from).multiplyScalar((1 - e) * (1 - e)).addScaledVector(d.mid, 2 * (1 - e) * e).addScaledVector(d.to, e * e);
        { const g = Math.min(1, u * 1.6); d.mesh.scale.setScalar(d.r * (0.3 + 0.7 * g * g * (3 - 2 * g))); }
        if (u >= 1) d.state = 'wait';
        if (u > 0.75) this._checkSquish(d, input);
      } else if (d.state === 'wait') {
        d.wait += dt;
        if (d.wait > 25 && !d.nudged) { d.nudged = true; d.to.lerp(new THREE.Vector3(0, 1.0, -0.32), 0.35); }
        const bob = Math.sin(time * 0.75 + d.phase) * 0.012, sway = Math.sin(time * 0.45 + d.phase) * 0.01;
        const goal = new THREE.Vector3(d.to.x + sway, d.to.y + bob, d.to.z);
        d.mesh.position.lerp(goal, 1 - Math.exp(-2.5 * dt));   // glides, never jumps
        d.mesh.scale.setScalar(d.r);
        // soft white heart breathing inside the gold; a little stronger until the first squish
        const amp = this.squished === 0 ? 1 : 0.75;
        const pl = Math.pow(0.5 + 0.5 * Math.sin(time * 1.6 + d.phase), 1.5);
        d.mat.uniforms.pulse.value = 0.15 + amp * 0.85 * pl;
        d.mat.uniforms.glow.value = 1.2 + 0.35 * amp * pl;
        d.halo.material.opacity = 0.3 + 0.35 * amp * pl;
        d.halo.scale.setScalar(3.4 * (1 + 0.25 * amp * pl));
        this._checkSquish(d, input);
      } else if (d.state === 'squish') {
        d.squashT += dt;
        const k = Math.min(1, d.squashT / 0.28);
        d.mat.uniforms.squash.value = Math.sin(k * Math.PI * 0.5);
        const shrink = 1 - Math.max(0, d.squashT - 0.2) / 0.25;
        d.mesh.scale.setScalar(d.r * Math.max(0.001, shrink));
        d.halo.material.opacity = 0.45 * (1 - k);
        if (d.squashT > 0.45) { this.scene.remove(d.mesh); d.state = 'gone'; this.drops.splice(i, 1); }
      }
    }
  }

  _checkSquish(d, input) {
    const c = d.mesh.position, r = d.mesh.scale.x;
    for (const h of input.hands) {
      if (!h.present) continue;
      const grab = h.countInside(c, r * 1.35 + 0.015) >= 3;
      const poke = h.index.distanceTo(c) < r * 0.75;
      const pinch = h.pinching && h.pinchPoint.distanceTo(c) < r * 1.6;
      if (grab || poke || pinch) { this.squish(d); return; }
    }
  }

  pick(ray) {
    let best = null, bd = 1e9;
    for (const d of this.drops) {
      if (d.state !== 'wait' && d.state !== 'fly') continue;
      const dist = ray.distanceToPoint(d.mesh.position);
      if (dist < d.mesh.scale.x * 2.2) { const along = d.mesh.position.distanceTo(ray.origin); if (along < bd) { bd = along; best = d; } }
    }
    return best ? { key: best, size: best.mesh.scale.x * 2, point: best.mesh.position.clone(), fire: () => this.squish(best) } : null;
  }

  squish(d) {
    if (d.state === 'squish' || d.state === 'gone') return;
    d.state = 'squish'; d.squashT = 0;
    const at = d.mesh.position.clone();
    this.sound.squish(at);
    this.squished++;
    const target = this.sleep.groups[d.gi].centroid.clone().add(new THREE.Vector3(0, 0.8, 0));
    this.effects.motes(at, target, () => this.sleep.putToSleep(d.gi));
    if (this.squished === 1) { this.maxLive = this.fast ? 1 : 2; if (this.onFirstSquish) this.onFirstSquish(); }
    if (this.onSquish) this.onSquish(d);
  }

  // quietly shrink away any balls still waiting (used when the demo moves on)
  dismiss() {
    this.queue.length = 0;
    for (const d of this.drops) if (d.state === 'wait' || d.state === 'fly') { d.state = 'squish'; d.squashT = 0.2; }
  }

  get done() { return this.active && !this.queue.length && !this.drops.length; }
}
