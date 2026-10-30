// The way out and the settings, built into the forest: a small glowing magic door in the nearest big
// tree on your right (signed "Main menu"), and an old-shop hanging sign above it ("Options").
// Point at either and pinch (hands or controller), look at it (look to select) or click it.
// Options opens a little floating panel: volume, mute, swap game, close.
import * as THREE from 'three';
import { glowTexture, tweens } from './util.js';

const FONT = '"Iowan Old Style", "Palatino Linotype", Georgia, serif';
const TREE_AT = new THREE.Vector3(4.43, 0.6, -8.27);   // the big trunk front-right of the seat

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function doorTexture() {
  return canvasTex(512, 900, (g, W, H) => {
    const top = 210, x0 = 70, x1 = W - 70, cx = W / 2, r = (x1 - x0) / 2;
    const arch = new Path2D(); arch.moveTo(x0, H - 20); arch.lineTo(x0, top + r); arch.arc(cx, top + r, r, Math.PI, 0); arch.lineTo(x1, H - 20); arch.closePath();
    // warm light spilling round the frame
    g.save(); g.shadowColor = 'rgba(255, 200, 120, 1)'; g.shadowBlur = 60; g.strokeStyle = 'rgba(255, 214, 150, 0.95)'; g.lineWidth = 16; g.stroke(arch); g.restore();
    // planks
    g.save(); g.clip(arch);
    const wood = g.createLinearGradient(0, top, 0, H); wood.addColorStop(0, '#6b4628'); wood.addColorStop(1, '#3d2615');
    g.fillStyle = wood; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(25, 14, 6, 0.8)'; g.lineWidth = 6;
    for (let x = x0 + 62; x < x1; x += 62) { g.beginPath(); g.moveTo(x, top - 20); g.lineTo(x, H); g.stroke(); }
    g.strokeStyle = 'rgba(30, 18, 8, 0.9)'; g.lineWidth = 18;
    for (const y of [top + r + 60, H - 160]) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
    g.restore();
    // frame
    g.strokeStyle = '#2a1a0c'; g.lineWidth = 22; g.stroke(arch);
    g.save(); g.shadowColor = 'rgba(255, 210, 140, 1)'; g.shadowBlur = 24; g.strokeStyle = 'rgba(255, 226, 170, 0.9)'; g.lineWidth = 5; g.stroke(arch); g.restore();
    // round knob and a glowing keyhole
    g.save(); g.shadowColor = 'rgba(255, 220, 150, 1)'; g.shadowBlur = 20; g.fillStyle = '#f2c46b';
    g.beginPath(); g.arc(x1 - 60, H - 330, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffe7a8'; g.beginPath(); g.arc(x1 - 60, H - 280, 7, 0, Math.PI * 2); g.fill(); g.fillRect(x1 - 63, H - 280, 6, 22); g.restore();
    // the words on the top of the frame
    g.fillStyle = '#2a1a0c'; g.beginPath(); g.roundRect(40, 30, W - 80, 120, 26); g.fill();
    g.save(); g.shadowColor = 'rgba(255, 210, 140, 1)'; g.shadowBlur = 18; g.strokeStyle = 'rgba(255, 220, 160, 0.9)'; g.lineWidth = 4; g.beginPath(); g.roundRect(40, 30, W - 80, 120, 26); g.stroke(); g.restore();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `82px ${FONT}`;
    g.save(); g.shadowColor = 'rgba(255, 220, 150, 1)'; g.shadowBlur = 26; g.fillStyle = '#fff2d6'; g.fillText('Main menu', cx, 92); g.restore();
  });
}

function signTexture() {
  return canvasTex(512, 300, (g, W, H) => {
    g.fillStyle = '#4a3019'; g.beginPath(); g.roundRect(14, 40, W - 28, H - 54, 30); g.fill();
    g.strokeStyle = '#26170a'; g.lineWidth = 10; g.stroke();
    g.save(); g.shadowColor = 'rgba(160, 230, 255, 1)'; g.shadowBlur = 24; g.strokeStyle = 'rgba(190, 236, 255, 0.85)'; g.lineWidth = 4;
    g.beginPath(); g.roundRect(30, 56, W - 60, H - 86, 22); g.stroke(); g.restore();
    // rings it hangs from
    g.strokeStyle = '#c9a25a'; g.lineWidth = 7; for (const x of [110, W - 110]) { g.beginPath(); g.arc(x, 30, 18, 0, Math.PI * 2); g.stroke(); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `96px ${FONT}`;
    g.save(); g.shadowColor = 'rgba(170, 230, 255, 1)'; g.shadowBlur = 26; g.fillStyle = '#eefaff'; g.fillText('Options', W / 2, 168); g.restore();
  });
}

// the floating options panel: rows the player can touch or point at
const ROWS = [
  { key: 'vol', h: 1 }, { key: 'mute', h: 1 }, { key: 'swap', h: 1 }, { key: 'close', h: 1 },
];

export class Menu {
  constructor(scene, W, input, sound) {
    this.scene = scene; this.input = input; this.sound = sound;
    this.onMainMenu = null; this.onSwap = null; this.onVolume = null;
    this.volume = 0.8; this.muted = false; this.mode = null; this.open = false; this.hot = null; this.time = 0;
    this.root = new THREE.Group(); scene.add(this.root);
    this._placeOnTree(W);
    this._buildPanel();
  }

  _placeOnTree(W) {
    // find the trunk's surface facing the seat, at about a metre up
    const trees = W.byName.Trees, from = new THREE.Vector3(0, 1.0, 0);
    const dir = TREE_AT.clone().sub(from).normalize();
    const hit = trees && new THREE.Raycaster(from, dir, 0, 30).intersectObject(trees, true)[0];
    const at = hit ? hit.point.clone() : TREE_AT.clone();
    const toSeat = new THREE.Vector3(-at.x, 0, -at.z).normalize();
    // ground under the door
    const down = new THREE.Raycaster(at.clone().add(new THREE.Vector3(0, 3, 0)), new THREE.Vector3(0, -1, 0), 0, 10);
    const g = down.intersectObjects(W.grounds, true)[0];
    const groundY = g ? g.point.y : at.y - 1;
    const base = at.clone().addScaledVector(toSeat, 0.06); base.y = groundY;
    this.facing = Math.atan2(toSeat.x, toSeat.z);

    // the door: 1.5 m wide, 2.65 m tall (glowing frame, planks, knob, "Main menu" on the frame)
    const dW = 1.5, dH = 2.65;
    this.door = new THREE.Mesh(new THREE.PlaneGeometry(dW, dH), new THREE.MeshBasicMaterial({ map: doorTexture(), transparent: true, fog: false, toneMapped: false, depthWrite: false }));
    this.door.position.copy(base).add(new THREE.Vector3(0, dH / 2 - 0.02, 0));
    this.door.rotation.y = this.facing; this.door.renderOrder = 2;
    this.doorGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc782, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.doorGlow.scale.set(3.6, 4.4, 1); this.doorGlow.position.copy(this.door.position).addScaledVector(toSeat, 0.05);
    this.root.add(this.doorGlow, this.door);

    // the hanging sign: an iron bracket out to the side, a board swinging gently beneath it
    const side = new THREE.Vector3(toSeat.z, 0, -toSeat.x); // along the trunk's face, to the right as you look at it
    this.signPivot = new THREE.Group();
    this.signPivot.position.copy(base).add(new THREE.Vector3(0, dH + 0.85, 0)).addScaledVector(side, 0.8).addScaledVector(toSeat, 0.12);
    this.signPivot.rotation.y = this.facing;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x2b2118, fog: false }));
    bar.position.set(-0.3, 0, 0); this.signPivot.add(bar);
    this.swing = new THREE.Group(); this.signPivot.add(this.swing);
    this.sign = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.67), new THREE.MeshBasicMaterial({ map: signTexture(), transparent: true, fog: false, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }));
    this.sign.position.set(0.02, -0.36, 0); this.sign.renderOrder = 2; this.swing.add(this.sign);
    this.signGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x9fdcff, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.signGlow.scale.set(2.2, 1.5, 1); this.signGlow.position.set(0.02, -0.36, -0.03); this.swing.add(this.signGlow);
    this.root.add(this.signPivot);
  }

  _buildPanel() {
    this.panelC = document.createElement('canvas'); this.panelC.width = 768; this.panelC.height = 760;
    this.panelT = new THREE.CanvasTexture(this.panelC); this.panelT.colorSpace = THREE.SRGBColorSpace;
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.455), new THREE.MeshBasicMaterial({ map: this.panelT, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
    this.panel.renderOrder = 40; this.panel.visible = false; this.scene.add(this.panel);
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
    row(2, this.mode === 'stars' ? 'Swap to Firefly memory' : 'Swap to Stargazing', 'swap', this.mode === 'stars' ? 'find the matching colours' : 'lie back and enjoy');
    row(3, 'Close', 'close');
    this.panelT.needsUpdate = true;
  }

  // ---------------------------------------------------------------- picking
  _hitObj(ray, obj) {
    const h = new THREE.Raycaster(ray.origin, ray.direction, 0, 40).intersectObject(obj, false)[0];
    return h || null;
  }

  pick(ray) {
    if (this.open) {
      const h = this._hitObj(ray, this.panel); if (!h) return null;
      const key = this._rowAt(h.uv); if (!key) return null;
      return { key: 'panel:' + key, size: 0.06, point: h.point, fire: () => this.press(key) };
    }
    const d = this._hitObj(ray, this.door);
    if (d) return { key: 'door', size: 0.9, point: d.point, fire: () => this.press('door') };
    const s = this._hitObj(ray, this.sign);
    if (s) return { key: 'sign', size: 0.5, point: s.point, fire: () => this.press('options') };
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
    if (key === 'swap') { this.show(false); if (this.onSwap) this.onSwap(this.mode === 'stars' ? 'fireflies' : 'stars'); return; }
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
    this.doorGlow.material.opacity = 0.42 + 0.1 * Math.sin(this.time * 1.3) + 0.35 * doorHot;
    this.signGlow.material.opacity = 0.32 + 0.08 * Math.sin(this.time * 1.1 + 1) + 0.35 * signHot;
    this.swing.rotation.x = Math.sin(this.time * 0.9) * 0.06;  // the sign sways a little in the night air
    this.door.scale.setScalar(1 + 0.03 * doorHot); this.sign.scale.setScalar(1 + 0.06 * signHot);
  }
}
