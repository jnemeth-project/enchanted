// Little things to play with, just for the joy of it:
//   Twirls  - sweep or circle your hand through the fairy dust around a mushroom and it spins with you,
//             faster the quicker you go, in the direction you move, then slowly settles back.
//   Pebbles - a few smooth pebbles lie on the ground in front of you. Pinch one to pick it up and
//             let go mid-swing to throw it. It bounces, rolls to a stop, and a moment later sparkles
//             back home so you can throw it again. (On screen: click a pebble to toss it.)
import * as THREE from 'three';

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
    pb.state = 'fly'; pb.t = 0; pb.v.copy(v); pb.hand = null;
    pb.spin.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
    this.sound.whoosh(pb.o.position.clone());
  }

  // on screen (or pointing): click a pebble and it is tossed gently ahead
  pick(ray) {
    for (const pb of this.list) {
      if (pb.state !== 'rest') continue;
      if (ray.distanceToPoint(pb.o.position) < 0.07) return { key: pb, size: 0.06, point: pb.o.position.clone(), fire: () => {
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
      const aim = input.aim && input.aim[i];
      if (h.pinching && !h._pebbleWas && !h._holding) {
        let best = null, bd = 0.08;
        for (const pb of this.list) { if (pb.state !== 'rest') continue; const d = pb.o.position.distanceTo(h.pinchPoint); if (d < bd) { bd = d; best = pb; } }
        if (!best && aim) { let ad = 0.07; for (const pb of this.list) { if (pb.state !== 'rest') continue; const d = aim.ray.distanceToPoint(pb.o.position); if (d < ad && pb.o.position.distanceTo(aim.ray.origin) < 2.5) { ad = d; best = pb; } } if (best) best.fetch = 0; }
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
          const v = b.p.clone().sub(a.p).divideScalar(time).multiplyScalar(2.6); // a good throw really flies
          if (v.length() < 0.6) { pb.state = 'fly'; pb.v.set(0, 0, 0); pb.t = 0; pb.hand = null; } // just dropped
          else this._throw(pb, v);
        }
      } else if (pb.state === 'fly') {
        pb.v.y -= G * dt;
        o.position.addScaledVector(pb.v, dt);
        o.rotation.x += pb.spin.x * dt; o.rotation.y += pb.spin.y * dt; o.rotation.z += pb.spin.z * dt;
        const gy = this._groundY(o.position) + 0.015;
        if (o.position.y <= gy) {
          o.position.y = gy;
          const impact = -pb.v.y;
          if (impact > 1.2) {
            this.sound.boop(o.position.clone(), 70 + Math.random() * 20);
            if (this.effects) this.effects.sparkle(o.position.clone(), 0xcfe4ff, 8, 0.06);
            pb.v.y = impact * 0.32; pb.v.x *= 0.55; pb.v.z *= 0.55; pb.spin.multiplyScalar(0.5);
          } else { pb.state = 'land'; pb.t = 0; pb.v.set(0, 0, 0); }
        }
        if (pb.t > 12 || o.position.length() > 70) { pb.state = 'land'; pb.t = 0; }
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
    for (const cr of this.list) if (ray.distanceToPoint(cr.c) < cr.r) return { key: cr, size: cr.r, point: cr.c.clone(), fire: () => this.light(cr) };
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
    this.w = 0.62; this.d = 0.46; this.centre = new THREE.Vector3(0, 0, -0.5);
    // the drawing surface hugs the ground: a fine grid whose every point sits just on the path
    const ground = [W.byName.Ground].filter(Boolean), ray = new THREE.Raycaster();
    const NX = 24, NZ = 18, geo = new THREE.PlaneGeometry(this.w, this.d, NX, NZ); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position; this.NX = NX; this.NZ = NZ; this.hgt = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + this.centre.x, z = pos.getZ(i) + this.centre.z;
      ray.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0)); const h = ray.intersectObjects(ground.length ? ground : W.grounds, true)[0];
      const y = (h ? h.point.y : 0) + 0.007; pos.setY(i, y); this.hgt[i] = y;
    }
    pos.needsUpdate = true; geo.computeVertexNormals();
    this.canvas = document.createElement('canvas'); this.canvas.width = 640; this.canvas.height = 400;
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
    g.strokeStyle = 'rgba(122, 86, 52, 0.55)'; g.lineWidth = 26; g.beginPath(); g.moveTo(u0, v0); g.lineTo(u, v); g.stroke();
    g.strokeStyle = 'rgba(58, 36, 18, 0.95)'; g.lineWidth = 16; g.beginPath(); g.moveTo(u0, v0); g.lineTo(u, v); g.stroke();
    g.strokeStyle = 'rgba(30, 18, 8, 0.95)'; g.lineWidth = 7; g.beginPath(); g.moveTo(u0, v0); g.lineTo(u, v); g.stroke();
    this.tex.needsUpdate = true; this.inked = true;
    if (this.scratchT <= 0 && Math.hypot(u - u0, v - v0) > 2) { this.scratchT = 0.25; this.sound.rustle(at.clone(), 0.12); }
  }

  update(dt, input) {
    this.scratchT = Math.max(0, this.scratchT - dt);
    let dot = null;
    // pointing at the dirt: pinch and move to draw; a quick sweep of the pointer across it wipes it clean
    if (input.aim) input.aim.forEach((a, i) => {
      const h = input.hands[i];
      if (!a || (h && h._holding)) { this.prevHit[i] = null; return; }
      this.rc.set(a.ray.origin, a.ray.direction); this.rc.far = 3;
      const hit = this.rc.intersectObject(this.mesh)[0];
      if (!hit) { this.prevHit[i] = null; return; }
      dot = hit.point;
      const pinching = h ? h.pinching : false;
      const [u, v] = this._uv(hit.point), prev = this.prevHit[i];
      if (pinching && prev && prev.pinching) this._line(prev.u, prev.v, u, v, hit.point);
      if (!pinching && prev && this.inked && dt > 0 && hit.point.distanceTo(prev.p) / dt > 2.5 && this.wipe <= 0) { this.wipe = 1; this.sound.whoosh(hit.point); if (this.effects) this.effects.sparkle(hit.point, 0xd9f6ff, 18, 0.15); }
      this.prevHit[i] = { u, v, p: hit.point.clone(), pinching };
    });
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
        for (const m of this.list) { if (m.state !== 'rest') continue; const d = m.it.center.distanceTo(h.pinchPoint); if (d < m.it.radius + 0.03 && d < bd) { bd = d; best = m; } }
        const aim = input.aim && input.aim[i];
        if (!best && aim) for (const m of this.list) { if (m.state !== 'rest') continue; if (aim.ray.distanceToPoint(m.it.center) < m.it.radius * 0.9 && m.it.center.distanceTo(aim.ray.origin) < 2.5) { best = m; break; } }
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
          m.v.copy(b.p).sub(a.p).divideScalar(time).multiplyScalar(2.2);
          m.spin.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
          m.state = 'fly'; m.t = 0; if (m.v.length() > 0.6) this.sound.whoosh(o.position.clone());
        }
      } else if (m.state === 'fly') {
        m.v.y -= G * dt; o.position.addScaledVector(m.v, dt);
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
