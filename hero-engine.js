import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

if (window.__UTH_HERO_BOOTED) { /* hot reload guard */ } else {
window.__UTH_HERO_BOOTED = true;

/* ------------------------------------------------------------------ math */
const cl = (v, a, b) => Math.min(b, Math.max(a, v));
const ss = (a, b, v) => { const t = cl((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

/* ------------------------------------------------------------- constants */
const N = 7, SPACING = 60, CAM_BACK = 44;
const P = { cyan: 0x7fe3ff, bone: 0xeef3f7, slate: 0x1b2430, amber: 0xffb26b, dim: 0x38495c, deep: 0x0d1319 };

/* ------------------------------------------------------- builder helpers */
class SB {
  constructor(i) {
    this.i = i;
    this.group = new THREE.Group();
    this.group.position.z = -i * SPACING;
    this.mats = [];
    this.parts = [];
    this.anchors = [];
    this.tick = [];
  }
  reg(m) { m.transparent = true; m.userData.o0 = m.opacity; this.mats.push(m); return m; }
  std(color, o = {}) {
    return this.reg(new THREE.MeshStandardMaterial({
      color, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0.35,
      emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1,
      opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide,
      depthWrite: o.depthWrite ?? true, flatShading: !!o.flat
    }));
  }
  glow(color, opacity = 1, ei = 1.6) {
    return this.reg(new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: color, emissiveIntensity: ei, roughness: 1, metalness: 0,
      opacity, depthWrite: opacity > 0.9
    }));
  }
  basic(opacity = 1, dw = true) {
    return this.reg(new THREE.MeshBasicMaterial({ color: 0xffffff, opacity, depthWrite: dw, toneMapped: true }));
  }
  line(color, opacity = 0.5) {
    return this.reg(new THREE.LineBasicMaterial({ color, opacity, depthWrite: false }));
  }
  /* wire box / any geometry outline */
  wire(geo, color = P.cyan, opacity = 0.45) {
    return new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.line(color, opacity));
  }
  seg(pts, color = P.cyan, opacity = 0.4) {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.LineSegments(g, this.line(color, opacity));
  }
  add(o, parent) { (parent || this.group).add(o); return o; }
  /* register an object that flies apart; dir in local space */
  part(o, dir, amt = 1, spin = 0) {
    o.userData.b = o.position.clone();
    o.userData.d = dir.clone().normalize().multiplyScalar(amt);
    o.userData.r0 = o.rotation.clone();
    o.userData.spin = spin;
    this.parts.push(o);
    return o;
  }
  anchor(x, y, z) { this.anchors.push(new THREE.Vector3(x, y, z)); }
  each(fn) { this.tick.push(fn); }
  /* default part animation */
  run(t, e) {
    for (const o of this.parts) {
      o.position.copy(o.userData.b).addScaledVector(o.userData.d, e);
      if (o.userData.spin) {
        o.rotation.set(o.userData.r0.x, o.userData.r0.y + o.userData.spin * e, o.userData.r0.z + o.userData.spin * e * 0.4);
      }
    }
    for (const fn of this.tick) fn(t, e);
  }
}

const ENV = { grid: (sb, y, s = 60, n = 24, color = P.dim, op = 0.13) => {
  const pts = [], h = s / 2;
  for (let i = 0; i <= n; i++) {
    const p = -h + (s * i) / n;
    pts.push(new THREE.Vector3(-h, y, p), new THREE.Vector3(h, y, p));
    pts.push(new THREE.Vector3(p, y, -h), new THREE.Vector3(p, y, h));
  }
  return sb.seg(pts, color, op);
} };

/* ============================================================ 01 SURFACE */
function s01() {
  const sb = new SB(0);
  const paneGeo = new THREE.PlaneGeometry(30, 17);
  const names = [0.07, 0.09, 0.11, 0.13, 0.17];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    g.position.set(0, 0, -i * 1.2);
    const face = new THREE.Mesh(paneGeo, sb.std(P.slate, { opacity: names[i], rough: 0.5, metal: 0.3, depthWrite: false }));
    g.add(face, sb.wire(paneGeo, i === 0 ? P.cyan : P.dim, i === 0 ? 0.5 : 0.28));
    sb.add(g); sb.part(g, new THREE.Vector3(i * 0.22 - 0.2, i * 0.12, -1), 5.5 + i * 2.6);
  }
  /* pixel field on the surface pane */
  const cols = 46, rows = 26, pg = new THREE.BoxGeometry(0.5, 0.5, 0.05);
  const pm = sb.basic(1);
  const px = new THREE.InstancedMesh(pg, pm, cols * rows);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  let k = 0; const seeds = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    m4.setPosition((x - cols / 2 + 0.5) * 0.62, (y - rows / 2 + 0.5) * 0.62, 0.5);
    px.setMatrixAt(k, m4);
    seeds.push([Math.hypot((x - cols * 0.62) * 0.62, (y - rows * 0.5) * 0.62) / 15, Math.random() < 0.13 ? 1 : 0]);
    px.setColorAt(k, col.setRGB(0, 0, 0)); k++;
  }
  px.instanceMatrix.needsUpdate = true;
  sb.add(px);
  /* cursor */
  const ring = sb.add(new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.055, 8, 40), sb.glow(P.bone, 1, 2.4)));
  ring.position.set(4.2, 1.4, 1.1);
  const pulse = sb.add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 48), sb.glow(P.cyan, 1, 3)));
  pulse.position.copy(ring.position);
  sb.each((t) => {
    const hit = ss(0.10, 0.30, t);
    const s = 1 + hit * 9; pulse.scale.setScalar(s);
    pulse.material.opacity = (1 - hit) * 0.9;
    ring.scale.setScalar(1 - 0.25 * Math.sin(ss(0.06, 0.16, t) * Math.PI));
    const wave = ss(0.10, 0.70, t);
    for (let i = 0; i < seeds.length; i++) {
      const f = wave * 1.5 - seeds[i][0];
      const ripple = Math.exp(-Math.pow(f * 6.5, 2)) * 0.62;
      const v = Math.min(0.95, ripple * 1.35 + seeds[i][1] * 0.14 * cl(wave * 3, 0, 1));
      col.setRGB(v * 0.34, v * 0.82, v).convertSRGBToLinear();
      px.setColorAt(i, col);
    }
    px.instanceColor.needsUpdate = true;
  });
  sb.anchor(4.6, 2.6, 2); sb.anchor(-13, 5.5, -8); sb.anchor(-9, -6.5, 1); sb.anchor(11, -4, -14);
  return sb;
}

