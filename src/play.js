// Little things to play with, just for the joy of it:
//   Twirls  - sweep or circle your hand through the fairy dust around a mushroom and it spins with you,
//             faster the quicker you go, in the direction you move, then slowly settles back.
//   Pebbles - a few smooth pebbles lie on the ground in front of you. Pinch one to pick it up and
//             let go mid-swing to throw it. It bounces, rolls to a stop, and a moment later sparkles
//             back home so you can throw it again. (On screen: click a pebble to toss it.)
import * as THREE from 'three';
import { glowTexture } from './util.js';

const G = 9.8;
const tmp = new THREE.Vector3();

export class Twirls {
  constructor(W, sound, effects) {
    this.sound = sound; this.effects = effects; this.chimeT = 0;
    this.items = [...W.dust, ...W.ribbons].map((o) => {
      const c = o.getWorldPosition(new THREE.Vector3()), s = o.getWorldScale(new THREE.Vector3());
      o.userData.spin = 0;
      return { o, c, r: 0.72 * s.x, h: 1.5 * s.z, inHand: [false, false], cool: 0 };
    });
    this.prev = [null, null];
  }

  update(dt, input) {
    this.chimeT = Math.max(0, this.chimeT - dt);
    for (const it of this.items) if (it.cool > 0) it.cool -= dt;
    input.hands.forEach((h, i) => {
      if (!h.present) { this.prev[i] = null; return; }
      const p = h.index.clone(), last = this.prev[i]; this.prev[i] = p;
      if (!last || dt <= 0) return;
      const v = p.clone().sub(last).divideScalar(dt);
      const speed = v.length();
      if (speed < 0.15) return;
      for (const it of this.items) {
        tmp.subVectors(p, it.c);
        const d2 = tmp.x * tmp.x + tmp.z * tmp.z;
        const inside = d2 <= it.r * it.r * 1.3 && tmp.y >= -0.1 && tmp.y <= it.h;
        // reaching into the fairy dust: a burst of sparkles and a bright little chime
        if (inside && !it.inHand[i] && (!it.cool || it.cool <= 0)) {
          it.cool = 0.6; it.o.userData.spin += (Math.random() < 0.5 ? -1 : 1) * 3;
          if (this.effects) this.effects.sparkle(p.clone(), 0xc8fff0, 30, 0.12);
        }
        it.inHand[i] = inside;
        if (!inside) continue;
        // how fast you are circling round the middle (radians a second), in the direction you move
        const w = (tmp.z * v.x - tmp.x * v.z) / (d2 + 0.02);
        it.o.userData.spin += THREE.MathUtils.clamp(w, -14, 14) * Math.min(1, dt * 5);
        if (this.chimeT <= 0 && speed > 0.5) { this.chimeT = 0.35; if (this.effects) this.effects.sparkle(p, 0xd9f6ff, 10, 0.08); }
      }
    });
    for (const it of this.items) {
      const ud = it.o.userData;
      ud.spin = THREE.MathUtils.clamp(ud.spin, -10, 10) * Math.exp(-dt * 0.7);
      it.o.rotation.y += ud.spin * dt;
    }
  }
}

export class Pebbles {
  constructor(W, sound, effects) {
    this.sound = sound; this.effects = effects; this.grounds = W.grounds;
    this.list = W.pebbles.map((o) => ({ o, home: o.position.clone(), homeQ: o.quaternion.clone(), homeS: o.scale.clone(), state: 'rest', v: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0, hand: null, trail: [] }));
    this.ray = new THREE.Raycaster();
  }

  _groundY(p) {
    this.ray.set(tmp.set(p.x, p.y + 1.5, p.z), new THREE.Vector3(0, -1, 0)); this.ray.far = 4;
    const h = this.ray.intersectObjects(this.grounds, true)[0];
    return h ? h.point.y : 0;
  }

  _throw(pb, v) {
    pb.state = 'fly'; pb.t = 0; pb.v.copy(v); pb.hand = null; pb.skips = 0; pb.told = false;
    pb.spin.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
    this.sound.whoosh(pb.o.position.clone());
  }

  // on screen (or pointing): click a pebble and it is tossed gently ahead
  pick(ray) {
    for (const pb of this.list) {
      if (pb.state !== 'rest') continue;
      if (ray.distanceToPoint(pb.o.position) < 0.07) return { key: pb, size: 0.06, handsOnly: true, point: pb.o.position.clone(), fire: () => {
        const dir = ray.direction.clone(); dir.y = 0; dir.normalize();
        this._throw(pb, dir.multiplyScalar(3.2).add(new THREE.Vector3(0, 3, 0)));
      } };
    }
    return null;
  }

