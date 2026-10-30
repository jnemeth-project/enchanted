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
      return { o, c, r: 0.72 * s.x, h: 1.5 * s.z };
    });
    this.prev = [null, null];
  }

  update(dt, input) {
    this.chimeT = Math.max(0, this.chimeT - dt);
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
        if (d2 > it.r * it.r * 1.3 || tmp.y < -0.1 || tmp.y > it.h) continue;
        // how fast you are circling round the middle (radians a second), in the direction you move
        const w = (tmp.z * v.x - tmp.x * v.z) / (d2 + 0.02);
        it.o.userData.spin += THREE.MathUtils.clamp(w, -14, 14) * Math.min(1, dt * 5);
        if (this.chimeT <= 0 && speed > 0.5) {
          this.chimeT = 0.35;
          this.sound.hush(p, 392 + Math.random() * 200);
          if (this.effects) this.effects.sparkle(p, 0xd9f6ff, 10, 0.08);
        }
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
    // pick up: pinch near a resting pebble
    input.hands.forEach((h) => {
      if (!h.present) return;
      const held = this.list.find((pb) => pb.hand === h);
      if (!held && h.pinching && !h._pebbleWas) {
        let best = null, bd = 0.08;
        for (const pb of this.list) { if (pb.state !== 'rest') continue; const d = pb.o.position.distanceTo(h.pinchPoint); if (d < bd) { bd = d; best = pb; } }
        if (best) { best.state = 'held'; best.hand = h; best.trail = []; this.sound.boop(best.o.position.clone(), 180); }
      }
      h._pebbleWas = h.pinching;
    });
    for (const pb of this.list) {
      const o = pb.o;
      pb.t += dt;
      if (pb.state === 'held') {
        const h = pb.hand;
        if (!h.present) { pb.state = 'land'; pb.t = 0; pb.hand = null; continue; }
        o.position.copy(h.pinchPoint);
        pb.trail.push({ p: h.pinchPoint.clone(), dt }); if (pb.trail.length > 6) pb.trail.shift();
        if (!h.pinching) {
          // let go: it flies off with your hand's speed (a little extra, for fun)
          const a = pb.trail[0], b = pb.trail[pb.trail.length - 1], time = pb.trail.slice(1).reduce((s, x) => s + x.dt, 0) || dt;
          const v = b.p.clone().sub(a.p).divideScalar(time).multiplyScalar(1.35);
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
        if (pb.t > 10 || o.position.length() > 40) { pb.state = 'land'; pb.t = 0; }
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