/* =========================================================== 02 COMPILER */
function s02() {
  const sb = new SB(1);
  /* source lines */
  const lm = sb.glow(P.bone, 0.85, 0.9), lm2 = sb.glow(P.cyan, 0.7, 1.1);
  for (let i = 0; i < 30; i++) {
    const w = 2 + Math.random() * 9, ind = (i % 5 === 0 ? 0 : (i % 3) * 0.9);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, 0.22), i % 4 === 0 ? lm2 : lm);
    b.position.set(-16 + ind + w / 2, 8.6 - i * 0.62, 0);
    sb.add(b); sb.part(b, new THREE.Vector3(-0.9, (i - 15) * 0.05, 0.2), 3 + (i % 7));
  }
  /* prism */
  const prism = sb.add(new THREE.Mesh(new THREE.OctahedronGeometry(3.4, 0), sb.std(P.slate, { opacity: 0.22, rough: 0.05, metal: 1, depthWrite: false })));
  prism.add(sb.wire(new THREE.OctahedronGeometry(3.4, 0), P.cyan, 0.7));
  sb.part(prism, new THREE.Vector3(0, 0, 0.2), 1, 1.3);
  /* machine code lattice */
  const bg = new THREE.BoxGeometry(0.52, 0.52, 0.52), bm = sb.basic(1);
  const lat = new THREE.InstancedMesh(bg, bm, 16 * 9 * 3);
  const m4 = new THREE.Matrix4(), c = new THREE.Color(); let k = 0; const ord = [];
  for (let z = 0; z < 3; z++) for (let y = 0; y < 9; y++) for (let x = 0; x < 16; x++) {
    m4.setPosition(9 + x * 0.78, 3.2 - y * 0.78, -z * 0.78);
    lat.setMatrixAt(k, m4); ord.push((x / 16) * 0.7 + Math.random() * 0.3); k++;
  }
  lat.instanceMatrix.needsUpdate = true; sb.add(lat);
  const beam = sb.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.9, 22, 12, 1, true), sb.glow(P.cyan, 0.16, 1.2)));
  beam.rotation.z = Math.PI / 2; beam.position.set(2, 0, 0);
  sb.each((t) => {
    const w = ss(0.18, 0.72, t);
    for (let i = 0; i < ord.length; i++) {
      const v = cl((w * 1.4 - ord[i]) * 4, 0, 1) * 0.85;
      c.setRGB(v * 0.32, v * 0.78, v).convertSRGBToLinear(); lat.setColorAt(i, c);
    }
    lat.instanceColor.needsUpdate = true;
    beam.material.opacity = 0.05 + 0.16 * Math.sin(ss(0.1, 0.8, t) * Math.PI);
  });
  sb.anchor(-13, 9.6, 2); sb.anchor(0, 4.6, 1); sb.anchor(2.4, -5.4, 0); sb.anchor(15, 4.6, 0);
  return sb;
}

/* ============================================================= 03 KERNEL */
function s03() {
  const sb = new SB(2);
  /* memory wall */
  const cg = new THREE.BoxGeometry(0.62, 0.62, 0.16), cm = sb.basic(1);
  const cells = new THREE.InstancedMesh(cg, cm, 40 * 22);
  const m4 = new THREE.Matrix4(), c = new THREE.Color(); let k = 0; const st = [];
  for (let y = 0; y < 22; y++) for (let x = 0; x < 40; x++) {
    m4.setPosition((x - 19.5) * 0.78, (y - 10.5) * 0.78, -14);
    cells.setMatrixAt(k++, m4); st.push(Math.random());
  }
  cells.instanceMatrix.needsUpdate = true; sb.add(cells);
  /* core */
  const core = sb.add(new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 1), sb.std(P.deep, { opacity: 0.85, rough: 0.25, metal: 1, flat: true })));
  core.add(sb.wire(new THREE.IcosahedronGeometry(3.4, 1), P.cyan, 0.55));
  const hot = sb.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), sb.glow(P.amber, 1, 2.2)));
  /* page tables */
  for (let i = 0; i < 4; i++) {
    const pl = new THREE.Group();
    const g = new THREE.BoxGeometry(9, 0.22, 9);
    pl.add(new THREE.Mesh(g, sb.std(P.slate, { opacity: 0.5, rough: 0.3, metal: 0.8 })), sb.wire(g, P.cyan, 0.35));
    pl.position.set(0, -7 + i * 0.34, 0);
    sb.add(pl); sb.part(pl, new THREE.Vector3(0, -1, 0), 1.6 + i * 2.4);
  }
  /* process rings */
  const rings = [];
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(5.2 + i * 1.9, 0.055, 6, 96), sb.glow(i === 1 ? P.amber : P.cyan, 0.75, 1.5));
    r.rotation.set(1.1 + i * 0.28, i * 0.5, i * 0.7);
    sb.add(r); rings.push(r);
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), sb.glow(P.bone, 1, 1.8));
    r.add(pod); pod.position.x = 5.2 + i * 1.9;
  }
  sb.add(ENV.grid(sb, -13, 70, 22));
  sb.each((t, e) => {
    core.rotation.y += 0.004; core.rotation.x += 0.0016;
    hot.scale.setScalar(1 + 0.12 * Math.sin(t * 60) + e * 0.5);
    hot.material.emissiveIntensity = 1.6 + 1.6 * ss(0.2, 0.6, t);
    rings.forEach((r, i) => { r.rotation.z += 0.003 + i * 0.0016; r.scale.setScalar(1 + e * 0.1 * (i + 1)); });
    const w = ss(0.12, 0.7, t);
    for (let i = 0; i < st.length; i++) {
      const v = st[i] < w ? (0.04 + (Math.sin(st[i] * 120 + t * 7) > 0.6 ? 0.72 : 0)) : 0.02;
      c.setRGB(v * 0.3, v * 0.75, v).convertSRGBToLinear(); cells.setColorAt(i, c);
    }
    cells.instanceColor.needsUpdate = true;
  });
  sb.anchor(3.6, 3.4, 1); sb.anchor(-15, 6, -13); sb.anchor(9.5, -10.5, 0); sb.anchor(-11.5, -4, 3);
  return sb;
}