  update(dt, input) {
    // pick up: pinch near a resting pebble, or point at one and pinch: it flies up into your hand
    input.hands.forEach((h, i) => {
      if (!h.present) return;
      if (h.pinching && !h._pebbleWas && !h._holding) {
        // only a deliberate pinch right on the pebble picks it up (no grabbing from a distance)
        let best = null, bd = 0.045;
        for (const pb of this.list) { if (pb.state !== 'rest') continue; const d = pb.o.position.distanceTo(h.pinchPoint); if (d < bd) { bd = d; best = pb; } }
        if (best) { best.state = 'held'; best.hand = h; best.trail = []; best.from = best.o.position.clone(); h._holding = best; this.sound.boop(best.o.position.clone(), 180); }
      }
      h._pebbleWas = h.pinching;
    });
    for (const pb of this.list) {
      const o = pb.o;
      pb.t += dt;
      if (pb.state === 'held') {
        const h = pb.hand;
        if (!h.present) { pb.state = 'land'; pb.t = 0; pb.hand = null; h._holding = null; continue; }
        if (pb.fetch !== undefined && pb.fetch < 1) { pb.fetch = Math.min(1, pb.fetch + dt / 0.25); o.position.copy(pb.from).lerp(h.pinchPoint, pb.fetch * pb.fetch); }
        else { pb.fetch = undefined; o.position.copy(h.pinchPoint); }
        pb.trail.push({ p: h.pinchPoint.clone(), dt }); if (pb.trail.length > 6) pb.trail.shift();
        if (!h.pinching) {
          h._holding = null; pb.fetch = undefined;
          // let go: it flies off with your hand's speed (a little extra, for fun)
          const a = pb.trail[0], b = pb.trail[pb.trail.length - 1], time = pb.trail.slice(1).reduce((s, x) => s + x.dt, 0) || dt;
          const v = b.p.clone().sub(a.p).divideScalar(time).multiplyScalar(3.6); // a good throw really flies
          if (v.length() < 0.6) { pb.state = 'fly'; pb.v.set(0, 0, 0); pb.t = 0; pb.hand = null; } // just dropped
          else this._throw(pb, v);
        }
      } else if (pb.state === 'fly') {
        pb.v.y -= G * dt;
        o.position.addScaledVector(pb.v, dt);
        if (this.field) this.field.collide(o.position, pb.v, 0.05, pb);
        o.rotation.x += pb.spin.x * dt; o.rotation.y += pb.spin.y * dt; o.rotation.z += pb.spin.z * dt;
        // the pond: a flat, fast throw skips off the water; anything else drops in with a plop
        const P = this.pond;
        if (P && P.inside(o.position) && o.position.y <= P.y + 0.012 && pb.v.y < 0) {
          const hs = Math.hypot(pb.v.x, pb.v.z), vy = -pb.v.y;
          o.position.y = P.y + 0.012;
          if (hs > (pb.skips ? 1.5 : 3) && vy < hs * 1.1 && pb.skips < 6) {
            pb.skips++; pb.v.y = Math.min(0.7, Math.max(0.4, vy * 0.25)); pb.v.x *= 0.7; pb.v.z *= 0.7;
            P.ripple(o.position, 0.6); this.sound.plip(o.position.clone());
            if (this.effects) this.effects.sparkle(o.position.clone(), 0xa8ffe4, 6, 0.05);
          } else {
            P.ripple(o.position, 1); this.sound.plop(o.position.clone(), vy / 5);
            if (this.effects) this.effects.sparkle(o.position.clone(), 0xa8ffe4, 14, 0.09);
            pb.state = 'sink'; pb.t = 0; pb.v.set(0, 0, 0);
          }
          continue;
        }
        const gy = this._groundY(o.position) + 0.015;
        if (o.position.y <= gy) {
          o.position.y = gy;
          const impact = -pb.v.y;
          if (impact > 1.2) {
            this.sound.thump(o.position.clone(), impact / 4);
            if (this.effects) this.effects.sparkle(o.position.clone(), 0xcfe4ff, 8, 0.06);
            pb.v.y = impact * 0.32; pb.v.x *= 0.55; pb.v.z *= 0.55; pb.spin.multiplyScalar(0.5);
          } else { if (impact > 0.3) this.sound.thump(o.position.clone(), 0.25); pb.state = 'land'; pb.t = 0; pb.v.set(0, 0, 0); }
        }
        if (pb.t > 12 || o.position.length() > 70) { pb.state = 'land'; pb.t = 0; }
      }
      // once it has come to rest, a really good skip gets its applause
      if (pb.state !== 'fly' && pb.skips >= 3 && !pb.told) { pb.told = true; if (this.onSkips) this.onSkips(pb.skips); }
      if (pb.state === 'fly' || pb.state === 'held') {
      } else if (pb.state === 'sink') {
        // it slips softly under the water, then comes home to its shelf
        o.position.y -= dt * 0.12; o.scale.copy(pb.homeS).multiplyScalar(Math.max(0.001, 1 - pb.t / 1.2));
        if (pb.t > 1.2) { pb.state = 'home'; pb.t = 0.4; pb.moved = false; }
      } else if (pb.state === 'land') {
        // after a moment, it sparkles away and reappears back where it was
        if (pb.t > 3.5) { if (this.effects) this.effects.sparkle(o.position.clone(), 0xd9f6ff, 16, 0.1); pb.state = 'home'; pb.t = 0; }
      } else if (pb.state === 'home') {
        const k = Math.min(1, pb.t / 0.8);
        if (k < 0.5) o.scale.copy(pb.homeS).multiplyScalar(1 - k * 2);
        else {
          if (!pb.moved) { o.position.copy(pb.home); o.quaternion.copy(pb.homeQ); pb.moved = true; if (this.effects) this.effects.sparkle(pb.home.clone(), 0xd9f6ff, 12, 0.08); }
          o.scale.copy(pb.homeS).multiplyScalar((k - 0.5) * 2);
        }
        if (k >= 1) { pb.state = 'rest'; pb.moved = false; o.scale.copy(pb.homeS); }
      }
    }
  }
}


// The crystals beside you: touch one and it lights up with a magical shimmer, then slowly settles.
export class Crystals {
  constructor(W, sound, effects) {
    this.sound = sound; this.effects = effects;
    const notes = [523.25, 587.33, 659.25, 783.99, 880];
    this.list = W.crystals.map((o, i) => {
      const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      const mats = [];
      o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); mats.push(m.material); m.material.userData.e0 = m.material.emissiveIntensity ?? 1; m.material.userData.c0 = m.material.emissive ? m.material.emissive.clone() : null; } });
      return { o, c, r: Math.max(size.x, size.z) * 0.6 + 0.03, mats, glow: 0, inHand: [false, false], hz: notes[i % notes.length] };
    });
  }

  light(cr) {
    if (cr.glow > 0.6) return;
    cr.glow = 1;
    this.sound.chime(cr.c, cr.hz);
    if (this.effects) this.effects.sparkle(cr.c.clone().add(new THREE.Vector3(0, 0.06, 0)), 0xffd6f4, 26, 0.12);
  }

  pick(ray) {
    for (const cr of this.list) if (ray.distanceToPoint(cr.c) < cr.r) return { key: cr, size: cr.r, handsOnly: true, point: cr.c.clone(), fire: () => this.light(cr) };
    return null;
  }

  update(dt, input) {
    for (const cr of this.list) {
      input.hands.forEach((h, i) => {
        if (!h.present) { cr.inHand[i] = false; return; }
        let inside = false; for (let k = 0; k < 5 && !inside; k++) if (h.tips[k].distanceTo(cr.c) < cr.r) inside = true;
        if (inside && !cr.inHand[i]) this.light(cr);
        cr.inHand[i] = inside;
      });
      if (cr.glow > 0) {
        cr.glow = Math.max(0, cr.glow - dt / 3.5); // lit for a few seconds, then settles
        const k = Math.sin(Math.min(1, cr.glow * 1.2) * Math.PI / 2);
        for (const m of cr.mats) { m.emissiveIntensity = m.userData.e0 * (1 + 5 * k); if (m.userData.c0) m.emissive.copy(m.userData.c0).lerp(new THREE.Color(1, 0.85, 1), 0.35 * k); }
      }
    }
  }
}

// The magic mushroom pot: a little star twinkles above it. Look at it (or touch it, or point and pinch)
// and a few words explain what the pot is for, so nobody has to have seen the tutorial.
export class PotHint {
  constructor(scene, seed, tex) {
    this.seed = seed; this.t = 0; this.look = 0; this.seen = false; this.cool = 0; this.onShow = null; this.visibleWhen = () => true;
    this.at = seed.target.clone().add(new THREE.Vector3(0, 0.3, 0));
    this.star = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffc95a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.star.position.copy(this.at); this.core.position.copy(this.at); this.star.renderOrder = this.core.renderOrder = 22;
    scene.add(this.star, this.core);
  }

  _hits(ray) { return ray.distanceToPoint(this.at) < 0.09 || ray.distanceToPoint(this.seed.target) < 0.16; }

  pick(ray) { return this.visibleWhen() && this._hits(ray) ? { key: 'potHint', size: 0.12, point: this.at.clone(), fire: () => this.show() } : null; }

  show() { if (this.cool > 0) return; this.cool = 12; this.seen = true; this.look = 0; if (this.onShow) this.onShow(); }

  update(dt, time, input, eyeRay) {
    this.cool = Math.max(0, this.cool - dt);
    const on = this.visibleWhen();
    const a = on ? (this.seen ? 0.45 : 1) : 0;
    this.t += ((a) - this.t) * Math.min(1, dt * 2);
    // holding your gaze on it for a moment opens the explanation
    const ray = eyeRay && eyeRay();
    if (on && ray && this._hits(ray) && this.cool <= 0) { this.look += dt; if (this.look > 1.6) this.show(); } else this.look = Math.max(0, this.look - dt * 2);
    if (on) input.hands.forEach((h) => { if (h.present && (h.index.distanceTo(this.at) < 0.06)) this.show(); });
    const pulse = 0.75 + 0.25 * Math.sin(time * 2.2), grow = 1 + 0.8 * Math.min(1, this.look / 1.6);
    this.star.material.opacity = 0.75 * this.t * pulse; this.core.material.opacity = 0.95 * this.t;
    this.star.scale.setScalar(0.14 * grow * (0.9 + 0.2 * pulse)); this.core.scale.setScalar(0.035 * grow);
    this.star.position.y = this.core.position.y = this.at.y + Math.sin(time * 1.3) * 0.012;
    this.star.visible = this.core.visible = this.t > 0.01;
  }
}

