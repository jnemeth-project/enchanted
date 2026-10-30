// Groups the forest's mushroom clusters into sleep groups and puts them to sleep:
// caps dim and droop, fairy dust drifts down and fades, ribbons fade away.
import * as THREE from 'three';
import { tweens, setEmissiveScale, damp } from './util.js';

export class Sleep {
  constructor(W, groupCount = 12) {
    this.W = W;
    const items = W.clusters.map((o) => {
      const p = o.getWorldPosition(new THREE.Vector3());
      return { o, p, ang: Math.atan2(p.x, -p.z) }; // 0 = straight ahead, + = to the right
    }).sort((a, b) => a.ang - b.ang);
    const G = Math.min(groupCount, items.length);
    this.groups = [];
    for (let g = 0; g < G; g++) {
      const part = items.slice(Math.floor(g * items.length / G), Math.floor((g + 1) * items.length / G));
      const centroid = part.reduce((s, it) => s.add(it.p), new THREE.Vector3()).divideScalar(part.length);
      const meanAng = Math.atan2(centroid.x, -centroid.z);
      this.groups.push({ clusters: part.map((it) => it.o), dust: [], ribbons: [], centroid, ang: meanAng, asleep: false, sleeping: false });
    }
    const clusterGroup = new Map();
    this.groups.forEach((g, gi) => g.clusters.forEach((c) => clusterGroup.set(c, gi)));
    const nearest = (o) => {
      const p = o.getWorldPosition(new THREE.Vector3()); let best = null, bd = 1e9;
      for (const c of W.clusters) { const d = c.getWorldPosition(new THREE.Vector3()).distanceTo(p); if (d < bd) { bd = d; best = c; } }
      return clusterGroup.get(best);
    };
    for (const d of W.dust) this.groups[nearest(d)].dust.push(d);
    for (const r of W.ribbons) this.groups[nearest(r)].ribbons.push(r);
    // Glowdrops visit the front of the forest first, then the sides, then behind you.
    this.order = this.groups.map((g, i) => i).sort((a, b) => Math.abs(this.groups[a].ang) - Math.abs(this.groups[b].ang));
    this.asleepCount = 0; this.progress = 0; this.shown = 0;
  }

  // The visible "home" a glowdrop rises from: the group's cluster closest to the player.
  homeOf(gi) {
    const g = this.groups[gi]; let best = g.clusters[0], bd = 1e9;
    for (const c of g.clusters) { const d = c.getWorldPosition(new THREE.Vector3()).length(); if (d < bd) { bd = d; best = c; } }
    return best.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.1, 0));
  }

  putToSleep(gi) {
    const g = this.groups[gi]; if (g.asleep || g.sleeping) return;
    g.sleeping = true;
    g.clusters.forEach((c, i) => {
      const base = c.scale.y;
      if (c.userData.sy === undefined) c.userData.sy = base;
      tweens.add(4.5, (k) => { c.userData.lv = 1 - 0.86 * k; c.scale.y = base * (1 - 0.05 * k); }, { delay: i * 0.35 });
    });
    for (const d of g.dust) {
      if (d.userData.y0 === undefined) d.userData.y0 = d.position.y;
      const y0 = d.userData.y0;
      d.userData.twirlScale = 1;
      tweens.add(6, (k) => { d.userData.lv = 1 - k; d.position.y = y0 - 0.45 * k; d.userData.twirlScale = 1 - 0.85 * k; }, { delay: 0.6, done: () => { d.visible = false; } });
    }
    for (const r of g.ribbons) tweens.add(5, (k) => { r.userData.lv = 1 - k; }, { delay: 0.3, done: () => { r.visible = false; } });
    tweens.add(1, () => {}, { delay: 4.5, done: () => { g.asleep = true; g.sleeping = false; } });
    this.asleepCount++;
    this.progress = this.asleepCount / this.groups.length;
  }

  // the forest wakes again (after the tutorial, before your own night begins)
  wakeAll(dur = 3) {
    for (const g of this.groups) {
      for (const c of g.clusters) tweens.add(dur, (k) => { c.userData.lv = 0.14 + 0.86 * k; if (c.userData.sy !== undefined) c.scale.y = c.userData.sy; });
      for (const d of g.dust) { d.visible = true; d.userData.twirlScale = 1; if (d.userData.y0 !== undefined) d.position.y = d.userData.y0; tweens.add(dur, (k) => { d.userData.lv = k; }); }
      for (const r of g.ribbons) { r.visible = true; tweens.add(dur, (k) => { r.userData.lv = k; }); }
      g.asleep = false; g.sleeping = false;
    }
    this.asleepCount = 0; this.progress = 0;
  }

  allAsleep() { return this.asleepCount >= this.groups.length; }

  // Everything that is not a cluster dims with overall progress.
  // Quiet the whole forest's glow (0..1), e.g. so fireflies stand out clearly in front of you.
  quiet(level) { this.quietTarget = level; }

  update(dt) {
    this.shown = damp(this.shown, this.progress, 0.6, dt);
    this.q = damp(this.q ?? 1, this.quietTarget ?? 1, 1.0, dt);
    const q = this.q, qq = q * q; // sparkles and ribbons quiet down more than the mushrooms
    for (const g of this.groups) {
      for (const c of g.clusters) setEmissiveScale(c.userData.mats, (c.userData.lv ?? 1) * q);
      for (const d of g.dust) setEmissiveScale(d.userData.mats, (d.userData.lv ?? 1) * qq);
      for (const r of g.ribbons) setEmissiveScale(r.userData.mats, (r.userData.lv ?? 1) * qq);
    }
    const k = 1 - this.shown;
    const D = this.W.dim;
    const set = (name, lo) => { const o = D[name]; if (o) setEmissiveScale(o.userData.mats, (lo + (1 - lo) * k) * q); };
    set('LoneMushrooms', 0.2); set('Puffballs', 0.3); set('Crystals', 0.45); set('PuffballsFar', 0.3); set('GlowRocks', 0.4); set('Spores', 0.1);
  }
}
