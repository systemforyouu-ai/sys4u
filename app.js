// Sys 4 U — scroll-driven cinematic flight through our programs (Three.js, no build step, static files).
import * as THREE from 'three';

const WA = '201037089555';
const root = document.documentElement;
const panels = [...document.querySelectorAll('.panel')];
const canvas = document.getElementById('gl');
const rail = document.querySelector('.rail');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
let forced = params.has('p') ? parseFloat(params.get('p')) : null;   // ?p=0.3 pins the timeline (testing / og image)

root.classList.add('loading');
panels.forEach((p) => {
  const a = p.querySelector('.btn--wa');
  if (a && p.dataset.wa) a.href = `https://wa.me/${WA}?text=${encodeURIComponent(p.dataset.wa)}`;
});

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (e) {
  root.classList.add('nogl'); root.classList.remove('loading'); throw e;
}
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b1c33, 0.0105);
const camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.1, 700);

// ------------------------------------------------------------------ helpers
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = THREE.MathUtils.lerp;

function glowTexture(r, g, b) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, `rgba(${r},${g},${b},0.95)`);
  gr.addColorStop(0.35, `rgba(${r},${g},${b},0.35)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape(); const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ShapeGeometry(s, 14);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x) / w, (pos.getY(i) - y) / h);
  return g;
}

// ------------------------------------------------------------------ backdrop: sky gradient, stars, floor grid, rings
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(450, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){
      float h = vP.y;
      vec3 top = vec3(0.016,0.040,0.095), mid = vec3(0.043,0.110,0.200), glow = vec3(0.07,0.42,0.62);
      vec3 col = mix(mid, top, smoothstep(0.0,0.75,h));
      col = mix(col, mid*0.7, smoothstep(0.0,-0.6,h));
      col += glow * pow(max(0.0,1.0-abs(h+0.02)*3.2), 3.0) * 0.55;
      gl_FragColor = vec4(col,1.0); }`,
  }));
scene.add(sky);

const starCount = 3200;
{
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(starCount * 3), col = new Float32Array(starCount * 3);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const cy = new THREE.Color(0x22d3ee), wh = new THREE.Color(0xffffff);
  for (let i = 0; i < starCount; i++) {
    pos.set([rnd(-110, 110), rnd(-4, 70), rnd(60, -260)], i * 3);
    const c = wh.clone().lerp(cy, Math.random() * 0.7); col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 0.28, map: glowTexture(255, 255, 255), vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const stars = new THREE.Points(g, m); stars.frustumCulled = false; scene.add(stars);
}

const grid = new THREE.GridHelper(560, 140, 0x22d3ee, 0x1b4b70);
grid.position.set(0, -6.4, -110);
grid.material.transparent = true; grid.material.opacity = 0.32; grid.material.depthWrite = false;
scene.add(grid);

const rings = [];
{
  const mat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.16, depthWrite: false });
  for (let i = 0; i < 30; i++) {
    const r = 4 + Math.random() * 6;
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 8, 120), mat);
    const side = Math.random() < 0.5 ? -1 : 1;
    m.position.set(side * (12 + Math.random() * 16), -2 + Math.random() * 10, 30 - i * 9.5);
    m.rotation.set(Math.random() * 0.5, Math.random() * 0.6, 0);
    m.userData.spin = (Math.random() - 0.5) * 0.25;
    scene.add(m); rings.push(m);
  }
}

// ------------------------------------------------------------------ programs (cards)
const PROGRAMS = [
  { key: 'fakkty', src: 'assets/fakkty.jpg', maxW: 9.8, maxH: 5.9, y: 0.2 },
  { key: 'crm', src: 'assets/crm.jpg', maxW: 9.8, maxH: 6.2, y: 0.2 },
  { key: 'awtar', src: 'assets/awtar-poster.jpg', maxW: 10.2, maxH: 5.9, y: 0.2, video: true },
  { key: 'gold', src: 'assets/gold.jpg', maxW: 4.6, maxH: 7.4, y: 0.4, phone: true },
];
const Z0 = -30, ZSTEP = -34;
const loader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
let loaded = 0;
const total = PROGRAMS.length + 1;
const bump = () => { loaded++; };
const loadTex = (src) => new Promise((res, rej) => loader.load(src, (t) => {
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  bump(); res(t);
}, undefined, rej));

