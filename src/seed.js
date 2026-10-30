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

  get canGrow() { return (this.demo || this.multiGrow || !wateredTonight(this.state)) && this.state.stage < 3; }

  receiveWater(amount) {
    const glow = this.stageMats[this.state.stage];
    if (glow) for (const m of glow) { const b = m.emissiveIntensity; tweens.add(0.6, (k) => { m.emissiveIntensity = b * (1 + 0.6 * Math.sin(k * Math.PI)); }); }
    if (!this.canGrow) return;
    this.water += amount;
    if (this.water >= 0.6) this.grow();
  }

  grow() {
    this.water = 0;
    const st = this.state; st.stage = Math.min(3, st.stage + 1);
    if (!this.demo) { st.wateredNight = nightKey(); saveState(st); }
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

  // Picking up the bloom and placing it somewhere.
  update(dt, input) {
    this.time += dt;
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
    const hit = down.intersectObjects(this.W.grounds, true)[0];
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

  _spawnCollected(c, animate = false) {
    const bloom = this.stages[3]; if (!bloom) return;
    const o = bloom.clone(true); const mats = [];
    o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); mats.push(m.material); } });
    const col = this.colorOf(c.color); this._tint(mats, col);
    o.position.set(c.x, c.y, c.z); o.rotation.set(0, c.ry || 0, 0); o.visible = true;
    o.userData.mats = mats; for (const m of mats) m.userData.baseEmissive = m.emissiveIntensity;
    this.scene.add(o);
    const p = this.palette[c.color];
    this.collection.push({ o, mats, color: c.color, aurora: p && p.name === 'Aurora' });
    if (this.touch) this.touch.addBoop(o, 92, { keep: true });
    if (animate) { this.effects.sparkle(o.position, col.getHex(), 30, 0.2); const s = o.scale.clone(); o.scale.setScalar(0.6); tweens.add(0.6, (k) => o.scale.copy(s).multiplyScalar(0.6 + 0.4 * k)); }
  }
}