// Draw in the soft dirt in front of you with a fingertip; sweep your hand low and fast across it to wipe it clean.
export class DirtDrawing {
  constructor(scene, W, sound, effects) {
    this.sound = sound; this.effects = effects;
    this.w = 1.2; this.d = 0.8; this.centre = new THREE.Vector3(0, 0, -0.62); // reachable with a fingertip near you, and further out with the drawing stick
    this.tools = []; this.toolLast = new Map(); // other things that draw: the drawing stick's tip
    // the drawing surface hugs the ground: a fine grid whose every point sits just on the path
    const ground = [W.byName.Ground].filter(Boolean), ray = new THREE.Raycaster();
    const NX = 32, NZ = 22, geo = new THREE.PlaneGeometry(this.w, this.d, NX, NZ); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position; this.NX = NX; this.NZ = NZ; this.hgt = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + this.centre.x, z = pos.getZ(i) + this.centre.z;
      ray.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0)); const h = ray.intersectObjects(ground.length ? ground : W.grounds, true)[0];
      const y = (h ? h.point.y : 0) + 0.007; pos.setY(i, y); this.hgt[i] = y;
    }
    pos.needsUpdate = true; geo.computeVertexNormals();
    this.canvas = document.createElement('canvas'); this.canvas.width = 900; this.canvas.height = 600;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false }));
    this.mesh.position.set(this.centre.x, 0, this.centre.z); this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.last = [null, null]; this.prevPalm = [null, null]; this.prevHit = [null, null]; this.scratchT = 0; this.wipe = 0; this.inked = false;
    this.rc = new THREE.Raycaster();
    // a little glowing dot shows where a pointing hand would draw
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.008, 12), new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    this.dot.rotation.x = -Math.PI / 2; this.dot.visible = false; this.dot.renderOrder = 3; scene.add(this.dot);
  }

  _groundAt(p) {
    const fx = ((p.x - this.centre.x) / this.w + 0.5) * this.NX, fz = ((p.z - this.centre.z) / this.d + 0.5) * this.NZ;
    const ix = Math.max(0, Math.min(this.NX, Math.round(fx))), iz = Math.max(0, Math.min(this.NZ, Math.round(fz)));
    return this.hgt[iz * (this.NX + 1) + ix];
  }

  _uv(p) { return [((p.x - this.centre.x) / this.w + 0.5) * this.canvas.width, ((p.z - this.centre.z) / this.d + 0.5) * this.canvas.height]; }

  _line(u0, v0, u, v, at) {
    const g = this.g; g.lineCap = 'round'; g.lineJoin = 'round';
    // a groove pressed into the earth: a soft lighter rim of pushed-up soil, a darker brown furrow in the middle
    // (each layer is tucked under what is already there, so a line stays one smooth groove with no rings)
    const seg = (c, w) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(u0, v0); g.lineTo(u, v); g.stroke(); };
    // a glowing furrow (warm light running along the bottom of the groove), so lines show clearly at night
    seg('rgb(255, 214, 140)', 4);
    g.globalCompositeOperation = 'destination-over'; seg('rgb(176, 112, 52)', 9); seg('rgb(40, 24, 12)', 16); seg('rgb(132, 98, 64)', 24);
    g.globalCompositeOperation = 'source-over';
    this.tex.needsUpdate = true; this.inked = true;
    if (this.scratchT <= 0 && Math.hypot(u - u0, v - v0) > 2) { this.scratchT = 0.25; this.sound.rustle(at.clone(), 0.12); }
  }

  update(dt, input) {
    if (this.enabled === false) return; // (not while the sleepy mushrooms stand on the dirt)
    this.scratchT = Math.max(0, this.scratchT - dt);
    const dot = null;
    // (no drawing by pointing from a distance: pinching to pick something up must never scribble in the dirt)
    this.dot.visible = !!dot; if (dot) this.dot.position.copy(dot).add(new THREE.Vector3(0, 0.003, 0));
    input.hands.forEach((h, i) => {
      if (!h.present) { this.last[i] = null; this.prevPalm[i] = null; return; }
      const tip = h.index, inside = Math.abs(tip.x - this.centre.x) < this.w / 2 && Math.abs(tip.z - this.centre.z) < this.d / 2;
      if (inside && tip.y < this._groundAt(tip) + 0.06) {
        const [u, v] = this._uv(tip), g = this.g;
        // a groove in the dirt, with a faint magical glow running along its bottom
        if (this.last[i]) this._line(this.last[i][0], this.last[i][1], u, v, tip);
        this.last[i] = [u, v];
      } else this.last[i] = null;
      // a swoosh: the whole hand sweeping fast and low over the dirt wipes it smooth
      const palm = h.palm.clone(), pp = this.prevPalm[i]; this.prevPalm[i] = palm;
      if (pp && this.inked && dt > 0) {
        const v = Math.hypot(palm.x - pp.x, palm.z - pp.z) / dt;
        const over = Math.abs(palm.x - this.centre.x) < this.w / 2 + 0.1 && Math.abs(palm.z - this.centre.z) < this.d / 2 + 0.1 && palm.y < this._groundAt(palm) + 0.12;
        if (over && v > 1.1 && this.wipe <= 0) { this.wipe = 1; this.sound.whoosh(palm); if (this.effects) this.effects.sparkle(palm, 0xd9f6ff, 18, 0.15); }
      }
    });
    // the drawing stick: its tip scratches a line wherever it touches the dirt
    for (const tool of this.tools) {
      const tip = tool(); const key = tool;
      const inside = tip && Math.abs(tip.x - this.centre.x) < this.w / 2 && Math.abs(tip.z - this.centre.z) < this.d / 2;
      if (inside && tip.y < this._groundAt(tip) + 0.05) {
        const [u, v] = this._uv(tip), last = this.toolLast.get(key);
        if (last) this._line(last[0], last[1], u, v, tip);
        this.toolLast.set(key, [u, v]);
      } else this.toolLast.delete(key);
    }
    if (this.wipe > 0) {
      this.wipe -= dt / 0.6;
      const g = this.g; g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, this.canvas.width, this.canvas.height); g.restore();
      this.tex.needsUpdate = true;
      if (this.wipe <= 0) { this.g.clearRect(0, 0, this.canvas.width, this.canvas.height); this.tex.needsUpdate = true; this.inked = false; this.wipe = 0; }
    }
  }
}


export class MushroomThrow {
  constructor(touch, W, sound, effects) {
    this.touch = touch; this.sound = sound; this.effects = effects; this.grounds = W.grounds; this.ray = new THREE.Raycaster();
    this.list = touch.items.filter((it) => it.kind === 'boop').map((it) => ({ it, o: it.o, home: it.o.position.clone(), homeQ: it.o.quaternion.clone(), state: 'rest', v: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0, hand: null, trail: [] }));
  }

  _groundY(p) {
    this.ray.set(new THREE.Vector3(p.x, p.y + 1.5, p.z), new THREE.Vector3(0, -1, 0)); this.ray.far = 4;
    const h = this.ray.intersectObjects(this.grounds, true)[0]; return h ? h.point.y : 0;
  }

