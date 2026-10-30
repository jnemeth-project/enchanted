// The new look (preview behind ?v2=1): the same forest, every glow, sparkle and fairy dust untouched,
// but with a real scanned forest floor, soft moss grown around the mushrooms, real bark, waxy caps
// that glow through their edges, and a darker treeline. All cheap enough for Quest:
// three extra textures, one small painted mask, no extra draw calls.
import * as THREE from 'three';

const tl = new THREE.TextureLoader();
function tex(url, srgb = true, rep = 1) {
  const t = tl.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// A top-down map (48 m square) of where moss grows: soft, uneven patches around every mushroom group.
function mossMask(points) {
  const S = 512, M = 48, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const px = (x) => (x / M + 0.5) * S;
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const p of points) {
    const n = 5 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const r = (0.5 + rnd() * 1.1) * S / M, a = rnd() * 6.283, d = rnd() * 0.9;
      const x = px(p.x + Math.cos(a) * d), y = px(p.z + Math.sin(a) * d);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.75)'); grd.addColorStop(0.6, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function applyV2(W, scene) {
  const base = 'assets/v2/';
  const groundDiff = tex(base + 'ground_diff.webp');
  const barkDiff = tex(base + 'bark_diff.webp'), barkNor = tex(base + 'bark_nor.webp', false);
  const pts = [...W.clusters, ...W.boops].map((o) => o.getWorldPosition(new THREE.Vector3()));
  const mask = mossMask(pts);

  // the ground gets its own copy of the material, so the moss mounds keep their fluffy moss look
  if (W.byName.Ground) W.byName.Ground.traverse((o) => {
    if (!o.isMesh) return;
    o.material = [].concat(o.material).map((m) => { const c = m.clone(); groundMat(c, groundDiff, mask, m.name === 'Path_ForestFloor'); return c; });
    if (o.material.length === 1) o.material = o.material[0];
  });
  const seen = new Set();
  W.root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (seen.has(m)) continue; seen.add(m);
      const n = m.name || '';
      if (n === 'Bark') { m.map = barkDiff; m.normalMap = barkNor; m.normalScale = new THREE.Vector2(1.2, 1.2); m.color.setRGB(0.55, 0.5, 0.48); m.roughness = 0.92; m.needsUpdate = true; }
      else if (n === 'Leaves_Canopy' || n === 'Leaves_Spray') { m.color.multiplyScalar(0.55); }
      else if (n === 'Moss_Fluffy') velvetMoss(m);
      else if (/^(Mushroom_|Puffball_)/.test(n)) glowThrough(m);
    }
  });
  // a darker, deeper treeline behind everything: the glows read more strongly against it
  scene.fog = new THREE.FogExp2(0x040309, 0.024);
  scene.background = new THREE.Color(0x030208);
  if (W.hemi) { W.hemi.color.set(0x5a5f96); W.hemi.groundColor.set(0x0d0a10); }
}

// Real scanned forest floor, mapped in world space (so it is always the right size), with moss
// blended in where the mask says, keeping the original moss texture's colour.
function groundMat(m, diff, mask, isPath) {
  const mossMap = m.map; // the original fluffy moss texture
  m.onBeforeCompile = (sh) => {
    sh.uniforms.gDiff = { value: diff }; sh.uniforms.gMask = { value: mask }; sh.uniforms.gMoss = { value: mossMap };
    sh.vertexShader = 'varying vec3 vGW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform sampler2D gDiff; uniform sampler2D gMask; uniform sampler2D gMoss; varying vec3 vGW;\n' +
      sh.fragmentShader.replace('#include <map_fragment>', `
        vec3 scan = texture2D(gDiff, vGW.xz * 0.7).rgb;
        scan = mix(scan, vec3(dot(scan, vec3(0.33))), 0.2) * vec3(0.5, 0.47, 0.5);   // a little cooler and darker: night
        float mk = texture2D(gMask, vGW.xz / 48.0 + 0.5).r;
        float edge = texture2D(gDiff, vGW.xz * 2.3).g;                                  // ragged moss edges
        float moss = ${isPath ? '0.0' : 'smoothstep(0.18, 0.55, mk + (edge - 0.45) * 0.5)'};
        ${mossMap ? 'vec3 mossC = texture2D(gMoss, vGW.xz * 0.9).rgb * 0.8;' : 'vec3 mossC = vec3(0.12, 0.2, 0.1);'}
        diffuseColor.rgb *= mix(scan, mossC, moss);`);
  };
  m.roughness = 0.95;
  m.customProgramCacheKey = () => 'v2ground' + (isPath ? 'p' : 'g');
  m.needsUpdate = true;
}

// Caps glow through their edges and from underneath, like wax with a lamp inside.
// It multiplies each material's own glow, so every fluorescent texture keeps its full strength.
function glowThrough(mat) {
  if (mat.userData.glowThrough) return; mat.userData.glowThrough = true;
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 nV = normalize(vNormal); vec3 vV = normalize(vViewPosition);
        float rim = pow(1.0 - abs(dot(nV, vV)), 2.2);
        vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        float under = smoothstep(0.15, -0.75, dot(nV, upV));
        totalEmissiveRadiance *= 1.0 + 0.9 * rim + 1.2 * under;
      }`);
  };
  mat.customProgramCacheKey = () => 'glowThrough';
  mat.needsUpdate = true;
}

// Moss cushions: a little less saturated, with the soft silvery sheen real moss has at its edges.
function velvetMoss(m) {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))), 0.18) * vec3(0.82, 0.9, 0.8);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec3 nV = normalize(vNormal); float rim = pow(1.0 - abs(dot(nV, normalize(vViewPosition))), 2.5);
          totalEmissiveRadiance += vec3(0.025, 0.04, 0.025) * rim; }`);
  };
  m.customProgramCacheKey = () => 'v2moss';
  m.needsUpdate = true;
}
