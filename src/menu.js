// The way out and the settings, built into the forest: a small glowing magic door in the nearest big
// tree on your right (signed "Main menu"), and an old-shop hanging sign above it ("Options").
// Point at either and pinch (hands or controller), look at it (look to select) or click it.
// Options opens a little floating panel: volume, mute, swap game, close.
import * as THREE from 'three';
import { glowTexture, tweens } from './util.js';

const FONT = '"Iowan Old Style", "Palatino Linotype", Georgia, serif';

// the floating options panel: rows the player can touch or point at
// swapping goes round the three games
const NEXT_GAME = {
  fireflies: { key: 'count', title: 'Counting stars', sub: 'lie back and enjoy' },
  count: { key: 'shapes', title: 'Star pictures', sub: 'lie back and enjoy' },
  shapes: { key: 'fireflies', title: 'Firefly memory', sub: 'find the matching colours' },
};
const ROWS = [
  { key: 'vol', h: 1 }, { key: 'mute', h: 1 }, { key: 'swap', h: 1 }, { key: 'close', h: 1 },
];

export class Menu {
  constructor(scene, W, input, sound) {
    this.scene = scene; this.input = input; this.sound = sound;
    this.onMainMenu = null; this.onSwap = null; this.onVolume = null;
    this.volume = 0.8; this.muted = false; this.mode = null; this.open = false; this.hot = null; this.time = 0;
    // the door and the sign are modelled in Blender, built into the tree (TreeDoor, G_OptionsSign)
    this.door = W.byName.TreeDoor || null;
    this.sign = W.byName.G_OptionsSign || null;
    const glowMats = (o, names) => { const out = []; if (o) o.traverse((m) => { if (!m.isMesh) return; const arr = [].concat(m.material).map((mm) => { const c = mm.clone(); if (names.includes(mm.name)) { c.userData.base = c.emissiveIntensity; out.push(c); } return c; }); m.material = Array.isArray(m.material) ? arr : arr[0]; }); return out; };
    this.doorGlow = glowMats(this.door, ['DoorGlow', 'DoorVein', 'DoorLetters']);
    this.signGlow = glowMats(this.sign, ['SignLetters', 'DoorVein']);
    if (this.sign) {
      // it swings gently about its iron arm, which points out from the trunk
      const p = this.sign.position, arm = new THREE.Vector3(p.x - 4.43, 0, p.z + 8.27).normalize();
      this.swingAxis = arm; this.signQ = this.sign.quaternion.clone();
    }
    this._buildPanel();
  }

