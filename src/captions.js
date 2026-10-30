// A few soft glowing words that float in the forest and fade away ("Night 2", "it blooms").
import * as THREE from 'three';
import { tweens } from './util.js';

function textTexture(lines) {
  const W = 1024, H = 256 * lines.length, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((line, i) => {
    const big = i === 0, y = 128 + i * 210;
    g.font = `${big ? 132 : 96}px "Iowan Old Style", "Palatino Linotype", Georgia, serif`;
    g.shadowColor = 'rgba(190, 200, 255, 0.85)'; g.shadowBlur = 36;
    g.fillStyle = big ? 'rgba(244, 240, 255, 0.96)' : 'rgba(214, 226, 255, 0.85)';
    g.fillText(line, W / 2, y); g.shadowBlur = 12; g.fillText(line, W / 2, y);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { t, aspect: W / H };
}

export class Captions {
  constructor(scene) { this.scene = scene; this.live = []; }

  // text: "Night 2" or "Night 2\nit grows"; width in metres
  show(text, position, { width = 0.3, fadeIn = 1.2, hold = 2.8, fadeOut = 1.8, rise = 0.04 } = {}) {
    for (const old of this.live) tweens.add(0.6, (k) => { old.material.opacity = old.userData.o * (1 - k); }, { done: () => this._remove(old) });
    const { t, aspect } = textTexture(String(text).split('\n'));
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