  update(dt, input) {
    input.hands.forEach((h, i) => {
      if (!h.present) return;
      if (h.pinching && !h._mushWas && !h._holding) {
        let best = null, bd = Infinity;
        // only a deliberate pinch on the cap itself picks a mushroom up (no grabbing from a distance)
        for (const m of this.list) { if (m.state !== 'rest') continue; const d = m.it.center.distanceTo(h.pinchPoint); if (d < m.it.radius * 0.6 && d < bd) { bd = d; best = m; } }
        if (best) {
          best.state = 'held'; best.hand = h; best.trail = []; best.fetch = 0; best.from = best.o.position.clone();
          best.off = best.o.position.clone().sub(best.it.center); // hold it by its cap
          best.it.away = true; h._holding = best; this.sound.boop(best.it.center, best.it.hz);
        }
      }
      h._mushWas = h.pinching;
    });
    for (const m of this.list) {
      const o = m.o; m.t += dt;
      if (m.state === 'held') {
        const h = m.hand;
        if (!h.present) { h._holding = null; m.state = 'land'; m.t = 0; continue; }
        const want = h.pinchPoint.clone().add(m.off);
        if (m.fetch < 1) { m.fetch = Math.min(1, m.fetch + dt / 0.25); o.position.copy(m.from).lerp(want, m.fetch * m.fetch); } else o.position.copy(want);
        m.trail.push({ p: h.pinchPoint.clone(), dt }); if (m.trail.length > 6) m.trail.shift();
        if (!h.pinching) {
          h._holding = null;
          const a = m.trail[0], b = m.trail[m.trail.length - 1], time = m.trail.slice(1).reduce((s, x) => s + x.dt, 0) || dt;
          m.v.copy(b.p).sub(a.p).divideScalar(time).multiplyScalar(3.2);
          m.spin.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
          m.state = 'fly'; m.t = 0; if (m.v.length() > 0.6) this.sound.whoosh(o.position.clone());
        }
      } else if (m.state === 'fly') {
        m.v.y -= G * dt; o.position.addScaledVector(m.v, dt);
        if (this.field) this.field.collide(o.position, m.v, 0.08, m);
        o.rotation.x += m.spin.x * dt; o.rotation.z += m.spin.z * dt;
        const gy = this._groundY(o.position);
        if (o.position.y <= gy) {
          o.position.y = gy;
          if (-m.v.y > 1.2) { this.sound.boop(o.position.clone(), m.it.hz * 0.7); m.v.y = -m.v.y * 0.3; m.v.x *= 0.5; m.v.z *= 0.5; m.spin.multiplyScalar(0.4); }
          else { m.state = 'land'; m.t = 0; m.v.set(0, 0, 0); }
        }
        if (m.t > 10) { m.state = 'land'; m.t = 0; }
      } else if (m.state === 'land') {
        if (m.t > 3) { if (this.effects) this.effects.sparkle(o.position.clone(), 0xd9f6ff, 18, 0.12); m.state = 'home'; m.t = 0; m.moved = false; }
      } else if (m.state === 'home') {
        // it fades away where it fell and grows back where it was, so the forest stays tidy
        const k = Math.min(1, m.t / 1.0), base = m.it.base;
        if (k < 0.4) o.scale.copy(base).multiplyScalar(1 - k / 0.4);
        else {
          if (!m.moved) { o.position.copy(m.home); o.quaternion.copy(m.homeQ); m.moved = true; if (this.effects) this.effects.sparkle(m.it.center.clone(), 0xd9f6ff, 14, 0.1); }
          o.scale.copy(base).multiplyScalar((k - 0.4) / 0.6);
        }
        m.it.scaleOverride = true;
        if (k >= 1) { m.state = 'rest'; o.scale.copy(base); m.it.away = false; m.it.scaleOverride = false; }
      }
    }
  }
}

// Sound guides (for low vision): the nearest thing you can touch hums softly, louder as your hand gets closer,
// in its own note and from its own direction, so you can find it by ear.
export class SoundGuides {
  constructor(sound, sources) { this.sound = sound; this.sources = sources; this.on = false; this.was = false; }
  update(dt, input) {
    if (!this.on) { if (this.was) { this.sound.guide(0, null, null, 0); this.sound.guide(1, null, null, 0); this.was = false; } return; }
    this.was = true;
    input.hands.forEach((h, i) => {
      if (!h.present) { this.sound.guide(i, null, null, 0); return; }
      let best = null, bd = 0.38;
      for (const s of this.sources()) { const d = Math.max(0, s.at.distanceTo(h.palm) - (s.r || 0.05)); if (d < bd) { bd = d; best = s; } }
      if (best) { const k = 1 - bd / 0.38; this.sound.guide(i, best.at, best.hz, k * k); } else this.sound.guide(i, null, null, 0);
    });
  }
}

// Clear outlines (for low vision): everything you can touch gets a bright, clean edge so it stands out from the scenery
const outlineMat = new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(1.0, 0.96, 0.72) }, width: { value: 0.006 } },
  vertexShader: 'uniform float width; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vec3 n = normalize(mat3(modelMatrix) * normal); w.xyz += n * width; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: 'uniform vec3 color; void main(){ gl_FragColor = vec4(color, 0.9); }',
  side: THREE.BackSide, transparent: true, depthWrite: false,
});
export class Outlines {
  constructor(objects) {
    this.lines = [];
    for (const o of objects) if (o) o.traverse((m) => {
      if (!m.isMesh || m.userData.isOutline || !m.geometry || !m.geometry.attributes.normal) return;
      const l = new THREE.Mesh(m.geometry, outlineMat); l.userData.isOutline = true; l.visible = false; l.renderOrder = 1; m.add(l); this.lines.push(l);
    });
  }
  set(on) { for (const l of this.lines) l.visible = on; }
}


// The playfield for thrown things: tree trunks to bounce off, and mushrooms to knock over (they grow back)
export class Playfield {
  constructor(W, touch, sound, effects) {
    this.touch = touch; this.sound = sound; this.effects = effects;
    // tree trunks as circles, measured in Blender (position and width at chest height); Blender's y is the game's -z
    let list = [];
    try { list = JSON.parse((W.byName.G_PlayerSeat && W.byName.G_PlayerSeat.userData.trunks) || '[]'); } catch {}
    this.trunks = list.map(([x, y, r]) => ({ x, z: -y, r }));
    // mushrooms out in the forest you can knock over
    this.targets = W.knock.map((o) => {
      const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      return { o, c, r: Math.max(size.x, size.z) * 0.5 + 0.05, h: size.y, base: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), state: 'up', t: 0, axis: new THREE.Vector3(), cool: 0 };
    });
  }

  collide(p, vel, rad, who) {
    // trunks: bounce off with a soft thud
    for (const t of this.trunks) {
      const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz), min = t.r + rad;
      if (d < min && p.y < 9) {
        const nx = dx / (d || 1), nz = dz / (d || 1), vn = vel.x * nx + vel.z * nz;
        if (vn < 0) { vel.x -= 1.6 * vn * nx; vel.z -= 1.6 * vn * nz; vel.multiplyScalar(0.7); this.sound.boop(p.clone(), 72); if (this.effects) this.effects.sparkle(p.clone(), 0xd9f6ff, 10, 0.08); }
        p.x = t.x + nx * min; p.z = t.z + nz * min;
      }
    }
    // mushrooms out in the forest: knock them over
    for (const k of this.targets) {
      if (k.state !== 'up') continue;
      const dx = p.x - k.c.x, dz = p.z - k.c.z;
      if (Math.hypot(dx, dz) < k.r && p.y < k.base.y + k.h + 0.05) {
        const dir = new THREE.Vector3(vel.x, 0, vel.z); if (dir.lengthSq() < 1e-4) dir.set(-dx, 0, -dz); dir.normalize();
        k.axis.crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize(); k.state = 'fall'; k.t = 0;
        this.sound.boop(k.c.clone(), 98); if (this.effects) { this.effects.sparkle(k.c.clone(), 0xffe9ff, 30, 0.25); this.effects.spores(k.c.clone(), new THREE.Color(0.7, 1, 0.9), 18); }
        vel.multiplyScalar(0.45);
      }
    }
    // the musical mushrooms beside you just get a boop
    if (this.touch) for (const it of this.touch.items) {
      if (it.kind !== 'boop' || it.away || who && who.it === it) continue;
      if (it.center.distanceTo(p) < it.radius + rad) { this.touch._fire(it, null); vel.multiplyScalar(0.6); }
    }
  }

  update(dt) {
    for (const k of this.targets) {
      k.t += dt;
      if (k.state === 'fall') {
        const e = Math.min(1, k.t / 0.7), ang = 1.45 * (1 - Math.pow(1 - e, 3)) + (e >= 1 ? 0 : 0);
        k.o.quaternion.copy(k.q).premultiply(new THREE.Quaternion().setFromAxisAngle(k.axis, ang));
        if (e >= 1) { k.state = 'down'; k.t = 0; }
      } else if (k.state === 'down' && k.t > 6) {
        // it fades where it lies and grows back up where it was
        const e = Math.min(1, (k.t - 6) / 0.6); k.o.scale.copy(k.s).multiplyScalar(Math.max(0.001, 1 - e));
        if (e >= 1) { k.o.quaternion.copy(k.q); k.state = 'grow'; k.t = 0; }
      } else if (k.state === 'grow') {
        const e = Math.min(1, k.t / 1.6); k.o.scale.copy(k.s).multiplyScalar(Math.max(0.001, 1 - Math.pow(1 - e, 3)));
        if (e >= 1) { k.state = 'up'; k.o.scale.copy(k.s); }
      }
    }
  }
}

