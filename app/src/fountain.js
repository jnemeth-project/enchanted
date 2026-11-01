// The sound of a little desk fountain: water trickling over a lip into a small bowl. Not a river and not
// a roar: lots of tiny, soft bubbles and trickles, close together, so they run into one gentle, steady
// burble, with a faint silvery wash of water underneath. Built once as a short seamless loop.
export function makeFountain(SR, seconds = 7) {
  const N = Math.floor(SR * seconds), out = new Float32Array(N);
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // the trickle's flow drifts slowly (a little more, a little less) so it never sounds mechanical
  const flow = (t) => 0.8 + 0.2 * Math.sin(t * 0.9 * Math.PI * 2 / seconds * 3) * Math.sin(t * 2.3 + 1);
  // the bubbles: each a tiny, soft rising "plip" (a sine whose pitch rises as it fades)
  let t = 0;
  while (t < seconds) {
    t += -Math.log(1 - rnd()) / (70 * flow(t));          // about 70 a second, at random
    const f0 = 600 * Math.pow(3.2, rnd()), rise = 1.25 + rnd() * 0.45, d = 0.012 + rnd() * 0.022;
    const a = (0.012 + rnd() * 0.03) * (rnd() < 0.06 ? 2.2 : 1) * (900 / f0) ** 0.35;
    const i0 = Math.floor(t * SR), n = Math.floor((d + 0.02) * SR);
    let ph = 0;
    for (let j = 0; j < n; j++) {
      const tt = j / SR, f = f0 * (1 + (rise - 1) * Math.min(1, tt / d));
      ph += 2 * Math.PI * f / SR;
      const env = Math.min(1, tt / 0.0015) * Math.exp(-tt / (d * 0.45));
      out[(i0 + j) % N] += a * env * Math.sin(ph);
    }
  }
  // the faint wash: soft noise, only between about 500 Hz and 3 kHz, very quiet
  let lp = 0, lp2 = 0;
  const kl = 1 - Math.exp(-2 * Math.PI * 3000 / SR), kh = 1 - Math.exp(-2 * Math.PI * 500 / SR);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) {   // (twice round, so the loop joins smoothly)
    const w = rnd() * 2 - 1; lp += (w - lp) * kl; lp2 += (lp - lp2) * kh;
    if (pass === 1) out[i] += (lp - lp2) * 0.022 * flow(i / SR);
  }
  let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(out[i]));
  const k = 0.6 / pk; for (let i = 0; i < N; i++) out[i] *= k;
  return out;
}
