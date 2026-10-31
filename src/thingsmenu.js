// "Things to do": a little wooden menu on the top shelf of the white tree. Nothing to play is ever pushed at
// you: the night starts with just the forest, and the games wait here until you go and look.
// Touch the menu, point at it and pinch, or look at it for a moment, and a small card unfolds beside the tree
// with three pictures. Choose one and a single line says what it is, with a Start button under it. While a
// game is running its button says Stop, which takes you back to simply sitting in the forest.
import * as THREE from 'three';
import { glowTexture, tweens } from './util.js';

const FONT = '"Iowan Old Style", "Palatino Linotype", Georgia, serif';
const GAMES = [
  { key: 'fireflies', name: 'Fireflies', line: 'Find the fireflies that match' },
  { key: 'count', name: 'Counting stars', line: 'Lie back and count the stars' },
  { key: 'shapes', name: 'Star pictures', line: 'Join the stars into a picture' },
  { key: 'sleepy', name: 'Sleepy mushrooms', line: 'Tap them in the order they glow' },
];
const CW = 1024, CH = 720, PW = 0.3, PH = PW * CH / CW;

function icon(g, k, x, y, s, col) {
  g.save(); g.translate(x, y); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = s * 0.06; g.lineCap = 'round'; g.shadowColor = 'rgba(255, 200, 120, 0.9)'; g.shadowBlur = s * 0.25;
  if (k === 'fireflies') {
    g.beginPath(); g.arc(0, s * 0.12, s * 0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(0, -s * 0.14, s * 0.1, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.7; g.beginPath(); g.ellipse(-s * 0.26, -s * 0.12, s * 0.22, s * 0.1, -0.5, 0, Math.PI * 2); g.ellipse(s * 0.26, -s * 0.12, s * 0.22, s * 0.1, 0.5, 0, Math.PI * 2); g.fill();
  } else if (k === 'count') {
    g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.16 : s * 0.38, a = i * Math.PI / 5; g.lineTo(Math.sin(a) * r, -Math.cos(a) * r); } g.closePath(); g.fill();
  } else if (k === 'sleepy') {
    // a little mushroom with closed sleepy eyes
    g.beginPath(); g.ellipse(0, -s * 0.08, s * 0.4, s * 0.24, 0, Math.PI, 0); g.closePath(); g.fill();
    g.fillRect(-s * 0.1, -s * 0.08, s * 0.2, s * 0.38);
    g.strokeStyle = 'rgba(40, 24, 10, 0.9)'; g.lineWidth = s * 0.035; g.shadowBlur = 0;
    for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * s * 0.045, s * 0.1, s * 0.03, 0.2, Math.PI - 0.2); g.stroke(); }
  } else {
    const p = [[-0.36, 0.22], [-0.12, -0.2], [0.14, 0.08], [0.36, -0.28]];
    g.beginPath(); p.forEach(([a, b], i) => (i ? g.lineTo(a * s, b * s) : g.moveTo(a * s, b * s))); g.stroke();
    for (const [a, b] of p) { g.beginPath(); g.arc(a * s, b * s, s * 0.07, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
}

export class ThingsMenu {
  constructor(scene, W, sound, effects) {
    this.sound = sound; this.effects = effects; this.board = W.byName.G_MenuBoard || null;
    this.open = false; this.k = 0; this.sel = null; this.hot = null; this.mode = null; this.away = 0;
    this.onStart = null; this.onStop = null; this.onOpen = null;
    this.canvas = document.createElement('canvas'); this.canvas.width = CW; this.canvas.height = CH;
    this.g = this.canvas.getContext('2d'); this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.card = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.card.renderOrder = 30; this.card.visible = false; scene.add(this.card);
    // a soft golden glow around the little board on the shelf, breathing very slowly: a quiet "something is here"
    if (this.board) {
      const bb = new THREE.Box3().setFromObject(this.board); this.boardC = bb.getCenter(new THREE.Vector3()); this.boardR = bb.getSize(new THREE.Vector3()).length() / 2;
      this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc46a, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.halo.position.copy(this.boardC); this.halo.scale.setScalar(0.32); scene.add(this.halo);
    }
    this.inside = [false, false]; this.cardIn = [null, null]; this.ray = new THREE.Raycaster();
    this._draw();
  }

  // ---------------------------------------------------------------- the card
  _rects() {
    // three pictures across the top, the line and the button below
    const items = GAMES.map((gm, i) => ({ key: gm.key, x: 28 + i * 244, y: 90, w: 236, h: 300 }));
    const button = { key: 'go', x: CW / 2 - 170, y: 520, w: 340, h: 130 };
    return { items, button };
  }

  _draw() {
    const g = this.g, { items, button } = this._rects();
    g.clearRect(0, 0, CW, CH);
    g.fillStyle = 'rgba(16, 12, 10, 0.86)'; g.beginPath(); g.roundRect(6, 6, CW - 12, CH - 12, 44); g.fill();
    g.strokeStyle = 'rgba(255, 205, 130, 0.55)'; g.lineWidth = 4; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `52px ${FONT}`; g.fillStyle = 'rgba(255, 228, 180, 0.95)'; g.fillText('Things to do', CW / 2, 52);
    for (const r of items) {
      const gm = GAMES.find((x) => x.key === r.key), on = this.sel === r.key, hot = this.hot === r.key, running = this.mode === r.key;
      g.fillStyle = on ? 'rgba(255, 205, 130, 0.22)' : hot ? 'rgba(255, 205, 130, 0.12)' : 'rgba(255, 255, 255, 0.05)';
      g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 30); g.fill();
      if (on) { g.strokeStyle = 'rgba(255, 215, 150, 0.8)'; g.lineWidth = 4; g.stroke(); }
      icon(g, r.key, r.x + r.w / 2, r.y + 112, 130, running ? '#fff1c8' : '#ffd38a');
      g.font = `36px ${FONT}`; g.fillStyle = "#fbefd8"; const nm = gm.name.split(" "); if (nm.length > 1 && g.measureText(gm.name).width > r.w - 16) { g.fillText(nm[0], r.x + r.w / 2, r.y + 232); g.fillText(nm.slice(1).join(" "), r.x + r.w / 2, r.y + 270); } else g.fillText(gm.name, r.x + r.w / 2, r.y + 250);
      if (running) { g.font = `30px ${FONT}`; g.fillStyle = 'rgba(255, 220, 160, 0.85)'; g.fillText('playing now', r.x + r.w / 2, r.y + 26); }
    }
    const gm = GAMES.find((x) => x.key === this.sel);
    if (gm) {
      g.font = `52px ${FONT}`; g.fillStyle = 'rgba(245, 235, 220, 0.92)'; g.fillText(gm.line, CW / 2, 450);
      const stop = this.mode === gm.key, hot = this.hot === 'go';
      g.fillStyle = hot ? 'rgba(255, 205, 130, 0.45)' : 'rgba(255, 205, 130, 0.25)';
      g.beginPath(); g.roundRect(button.x, button.y, button.w, button.h, 60); g.fill();
      g.strokeStyle = 'rgba(255, 215, 150, 0.85)'; g.lineWidth = 4; g.stroke();
      g.font = `60px ${FONT}`; g.fillStyle = '#fff6e6'; g.fillText(stop ? 'Stop' : 'Start', CW / 2, button.y + button.h / 2 + 2);
    } else {
      g.font = `40px ${FONT}`; g.fillStyle = 'rgba(245, 235, 220, 0.6)'; g.fillText(this.mode ? 'Choose the game to stop it' : 'Choose one to see what it is', CW / 2, 470);
    }
    this.tex.needsUpdate = true;
  }

  _at(uv) {
    const x = uv.x * CW, y = (1 - uv.y) * CH, { items, button } = this._rects();
    for (const r of items) if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return r.key;
    if (this.sel && x > button.x && x < button.x + button.w && y > button.y && y < button.y + button.h) return 'go';
    return null;
  }

  // ---------------------------------------------------------------- opening and closing
  toggle(eye) { if (this.open) this.close(); else this.show(eye); }
  show(eye) {
    if (!this.board || this.open) return;
    this.open = true; this.away = 0; this.sel = this.mode || null; this._draw();
    // the card unfolds just in front of the tree, a little toward you and at a comfortable height, facing you
    const c = this.boardC.clone(), e = eye ? eye.clone() : new THREE.Vector3(0, 0.82, 0);
    const toEye = e.clone().sub(c); toEye.y = 0; toEye.normalize();
    const side = new THREE.Vector3(-toEye.z, 0, toEye.x); // toward the front of you
    const p = c.clone().addScaledVector(toEye, 0.12).addScaledVector(side, side.z < 0 ? 0.16 : -0.16); p.y = Math.max(e.y - 0.02, Math.min(c.y - 0.04, e.y + 0.18));
    this.card.position.copy(p); this.card.lookAt(e);
    this.card.visible = true; const from = this.k; tweens.add(0.5, (k) => { this.k = from + (1 - from) * k; });
    this.sound.boop(c, 293.66);
    if (this.effects) this.effects.sparkle(c, 0xffd38a, 14, 0.1);
    if (this.onOpen) this.onOpen();
  }
  close() {
    if (!this.open) return; this.open = false; this.hot = null;
    const from = this.k; tweens.add(0.45, (k) => { this.k = from * (1 - k); }, { done: () => { if (!this.open) this.card.visible = false; } });
  }

  setMode(m) { this.mode = m || null; if (this.open) this._draw(); }

  _press(key) {
    if (!key) return;
    if (key === 'go') {
      const k = this.sel; if (!k) return;
      this.sound.boop(this.card.position, 392);
      if (this.mode === k) { if (this.onStop) this.onStop(); } else if (this.onStart) this.onStart(k);
      this.close(); return;
    }
    this.sel = key; this.sound.boop(this.card.position, 246.94); this._draw();
  }

  // ---------------------------------------------------------------- choosing: look, point and pinch, or touch
  _cardHit(ray) {
    if (!this.open || this.k < 0.6) return null;
    this.ray.set(ray.origin, ray.direction); const h = this.ray.intersectObject(this.card)[0];
    return h ? { key: this._at(h.uv), point: h.point } : null;
  }
  _boardHit(ray) {
    if (!this.board) return null;
    const d = ray.distanceToPoint(this.boardC); if (d > this.boardR * 1.1) return null;
    const t = this.boardC.clone().sub(ray.origin).dot(ray.direction); return t > 0 ? this.boardC.clone() : null;
  }
  pick(ray) {
    const c = this._cardHit(ray);
    if (c && c.key) return c.key === 'go'
      ? { key: 'things:go:' + this.sel, size: 0.05, dwell: 1.2, confirm: true, gazeNear: true, point: c.point, fire: () => this._press('go') }
      : { key: 'things:' + c.key, size: 0.06, dwell: 0.9, gazeNear: true, point: c.point, fire: () => this._press(c.key) };
    if (c) return null;
    const b = !this.open && this._boardHit(ray);
    if (b) return { key: 'things:board', size: 0.14, dwell: 1.2, gazeNear: true, point: b, fire: () => this.show(this.eye) };
    return null;
  }

  update(dt, input, time, look) {
    const eye = look ? look.origin : null; this.eye = eye; this.eyeDir = look ? look.direction : null;
    if (this.halo) this.halo.material.opacity = this.open ? 0.1 : 0.05 + 0.035 * Math.sin(time * 0.6);
    this.card.material.opacity = this.k;
    // hover: whatever a pointing hand rests on lights up softly
    let hot = null;
    if (input.aim) for (const a of input.aim) { const c = a && this._cardHit(a.ray); if (c && c.key) hot = c.key; }
    // touch: a fingertip on the board opens or closes the card; on the card it chooses
    input.hands.forEach((h, i) => {
      if (!h.present) { this.inside[i] = false; this.cardIn[i] = null; return; }
      const tip = h.tips ? h.tips[1] || h.index : h.index;
      if (this.board && tip) {
        const inB = tip.distanceTo(this.boardC) < this.boardR * 0.9;
        if (inB && !this.inside[i]) this.toggle(eye);
        this.inside[i] = inB;
      }
      if (this.open && this.k > 0.6 && tip) {
        const local = this.card.worldToLocal(tip.clone());
        let key = null;
        if (Math.abs(local.z) < 0.025 && Math.abs(local.x) < PW / 2 && Math.abs(local.y) < PH / 2) key = this._at(new THREE.Vector2(local.x / PW + 0.5, local.y / PH + 0.5));
        if (key) hot = key;
        if (key && key !== this.cardIn[i]) this._press(key);
        this.cardIn[i] = key;
      }
    });
    if (hot !== this.hot) { this.hot = hot; if (this.open) this._draw(); }
    // looking well away from the card for a while folds it away again
    if (this.open && eye && this.eyeDir) {
      const to = this.card.position.clone().sub(eye).normalize();
      this.away = to.angleTo(this.eyeDir) > 0.9 ? this.away + dt : 0;
      if (this.away > 5) this.close();
    }
  }
}