/* ============================================================= 04 PACKET */
function s04() {
  const sb = new SB(3);
  const L = 17, sleeves = [
    { r: 3.6, c: P.dim, o: 0.16 }, { r: 2.85, c: P.cyan, o: 0.2 },
    { r: 2.1, c: P.cyan, o: 0.24 }, { r: 1.4, c: P.amber, o: 0.3 }
  ];
  sleeves.forEach((s, i) => {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(s.r, s.r, L - i * 1.6, 34, 1, true);
    const sk = new THREE.Mesh(geo, sb.std(s.c, { opacity: s.o, rough: 0.15, metal: 1, side: THREE.DoubleSide, depthWrite: false }));
    sk.rotation.z = Math.PI / 2; g.add(sk);
    const rings = [];
    for (let j = 0; j <= 6; j++) {
      const rr = new THREE.Mesh(new THREE.TorusGeometry(s.r, 0.028, 5, 60), sb.glow(s.c, 0.6, 1.4));
      rr.rotation.y = Math.PI / 2; rr.position.x = -(L - i * 1.6) / 2 + (j * (L - i * 1.6)) / 6; g.add(rr); rings.push(rr);
    }
    sb.add(g); sb.part(g, new THREE.Vector3(-0.15, 1, 0.25), 5.5 + i * 3.4);
  });
  /* payload bits */
  const bg = new THREE.BoxGeometry(0.34, 0.34, 0.34), bm = sb.glow(P.cyan, 0.95, 0.6);
  const bits = new THREE.InstancedMesh(bg, bm, 260);
  const m4 = new THREE.Matrix4(); const bp = [];
  for (let i = 0; i < 260; i++) {
    const x = -6.5 + (i / 260) * 13, a = i * 1.7, r = 0.75 * Math.sqrt((i % 13) / 13);
    bp.push([x, Math.cos(a) * r, Math.sin(a) * r]);
    m4.setPosition(x, Math.cos(a) * r, Math.sin(a) * r); bits.setMatrixAt(i, m4);
  }
  bits.instanceMatrix.needsUpdate = true; sb.add(bits);
  /* header ticks */
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.12), sb.glow(P.cyan, 0.8, 1.4));
    t.position.set(-7 + i * 3.5, 4.4, 0); sb.add(t); sb.part(t, new THREE.Vector3(0, 1, 0), 3 + i * 0.4);
  }
  sb.each((t, e) => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < 260; i++) {
      const [x, y, z] = bp[i], w = 1 + e * 0.15;
      m.makeRotationX(t * 2 + i * 0.02); m.setPosition(x * w, y * (1 + e * 0.6), z * (1 + e * 0.6));
      bits.setMatrixAt(i, m);
    }
    bits.instanceMatrix.needsUpdate = true;
  });
  sb.anchor(-9.5, 8, 0); sb.anchor(9, 5.4, 3); sb.anchor(0.5, -1.2, 1.5); sb.anchor(-6, -8, -2);
  return sb;
}

/* ============================================================= 05 LOOKUP */
function s05() {
  const sb = new SB(4);
  const nm = sb.glow(P.cyan, 1, 1.5), nmb = sb.glow(P.bone, 1, 2), lm = sb.line(P.cyan, 0.22);
  const nodes = [];
  const mk = (x, y, z, s, m) => {
    const n = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), m);
    n.position.set(x, y, z); sb.add(n); nodes.push(n); return n;
  };
  const root = mk(0, 9, 0, 0.85, nmb);
  const tlds = [], auth = [];
  for (let i = 0; i < 4; i++) tlds.push(mk((i - 1.5) * 6.4, 3.2, -1 + (i % 2) * 2, 0.6, nm));
  for (let i = 0; i < 10; i++) auth.push(mk(-14 + i * 3.1, -3.4, -3 + (i % 3) * 2.4, 0.42, nm));
  const pts = [];
  tlds.forEach(t => pts.push(root.position, t.position));
  auth.forEach((a, i) => pts.push(tlds[i % 4].position, a.position));
  sb.add(sb.seg(pts, P.cyan, 0.2));
  /* hop chain down the corridor */
  const hops = [], hp = [];
  for (let i = 0; i < 13; i++) {
    const x = Math.sin(i * 0.9) * 5.5, y = -9 + Math.cos(i * 0.7) * 1.8, z = 4 - i * 3.4;
    const h = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), sb.std(P.slate, { opacity: 0.8, rough: 0.3, metal: 0.9 }));
    h.position.set(x, y, z); h.rotation.set(0.4, i, 0.2);
    h.add(sb.wire(new THREE.BoxGeometry(1.6, 1.6, 1.6), P.cyan, 0.5));
    sb.add(h); hops.push(h); hp.push(h.position);
    if (i) pts.length = 0;
  }
  const hl = []; for (let i = 1; i < hp.length; i++) hl.push(hp[i - 1], hp[i]);
  sb.add(sb.seg(hl, P.amber, 0.3));
  const pulse = sb.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 14), sb.glow(P.amber, 1, 3.4)));
  sb.each((t, e) => {
    nodes.forEach((n, i) => { n.rotation.y += 0.01 + i * 0.001; n.scale.setScalar(1 + e * 0.2); });
    const q = ss(0.08, 0.55, t) * (hp.length - 1);
    const i0 = cl(Math.floor(q), 0, hp.length - 2), f = q - i0;
    pulse.position.lerpVectors(hp[i0], hp[i0 + 1], f);
    pulse.material.emissiveIntensity = 2.4 + 2 * Math.sin(t * 40);
    hops.forEach((h, i) => { h.rotation.y += 0.004; h.scale.setScalar(1 + (i <= q ? 0.28 : 0) + e * 0.1); });
  });
  sb.anchor(1.4, 10.4, 0); sb.anchor(-10, 4.4, 0); sb.anchor(13, -2.2, 0); sb.anchor(-6.5, -11.5, 0);
  return sb;
}