const glowCyan = glowTexture(34, 211, 238);
const cards = [];
const video = document.getElementById('awtarVideo');
let videoTex = null;

function buildCard(p, tex, i) {
  const img = tex.image; const ar = img.width / img.height;
  let w = p.maxW, h = w / ar; if (h > p.maxH) { h = p.maxH; w = h * ar; }
  const g = new THREE.Group();
  const bezel = p.phone ? 0.2 : 0.09;
  const border = new THREE.Mesh(roundedRect(w + bezel * 2, h + bezel * 2, (p.phone ? 0.55 : 0.3) + bezel), new THREE.MeshBasicMaterial({ color: p.phone ? 0x0a0f1a : 0x22d3ee, fog: false }));
  border.position.z = -0.03; g.add(border);
  if (p.phone) {
    const rim = new THREE.Mesh(roundedRect(w + bezel * 2 + 0.12, h + bezel * 2 + 0.12, 0.8), new THREE.MeshBasicMaterial({ color: 0x22d3ee, fog: false }));
    rim.position.z = -0.06; g.add(rim);
  }
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false });
  const face = new THREE.Mesh(roundedRect(w, h, p.phone ? 0.42 : 0.24), mat);
  g.add(face);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowCyan, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  glow.scale.set(w * 2.1, h * 2.1, 1); glow.position.z = -0.8; g.add(glow);
  g.position.set(0, p.y, Z0 + ZSTEP * i);
  scene.add(g);
  return { ...p, group: g, face, mat, glow, w, h, z: g.position.z, baseY: p.y, i };
}

// final portal
const portal = new THREE.Group();
const PORTAL_Z = Z0 + ZSTEP * PROGRAMS.length - 26;
{
  const a = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.07, 16, 180), new THREE.MeshBasicMaterial({ color: 0x22d3ee, fog: false }));
  const b = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.035, 12, 160), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, fog: false }));
  const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowCyan, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  gl.scale.set(30, 30, 1); gl.position.z = -0.5;
  portal.add(a, b, gl); portal.position.set(0, 0.4, PORTAL_Z); portal.userData = { a, b, gl };
  scene.add(portal);
}

// ------------------------------------------------------------------ timeline + camera keyframes
const PLAN = [['hold', 0, .07], ['move', 1, .09], ['hold', 1, .11], ['move', 2, .09], ['hold', 2, .11], ['move', 3, .09], ['hold', 3, .11], ['move', 4, .09], ['hold', 4, .11], ['move', 5, .10], ['hold', 5, .09]];
const segs = [];
{ const sum = PLAN.reduce((a, s) => a + s[2], 0); let c = 0; for (const [type, idx, wgt] of PLAN) { const w = wgt / sum; segs.push({ type, idx, a: c, b: c + w }); c += w; } }
const holdMid = (i) => { const s = segs.find((x) => x.type === 'hold' && x.idx === i); return (s.a + s.b) / 2; };

