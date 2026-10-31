// Every sound is generated here, so each one is soft, low and slightly different every time.
// Rules: no chimes, no high pitches, no sharp attacks.
export class Sound {
  constructor() { this.ctx = null; this.enabled = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = 0.9 * (this.volume ?? 1);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.white = this._noise('white'); this.brown = this._noise('brown');
    this.enabled = true;
    this._ambience();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(0.9 * v, this.ctx.currentTime, 0.1); }
  pause() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _noise(kind) {
    const ctx = this.ctx, len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }

  _src(buf, loop = false) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop;
    return s;
  }

  // A spatial output at a world position (THREE.Vector3-like).
  _out(pos) {
    if (!pos) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 0.6; p.rolloffFactor = 1.1;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    p.connect(this.master);
    return p;
  }

  updateListener(camera) {
    if (!this.ctx) return;
    const L = this.ctx.listener, e = camera.matrixWorld.elements;
    const t = this.ctx.currentTime + 0.02;
    const set = (param, v, fallback) => { if (param) param.linearRampToValueAtTime(v, t); else fallback(); };
    set(L.positionX, e[12], () => L.setPosition(e[12], e[13], e[14]));
    if (L.positionY) { L.positionY.linearRampToValueAtTime(e[13], t); L.positionZ.linearRampToValueAtTime(e[14], t); }
    if (L.forwardX) {
      L.forwardX.linearRampToValueAtTime(-e[8], t); L.forwardY.linearRampToValueAtTime(-e[9], t); L.forwardZ.linearRampToValueAtTime(-e[10], t);
      L.upX.linearRampToValueAtTime(e[4], t); L.upY.linearRampToValueAtTime(e[5], t); L.upZ.linearRampToValueAtTime(e[6], t);
    } else if (L.setOrientation) L.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
  }

  _env(g, t, attack, peak, release) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  // Soft, deep boop: sine plus a sub an octave below, gliding down a little.
  boop(pos, baseHz = 105) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime, f = baseHz * (1 + (Math.random() - 0.5) * 0.012); // each mushroom keeps its own note
    const out = this._out(pos);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(out);
    const g = ctx.createGain(); g.connect(lp); this._env(g, t, 0.03, 0.5, 0.75);
    for (const [mult, amp] of [[1, 1], [0.5, 0.4]]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f * mult * 1.08, t);
      o.frequency.exponentialRampToValueAtTime(f * mult * 0.86, t + 0.28);
      const a = ctx.createGain(); a.gain.value = amp; o.connect(a); a.connect(g);
      o.start(t); o.stop(t + 1.0);
    }
  }

  // A light going out (a firefly or a star): a soft breath of air and a low note that settles down.
  // Sound guides: a soft hum from the nearest thing you can touch, louder as your hand gets closer
  guide(i, pos, hz, level) {
    if (!this.enabled) return;
    const ctx = this.ctx; this._guides = this._guides || [];
    let G = this._guides[i];
    if (!G) {
      const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 0.4; p.connect(this.master);
      const g = ctx.createGain(); g.gain.value = 0; g.connect(p);
      const o = ctx.createOscillator(); o.type = 'sine'; o.connect(g); o.start();
      const o2 = ctx.createOscillator(); o2.type = 'sine'; const g2 = ctx.createGain(); g2.gain.value = 0.3; o2.connect(g2); g2.connect(g); o2.start();
      G = this._guides[i] = { p, g, o, o2 };
    }
    const t = ctx.currentTime;
    if (pos) { G.p.positionX.setTargetAtTime(pos.x, t, 0.05); G.p.positionY.setTargetAtTime(pos.y, t, 0.05); G.p.positionZ.setTargetAtTime(pos.z, t, 0.05); }
    if (hz) { G.o.frequency.setTargetAtTime(hz, t, 0.08); G.o2.frequency.setTargetAtTime(hz * 2.003, t, 0.08); }
    G.g.gain.setTargetAtTime(Math.max(0, level) * 0.07, t, 0.08);
  }

  // one soft raindrop tapping a leaf somewhere near you
  _pat() {
    const ctx = this.ctx, t = ctx.currentTime, a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 4;
    const out = this._out({ x: Math.cos(a) * r, y: 0.5 + Math.random() * 2, z: Math.sin(a) * r });
    const n = this._src(this.white); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 + Math.random() * 1800; bp.Q.value = 2.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.05, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(bp); bp.connect(g); g.connect(out); n.start(t, Math.random() * 2); n.stop(t + 0.09);
  }

  // a magical crystal shimmer: bell-like partials that ring and fade, with a little sparkle on top
  chime(pos, baseHz = 523.25) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos);
    const g = ctx.createGain(); g.connect(out);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    for (const [mult, amp, d] of [[1, 1, 0], [2.01, 0.45, 0.04], [3.02, 0.25, 0.09], [4.17, 0.12, 0.15], [1.5, 0.3, 0.22]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = baseHz * mult;
      const a = ctx.createGain(); a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(amp, t + d + 0.02); a.gain.exponentialRampToValueAtTime(0.0001, t + d + 2.2);
      o.connect(a); a.connect(g); o.start(t); o.stop(t + 2.7);
    }
  }

  hush(pos, baseHz = 196) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos);
    const f = baseHz * (1 + (Math.random() - 0.5) * 0.01);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1200, t); lp.frequency.exponentialRampToValueAtTime(380, t + 1.2); lp.connect(out);
    const g = ctx.createGain(); g.connect(lp);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.09); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    for (const [mult, amp] of [[1, 1], [1.5, 0.25]]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f * mult, t); o.frequency.exponentialRampToValueAtTime(f * mult * 0.75, t + 1.2);
      const a = ctx.createGain(); a.gain.value = amp; o.connect(a); a.connect(g); o.start(t); o.stop(t + 1.6);
    }
    const n = this._src(this.white); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.05, t + 0.05); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    n.connect(bp); bp.connect(ng); ng.connect(out); n.start(t, Math.random() * 2); n.stop(t + 0.5);
  }

  // Wet, low squish (no longer used for fireflies).
  squish(pos) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos);
    const n = this._src(this.white); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(220, t + 0.35); lp.Q.value = 4;
    const g = ctx.createGain(); this._env(g, t, 0.015, 0.22, 0.4);
    n.connect(lp); lp.connect(g); g.connect(out); n.start(t, Math.random() * 2); n.stop(t + 0.5);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(80, t + 0.25);
    const og = ctx.createGain(); this._env(og, t, 0.02, 0.3, 0.35); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.5);
  }

  // Fern touch: a soft, low "shhh" of leaves brushing past. Slow in, slow out, nothing sharp.
  rustle(pos, intensity = 0.5) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos);
    const n = this._src(this.white);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.5;
    const f0 = 650 + Math.random() * 200;
    bp.frequency.setValueAtTime(f0 * 1.25, t); bp.frequency.exponentialRampToValueAtTime(f0 * 0.75, t + 0.9);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300;
    const g = ctx.createGain(); this._env(g, t, 0.22, 0.09 + 0.12 * Math.min(1, intensity), 0.85);
    n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(out); n.start(t, Math.random() * 2); n.stop(t + 1.3);
    const b = this._src(this.brown); const blp = ctx.createBiquadFilter(); blp.type = 'lowpass'; blp.frequency.value = 500;
    const bg = ctx.createGain(); this._env(bg, t, 0.25, 0.12, 0.8);
    b.connect(blp); blp.connect(bg); bg.connect(out); b.start(t, Math.random() * 2); b.stop(t + 1.3);
  }

  // Muffled puff with a gentle thump.
  puff(pos) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos);
    const n = this._src(this.brown); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 450;
    const g = ctx.createGain(); this._env(g, t, 0.01, 0.45, 0.55);
    n.connect(lp); lp.connect(g); g.connect(out); n.start(t, Math.random() * 2); n.stop(t + 0.7);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.3);
    const og = ctx.createGain(); this._env(og, t, 0.01, 0.2, 0.3); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.4);
  }

  // A pebble landing on the soft forest floor: a short, earthy thump (a low knock with a little puff of soil),
  // stronger the harder it lands.
  thump(pos, strength = 1) {
    if (!this.enabled) return;
    // (headset speakers barely play the deep part, so there is a woody mid "tok" on top that carries the sound)
    const k = Math.max(0.5, Math.min(1, strength)), ctx = this.ctx, t = ctx.currentTime, out = this._out(pos);
    const o = ctx.createOscillator(); o.type = 'sine';
    const f0 = 110 + Math.random() * 20; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 0.14);
    const og = ctx.createGain(); this._env(og, t, 0.003, 1.4 * k, 0.2); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.3);
    const m = ctx.createOscillator(); m.type = 'triangle';
    const f1 = 230 + Math.random() * 50; m.frequency.setValueAtTime(f1, t); m.frequency.exponentialRampToValueAtTime(f1 * 0.6, t + 0.08);
    const mg = ctx.createGain(); this._env(mg, t, 0.002, 0.75 * k, 0.09); m.connect(mg); mg.connect(out); m.start(t); m.stop(t + 0.15);
    const n = this._src(this.brown); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.1);
    const g = ctx.createGain(); this._env(g, t, 0.001, 0.9 * k, 0.12);
    n.connect(lp); lp.connect(g); g.connect(out); n.start(t, Math.random() * 2); n.stop(t + 0.2);
  }

  // Breathy whoosh for dandelion seeds lifting away.
  whoosh(pos) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos);
    const n = this._src(this.white); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.6;
    bp.frequency.setValueAtTime(1100, t); bp.frequency.exponentialRampToValueAtTime(450, t + 1.1);
    const g = ctx.createGain(); this._env(g, t, 0.25, 0.12, 1.0);
    n.connect(bp); bp.connect(g); g.connect(out); n.start(t, Math.random() * 2); n.stop(t + 1.5);
  }

  // Warm, slow swell when the magic mushroom grows (two low notes, no bell).
  grow(pos, big = false) {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.connect(out);
    const g = ctx.createGain(); g.connect(lp);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(big ? 0.22 : 0.15, t + 1.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
    for (const f of (big ? [110, 164.8, 220] : [110, 164.8])) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004);
      o.connect(g); o.start(t); o.stop(t + 5.2);
    }
  }

  // Continuous water trickle while pouring (returns a stopper).
  trickle(pos) {
    if (!this.enabled) return () => {};
    const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos);
    const n = this._src(this.white, true); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 1.6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.2);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 7; const lg = ctx.createGain(); lg.gain.value = 0.03; lfo.connect(lg); lg.connect(g.gain);
    n.connect(bp); bp.connect(g); g.connect(out); n.start(t); lfo.start(t);
    return () => { const e = ctx.currentTime; g.gain.cancelScheduledValues(e); g.gain.setValueAtTime(g.gain.value, e); g.gain.exponentialRampToValueAtTime(0.0001, e + 0.3); n.stop(e + 0.35); lfo.stop(e + 0.35); };
  }

  // Soft rain bed: mostly a low, rounded hush with only a faint airy layer on top. level 0..1 fades smoothly.
  rain(level) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    if (!this._rain) {
      const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(this.master);
      const low = this._src(this.brown, true); const llp = ctx.createBiquadFilter(); llp.type = 'lowpass'; llp.frequency.value = 650;
      const lg = ctx.createGain(); lg.gain.value = 0.9; low.connect(llp); llp.connect(lg); lg.connect(g); low.start();
      const air = this._src(this.white, true);
      const ahp = ctx.createBiquadFilter(); ahp.type = 'highpass'; ahp.frequency.value = 250;
      const alp = ctx.createBiquadFilter(); alp.type = 'lowpass'; alp.frequency.value = 2200; alp.Q.value = 0.3;
      const ag = ctx.createGain(); ag.gain.value = 0.42; air.connect(ahp); ahp.connect(alp); alp.connect(ag); ag.connect(g); air.start();
      this._rain = g;
    }
    this._rain.gain.setTargetAtTime(Math.max(0.0001, level * 0.2), ctx.currentTime, 2.0);
    // and soft individual drops pattering on leaves around you
    this._patT = (this._patT || 0) - 1 / 60;
    if (level > 0.2 && this._patT <= 0) { this._patT = 0.03 + Math.random() * 0.09 / level; this._pat(); }
  }

  drip(pos) { // a tiny soft tick of a raindrop landing in a palm
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(330 + Math.random() * 80, t); o.frequency.exponentialRampToValueAtTime(200, t + 0.07);
    const g = ctx.createGain(); this._env(g, t, 0.01, 0.02, 0.1); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.12);
  }

  // Background: the evening forest recording (crickets, soft birds), looped with long, invisible crossfades.
  // If it can't load, a soft low drone plays instead.
  _ambience() {
    const ctx = this.ctx;
    const bus = this.amb = ctx.createGain(); bus.gain.value = 0.0001; bus.connect(this.master);
    bus.gain.setTargetAtTime(1, ctx.currentTime, 3);
    this.ambLevel = ctx.createGain(); this.ambLevel.gain.value = 2.0; this.ambLevel.connect(bus);
    fetch('assets/ambience.mp3').then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a))
      .then((buf) => this._loopAmbience(buf)).catch((e) => { console.warn('ambience', e); this._drone(); });
  }

  _loopAmbience(buf) {
    const ctx = this.ctx, X = 6, len = buf.duration, N = 64;
    const up = new Float32Array(N), down = new Float32Array(N);
    for (let i = 0; i < N; i++) { const t = i / (N - 1); up[i] = Math.sin(t * Math.PI / 2); down[i] = Math.cos(t * Math.PI / 2); }
    const play = (when, offset) => {
      const src = ctx.createBufferSource(); src.buffer = buf;
      const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.ambLevel);
      const end = when + (len - offset);
      g.gain.setValueCurveAtTime(up, when, X);
      g.gain.setValueCurveAtTime(down, end - X, X);
      src.start(when, offset); src.stop(end + 0.1);
      const next = end - X; // the next pass starts while this one fades out
      setTimeout(() => play(next, 0), Math.max(0, (next - ctx.currentTime - 3) * 1000));
    };
    play(ctx.currentTime + 0.1, Math.random() * len * 0.7); // start somewhere different each night
  }

  _drone() {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.connect(this.amb);
    for (const [f, a] of [[55, 0.05], [82.4, 0.035], [110.3, 0.022]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = a; o.connect(g); g.connect(lp); o.start();
    }
  }

  // 1 = awake forest, 0 = asleep: the ambience settles as the forest falls asleep.
  setAwake(k) {
    if (this.amb) this.amb.gain.setTargetAtTime(0.35 + 0.65 * k, this.ctx.currentTime, 2.5);
  }
}