/* ========================================================== 06 HANDSHAKE */
function s06() {
  const sb = new SB(5);
  [-1, 1].forEach((s, i) => {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(4.4, 13, 4.4);
    g.add(new THREE.Mesh(geo, sb.std(P.deep, { opacity: 0.9, rough: 0.25, metal: 1 })), sb.wire(geo, i ? P.amber : P.cyan, 0.5));
    for (let j = 0; j < 6; j++) {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.1, 0.4), sb.glow(i ? P.amber : P.cyan, 0.8, 1.5));
      sl.position.set(0, -5 + j * 2, 2.2); g.add(sl);
    }
    g.position.set(s * 13.5, 0, 0);
    sb.add(g); sb.part(g, new THREE.Vector3(s, 0.1, 0), 3.2);
  });
  /* tunnel */
  const rings = [];
  for (let i = 0; i < 26; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.035, 5, 64), sb.glow(P.cyan, 0.55, 1.3));
    r.rotation.y = Math.PI / 2; r.position.set(-11 + i * 0.88, 2.6, 0);
    sb.add(r); rings.push(r);
  }
  const beam = sb.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 24, 10), sb.glow(P.bone, 0.3, 1.1)));
  beam.rotation.z = Math.PI / 2; beam.position.y = 2.6;
  /* interlocking keys */
  const keys = [];
  [-1, 1].forEach((s, i) => {
    const k = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.22, 10, 60), sb.std(i ? P.amber : P.cyan, { rough: 0.2, metal: 1, emissive: i ? P.amber : P.cyan, ei: 0.5 }));
    k.position.set(s * 1.3, 6.5, 0); k.rotation.y = i * 1.2;
    sb.add(k); keys.push(k); sb.part(k, new THREE.Vector3(s, 0.4, 0), 2.4, 1.6);
  });
  /* cipher shell */
  const sg = new THREE.BoxGeometry(0.3, 0.3, 0.3), sm = sb.glow(P.cyan, 0.9, 1.6);
  const shell = new THREE.InstancedMesh(sg, sm, 420); const m4 = new THREE.Matrix4(); const sp = [];
  for (let i = 0; i < 420; i++) {
      const a = i * 0.61, x = -11 + (i / 420) * 22, r = 3.4;
      sp.push([x, 2.6 + Math.cos(a) * r, Math.sin(a) * r]);
  }
  sb.add(shell);
  sb.each((t, e) => {
    const open = ss(0.1, 0.5, t), close = ss(0.5, 0.85, t);
    rings.forEach((r, i) => {
      const d = Math.abs(i / 25 - 0.5) * 2;
      r.scale.setScalar(0.15 + 0.85 * cl((open * 1.7 - d), 0, 1) + e * 0.18);
      r.material.opacity = 0.2 + 0.5 * cl(open * 1.7 - d, 0, 1);
    });
    beam.scale.set(1, cl(open * 1.3, 0, 1), 1);
    beam.material.opacity = 0.08 + 0.22 * Math.sin(open * Math.PI);
    keys.forEach((k, i) => { k.rotation.z += 0.006 * (i ? -1 : 1); });
    const m = new THREE.Matrix4();
    for (let i = 0; i < 420; i++) {
      const [x, y, z] = sp[i], g = cl(close * 1.5 - (i / 420) * 0.5, 0, 1);
      m.makeRotationY(t * 3 + i); m.setPosition(x, 2.6 + (y - 2.6) * (0.4 + 0.6 * g), z * (0.4 + 0.6 * g));
      shell.setMatrixAt(i, m);
    }
    shell.instanceMatrix.needsUpdate = true;
    sm.opacity = 0.9 * close;
  });
  sb.anchor(-14, 8.6, 0); sb.anchor(14.5, 8, 0); sb.anchor(0, 10.2, 0); sb.anchor(0, -3.2, 2);
  return sb;
}

/* ============================================================== 07 CABLE */
function s07() {
  const sb = new SB(6);
  const globe = new THREE.Group(); globe.position.set(7, 1, -12); sb.add(globe);
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(13, 40, 26), sb.std(P.deep, { opacity: 0.72, rough: 0.6, metal: 0.4 })));
  const wf = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(13.05, 28, 18)), sb.line(P.dim, 0.3));
  globe.add(wf);
  /* cable arcs */
  const arcs = [];
  for (let i = 0; i < 7; i++) {
    const a0 = i * 1.1, a1 = a0 + 1.4 + (i % 3) * 0.5;
    const p = (a, la) => new THREE.Vector3(Math.cos(a) * Math.cos(la), Math.sin(la), Math.sin(a) * Math.cos(la)).multiplyScalar(13.1);
    const A = p(a0, 0.5 - (i % 4) * 0.3), B = p(a1, -0.2 + (i % 3) * 0.4);
    const mid = A.clone().add(B).multiplyScalar(0.5).normalize().multiplyScalar(13 + 3.4);
    const curve = new THREE.CubicBezierCurve3(A, A.clone().lerp(mid, 0.7), B.clone().lerp(mid, 0.7), B);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.09, 6, false), sb.glow(i === 2 ? P.amber : P.cyan, 0.9, 2));
    globe.add(tube); arcs.push(tube);
  }
  /* cable cross-section, exploded */
  const layers = [
    { r: 2.6, c: P.slate, o: 0.9 }, { r: 2.0, c: P.dim, o: 0.85 },
    { r: 1.45, c: P.bone, o: 0.9 }, { r: 0.9, c: P.amber, o: 0.95 }, { r: 0.35, c: P.cyan, o: 1 }
  ];
  layers.forEach((l, i) => {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(l.r, l.r, 9, 30, 1, true);
    const sk = new THREE.Mesh(geo, i > 2 ? sb.glow(l.c, l.o, 1.5) : sb.std(l.c, { opacity: l.o, rough: 0.4, metal: 0.7, side: THREE.DoubleSide }));
    sk.rotation.x = Math.PI / 2 - 0.35; sk.rotation.z = 0.2; g.add(sk);
    g.position.set(-15, -4.5, 4);
    sb.add(g); sb.part(g, new THREE.Vector3(0.1, 1, 0.05), 2.4 + i * 2.5);
  });
  const floor = ENV.grid(sb, -17, 90, 26, P.dim, 0.1); sb.add(floor);
  sb.each((t, e) => {
    globe.rotation.y += 0.0012; globe.rotation.x = 0.18;
    arcs.forEach((a, i) => { a.material.emissiveIntensity = 1.2 + 1.6 * Math.abs(Math.sin(t * 6 + i)); });
  });
  sb.anchor(-16.5, 2.5, 4); sb.anchor(-9, -7.5, 4); sb.anchor(12, 12, -12); sb.anchor(18, -8, -12);
  return sb;
}

