// The map: a flat voxel ("3D pixel art") diorama of Indonesia with one pillar per 0.1 degree cell.
// Scene units are degrees: x = longitude, z = minus latitude, y = height.
// Base map: NASA GIBS Blue Marble tiles, sampled once to one colour per 0.1 degree cell.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { cellStep, blockStep, blocksByMonth } from './data.js';

export const STEP_COLORS = ['#fef0d9', '#fdcc8a', '#fc8d59', '#e34a33', '#b30000']; // ColorBrewer OrRd
export const MAX_H = 3;      // height of the record maximum, in degrees
const LAND_TOP = 0.08;
const LON0 = 118, LAT0 = -1.5;
const TEX = { lon: 90, lat: 12, w: 560, h: 270 }; // ground pixels: west edge, north edge, size
const LOD_DIST = 16;         // farther than this, cells are merged into 0.5 degree blocks
const FOV = 35;
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8';

const X = lon => lon - LON0, Z = lat => LAT0 - lat;
const q = (v, step) => Math.max(0, Math.min(255, Math.round(v / step) * step));

// Loads the Blue Marble tiles that cover the ground and returns their pixels, or null on failure.
async function loadTiles() {
  const z = 5, n = 2 ** z, tx0 = 24, tx1 = 28, ty0 = 14, ty1 = 17;
  const canvas = document.createElement('canvas');
  canvas.width = (tx1 - tx0 + 1) * 256;
  canvas.height = (ty1 - ty0 + 1) * 256;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      jobs.push(new Promise((ok, fail) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { ctx.drawImage(img, (tx - tx0) * 256, (ty - ty0) * 256); ok(); };
        img.onerror = fail;
        img.src = `${GIBS}/${z}/${ty}/${tx}.jpeg`;
      }));
    }
  }
  try {
    await Promise.race([Promise.all(jobs), new Promise((_, fail) => setTimeout(fail, 8000))]);
    const src = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return (lon, lat) => {
      const px = Math.floor((lon + 180) / 360 * n * 256) - tx0 * 256;
      const py = Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n * 256) - ty0 * 256;
      const o = (py * canvas.width + px) * 4;
      return [src[o], src[o + 1], src[o + 2]];
    };
  } catch (e) {
    return null;
  }
}

function makeLayer(scene, items, size) {
  const n = items.length;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), n);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const arr = mesh.instanceMatrix.array;
  const x = new Float32Array(n), z = new Float32Array(n);
  arr.fill(0);
  for (let i = 0; i < n; i++) {
    x[i] = X(items[i].lon); z[i] = Z(items[i].lat);
    arr[i * 16 + 12] = x[i]; arr[i * 16 + 14] = z[i]; arr[i * 16 + 15] = 1;
  }
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, n, size, x, z, items, cur: new Float32Array(n), vel: new Float32Array(n), target: new Float32Array(n),
    val: new Float32Array(n), step: new Uint8Array(n), active: new Set(), shown: { idx: [], val: [] }, month: -1 };
}

