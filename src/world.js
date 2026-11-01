// Loads the forest exported from Blender and prepares it for the headset:
// cheap materials, glowing additive effects, twinkle/ribbon shaders, the phased moon,
// and an index of every interactive piece by role.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ownMaterials, parseJSON } from './util.js';
import { moonPhase, moonAngles, directionThree, moonLight } from './moon.js';

// bump this whenever the forest is re-exported, so headsets never keep showing an old saved copy
export const FOREST_VERSION = 'reach1';
// where your eyes are, set by where you are playing from (chosen on the start screen before you go in):
//  - bed:   sitting cross-legged on the forest floor, eyes about 0.82 m up (the forest floor is your bed)
//  - chair: sitting on a mossy stump, eyes about 1.2 m up (the forest floor is your room's floor)
export const SEATS = { bed: 0.82, chair: 1.2 };
export const EYE = new THREE.Vector3(0, SEATS.bed, 0);
export function setSeat(seat) { EYE.y = SEATS[seat] || SEATS.bed; }
// a height made for the bed (eyes at 0.82), moved to sit the same way relative to your eyes now
export const atEye = (x, y, z) => new THREE.Vector3(x, y - SEATS.bed + EYE.y, z);
export const shaderMats = []; // every material with a `time` uniform

const twinkleVS = `
attribute float _twinkle; varying float vTw; varying vec2 vUv;
void main(){ vUv=uv; vTw=_twinkle; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const twinkleFS = `
uniform sampler2D map; uniform vec3 color; uniform float time; uniform float fade; varying float vTw; varying vec2 vUv;
void main(){
  float a=texture2D(map,vUv).a;
  float s=0.5+0.5*sin(time*(0.9+vTw*0.9)+vTw*6.2831);   // each sparkle breathes on its own 3-6 s cycle
  s=0.28+0.72*s*s;
  gl_FragColor=vec4(color*s*fade, a*s*fade);
  #include <colorspace_fragment>
}`;
const ribbonVS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const ribbonFS = `
uniform sampler2D map; uniform vec3 color; uniform float time; uniform float fade; varying vec2 vUv;
void main(){
  float a=texture2D(map,vUv).a*(0.65+0.35*sin(vUv.x*24.-time*1.1));
  gl_FragColor=vec4(color*fade, a*fade);
  #include <colorspace_fragment>
}`;
const moonFS = `
uniform sampler2D map; uniform float strength; uniform vec3 lightDir; uniform float earthshine; varying vec2 vUv;
void main(){
  vec4 t=texture2D(map,vUv);
  vec2 p=vUv*2.-1.; float r2=dot(p,p);
  vec3 n=vec3(p.x,p.y,sqrt(max(0.,1.-r2)));
  float lit=smoothstep(-0.07,0.12,dot(n,lightDir));      // soft terminator for the phase
  gl_FragColor=vec4(t.rgb*strength*(lit+earthshine), t.a);
  #include <colorspace_fragment>
}`;

// The far stars: thousands of small soft star sprites on a huge sphere (built in Blender). Their tint comes
// from the texture atlas, and each one twinkles gently on its own slow cycle.
const starFS = `
uniform sampler2D map; uniform vec3 color; uniform float time; uniform float fade; varying float vTw; varying vec2 vUv;
void main(){
  vec4 t=texture2D(map,vUv);
  float s=0.5+0.5*sin(time*(0.6+vTw*1.4)+vTw*40.);
  s=0.55+0.45*s*s;
  gl_FragColor=vec4(t.rgb*color*s*fade, 1.);
  #include <colorspace_fragment>
}`;
function starMat(m) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: m.emissiveMap || m.map }, color: { value: new THREE.Color(1, 1, 1) }, time: { value: 0 }, fade: { value: 1 } },
    vertexShader: twinkleVS, fragmentShader: starFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  mat.name = m.name; shaderMats.push(mat); return mat;
}

function emissiveColor(m) {
  return m.emissive ? m.emissive.clone().multiplyScalar(m.emissiveIntensity ?? 1) : new THREE.Color(1, 1, 1);
}
function twinkleMat(m) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: m.map }, color: { value: emissiveColor(m) }, time: { value: 0 }, fade: { value: 1 } },
    vertexShader: twinkleVS, fragmentShader: twinkleFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  mat.name = m.name; shaderMats.push(mat); return mat;
}
function ribbonMat(m) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: m.map }, color: { value: emissiveColor(m) }, time: { value: 0 }, fade: { value: 1 } },
    vertexShader: ribbonVS, fragmentShader: ribbonFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  mat.name = m.name; shaderMats.push(mat); return mat;
}
function additive(m, fog = true) {
  const mat = new THREE.MeshBasicMaterial({
    color: emissiveColor(m), map: m.map, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog,
  });
  mat.name = m.name; return mat;
}
function toStandard(m) { // drop sheen (too costly on a headset) but keep every map
  const s = new THREE.MeshStandardMaterial();
  for (const k of ['name', 'map', 'normalMap', 'emissiveMap', 'roughness', 'metalness', 'alphaTest', 'side', 'transparent']) if (m[k] !== undefined) s[k] = m[k];
  s.color.copy(m.color); s.emissive.copy(m.emissive); s.emissiveIntensity = m.emissiveIntensity;
  if (m.normalScale) s.normalScale.copy(m.normalScale);
  return s;
}

function processMaterial(m) {
  const n = m.name || '';
  if (n === 'FairyDust' || n === 'MagicDust') return twinkleMat(m);
  if (n === 'StarField') return starMat(m);
  if (n === 'LightRibbon') return ribbonMat(m);
  if (n.startsWith('MoonGlow_')) return additive(m, false);
  if (n === 'Dandelion_Pappus') return additive(m);
  if (n === 'ContactShadow') {
    const s = new THREE.MeshBasicMaterial({ color: 0x000000, map: m.map, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    s.name = n; return s;
  }
  if (n === 'StarSky') {
    const s = new THREE.MeshBasicMaterial({ map: m.emissiveMap, color: new THREE.Color(3.2, 3.2, 3.2), side: THREE.DoubleSide, depthWrite: false, fog: false });
    s.name = n; return s;
  }
  if (n === 'Moon') {
    const s = new THREE.ShaderMaterial({
      uniforms: { map: { value: m.emissiveMap || m.map }, strength: { value: 1.9 }, lightDir: { value: new THREE.Vector3(0, 0, 1) }, earthshine: { value: 0.04 } },
      vertexShader: ribbonVS, fragmentShader: moonFS, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    });
    s.name = n; return s;
  }
  if (n.startsWith('Plant_')) return plantMat(m);
  if (m.isMeshPhysicalMaterial) return toStandard(m);
  if (m.transparent) m.depthWrite = false;
  return m;
}
// the magical plants: their soft shading (painted into each vertex in Blender, darker near the ground and under
// caps and bells) shades their glow as well as their colour, so they keep their shape in the dim night light
function plantMat(m) {
  const s = m.isMeshPhysicalMaterial ? toStandard(m) : m;
  s.vertexColors = true;
  // (the glowing parts — spots, pores, wands, seeds, the light under the giants' caps — keep their full glow)
  if (/Glow|Spot|Wand|Wisp|Warm|Edge/.test(m.name || '')) { s.customProgramCacheKey = () => 'plantglow'; return s; }
  s.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance *= vColor.rgb;\n#endif');
  };
  s.customProgramCacheKey = () => 'plant';
  if (s.transparent) s.depthWrite = false;
  return s;
}

export async function loadWorld(scene, onProgress) {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync('assets/forest.glb?v=' + FOREST_VERSION, (e) => onProgress && onProgress(e.total ? e.loaded / e.total : 0));
  const root = gltf.scene; scene.add(root);

  const cache = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => { if (!cache.has(m)) cache.set(m, processMaterial(m)); return cache.get(m); };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    o.matrixAutoUpdate = true;
  });

  // Index everything by its role.
  const W = {
    root, byName: {}, bubbles: [], reachRocks: [], clusters: [], dust: [], ribbons: [], pebbles: [], crystals: [], knock: [], jar: null, stick: null, boops: [], ferns: [], puffs: [], dandelions: [], dandelionSeeds: [],
    magic: {}, dim: {}, grounds: [], sky: null, moon: {}, seat: new THREE.Vector3(),
  };
  const nodes = [];
  root.traverse((o) => { if (o.name) { W.byName[o.name] = o; nodes.push(o); } });
  const get = (n) => W.byName[n];
  for (const o of root.children) {
    const n = o.name, ud = o.userData || {};
    if (n.startsWith('Cluster_')) W.clusters.push(o);
    else if (n.startsWith('G_FairyDust_')) W.dust.push(o);
    else if (n.startsWith('G_LightRibbon_')) W.ribbons.push(o);
    else if (n.startsWith('G_ThrowPebble_')) W.pebbles.push(o);
    else if (n.startsWith('G_CrystalTouch_')) W.crystals.push(o);
    else if (n.startsWith('G_Mushroom_LoneFar_')) W.knock.push(o);
    else if (n === 'G_StarJar') W.jar = o;
    else if (n === 'G_DrawStick') W.stick = o;
    else if (n.startsWith('Boop_')) W.boops.push(o);
    else if (n.startsWith('Touch_Fern')) W.ferns.push(o);
    else if (n.startsWith('G_Puffball_')) W.puffs.push(o);
    else if (n.startsWith('G_Bubble_')) W.bubbles.push(o);
    else if (n.startsWith('G_ReachRock_')) W.reachRocks.push(o);
    else if (/^G_Dandelion_\d+$/.test(n)) W.dandelions.push(o);
    else if (n.startsWith('G_DandelionSeeds_')) W.dandelionSeeds.push(o);
    if (ud.start_hidden) o.visible = false;
  }
  // Separately animated pieces need their own material copies.
  for (const o of [...W.clusters, ...W.dust, ...W.ribbons, ...W.boops, ...W.dandelions]) o.userData.mats = ownMaterials(o);
  for (const o of W.dust) o.userData.mats.forEach((m) => shaderMats.push(m));
  for (const o of W.ribbons) o.userData.mats.forEach((m) => shaderMats.push(m));
  for (const n of ['LoneMushrooms', 'Crystals', 'GlowRocks', 'Spores']) { const o = get(n); if (o) { W.dim[n] = o; o.userData.mats = ownMaterials(o); } }
  const puffMats = []; // all puffballs dim together
  const shared = new Map();
  for (const p of W.puffs) p.traverse((m) => { if (m.isMesh) { if (!shared.has(m.material)) { const c = m.material.clone(); c.userData.baseEmissive = c.emissiveIntensity; shared.set(m.material, c); puffMats.push(c); } m.material = shared.get(m.material); } });
  W.dim.Puffballs = { userData: { mats: puffMats } };

  for (const n of ['Ground', 'Moss']) if (get(n)) W.grounds.push(get(n));
  W.magic = {
    stump: get('G_SeedStump'), target: get('G_WaterTarget'), seed: get('G_MagicSeed'),
    stages: [get('G_MagicSeed'), get('G_MagicMushroom_1_Sprout'), get('G_MagicMushroom_2_Young'), get('G_MagicMushroom_3_Bloom')],
    dust: get('G_MagicDust'),
  };
  const seat = get('G_PlayerSeat'); if (seat) seat.getWorldPosition(W.seat);

  // Sky and moon: drawn behind everything, moon placed for tonight's phase.
  const sky = get('G_SkyDome'); if (sky) { sky.renderOrder = -10; sky.frustumCulled = false; W.sky = sky; }
  const field = get('G_StarField'); if (field) { field.traverse((m) => { m.renderOrder = -9; m.frustumCulled = false; }); W.starField = field; }
  W.moon = { disc: get('G_Moon'), inner: get('G_MoonGlow_Inner'), mid: get('G_MoonGlow_Mid'), wide: get('G_MoonGlow_Sky') };
  const ctl = get('G_MoonController');
  W.moonInfo = parseJSON(ctl && ctl.userData.moon, {}) || {};
  placeMoon(W, moonPhase());

  // Gentle moonlight plus a dim sky fill; the forest's own glow does the rest.
  W.hemi = new THREE.HemisphereLight(0x8c9de6, 0x2a2238, 0.6);   // soft blue night light from above, a little warmth from the ground scene.add(W.hemi);
  W.moonLight = new THREE.DirectionalLight(0xc9d6ff, 0.4); scene.add(W.moonLight); scene.add(W.moonLight.target);
  applyMoonLight(W, moonPhase());

  W.nodes = nodes;
  W.canopy = canopyOpener([get('Trees'), ...nodes.filter((o) => /^CanopyFill/.test(o.name))].filter(Boolean));
  return W;
}

// Stargazing: the canopy overhead opens. Leaves inside a widening circle around the zenith dissolve
// away with a soft, ragged edge, and the nearest trunks lean gently apart. One uniform; free while closed.
function canopyOpener(objs) {
  const u = { value: 0 };
  const done = new Set();
  for (const root of objs) root.traverse((m) => {
    if (!m.isMesh) return;
    for (const mat of [].concat(m.material)) {
      if (done.has(mat)) continue; done.add(mat);
      const leafy = /Leaves|Canopy/i.test(mat.name || '') || mat.alphaTest > 0 || mat.transparent;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.canopyOpen = u;
        sh.vertexShader = 'uniform float canopyOpen;\nvarying vec3 vOpenW;\n' + sh.vertexShader.replace('#include <project_vertex>', `
          vec4 wp = modelMatrix * vec4(transformed, 1.0);
          float rr = length(wp.xz);
          float lean = smoothstep(1.5, 6.0, wp.y) * smoothstep(6.0, 1.5, rr);
          wp.xz += (wp.xz / max(rr, 0.001)) * canopyOpen * lean * 1.2;
          vOpenW = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;`);
        if (leafy) {
          sh.fragmentShader = 'uniform float canopyOpen;\nvarying vec3 vOpenW;\n' + sh.fragmentShader.replace('void main() {', `void main() {
            if (canopyOpen > 0.001) {
              vec3 d = vOpenW - vec3(0.0, 1.2, 0.0);
              float t = length(d.xz) / max(d.y, 0.3);               // tan of the angle from straight up
              float ragged = 0.18 * sin(atan(d.z, d.x) * 7.0 + d.y) + 0.12 * sin(vOpenW.x * 3.1 + vOpenW.z * 2.7);
              if (t < canopyOpen * 1.45 + ragged * canopyOpen) discard;
            }`);
        } else sh.fragmentShader = 'varying vec3 vOpenW;\n' + sh.fragmentShader;
      };
      mat.needsUpdate = true;
    }
  });
  return { uniform: u, set(k) { u.value = k; } };
}

export function placeMoon(W, p) {
  const { az, el } = moonAngles(p);
  const d = new THREE.Vector3(...directionThree(az, el));
  W.moonDir = d.clone();
  const D = 120;
  const layers = [[W.moon.disc, 0], [W.moon.inner, 1], [W.moon.mid, 2], [W.moon.wide, 3]];
  layers.forEach(([o, off], i) => {
    if (!o) return;
    o.position.copy(EYE).addScaledVector(d, D + off);
    o.lookAt(EYE);
    o.renderOrder = -8;
  });
  const disc = W.moon.disc;
  if (disc) {
    disc.renderOrder = -5;
    const mat = disc.material;
    if (mat.uniforms) mat.uniforms.lightDir.value.set(Math.sin(2 * Math.PI * p), 0, -Math.cos(2 * Math.PI * p));
  }
  W.phase = p;
}

export function applyMoonLight(W, p) {
  const L = moonLight(p);
  if (W.moonLight) {
    W.moonLight.intensity = L.light;
    W.moonLight.position.copy(W.moonDir).multiplyScalar(50);
    W.moonLight.target.position.set(0, 0, 0);
  }
  const fade = (o, k) => o && o.traverse((m) => { if (m.isMesh) { m.material.opacity = k; m.material.transparent = true; } });
  fade(W.moon.inner, L.glow); fade(W.moon.mid, L.glow); fade(W.moon.wide, L.halo);
  if (W.sky) W.sky.traverse((m) => { if (m.isMesh) m.material.color.setScalar(3.2 * L.stars); });
  if (W.starField) W.starField.traverse((m) => { if (m.isMesh && m.material.uniforms) m.material.uniforms.color.value.setScalar(L.stars); });
  W.moonLevel = L;
}