let keys = [];     // [{pos:Vector3, look:Vector3, fov}]
function layout() {
  const aspect = innerWidth / innerHeight, portrait = aspect < 0.95;
  const fov = portrait ? 58 : 44; const tanH = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  keys = [];
  keys.push({ pos: new THREE.Vector3(0, 0.9, 20), look: new THREE.Vector3(0, 0.3, -40), fov });
  for (const c of cards) {
    c.group.position.x = portrait ? (c.i % 2 ? 7.5 : -7.5) : 0;   // phones: zig-zag so the next card sits beside, not under
    const fracW = portrait ? 0.9 : 0.5, fracH = portrait ? 0.36 : 0.74;
    const dist = Math.max(c.w / (fracW * 2 * tanH * aspect), c.h / (fracH * 2 * tanH), 7);
    const halfW = dist * tanH * aspect, halfH = dist * tanH;
    const sx = portrait ? 0 : 0.33 * halfW, sy = portrait ? -0.34 * halfH : 0;
    keys.push({ pos: new THREE.Vector3(c.group.position.x + sx, c.group.position.y + sy, c.z + dist), look: new THREE.Vector3(c.group.position.x + sx, c.group.position.y + sy, c.z), fov });
  }
  keys.push({ pos: new THREE.Vector3(0, 0.5, PORTAL_Z + (portrait ? 17 : 15)), look: new THREE.Vector3(0, 0.5, PORTAL_Z - 30), fov });
  camera.aspect = aspect; camera.fov = fov; camera.updateProjectionMatrix();
}