export async function createMap(container, pack, handlers) {
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  container.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false }); // throws when WebGL is missing
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#081428');
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-6, 10, 5);
  scene.add(sun);

  const controls = new MapControls(camera, canvas);
  controls.enableDamping = true;
  controls.minDistance = 2.5;
  controls.maxDistance = 95;
  controls.maxPolarAngle = 1.3;
  controls.zoomToCursor = true;

  // ---------- ground ----------
  const sample = await loadTiles();
  const ground = document.createElement('canvas');
  ground.width = TEX.w; ground.height = TEX.h;
  const gctx = ground.getContext('2d');
  const image = gctx.createImageData(TEX.w, TEX.h);
  const ocean = new Uint8Array(TEX.w * TEX.h).fill(1);
  const land = []; // px, py, r, g, b
  const put = (px, py, r, g, b) => { const o = (py * TEX.w + px) * 4; image.data.set([r, g, b, 255], o); };
  for (let py = 0; py < TEX.h; py++) {
    for (let px = 0; px < TEX.w; px++) {
      if (!sample) { put(px, py, 16, 48, 96); continue; }
      const [r, g, b] = sample(TEX.lon + (px + 0.5) * 0.1, TEX.lat - (py + 0.5) * 0.1);
      if (b > r * 1.25 + 4 && b >= g * 0.9) {
        put(px, py, q(r * 0.9, 16), q(g * 0.95 + 6, 16), q(b * 1.05 + 14, 16));
      } else {
        const c = [q(r * 1.5 + 14, 20), q(g * 1.5 + 18, 20), q(b * 1.4 + 8, 20)];
        put(px, py, ...c);
        ocean[py * TEX.w + px] = 0;
        land.push(px, py, ...c);
      }
    }
  }
  if (!sample) { // no base map: draw land where the record has ever seen a hot spot
    for (const c of pack.cells) {
      const px = Math.floor((c.lon - TEX.lon) / 0.1), py = Math.floor((TEX.lat - c.lat) / 0.1);
      put(px, py, 60, 110, 70);
      ocean[py * TEX.w + px] = 0;
      land.push(px, py, 60, 110, 70);
    }
  }
  const base = image.data.slice();
  gctx.putImageData(image, 0, 0);
  const groundTex = new THREE.CanvasTexture(ground);
  groundTex.magFilter = groundTex.minFilter = THREE.NearestFilter;
  groundTex.generateMipmaps = false;
  groundTex.colorSpace = THREE.SRGBColorSpace;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(TEX.w * 0.1, TEX.h * 0.1), new THREE.MeshBasicMaterial({ map: groundTex }));
  sea.rotation.x = -Math.PI / 2;
  scene.add(sea);

  const landGeo = new THREE.BoxGeometry(0.1, LAND_TOP, 0.1);
  landGeo.translate(0, LAND_TOP / 2, 0);
  const landMesh = new THREE.InstancedMesh(landGeo, new THREE.MeshLambertMaterial(), land.length / 5);
  const mat = new THREE.Matrix4(), col = new THREE.Color();
  for (let k = 0; k < land.length; k += 5) {
    mat.makeTranslation(X(TEX.lon + (land[k] + 0.5) * 0.1), 0, Z(TEX.lat - (land[k + 1] + 0.5) * 0.1));
    landMesh.setMatrixAt(k / 5, mat);
    landMesh.setColorAt(k / 5, col.setRGB(land[k + 2] / 255, land[k + 3] / 255, land[k + 4] / 255, THREE.SRGBColorSpace));
  }
  landMesh.frustumCulled = false;
  scene.add(landMesh);

  // ---------- pillars ----------
  const stepRgb = STEP_COLORS.map(h => new THREE.Color(h));
  const cellLayer = makeLayer(scene, pack.cells, 0.09);
  const blockLayer = makeLayer(scene, pack.blocks, 0.44);
  cellLayer.heightOf = v => MAX_H * Math.sqrt(v / pack.recordMax);
  blockLayer.heightOf = v => MAX_H * Math.sqrt(v / 25 / pack.recordMax); // mean per cell of the block
  cellLayer.data = m => pack.cellsByMonth[m];
  blockLayer.data = m => blocksByMonth(pack, m);
  cellLayer.stepOf = (i, m, v) => cellStep(pack, pack.cells[i], m, v);
  blockLayer.stepOf = (i, m, v) => blockStep(pack, pack.blocks[i], m, v);

  let flat = false, month = pack.lastMonth, layer = null, time = 0;

  function write(L, i) {
    const arr = L.mesh.instanceMatrix.array, o = i * 16, c = L.cur[i];
    const h = c > 0.001 ? (flat ? 0.03 : c) : 0;
    arr[o] = arr[o + 10] = h > 0 ? L.size : 0;
    arr[o + 5] = h > 0 ? LAND_TOP + h : 0;
  }

  function showMonth(L) {
    for (const i of L.shown.idx) { L.target[i] = 0; L.active.add(i); }
    const data = L.data(month), colors = L.mesh.instanceColor.array;
    for (let k = 0; k < data.idx.length; k++) {
      const i = data.idx[k], v = data.val[k], s = L.stepOf(i, month, v);
      L.target[i] = L.heightOf(v); L.val[i] = v; L.step[i] = s;
      colors[i * 3] = stepRgb[s].r; colors[i * 3 + 1] = stepRgb[s].g; colors[i * 3 + 2] = stepRgb[s].b;
      L.active.add(i);
    }
    L.shown = data; L.month = month;
    L.mesh.instanceColor.needsUpdate = true;
    seedEmbers();
  }

  function stepLayer(L, dt, instant) {
    if (!L.active.size) return;
    for (const i of L.active) {
      const t = L.target[i];
      let c = L.cur[i], v = L.vel[i];
      if (instant) { c = t; v = 0; } else {
        v += ((t - c) * 180 - v * 15) * dt; // a spring: pillars overshoot a little and settle
        c += v * dt;
        if (c < 0) { c = 0; v = 0; }
      }
      if (Math.abs(t - c) < 0.003 && Math.abs(v) < 0.02) { c = t; v = 0; L.active.delete(i); }
      L.cur[i] = c; L.vel[i] = v;
      write(L, i);
    }
    L.mesh.instanceMatrix.needsUpdate = true;
  }

  function useLayer(L) {
    if (layer === L) return;
    if (layer) layer.mesh.visible = false;
    layer = L;
    L.mesh.visible = true;
    if (L.month !== month) showMonth(L); else seedEmbers();
    setMarker(null);
  }

  // ---------- embers: sparks above cells in the top rank step for the month ----------
  const EMBERS = 360;
  const emberMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), EMBERS);
  emberMesh.frustumCulled = false;
  const emberSrc = new Int32Array(EMBERS), emberPhase = new Float32Array(EMBERS), emberSpeed = new Float32Array(EMBERS);
  for (let e = 0; e < EMBERS; e++) {
    emberPhase[e] = Math.random(); emberSpeed[e] = 0.5 + Math.random() * 0.7;
    emberMesh.setColorAt(e, col.set(Math.random() < 0.5 ? '#ffe9a8' : '#ffb347'));
  }
  emberMesh.count = 0;
  scene.add(emberMesh);

  function seedEmbers() {
    if (!layer) return;
    const hot = layer.shown.idx.filter(i => layer.step[i] === 4);
    emberMesh.count = flat || calm || !hot.length ? 0 : Math.min(EMBERS, hot.length * 4);
    for (let e = 0; e < emberMesh.count; e++) emberSrc[e] = hot[Math.floor(Math.random() * hot.length)];
  }

  function stepEmbers() {
    const arr = emberMesh.instanceMatrix.array, L = layer;
    for (let e = 0; e < emberMesh.count; e++) {
      const i = emberSrc[e], life = (time * emberSpeed[e] + emberPhase[e]) % 1, o = e * 16;
      const s = L.cur[i] > 0.01 ? L.size * 0.5 * (1 - life) : 0;
      arr[o] = arr[o + 5] = arr[o + 10] = s;
      arr[o + 12] = L.x[i] + Math.sin(emberPhase[e] * 40 + life * 5) * L.size * 0.5;
      arr[o + 13] = LAND_TOP + L.cur[i] + life * (0.25 + L.size * 3);
      arr[o + 14] = L.z[i] + Math.cos(emberPhase[e] * 70 + life * 4) * L.size * 0.5;
    }
    emberMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- smoke: one drifting cloud slab per smoky 0.5 degree block ----------
  let smokeOn = true, clouds = [];
  const maxClouds = Math.max(1, ...[...pack.smokeByMonth.values()].map(a => a.length));
  const cloudMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xe6e9ef, transparent: true, opacity: 0.5, depthWrite: false }), maxClouds * 2);
  cloudMesh.frustumCulled = false;
  cloudMesh.renderOrder = 2;
  cloudMesh.count = 0;
  scene.add(cloudMesh);

  function stepClouds() { // two small puffs per smoky block, so the ground stays visible between them
    const arr = cloudMesh.instanceMatrix.array, move = flat || calm ? 0 : 1;
    for (let k = 0; k < clouds.length * 2; k++) {
      const c = clouds[k >> 1], odd = k & 1, o = k * 16, ph = c.lon * 1.7 + c.lat * 2.3 + odd * 2;
      const size = odd ? 0.15 : 0.23;
      arr.fill(0, o, o + 16);
      arr[o] = arr[o + 10] = size; arr[o + 5] = flat ? 0.02 : size * 0.35; arr[o + 15] = 1;
      arr[o + 12] = X(c.lon) + (odd ? 0.13 : -0.1) + Math.sin(time * 0.35 + ph) * 0.06 * move;
      arr[o + 13] = (flat ? 0.2 : MAX_H * (odd ? 0.8 : 0.68)) + Math.sin(time * 0.9 + ph) * 0.06 * move;
      arr[o + 14] = Z(c.lat) + (odd ? 0.11 : -0.09);
    }
    cloudMesh.count = smokeOn ? clouds.length * 2 : 0;
    cloudMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- persistent heat sources: flat grey markers, never pillars ----------
  const staticMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.02, 0.1),
    new THREE.MeshLambertMaterial({ color: 0x8b9099 }), pack.staticCells.length);
  pack.staticCells.forEach((c, k) => staticMesh.setMatrixAt(k, mat.makeTranslation(X(c.lon), LAND_TOP + 0.011, Z(c.lat))));
  staticMesh.frustumCulled = false;
  scene.add(staticMesh);

  // ---------- area outline and selection marker ----------
  const lineY = LAND_TOP + 0.06;
  const outline = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff }));
  outline.frustumCulled = false;
  scene.add(outline);
  const marker = new THREE.LineSegments(new THREE.EdgesGeometry(geoUnit()), new THREE.LineBasicMaterial({ color: 0xffffff }));
  marker.visible = false;
  marker.frustumCulled = false;
  scene.add(marker);
  let marked = null;

  function geoUnit() { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; }

  function areaPoints(area) {
    if (area.type === 'box') {
      return [[area.lat1, area.lon1], [area.lat1, area.lon2], [area.lat2, area.lon2], [area.lat2, area.lon1]];
    }
    const pts = [], dLat = area.km / 110.57, dLon = area.km / (111.32 * Math.cos(area.lat * Math.PI / 180));
    for (let k = 0; k < 72; k++) {
      const a = k / 72 * Math.PI * 2;
      pts.push([area.lat + Math.sin(a) * dLat, area.lon + Math.cos(a) * dLon]);
    }
    return pts;
  }

  function setArea(area) {
    const pts = area ? areaPoints(area) : [];
    outline.geometry.setAttribute('position',
      new THREE.Float32BufferAttribute(pts.flatMap(([lat, lon]) => [X(lon), lineY, Z(lat)]), 3));
  }

  function setMarker(pick) {
    marked = pick && (pick.kind === 'cell' || pick.kind === 'block') ? { L: layer, i: pick.index } : null;
    marker.visible = !!marked;
  }

  // ---------- satellite: hovers above the map; hover or tap it for a fact ----------
  const sat = new THREE.Group();
  const part = (w, h, d, x, y, z, color, glow) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(x, y, z);
    sat.add(mesh);
    return mesh;
  };
  part(2, 2, 3, 0, 0, 0, 0xd9dde3);                 // body
  part(2.1, 2.1, 0.6, 0, 0, 0.7, 0xe0b040);         // gold foil band
  part(1.2, 0.3, 0.4, -1.6, 0, 0, 0x8b9099);        // struts
  part(1.2, 0.3, 0.4, 1.6, 0, 0, 0x8b9099);
  part(4, 0.2, 2.2, -4.2, 0, 0, 0x2f6fd0);          // solar panels
  part(4, 0.2, 2.2, 4.2, 0, 0, 0x2f6fd0);
  part(1.4, 0.4, 1.4, 0, -1.2, 0.3, 0xffffff);      // sensor, looking down
  part(0.3, 1.2, 0.3, 0.6, 1.6, -0.9, 0x8b9099);    // antenna
  const lamp = part(0.5, 0.5, 0.5, 0, -1.2, -1.1, 0xff4040, true); // blinking light
  const satHit = new THREE.Mesh(new THREE.BoxGeometry(13, 5, 5), new THREE.MeshBasicMaterial({ visible: false }));
  sat.add(satHit);
  scene.add(sat);

  // The satellite has its own place in the world, above the middle of the map. It bobs and turns a little,
  // and does not follow the camera.
  const SAT = { lon: 119, lat: -2.5, height: 5.5, size: 0.32 };
  sat.scale.setScalar(SAT.size);
  function stepSatellite() {
    sat.position.set(X(SAT.lon), SAT.height + (calm ? 0 : Math.sin(time * 1.4) * 0.12), Z(SAT.lat));
    sat.rotation.set(0, 0.5 + (calm ? 0 : Math.sin(time * 0.4) * 0.35), calm ? 0.1 : Math.sin(time * 0.7) * 0.12);
    lamp.visible = calm || time % 1.2 < 0.6;
  }

  // ---------- camera ----------
  const view = () => {
    const off = camera.position.clone().sub(controls.target), dist = off.length();
    return { lon: controls.target.x + LON0, lat: LAT0 - controls.target.z, dist,
      tilt: Math.acos(Math.min(1, off.y / dist)), turn: Math.atan2(off.x, off.z) };
  };
  function applyView(v) {
    controls.target.set(X(v.lon), 0, Z(v.lat));
    const s = Math.sin(Math.max(0.0005, v.tilt));
    camera.position.set(controls.target.x + v.dist * s * Math.sin(v.turn),
      v.dist * Math.cos(v.tilt), controls.target.z + v.dist * s * Math.cos(v.turn));
    camera.lookAt(controls.target);
  }
  const fitDist = span => span / (2 * Math.tan(FOV * Math.PI / 360) * Math.min(camera.aspect, 2.2));
  const homeView = () => ({ lon: 118, lat: -2.2, dist: Math.min(90, fitDist(46)), tilt: flat ? 0 : 0.8, turn: 0 });
  let tween = null;

  function flyTo(to, ms = 900) {
    const from = view();
    const goal = { ...from, ...to };
    if (flat) { goal.tilt = 0; goal.turn = 0; }
    goal.turn = from.turn + ((goal.turn - from.turn + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    if (calm || ms <= 0) { applyView(goal); controls.update(); return; }
    tween = { from, goal, t: 0, ms };
  }

  function frameArea(area) {
    if (area.type === 'pt') {
      flyTo({ lon: area.lon, lat: area.lat, dist: Math.max(3.5, fitDist(area.km / 111 * 2 * 1.9)) });
    } else {
      const w = Math.abs(area.lon2 - area.lon1), h = Math.abs(area.lat2 - area.lat1);
      if (w > 40) return flyTo(homeView());
      flyTo({ lon: (area.lon1 + area.lon2) / 2, lat: (area.lat1 + area.lat2) / 2 - (flat ? 0 : h * 0.15),
        dist: Math.max(3.5, fitDist(Math.max(w, h * 2.2) * 1.5)) });
    }
  }

  function setMode(mode) {
    flat = mode === '2d';
    controls.enableRotate = !flat;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = flat ? 0 : 1.3;
    for (const L of [cellLayer, blockLayer]) for (let i = 0; i < L.n; i++) if (L.cur[i] > 0) write(L, i);
    cellLayer.mesh.instanceMatrix.needsUpdate = blockLayer.mesh.instanceMatrix.needsUpdate = true;
    seedEmbers();
    flyTo({ tilt: flat ? 0 : 0.8, turn: 0 }, 600);
  }

  // ---------- picking ----------
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function rayAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray;
  }
  function groundAt(ray) {
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    const t = (LAND_TOP - ray.origin.y) / ray.direction.y;
    if (t < 0) return null;
    return { lon: ray.origin.x + ray.direction.x * t + LON0, lat: LAT0 - (ray.origin.z + ray.direction.z * t) };
  }
  function pick(clientX, clientY) {
    const ray = rayAt(clientX, clientY), o = ray.origin, d = ray.direction, L = layer;
    if (raycaster.intersectObject(satHit, false).length) return { kind: 'satellite' };
    let best = Infinity, hit = -1;
    const half = L.size * 0.65; // a little wider than drawn, so thin pillars are easy to hit
    for (const i of L.shown.idx) {
      const top = LAND_TOP + (flat ? 0.03 : L.cur[i]);
      let t0 = -Infinity, t1 = Infinity;
      const slabs = [[L.x[i] - half, L.x[i] + half, o.x, d.x], [0, top, o.y, d.y], [L.z[i] - half, L.z[i] + half, o.z, d.z]];
      for (const [lo, hi, oo, dd] of slabs) {
        const a = (lo - oo) / dd, b = (hi - oo) / dd;
        t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
      }
      if (t0 <= t1 && t1 > 0 && t0 < best) { best = t0; hit = i; }
    }
    if (hit >= 0) {
      const item = L.items[hit];
      return { kind: L === cellLayer ? 'cell' : 'block', index: hit, item, lat: item.lat, lon: item.lon, value: L.val[hit], month };
    }
    const g = groundAt(ray);
    if (!g) return null;
    const key = `${Math.floor(g.lat / 0.1)},${Math.floor(g.lon / 0.1)}`;
    return { kind: pack.staticKeys.has(key) ? 'static' : 'ground', lat: g.lat, lon: g.lon };
  }

  let down = null, drawing = false, drawFrom = null, hover = null;
  canvas.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY };
    if (drawing) drawFrom = groundAt(rayAt(e.clientX, e.clientY));
  });
  canvas.addEventListener('pointermove', e => {
    if (drawing && drawFrom) {
      const g = groundAt(rayAt(e.clientX, e.clientY));
      if (g) setArea({ type: 'box', lat1: drawFrom.lat, lon1: drawFrom.lon, lat2: g.lat, lon2: g.lon });
    } else if (e.pointerType === 'mouse' && !down) {
      hover = { x: e.clientX, y: e.clientY };
    }
  });
  canvas.addEventListener('pointerleave', () => { hover = null; handlers.onHover(null); });
  canvas.addEventListener('pointerup', e => {
    const start = down;
    down = null;
    if (drawing) {
      const g = groundAt(rayAt(e.clientX, e.clientY));
      const from = drawFrom;
      drawFrom = null;
      if (from && g && (Math.abs(g.lat - from.lat) > 0.05 || Math.abs(g.lon - from.lon) > 0.05)) {
        handlers.onBox({ type: 'box', lat1: from.lat, lon1: from.lon, lat2: g.lat, lon2: g.lon });
      }
      return;
    }
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return;
    const p = pick(e.clientX, e.clientY);
    if (p) { setMarker(p); handlers.onClick(p, e.clientX, e.clientY); }
  });

  function setDrawBox(on) {
    drawing = on;
    controls.enabled = !on;
    canvas.style.cursor = on ? 'crosshair' : '';
  }

  // ---------- frame loop ----------
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    const px = w >= 700 ? 3 : 2; // screen pixels per rendered pixel: the pixel-art look
    renderer.setSize(Math.max(1, Math.floor(w / px)), Math.max(1, Math.floor(h / px)), false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();
  applyView(homeView());
  controls.update();

  const sparkle = [];
  let last = performance.now(), shimmerAt = 0, wasTop = null;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; time += dt;

    if (tween) {
      tween.t = Math.min(1, tween.t + dt * 1000 / tween.ms);
      const k = tween.t < 0.5 ? 2 * tween.t * tween.t : 1 - (2 - 2 * tween.t) ** 2 / 2, a = tween.from, b = tween.goal, v = {};
      for (const key of ['lon', 'lat', 'tilt', 'turn']) v[key] = a[key] + (b[key] - a[key]) * k;
      v.dist = a.dist * (b.dist / a.dist) ** k;
      applyView(v);
      if (tween.t === 1) tween = null;
    }
    controls.target.x = Math.max(X(92), Math.min(X(144), controls.target.x));
    controls.target.z = Math.max(Z(10), Math.min(Z(-13), controls.target.z));
    controls.target.y = 0;
    controls.update();

    const v = view();
    useLayer(v.dist > LOD_DIST ? blockLayer : cellLayer);
    stepLayer(layer, dt, flat || calm);
    stepEmbers();
    stepClouds();
    stepSatellite();

    if (marked) {
      const { L, i } = marked, pulse = 1.25 + Math.sin(time * 6) * 0.12;
      marker.position.set(L.x[i], 0, L.z[i]);
      marker.scale.set(L.size * pulse, LAND_TOP + (flat ? 0.03 : L.cur[i]) + 0.03, L.size * pulse);
    }

    if (!calm && now > shimmerAt) { // sea glints: a few ocean pixels light up, then go back
      shimmerAt = now + 320;
      for (const o of sparkle) image.data.set(base.subarray(o, o + 3), o);
      sparkle.length = 0;
      for (let k = 0; k < 260; k++) {
        const p = Math.floor(Math.random() * ocean.length);
        if (!ocean[p]) continue;
        const o = p * 4;
        image.data[o] = base[o] + 26; image.data[o + 1] = base[o + 1] + 34; image.data[o + 2] = base[o + 2] + 40;
        sparkle.push(o);
      }
      gctx.putImageData(image, 0, 0);
      groundTex.needsUpdate = true;
    }

    const top = v.tilt < 0.08;
    if (top !== wasTop) { wasTop = top; handlers.onView({ top }); }
    if (hover) { const h = hover; hover = null; handlers.onHover(pick(h.x, h.y), h.x, h.y); }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return {
    baseMap: !!sample,
    setMonth(m) {
      month = m;
      clouds = pack.smokeByMonth.get(m) || [];
      if (layer) showMonth(layer);
    },
    setSmoke(on) { smokeOn = on; },
    setArea, frameArea, setMode, setDrawBox, setMarker, flyTo,
    topView() { flyTo({ tilt: 0, turn: 0 }, 600); },
    tiltView() { flyTo({ tilt: 0.8 }, 600); },
    home(ms) { flyTo(homeView(), ms); },
  };
}
