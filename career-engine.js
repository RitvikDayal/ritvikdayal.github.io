import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

if (window.__CAREER_BOOTED) { /* hot reload guard */ } else {
window.__CAREER_BOOTED = true;

const cl = (v, a, b) => Math.min(b, Math.max(a, v));
const ss = (a, b, v) => { const t = cl((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const N = 4, SPACING = 66, CAM_BACK = 52;
/* the scenes sit behind centred type — they never render at full strength */
const BG = 0.42;
const P = { cyan: 0x7fe3ff, bone: 0xeef3f7, slate: 0x1b2430, amber: 0xffb26b, dim: 0x38495c, deep: 0x0d1319 };

class SB {
  constructor(i) {
    this.group = new THREE.Group();
    this.group.position.z = -i * SPACING;
    this.mats = []; this.parts = []; this.tick = [];
  }
  reg(m) { m.transparent = true; m.userData.o0 = m.opacity; this.mats.push(m); return m; }
  std(color, o = {}) {
    return this.reg(new THREE.MeshStandardMaterial({
      color, roughness: o.rough ?? 0.5, metalness: o.metal ?? 0.5,
      emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1,
      opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide,
      depthWrite: o.depthWrite ?? false, flatShading: !!o.flat
    }));
  }
  glow(color, opacity = 1, ei = 1.2) {
    return this.reg(new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: color, emissiveIntensity: ei, roughness: 1, metalness: 0,
      opacity, depthWrite: false
    }));
  }
  basic(opacity = 1) {
    return this.reg(new THREE.MeshBasicMaterial({ color: 0xffffff, opacity, depthWrite: false }));
  }
  line(color, opacity = 0.45) {
    return this.reg(new THREE.LineBasicMaterial({ color, opacity, depthWrite: false }));
  }
  wire(geo, color = P.cyan, opacity = 0.42) {
    return new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.line(color, opacity));
  }
  seg(pts, color = P.cyan, opacity = 0.35) {
    return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), this.line(color, opacity));
  }
  add(o, parent) { (parent || this.group).add(o); return o; }
  part(o, dir, amt = 1) {
    o.userData.b = o.position.clone();
    o.userData.d = dir.clone().normalize().multiplyScalar(amt);
    this.parts.push(o); return o;
  }
  each(fn) { this.tick.push(fn); }
  run(t, e) {
    for (const o of this.parts) o.position.copy(o.userData.b).addScaledVector(o.userData.d, e);
    for (const fn of this.tick) fn(t, e);
  }
}

const grid = (sb, y, s = 90, n = 26, op = 0.1) => {
  const pts = [], h = s / 2;
  for (let i = 0; i <= n; i++) {
    const p = -h + (s * i) / n;
    pts.push(new THREE.Vector3(-h, y, p), new THREE.Vector3(h, y, p));
    pts.push(new THREE.Vector3(p, y, -h), new THREE.Vector3(p, y, h));
  }
  return sb.seg(pts, P.dim, op);
};

/* ============================ 01 · SWE III — the 3D BIM model, in the browser */
function stBim(i) {
  const sb = new SB(i);
  const model = new THREE.Group(); sb.add(model);
  /* a building, floor by floor, drawn as wireframe volumes */
  const floors = 6, per = 9;
  for (let f = 0; f < floors; f++) {
    const y = -13 + f * 4.4;
    for (let k = 0; k < per; k++) {
      const w = 2.6 + ((k * 7 + f * 3) % 5) * 1.5;
      const d = 2.4 + ((k * 5 + f * 2) % 4) * 1.4;
      const hh = 3.1;
      const geo = new THREE.BoxGeometry(w, hh, d);
      const b = sb.wire(geo, (f === 2 && k === 4) ? P.amber : P.cyan, (f === 2 && k === 4) ? 0.62 : 0.3);
      const a = (k / per) * Math.PI * 2 + f * 0.22;
      b.position.set(Math.cos(a) * (7 + (k % 3) * 3.4), y, Math.sin(a) * (6.4 + (k % 4) * 2.6));
      b.rotation.y = a * 0.4;
      model.add(b);
      if (k % 4 === 0) {
        const solid = new THREE.Mesh(geo, sb.std(P.deep, { opacity: 0.55, rough: 0.5, metal: 0.5 }));
        solid.position.copy(b.position); solid.rotation.copy(b.rotation); model.add(solid);
      }
    }
    const slab = new THREE.Mesh(new THREE.BoxGeometry(30, 0.14, 26), sb.std(P.slate, { opacity: 0.16, rough: 0.4, metal: 0.6 }));
    slab.position.y = y - 1.65; model.add(slab);
    model.add(sb.wire(new THREE.BoxGeometry(30, 0.14, 26), P.cyan, 0.14)).position.y = y - 1.65;
  }
  /* review markup floating over the model */
  const marks = [];
  for (let k = 0; k < 5; k++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.5 + k * 0.2, 0.035, 5, 44), sb.glow(P.amber, 0.85, 1.7));
    r.position.set(Math.sin(k * 2.1) * 11, -9 + k * 4.6, Math.cos(k * 1.7) * 8);
    r.rotation.set(1.2, k, 0.3);
    sb.add(r); marks.push(r);
  }
  sb.add(grid(sb, -15.5));
  sb.each((t, e) => {
    model.rotation.y += 0.0016;
    model.position.y = Math.sin(t * 1.4) * 0.4;
    marks.forEach((m, k) => {
      m.rotation.z += 0.008;
      m.material.emissiveIntensity = 1.1 + 1.4 * Math.abs(Math.sin(t * 4 + k * 1.4));
      m.scale.setScalar(1 + e * 0.3);
    });
  });
  return sb;
}