function resize() {
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  if (cards.length) layout(); else { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
}

// ------------------------------------------------------------------ rail dots
const labels = ['البداية', 'فكّتي', 'CRM العقارات', 'أوتار سيتي 3D', 'سوق الذهب', 'كلمنا'];
const dots = labels.map((l, i) => {
  const b = document.createElement('button'); b.className = 'dot'; b.type = 'button'; b.setAttribute('aria-label', l);
  b.innerHTML = `<span>${l}</span>`;
  b.addEventListener('click', () => { const max = document.documentElement.scrollHeight - innerHeight; window.scrollTo({ top: holdMid(i) * max, behavior: reduce ? 'auto' : 'smooth' }); });
  rail.appendChild(b); return b;
});

// ------------------------------------------------------------------ main loop
const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', (e) => { pointer.x = (e.clientX / innerWidth - 0.5) * 2; pointer.y = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });
addEventListener('resize', resize);

let cur = 0, last = performance.now(), ema = 0.016, slowFrames = 0, videoOn = false, videoPrimed = false;
const tmpPos = new THREE.Vector3(), tmpLook = new THREE.Vector3();

function evaluate(p) {
  let seg = segs[segs.length - 1];
  for (const s of segs) if (p <= s.b) { seg = s; break; }
  const alpha = new Array(panels.length).fill(0);
  let fov = keys[0].fov, roll = 0;
  if (seg.type === 'hold') {
    const k = keys[seg.idx]; tmpPos.copy(k.pos); tmpLook.copy(k.look); fov = k.fov; alpha[seg.idx] = 1;
  } else {
    const u0 = clamp01((p - seg.a) / (seg.b - seg.a)), u = smoother(u0);
    const k0 = keys[seg.idx - 1], k1 = keys[seg.idx];
    tmpPos.lerpVectors(k0.pos, k1.pos, u); tmpLook.lerpVectors(k0.look, k1.look, u);
    const arc = reduce ? 0 : Math.sin(Math.PI * u), dir = seg.idx % 2 ? 1 : -1;
    tmpPos.x += arc * 2.4 * dir; tmpPos.y += arc * 0.9; roll = arc * 0.045 * dir; fov = k1.fov + arc * (reduce ? 0 : 8);
    alpha[seg.idx - 1] = 1 - clamp01(u0 / 0.32);
    alpha[seg.idx] = clamp01((u0 - 0.6) / 0.4);
  }
  return { alpha, fov, roll };
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  ema = lerp(ema, dt, 0.05);
  // adaptive quality: keep it smooth on weak GPUs
  if (ema > 0.027 && pixelRatio > 1) { if (++slowFrames > 90) { pixelRatio = Math.max(1, pixelRatio - 0.25); slowFrames = 0; resize(); } } else slowFrames = Math.max(0, slowFrames - 1);

  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const target = forced !== null ? forced : clamp01(scrollY / max);
  cur += (target - cur) * (reduce ? 1 : 1 - Math.exp(-dt * 5.5));
  if (Math.abs(target - cur) < 1e-4) cur = target;

  if (keys.length) {
    const { alpha, fov, roll } = evaluate(cur);
    pointer.sx = lerp(pointer.sx, pointer.x, 1 - Math.exp(-dt * 3)); pointer.sy = lerp(pointer.sy, pointer.y, 1 - Math.exp(-dt * 3));
    camera.position.copy(tmpPos);
    if (!reduce) { camera.position.x += pointer.sx * 0.35; camera.position.y -= pointer.sy * 0.2; }
    camera.lookAt(tmpLook); camera.rotateZ(roll);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

    const t = now / 1000;
    cards.forEach((c, i) => {
      if (!reduce) { c.group.position.y = c.baseY + Math.sin(t * 0.7 + i * 1.7) * 0.12; c.group.rotation.y = Math.sin(t * 0.45 + i) * 0.035 + pointer.sx * 0.07; c.group.rotation.x = -pointer.sy * 0.03; }
      c.glow.material.opacity = 0.42 + Math.sin(t * 1.3 + i) * 0.1;
    });
    rings.forEach((r) => { r.rotation.z += r.userData.spin * dt; });
    portal.userData.a.rotation.z += dt * 0.18; portal.userData.b.rotation.z -= dt * 0.28;
    portal.userData.gl.material.opacity = 0.55 + Math.sin(t * 1.1) * 0.12;

    // panels + rail
    let on = 0, best = -1;
    panels.forEach((el, i) => {
      const a = alpha[i] || 0;
      el.style.opacity = a.toFixed(3);
      el.style.visibility = a > 0.01 ? 'visible' : 'hidden';
      const ty = (1 - a) * 22;
      const phone = innerWidth <= 760, isEnd = el.classList.contains('panel--end');
      const base = phone ? '' : (isEnd ? 'translate(50%,-50%)' : 'translateY(-50%)');
      el.style.transform = `${base} translateY(${ty}px)`.trim();
      if (a > best) { best = a; on = i; }
    });
    dots.forEach((d, i) => d.classList.toggle('on', i === on));

    // video: only decode while the Awtar card is near the camera
    const vi = PROGRAMS.findIndex((p) => p.video) + 1;
    const near = Math.abs(cur - holdMid(vi)) < 0.13;
    if (near && !videoOn) { video.play().catch(() => {}); videoOn = true; }
    else if (!near && videoOn) { video.pause(); videoOn = false; }
    if (!videoPrimed && cur > holdMid(vi) - 0.3) { video.preload = 'auto'; video.load(); videoPrimed = true; }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ boot
(async () => {
  try {
    const texes = await Promise.all(PROGRAMS.map((p) => loadTex(p.src)));
    PROGRAMS.forEach((p, i) => cards.push(buildCard(p, texes[i], i)));
    const ac = cards.find((c) => c.video);
    video.addEventListener('playing', () => {
      if (videoTex) return;
      videoTex = new THREE.VideoTexture(video); videoTex.colorSpace = THREE.SRGBColorSpace; videoTex.minFilter = THREE.LinearFilter; videoTex.generateMipmaps = false;
      ac.mat.map = videoTex; ac.mat.needsUpdate = true;
    });
    bump();
    renderer.compile(scene, camera);
    resize();
    requestAnimationFrame(frame);
    setTimeout(() => root.classList.remove('loading'), 500);
  } catch (e) {
    console.error(e); root.classList.add('nogl'); root.classList.remove('loading');
  }
})();
document.addEventListener('visibilitychange', () => { if (document.hidden) { video.pause(); videoOn = false; } });
window.__sys4u = { get progress() { return cur; }, segs, force(v) { forced = v; }, jump(v) { forced = v; cur = v; } };