/* ======================================================= 08 MACHINE ROOM */
function s08() {
  const sb = new SB(7);
  const rg = new THREE.BoxGeometry(3.2, 7.4, 1.5);
  const rm = sb.std(P.slate, { opacity: 0.95, rough: 0.42, metal: 0.7 });
  const rows = 16, racks = new THREE.InstancedMesh(rg, rm, rows * 4);
  const m4 = new THREE.Matrix4(); let k = 0; const rp = [];
  for (let s = 0; s < 4; s++) for (let i = 0; i < rows; i++) {
    const x = (s < 2 ? -1 : 1) * (7 + (s % 2) * 4.4), z = 12 - i * 3.6;
    rp.push([x, -4, z]); m4.setPosition(x, -4, z); racks.setMatrixAt(k++, m4);
  }
  racks.instanceMatrix.needsUpdate = true; sb.add(racks);
  /* rack outlines */
  const ol = [];
  rp.forEach(([x, y, z]) => { const w = sb.wire(rg, P.cyan, 0.18); w.position.set(x, y, z); sb.add(w); ol.push(w); });
  /* LEDs */
  const lg = new THREE.BoxGeometry(0.13, 0.13, 0.06), lm = sb.basic(1);
  const leds = new THREE.InstancedMesh(lg, lm, rp.length * 14);
  const c = new THREE.Color(); const ls = []; let j = 0;
  rp.forEach(([x, y, z]) => {
    for (let n = 0; n < 14; n++) {
      m4.setPosition(x + (x < 0 ? 1.65 : -1.65), y - 3 + n * 0.46, z + 0.78);
      leds.setMatrixAt(j++, m4); ls.push(Math.random());
    }
  });
  leds.instanceMatrix.needsUpdate = true; sb.add(leds);
  /* trays + floor */
  [-1, 1].forEach(s => {
    const tr = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 62), sb.std(P.slate, { opacity: 0.7, rough: 0.5, metal: 0.8 }));
    tr.position.set(s * 9, 4.6, -6); sb.add(tr); sb.part(tr, new THREE.Vector3(s * 0.3, 1, 0), 4);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 60, 6), sb.glow(P.amber, 0.7, 1.4));
    cab.rotation.x = Math.PI / 2; cab.position.set(s * 9, 4.2, -6); sb.add(cab); sb.part(cab, new THREE.Vector3(s * 0.3, 1, 0), 4);
  });
  sb.add(ENV.grid(sb, -7.8, 80, 24, P.dim, 0.16));
  const haze = sb.add(new THREE.Mesh(new THREE.PlaneGeometry(70, 26), sb.glow(P.cyan, 0.05, 0.5)));
  haze.position.set(0, 0, -22);
  sb.each((t, e) => {
    for (let i = 0; i < ls.length; i++) {
      const v = (Math.sin(t * 9 + ls[i] * 60) > 0.05 ? 1 : 0.08) * (0.62 + ls[i] * 0.38);
      c.setRGB(v * 0.26, v * 0.82, v).convertSRGBToLinear(); leds.setColorAt(i, c);
    }
    leds.instanceColor.needsUpdate = true;
    const m = new THREE.Matrix4();
    for (let i = 0; i < rp.length; i++) {
      const [x, y, z] = rp[i], s = Math.sign(x), o = e * (2.4 + (i % 4) * 1.6);
      m.setPosition(x + s * o, y + (i % 3) * e * 0.7, z);
      racks.setMatrixAt(i, m);
      ol[i].position.set(x + s * o, y + (i % 3) * e * 0.7, z);
    }
    racks.instanceMatrix.needsUpdate = true;
  });
  sb.anchor(-11.5, 1.2, 8); sb.anchor(11.5, 6.4, 2); sb.anchor(-6, -8.4, 6); sb.anchor(7, 1.5, -14);
  return sb;
}