/* =================================== 02 · SWE II — agents, tools and pipelines */
function stAgent(i) {
  const sb = new SB(i);
  const core = sb.add(new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 1), sb.std(P.deep, { opacity: 0.7, rough: 0.24, metal: 1, flat: true })));
  core.add(sb.wire(new THREE.IcosahedronGeometry(3.6, 1), P.cyan, 0.5));
  const hot = sb.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), sb.glow(P.amber, 0.9, 1.8)));
  const tools = [], seg = [], tp = [];
  for (let k = 0; k < 22; k++) {
    const a = k * 2.399, y = 1 - (2 * k) / 22, r = Math.sqrt(Math.max(0, 1 - y * y));
    const p = new THREE.Vector3(Math.cos(a) * r * 13.5, y * 11, Math.sin(a) * r * 13.5);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), sb.glow(P.cyan, 0.9, 1.3));
    tl.position.copy(p); sb.add(tl); tools.push(tl); tp.push(p);
    seg.push(new THREE.Vector3(0, 0, 0), p);
  }
  sb.add(sb.seg(seg, P.cyan, 0.16));
  const ring = sb.add(new THREE.Mesh(new THREE.TorusGeometry(15, 0.04, 6, 120), sb.glow(P.cyan, 0.4, 1.1)));
  ring.rotation.x = 1.32;
  const sparks = [];
  for (let k = 0; k < 6; k++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), sb.glow(P.amber, 1, 2.6));
    sb.add(s); sparks.push(s);
  }
  sb.add(grid(sb, -15));
  sb.each((t, e) => {
    core.rotation.y += 0.005; core.rotation.x += 0.0016;
    hot.rotation.y -= 0.01;
    hot.scale.setScalar(1 + 0.1 * Math.sin(t * 34));
    ring.rotation.z += 0.0022;
    const w = ss(0.06, 0.66, t);
    tools.forEach((tl, k) => {
      const on = cl((w * 1.5 - k / 22) * 5, 0, 1);
      tl.scale.setScalar(0.3 + 0.7 * on + e * 0.2);
    });
    sparks.forEach((s, k) => {
      const f = (t * 0.8 + k * 0.17) % 1, tgt = tp[(k * 5 + 2) % 22];
      s.position.copy(tgt).multiplyScalar(1 - f);
      s.material.opacity = Math.sin(f * Math.PI) * 0.9;
    });
  });
  return sb;
}