  _buildPanel() {
    this.panelC = document.createElement('canvas'); this.panelC.width = 768; this.panelC.height = 760;
    this.panelT = new THREE.CanvasTexture(this.panelC); this.panelT.colorSpace = THREE.SRGBColorSpace;
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.455), new THREE.MeshBasicMaterial({ map: this.panelT, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
    this.panel.renderOrder = 40; this.panel.visible = false; this.panel.scale.setScalar(1.6); this.scene.add(this.panel);
    this._drawPanel();
  }

  _rowAt(uv) { // which row (and which part of the volume row) a point on the panel is
    const y = (1 - uv.y) * 760;
    if (y < 120) return null;
    const i = Math.floor((y - 120) / 160); const row = ROWS[i];
    if (!row) return null;
    if (row.key === 'vol') return uv.x < 0.3 ? 'vol-' : uv.x > 0.7 ? 'vol+' : null;
    return row.key;
  }

  _drawPanel() {
    const g = this.panelC.getContext('2d'), W = 768, H = 760;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(14, 12, 28, 0.88)'; g.beginPath(); g.roundRect(8, 8, W - 16, H - 16, 40); g.fill();
    g.strokeStyle = 'rgba(190, 220, 255, 0.5)'; g.lineWidth = 3; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `64px ${FONT}`; g.fillStyle = '#f2eeff'; g.fillText('Options', W / 2, 70);
    const row = (i, text, key, sub) => {
      const y = 120 + i * 160;
      const hot = this.hot === key || (key === 'vol' && (this.hot === 'vol-' || this.hot === 'vol+'));
      g.fillStyle = hot ? 'rgba(160, 210, 255, 0.22)' : 'rgba(255, 255, 255, 0.07)';
      g.beginPath(); g.roundRect(40, y + 14, W - 80, 132, 28); g.fill();
      g.fillStyle = '#eef3ff'; g.font = `56px ${FONT}`; g.fillText(text, W / 2, y + 70 + (sub ? -14 : 0));
      if (sub) { g.font = `34px ${FONT}`; g.fillStyle = 'rgba(210, 222, 255, 0.75)'; g.fillText(sub, W / 2, y + 112); }
    };
    // volume: − and + at the ends, a row of soft dots in the middle
    { const y = 120;
      g.fillStyle = 'rgba(255, 255, 255, 0.07)'; g.beginPath(); g.roundRect(40, y + 14, W - 80, 132, 28); g.fill();
      for (const [k, x, s] of [['vol-', 120, '−'], ['vol+', W - 120, '+']]) {
        g.fillStyle = this.hot === k ? 'rgba(160, 210, 255, 0.35)' : 'rgba(255, 255, 255, 0.12)';
        g.beginPath(); g.arc(x, y + 80, 52, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = `80px ${FONT}`; g.fillText(s, x, y + 82);
      }
      const n = 8, lvl = this.muted ? 0 : Math.round(this.volume * n);
      for (let i = 0; i < n; i++) { g.fillStyle = i < lvl ? '#bfe3ff' : 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(W / 2 - 175 + i * 50, y + 80, 15, 0, Math.PI * 2); g.fill(); }
      g.font = `30px ${FONT}`; g.fillStyle = 'rgba(210, 222, 255, 0.75)'; g.fillText('Volume', W / 2, y + 128);
    }
    row(1, this.muted ? 'Sound on' : 'Mute', 'mute');
    const nx = NEXT_GAME[this.mode] || NEXT_GAME.fireflies;
    row(2, 'Swap to ' + nx.title, 'swap', nx.sub);
    row(3, 'Close', 'close');
    this.panelT.needsUpdate = true;
  }

  // ---------------------------------------------------------------- picking
  _hitObj(ray, obj) {
    const h = new THREE.Raycaster(ray.origin, ray.direction, 0, 40).intersectObject(obj, true)[0];
    return h || null;
  }

  pick(ray) {
    if (this.open) {
      const h = this._hitObj(ray, this.panel); if (!h) return null;
      const key = this._rowAt(h.uv); if (!key) return null;
      return { key: 'panel:' + key, size: 0.06, dwell: 2.2, point: h.point, fire: () => this.press(key) };
    }
    const d = this.door && this._hitObj(ray, this.door);
    if (d) return { key: 'door', size: 0.9, dwell: 3.2, point: d.point, fire: () => this.press('door') };
    const s = this.sign && this._hitObj(ray, this.sign);
    if (s) return { key: 'sign', size: 0.5, dwell: 2.6, point: s.point, fire: () => this.press('options') };
    return null;
  }

  press(key) {
    this.sound.boop(null, 196);
    if (key === 'door') { if (this.onMainMenu) this.onMainMenu(); return; }
    if (key === 'options') { this.show(true); return; }
    if (key === 'close') { this.show(false); return; }
    if (key === 'vol-' || key === 'vol+') { this.muted = false; this.volume = Math.max(0, Math.min(1, this.volume + (key === 'vol+' ? 0.125 : -0.125))); }
    if (key === 'mute') this.muted = !this.muted;
    if (key === 'vol-' || key === 'vol+' || key === 'mute') { if (this.onVolume) this.onVolume(this.muted ? 0 : this.volume, this.volume, this.muted); }
    if (key === 'swap') { this.show(false); if (this.onSwap) this.onSwap((NEXT_GAME[this.mode] || NEXT_GAME.fireflies).key); return; }
    this._drawPanel();
  }

  // the panel floats in front of you, wherever you are looking
  show(on, at = null, quat = null) {
    if (on) {
      this._drawPanel();
      if (this.getView) { const v = this.getView(); this.panel.position.copy(v.pos); this.panel.quaternion.copy(v.quat); }
      this.panel.visible = true; this.open = true;
      tweens.add(0.35, (k) => { this.panel.material.opacity = k; });
    } else {
      this.open = false;
      tweens.add(0.3, (k) => { this.panel.material.opacity = 1 - k; }, { done: () => { if (!this.open) this.panel.visible = false; } });
    }
  }

  update(dt, input) {
    this.time += dt;
    // what is a hand or controller pointing at? brighten it and show that hand's beam
    let hot = null;
    input.aim.forEach((a, i) => {
      if (!a) { input.setBeam(i, false); return; }
      const c = this.pick(a.ray); input.setBeam(i, !!c || !a.hand);
      if (c) hot = c.key;
    });
    // fingertips can press the panel directly too
    if (this.open) for (const h of input.hands) {
      if (!h.present) continue;
      const local = this.panel.worldToLocal(h.index.clone());
      const inside = Math.abs(local.x) < 0.23 && Math.abs(local.y) < 0.227 && Math.abs(local.z) < 0.02;
      if (inside) {
        const key = this._rowAt(new THREE.Vector2(local.x / 0.46 + 0.5, local.y / 0.455 + 0.5));
        if (key && !h._menuIn) this.press(key);
        h._menuIn = !!key;
      } else h._menuIn = false;
    }
    const pk = hot && hot.startsWith('panel:') ? hot.slice(6) : null;
    if (pk !== this.hot && this.open) { this.hot = pk; this._drawPanel(); }
    const doorHot = hot === 'door' ? 1 : 0, signHot = hot === 'sign' ? 1 : 0;
    this.dh = (this.dh || 0) + (doorHot - (this.dh || 0)) * Math.min(1, dt * 6);
    this.sh = (this.sh || 0) + (signHot - (this.sh || 0)) * Math.min(1, dt * 6);
    // a slow, warm breathing glow, brighter while you point at it
    const breathe = 0.9 + 0.1 * Math.sin(this.time * 1.3);
    for (const m of this.doorGlow) m.emissiveIntensity = m.userData.base * breathe * (1 + 1.2 * this.dh);
    for (const m of this.signGlow) m.emissiveIntensity = m.userData.base * breathe * (1 + 1.2 * this.sh);
    if (this.sign) {
      const q = new THREE.Quaternion().setFromAxisAngle(this.swingAxis, Math.sin(this.time * 0.9) * 0.05);
      this.sign.quaternion.copy(this.signQ).premultiply(q);
    }
  }
}