/* ============================================================== 09 QUERY */
function s09() {
  const sb = new SB(8);
  const plates = [];
  const cols = [P.cyan, P.bone, P.cyan, P.amber, P.dim];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(13, 9, 0.32);
    g.add(new THREE.Mesh(geo, sb.std(P.slate, { opacity: 0.3, rough: 0.2, metal: 1, depthWrite: false })), sb.wire(geo, cols[i], 0.5));
    for (let n = 0; n < 5; n++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 0.4), sb.glow(cols[i], 0.8, 0.75));
      b.position.set(-4.4 + (n % 3) * 4.4, 3 - Math.floor(n / 3) * 1.4, 0.3); g.add(b);
    }
    g.position.set(0, 0, 6 - i * 5.5);
    sb.add(g); sb.part(g, new THREE.Vector3(i % 2 ? 1 : -1, i * 0.18 - 0.36, 0), 6 + i * 1.4);
    plates.push(g);
  }
  /* b-tree */
  const tn = [], tp = [];
  const nm = sb.glow(P.cyan, 1, 1.6);
  const put = (x, y, z, s) => { const n = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), nm); n.position.set(x, y, z); sb.add(n); tn.push(n); return n.position; };
  const root = put(0, -8, -6, 1.1), l1 = [];
  for (let i = 0; i < 3; i++) l1.push(put((i - 1) * 4.4, -11, -6, 0.8));
  const seg = []; l1.forEach(p => seg.push(root, p));
  l1.forEach((p, i) => { for (let j = 0; j < 3; j++) { const q = put(p.x + (j - 1) * 1.4, -13.6, -6, 0.45); seg.push(p, q); } });
  sb.add(sb.seg(seg, P.cyan, 0.3));
  /* platters */
  const plat = [];
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.12, 44), sb.std(P.bone, { opacity: 0.5, rough: 0.05, metal: 1 }));
    d.position.set(14, -6 + i * 1.1, -14); sb.add(d); plat.push(d); sb.part(d, new THREE.Vector3(0, 1, 0), 1.6 + i * 1.8);
  }
  const beam = sb.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 34, 10), sb.glow(P.amber, 0.7, 2.6)));
  beam.rotation.x = Math.PI / 2; beam.position.set(0, 0, -6);
  sb.each((t, e) => {
    plat.forEach((d, i) => { d.rotation.y += 0.06 + i * 0.01; });
    tn.forEach((n, i) => { n.rotation.y += 0.01; n.material.emissiveIntensity = 1.4; n.scale.setScalar(1 + e * 0.25); });
    const p = ss(0.1, 0.7, t);
    beam.scale.set(1, p, 1); beam.material.opacity = 0.25 + 0.5 * Math.sin(p * Math.PI);
  });
  sb.anchor(-9.5, 6.4, 7); sb.anchor(9.5, 5.4, -4); sb.anchor(-7, -10, -6); sb.anchor(16, -1.5, -14);
  return sb;
}

/* ============================================================= 10 RETURN */
function s10() {
  const sb = new SB(9);
  /* dom tree assembling */
  const nm = sb.glow(P.cyan, 1, 1.5), nodes = [], pos = [], seg = [];
  const put = (x, y, z, s) => { const n = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), nm); n.position.set(x, y, z); n.userData.t = Math.random() * 0.4; sb.add(n); nodes.push(n); return n.position; };
  const root = put(0, 9, 8, 1.1);
  const l1 = []; for (let i = 0; i < 4; i++) l1.push(put((i - 1.5) * 6, 5.4, 8, 0.72));
  l1.forEach(p => seg.push(root, p));
  l1.forEach(p => { for (let j = 0; j < 3; j++) { const q = put(p.x + (j - 1) * 1.9, 2.2, 8, 0.42); seg.push(p, q); } });
  sb.add(sb.seg(seg, P.cyan, 0.26));
  /* raster screen */
  const cols = 56, rows = 32, pg = new THREE.BoxGeometry(0.44, 0.44, 0.05);
  const pm = sb.basic(1);
  const px = new THREE.InstancedMesh(pg, pm, cols * rows);
  const m4 = new THREE.Matrix4(), c = new THREE.Color(); let k = 0; const sd = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    m4.setPosition((x - cols / 2 + 0.5) * 0.5, (y - rows / 2 + 0.5) * 0.5 - 2, -10);
    px.setMatrixAt(k++, m4);
    sd.push((y / rows) * 0.55 + Math.random() * 0.45);
  }
  px.instanceMatrix.needsUpdate = true; sb.add(px);
  const glass = sb.add(new THREE.Mesh(new THREE.PlaneGeometry(28.4, 16.2), sb.glow(P.bone, 0, 0.8)));
  glass.position.set(0, -2, -10.4);
  const frame = sb.add(sb.wire(new THREE.PlaneGeometry(28.4, 16.2), P.bone, 0.5));
  frame.position.copy(glass.position);
  sb.each((t, e) => {
    const build = ss(0.05, 0.55, t);
    nodes.forEach((n, i) => {
      const v = cl((build * 1.5 - n.userData.t) * 3, 0, 1);
      n.scale.setScalar(v * (1 + e * 0.3)); n.rotation.y += 0.012;
    });
    const w = ss(0.28, 0.82, t);
    for (let i = 0; i < sd.length; i++) {
      const v = cl((w * 1.5 - sd[i]) * 4, 0, 1) * (0.42 + 0.42 * Math.sin(sd[i] * 30));
      c.setRGB(v * 0.5, v * 0.88, v).convertSRGBToLinear(); px.setColorAt(i, c);
    }
    px.instanceColor.needsUpdate = true;
    glass.material.opacity = 0.13 * ss(0.86, 1.0, t);
    frame.material.opacity = 0.5 * ss(0.4, 0.7, t);
  });
  sb.anchor(-11.5, 10.4, 8); sb.anchor(9, 0.4, 8); sb.anchor(-13.5, -4, -10); sb.anchor(12, -9.4, -10);
  return sb;
}

/* ---------------------------------------------------------- camera moves */
const CAM = [
  { ax: -5, ay: 2.5, roll: 0.05, fov: 4 }, { ax: 6, ay: -2, roll: -0.06, fov: -3 },
  { ax: -4, ay: 3.5, roll: 0.05, fov: 5 }, { ax: 5, ay: 1.8, roll: -0.07, fov: -2 },
  { ax: -6, ay: 2.2, roll: 0.06, fov: 6 }, { ax: 3, ay: -2, roll: -0.04, fov: -4 },
  { ax: -4, ay: 2, roll: 0.05, fov: -6 }
];

