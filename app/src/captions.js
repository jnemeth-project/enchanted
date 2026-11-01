// A few soft glowing words that float in the forest and fade away ("Night 2", "it blooms").
import * as THREE from 'three';
import { tweens } from './util.js';

function textTexture(lines, backing = false) {
  // (drawn at half resolution into the canvas: a quarter of the pixels to send to the headset each time words
  // appear, which keeps the frame from stuttering; still crisp at the size the words are shown)
  const W = 2048, H = 256 * lines.length, S = 0.5, c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
  const g = c.getContext('2d'); g.scale(S, S);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const face = '"Iowan Old Style", "Palatino Linotype", Georgia, serif';
  // every line shrinks to fit, so long instructions are never cut off at the edges
  // Large text: no panel behind the words (it read as a big black box), just a soft dark edge around each letter
  // so the bigger words stand out clearly against the glowing forest
  const fit = (line, size) => { g.font = `${size}px ${face}`; const w = g.measureText(line).width; return w > W - 120 ? Math.floor(size * (W - 120) / w) : size; };
  lines.forEach((line, i) => {
    const big = i === 0, y = 128 + i * 210;
    const size = fit(line, big ? 132 : 104);
    g.font = `${size}px ${face}`;
    g.shadowColor = 'rgba(190, 200, 255, 0.85)'; g.shadowBlur = 36;
    if (backing) { g.lineJoin = 'round'; g.lineWidth = 22; g.strokeStyle = 'rgba(8, 6, 18, 0.55)'; g.shadowBlur = 0; g.strokeText(line, W / 2, y); g.shadowBlur = 36; }
    g.fillStyle = big ? 'rgba(244, 240, 255, 0.96)' : 'rgba(214, 226, 255, 0.85)';
    g.fillText(line, W / 2, y); g.shadowBlur = 12; g.fillText(line, W / 2, y);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return { t, aspect: W / H };
}

export class Captions {
  constructor(scene) { this.scene = scene; this.live = []; this.large = false; this.speak = null; }

  // text: "Night 2" or "Night 2\nit grows"; width in metres
  show(text, position, { width = 0.3, fadeIn = 1.2, hold = 2.8, fadeOut = 1.8, rise = 0.04 } = {}) {
    for (const old of this.live) tweens.add(0.6, (k) => { old.material.opacity = old.userData.o * (1 - k); }, { done: () => this._remove(old) });
    if (this.large) { width *= 1.45; hold *= 1.6; }
    if (this.speak) this.speak(String(text));
    const { t, aspect } = textTexture(String(text).split('\n'), !!this.large);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    s.renderOrder = 30; s.scale.set(width, width / aspect, 1); s.position.copy(position);
    this.scene.add(s); this.live = [s];
    const y0 = position.y;
    tweens.add(fadeIn, (k) => { s.material.opacity = s.userData.o = k; s.position.y = y0 + rise * k; });
    tweens.add(fadeOut, (k) => { s.material.opacity = s.userData.o = 1 - k; s.position.y = y0 + rise * (1 + k * 0.5); },
      { delay: fadeIn + hold, done: () => this._remove(s) });
    return s;
  }

  _remove(s) { this.scene.remove(s); s.material.map.dispose(); s.material.dispose(); this.live = this.live.filter((x) => x !== s); }
}
