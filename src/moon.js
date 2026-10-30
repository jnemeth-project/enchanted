// Real moon phase from today's date, and where the moon sits in the canopy gap.
export const SYNODIC = 29.530588853;
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14) / 86400000; // a known new moon

export function moonPhase(date = new Date()) {
  const days = date.getTime() / 86400000 - REF_NEW_MOON;
  let p = (days / SYNODIC) % 1;
  if (p < 0) p += 1;
  return p; // 0 new, 0.5 full
}
export const illumination = (p) => (1 - Math.cos(2 * Math.PI * p)) / 2;

// Track that fits the gap left in the canopy (Blender azimuth: 90 = straight ahead).
export function moonAngles(p) {
  return { az: 86 + 24 * p, el: 60 + 5 * Math.sin(2 * Math.PI * p) };
}

// Blender (x, y, z) -> three.js (x, z, -y)
export function directionThree(azDeg, elDeg) {
  const az = azDeg * Math.PI / 180, el = elDeg * Math.PI / 180;
  const bx = Math.cos(el) * Math.cos(az), by = Math.cos(el) * Math.sin(az), bz = Math.sin(el);
  return [bx, bz, -by];
}

export function moonLight(p) {
  const k = illumination(p);
  return { k, light: 0.06 + 0.39 * k, glow: k, halo: 0.05 + 0.95 * k, stars: 1.15 - 0.3 * k };
}