/* -------------------------------------------------------------- the grade */
const Grade = {
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uG: { value: 0.055 }, uV: { value: 1 }, uA: { value: 1 }, uFlash: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uT,uG,uV,uA,uFlash; varying vec2 vUv;
    void main(){
      vec2 uv=vUv; vec2 c=uv-0.5; float r=length(c);
      float ab=uA*(0.0014+r*r*0.011);
      vec3 col;
      col.r=texture2D(tDiffuse,uv+c*ab).r;
      col.g=texture2D(tDiffuse,uv).g;
      col.b=texture2D(tDiffuse,uv-c*ab).b;
      float bl=0.0032*smoothstep(0.28,1.0,r);
      vec3 s=texture2D(tDiffuse,uv+vec2(bl,0.0)).rgb+texture2D(tDiffuse,uv-vec2(bl,0.0)).rgb
            +texture2D(tDiffuse,uv+vec2(0.0,bl)).rgb+texture2D(tDiffuse,uv-vec2(0.0,bl)).rgb;
      col=mix(col,s*0.25,smoothstep(0.3,1.0,r)*0.7);
      col+=uFlash;
      float g=fract(sin(dot(uv*vec2(97.3,71.7)+uT,vec2(12.9898,78.233)))*43758.5453);
      col+=(g-0.5)*uG;
      col*=1.0-uV*smoothstep(0.22,1.12,r)*0.85;
      col*=1.0-0.022*sin(uv.y*1100.0);
      gl_FragColor=vec4(col,1.0);
    }`
};

/* ------------------------------------------------------------------- boot */
function boot(host) {
  const cfg = () => window.__UTH_CONFIG || {};
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070a, 0.0135);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  renderer.setClearColor(0x05070a, 1);
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });
  host.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x24384d, 1.4));
  const key = new THREE.DirectionalLight(0xbfe9ff, 1.5); key.position.set(6, 12, 14); scene.add(key);
  const fill = new THREE.DirectionalLight(0x2f5f8a, 0.9); fill.position.set(-14, -6, 8); scene.add(fill);
  const rim = new THREE.PointLight(0x7fe3ff, 90, 90); scene.add(rim);
  const warm = new THREE.PointLight(0xffb26b, 40, 70); scene.add(warm);

  /* starfield / dust */
  const dn = 2600, dp = new Float32Array(dn * 3);
  for (let i = 0; i < dn; i++) {
    dp[i * 3] = (Math.random() - 0.5) * 150;
    dp[i * 3 + 1] = (Math.random() - 0.5) * 110;
    dp[i * 3 + 2] = -Math.random() * (N * SPACING + 120) + 60;
  }
  const dust = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(dp, 3)),
    new THREE.PointsMaterial({ color: 0x8fd4ff, size: 0.13, transparent: true, opacity: 0.5, depthWrite: false })
  );
  scene.add(dust);

  const builders = [s01, s03, s04, s05, s08, s09, s10];
  const scenes = builders.map((b, ix) => {
    const sb = b(); sb.i = ix; sb.group.position.z = -ix * SPACING;
    scene.add(sb.group); sb.group.visible = false; return sb;
  });

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.6, 0.78);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(Grade); grade.renderToScreen = true; composer.addPass(grade);

  function size() {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h, false); composer.setSize(w, h);
    return [w, h];
  }
  let [W, H] = size();
  addEventListener('resize', () => { [W, H] = size(); });

  /* ------------------------------------------------------------- scroll */
  const S = { cur: -0.55, tgt: 0, vel: 0, intro: 0, started: false, px: 0, py: 0, tpx: 0, tpy: 0 };
  const MAX = N - 1 + 0.72;
  const nudge = (d) => {
    S.tgt = cl(S.tgt + d, 0, MAX);
    if (!S.started) { S.started = true; document.documentElement.setAttribute('data-uth-started', '1'); }
  };
  /* Below this width the page drives the sequence: the hero pins and a
     spacer supplies the scroll length, so intercepting input here would
     fight the page rather than advance it. Checked per event so a
     rotation or resize switches modes without a reload. */
  const compact = matchMedia('(max-width: 900px)');
  const surf = host.parentElement || host;
  const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 2;
  const fwd = () => atTop() && S.tgt < MAX - 0.004;
  const back = () => atTop() && S.tgt > 0.004;
  window.addEventListener('wheel', (e) => {
    if (compact.matches) return;
    const d = e.deltaY;
    if (d > 0 ? fwd() : back()) {
      e.preventDefault();
      nudge(d * (e.deltaMode === 1 ? 0.05 : 0.0013) * (cfg().speed ?? 1));
    }
  }, { passive: false });
  let ty = null;
  window.addEventListener('touchstart', (e) => { ty = e.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (compact.matches || ty === null) return;
    const y = e.touches[0].clientY, d = ty - y;
    if (d > 0 ? fwd() : back()) { nudge(d * 0.006); e.preventDefault(); }
    ty = y;
  }, { passive: false });
  addEventListener('keydown', (e) => {
    if (compact.matches) return;
    const k = e.key;
    if ((k === 'ArrowDown' || k === 'PageDown' || k === ' ') && fwd()) { nudge(0.34); e.preventDefault(); }
    if ((k === 'ArrowUp' || k === 'PageUp') && back()) { nudge(-0.34); e.preventDefault(); }
  });
  surf.addEventListener('pointermove', (e) => {
    const r = surf.getBoundingClientRect();
    S.tpx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    S.tpy = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  window.__UTH_MAX = MAX;
  window.__UTH_GOTO = (i) => { S.tgt = cl(i, 0, MAX); S.started = true; document.documentElement.setAttribute('data-uth-started', '1'); };

  /* --------------------------------------------------------- dom binding */
  const $ = (s) => document.querySelector(s);
  const caps = [], rails = [], huds = [], labs = [];
  for (let i = 0; i < N; i++) {
    caps.push($(`[data-cap="${i}"]`));
    rails.push($(`[data-rail="${i}"]`));
    huds.push($(`[data-hud="${i}"]`));
    labs.push([0, 1, 2, 3].map(j => $(`[data-lab="${i}-${j}"]`)));
  }
  const bar = $('[data-bar]'), pct = $('[data-pct]'), titleCard = $('[data-title-card]'), endCard = $('[data-end-card]');
  const v3 = new THREE.Vector3();

  /* ------------------------------------------------------------- render */
  let last = performance.now(), t0 = last;
  function frame(now) {
    if (!host.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const el = (now - t0) / 1000;
    const hr = host.getBoundingClientRect();
    if (hr.bottom < -40 || hr.top > innerHeight + 60) { requestAnimationFrame(frame); return; }
    S.intro = cl(el / 2.6, 0, 1);
    const ie = 1 - Math.pow(1 - S.intro, 3);
    if (!S.started) S.tgt = lerp(-0.55, 0, ie);
    S.cur += (S.tgt - S.cur) * cl(dt * 4.4, 0, 0.3);
    S.px += (S.tpx - S.px) * 0.05; S.py += (S.tpy - S.py) * 0.05;

    const cur = S.cur;
    const idx = cl(Math.round(cur), 0, N - 1);
    const camZ = -cur * SPACING + CAM_BACK;
    /* choreography blended across the two nearest scenes */
    let ax = 0, ay = 0, roll = 0, fov = 0;
    for (let i = Math.max(0, Math.floor(cur)); i <= Math.min(N - 1, Math.floor(cur) + 1); i++) {
      const t = cur - i; if (t < 0 || t > 1) continue;
      const s = Math.sin(t * Math.PI), c = CAM[i];
      ax += c.ax * s; ay += c.ay * s; roll += c.roll * s; fov += c.fov * s;
    }
    const introPush = (1 - ie) * 38;
    camera.position.set(ax + S.px * 2.6, ay - S.py * 1.8, camZ + introPush);
    camera.lookAt(ax * 0.35 + S.px * 1.2, ay * 0.3 - S.py * 0.8, camZ - 40);
    camera.rotation.z = roll + S.px * 0.012;
    camera.fov = 46 + fov + (1 - ie) * 8;
    camera.updateProjectionMatrix();
    rim.position.set(ax + 8, ay + 6, camZ - 22);
    warm.position.set(ax - 10, ay - 6, camZ - 30);
    dust.rotation.y = el * 0.004;

    const showLabels = cfg().labels !== false;
    for (let i = 0; i < N; i++) {
      const sb = scenes[i], t = cur - i;
      const live = t > -0.75 && t < 1.12;
      sb.group.visible = live;
      if (!live) { if (caps[i]) caps[i].style.opacity = 0; continue; }
      const a = ss(-0.7, -0.12, t) * (i === N - 1 ? 1 : (1 - ss(0.82, 1.06, t)));
      for (const m of sb.mats) m.opacity = m.userData.o0 * a;
      const tc = cl(t, 0, 1);
      const e = ss(0.05, 0.42, tc) * (1 - ss(0.66, 0.96, tc));
      sb.run(tc, e);
      /* caption */
      const focus = ss(0.02, 0.16, t) * (1 - (i === N - 1 ? ss(0.5, 0.68, t) : ss(0.62, 0.84, t)));
      if (caps[i]) {
        caps[i].style.opacity = focus * (S.started ? 1 : ie * 0.15);
        caps[i].style.transform = `translate3d(0,${(1 - focus) * 26}px,0)`;
      }
      if (huds[i]) huds[i].style.opacity = focus;
      /* labels */
      if (showLabels) for (let j = 0; j < 4; j++) {
        const elm = labs[i][j]; if (!elm) continue;
        v3.copy(sb.anchors[j]).add(sb.group.position).project(camera);
        const sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * H;
        const inside = v3.z < 1 && sx > 44 && sx < W - 44 && sy > 44 && sy < H - 44;
        elm.style.opacity = focus * ss(0.1 + j * 0.06, 0.3 + j * 0.06, t) * (inside ? 1 : 0);
        elm.style.transform = `translate3d(${sx}px,${sy}px,0)`;
        const kid = elm.firstElementChild;
        if (kid) {
          const flip = sx > W * 0.66;
          if (kid.dataset.flip !== String(flip)) {
            kid.dataset.flip = String(flip);
            kid.style.flexDirection = flip ? 'row-reverse' : 'row';
            kid.style.transform = flip ? 'translate(-100%, -8px) translateX(-10px)' : 'translate(10px, -8px)';
          }
        }
      } else for (let j = 0; j < 4; j++) if (labs[i][j]) labs[i][j].style.opacity = 0;
    }
    for (let i = 0; i < N; i++) if (rails[i]) {
      const on = i === idx;
      rails[i].style.opacity = on ? 1 : 0.3;
      rails[i].style.transform = `translateX(${on ? 6 : 0}px)`;
    }
    const p = cl(cur / MAX, 0, 1);
    if (bar) bar.style.transform = `scaleY(${p})`;
    if (pct) pct.textContent = String(Math.round(p * 100)).padStart(2, '0');
    if (titleCard) titleCard.style.opacity = (1 - ss(0, 0.22, S.cur)) * ie;
    if (endCard) endCard.style.opacity = ss(N - 0.55, N - 0.32, cur);

    const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    grade.uniforms.uT.value = el;
    grade.uniforms.uG.value = rm ? 0.02 : (cfg().grain ?? 0.055);
    grade.uniforms.uA.value = rm ? 0.2 : 1;
    grade.uniforms.uFlash.value = ss(N - 1.02, MAX, cur) * 0.045 + (1 - ie) * 0.04;
    bloom.strength = 0.6 + ss(N - 1.1, MAX, cur) * 0.34;
    renderer.toneMappingExposure = 0.94 + ss(N - 1.1, MAX, cur) * 0.12;
    composer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* wait for the mount point to stream in */
(function watch() {
  const host = document.getElementById('uth-stage');
  if (host && host.clientWidth && !host.dataset.uthBooted) {
    host.dataset.uthBooted = '1';
    try { boot(host); } catch (err) {
      console.error('[uth]', err);
      host.innerHTML = '<div style="position:absolute;inset:0;display:grid;place-items:center;color:#7fe3ff;font:12px ui-monospace,monospace;letter-spacing:.2em">WEBGL UNAVAILABLE</div>';
    }
  }
  requestAnimationFrame(watch);
})();
}
