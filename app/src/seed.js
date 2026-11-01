// The magic seed in the stump: watered once a night, it grows sprout -> young -> bloom.
// Its colour stays a mystery (pale silver while growing) until it blooms.
// A bloom can be picked up and placed anywhere; then a new seed appears.
import * as THREE from 'three';
import { tweens, weightedPick, parseJSON, glowTexture } from './util.js';
import { saveState, wateredTonight, nightKey } from './save.js';

const DEFAULT_PALETTE = [
  { name: 'Sky Blue', rgb: [0.56, 0.78, 1.0], weight: 20 }, { name: 'Lavender', rgb: [0.8, 0.66, 1.0], weight: 18 },
  { name: 'Peach', rgb: [1.0, 0.74, 0.58], weight: 16 }, { name: 'Butter', rgb: [1.0, 0.93, 0.6], weight: 14 },
  { name: 'Seafoam', rgb: [0.55, 1.0, 0.88], weight: 16 }, { name: 'Rose', rgb: [1.0, 0.62, 0.76], weight: 12 },
  { name: 'Moonlight', rgb: [0.94, 0.96, 1.0], weight: 3 }, { name: 'Aurora', rgb: [0.7, 0.85, 1.0], weight: 1 },
];
const SILVER = new THREE.Color(0.82, 0.86, 0.95);