/* ============================= 03 · GeeksforGeeks — sandbox, mesh and latency */
function stSandbox(i) {
  const sb = new SB(i);
  for (let k = 0; k < 3; k++) {
    const s = 8 + k * 3.4, g = new THREE.Group();
    const geo = new THREE.BoxGeometry(s, s * 0.72, s);
    g.add(new THREE.Mesh(geo, sb.std(P.slate, { opacity: 0.1 + k * 0.03, rough: 0.2, metal: 0.9 })), sb.wire(geo, k === 0 ? P.amber : P.cyan, 0.46 - k * 0.1));
    g.position.set(-7, 1.5, 0);
    sb.add(g); sb.part(g, new THREE.Vector3(-0.2, 0.35 + k * 0.2, 0.4), 1.8 + k * 3);
  }
  const lm = sb.glow(P.bone, 0.72, 0.7);
  for (let k = 0; k < 14; k++) {
    const w = 1.6 + ((k * 7) % 5) * 0.9;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, 0.18), lm);
    b.position.set(-10.4 + w / 2 + (k % 3) * 0.6, 4.4 - k * 0.5, 0);
    sb.add(b);
  }
  const nodes = [], np = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const n = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), sb.glow(P.cyan, 0.9, 1.3));
    n.position.set(13 + Math.cos(a) * 5.4, Math.sin(a) * 5.4, -3 + Math.sin(a * 2) * 2.4);
    sb.add(n); nodes.push(n); np.push(n.position);
  }
  const ring = []; for (let k = 0; k < 8; k++) ring.push(np[k], np[(k + 1) % 8]);
  sb.add(sb.seg(ring, P.cyan, 0.24));
  const lat = [];
  for (let k = 0; k < 24; k++) {
    lat.push(new THREE.Vector3(-15 + k * 1.3, -12 + Math.pow(1 - k / 23, 1.7) * 6.4 + Math.sin(k * 1.9) * 0.24, 4));
  }
  const poly = []; for (let k = 1; k < lat.length; k++) poly.push(lat[k - 1], lat[k]);
  const curve = sb.add(sb.seg(poly, P.amber, 0.6));
  const dot = sb.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), sb.glow(P.amber, 0.95, 2.4)));
  sb.add(grid(sb, -15));
  sb.each((t, e) => {
    nodes.forEach((n, k) => { n.rotation.y += 0.012; n.scale.setScalar(0.72 + 0.28 * Math.sin(t * 4 + k) + e * 0.2); });
    const q = ss(0.1, 0.7, t) * (lat.length - 1);
    const i0 = cl(Math.floor(q), 0, lat.length - 2);
    dot.position.lerpVectors(lat[i0], lat[i0 + 1], q - i0);
    curve.material.opacity = (0.25 + 0.4 * ss(0.08, 0.42, t)) * BG;
  });
  return sb;
}

/* =========================================== 04 · Disecto — first integrations */
function stIntegrations(i) {
  const sb = new SB(i);
  const hub = sb.add(new THREE.Mesh(new THREE.OctahedronGeometry(3, 1), sb.std(P.deep, { opacity: 0.7, rough: 0.3, metal: 1, flat: true })));
  hub.add(sb.wire(new THREE.OctahedronGeometry(3.2, 1), P.cyan, 0.55));
  const arcs = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4, r = 15;
    const px = Math.cos(a) * r, pz = Math.sin(a) * r * 0.55;
    const g = new THREE.Group(); g.position.set(px, Math.sin(k * 1.7) * 2.6, pz);
    const geo = new THREE.BoxGeometry(3, 11, 3);
    g.add(new THREE.Mesh(geo, sb.std(P.slate, { opacity: 0.5, rough: 0.35, metal: 0.85 })), sb.wire(geo, k === 1 ? P.amber : P.cyan, 0.42));
    sb.add(g); sb.part(g, new THREE.Vector3(Math.cos(a), 0.14, Math.sin(a) * 0.55), 3.8);
    const mid = new THREE.Vector3(px * 0.5, 7.4, pz * 0.5);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(px, g.position.y + 1, pz), mid, new THREE.Vector3(0, 0.6, 0));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 34, 0.06, 6, false), sb.glow(k === 1 ? P.amber : P.cyan, 0.8, 1.6));
    sb.add(tube); arcs.push(tube);
  }
  const fm = sb.basic(0.9);
  const feats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.86, 0.86, 0.86), fm, 10);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  for (let k = 0; k < 10; k++) { m4.setPosition(-8.6 + k * 1.9, -11.4, 2); feats.setMatrixAt(k, m4); }
  feats.instanceMatrix.needsUpdate = true; sb.add(feats);
  sb.add(grid(sb, -15));
  sb.each((t, e) => {
    hub.rotation.y += 0.006; hub.rotation.x += 0.002;
    const w = ss(0.1, 0.74, t);
    arcs.forEach((a, k) => { a.material.emissiveIntensity = 1 + 1.4 * Math.abs(Math.sin(t * 5 + k * 1.3)); });
    for (let k = 0; k < 10; k++) {
      const v = cl((w * 1.35 - k / 10) * 5, 0, 1) * 0.8;
      c.setRGB(v * 0.4, v * 0.85, v).convertSRGBToLinear(); feats.setColorAt(k, c);
    }
    feats.instanceColor.needsUpdate = true;
  });
  return sb;
}