// the hand's orientation, from the palm's facing and the line from wrist to knuckles
function handQ(h) {
  const y = h.palm.clone().sub(h.wrist).normalize(), x = h.palmNormal.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize(); x.crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
const v3 = (s, d) => (s ? new THREE.Vector3(...String(s).split(',').map(Number)) : d.clone());

// Something that lives on a shelf of the wise tree: pinch it to take it, it stays in your hand the way you
// hold it, and when you let go it floats gently back to its place on the shelf.
// A closed hand: the four fingertips curled in near the palm (with a little hysteresis, so it never flickers)
export function gripping(h) {
  if (!h || !h.present || !h.tips || !h.palm) return false;
  let d = 0; for (let k = 1; k < 5; k++) d += h.tips[k].distanceTo(h.palm); d /= 4;
  if (!h._grip && d < 0.07) h._grip = true; else if (h._grip && d > 0.088) h._grip = false;
  return !!h._grip;
}

// Something that lives on a shelf of the wise tree. Take it either way that feels natural: pinch it, or close
// your hand around it. It stays in your hand until you let go (open the pinch, or open your hand), then
// floats gently back to its place on the shelf.
class ShelfThing {
  constructor(o, sound, grabR, gripR) {
    this.o = o; this.sound = sound; this.grabR = grabR; this.gripR = gripR || grabR * 1.6; if (!o) return;
    this.home = o.position.clone(); this.homeQ = o.quaternion.clone();
    this.held = null; this.how = null; this.offQ = new THREE.Quaternion(); this.offP = new THREE.Vector3(); this.ret = 1; this.wait = 0;
  }
  // how far a hand point is from the thing (override for long things)
  dist(p) { return this.o.position.distanceTo(p); }
  anchor(h) { return this.how === 'grip' ? h.palm : h.pinchPoint; }
  holding(h) { return this.how === 'grip' ? gripping(h) : h.pinching; }
  grab(input) {
    if (!this.o) return;
    input.hands.forEach((h) => {
      if (!h.present) return;
      const kp = '_shelfP' + this.name, kg = '_shelfG' + this.name, g = gripping(h);
      if (!h._holding && !this.held) {
        let how = null;
        if (h.pinching && !h[kp] && this.dist(h.pinchPoint) < this.grabR) how = 'pinch';
        else if (g && !h[kg] && this.dist(h.palm) < this.gripR) how = 'grip';
        if (how) {
          this.held = h; this.how = how; h._holding = this;
          const hq = handQ(h); this.offQ.copy(hq).invert().multiply(this.o.quaternion);
          this.offP.copy(this.o.position).sub(this.anchor(h)).applyQuaternion(hq.clone().invert());
          this.sound.boop(this.o.position.clone(), 196); this.onGrab && this.onGrab(h);
        }
      }
      h[kp] = h.pinching; h[kg] = g;
    });
  }
  place(h, dt) {
    const hq = handQ(h); this.o.quaternion.slerp(hq.clone().multiply(this.offQ), Math.min(1, dt * 16));
    this.o.position.copy(this.anchor(h)).add(this.offP.clone().applyQuaternion(hq));
  }
  move(dt) {
    if (!this.o) return;
    const o = this.o;
    if (this.held) {
      const h = this.held;
      if (!h.present || !this.holding(h)) {
        h._holding = null; this.held = null; this.ret = 0; this.wait = 1.2; this.onLetGo && this.onLetGo();
        // let go mid-swing, fast: a throw (the jar, for one, has something to say about that)
        if (h.present && this.swing > 1.5 && this.onThrow) { this.wait = 0.5; this.onThrow(this.o.position.clone()); }
        this.swing = 0; return;
      }
      this.swing = Math.max((this.swing || 0) * Math.exp(-dt * 8), h.speed || 0);
      this.place(h, dt);
    } else if (this.ret < 1) {
      // a moment where you dropped it, then it drifts softly back to its shelf
      if (this.wait > 0) { this.wait -= dt; return; }
      this.ret = Math.min(1, this.ret + dt / 1.6); const e = this.ret * this.ret * (3 - 2 * this.ret);
      o.position.lerp(this.home, e * 0.22 + 0.015); o.quaternion.slerp(this.homeQ, e * 0.22 + 0.015);
      if (this.ret >= 1) { o.position.copy(this.home); o.quaternion.copy(this.homeQ); }
    }
  }
}

// The fairy lights strung along the top of each shelf: a soft warm halo around every bulb, gently twinkling
export class ShelfLights {
  constructor(W, scene) {
    const g = W.byName.WiseGlow, list = ((g && g.userData.bulbs) || '').split(';').filter(Boolean), tex = glowTexture();
    this.list = list.map((t, i) => {
      const [x, y, z] = t.split(',').map(Number), p = new THREE.Vector3(x, z, -y); // Blender to the game's axes
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffb257, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.position.copy(p); sp.scale.setScalar(0.045); scene.add(sp);
      return { sp, ph: i * 1.7 };
    });
  }
  update(time) {
    // (boost: a warm glow-up for a moment, when somebody turns out to be home after all)
    const dt = Math.min(0.1, time - (this.lastT ?? time)); this.lastT = time; this.boost = Math.max(0, (this.boost || 0) - dt * 0.9);
    const k = 1 + Math.min(1.2, this.boost);
    for (const b of this.list) { b.sp.material.opacity = Math.min(1, (0.42 + 0.18 * Math.sin(time * 1.6 + b.ph) * Math.sin(time * 0.7 + b.ph * 0.3)) * k); b.sp.scale.setScalar(0.045 * (1 + 0.6 * Math.min(1, this.boost))); }
  }
}

// Pixie dust: the drawing stick's tip, held up in the air, sprinkles a trail of twinkling coloured dust.
// Each stroke has its own colour (gold, rose, violet, mint, sky blue) that slowly shifts along the line; the
// specks shimmer, a few flash into little four-pointed glints, and the dust drifts gently down as it fades.
function glintTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,255,255,0.55)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.08)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (const [w, h] of [[2.2, 30], [30, 2.2]]) { g.beginPath(); g.ellipse(32, 32, w, h, 0, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function dustTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Recognising a heart drawn in the air: the stroke (seen from where you look at it) is resampled and
// compared with a heart and with a circle, whichever way round and wherever it was started.
const NP = 48;
function resample(pts, n = NP) {
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const step = L / (n - 1), out = [pts[0].slice()]; let acc = 0, prev = pts[0].slice();
  for (let i = 1; i < pts.length; i++) {
    let cur = pts[i], d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    while (acc + d >= step && out.length < n) { const t = (step - acc) / d; const q = [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]; out.push(q); prev = q; d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]); acc = 0; }
    acc += d; prev = cur;
  }
  while (out.length < n) out.push(pts[pts.length - 1].slice());
  return out;
}
function norm(pts) {
  let cx = 0, cy = 0; pts.forEach((p) => { cx += p[0]; cy += p[1]; }); cx /= pts.length; cy /= pts.length;
  let mx = 1e-6; pts.forEach((p) => { mx = Math.max(mx, Math.abs(p[0] - cx), Math.abs(p[1] - cy)); });
  return pts.map((p) => [(p[0] - cx) / mx, (p[1] - cy) / mx]);
}
function closedTemplate(f) { const p = []; for (let i = 0; i <= 200; i++) p.push(f(i / 200 * Math.PI * 2)); return norm(resample(p)); }
const HEART = closedTemplate((t) => [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]);
const CIRCLE = closedTemplate((t) => [Math.sin(t), Math.cos(t)]);
function score(c, T) {
  let best = 9;
  for (const dirn of [1, -1]) for (let s = 0; s < NP; s += 2) {
    let d = 0; for (let i = 0; i < NP; i++) { const j = ((dirn > 0 ? i : NP - 1 - i) + s) % NP; d += Math.hypot(c[i][0] - T[j][0], c[i][1] - T[j][1]); }
    best = Math.min(best, d / NP);
  }
  return best;
}
function isHeart(pts2) {
  if (pts2.length < 12) return { ok: false };
  const raw = norm(resample(pts2)), size = 1;
  const gap = Math.hypot(raw[0][0] - raw[NP - 1][0], raw[0][1] - raw[NP - 1][1]);
  const h = score(raw, HEART), c = score(raw, CIRCLE);
  return { ok: gap < 0.6 && h < 0.2 && h < c * 0.8, h, c, gap };
}

