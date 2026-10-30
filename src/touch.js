// Things that respond to touch: deep boops on mushrooms, fern rustles, puffball puffs,
// and dandelion clocks that let go of their seeds.
import * as THREE from 'three';
import { Spring, worldSphere, parseJSON, tweens } from './util.js';

// jewel hues a booped mushroom glows into: magenta, violet, electric blue, cyan, emerald, lime, amber, coral
const VIVID = [0.9, 0.78, 0.62, 0.52, 0.4, 0.27, 0.11, 0.98];

export class Touch {
  constructor(W, sound, effects) {
    this.W = W; this.sound = sound; this.effects = effects; this.count = 0; this.onAny = null;
    this.items = [];
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
      if (it.toColor) this.effects.sparkle(new THREE.Vector3(it.center.x, it.box ? it.box.max.y : it.center.y, it.center.z), it.toColor.getHex(), 22, 0.14);
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
      if (it.seeds) { const p0 = it.seeds.position.clone(); tweens.add(9, (k) => { it.seeds.position.set(p0.x + k * 2.5, p0.y + k * 1.2, p0.z - k * 0.6); it.seeds.traverse((m) => { if (m.isMesh) { m.material.transparent = true; m.material.opacity = 1 - k; } }); }); }
    }
  }

  update(dt, input) {
    for (const it of this.items) {
      it.cool = Math.max(0, it.cool - dt);
      if (input.mode === 'xr') {
        input.hands.forEach((h, hi) => {
          if (!h.present) { it.inside[hi] = false; return; }
          let inside = false;
          const r = it.radius + 0.01;
          for (let k = 0; k < 5 && !inside; k++) if (h.tips[k].distanceTo(it.center) < r) inside = true;
          if (!inside && it.kind === 'fern' && h.palm.distanceTo(it.center) < r) inside = true;
          if (inside && !it.inside[hi]) {
            if (it.kind !== 'fern' || h.speed > 0.12) this._fire(it, h);
          }
          it.inside[hi] = inside;
        });
      }
      if (it.kind === 'boop') {
        const x = it.spring.update(dt); it.flash *= Math.exp(-dt * 3.5);
        it.o.scale.set(it.base.x * (1 - x * 0.05), it.base.y * (1 + x * 0.1), it.base.z * (1 - x * 0.05));
        const k = 1 + it.flash * 2.4 + (it.invite || 0) * 0.7 + (this.highlight || 0); // a bright flash of light on each boop
        for (const m of it.o.userData.mats) if (m.userData.baseEmissive !== undefined) m.emissiveIntensity = m.userData.baseEmissive * k * (it.dim ?? 1);
      } else if (it.kind === 'fern') {
        const ax = it.sx.update(dt), az = it.sz.update(dt);
        it.o.rotation.set(it.rot.x + ax * 0.12, it.rot.y, it.rot.z + az * 0.12);
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
    const rc = new THREE.Raycaster(ray.origin, dir, 0, 40);
    if (!this.blockers) {
      const B = this.W.byName;
      this.blockers = ['Ground', 'Moss', 'Trees', 'Ferns', 'LoneMushrooms', 'GlowRocks'].map((n) => B[n]).filter(Boolean).concat(this.W.clusters);
    }
    const wall = rc.intersectObjects(this.blockers, true)[0];
    const limit = wall ? wall.distance : Infinity;
    let best = null, bd = limit;
    for (const it of this.items) {
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
    return best ? { key: best, size: best.radius * 2, point: best.center.clone(), fire: () => this._fire(best, null) } : null;
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
    it.colorTween = tweens.add(0.9, (k) => { it.tint.copy(from).lerp(to, k); for (const m of mats) { m.color.copy(it.tint); m.emissive.copy(it.tint).multiplyScalar(1.15); } });
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

  dimBoops(k) { for (const it of this.items) if (it.kind === 'boop') it.dim = k; }
}
