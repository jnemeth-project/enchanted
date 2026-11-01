// Things that respond to touch: deep boops on mushrooms, fern rustles, puffball puffs,
// and dandelion clocks that let go of their seeds.
import * as THREE from 'three';
import { Spring, worldSphere, parseJSON, tweens } from './util.js';

// jewel hues a booped mushroom glows into: magenta, violet, electric blue, cyan, emerald, lime, amber, coral
const VIVID = [0.9, 0.78, 0.62, 0.52, 0.4, 0.27, 0.11, 0.98];

export class Touch {
  constructor(W, sound, effects) {
    this.W = W; this.sound = sound; this.effects = effects; this.count = 0; this.onAny = null;
    this.items = []; this.tools = [];   // tools: the drawing stick's tip, which taps mushrooms like a drumstick
    for (const o of W.boops) this.addBoop(o);
    // Every mushroom you can boop has its own note, low to high from left to right,
    // so sweeping your hand across them plays a calm pentatonic scale.
    const boops = this.items.filter((it) => it.kind === 'boop')
      .sort((a, b) => Math.atan2(a.center.x, -a.center.z) - Math.atan2(b.center.x, -b.center.z));
    boops.forEach((it, i) => { it.hz = Touch.note(i); });
    this.nextNote = boops.length;
    for (const o of W.ferns) {
      const s = worldSphere(o, { shrink: 0.65 });
      this.items.push({ kind: 'fern', o, ...s, sx: new Spring(60, 5), sz: new Spring(60, 5), inside: [false, false], cool: 0, rot: o.rotation.clone() });
    }
    for (const o of W.puffs) {
      const s = worldSphere(o, { shrink: 0.9 });
      s.center.y = s.box.min.y + (s.box.max.y - s.box.min.y) * 0.55;
      const col = new THREE.Color(1, 1, 1);
      o.traverse((m) => { if (m.isMesh && m.material.emissive) col.copy(m.material.emissive); });
      this.items.push({ kind: 'puff', o, ...s, spring: new Spring(110, 7), inside: [false, false], cool: 0, base: o.scale.clone(), color: col });
    }
    // bubble mushrooms: round and plump; a boop sets them wobbling like jelly for a couple of seconds
    for (const o of W.bubbles || []) {
      const s = worldSphere(o, { cap: true, shrink: 0.95 }), mats = [];
      o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.userData.e0 = m.material.emissiveIntensity ?? 1; mats.push(m.material); } });
      this.items.push({ kind: 'jelly', o, ...s, spring: new Spring(48, 2.0), lean: new Spring(30, 2.4), flash: 0, inside: [false, false], cool: 0, base: o.scale.clone(), mats, hz: 140 + Math.random() * 60 });
    }
    // the bellflower within reach: brush a bell and it swings and rings its own note
    const BELL_NOTES = [659.25, 739.99, 880, 987.77, 1108.73];
    (W.reachBells || []).sort((a, b) => a.name.localeCompare(b.name)).forEach((o, i) => {
      const s = worldSphere(o, { shrink: 1.1 });
      this.items.push({ kind: 'bell', o, ...s, swing: new Spring(26, 1.6), swing2: new Spring(26, 1.6), inside: [false, false], cool: 0, rot: o.rotation.clone(), hz: BELL_NOTES[i % BELL_NOTES.length] });
    });
    // the curl fern within reach: brush up along it and it unrolls, then slowly curls back
    if (W.reachFern) {
      const box = new THREE.Box3().setFromObject(W.reachFern), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      const meshes = []; W.reachFern.traverse((m) => { if (m.isMesh && m.morphTargetInfluences) meshes.push(m); });   // the frond and its glowing tip are separate parts: all unroll together
      this.items.push({ kind: 'frond', o: W.reachFern, meshes, center: c, radius: Math.max(size.x, size.z) * 0.6 + 0.06, box, inside: [false, false], cool: 0, open: 0 });
    }
    for (const o of W.dandelions) {
      const box = new THREE.Box3().setFromObject(o);
      const c = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y - 0.08, (box.min.z + box.max.z) / 2);
      const seeds = W.byName[o.name.replace('G_Dandelion_', 'G_DandelionSeeds_')];
      this.items.push({ kind: 'dandelion', o, center: c, radius: 0.13, inside: [false, false], blown: false, seeds });
    }
  }

  // A major pentatonic from A2: soft and impossible to make sound wrong together.
  static note(i) {
    const S = [110, 123.47, 138.59, 164.81, 185.0, 220, 246.94, 277.18, 329.63];
    return S[((i % S.length) + S.length) % S.length];
  }

  addBoop(o, baseHz, opts = {}) {
    const s = worldSphere(o, { cap: true, shrink: 0.85 });
    const sp = parseJSON(o.userData.sound_params, {}) || {};
    if (!o.userData.mats) o.userData.mats = [];
    const item = { kind: 'boop', o, ...s, spring: new Spring(160, 6), flash: 0, inside: [false, false], cool: 0, base: o.scale.clone(), hz: baseHz || sp.base_hz || 100 };
    item.noRecolor = !!opts.keep;
    this.items.push(item);
    return item;
  }
  removeObject(o) { this.items = this.items.filter((it) => it.o !== o); }

  _fire(it, hand) {
    if (it.cool > 0) return;
    this.count++; if (this.onAny) this.onAny(it.kind);
    if (it.kind === 'boop') {
      it.spring.kick(-2.2); it.flash = 1; it.cool = 0.35;
      this.sound.boop(it.center, it.hz);
      this._recolor(it);
      if (it.toColor) { const top = new THREE.Vector3(it.center.x, it.box ? it.box.max.y : it.center.y, it.center.z); this.effects.sparkle(top, it.toColor.getHex(), 40, 0.2); this.effects.sparkle(top, 0xffffff, 14, 0.1); }
    } else if (it.kind === 'bell') {
      const v = hand ? hand.palmVel : new THREE.Vector3(0.6, 0, 0);
      it.swing.kick(Math.max(-2, Math.min(2, v.z * 2.5)) + 0.6); it.swing2.kick(Math.max(-2, Math.min(2, -v.x * 2.5))); it.cool = 0.25;
      this.sound.chime(it.center, it.hz);
      this.effects.sparkle(it.center.clone(), 0xe9dcff, 8, 0.05);
    } else if (it.kind === 'frond') {
      if (it.opening) return;
      it.opening = true; it.cool = 1;
      this.sound.whoosh(it.center);
      this.effects.sparkle(new THREE.Vector3(it.center.x, it.box.max.y, it.center.z), 0xc8ffe8, 18, 0.12);
      // unroll quickly, stay open a moment, then curl back slowly with a little settle at the end
      tweens.add(0.7, (k) => { it.open = 1 - Math.pow(1 - k, 3); }, { done: () => tweens.add(2.2, (k) => { it.open = 1 - (k * k * (3 - 2 * k)) * (1 + 0.08 * Math.sin(k * Math.PI)); }, { delay: 0.9, done: () => { it.open = 0; it.opening = false; } }) });
    } else if (it.kind === 'jelly') {
      const v = hand ? hand.palmVel : new THREE.Vector3(0, -0.5, 0);
      it.spring.kick(-3.4 - Math.min(2, v.length() * 2)); it.lean.kick((v.x - v.z) * 3); it.flash = 1; it.cool = 0.4;
      this.sound.jelly(it.center, it.hz);
      this.effects.sparkle(new THREE.Vector3(it.center.x, it.box.max.y, it.center.z), 0xfff0fa, 14, 0.08);
    } else if (it.kind === 'fern') {
      const v = hand ? hand.palmVel : new THREE.Vector3(0.5, 0, 0);
      const speed = Math.min(1.5, v.length());
      it.sx.kick(v.z * 1.2 + 0.4); it.sz.kick(-v.x * 1.2 + 0.2); it.cool = 0.3;
      this.sound.rustle(it.center, Math.max(0.25, speed / 1.2));
    } else if (it.kind === 'puff') {
      it.spring.kick(-3.2); it.cool = 1.0;
      this.sound.puff(it.center);
      this.effects.spores(new THREE.Vector3(it.center.x, it.box.max.y, it.center.z), it.color, 28);
    } else if (it.kind === 'dandelion' && !it.blown) {
      it.blown = true; this.sound.whoosh(it.center);
      this.effects.seeds(it.center, 44);
      const mats = it.o.userData.mats || [];
      tweens.add(1.4, (k) => { for (const m of mats) if (m.name === 'Dandelion_Pappus' || m.name === 'Dandelion_Filament') { m.transparent = true; m.opacity = 1 - k; } });
      it.regrow = 40; // new seeds after a while, so you can blow it again
      if (it.seeds) { if (!it.seedHome) it.seedHome = it.seeds.position.clone(); const p0 = it.seedHome.clone(); tweens.add(9, (k) => { it.seeds.position.set(p0.x + k * 2.5, p0.y + k * 1.2, p0.z - k * 0.6); it.seeds.traverse((m) => { if (m.isMesh) { m.material.transparent = true; m.material.opacity = 1 - k; } }); }); }
    }
  }

  update(dt, input) {
    for (const it of this.items) {
      if (it.away) { it.inside[0] = it.inside[1] = false; continue; } // being held or thrown
      it.cool = Math.max(0, it.cool - dt);
      if (input.mode === 'xr') {
        input.hands.forEach((h, hi) => {
          if (!h.present) { it.inside[hi] = false; return; }
          let inside = false;
          // a fingertip has to really reach it (a little inside the glow); once touched, it lets go a bit further out
          const r = it.kind === 'dandelion' || it.kind === 'fern' ? it.radius + 0.01 : it.radius * (it.inside[hi] ? 0.95 : 0.7);
          for (let k = 0; k < 5 && !inside; k++) if (h.tips[k].distanceTo(it.center) < r) inside = true;
          if (!inside && it.kind === 'fern' && h.palm.distanceTo(it.center) < r) inside = true;
          if (!inside && it.kind === 'bell' && h.palm && h.palm.distanceTo(it.center) < r + 0.03) inside = true;   // a brush of the hand
          if (it.kind === 'frond') {   // only an upward brush along the frond unrolls it
            const near = h.palm && it.box.distanceToPoint(h.palm) < 0.07;
            inside = !!near && (h.palmVel ? h.palmVel.y > 0.25 : false);
          }
          if (!inside && it.kind === 'dandelion' && h.palm.distanceTo(it.center) < 0.22 && h.palmVel.length() > 0.5) inside = true; // a swoosh
          if (inside && !it.inside[hi]) {
            if (it.kind !== 'fern' || h.speed > 0.12) this._fire(it, h);
          }
          it.inside[hi] = inside;
        });
        // the drawing stick's tip drums on the mushrooms (boops and bubble mushrooms) like a fingertip
        if (it.kind === 'boop' || it.kind === 'jelly') this.tools.forEach((tool, ti) => {
          const p = tool(), slot = 2 + ti;
          const inside = !!p && p.distanceTo(it.center) < it.radius * (it.inside[slot] ? 0.95 : 0.75);
          if (inside && !it.inside[slot]) this._fire(it, null);
          it.inside[slot] = inside;
        });
      }
      if (it.kind === 'dandelion' && it.blown && it.regrow !== undefined) {
        it.regrow -= dt;
        if (it.regrow <= 0) {
          it.blown = false; it.regrow = undefined;
          const mats = it.o.userData.mats || [];
          tweens.add(2, (k) => { for (const m of mats) if (m.name === 'Dandelion_Pappus' || m.name === 'Dandelion_Filament') m.opacity = k; });
          if (it.seeds && it.seedHome) { it.seeds.position.copy(it.seedHome); it.seeds.traverse((m) => { if (m.isMesh) m.material.opacity = 0; }); tweens.add(2, (k) => it.seeds.traverse((m) => { if (m.isMesh) m.material.opacity = k; })); }
        }
      }
      if (it.kind === 'boop') {
        const x = it.spring.update(dt); it.flash *= Math.exp(-dt * 3.5);
        it.o.scale.set(it.base.x * (1 - x * 0.05), it.base.y * (1 + x * 0.1), it.base.z * (1 - x * 0.05));
        const k = 1 + it.flash * 4.5 + (it.invite || 0) * 0.7 + (this.highlight || 0); // a bright, magical flash of light on each boop
        for (const m of it.o.userData.mats) if (m.userData.baseEmissive !== undefined) m.emissiveIntensity = m.userData.baseEmissive * k * (it.dim ?? 1);
      } else if (it.kind === 'fern') {
        const ax = it.sx.update(dt), az = it.sz.update(dt);
        it.o.rotation.set(it.rot.x + ax * 0.12, it.rot.y, it.rot.z + az * 0.12);
      } else if (it.kind === 'bell') {
        const a = it.swing.update(dt), b = it.swing2.update(dt);
        it.o.rotation.set(it.rot.x + a * 0.35, it.rot.y, it.rot.z + b * 0.35);
      } else if (it.kind === 'frond') {
        for (const m of it.meshes) m.morphTargetInfluences[0] = it.open;
      } else if (it.kind === 'jelly') {
        // squash and stretch (keeping its volume), with a soft sideways sway: a wobbly, bouncy bubble
        const x = it.spring.update(dt), l = it.lean.update(dt); it.flash *= Math.exp(-dt * 2.2);
        const sy = 1 + x * 0.32, sxz = 1 / Math.sqrt(Math.max(0.5, sy));
        it.o.scale.set(it.base.x * sxz, it.base.y * sy, it.base.z * sxz);
        it.o.rotation.z = l * 0.1; it.o.rotation.x = l * 0.06;
        for (const m of it.mats) m.emissiveIntensity = m.userData.e0 * (1 + it.flash * 2.5);
      } else if (it.kind === 'puff') {
        const x = it.spring.update(dt);
        it.o.scale.set(it.base.x * (1 - x * 0.12), it.base.y * (1 + x * 0.25), it.base.z * (1 - x * 0.12));
      }
    }
  }

  // A click or pointer only counts when it really lands on a fern, mushroom, puffball or dandelion,
  // and nothing (ground, moss, trees) is in front of it. Anywhere else stays silent.
  pick(ray) {
    const dir = ray.direction.clone().normalize();
    // cheap first: does the ray pass anywhere near something touchable? (raycasting the whole forest is slow)
    if (!this.items.some((it) => !it.away && ray.distanceToPoint(it.center) < it.radius * 1.5 + 0.05)) return null;
    const rc = new THREE.Raycaster(ray.origin, dir, 0, 40);
    if (!this.blockers) {
      const B = this.W.byName;
      this.blockers = ['Ground', 'Moss', 'Trees', 'Ferns', 'LoneMushrooms', 'GlowRocks'].map((n) => B[n]).filter(Boolean).concat(this.W.clusters);
    }
    const wall = rc.intersectObjects(this.blockers, true)[0];
    const limit = wall ? wall.distance : Infinity;
    let best = null, bd = limit;
    for (const it of this.items) {
      if (it.away) continue;
      let d = Infinity;
      if (it.kind === 'dandelion') {
        if (ray.distanceToPoint(it.center) < it.radius) d = ray.origin.distanceTo(it.center);
      } else {
        // ferns are cut-out leaf cards: only count hits on actual leaves, not the gaps between them
        const hits = rc.intersectObject(it.o, true);
        const h = it.kind === 'fern' ? hits.find((x) => this._solid(x)) : hits[0];
        if (h) d = h.distance;
      }
      if (d < bd) { bd = d; best = it; }
    }
    return best ? { key: best, size: best.radius * 2, handsOnly: true, point: best.center.clone(), fire: () => this._fire(best, null) } : null;
  }

  setPalette(palette, neutralMap) { this.palette = palette.filter((p) => (p.weight || 0) >= 10); this.neutralMap = neutralMap; }

  // Each boop eases the mushroom into the next colour the magic mushroom can grow in.
  _recolor(it) {
    if (!this.neutralMap || it.noRecolor) return;
    const mats = it.o.userData.mats || [];
    if (!it.tint) {
      const n = (mats[0] && mats[0].name) || '';
      const start = n.includes('Pink') ? [1, 0.55, 0.86] : n.includes('Lilac') ? [0.78, 0.62, 1] : [0.42, 1, 0.82];
      it.tint = new THREE.Color(...start); it.ci = Math.floor(Math.random() * VIVID.length);
      for (const m of mats) { m.map = this.neutralMap; m.emissiveMap = this.neutralMap; m.color.copy(it.tint); m.emissive.copy(it.tint); m.needsUpdate = true; }
    }
    // each boop: a vivid jewel colour (no washed-out pastels)
    it.ci = (it.ci + 1 + Math.floor(Math.random() * (VIVID.length - 2))) % VIVID.length;
    const from = it.tint.clone(), to = new THREE.Color().setHSL(VIVID[it.ci], 1.0, 0.5);
    it.toColor = to;
    if (it.colorTween) it.colorTween.t = it.colorTween.duration;
    it.colorTween = tweens.add(0.9, (k) => { it.tint.copy(from).lerp(to, k); for (const m of mats) { m.color.copy(it.tint); m.emissive.copy(it.tint).multiplyScalar(1.35); } });
  }

  _solid(hit) {
    const m = hit.object.material, img = m && m.map && m.map.image;
    if (!img || !hit.uv) return true;
    if (!this._alpha || this._alphaSrc !== img) {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      this._alpha = g.getImageData(0, 0, c.width, c.height); this._alphaSrc = img;
    }
    const A = this._alpha, flip = m.map.flipY;
    const x = Math.min(A.width - 1, Math.max(0, Math.floor(((hit.uv.x % 1) + 1) % 1 * A.width)));
    const vy = ((hit.uv.y % 1) + 1) % 1;
    const y = Math.min(A.height - 1, Math.max(0, Math.floor((flip ? 1 - vy : vy) * A.height)));
    return A.data[(y * A.width + x) * 4 + 3] > 100;
  }

  // where things are may have moved (the reach rocks grow for the chair): measure again
  refresh() { for (const it of this.items) if (it.kind === 'jelly' || it.kind === 'boop') { const s = worldSphere(it.o, { cap: true, shrink: it.kind === 'jelly' ? 0.95 : 0.85 }); it.center = s.center; it.radius = s.radius; it.box = s.box; } }

  dimBoops(k) { for (const it of this.items) if (it.kind === 'boop') it.dim = k; }
}
