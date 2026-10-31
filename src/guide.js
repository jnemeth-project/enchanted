// The guide: a small ghostly butterfly made of soft light. It never talks; it shows.
// - tap(point): lands on something and dips onto it, as if booping it
// - clap(obj): hovers at a glowdrop and closes its wings around it, like hands squishing
// - perch(point) / rest(point): lands, slowly opening and closing its wings
import * as THREE from 'three';
import { glowTexture, damp } from './util.js';

const EYE = new THREE.Vector3(0, 0.82, 0);
const TRAIL = 48;

function wingTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  // Wing root is at the left middle; the forewing sweeps up-right, the hindwing rounds down-right.
  const fore = new Path2D();
  fore.moveTo(6, 122); fore.bezierCurveTo(50, 30, 160, 2, 238, 26); fore.bezierCurveTo(254, 58, 214, 108, 150, 120); fore.bezierCurveTo(96, 127, 44, 127, 6, 126);
  const hind = new Path2D();
  hind.moveTo(6, 131); hind.bezierCurveTo(72, 130, 158, 146, 188, 190); hind.bezierCurveTo(206, 224, 158, 252, 114, 238); hind.bezierCurveTo(62, 220, 22, 172, 6, 135);
  const both = new Path2D(); both.addPath(fore); both.addPath(hind);
  const grd = g.createRadialGradient(0, 128, 0, 0, 128, 250);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.3, 'rgba(225,218,255,0.6)');
  grd.addColorStop(0.75, 'rgba(176,240,226,0.3)'); grd.addColorStop(1, 'rgba(160,220,255,0.14)');
  g.fillStyle = grd; g.fill(both);
  g.save(); g.clip(both);
  g.strokeStyle = 'rgba(255,255,255,0.38)'; g.lineWidth = 1.6;
  for (let i = 0; i < 8; i++) {
    const a = -1.0 + i * 0.28;
    g.beginPath(); g.moveTo(6, 128);
    g.quadraticCurveTo(10 + 100 * Math.cos(a), 128 + 80 * Math.sin(a), 250 * Math.cos(a), 128 + 230 * Math.sin(a) * 0.8);
    g.stroke();
  }
  for (const [x, y, r] of [[196, 44, 13], [150, 196, 11], [222, 70, 7]]) { // soft glowing eye-spots
    const s = g.createRadialGradient(x, y, 0, x, y, r);
    s.addColorStop(0, 'rgba(255,255,255,0.8)'); s.addColorStop(1, 'rgba(200,240,255,0)');
    g.fillStyle = s; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.restore();
  g.save(); g.shadowColor = 'rgba(205,232,255,0.95)'; g.shadowBlur = 9; g.strokeStyle = 'rgba(238,246,255,0.8)'; g.lineWidth = 2.4; g.stroke(both); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Guide {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.body = new THREE.Group(); this.group.add(this.body);
    const wingMat = new THREE.MeshBasicMaterial({ map: wingTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.wingMat = wingMat;
    const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0.5, 0, 0); geo.rotateX(-Math.PI / 2);
    const SPAN = 0.062;
    this.wings = [1, -1].map((side) => {
      const pivot = new THREE.Group(); const m = new THREE.Mesh(geo, wingMat);
      m.scale.set(SPAN * side, 1, SPAN); m.renderOrder = 6; pivot.add(m); this.body.add(pivot);
      return { pivot, side };
    });
    const glow = new THREE.MeshBasicMaterial({ color: 0xf2f6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const thorax = new THREE.Mesh(new THREE.CapsuleGeometry(0.0032, 0.024, 4, 8), glow); thorax.rotation.x = Math.PI / 2; this.body.add(thorax);
    const ant = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.014), new THREE.Vector3(0.007, 0.01, -0.027), new THREE.Vector3(0, 0, -0.014), new THREE.Vector3(-0.007, 0.01, -0.027)]);
    this.body.add(new THREE.LineSegments(ant, new THREE.LineBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending })));
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xb7c9ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.halo.scale.setScalar(0.07); this.group.add(this.halo);
    this.bodyMat = glow;
    // shimmering trail of light dust
    const tg = new THREE.BufferGeometry();
    this.tp = new Float32Array(TRAIL * 3); this.tc = new Float32Array(TRAIL * 3); this.tage = new Float32Array(TRAIL).fill(9);
    tg.setAttribute('position', new THREE.BufferAttribute(this.tp, 3)); tg.setAttribute('color', new THREE.BufferAttribute(this.tc, 3));
    this.trail = new THREE.Points(tg, new THREE.PointsMaterial({ size: 0.012, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.trail.frustumCulled = false; this.trail.visible = false; scene.add(this.trail);
    this.ti = 0; this.emitT = 0;

    this.pos = new THREE.Vector3(0, 3, -8); this.prev = this.pos.clone(); this.vel = new THREE.Vector3();
    this.target = this.pos.clone(); this.follow = null; this.mode = 'hover'; this.orbit = 0; this.speed = 1.2;
    this.flapPh = 0; this.yaw = 0; this.level = 1; this.levelTarget = 1; this.cycle = 0; this.onTap = null; this.tapped = false;
    this.roll = 0; this.water = 0; this.rainLevel = 0; this.fx = null; this.snd = null; this.next = null;
    // the little pool of rain the butterfly gathers in its cupped wings
    this.bead = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x9fd2ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.bead.position.set(0, 0.014, 0); this.bead.visible = false; this.body.add(this.bead);
  }

  appear(from) { this.pos.copy(from); this.prev.copy(from); this.target.copy(from); this.group.visible = true; this.trail.visible = true; }
  goTo(p, { orbit = 0, speed = 1.2 } = {}) { this.follow = null; this.mode = 'hover'; this.target.copy(p); this.orbit = orbit; this.speed = speed; this.levelTarget = 1; }
  followObj(obj, offset, opts = {}) { this.follow = { obj, offset: offset.clone() }; this.mode = 'hover'; this.orbit = opts.orbit || 0; this.speed = opts.speed || 2; }
  tap(point, onTap) { this.follow = null; this.mode = 'tap'; this.target.copy(point); this.onTap = onTap; this.cycle = 0; this.speed = 1.6; this.orbit = 0; }
  clap(obj) { this.follow = { obj, offset: new THREE.Vector3(0, 0.05, 0) }; this.mode = 'clap'; this.cycle = 0; this.speed = 3; this.orbit = 0; }
  perch(point) { this.follow = null; this.mode = 'perch'; this.target.copy(point); this.speed = 1.0; this.orbit = 0; this.levelTarget = 1; }
  rest(point) { this.perch(point); this.mode = 'rest'; this.levelTarget = 0.3; }
  // a slow loop-the-loop: well done!
  twirl(after) { this.follow = null; this.mode = 'twirl'; this.cycle = 0; this.twirlFrom = this.pos.clone(); this.twirlYaw = this.yaw; this.after = after;
    if (this.fx) this.fx.sparkle(this.pos, 0xd8e6ff, 18, 0.06); }
  // hold the wings up like cupped hands until rain fills them, carry it to the stump, pour it in
  rainDemo(front, above, rim, onPoured) {
    this.follow = null; this.mode = 'cup'; this.cycle = 0; this.water = 0; this.target.copy(front); this.speed = 2.0;
    this.above = above.clone(); this.rim = rim.clone(); this.onPoured = onPoured;
  }
  // goodbye: fly in front of you, bow (dip forward with wings folded), then rise slowly up toward the moon
  farewell(front, sky, onGone) {
    this.follow = null; this.mode = 'bow'; this.cycle = -1; this.target.copy(front); this.speed = 1.0;
    this.sky = sky.clone(); this.onGone = onGone; this.levelTarget = 1;
  }
  // fly to the grown mushroom, hold it by its cap and carry it gently to a spot beside you
  carryMushroom(obj, top, dest, onPlaced) {
    this.follow = null; this.mode = 'fetch'; this.cycle = 0; this.speed = 1.6;
    this.liftObj = obj; this.liftOff = obj.position.clone().sub(top).add(new THREE.Vector3(0, -0.012, 0));
    this.target.copy(top).add(new THREE.Vector3(0, 0.012, 0)); this.liftDest = dest.clone(); this.onPlaced = onPlaced;
  }
  get clapTarget() { return this.mode === 'clap' && this.follow ? this.follow.obj : null; }

  update(dt, time) {
    if (!this.group.visible) { this._fadeTrail(dt); return; }
    const goal = this.follow ? this.follow.obj.getWorldPosition(new THREE.Vector3()).add(this.follow.offset) : this.target.clone();
    const near = this.pos.distanceTo(goal) < 0.08;
    this.cycle += dt;
    let open = 0, base = 0.3, amp = 0.5, freq = 0.55;
    if (this.mode === 'hover') {
      if (this.orbit) goal.add(new THREE.Vector3(Math.cos(time * 0.9) * this.orbit, Math.sin(time * 1.3) * 0.03, Math.sin(time * 0.9) * this.orbit));
      goal.y += Math.sin(time * 1.7) * 0.015;
    } else if (this.mode === 'tap') {
      // land just above the cap, then dip onto it every 1.6 s
      const u = (this.cycle % 3.2) / 3.2, dip = u < 0.32 ? Math.sin((u / 0.32) * Math.PI) : 0;
      goal.y += 0.065 - 0.05 * dip;
      if (near && u > 0.14 && u < 0.2 && !this.tapped) { this.tapped = true; if (this.onTap) this.onTap(); }
      if (u > 0.4) this.tapped = false;
      if (dip > 0) { base = 0.15; amp = 0.15; freq = 0.55; }
    } else if (this.mode === 'clap') {
      // close the wings around the drop: a slow squeeze-and-release you can copy with your hand
      const u = (this.cycle % 3.6) / 3.6;
      let a;
      if (u < 0.2) a = (u / 0.2); else if (u < 0.38) a = 1; else if (u < 0.6) a = 1 - (u - 0.38) / 0.22; else a = 0;
      a = a * a * (3 - 2 * a);
      open = a; goal.y -= 0.02 * a;
      base = 0.25 + 1.2 * a; amp = 0.2 * (1 - a); freq = 0.5;
    } else if (this.mode === 'twirl') {
      const T = 1.0, u = Math.min(1, this.cycle / T), e = u * u * (3 - 2 * u), th = e * Math.PI * 2, R = 0.06;
      const fwd = new THREE.Vector3(-Math.sin(this.twirlYaw), 0, -Math.cos(this.twirlYaw)), side = new THREE.Vector3(fwd.z, 0, -fwd.x);
      goal.copy(this.twirlFrom).addScaledVector(side, R * Math.sin(th)).addScaledVector(fwd, R * (1 - Math.cos(th))).add(new THREE.Vector3(0, 0.05 * Math.sin(th / 2), 0));
      this.speed = 18; base = 0.35; amp = 0.5; freq = 1.0;
      if (u >= 1) { this.speed = 1.2; this.mode = 'hover'; this.target.copy(this.pos); const a = this.after; this.after = null; if (a) a(); }
    } else if (this.mode === 'cup') {
      base = 1.05; amp = 0.02; freq = 0.25; open = 0.6;
      goal.y += Math.sin(time * 1.1) * 0.003;
      if (this.pos.distanceTo(goal) < 0.12) this.water = Math.min(1, this.water + dt * (this.fillRate || 0.45) * Math.max(this.rainLevel, 0.75));
      if (this.water >= 1) { this.mode = 'carry'; this.target.copy(this.above); this.speed = 1.6; }
    } else if (this.mode === 'carry') {
      base = 1.0; amp = 0.04; freq = 0.35; open = 0.6;
      if (this.pos.distanceTo(this.above) < 0.07) { this.mode = 'pour'; this.cycle = 0; this.emitW = 0; }
    } else if (this.mode === 'pour') {
      base = 0.8; amp = 0.04; freq = 0.25; open = 0.6;
      this.roll = this.cycle < 1.7 ? 0.95 : 0;
      if (this.cycle > 0.2 && this.cycle < 1.5) {
        this.water = Math.max(0, 1 - (this.cycle - 0.2) / 1.3);
        this.emitW -= dt;
        if (this.emitW <= 0 && this.fx) { this.emitW = 0.07; this.fx.water(this.bead.getWorldPosition(new THREE.Vector3()), new THREE.Vector3()); }
        if (!this.stopTrickle && this.snd) this.stopTrickle = this.snd.trickle(this.above);
      }
      if (this.cycle >= 1.5 && this.stopTrickle) { this.stopTrickle(); this.stopTrickle = null; this.water = 0; if (this.onPoured) this.onPoured(); }
      if (this.cycle > 2.0) this.perch(this.rim);
    } else if (this.mode === 'bow') {
      if (this.cycle < 0 && !near) this.cycle = -1; // keep waiting until it has arrived in front of you
      const u = Math.max(0, this.cycle) / 2.6, a = u < 0.35 ? u / 0.35 : u < 0.6 ? 1 : Math.max(0, 1 - (u - 0.6) / 0.4);
      const e = a * a * (3 - 2 * a);
      this.bowAmt = e; goal.y -= 0.03 * e;
      base = 0.3 + 1.05 * e; amp = 0.3 * (1 - e); freq = 0.45;
      if (u >= 1) { this.mode = 'leave'; this.cycle = 0; this.leaveV = 0.05; this.leaveFrom = this.pos.distanceTo(this.sky); }
    } else if (this.mode === 'leave') {
      base = 0.3; amp = 0.6; freq = 0.7;
      this.leaveV = Math.min(1.5, this.leaveV + dt * 0.3);
      const to = this.sky.clone().sub(this.pos), dist = to.length();
      goal.copy(this.pos).addScaledVector(to.normalize(), Math.min(dist, this.leaveV * dt));
      this.speed = 60;
      this.levelTarget = Math.max(0, 1 - (this.leaveFrom - dist) / 9); // gone after rising about 9 m, like a star going out
      if (dist < 0.3 || this.level < 0.03) { this.group.visible = false; this.mode = 'gone'; if (this.onGone) this.onGone(); }
    } else if (this.mode === 'fetch') {
      base = 0.5; amp = 0.25; freq = 0.6;
      if (this.pos.distanceTo(this.target) < 0.03) { this.mode = 'lift'; this.cycle = 0; this.speed = 0.9;
        this.target.copy(this.liftDest).sub(this.liftOff).add(new THREE.Vector3(0, 0.0, 0)); this.liftUp = 0; }
    } else if (this.mode === 'lift') {
      // rise a little first, then float over and lower it gently
      base = 0.35; amp = 0.55; freq = 0.8;
      const u = Math.min(1, this.cycle / 2.6);
      goal.y += Math.sin(u * Math.PI) * 0.12;
      this.liftObj.position.copy(this.pos).add(this.liftOff);
      if (u >= 1 && this.pos.distanceTo(this.target) < 0.03) {
        this.mode = 'hover'; this.target.copy(this.pos).add(new THREE.Vector3(0, 0.12, 0)); this.speed = 1.2;
        const done = this.onPlaced; this.onPlaced = null; if (done) done();
      }
    } else if (this.mode === 'perch' || this.mode === 'rest') {
      base = this.mode === 'rest' ? 1.25 : 0.85; amp = this.mode === 'rest' ? 0.12 : 0.45; freq = this.mode === 'rest' ? 0.08 : 0.2;
    }
    // position
    this.prev.copy(this.pos);
    this.pos.x = damp(this.pos.x, goal.x, this.speed, dt); this.pos.y = damp(this.pos.y, goal.y, this.speed, dt); this.pos.z = damp(this.pos.z, goal.z, this.speed, dt);
    this.vel.subVectors(this.pos, this.prev).divideScalar(Math.max(dt, 1e-3));
    const sp = this.vel.length();
    if (sp > 0.35 && (this.mode === 'hover' || this.mode === 'tap' || this.mode === 'perch' || this.mode === 'fetch')) { base = 0.25; amp = 0.75; freq = 1.1; } // flying: slow, wide, floating strokes
    this.freq = damp(this.freq ?? freq, freq, 2, dt);
    this.flapPh += dt * this.freq * Math.PI * 2;
    const ang = Math.max(-0.45, Math.min(1.5, base + amp * Math.sin(this.flapPh)));
    this.wings[0].pivot.rotation.z = ang; this.wings[1].pivot.rotation.z = -ang;
    // heading: along the flight path when moving, toward you when hovering or perched
    const look = sp > 0.12 ? this.vel : EYE.clone().sub(this.pos);
    let want = Math.atan2(-look.x, -look.z);
    const resting = (this.mode === 'perch' || this.mode === 'rest') && sp < 0.12;
    if (resting) want += Math.PI / 2; // side-on when resting, so its raised wings show their full shape
    let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-4 * dt));
    this.group.position.copy(this.pos).add(new THREE.Vector3(0, Math.sin(this.flapPh) * 0.006 * (1 - open), 0));
    this.group.rotation.set(0, this.yaw, 0);
    // when it hovers and looks at you it tilts back, showing you the faces of its wings
    const holding = this.mode === 'cup' || this.mode === 'carry' || this.mode === 'pour';
    const pitch = this.mode === 'bow' ? 0.95 - 1.35 * (this.bowAmt || 0) : this.mode === 'leave' ? 0.35 : holding ? 0.12 : sp > 0.12 ? 0.3 : resting ? 0.15 : this.mode === 'tap' ? 0.55 : 0.95;
    this.body.rotation.x = damp(this.body.rotation.x, pitch, 4, dt);
    if (this.mode !== 'pour') this.roll = 0;
    this.body.rotation.z = damp(this.body.rotation.z, this.roll, 5, dt);
    this.bead.visible = this.water > 0.02;
    this.bead.scale.setScalar(0.004 + 0.009 * this.water);
    // brightness
    this.level = damp(this.level, this.levelTarget, 0.8, dt);
    const shimmer = 0.85 + 0.15 * Math.sin(time * 2.3);
    this.wingMat.opacity = this.level * shimmer;
    this.bodyMat.opacity = 0.9 * this.level;
    this.halo.material.opacity = (0.14 + 0.12 * open) * this.level;
    // trail
    this.emitT -= dt;
    if (this.emitT <= 0 && this.mode !== 'rest') {
      this.emitT = this.mode === 'leave' ? 0.02 : sp > 0.12 ? 0.035 : 0.12;
      const i = this.ti++ % TRAIL; this.tage[i] = 0;
      this.tp[i * 3] = this.pos.x + (Math.random() - 0.5) * 0.02; this.tp[i * 3 + 1] = this.pos.y + (Math.random() - 0.5) * 0.02; this.tp[i * 3 + 2] = this.pos.z + (Math.random() - 0.5) * 0.02;
    }
    for (let i = 0; i < TRAIL; i++) {
      this.tage[i] += dt; const k = Math.max(0, 1 - this.tage[i] / (this.mode === 'leave' ? 2.2 : 1.4)) * Math.max(this.level, 0.5);
      this.tp[i * 3 + 1] -= dt * 0.03;
      this.tc[i * 3] = 0.78 * k; this.tc[i * 3 + 1] = 0.86 * k; this.tc[i * 3 + 2] = 1.0 * k;
    }
    this.trail.geometry.attributes.position.needsUpdate = true; this.trail.geometry.attributes.color.needsUpdate = true;
  }

  _fadeTrail(dt) { // the last of the light trail drifts and fades after the butterfly has gone
    let any = false;
    for (let i = 0; i < TRAIL; i++) {
      this.tage[i] += dt; const k = Math.max(0, 1 - this.tage[i] / 2.2) * 0.5; if (k > 0) any = true;
      this.tp[i * 3 + 1] -= dt * 0.03; this.tc[i * 3] = 0.78 * k; this.tc[i * 3 + 1] = 0.86 * k; this.tc[i * 3 + 2] = k;
    }
    this.trail.geometry.attributes.position.needsUpdate = true; this.trail.geometry.attributes.color.needsUpdate = true;
    if (!any) this.trail.visible = false;
  }
}