const DUST_COLOURS = [0xffbe3c, 0xff5fa8, 0x9a6bff, 0x34f0b0, 0x4ab8ff].map((c) => new THREE.Color(c));

export class AirTrails {
  constructor(scene) {
    this.LIFE = 14;
    const layer = (N, tex, size) => {
      const L = { N, i: 0, pos: new Float32Array(N * 3).fill(-999), col: new Float32Array(N * 3), age: new Float32Array(N).fill(99),
        base: new Float32Array(N * 3), tw: new Float32Array(N), fall: new Float32Array(N), rise: new Float32Array(N), mine: [] };
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(L.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(L.col, 3));
      L.pts = new THREE.Points(g, new THREE.PointsMaterial({ map: tex, size, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      L.pts.frustumCulled = false; L.pts.renderOrder = 6; scene.add(L.pts); return L;
    };
    this.dust = layer(3000, dustTexture(), 0.0075);   // fine specks
    this.glow = layer(900, dustTexture(), 0.022);     // a soft coloured haze along the line
    this.glint = layer(300, glintTexture(), 0.03);    // the odd twinkling star
    this.last = null; this.stroke = 0; this.along = 0; this.c = new THREE.Color(); this.t = 0; this.path = [];
  }
  _colour() {
    // this stroke's colour, drifting slowly towards the next one in the palette along the line
    const n = DUST_COLOURS.length, f = this.stroke + this.along * 1.6, a = Math.floor(f) % n, b = (a + 1) % n;
    return this.c.copy(DUST_COLOURS[a]).lerp(DUST_COLOURS[b], f - Math.floor(f));
  }
  _add(L, q, col, jit, k) {
    const j = L.i++ % L.N; L.rise[j] = 0; L.mine.push(j);
    L.pos[j * 3] = q.x + (Math.random() - 0.5) * jit; L.pos[j * 3 + 1] = q.y + (Math.random() - 0.5) * jit; L.pos[j * 3 + 2] = q.z + (Math.random() - 0.5) * jit;
    L.base[j * 3] = col.r * k; L.base[j * 3 + 1] = col.g * k; L.base[j * 3 + 2] = col.b * k;
    L.age[j] = 0; L.tw[j] = Math.random() * 20; L.fall[j] = 0.004 + Math.random() * 0.01;
  }
  draw(p) {
    if (!this.last) { this.last = p.clone(); return; }
    const d = p.distanceTo(this.last); if (d < 0.004) return;
    const n = Math.min(30, Math.ceil(d / 0.005));
    for (let k = 1; k <= n; k++) {
      const q = this.last.clone().lerp(p, k / n); this.along += d / n; const col = this._colour();
      this._add(this.dust, q, col, 0.012, 0.9); this._add(this.dust, q, col, 0.02, 0.6);
      if (k % 2 === 0) this._add(this.glow, q, col, 0.004, 0.16);
      if (Math.random() < 0.05) this._add(this.glint, q, this.c.copy(col).lerp(new THREE.Color(1, 1, 1), 0.35), 0.016, 1);
    }
    this.last.copy(p); this.path.push(p.clone());
  }
  lift() {
    if (this.last) { this._maybeHeart(); this.stroke = (this.stroke + 1) % DUST_COLOURS.length; this.along = 0; }
    this.last = null; this.path = []; for (const L of [this.dust, this.glow, this.glint]) L.mine = [];
  }
  // a heart drawn in the air fills with rose-pink dust and floats slowly up into the sky
  _maybeHeart() {
    const P = this.path; if (P.length < 15 || !this.eye) return;
    let len = 0; for (let i = 1; i < P.length; i++) len += P[i].distanceTo(P[i - 1]); if (len < 0.25) return;
    const c = new THREE.Vector3(); P.forEach((p) => c.add(p)); c.divideScalar(P.length);
    const fwd = c.clone().sub(this.eye()).normalize(), right = new THREE.Vector3(0, 1, 0).cross(fwd).normalize().negate(), up = fwd.clone().cross(right).negate();
    const flat = P.map((p) => { const d = p.clone().sub(c); return [d.dot(right), d.dot(up)]; });
    if (!isHeart(flat).ok) return;
    const pink = new THREE.Color(0xff5fa8), soft = new THREE.Color(0xffb3d6);
    for (const L of [this.dust, this.glow, this.glint]) {
      const k = L === this.glow ? 0.18 : 0.95;
      for (const j of L.mine) { const col = Math.random() < 0.3 ? soft : pink; L.base[j * 3] = col.r * k; L.base[j * 3 + 1] = col.g * k; L.base[j * 3 + 2] = col.b * k; L.age[j] = 0.5; L.rise[j] = 1; }
    }
    // fill it in: a few extra specks inside the heart's outline
    for (let n = 0; n < 160; n++) { const a = P[Math.floor(Math.random() * P.length)], b = P[Math.floor(Math.random() * P.length)]; const q = a.clone().lerp(b, Math.random()).lerp(c, 0.3 * Math.random()); this._add(this.dust, q, pink, 0.008, 0.6); const j = (this.dust.i - 1) % this.dust.N; this.dust.rise[j] = 1; this.dust.age[j] = 0.5; }
    if (this.onHeart) this.onHeart(c);
  }
  update(dt) {
    this.t += dt;
    for (const [L, sparkle] of [[this.dust, 0.45], [this.glow, 0.1], [this.glint, 1]]) {
      let any = false, moved = false;
      for (let j = 0; j < L.N; j++) {
        if (L.age[j] > this.LIFE) continue;
        any = true; L.age[j] += dt;
        const a = L.age[j], fade = Math.min(1, a * 6) * (a < this.LIFE - 4 ? 1 : Math.max(0, (this.LIFE - a) / 4));
        // a shimmer: each speck pulses on its own beat (glints flash brightly now and then)
        let tw = 0.5 + 0.5 * Math.sin(this.t * (3 + (j % 5)) + L.tw[j]);
        tw = sparkle === 1 ? Math.pow(tw, 6) : 1 - sparkle + sparkle * tw;
        const k = fade * tw;
        L.col[j * 3] = L.base[j * 3] * k; L.col[j * 3 + 1] = L.base[j * 3 + 1] * k; L.col[j * 3 + 2] = L.base[j * 3 + 2] * k;
        if (L.rise[j]) { L.pos[j * 3 + 1] += dt * (0.05 + 0.03 * a); L.pos[j * 3] += Math.sin(this.t * 0.8 + j) * 0.0006; moved = true; }   // a heart floats up
        else if (a > 2) { L.pos[j * 3 + 1] -= L.fall[j] * dt; moved = true; }   // drifting gently down as it settles
        if (a > this.LIFE) { L.pos[j * 3 + 1] = -999; moved = true; }
      }
      if (any) L.pts.geometry.attributes.color.needsUpdate = true;
      if (any || moved) L.pts.geometry.attributes.position.needsUpdate = true;
    }
  }
}

// The drawing stick: take it from its shelf and scratch pictures into the dirt, further out than your fingers reach.
export class DrawStick extends ShelfThing {
  constructor(W, sound, dirt) {
    super(W.stick, sound, 0.06, 0.09); this.name = 'stick'; if (!this.o) return;
    // the stick's two ends, from Blender's axes (x, y, z) into the game's (x, z, -y)
    const fromB = (s, d) => { const v = v3(s, d); return new THREE.Vector3(v.x, v.z, -v.y); };
    const u = this.o.userData || {};
    this.b = fromB(u.tip, new THREE.Vector3(0.003, 0.166, 0)); this.a = fromB('0,-0.17,0', new THREE.Vector3());
    this.axis = this.b.clone().sub(this.a).normalize();
    this.gripL = this.a.clone().addScaledVector(this.axis, 0.035);   // you hold it near its back end
    this.tipW = new THREE.Vector3();
    if (dirt) { dirt.tools.push(() => (this.held ? this.tip() : null)); this.ground = (p) => dirt._groundAt(p); }
  }
  tip() { return this.tipW.copy(this.b).applyMatrix4(this.o.matrixWorld); }
  dist(p) {
    // anywhere along the stick counts (it is long and thin)
    this.o.updateMatrixWorld(); const a = this.a.clone().applyMatrix4(this.o.matrixWorld), b = this.b.clone().applyMatrix4(this.o.matrixWorld);
    return new THREE.Line3(a, b).closestPointToPoint(p, true, tmp).distanceTo(p);
  }
  // the moment you take it, it settles into your hand the way you would hold a stick to draw in the dirt:
  // gripped near its back end, slanting forward and down out of your hand (forward along your fingers and
  // tipped toward your palm side, like a pencil), so with your hand relaxed the glowing tip reaches the ground
  place(h, dt) {
    const at = this.anchor(h), fwd = at.clone().sub(h.wrist); if (fwd.lengthSq() < 1e-6) return; fwd.normalize();
    const dir = fwd.clone().addScaledVector(h.palmNormal, 1.25).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(this.axis, dir);
    this.o.quaternion.slerp(q, this.fresh ? 1 : Math.min(1, dt * 18)); this.fresh = false;
    this.o.position.copy(at).sub(this.gripL.clone().applyQuaternion(this.o.quaternion));
    // never push the tip under the ground: it rests on the surface while it draws
    this.o.updateMatrixWorld(); const t = this.tip(); const gy = this.ground ? this.ground(t) : 0;
    if (t.y < gy - 0.005) this.o.position.y += gy - 0.005 - t.y;
  }
  update(dt, input) {
    if (!this.o) return; const was = this.held; this.grab(input); if (this.held && !was) this.fresh = true; this.move(dt); this.o.updateMatrixWorld();
    // in the air (tip well above the ground), the stick paints glowing light; touching the dirt, it scratches a groove
    if (this.air) {
      const t = this.held ? this.tip() : null;
      if (t && t.y > (this.ground ? this.ground(t) : 0) + 0.07) this.air.draw(t.clone()); else this.air.lift();
    }
  }
}

// The fairy light jar: little lights drift in the air around you. Take the jar from its shelf and scoop them
// up with its open mouth, one by one; they glow and swirl inside. Tip the jar upside down and they pour out
// and float free again. Put it down and it carries its lights back to the shelf, glowing there.
export class FairyJar extends ShelfThing {
  constructor(W, scene, sound, effects) {
    super(W.jar, sound, 0.09, 0.15); this.name = 'jar'; this.effects = effects; if (!this.o) return;
    this.scene = scene; this.inside = []; this.free = []; this.pourT = 0;
    // clear glass you can see the lights through
    this.o.traverse((m) => { if (m.isMesh && /glass/i.test(m.material.name || '')) { m.material = m.material.clone(); Object.assign(m.material, { transparent: true, opacity: 0.2, depthWrite: false, transmission: 0, metalness: 0, roughness: 0.1 }); m.material.color.setRGB(0.7, 0.8, 0.9); if (m.material.emissive) m.material.emissive.setRGB(0.05, 0.06, 0.07); m.material.needsUpdate = true; m.renderOrder = 4; } });
    const tex = glowTexture(), cols = [0xffe6a8, 0xffd29a, 0xfff2c8, 0xc8fff0, 0xffd6f4];
    // where the free lights wander: around you at arm's length, never right in front of your eyes
    const spots = [[-62, 0.62, 0.42], [-30, 0.58, 0.32], [28, 0.6, 0.34], [60, 0.64, 0.46], [-48, 0.7, 0.72], [44, 0.72, 0.7], [-82, 0.55, 0.62], [84, 0.56, 0.6], [-14, 0.68, 0.5], [14, 0.7, 0.62]];
    spots.forEach(([a, r, y], i) => {
      const ang = THREE.MathUtils.degToRad(a), home = new THREE.Vector3(Math.sin(ang) * r, y, -Math.cos(ang) * r);
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: cols[i % cols.length], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: cols[i % cols.length], transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      core.scale.setScalar(0.03); halo.scale.setScalar(0.07); scene.add(core); core.add(halo); halo.scale.setScalar(3.2);
      this.free.push({ sp: core, home, p: home.clone(), ph: Math.random() * 10, state: 'free', t: 0, hz: [523.25, 587.33, 659.25, 783.99, 880][i % 5] });
    });
    this.all = [...this.free];
    // the jar's mouth and floor, measured from the model itself
    const box = new THREE.Box3().setFromObject(this.o), sc = this.o.scale.y || 1;
    this.mouthL = new THREE.Vector3(0, (box.max.y - this.o.position.y - 0.01) / sc, 0);
    this.floorY = box.min.y - this.o.position.y + 0.014; this.topY = box.max.y - this.o.position.y - 0.03;
    this.grabR = Math.max(0.08, (box.max.y - box.min.y) * 0.6);
  }
  _catch(L, m) {
    L.state = 'in'; L.t = 0; L.from = L.p.clone(); L.v = new THREE.Vector3();
    L.q = new THREE.Vector3((Math.random() - 0.5) * 0.05, this.floorY + 0.01 + Math.random() * (this.topY - this.floorY - 0.02), (Math.random() - 0.5) * 0.05);
    this.sound.chime ? this.sound.chime(m.clone(), L.hz) : this.sound.boop(m.clone(), L.hz);
    if (this.effects) this.effects.sparkle(m.clone(), 0xffe2a0, 10, 0.05);
    if (this.all.every((x) => x.state === 'in') && this.effects) this.effects.sparkle(m.clone(), 0xffe2a0, 40, 0.12);
  }
  mouth() { return this.mouthL.clone().applyQuaternion(this.o.quaternion).add(this.o.position); }
  update(dt, input, time) {
    if (!this.o) return;
    this.grab(input); this.move(dt);
    const o = this.o, up = new THREE.Vector3(0, 1, 0).applyQuaternion(o.quaternion), m = this.mouth();
    // pinch a light out of the air: it follows your fingers; let go of it at the jar's mouth and it drops in,
    // anywhere else and it floats back to its place
    input.hands.forEach((h) => {
      if (!h.present) return;
      if (h.pinching && !h._lightWas && !h._holding) {
        let best = null, bd = 0.075;
        for (const L of this.all) if (L.state === 'free') { const d = L.p.distanceTo(h.pinchPoint); if (d < bd) { bd = d; best = L; } }
        if (best) { best.state = 'pinched'; best.hand = h; h._holding = best; this.sound.boop(best.p.clone(), best.hz); }
      }
      h._lightWas = h.pinching;
    });
    for (const L of this.all) if (L.state === 'pinched') {
      const h = L.hand;
      if (h.present && h.pinching) { L.p.copy(h.pinchPoint); L.sp.position.copy(L.p); continue; }
      h._holding = null; L.hand = null;
      if (L.p.distanceTo(this.mouth()) < 0.13) { L.state = 'free'; this._catch(L, this.mouth()); }
      else { L.state = 'out'; L.t = 0; L.from = L.p.clone(); }
    }
    // scoop: a free light close to the open mouth flies in
    if (this.held && up.y > -0.2) for (const L of this.all) {
      if (L.state === 'free' && L.p.distanceTo(m) < 0.12) this._catch(L, m);
    }
    // tip it upside down and they pour out, one at a time
    this.pourT = Math.max(0, this.pourT - dt);
    if (this.held && up.y < -0.45 && this.pourT <= 0) {
      const L = this.all.find((x) => x.state === 'in');
      if (L) { L.state = 'out'; L.rest = null; L.t = 0; L.from = L.sp.getWorldPosition(new THREE.Vector3()); this.pourT = 0.25; this.sound.boop(m.clone(), L.hz * 0.5); }
    }
    const inv = o.quaternion.clone().invert(), upL = new THREE.Vector3(0, 1, 0).applyQuaternion(inv);
    for (const L of this.all) {
      const tw = 0.75 + 0.25 * Math.sin(time * 2.4 + L.ph * 3);
      if (L.state === 'free') {
        // a slow wandering drift around its spot
        L.p.set(L.home.x + Math.sin(time * 0.31 + L.ph) * 0.05, L.home.y + Math.sin(time * 0.47 + L.ph * 2) * 0.035, L.home.z + Math.cos(time * 0.27 + L.ph) * 0.05);
        L.sp.position.copy(L.p); L.sp.material.opacity = tw;
      } else if (L.state === 'in') {
        // inside the jar: drifting upward (whichever way is up), bumping softly against the glass
        if (L.sp.parent !== o) { L.t = Math.min(1, L.t + dt / 0.35); const w = L.from.clone().lerp(o.localToWorld(L.q.clone()), L.t * L.t); L.sp.position.copy(w); if (L.t >= 1) { o.add(L.sp); L.sp.position.copy(L.q); L.sp.scale.setScalar(0.02 / o.scale.x); } }
        else {
          // each light floats around its own spot in the jar (spread top to bottom), wandering slowly; when the jar
          // tilts they drift a little toward whichever way is up
          if (!L.rest) L.rest = new THREE.Vector3((Math.random() - 0.5) * 0.05, this.floorY + 0.012 + Math.random() * (this.topY - this.floorY - 0.04), (Math.random() - 0.5) * 0.05);
          const f = L.rest.clone().sub(L.q).multiplyScalar(2.2).addScaledVector(upL, 0.015);
          f.x += Math.sin(time * 1.3 + L.ph) * 0.03; f.y += Math.sin(time * 0.9 + L.ph * 2.3) * 0.02; f.z += Math.cos(time * 1.1 + L.ph * 1.7) * 0.03;
          L.v.addScaledVector(f, dt).multiplyScalar(Math.exp(-dt * 1.4)); L.q.addScaledVector(L.v, dt);
          const rr = Math.hypot(L.q.x, L.q.z); if (rr > 0.04) { L.q.x *= 0.04 / rr; L.q.z *= 0.04 / rr; L.v.x *= -0.4; L.v.z *= -0.4; }
          if (L.q.y < this.floorY) { L.q.y = this.floorY; L.v.y *= -0.4; } if (L.q.y > this.topY) { L.q.y = this.topY; L.v.y *= -0.4; }
          L.sp.position.copy(L.q).divideScalar(o.scale.x);
        }
        L.sp.material.opacity = tw;
      } else if (L.state === 'out') {
        // poured out: it floats back up to its place in the air
        if (L.sp.parent !== this.scene) { this.scene.add(L.sp); L.sp.scale.setScalar(0.03); }
        L.t = Math.min(1, L.t + dt / 2.2); const e = L.t * L.t * (3 - 2 * L.t);
        L.p.copy(L.from).lerp(L.home, e); L.p.y += Math.sin(L.t * Math.PI) * 0.08; L.sp.position.copy(L.p); L.sp.material.opacity = tw;
        if (L.t >= 1) L.state = 'free';
      }
    }
  }
  get count() { return this.all ? this.all.filter((x) => x.state === 'in').length : 0; }
}

// A few butterflies drifting slowly among the trees in the distance
export class Butterflies {
  constructor(GuideClass, scene) {
    this.list = [];
    for (let i = 0; i < 4; i++) {
      const g = new GuideClass(scene); g.group.scale.setScalar(2.6);
      const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 6;
      const p = new THREE.Vector3(Math.sin(a) * r, 1.2 + Math.random() * 1.5, -Math.cos(a) * r);
      g.appear(p); this.list.push({ g, a, r, t: Math.random() * 10, next: 0 });
    }
  }
  update(dt, time) {
    for (const b of this.list) {
      b.next -= dt;
      if (b.next <= 0) {
        b.next = 6 + Math.random() * 6; b.a += (Math.random() - 0.5) * 1.2; b.r = Math.max(4.5, Math.min(12, b.r + (Math.random() - 0.5) * 3));
        b.g.goTo(new THREE.Vector3(Math.sin(b.a) * b.r, 1.0 + Math.random() * 2.2, -Math.cos(b.a) * b.r), { orbit: 0.4, speed: 0.35 });
      }
      b.g.update(dt, time);
    }
  }
}
