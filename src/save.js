// Progress that survives between nights, kept on the device only (no account needed).
const KEY = 'lightsout.v1';

// A "night" runs from 6 am to 6 am local time, so a late session still counts as tonight.
export function nightKey(d = new Date()) {
  const t = new Date(d.getTime() - 6 * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

export function defaultState() {
  return { version: 1, nights: 0, lastNight: null, stage: 0, color: null, wateredNight: null, collection: [] };
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const raw = storage && storage.getItem(KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch { return defaultState(); }
}

export function saveState(state, storage = globalThis.localStorage) {
  try { storage && storage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: play on without saving */ }
}

// Call once per session. Returns true when this is a new night.
export function beginNight(state, key = nightKey()) {
  if (state.lastNight === key) return false;
  state.lastNight = key; state.nights += 1;
  return true;
}

export const wateredTonight = (state, key = nightKey()) => state.wateredNight === key;