const CAM = [
  { ax: -4, ay: 1.6, roll: 0.04, fov: 3 }, { ax: 4.5, ay: -1.4, roll: -0.04, fov: -3 },
  { ax: -4.5, ay: 2.2, roll: 0.04, fov: 4 }, { ax: 3.5, ay: 1.4, roll: -0.03, fov: -3 }
];

const Grade = {
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uG: { value: 0.05 }, uV: { value: 1 }, uA: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uT,uG,uV,uA; varying vec2 vUv;
    void main(){
      vec2 uv=vUv; vec2 c=uv-0.5; float r=length(c);
      float ab=uA*(0.0014+r*r*0.011);
      vec3 col;
      col.r=texture2D(tDiffuse,uv+c*ab).r;
      col.g=texture2D(tDiffuse,uv).g;
      col.b=texture2D(tDiffuse,uv-c*ab).b;
      float bl=0.003*smoothstep(0.28,1.0,r);
      vec3 s=texture2D(tDiffuse,uv+vec2(bl,0.0)).rgb+texture2D(tDiffuse,uv-vec2(bl,0.0)).rgb
            +texture2D(tDiffuse,uv+vec2(0.0,bl)).rgb+texture2D(tDiffuse,uv-vec2(0.0,bl)).rgb;
      col=mix(col,s*0.25,smoothstep(0.3,1.0,r)*0.7);
      float g=fract(sin(dot(uv*vec2(97.3,71.7)+uT,vec2(12.9898,78.233)))*43758.5453);
      col+=(g-0.5)*uG;
      col*=1.0-uV*smoothstep(0.2,1.1,r)*0.86;
      col*=1.0-0.02*sin(uv.y*1100.0);
      gl_FragColor=vec4(col,1.0);
    }`
};

function boot(host, wrap) {
  const cfg = () => window.__UTH_CONFIG || {};
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070a, 0.0138);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.setClearColor(0x05070a, 1);
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });
  host.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x24384d, 1.3));
  const key = new THREE.DirectionalLight(0xbfe9ff, 1.3); key.position.set(6, 12, 14); scene.add(key);
  const fill = new THREE.DirectionalLight(0x2f5f8a, 0.8); fill.position.set(-14, -6, 8); scene.add(fill);
  const rim = new THREE.PointLight(0x7fe3ff, 70, 92); scene.add(rim);

  const dn = 1400, dp = new Float32Array(dn * 3);
  for (let i = 0; i < dn; i++) {
    dp[i * 3] = (Math.random() - 0.5) * 150;
    dp[i * 3 + 1] = (Math.random() - 0.5) * 110;
    dp[i * 3 + 2] = -Math.random() * (N * SPACING + 110) + 60;
  }
  scene.add(new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(dp, 3)),
    new THREE.PointsMaterial({ color: 0x8fd4ff, size: 0.12, transparent: true, opacity: 0.34, depthWrite: false })
  ));

  const scenes = [stBim, stAgent, stSandbox, stIntegrations].map((b, ix) => {
    const sb = b(ix); scene.add(sb.group); sb.group.visible = false; return sb;
  });

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.62, 0.8);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(Grade); grade.renderToScreen = true; composer.addPass(grade);

  let W = 1, H = 1;
  function size() {
    W = host.clientWidth || innerWidth; H = host.clientHeight || innerHeight;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H, false); composer.setSize(W, H);
  }
  size();
  addEventListener('resize', size);

  const $ = (s) => document.querySelector(s);
  const caps = [], stats = [], rails = [];
  for (let i = 0; i < N; i++) {
    caps.push($(`[data-ccap="${i}"]`));
    stats.push($(`[data-cstat="${i}"]`));
    rails.push($(`[data-crail="${i}"]`));
  }
  const yearEl = $('[data-cyear]');
  const YEARS = ['2025 —', '2023 — 2025', '2021 — 2023', '2021'];
  const MAX = N - 1 + 0.5;
  const S = { cur: 0, tgt: 0, px: 0, py: 0, tpx: 0, tpy: 0 };
  host.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect();
    S.tpx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    S.tpy = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });

  let t0 = performance.now();
  function frame(now) {
    if (!host.isConnected) return;
    const el = (now - t0) / 1000;
    const wr = wrap.getBoundingClientRect();
    if (wr.bottom < -60 || wr.top > innerHeight + 60) { requestAnimationFrame(frame); return; }
    if (host.clientWidth !== W || host.clientHeight !== H) size();

    const span = Math.max(1, wrap.offsetHeight - innerHeight);
    S.tgt = cl(-wr.top / span, 0, 1) * MAX;
    S.cur += (S.tgt - S.cur) * 0.13;
    S.px += (S.tpx - S.px) * 0.05; S.py += (S.tpy - S.py) * 0.05;

    const cur = S.cur;
    let bestFocus = -1, bestIdx = S.fidx || 0;
    const camZ = -cur * SPACING + CAM_BACK;
    let ax = 0, ay = 0, roll = 0, fov = 0;
    for (let i = Math.max(0, Math.floor(cur)); i <= Math.min(N - 1, Math.floor(cur) + 1); i++) {
      const t = cur - i; if (t < 0 || t > 1) continue;
      const s = Math.sin(t * Math.PI), c = CAM[i];
      ax += c.ax * s; ay += c.ay * s; roll += c.roll * s; fov += c.fov * s;
    }
    camera.position.set(ax + S.px * 2.2, ay - S.py * 1.5, camZ);
    camera.lookAt(ax * 0.35 + S.px * 1, ay * 0.3 - S.py * 0.6, camZ - 44);
    camera.rotation.z = roll + S.px * 0.009;
    camera.fov = 46 + fov; camera.updateProjectionMatrix();
    rim.position.set(ax + 8, ay + 6, camZ - 22);

    for (let i = 0; i < N; i++) {
      const sb = scenes[i], t = cur - i;
      const live = t > -0.8 && t < 1.16;
      sb.group.visible = live;
      if (!live) { if (caps[i]) caps[i].style.opacity = 0; if (stats[i]) stats[i].style.opacity = 0; continue; }
      const a = ss(-0.74, -0.1, t) * (i === N - 1 ? 1 : (1 - ss(0.8, 1.08, t)));
      for (const m of sb.mats) m.opacity = m.userData.o0 * a * BG;
      const tc = cl(t, 0, 1);
      const e = ss(0.05, 0.44, tc) * (1 - ss(0.66, 0.98, tc));
      sb.run(tc, e);
      const focus = ss(-0.06, 0.08, t) * (1 - (i === N - 1 ? ss(0.42, 0.62, t) : ss(0.78, 0.94, t)));
      if (focus > bestFocus) { bestFocus = focus; bestIdx = i; }
      if (caps[i]) {
        caps[i].style.opacity = focus;
        caps[i].style.transform = `translate3d(0,${(1 - focus) * 18}px,0)`;
      }
      if (stats[i]) stats[i].style.opacity = focus * 0.95;
    }
    if (bestFocus > 0.02) S.fidx = bestIdx;
    const idx = S.fidx || 0;
    for (let i = 0; i < N; i++) if (rails[i]) {
      const on = i === idx;
      rails[i].style.opacity = on ? 1 : 0.26;
      rails[i].style.transform = `translateX(${on ? 6 : 0}px)`;
    }
    if (yearEl) yearEl.textContent = YEARS[idx];

    const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    grade.uniforms.uT.value = el;
    grade.uniforms.uG.value = rm ? 0.02 : (cfg().grain ?? 0.05);
    grade.uniforms.uA.value = rm ? 0.2 : 1;
    composer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

(function watch() {
  const host = document.getElementById('career-stage');
  const wrap = document.getElementById('career-wrap');
  if (host && wrap && host.clientWidth && !host.dataset.careerBooted) {
    host.dataset.careerBooted = '1';
    try { boot(host, wrap); } catch (err) {
      console.error('[career]', err);
      host.innerHTML = '<div style="position:absolute;inset:0;display:grid;place-items:center;color:#7fe3ff;font:12px ui-monospace,monospace;letter-spacing:.2em">WEBGL UNAVAILABLE</div>';
    }
  }
  requestAnimationFrame(watch);
})();
}