export class Seed {
  constructor(scene, W, state, sound, effects, touch) {
    this.scene = scene; this.W = W; this.state = state; this.sound = sound; this.effects = effects; this.touch = touch;
    this.palette = parseJSON(W.magic.stump && W.magic.stump.userData.magic_palette, null) || DEFAULT_PALETTE;
    this.stages = W.magic.stages; this.dust = W.magic.dust;
    this.target = new THREE.Vector3(); if (W.magic.target) W.magic.target.getWorldPosition(this.target);
    this.water = 0; this.held = null; this.time = 0; this.collection = [];
    // Each stage gets its own tintable copy of the magic material.
    this.stageMats = this.stages.map((o) => { const mats = []; if (o) o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); mats.push(m.material); } }); return mats; });
    this.bloomHome = this.stages[3] ? this.stages[3].position.clone() : new THREE.Vector3();
    this.bloomQuat = this.stages[3] ? this.stages[3].quaternion.clone() : new THREE.Quaternion();
    if (state.color === null || state.color === undefined) state.color = weightedPick(this.palette);
    for (const c of state.collection) this._spawnCollected(c);
    this.show(state.stage, false);
    this.invite = false;
    for (const mats of this.stageMats) for (const m of mats) m.userData.baseE = m.emissiveIntensity;
    this.onGrow = null;
    // the glow in the pot when it is watered
    this.potGlow = 0;
    this.glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xcfe8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glowSprite.position.copy(this.target).add(new THREE.Vector3(0, 0.03, 0)); this.glowSprite.scale.setScalar(0.45); this.glowSprite.renderOrder = 6; scene.add(this.glowSprite);
  }

  colorOf(i, t = 0) {
    const p = this.palette[i] || this.palette[0];
    const c = new THREE.Color(...p.rgb);
    if (p.name === 'Aurora') c.setHSL((t * 0.03) % 1, 0.65, 0.72);
    return c;
  }

  _tint(mats, color) { for (const m of mats) { m.color.copy(color); m.emissive.copy(color).multiplyScalar(0.55); } }

  show(stage, animate = true) {
    this.stages.forEach((o, i) => {
      if (!o) return;
      const on = i === stage;
      if (on) {
        o.visible = true;
        this._tint(this.stageMats[i], i === 3 ? this.colorOf(this.state.color, this.time) : SILVER);
        if (i === 0) this._tint(this.stageMats[0], new THREE.Color(0.62, 0.82, 1.0));
        if (animate) { const s = o.scale.clone(); o.scale.setScalar(0.001); tweens.add(2.2, (k) => o.scale.copy(s).multiplyScalar(Math.max(0.001, k))); }
      } else if (o.visible && animate) {
        const s = o.scale.clone(); tweens.add(0.8, (k) => o.scale.copy(s).multiplyScalar(1 - k * 0.999), { done: () => { o.visible = false; o.scale.copy(s); } });
      } else o.visible = false;
    });
    if (this.dust) this.dust.visible = stage === 3;
  }

  get canGrow() { return (this.demo || this.multiGrow || !this.grewThisSession) && this.state.stage < 3; } // one watering per session

  receiveWater(amount) {
    // every drop that reaches the pot: the soil lights up with a soft glow straight away, so you can see it working
    // (water arrives every frame while you pour: the pulse and sparkle come a few times a second, not every frame)
    if ((this.potGlow || 0) < 0.55) {
      const glow = this.stageMats[this.state.stage];
      if (glow) for (const m of glow) { const b = m.userData.baseE ?? m.emissiveIntensity; tweens.add(0.6, (k) => { m.emissiveIntensity = b * (1 + 1.5 * Math.sin(k * Math.PI)); }); }
      if (this.effects) this.effects.sparkle(this.target.clone(), 0xcfe4ff, 6, 0.06);
    }
    this.potGlow = Math.min(1, (this.potGlow || 0) + 0.7);
    if (!this.canGrow) return;
    this.water += amount;
    // and the mushroom answers at once: the first pour makes it grow (no need to fill it up first)
    if (this.water >= 0.15) this.grow();
  }

  grow() {
    this.water = 0;
    const st = this.state; st.stage = Math.min(3, st.stage + 1);
    if (!this.demo) { st.wateredNight = nightKey(); saveState(st); this.grewThisSession = true; }
    const big = st.stage === 3;
    this.sound.grow(this.target, big);
    this.effects.sparkle(this.target, big ? this.colorOf(st.color).getHex() : 0xcfe4ff, big ? 70 : 40, big ? 0.3 : 0.2);
    this.show(st.stage, true);
    if (big) { // colour reveal: silver warms into tonight's mystery colour
      const mats = this.stageMats[3], to = this.colorOf(st.color);
      this._tint(mats, SILVER);
      tweens.add(3.5, (k) => this._tint(mats, SILVER.clone().lerp(to, k)), { delay: 1.2 });
    }
    if (this.onGrow) this.onGrow(st.stage);
  }

  // A brand-new seed pushes up its first little sprout on its own, so there is something growing from the start
  // (it does not use up tonight's watering: the rain at the end still makes it grow)
  sprout() {
    if (this.state.stage !== 0) return;
    this.state.stage = 1; saveState(this.state);
    this.sound.grow(this.target, false);
    this.effects.sparkle(this.target, 0xcfe4ff, 34, 0.18);
    this.show(1, true);
  }

  // Picking up the bloom and placing it somewhere.
  update(dt, input) {
    this.time += dt;
    this.potGlow = Math.max(0, this.potGlow - dt * 0.6);
    this.glowSprite.material.opacity = Math.min(0.95, this.potGlow * (0.85 + 0.15 * Math.sin(this.time * 6)));
    this.glowSprite.scale.setScalar(0.3 + 0.25 * this.potGlow);
    if (this.invite && this.canGrow) { // the seed glows softly in and out while it waits for water
      const k = 1 + 0.9 * (0.5 + 0.5 * Math.sin(this.time * 1.5));
      for (const m of this.stageMats[this.state.stage] || []) m.emissiveIntensity = m.userData.baseE * k;
    }
    const bloom = this.stages[3];
    if (this.palette[this.state.color] && this.palette[this.state.color].name === 'Aurora' && bloom && bloom.visible) this._tint(this.stageMats[3], this.colorOf(this.state.color, this.time));
    for (const c of this.collection) if (c.aurora) this._tint(c.mats, this.colorOf(c.color, this.time));
    if (this.state.stage !== 3 || !bloom) return;
    const centre = bloom.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.15, 0));
    if (!this.held) {
      for (const h of input.hands) {
        if (!h.present) continue;
        const near = h.pinchPoint.distanceTo(centre) < 0.12;
        if ((h.pinchStarted && near) || h.countInside(centre, 0.12) >= 3) {
          this.held = { hand: h, offset: bloom.position.clone().sub(h.pinchPoint) };
          this.sound.boop(centre, 92);
          break;
        }
      }
    } else {
      const h = this.held.hand;
      if (h.present) bloom.position.copy(h.pinchPoint).add(this.held.offset);
      const released = !h.present || (!h.pinching && h.countInside(centre, 0.12) < 3);
      if (released) this._place(bloom.position.clone());
    }
  }

  pick(ray) {
    const bloom = this.stages[3];
    if (this.state.stage !== 3 || !bloom) return null;
    if (this.desktopHeld) { // second select: put it down where you are pointing on the ground
      const hit = this._groundHit(ray);
      return hit ? { key: 'place', size: 0.2, point: hit, fire: () => { this._place(hit); this.desktopHeld = false; } } : null;
    }
    const c = bloom.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.15, 0));
    if (ray.distanceToPoint(c) < 0.15) return { key: 'bloom', size: 0.3, point: c, fire: () => { this.desktopHeld = true; this.sound.boop(c, 92); } };
    return null;
  }

  _groundHit(ray) {
    const rc = new THREE.Raycaster(ray.origin, ray.direction, 0, 30);
    const hit = rc.intersectObjects(this.W.grounds, true)[0];
    return hit ? hit.point : null;
  }

  // where the grown mushroom's cap top is, for the butterfly to hold
  bloomTop() { const b = this.stages[3]; const box = new THREE.Box3().setFromObject(b); return new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2); }

  _place(p) {
    const bloom = this.stages[3]; this.held = null;
    if (p.distanceTo(this.bloomHome) < 0.15) { bloom.position.copy(this.bloomHome); return; } // put back on the stump
    const down = new THREE.Raycaster(p.clone().add(new THREE.Vector3(0, 1.5, 0)), new THREE.Vector3(0, -1, 0), 0, 6);
    // never right where you sit (or in the dirt in front of you): it is nudged out to the edge of your space
    const flat = Math.hypot(p.x, p.z);
    if (flat < 0.8) { const k = (flat > 0.05 ? 0.92 / flat : 1); p.x = flat > 0.05 ? p.x * k : 0.9; p.z = flat > 0.05 ? p.z * k : 0.55; }
    down.set(p.clone().add(new THREE.Vector3(0, 1.5, 0)), new THREE.Vector3(0, -1, 0)); const hit = down.intersectObjects(this.W.grounds, true)[0];
    if (hit) p.y = hit.point.y - 0.02;
    const entry = { color: this.state.color, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), ry: Math.random() * 6.28 };
    this.state.collection.push(entry);
    this._spawnCollected(entry, true);
    bloom.position.copy(this.bloomHome); bloom.quaternion.copy(this.bloomQuat);
    // a new mystery seed appears; it can be watered from the next night
    this.state.stage = 0; this.state.color = weightedPick(this.palette);
    if (!this.demo) saveState(this.state);
    this.show(0, true);
    if (this.onPlace) this.onPlace(new THREE.Vector3(entry.x, entry.y, entry.z));
  }

  // moves the spot c (x, z) out of anything it would grow into; returns true if it moved
  _clear(c, bloom) {
    const W = this.W, b = new THREE.Box3(), sz = new THREE.Vector3(), ctr = new THREE.Vector3();
    b.setFromObject(bloom); b.getSize(sz); const r = Math.max(sz.x, sz.z) * 0.5;
    const objs = new Set([...(this.touch ? this.touch.items.map((it) => it.o) : []), ...(W.bubbles || []), ...(W.crystals || []), ...(W.reachRocks || []), ...this.collection.map((e) => e.o)]);
    const obs = [];
    for (const o of objs) {
      if (!o || o === bloom) continue;
      b.setFromObject(o); if (b.isEmpty()) continue; b.getCenter(ctr); b.getSize(sz);
      const ro = Math.max(sz.x, sz.z) * 0.5; if (ro > 1.2 || Math.hypot(ctr.x - c.x, ctr.z - c.z) > 2.5) continue;
      obs.push([ctr.x, ctr.z, ro]);
    }
    // the nearest free spot to where it was set down (searching outwards in rings), never under you or where the sleepy mushrooms' mound rises
    const free = (x, z) => Math.hypot(x, z) >= 0.85 && Math.hypot(x / (0.62 + r), (z + 0.55) / (0.47 + r)) >= 1 && obs.every(([ox, oz, ro]) => Math.hypot(x - ox, z - oz) >= r + ro + 0.04);
    let moved = false;
    if (!free(c.x, c.z)) {
      search: for (let d = 0.05; d <= 1.5; d += 0.05) {
        const n = Math.max(8, Math.round(d * 40));
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
          if (free(x, z)) { c.x = x; c.z = z; moved = true; break search; }
        }
      }
    }
    if (moved) { c.x = +c.x.toFixed(3); c.z = +c.z.toFixed(3); }
    return moved;
  }

  _spawnCollected(c, animate = false) {
    const bloom = this.stages[3]; if (!bloom) return;
    // mushrooms grown in earlier nights that were set down too close (under you, or in the dirt in front): move them out
    const flat = Math.hypot(c.x, c.z);
    if (flat < 0.8) {
      const k = flat > 0.05 ? 0.92 / flat : 1; c.x = flat > 0.05 ? +(c.x * k).toFixed(3) : 0.9; c.z = flat > 0.05 ? +(c.z * k).toFixed(3) : 0.55;
      const rc = new THREE.Raycaster(new THREE.Vector3(c.x, 1.5, c.z), new THREE.Vector3(0, -1, 0), 0, 6); const h = rc.intersectObjects(this.W.grounds, true)[0];
      if (h) c.y = +(h.point.y - 0.02).toFixed(3);
      if (!this.demo) saveState(this.state);
    }
    // never grown into another mushroom, crystal or rock: if it overlaps one, it steps aside until it is clear
    if (this._clear(c, bloom)) {
      const rc = new THREE.Raycaster(new THREE.Vector3(c.x, 1.5, c.z), new THREE.Vector3(0, -1, 0), 0, 6); const h = rc.intersectObjects(this.W.grounds, true)[0];
      if (h) c.y = +(h.point.y - 0.02).toFixed(3);
      if (!this.demo) saveState(this.state);
    }
    const o = bloom.clone(true); const mats = [];
    o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); mats.push(m.material); } });
    const col = this.colorOf(c.color); this._tint(mats, col);
    o.position.set(c.x, c.y, c.z); o.rotation.set(0, c.ry || 0, 0); o.visible = true;
    o.userData.mats = mats; for (const m of mats) m.userData.baseEmissive = m.emissiveIntensity;
    this.scene.add(o);
    const p = this.palette[c.color];
    this.collection.push({ o, mats, color: c.color, aurora: p && p.name === 'Aurora' });
    if (this.touch) this.touch.addBoop(o, this.touch.constructor.note(this.touch.nextNote++ || 0), { keep: true });
    if (animate) { this.effects.sparkle(o.position, col.getHex(), 30, 0.2); const s = o.scale.clone(); o.scale.setScalar(0.6); tweens.add(0.6, (k) => o.scale.copy(s).multiplyScalar(0.6 + 0.4 * k)); }
  }
}
