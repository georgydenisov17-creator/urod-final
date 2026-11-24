'use strict';
/* ============ «УРОД» — 2D-игра. Всё рисуется кодом, музыка — music.mp3 ============ */

/* ---------- CONFIG ---------- */
const CFG = {
  maxKmh: 50, ppm: 24,            // лимит скорости, пикселей на метр
  accel: 9, brake: 12, drag: 1.5, // м/с²
  cap0: 50, capGrow: 0,         // стартовый потолок км/ч и рост в секунду
  g: 1500, jumpV: 620, airMin: 12,// гравитация, скорость прыжка, мин. воздушная скорость (м/с)
  maxAngle: 80, wheelBack: 90,    // лимит вили, скорость возврата °/с
  wheelBonus: 2,                  // очков за метр на заднем колесе
  carW: 110, carH: 34, carGap: 400, // размеры машины и безопасная дистанция между ними
  bottlePts: 10, crashWheelie: 2, crashCar: 1, slow: 0.5
};
const SKINS = [
  { id: 'classic', n: 'Классика', p: 0,   shirt: '#e53935', helm: '#1e88e5', pack: '#fdd835', bike: '#ff6f00', acc: '#222' },
  { id: 'neon',    n: 'Неон',     p: 20,  shirt: '#00e5ff', helm: '#76ff03', pack: '#ff1744', bike: '#d500f9', acc: '#00e5ff' },
  { id: 'camo',    n: 'Камуфляж', p: 40,  shirt: '#5d6b3a', helm: '#3e4a2a', pack: '#6d5a3a', bike: '#4e5d2e', acc: '#2b3318', fx: 'camo' },
  { id: 'fire',    n: 'Огонь',    p: 60,  shirt: '#ff5722', helm: '#b71c1c', pack: '#212121', bike: '#d50000', acc: '#ffab00', fx: 'fire' },
  { id: 'space',   n: 'Космос',   p: 100, shirt: '#283593', helm: '#ede7f6', pack: '#6a1b9a', bike: '#1a237e', acc: '#ffd740', fx: 'space' }
];
const WALLS = ['#f2e3c6', '#d9e8f5', '#e8d5d5', '#d8ecd0', '#f5f0e0', '#cfd8dc'];
const ROOFS = ['#7b3f2e', '#37474f', '#5d4037', '#2e5339', '#8d2f2f'];
const FENCES = ['#2e7d32', '#6d4c41', '#78909c', '#1565c0', '#8d6e63'];
const CARCOL = ['#f5f5f5', '#e8d9b0', '#2e7d32', '#8e1b3a', '#4fc3f7', '#9e9e9e'];

/* ---------- save ---------- */
const S = {
  get(k, d) { try { const v = localStorage.getItem('urod_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('urod_' + k, JSON.stringify(v)); } catch (e) {} }
};
let best = S.get('best', 0), wallet = S.get('wallet', 0), owned = S.get('owned', ['classic']),
    skinId = S.get('skin', 'classic'), snd = S.get('snd', true), upg = Object.assign({ eng: 0, susp: 0, tires: 0, mag: 0 }, S.get('upg', {}));
const skin = () => SKINS.find(s => s.id === skinId) || SKINS[0];

/* ---------- утилиты ---------- */
const $ = id => document.getElementById(id);
const pick = (R, a) => a[Math.floor(R() * a.length)];
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const Q = 2; // множитель разрешения offscreen-тайлов
function mk(w, h, fn) { const c = document.createElement('canvas'); c.width = w * Q; c.height = h * Q; const x = c.getContext('2d'); x.scale(Q, Q); fn(x, w, h); return c; }

/* ---------- audio: музыка из файла + синтез эффектов ---------- */
const A = {
  ctx: null, eng: null, eg: null, music: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sawtooth'; g.gain.value = 0; o.connect(g); g.connect(this.ctx.destination); o.start();
      this.eng = o; this.eg = g;
    } catch (e) {}
    this.music = new Audio('music.mp3'); this.music.loop = true; this.music.volume = 0.5;
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  playMusic() { if (this.music && snd) this.music.play().catch(() => {}); },
  stopMusic() { if (this.music) this.music.pause(); },
  tone(f1, f2, d, type, v) {
    if (!this.ctx || !snd) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime;
    o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + d);
  },
  beep() { this.tone(880, 1400, 0.12, 'square', 0.12); },
  thud() { this.tone(140, 35, 0.4, 'sine', 0.5); this.tone(90, 30, 0.3, 'sawtooth', 0.2); },
  engine(v, on) { if (!this.eg) return; this.eg.gain.value = (snd && on) ? 0.025 : 0; this.eng.frequency.value = 55 + v * 9; }
};

/* ---------- состояние ---------- */
const keys = { gas: 0, brake: 0, wheelie: 0, jump: 0 };
const G = { st: 'menu', t: 0, dist: 0, bonus: 0, bot: 0, ct: 0, flash: 0, paused: false, prev: 'start' };
const cv = $('c'), ctx = cv.getContext('2d');
let dpr = 1, sc = 1, VW = 480, VH = 800, RT = 400, RB = 462, skyG, vig, L, B, P = [], BG, birds = [];
const score = () => Math.floor(G.dist) + Math.floor(G.bonus) + G.bot * CFG.bottlePts;
const vmax = () => CFG.maxKmh + upg.eng * 5; // макс. скорость с учётом двигателя

function resize() {
  const iw = innerWidth, ih = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, 2); cv.width = iw * dpr; cv.height = ih * dpr;
  sc = Math.min(iw / 480, ih / 270); VW = iw / sc; VH = ih / sc;
  RT = Math.round(VH * 0.56); RB = RT + 62; // верх дороги, линия колёс
  mkSky(); vig = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.35, VW / 2, VH / 2, Math.max(VW, VH) * 0.75); vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(25,18,10,.38)');
}
addEventListener('resize', resize);

/* ---------- погода/время суток (случайно на каждый забег) и прокачка ---------- */
const THEMES = [
  { sky: ['#7f9db3', '#c9d5da', '#efe8d8'], haze: '215,222,224', tint: null, sun: '245,245,230' },                              // пасмурный день
  { sky: ['#5b6fa8', '#e8a07a', '#ffd9a0'], haze: '255,200,150', tint: '#ffd2a8', sun: '255,200,120', sy: 0.62 },               // закат
  { sky: ['#aab6bd', '#d6dcdf', '#e8eaea'], haze: '225,230,232', tint: '#e4eaee', sun: '240,240,240', fog: 0.3 },               // туман
  { sky: ['#1f2a4d', '#5a5f8a', '#c28a7a'], haze: '110,110,150', tint: '#8d96c8', sun: '255,180,140', sy: 0.7, beam: 1 },       // сумерки
  { sky: ['#5d6b78', '#8e9aa3', '#b9c1c6'], haze: '170,180,188', tint: '#b5c0ca', sun: '200,205,210', rain: 1, beam: 1 }         // дождь
];
let TH = THEMES[0];
function mkSky() { skyG = ctx.createLinearGradient(0, 0, 0, RT); skyG.addColorStop(0, TH.sky[0]); skyG.addColorStop(0.65, TH.sky[1]); skyG.addColorStop(1, TH.sky[2]); }
const UPG = [['eng', 'Двигатель', 'Мощность и макс. скорость (+5 км/ч за уровень)'], ['susp', 'Подвеска', 'Выше и дальше прыжок'], ['tires', 'Шины и баланс', 'Сильнее тормоз, легче держать вили'], ['mag', 'Магнит', 'Бутылки притягиваются издалека']];

/* ---------- levelgen: процедурный уровень по сиду ---------- */
function reset() {
  const seed = (Date.now() ^ (Math.random() * 4294967296)) >>> 0;
  L = { r: mulberry(seed), cars: [], bots: [], nx: 600, lce: -1e9 };
  B = { x: 0, px: 0, v: 0, h: 0, vy: 0, ang: 0, wr: 0 };
  Object.assign(G, { t: 0, dist: 0, bonus: 0, bot: 0, ct: 0, flash: 0, hitCar: null });
  Object.assign(keys, { gas: 0, brake: 0, wheelie: 0, jump: 0 });
  P = []; TH = THEMES[Math.floor(Math.random() * THEMES.length)]; mkSky(); BG = buildBG(seed);
  const R = mulberry(seed + 7); birds = Array.from({ length: 5 }, () => ({ x: R() * 600, y: 40 + R() * 120, s: 0.7 + R() * 0.6 }));
}
function genAhead(upTo) {
  const r = L.r;
  while (L.nx < upTo) {
    const x = L.nx;
    if (r() < 0.45 && x - L.lce >= (CFG.carGap + upg.eng * 30)) { // машина (+дуга бутылок над ней)
      L.cars.push({ x, c: pick(r, CARCOL) }); L.lce = x + CFG.carW;
      if (r() < 0.65) for (let i = 0; i < 5; i++) L.bots.push({ x: x + 4 + i * 26, h: 30 + Math.sin(i / 4 * Math.PI) * 80 });
      L.nx = x + CFG.carW + (CFG.carGap + upg.eng * 30) + r() * 220; // безопасный минимум гарантирован
    } else { // паттерн бутылок
      const t = r(), n = 4 + Math.floor(r() * 5);
      if (t < 0.3) for (let i = 0; i < n; i++) L.bots.push({ x: x + i * 38, h: 22 });                       // линия
      else if (t < 0.55) for (let i = 0; i < n; i++) L.bots.push({ x: x + i * 38, h: i % 2 ? 80 : 22 });      // зигзаг
      else if (t < 0.8) for (let i = 0; i < n; i++) L.bots.push({ x: x + i * 38, h: 30 + Math.sin(i / (n - 1) * Math.PI) * 90 }); // дуга
      else L.bots.push({ x, h: r() < 0.5 ? 22 : 90 });                                                      // одиночная
      L.nx = x + n * 38 + 90 + r() * 180;
    }
  }
}

/* ---------- background: типичный русский посёлок (offscreen, один раз) ---------- */
function hills(c, w, h, base, a1, a2, k1, k2, ph, col) {
  c.fillStyle = col; c.beginPath(); c.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) c.lineTo(x, base - a1 * Math.sin(x / w * 6.283 * k1 + ph) - a2 * Math.sin(x / w * 6.283 * k2));
  c.lineTo(w, h); c.fill();
}
function cloud(c, x, y, s) { c.fillStyle = 'rgba(238,240,240,.9)'; [[0, 0, 18], [16, -6, 22], [36, 0, 16], [22, 4, 18]].forEach(p => { c.beginPath(); c.arc(x + p[0] * s, y + p[1] * s, p[2] * s, 0, 6.283); c.fill(); }); }
function buildFar(R) {
  return mk(960, 260, (c, w, h) => {
    for (let i = 0; i < 6; i++) cloud(c, R() * w, 15 + R() * 80, 0.8 + R() * 0.8);
    hills(c, w, h, h - 80, 12, 7, 2, 5, R() * 6, '#a8ab9c');
    for (let x = 10; x < w - 50; x += 44 + R() * 60) { // панельки на горизонте
      const bw = 34 + R() * 20, bh = 50 + R() * 40; c.fillStyle = pick(R, ['#b8b4a6', '#a7acb0', '#c0b7a0', '#aaa497']); c.fillRect(x, h - 48 - bh, bw, bh + 12);
      c.fillStyle = '#8c949b'; for (let y = h - 44 - bh; y < h - 50; y += 8) for (let xx = x + 4; xx < x + bw - 4; xx += 7) c.fillRect(xx, y, 3.5, 4.5);
      c.fillStyle = '#6f6c66'; c.fillRect(x - 1, h - 50 - bh, bw + 2, 3);
    }
    hills(c, w, h, h - 40, 9, 5, 3, 7, R() * 6, '#8e8f74');
    c.fillStyle = '#807d62'; c.fillRect(0, h - 28, w, 28);
    for (let x = 0; x < w; x += 70 + R() * 50) { c.fillStyle = '#2f4a3a'; const t = 22 + R() * 14; c.beginPath(); c.moveTo(x, h - 28); c.lineTo(x + 7, h - 28 - t); c.lineTo(x + 14, h - 28); c.fill(); }
    c.strokeStyle = '#4b4338'; c.lineWidth = 1.1; // голый лес
    for (let x = 0; x < w; x += 8) { const t = 14 + R() * 18, y = h - 28; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - t); c.moveTo(x, y - t * .6); c.lineTo(x + 5, y - t * .95); c.moveTo(x, y - t * .45); c.lineTo(x - 5, y - t * .8); c.stroke(); }
  });
}
function birch(c, x, g, R) { // голая берёза без листьев
  const t = 72 + R() * 30, lean = R() * 6 - 3;
  c.fillStyle = '#e6e2d6'; c.beginPath(); c.moveTo(x - 3, g); c.lineTo(x - 1.5 + lean, g - t); c.lineTo(x + 1.5 + lean, g - t); c.lineTo(x + 3, g); c.fill();
  c.fillStyle = '#2b2622'; for (let i = 0; i < 6; i++) c.fillRect(x - 2.5 + lean * (i * 10 / t), g - 8 - i * 10, 3, 2);
  c.strokeStyle = '#3d342b'; c.lineCap = 'round';
  for (let i = 0; i < 11; i++) {
    const f = 0.3 + i * 0.065, y = g - t * f, d = i % 2 ? 1 : -1, l = 10 + R() * 16 * (1.2 - f), bx = x + lean * f;
    c.lineWidth = 1.4 - f * 0.6; c.beginPath(); c.moveTo(bx, y); c.quadraticCurveTo(bx + d * l * 0.6, y - l * 0.7, bx + d * l, y - l * 0.3); c.stroke();
    c.lineWidth = 0.7; c.beginPath(); c.moveTo(bx + d * l * 0.6, y - l * 0.5); c.lineTo(bx + d * l * 0.9, y - l * 1.1); c.moveTo(bx + d * l, y - l * 0.3); c.lineTo(bx + d * (l + 4), y + l * 0.2); c.stroke();
  }
  c.lineWidth = 1; c.beginPath(); c.moveTo(x + lean, g - t); c.lineTo(x + lean - 3, g - t - 10); c.moveTo(x + lean, g - t); c.lineTo(x + lean + 4, g - t - 9); c.stroke();
}
function spruce(c, x, g, R) { const t = 55 + R() * 30; c.fillStyle = '#2f4a3a'; for (let i = 0; i < 4; i++) { const y = g - t + i * t / 4.5, w = 9 + i * 6; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x - w, y + t / 3.5); c.lineTo(x + w, y + t / 3.5); c.fill(); } c.fillStyle = '#4a3a2c'; c.fillRect(x - 2, g - 8, 4, 8); }
function woodpile(c, x, g) { c.fillStyle = '#4a3a2c'; c.fillRect(x, g - 24, 32, 24); for (let r = 0; r < 4; r++) for (let q = 0; q < 5; q++) { c.fillStyle = '#c4a06a'; c.beginPath(); c.arc(x + 3.5 + q * 6.2, g - 3.5 - r * 6, 3, 0, 6.283); c.fill(); c.strokeStyle = '#6a4d30'; c.lineWidth = 0.8; c.stroke(); } }
function well(c, x, g) { c.fillStyle = '#7a5f40'; c.fillRect(x, g - 14, 20, 14); c.fillStyle = 'rgba(0,0,0,.25)'; for (let y = g - 12; y < g; y += 4) c.fillRect(x, y, 20, 1); c.fillStyle = '#5d4a33'; c.fillRect(x + 1, g - 34, 3, 22); c.fillRect(x + 16, g - 34, 3, 22); c.fillStyle = '#6f6f6a'; c.beginPath(); c.moveTo(x - 3, g - 33); c.lineTo(x + 10, g - 44); c.lineTo(x + 23, g - 33); c.fill(); c.fillStyle = '#444'; c.fillRect(x + 9, g - 26, 3, 6); }
function shed(c, x, g, R) { c.fillStyle = '#6a5a48'; c.fillRect(x, g - 32, 42, 32); c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; for (let xx = x; xx < x + 42; xx += 5) { c.beginPath(); c.moveTo(xx, g - 32); c.lineTo(xx, g); c.stroke(); } c.fillStyle = '#7a5545'; c.beginPath(); c.moveTo(x - 4, g - 31); c.lineTo(x + 46, g - 36); c.lineTo(x + 46, g - 31); c.fill(); c.fillStyle = '#3d3329'; c.fillRect(x + 14, g - 22, 14, 22); }
function kennel(c, x, g) { c.fillStyle = '#7a6244'; c.fillRect(x, g - 14, 20, 14); c.fillStyle = '#5d4a33'; c.beginPath(); c.moveTo(x - 3, g - 14); c.lineTo(x + 10, g - 23); c.lineTo(x + 23, g - 14); c.fill(); c.fillStyle = '#222'; c.fillRect(x + 6, g - 10, 8, 10); }
function lamp(c, x, g) { c.fillStyle = '#7d7f80'; c.fillRect(x, g - 72, 3, 72); c.fillRect(x, g - 72, 16, 3); c.fillStyle = '#b9b58a'; c.fillRect(x + 12, g - 70, 9, 4); }
function rsign(c, x, g, R) {
  c.fillStyle = '#6a6a66'; c.fillRect(x, g - 46, 2, 46);
  if (R() < 0.5) { c.fillStyle = '#e8e4d8'; c.beginPath(); c.arc(x + 1, g - 52, 8, 0, 6.283); c.fill(); c.strokeStyle = '#b03a35'; c.lineWidth = 2.5; c.stroke(); c.fillStyle = '#222'; c.font = 'bold 8px sans-serif'; c.textAlign = 'center'; c.fillText('50', x + 1, g - 49); }
  else { c.fillStyle = '#35618f'; c.fillRect(x - 8, g - 60, 18, 18); c.fillStyle = '#ddd'; c.beginPath(); c.moveTo(x + 1, g - 58); c.lineTo(x - 5, g - 45); c.lineTo(x + 7, g - 45); c.fill(); }
}
function win(c, x, y, w, h, R) { // окно с наличником, занавеской и ставнями
  c.fillStyle = pick(R, ['#e8e4d8', '#d9e2e8', '#c9d8e8']); c.fillRect(x - 3, y - 3, w + 6, h + 6);
  const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#8fa6b3'); g.addColorStop(1, '#56707e'); c.fillStyle = g; c.fillRect(x, y, w, h);
  c.fillStyle = pick(R, ['#e0c9a6', '#c98f8f', '#d8d8c8']); c.fillRect(x, y, w * 0.35, h * 0.5);
  c.strokeStyle = '#e8e4d8'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w / 2, y + h); c.moveTo(x, y + h / 2); c.lineTo(x + w, y + h / 2); c.stroke();
  if (R() < 0.5) { c.fillStyle = pick(R, ['#3f6aa0', '#3f8060', '#a05a3f']); c.fillRect(x - 9, y - 3, 6, h + 6); c.fillRect(x + w + 3, y - 3, 6, h + 6); }
}
function house(c, x, g, R) { // старый дом: сруб / кирпич, шифер или ржавое железо
  const old = R() < 0.7, w = (old ? 88 : 108) + R() * 30, wh = (old ? 54 : 62) + R() * 10, top = g - wh;
  const wall = old ? pick(R, ['#8b6b4a', '#7a6a55', '#9c8a6a', '#6f8a6a', '#5f7f9f', '#b0a060', '#8a7258']) : pick(R, ['#b5654a', '#c8b79c', '#a9a49a']);
  c.fillStyle = wall; c.fillRect(x, top, w, wh);
  if (old) { c.fillStyle = 'rgba(0,0,0,.2)'; for (let y = top + 5; y < g; y += 6) { c.fillRect(x, y, w, 1.5); c.fillRect(x - 2, y - 2, 3, 3.5); c.fillRect(x + w - 1, y - 2, 3, 3.5); } }
  else { c.fillStyle = 'rgba(0,0,0,.16)'; for (let y = top + 4; y < g; y += 4) c.fillRect(x, y, w, 1); }
  c.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 4; i++) c.fillRect(x + R() * w * 0.8, top + R() * wh * 0.6, 8 + R() * 14, 6 + R() * 10); // облупленная краска
  const rh = 20 + R() * 10, ax = x + w * 0.5 + R() * 10 - 5; c.fillStyle = pick(R, ['#7d8084', '#8a5a44', '#6e7378', '#5d6b57']);
  c.beginPath(); c.moveTo(x - 7, top + 3); c.lineTo(ax, top - rh); c.lineTo(x + w + 7, top + 3); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 1; for (let k = 0; k <= 6; k++) { c.beginPath(); c.moveTo(ax, top - rh); c.lineTo(x - 7 + k * (w + 14) / 6, top + 3); c.stroke(); }
  c.fillStyle = 'rgba(120,60,30,.35)'; c.fillRect(x + R() * w * 0.6, top - rh * 0.3, 10 + R() * 14, 4); // ржавчина
  if (R() < 0.7) { const cx = x + w * (0.55 + R() * 0.25); c.fillStyle = '#8a4f3d'; c.fillRect(cx, top - rh - 4, 8, rh * 0.6 + 4); c.fillStyle = '#2b2623'; c.fillRect(cx - 1, top - rh - 6, 10, 3); }
  if (R() < 0.6) { const a2 = x + w * 0.25; c.strokeStyle = '#444'; c.beginPath(); c.moveTo(a2, top); c.lineTo(a2, top - rh - 14); for (let i = 0; i < 3; i++) { c.moveTo(a2 - 7, top - rh - 12 + i * 5); c.lineTo(a2 + 7, top - rh - 12 + i * 5); } c.stroke(); } // ТВ-антенна
  win(c, x + 12, top + 14, 16, 18, R); win(c, x + w - 28, top + 14, 16, 18, R); if (w > 110) win(c, x + w / 2 - 8, top + 14, 16, 18, R);
  c.fillStyle = '#d8d2c0'; c.fillRect(x + w / 2 - 6, top + 8, 12, 7); c.fillStyle = '#333'; c.font = 'bold 6px Arial'; c.textAlign = 'center'; c.fillText(1 + Math.floor(R() * 98), x + w / 2, top + 14); c.fillStyle = '#5a5f62'; c.fillRect(x + w - 3, top + 4, 2.5, wh - 4); // номер дома, водосток
  const fx = x - 8, fw = w + 16;
  if (R() < 0.55) { c.fillStyle = '#a39a86'; for (let xx = fx; xx < fx + fw; xx += 6) { if (R() < 0.06) continue; const fh = 17 + R() * 6; c.fillRect(xx, g - fh, 4, fh); } c.fillStyle = '#7d745f'; c.fillRect(fx, g - 12, fw, 2.5); } // штакетник
  else { c.fillStyle = pick(R, ['#6b7f5a', '#8a5a44', '#6e7378', '#7a5a3a']); c.fillRect(fx, g - 21, fw, 21); c.strokeStyle = 'rgba(0,0,0,.22)'; for (let xx = fx; xx < fx + fw; xx += 5) { c.beginPath(); c.moveTo(xx, g - 21); c.lineTo(xx, g); c.stroke(); } c.fillStyle = 'rgba(130,70,30,.4)'; for (let i = 0; i < 5; i++) c.fillRect(fx + R() * fw, g - 21, 3, 6 + R() * 12); } // ржавый профнастил
  c.fillStyle = 'rgba(40,50,35,.75)'; c.fillRect(x + w / 2 - 12, g - 22, 24, 22); c.fillStyle = '#bbb'; c.fillRect(x + w / 2 + 6, g - 12, 3, 4); // ворота
  return w + 16;
}
function buildMid(R) {
  return mk(1440, 170, (c, w, h) => {
    const g = h - 8; c.fillStyle = '#8a7a52'; c.fillRect(0, g, w, 8);
    const items = [birch, birch, birch, spruce, woodpile, well, shed, kennel, lamp, rsign];
    let x = 8;
    while (x < w - 190) { x += house(c, x, g, R) + 6; pick(R, items)(c, x, g, R); x += 34 + R() * 24; if (R() < 0.5 && x < w - 190) { birch(c, x, g, R); x += 22; } }
    for (; x < w - 14; x += 24) birch(c, x, g, R);
    for (let k = 0; k < 4; k++) { // столбы ЛЭП с провисшими проводами
      const px = 3 + k * 360, nx = px + 360, top = g - 112;
      c.fillStyle = '#5a4733'; c.fillRect(px - 2, top, 4, 112); c.fillRect(px - 12, top + 4, 24, 3);
      c.strokeStyle = '#333'; c.lineWidth = 1;
      for (let j = 0; j < 3; j++) { c.beginPath(); c.moveTo(px - 10 + j * 10, top + 4); c.quadraticCurveTo((px + nx) / 2 - 10 + j * 10, top + 30, nx - 10 + j * 10, top + 4); c.stroke(); }
    }
  });
}
function buildNear(R) { // грязная обочина: сухая трава, лужи, мусор, покрышки, облезлые щиты
  return mk(960, 70, (c, w, h) => {
    c.fillStyle = '#7b6a47'; c.fillRect(0, h - 28, w, 28);
    for (let i = 0; i < 45; i++) { c.fillStyle = R() < 0.5 ? 'rgba(60,45,25,.35)' : 'rgba(150,135,90,.3)'; c.beginPath(); c.ellipse(R() * w, h - 26 + R() * 22, 6 + R() * 16, 2 + R() * 4, 0, 0, 6.283); c.fill(); }
    for (let x = 0; x < w; x += 4) { c.strokeStyle = R() < 0.5 ? '#b3a461' : '#8f8450'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, h - 24); c.lineTo(x + R() * 4 - 2, h - 30 - R() * 7); c.stroke(); }
    const ads = [['ШАУРМА', '#c9902a', '#3e2723'], ['ПЯТЁРОЧКА', '#a03a35', '#eee'], ['АВТОЗАПЧАСТИ', '#3a5f8a', '#eee']];
    for (let x = 20; x < w - 120; x += 80 + R() * 70) {
      const t = R(), gy = h - 8;
      if (t < 0.22) { const a = pick(R, ads); c.font = 'bold 9px Arial'; const bw = c.measureText(a[0]).width + 12; c.fillStyle = '#4a4038'; c.fillRect(x + 6, gy - 30, 3, 30); c.fillRect(x + bw - 8, gy - 30, 3, 30); c.fillStyle = a[1]; c.fillRect(x, gy - 58, bw, 28); c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1; c.strokeRect(x + 2, gy - 56, bw - 4, 24); c.fillStyle = a[2]; c.textAlign = 'center'; c.fillText(a[0], x + bw / 2, gy - 40); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x + R() * bw * 0.7, gy - 58, 6, 28); }
      else if (t < 0.38) { c.fillStyle = 'rgba(120,135,142,.9)'; c.beginPath(); c.ellipse(x + 20, gy - 3, 24, 4.5, 0, 0, 6.283); c.fill(); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 8, gy - 4); c.lineTo(x + 22, gy - 4); c.stroke(); }
      else if (t < 0.52) { for (let i = 0; i < 4; i++) { c.fillStyle = pick(R, ['#222', '#3b4a3b', '#8a8a8a']); c.beginPath(); c.ellipse(x + i * 9, gy - 4, 6, 5, 0, 0, 6.283); c.fill(); } c.fillStyle = '#4a6a3a'; c.fillRect(x + 40, gy - 7, 3, 7); c.fillRect(x + 48, gy - 5, 6, 3); }
      else if (t < 0.66) { for (let i = 0; i < 7; i++) { const bx = x + i * 5, hh = 22 + R() * 16, tx = bx + R() * 6 - 3; c.strokeStyle = '#6b5a38'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(bx, gy); c.lineTo(tx, gy - hh); c.stroke(); c.fillStyle = '#5a4630'; c.beginPath(); c.arc(tx, gy - hh, 2.2, 0, 6.283); c.fill(); } }
      else if (t < 0.8) { for (let i = 0; i < 3; i++) { c.fillStyle = '#1d1d1d'; c.beginPath(); c.ellipse(x + 14, gy - 4 - i * 6, 14, 4.5, 0, 0, 6.283); c.fill(); c.fillStyle = '#555'; c.beginPath(); c.ellipse(x + 14, gy - 5 - i * 6, 6, 2, 0, 0, 6.283); c.fill(); } }
      else if (t < 0.9) { for (let i = 0; i < 9; i++) { c.save(); c.translate(x + i * 7, gy); c.rotate((R() - 0.5) * 0.5); c.fillStyle = '#9a9078'; c.fillRect(0, -26 + R() * 6, 4, 26); c.restore(); } c.fillStyle = '#6d654f'; c.fillRect(x, gy - 14, 60, 2.5); }
      else { for (let i = 0; i < 5; i++) { c.fillStyle = pick(R, ['#8a8a86', '#a05a45', '#6f6f6a']); c.fillRect(x + i * 8, gy - 4 - R() * 6, 6 + R() * 6, 4 + R() * 5); } }
    }
    for (let x = 60; x < w; x += 320) { c.fillStyle = '#8a8d8f'; c.fillRect(x, h - 68, 4, 62); c.fillRect(x, h - 68, 18, 3); c.fillStyle = '#bdb98a'; c.fillRect(x + 14, h - 66, 9, 4); }
    c.fillStyle = '#5b4a32'; c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 8) c.lineTo(x, h - 8 + Math.sin(x / w * 6.283 * 6) * 3 + Math.sin(x / w * 6.283 * 17) * 1.5); c.lineTo(w, h); c.fill();
  });
}
function buildRoad(R) { // убитый асфальт: колеи, заплатки, трещины, ямы с лужами, грязь по краям
  return mk(256, 84, (c, w, h) => {
    c.fillStyle = '#55575a'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,.14)'; c.fillRect(0, 26, w, 12); c.fillRect(0, 50, w, 12);
    for (let i = 0; i < 6; i++) { c.fillStyle = pick(R, ['rgba(0,0,0,.2)', 'rgba(255,255,255,.06)', 'rgba(30,25,20,.3)']); const pw = 30 + R() * 60, ph = 12 + R() * 20, px = R() * (w - pw), py = 10 + R() * (h - 30 - ph); c.fillRect(px, py, pw, ph); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.strokeRect(px, py, pw, ph); }
    c.strokeStyle = 'rgba(15,15,15,.7)'; c.lineWidth = 1;
    for (let i = 0; i < 7; i++) { let cx = R() * w, cy = 8 + R() * (h - 20); c.beginPath(); c.moveTo(cx, cy); for (let j = 0; j < 5; j++) { cx += R() * 18 - 4; cy += R() * 14 - 7; c.lineTo(cx, cy); } c.stroke(); }
    for (let i = 0; i < 3; i++) { // ямы
      const px = 25 + R() * (w - 60), py = 16 + R() * (h - 36), rx = 10 + R() * 10, ry = 5 + R() * 3;
      c.fillStyle = '#2b2a28'; c.beginPath(); c.ellipse(px, py, rx, ry, 0, 0, 6.283); c.fill(); c.strokeStyle = '#6b6c6e'; c.lineWidth = 2; c.stroke();
      if (R() < 0.5) { c.fillStyle = '#6f7f88'; c.beginPath(); c.ellipse(px, py + 1, rx * 0.7, ry * 0.6, 0, 0, 6.283); c.fill(); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(px - rx * 0.4, py - 1, rx * 0.5, 1.5); }
    }
    for (let i = 0; i < 500; i++) { c.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.18)'; c.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R()); }
    for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(90,70,45,.3)'; c.beginPath(); c.ellipse(R() * w, R() < 0.5 ? 10 : h - 12, 12 + R() * 20, 4 + R() * 4, 0, 0, 6.283); c.fill(); }
    c.fillStyle = '#6a5840'; c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); for (let x = w; x >= 0; x -= 8) c.lineTo(x, 7 + Math.sin(x / w * 6.283 * 3) * 2.5); c.fill();
    c.beginPath(); c.moveTo(0, h); c.lineTo(w, h); for (let x = w; x >= 0; x -= 8) c.lineTo(x, h - 11 + Math.sin(x / w * 6.283 * 4) * 3); c.fill();
  });
}
function buildFg(R) { // передний план под дорогой: грязь, лужи, камни, сухая трава
  return mk(512, 200, (c, w, h) => {
    for (let i = 0; i < 30; i++) { c.fillStyle = R() < 0.5 ? 'rgba(40,28,15,.28)' : 'rgba(190,170,120,.2)'; c.beginPath(); c.ellipse(R() * w, R() * h, 10 + R() * 30, 3 + R() * 7, 0, 0, 6.283); c.fill(); }
    for (let i = 0; i < 3; i++) { const px = 40 + R() * (w - 120), py = 20 + R() * (h - 50), rx = 22 + R() * 28;
      const g = c.createLinearGradient(0, py - 8, 0, py + 8); g.addColorStop(0, '#b9c6cc'); g.addColorStop(1, '#7b8a90'); c.fillStyle = g; c.beginPath(); c.ellipse(px, py, rx, rx * 0.22, 0, 0, 6.283); c.fill();
      c.strokeStyle = 'rgba(60,45,25,.6)'; c.lineWidth = 1.5; c.stroke(); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px - rx * 0.5, py - 2); c.lineTo(px + rx * 0.2, py - 2); c.stroke(); }
    for (let i = 0; i < 25; i++) { const sx = R() * w, sy = R() * h; c.fillStyle = pick(R, ['#8a8680', '#a39c8e', '#6f6a60']); c.beginPath(); c.ellipse(sx, sy, 2 + R() * 4, 1.5 + R() * 2.5, 0, 0, 6.283); c.fill(); c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(sx - 1, sy - 1.5, 2, 1); }
    for (let i = 0; i < 80; i++) { const tx = R() * w, ty = R() * h; c.strokeStyle = R() < 0.5 ? '#b3a461' : '#8f8450'; c.lineWidth = 1; c.beginPath(); for (let j = 0; j < 3; j++) { c.moveTo(tx + j * 2, ty); c.lineTo(tx + j * 2 + R() * 6 - 3, ty - 5 - R() * 7); } c.stroke(); }
    for (let i = 0; i < 8; i++) { c.strokeStyle = 'rgba(30,22,12,.3)'; c.lineWidth = 1.2; c.beginPath(); let x = R() * w, y = R() * h; c.moveTo(x, y); for (let j = 0; j < 4; j++) { x += R() * 10 - 5; y += R() * 8 - 3; c.lineTo(x, y); } c.stroke(); }
    for (let i = 0; i < 6; i++) { c.fillStyle = pick(R, ['#e0e0e0', '#4a6a3a', '#c04040']); c.fillRect(R() * w, R() * h, 3 + R() * 3, 2); }
  });
}
function buildFgw(R) { // тёмные силуэты травы и репейника на переднем плане (быстрый параллакс)
  return mk(512, 70, (c, w, h) => {
    c.fillStyle = c.strokeStyle = 'rgba(30,24,16,.92)'; c.lineCap = 'round';
    for (let i = 0; i < 70; i++) { const x = R() * w, l = 18 + R() * 40, b = (R() - 0.5) * 14; c.lineWidth = 1 + R() * 1.2; c.beginPath(); c.moveTo(x, h); c.quadraticCurveTo(x + b * 0.3, h - l * 0.6, x + b, h - l); c.stroke(); }
    for (let i = 0; i < 4; i++) { const x = 40 + R() * (w - 80), l = 40 + R() * 20; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, h); c.lineTo(x + R() * 6 - 3, h - l); c.stroke(); c.beginPath(); c.arc(x, h - l, 3.2, 0, 6.283); c.fill(); }
    for (let x = 30; x < w; x += 170) { c.fillRect(x, h - 34, 4, 34); c.fillRect(x - 10, h - 26, 24, 2.5); }
  });
}
function buildBG(seed) { const R = mulberry(seed ^ 0x9e3779b9); return { far: buildFar(R), mid: buildMid(R), near: buildNear(R), road: buildRoad(R), fg: buildFg(R), fgw: buildFgw(R) }; }

/* ---------- render: отрисовка объектов ---------- */
function decal(c, k, x, y, w, h) {
  if (!k.fx) return; c.save(); c.fillStyle = k.acc;
  if (k.fx === 'camo') [[.2, .3], [.6, .2], [.5, .7], [.8, .8]].forEach(p => { c.beginPath(); c.ellipse(x + p[0] * w, y + p[1] * h, w * .16, h * .2, 0, 0, 6.283); c.fill(); });
  else if (k.fx === 'fire') for (let i = 0; i < 3; i++) { const fx = x + i * w / 3; c.beginPath(); c.moveTo(fx, y + h); c.lineTo(fx + w / 6, y); c.lineTo(fx + w / 3, y + h); c.fill(); }
  else [[.2, .3], [.7, .2], [.5, .7], [.85, .6]].forEach(p => c.fillRect(x + p[0] * w, y + p[1] * h, 2.2, 2.2));
  c.restore();
}
function wheel(c, x, y, wr) { // колесо: протектор, боковина, обод, спицы, тормозной диск
  c.save(); c.translate(x, y); c.fillStyle = '#161616'; c.beginPath(); c.arc(0, 0, 15, 0, 6.283); c.fill(); c.rotate(wr);
  c.fillStyle = '#2e2e2e'; for (let i = 0; i < 14; i++) { c.rotate(0.4488); c.fillRect(13, -1.6, 2.6, 3.2); }
  c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 12.5, 0, 6.283); c.stroke();
  const g = c.createRadialGradient(-2, -2, 1, 0, 0, 9.5); g.addColorStop(0, '#eceff1'); g.addColorStop(1, '#8197a3'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 9.5, 0, 6.283); c.fill();
  c.strokeStyle = '#546e7a'; c.lineWidth = 0.9; for (let i = 0; i < 12; i++) { c.rotate(0.5236); c.beginPath(); c.moveTo(2, 0); c.lineTo(9, 0); c.stroke(); }
  c.strokeStyle = '#b0bec5'; c.lineWidth = 1.6; c.beginPath(); c.arc(0, 0, 5.6, 0.3, 5.6); c.stroke();
  c.fillStyle = '#37474f'; c.beginPath(); c.arc(0, 0, 2.6, 0, 6.283); c.fill(); c.fillStyle = '#cfd8dc'; c.fillRect(-0.6, -0.6, 1.2, 1.2); c.restore();
}
function bikeBody(c, k, wr) { // начало координат — точка касания заднего колеса
  wheel(c, 0, -15, wr); wheel(c, 58, -15, wr); c.lineCap = 'round';
  c.strokeStyle = '#90a4ae'; c.lineWidth = 4; c.beginPath(); c.moveTo(26, -24); c.lineTo(8, -30); c.lineTo(-4, -34); c.stroke();      // выхлоп
  c.fillStyle = '#455a64'; c.fillRect(-11, -38, 9, 6); c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(-10, -37, 7, 1.5);            // глушитель
  c.strokeStyle = '#263238'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -19); c.lineTo(20, -25); c.moveTo(0, -11); c.lineTo(20, -21); c.stroke(); // цепь
  c.fillStyle = '#b0bec5'; c.beginPath(); c.arc(21, -23, 3.5, 0, 6.283); c.fill();
  c.strokeStyle = '#b0bec5'; c.lineWidth = 4; c.beginPath(); c.moveTo(58, -15); c.lineTo(46, -52); c.stroke();                         // вилка
  c.strokeStyle = '#d4af37'; c.lineWidth = 2; c.beginPath(); c.moveTo(55, -24); c.lineTo(48, -46); c.stroke();
  c.strokeStyle = k.acc; c.lineWidth = 5; c.beginPath(); c.moveTo(0, -15); c.lineTo(24, -28); c.lineTo(30, -44); c.stroke();           // рама
  c.fillStyle = '#78909c'; c.fillRect(14, -36, 14, 12); c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(15, -35 + i * 3); c.lineTo(27, -35 + i * 3); c.stroke(); } // двигатель
  c.strokeStyle = '#e53935'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(10, -24); for (let i = 0; i < 7; i++) c.lineTo(10 + i * 1.8 + (i % 2 ? 3 : -3), -24 - i * 3); c.stroke(); // пружина
  c.strokeStyle = k.bike; c.lineWidth = 3; c.beginPath(); c.arc(0, -15, 19, Math.PI * 1.05, Math.PI * 1.6); c.stroke(); c.beginPath(); c.arc(58, -15, 19, Math.PI * 1.4, Math.PI * 1.95); c.stroke();
  c.beginPath(); c.moveTo(20, -46); c.quadraticCurveTo(32, -62, 48, -50); c.lineTo(44, -40); c.lineTo(22, -38); c.closePath(); c.fillStyle = k.bike; c.fill();  // бак
  const g = c.createLinearGradient(0, -62, 0, -38); g.addColorStop(0, 'rgba(255,255,255,.5)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.3)'); c.fillStyle = g; c.fill();
  decal(c, k, 24, -54, 20, 14);
  c.fillStyle = '#212121'; c.fillRect(2, -49, 22, 5); c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(3, -49, 20, 1.5);                // сиденье
  c.fillStyle = '#fff'; c.fillRect(-13, -35, 10, 6); c.fillStyle = '#222'; c.fillRect(-11, -33, 6, 1.5);                              // номер
  c.fillStyle = '#fffde7'; c.beginPath(); c.arc(52, -56, 3.2, 0, 6.283); c.fill(); c.strokeStyle = '#555'; c.lineWidth = 1; c.stroke();  // фара
  c.fillStyle = '#546e7a'; c.fillRect(24, -27, 7, 2);                                                                                  // подножка
  c.strokeStyle = '#222'; c.lineWidth = 3; c.beginPath(); c.moveTo(46, -52); c.lineTo(42, -63); c.lineTo(50, -65); c.stroke();          // руль
  c.strokeStyle = '#e53935'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(48, -65); c.lineTo(51, -64.5); c.stroke();                      // грипса
}
function rider(c, k, bob) {
  c.save(); c.translate(0, bob); c.lineCap = 'round'; c.lineJoin = 'round';
  c.fillStyle = k.pack; c.fillRect(2, -86, 15, 26); c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(2, -72, 15, 2); c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(3, -85, 3, 24); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(5, -68, 9, 7); // рюкзак, карман
  c.strokeStyle = '#546e7a'; c.lineWidth = 9; c.beginPath(); c.moveTo(16, -52); c.lineTo(32, -44); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 2; c.beginPath(); c.moveTo(17, -55); c.lineTo(31, -47); c.stroke();
  c.strokeStyle = '#f1c27d'; c.lineWidth = 6; c.beginPath(); c.moveTo(32, -44); c.lineTo(28, -29); c.stroke();
  c.strokeStyle = '#eee'; c.lineWidth = 6.5; c.beginPath(); c.moveTo(28.4, -33); c.lineTo(28, -29); c.stroke();                         // носок
  c.fillStyle = '#f5f5f5'; c.beginPath(); c.moveTo(23, -30); c.lineTo(34, -30); c.lineTo(38, -26); c.lineTo(38, -24); c.lineTo(23, -24); c.closePath(); c.fill();
  c.fillStyle = '#e53935'; c.fillRect(23, -25, 15, 1.5); c.strokeStyle = '#999'; c.lineWidth = 0.8; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(29 + i * 2, -30); c.lineTo(30 + i * 2, -28); c.stroke(); } // кроссовок, шнурки
  c.strokeStyle = k.shirt; c.lineWidth = 15; c.beginPath(); c.moveTo(17, -55); c.lineTo(34, -78); c.stroke();
  c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 2; c.beginPath(); c.moveTo(24, -50); c.lineTo(38, -70); c.stroke(); decal(c, k, 20, -76, 14, 18);
  c.strokeStyle = k.shirt; c.lineWidth = 5; c.beginPath(); c.moveTo(34, -77); c.lineTo(44, -63); c.stroke();
  c.fillStyle = '#222'; c.beginPath(); c.arc(44, -62, 3.5, 0, 6.283); c.fill(); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(43, -64, 2, 1.5); // перчатка
  c.fillStyle = '#f1c27d'; c.fillRect(37, -83, 6, 5);                                                                                   // шея
  const hg = c.createRadialGradient(37, -95, 1, 40, -91, 11); hg.addColorStop(0, 'rgba(255,255,255,.7)'); hg.addColorStop(0.4, k.helm); hg.addColorStop(1, k.helm);
  c.fillStyle = k.helm; c.beginPath(); c.arc(40, -91, 10, 0, 6.283); c.fill(); c.fillStyle = hg; c.fill();
  c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 2; c.beginPath(); c.arc(40, -91, 7.5, Math.PI * 1.1, Math.PI * 1.85); c.stroke();      // полоса на шлеме
  c.fillStyle = '#1b1b1b'; c.beginPath(); c.ellipse(46, -90, 5.5, 4, 0, 0, 6.283); c.fill(); c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(43.5, -92.5, 4, 1.5); // визор
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(44, -85, 7, 3);                                                                              // подбородок
  c.restore();
}
function bikeFull(c, k, wr, bob) { bikeBody(c, k, wr); rider(c, k, bob); }
function drawCar(c, x, y, col, tilt) { // «Жигули» ВАЗ-2106, перед слева
  c.save(); if (tilt) { c.translate(x + 55, y); c.rotate(tilt); c.translate(-x - 55, -y); }
  c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(x + 55, y + 1, 64, 6, 0, 0, 6.283); c.fill(); c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(x + 55, y, 54, 3.5, 0, 0, 6.283); c.fill();
  const body = () => { c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x, y - 20); c.lineTo(x + 4, y - 23); c.lineTo(x + 32, y - 24); c.lineTo(x + 40, y - 35); c.lineTo(x + 78, y - 35); c.lineTo(x + 88, y - 24); c.lineTo(x + 108, y - 23); c.lineTo(x + 110, y - 18); c.lineTo(x + 110, y - 8); c.closePath(); };
  body(); c.fillStyle = col; c.fill();
  const g = c.createLinearGradient(0, y - 35, 0, y - 8); g.addColorStop(0, 'rgba(255,255,255,.4)'); g.addColorStop(0.4, 'rgba(255,255,255,.05)'); g.addColorStop(1, 'rgba(0,0,0,.32)'); c.fillStyle = g; body(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; body(); c.stroke();
  c.fillStyle = 'rgba(120,60,25,.4)'; c.fillRect(x + 30, y - 11, 14, 3); c.fillRect(x + 96, y - 12, 10, 4); c.fillStyle = 'rgba(60,45,30,.25)'; c.fillRect(x + 2, y - 12, 106, 4); // ржавчина, грязь
  c.fillStyle = '#a9d3e6'; c.beginPath(); c.moveTo(x + 43, y - 33); c.lineTo(x + 76, y - 33); c.lineTo(x + 84, y - 24); c.lineTo(x + 36, y - 24); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.moveTo(x + 46, y - 33); c.lineTo(x + 54, y - 33); c.lineTo(x + 46, y - 24); c.lineTo(x + 40, y - 24); c.closePath(); c.fill();
  c.fillStyle = col; c.fillRect(x + 59, y - 33, 3, 9);
  c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1; c.beginPath(); for (const o of [36, 62, 86]) { c.moveTo(x + o, y - 24); c.lineTo(x + o, y - 10); } c.stroke();
  c.fillStyle = '#cfd8dc'; c.fillRect(x + 54, y - 21, 6, 2); c.fillRect(x + 80, y - 21, 6, 2);                                           // ручки
  c.fillStyle = '#fff'; c.beginPath(); c.arc(x + 7, y - 17, 4, 0, 6.283); c.fill(); c.strokeStyle = '#999'; c.stroke();                  // фара
  c.fillStyle = '#ffb300'; c.fillRect(x + 1, y - 12, 3, 3);                                                                              // поворотник
  c.fillStyle = '#cfd8dc'; c.fillRect(x + 1, y - 15, 9, 5); c.strokeStyle = '#78909c'; c.beginPath(); c.moveTo(x + 1, y - 13); c.lineTo(x + 10, y - 13); c.moveTo(x + 1, y - 11); c.lineTo(x + 10, y - 11); c.stroke(); // решётка
  c.fillStyle = '#e53935'; c.fillRect(x + 106, y - 20, 4, 5);
  c.fillStyle = '#9e9e9e'; c.fillRect(x - 2, y - 9, 114, 3); c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(x - 2, y - 9, 114, 1);
  c.fillStyle = '#fafafa'; c.fillRect(x + 92, y - 14, 12, 5); c.fillStyle = '#333'; c.fillRect(x + 94, y - 12, 8, 1.2);
  c.fillStyle = '#555'; c.fillRect(x + 38, y - 27, 4, 3);
  [20, 90].forEach(o => { c.fillStyle = '#141414'; c.beginPath(); c.arc(x + o, y - 8, 11, Math.PI, 0); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(x + o, y - 8, 8, 0, 6.283); c.fill(); c.fillStyle = '#b0bec5'; c.beginPath(); c.arc(x + o, y - 8, 4.5, 0, 6.283); c.fill(); c.fillStyle = '#37474f'; c.beginPath(); c.arc(x + o, y - 8, 1.6, 0, 6.283); c.fill(); });
  c.restore();
}
function bottle(c, x, y, t) {
  c.save(); c.translate(x, y + Math.sin(t * 4 + x) * 2);
  c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,200,90,.2)'; c.beginPath(); c.arc(0, -2, 20, 0, 6.283); c.fill(); c.fillStyle = 'rgba(255,230,150,.18)'; c.beginPath(); c.arc(0, -2, 11, 0, 6.283); c.fill(); c.globalCompositeOperation = 'source-over';
  const g = c.createLinearGradient(-7, 0, 7, 0); g.addColorStop(0, '#1a0f08'); g.addColorStop(0.35, '#4a2c18'); g.addColorStop(1, '#1a0f08');
  c.fillStyle = g; c.beginPath(); c.moveTo(-7, 14); c.lineTo(-7, -4); c.quadraticCurveTo(-7, -8, -2, -10); c.lineTo(-2, -16); c.lineTo(2, -16); c.lineTo(2, -10); c.quadraticCurveTo(7, -8, 7, -4); c.lineTo(7, 14); c.closePath(); c.fill();
  c.fillStyle = '#c62828'; c.fillRect(-7, -3, 14, 12); c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(-7, -3, 14, 3); c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(-7, 6, 14, 3);
  c.fillStyle = '#bdbdbd'; c.fillRect(-2.7, -18, 5.4, 3); c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(-2.7, -18, 1.4, 3);
  c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(-5.2, -8, 1.4, 5); c.fillRect(-5.2, 10, 1.4, 3); c.fillRect(-1.4, -15, 0.9, 4);
  c.fillStyle = '#fff'; c.font = 'italic bold 4.5px sans-serif'; c.textAlign = 'center'; c.save(); c.rotate(-0.3); c.fillText('ГАЗЯВА', 0, 5); c.restore();
  c.restore();
}

/* ---------- частицы ---------- */
function spark(x, y, n, col, g) { for (let i = 0; i < n; i++) P.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 140, l: 0.5, m: 0.5, col, g }); }

/* ---------- physics ---------- */
function step(dt) {
  B.px = B.x; // предыдущая позиция для интерполяции кадра (убирает дрожание мира)
  G.shake = Math.max(0, (G.shake || 0) - dt * 3);
  if (G.st === 'menu') { B.x += 3 * CFG.ppm * dt; B.wr += 3 * CFG.ppm * dt / 15; A.engine(0, false); return; }
  if (G.st === 'crash') { crashStep(dt); partsStep(dt); return; }
  if (G.st !== 'play') return;
  G.t += dt;
  const cap = vmax() / 3.6;
  if (keys.gas) B.v += (CFG.accel + upg.eng * 1.8) * dt; else B.v -= CFG.drag * dt;
  if (keys.brake) B.v -= (CFG.brake + upg.tires * 1.5) * dt;
  if (B.ang > 8 && B.h === 0) B.v += 0.6 * dt; // вили слегка разгоняет
  B.v = Math.max(0, Math.min(B.v, cap));
  if (keys.jump) { keys.jump = 0; if (B.h === 0) { B.vy = CFG.jumpV + upg.susp * 30; B.h = 0.01; } } // повторное нажатие в воздухе игнорируется
  if (B.h > 0) { B.h += B.vy * dt; B.vy -= CFG.g * dt; if (B.h <= 0) { B.h = 0; B.vy = 0; spark(B.x, RB, 6, '#d7ccc8', 0); G.shake = 0.25; } B.ang = Math.max(0, B.ang - (CFG.wheelBack + upg.tires * 12) * dt); }
  else if (keys.wheelie) { B.ang += (35 + B.ang * 0.6) * (1 - upg.tires * 0.07) * dt; G.bonus += CFG.wheelBonus * B.v * dt; }
  else B.ang = Math.max(0, B.ang - (CFG.wheelBack + upg.tires * 12) * dt);
  const hv = (B.h > 0 && B.v > 1) ? Math.max(B.v, CFG.airMin) : B.v; // воздушный бонус: прыжок гарантированно перелетает «Жигули»
  B.x += hv * CFG.ppm * dt; G.dist = B.x / CFG.ppm; B.wr += B.v * CFG.ppm * dt / 15;
  if (B.ang >= CFG.maxAngle) { crash('wheelie'); return; }
  genAhead(B.x + VW + 400);
  for (const c of L.cars) if (B.x + 52 > c.x && B.x + 4 < c.x + CFG.carW && B.h < CFG.carH) { G.hitCar = c; crash('car'); return; }
  for (let i = L.bots.length - 1; i >= 0; i--) {
    const b = L.bots[i];
    if (Math.abs(B.x + 28 - b.x) < 30 + upg.mag * 14 && Math.abs(B.h + 26 - b.h) < 34 + upg.mag * 14) {
      L.bots.splice(i, 1); G.bot++; wallet++; S.set('wallet', wallet); A.beep(); spark(b.x, RB - b.h, 10, '#ffeb3b', 200);
    }
  }
  L.cars = L.cars.filter(c => c.x > B.x - 400); L.bots = L.bots.filter(b => b.x > B.x - 400);
  if (B.h === 0 && B.v > 3 && Math.random() < 0.5) P.push({ x: B.x, y: RB - 2, vx: -30 - B.v * 4, vy: -20 - Math.random() * 20, l: 0.4, m: 0.4, col: '#d7ccc8', g: 0 });
  if (keys.gas && B.h === 0 && Math.random() < 0.5) P.push({ x: B.x - 10, y: RB - 24, vx: -40 - B.v * 3, vy: -14, l: 0.5, m: 0.5, col: skin().fx === 'fire' ? '#ff8a1f' : skin().fx === 'space' ? '#ffd740' : skin().id === 'neon' ? '#00e5ff' : '#cfd2d4', g: 0 }); // дым/огонь из выхлопа
  partsStep(dt); A.engine(B.v, true);
}
function partsStep(dt) { for (const p of P) { p.l -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; } P = P.filter(p => p.l > 0); }
function crash(type) {
  G.st = 'crash'; G.ct = 0; G.dur = type === 'car' ? CFG.crashCar : CFG.crashWheelie; G.camx = B.x - 110; A.engine(0, false);
  const sp = B.v * CFG.ppm, bx = B.x, by = RB - B.h;
  if (type === 'car') { G.rider = { x: bx + 30, y: by - 60, vx: sp * 1.1 + 60, vy: -320, r: 0, vr: 9 }; G.bk = { x: bx + 29, y: by - 20, vx: -40, vy: -120, r: 0, vr: -1.5 }; G.flash = 1; }
  else { G.rider = { x: bx + 10, y: by - 60, vx: sp * 0.3, vy: -260, r: -0.5, vr: -7 }; G.bk = { x: bx + 29, y: by - 20, vx: sp * 0.4, vy: -100, r: -1.4, vr: -2.5 }; }
  A.thud(); G.shake = 1; document.body.className = 'crash';
}
function crashStep(dt) {
  G.ct += dt; const d = dt * CFG.slow; G.flash = Math.max(0, G.flash - dt * 2.5);
  for (const o of [G.rider, G.bk]) {
    o.vy += CFG.g * d; o.x += o.vx * d; o.y += o.vy * d; o.r += o.vr * d;
    const fl = o === G.rider ? RB - 10 : RB - 18;
    if (o.y > fl) { o.y = fl; o.vy = -o.vy * 0.4; o.vx *= 0.6; o.vr *= 0.6; if (Math.abs(o.vy) < 30) o.vy = 0; }
    if (o.y >= fl - 0.5) o.vr *= 0.92;
  }
  if (G.ct > G.dur) over();
}
function over() {
  if (G.st === 'over') return;
  G.st = 'over'; const s = score(); if (s > best) { best = s; S.set('best', best); }
  $('oInfo').innerHTML = 'Очки: ' + s + '<br>Рекорд: ' + best + '<br>Бутылок за забег: ' + G.bot;
  document.body.className = 'over'; show('over');
}

/* ---------- render: кадр ---------- */
function tile(c, f, y, cam) {
  const lw = c.width / Q, lh = c.height / Q; let off = -(((cam * f) % lw) + lw) % lw; if (off > 0) off -= lw;
  for (let x = off; x < VW; x += lw) ctx.drawImage(c, x, y, lw, lh);
}
function draw() {
  ctx.setTransform(dpr * sc, 0, 0, dpr * sc, 0, 0);
  if (G.shake > 0) ctx.translate((Math.random() - 0.5) * G.shake * 6, (Math.random() - 0.5) * G.shake * 6); // тряска экрана
  const bxI = B.px + (B.x - B.px) * Math.min(1, acc * 60), cam = G.st === 'crash' || G.st === 'over' ? G.camx : bxI - 110, tm = performance.now() / 1000;
  ctx.fillStyle = skyG; ctx.fillRect(0, 0, VW, VH);
  const sg = ctx.createRadialGradient(VW * .78, RT * (TH.sy || .25), 4, VW * .78, RT * (TH.sy || .25), 60); sg.addColorStop(0, 'rgb(' + TH.sun + ')'); sg.addColorStop(.35, 'rgba(' + TH.sun + ',.6)'); sg.addColorStop(1, 'rgba(' + TH.sun + ',0)');
  ctx.fillStyle = sg; ctx.fillRect(VW * .78 - 60, RT * (TH.sy || .25) - 60, 120, 120);
  tile(BG.far, 0.15, RT - 260, cam); ctx.fillStyle = 'rgba(' + TH.haze + ',' + (0.3 + (TH.fog || 0)) + ')'; ctx.fillRect(0, RT - 260, VW, 260); tile(BG.mid, 0.5, RT - 170, cam); ctx.fillStyle = 'rgba(' + TH.haze + ',' + (0.12 + (TH.fog || 0)) + ')'; ctx.fillRect(0, RT - 170, VW, 170); tile(BG.near, 0.9, RT - 70, cam);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; birds.forEach((b, i) => { // птицы
    const bx = (((b.x - cam * 0.12 + tm * 15) % (VW + 60)) + VW + 60) % (VW + 60) - 30, by = b.y + Math.sin(tm * 2 + i) * 4, f = Math.sin(tm * 8 + i) * 4 * b.s;
    ctx.beginPath(); ctx.moveTo(bx - 7 * b.s, by - f); ctx.lineTo(bx, by); ctx.lineTo(bx + 7 * b.s, by - f); ctx.stroke();
  });
  // дорога
  let ox = -(((cam % 256) + 256) % 256); for (let x = ox; x < VW; x += 256) ctx.drawImage(BG.road, x, RT, 256, 84);
  const gg = ctx.createLinearGradient(0, RT + 84, 0, VH); gg.addColorStop(0, '#6b5a3e'); gg.addColorStop(1, '#46392a'); ctx.fillStyle = gg; ctx.fillRect(0, RT + 84, VW, VH - RT - 84); for (let yy = RT + 88, r = 0; yy < VH; yy += 200, r++) tile(BG.fg, 1, yy, cam + r * 173);
  ctx.fillStyle = 'rgba(235,235,225,.55)'; const mb = Math.floor(cam / 80); for (let k = 0; k < VW / 80 + 2; k++) { const id = mb + k, hh = (Math.imul(id, 2654435761) >>> 0) % 100; if (hh < 20) continue; ctx.fillRect(id * 80 - cam, RT + 40, 40 - (hh % 3) * 9, 4); } // стёртая разметка
  // сущности
  if (G.st !== 'menu') {
    for (const c of L.cars) { const sx = c.x - cam; if (sx > -130 && sx < VW + 20) drawCar(ctx, sx, RB, c.c, c === G.hitCar && G.st !== 'play' ? Math.sin(G.ct * 20) * Math.exp(-G.ct * 3) * 0.04 : 0); }
    for (const b of L.bots) { const sx = b.x - cam; if (sx > -20 && sx < VW + 20) bottle(ctx, sx, RB - b.h, tm); }
  }
  // байк
  const sx = bxI - cam;
  if (G.st === 'play' || G.st === 'menu' || G.st === 'start') {
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(sx + 29, RB, 38 - B.h * 0.1, 5, 0, 0, 6.283); ctx.fill();
    ctx.save(); ctx.translate(sx, RB - B.h); ctx.rotate(-B.ang * Math.PI / 180 - (B.h > 0 ? B.vy * 0.0006 : 0));
    bikeFull(ctx, skin(), B.wr, B.h === 0 ? Math.sin(tm * 18) * Math.min(B.v / 14, 1) * 0.9 : 0);
    if (TH.beam) { const bg = ctx.createLinearGradient(52, 0, 300, 0); bg.addColorStop(0, 'rgba(255,245,200,.55)'); bg.addColorStop(1, 'rgba(255,245,200,0)'); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(52, -56); ctx.lineTo(300, -95); ctx.lineTo(300, -5); ctx.closePath(); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; } // свет фары
    ctx.restore();
    if (G.st === 'play' && B.ang > 2) { // индикатор угла вили
      const r = B.ang / CFG.maxAngle, bx = sx + 64, by = RB - B.h - 140; ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(bx, by, 44, 7);
      ctx.fillStyle = 'hsl(' + (120 - 120 * Math.min(r, 1)) + ',90%,50%)'; ctx.fillRect(bx + 1, by + 1, 42 * Math.min(r, 1), 5);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'left'; ctx.fillText(Math.round(B.ang) + '°', bx, by - 3);
    }
  } else {
    ctx.save(); ctx.translate(G.bk.x - cam, G.bk.y); ctx.rotate(G.bk.r); ctx.translate(-29, 20); bikeBody(ctx, skin(), B.wr); ctx.restore();
    ctx.save(); ctx.translate(G.rider.x - cam, G.rider.y); ctx.rotate(G.rider.r); ctx.translate(-26, 66); rider(ctx, skin(), 0); ctx.restore();
  }
  if (G.st === 'play' && B.v > 9) { ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; for (let i = 0; i < 7; i++) { const yy = RT + 8 + ((i * 53) % 76), xx = ((i * 137 - cam * 1.6) % (VW + 80) + VW + 80) % (VW + 80) - 40; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - 30 - B.v * 1.5, yy); ctx.stroke(); } } // линии скорости
  for (const p of P) { const k = 1 - p.l / p.m; ctx.globalAlpha = Math.max(0, p.l / p.m) * (p.g ? 1 : 0.55); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x - cam, p.y, p.g ? 1.8 : 2 + k * 5, 0, 6.283); ctx.fill(); } ctx.globalAlpha = 1;
  tile(BG.fgw, 1.6, RT + 90, cam); // передний план
  if (TH.rain) { ctx.strokeStyle = 'rgba(205,220,235,.5)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 80; i++) { const rx = (i * 97.3 + tm * 120) % (VW + 40), ry = (i * 53.7 + tm * 560) % (VH + 30) - 15; ctx.moveTo(rx, ry); ctx.lineTo(rx - 5, ry + 14); } ctx.stroke(); }
  if (TH.tint) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = TH.tint; ctx.fillRect(0, 0, VW, VH); ctx.globalCompositeOperation = 'source-over'; } // цветокоррекция
  ctx.fillStyle = vig; ctx.fillRect(0, 0, VW, VH); // виньетка
  if (G.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + G.flash * 0.7 + ')'; ctx.fillRect(0, 0, VW, VH); }
  if (G.st === 'play' || G.st === 'crash') hud();
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function hud() {
  ctx.fillStyle = 'rgba(15,20,30,.55)'; rr(ctx, 8, 8, 150, 78, 12); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = 'bold 22px "Arial Black",Arial'; ctx.fillText('Очки: ' + score(), 18, 34);
  ctx.font = 'bold 13px Arial'; ctx.fillStyle = '#cfd8dc'; ctx.fillText('Рекорд: ' + best, 18, 54);
  ctx.save(); ctx.scale(0.6, 0.6); bottle(ctx, 30 / 0.6, 70 / 0.6, 0); ctx.restore();
  ctx.fillStyle = '#ffeb3b'; ctx.font = 'bold 15px Arial'; ctx.fillText('× ' + wallet, 42, 76);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // спидометр (экранные координаты)
  const iw = innerWidth, ih = innerHeight, cx = iw / 2, cy = ih - 14, r = Math.min(64, iw * 0.17), kmh = B.v * 3.6, SM = vmax();
  const fg = ctx.createRadialGradient(cx, cy, 4, cx, cy, r + 6); fg.addColorStop(0, '#2d3748'); fg.addColorStop(1, '#0e131c');
  ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, cy, r + 6, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r + 6, Math.PI, 0); ctx.stroke();
  ctx.strokeStyle = '#e53935'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, r - 3, Math.PI * 1.8, Math.PI * 2); ctx.stroke();
  ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
  for (let i = 0; i <= 10; i++) { const a = Math.PI + i / 10 * Math.PI, ca = Math.cos(a), sa = Math.sin(a), big = i % 2 === 0, l = r - (big ? 8 : 5); ctx.strokeStyle = '#fff'; ctx.lineWidth = big ? 2 : 1; ctx.beginPath(); ctx.moveTo(cx + ca * l, cy + sa * l); ctx.lineTo(cx + ca * r, cy + sa * r); ctx.stroke(); if (big) { ctx.fillStyle = '#fff'; ctx.fillText(Math.round(i * SM / 10), cx + ca * (r - 17), cy + sa * (r - 17) + 3); } }
  const a = Math.PI + Math.min(kmh, SM) / SM * Math.PI; ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12)); ctx.stroke(); ctx.lineCap = 'butt';
  ctx.fillStyle = '#cfd8dc'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 15px "Arial Black",Arial'; ctx.fillText(Math.round(kmh) + ' км/ч', cx, cy - 12);
}

/* ---------- ui: экраны, магазин ---------- */
function show(id) { ['start', 'over', 'shop'].forEach(s => $(s).classList.toggle('hide', s !== id)); if (id === 'start' || id === 'over') G.prev = id; ui(); }
function ui() { $('sInfo').innerHTML = 'Рекорд: ' + best + '<br>ГАЗЯВА: ' + wallet; $('shInfo').textContent = 'ГАЗЯВА: ' + wallet; $('snd').textContent = snd ? '🔊' : '🔇'; }
function startRun() { A.init(); A.resume(); reset(); G.st = 'play'; show(null); document.body.className = 'play'; A.playMusic(); }
function shop() {
  const l = $('list'); l.innerHTML = '';
  const hd = t => { const d = document.createElement('div'); d.className = 'h'; d.textContent = t; l.appendChild(d); };
  hd('Прокачка байка');
  UPG.forEach(u => {
    const lv = upg[u[0]], cost = (lv + 1) * 12, row = document.createElement('div'); row.className = 'row';
    const t = document.createElement('div'); t.className = 't'; t.innerHTML = u[1] + '<br><span class="pips">' + '●'.repeat(lv) + '○'.repeat(5 - lv) + '</span><br><small>' + u[2] + '</small>';
    const b = document.createElement('button'); b.className = 'btn';
    if (lv >= 5) { b.textContent = 'МАКС'; b.disabled = true; }
    else if (wallet >= cost) { b.textContent = 'Улучшить ' + cost; b.onclick = () => { wallet -= cost; upg[u[0]]++; S.set('wallet', wallet); S.set('upg', upg); shop(); ui(); }; }
    else { b.textContent = 'Нужно ' + cost; b.disabled = true; }
    row.append(t, b); l.appendChild(row);
  });
  hd('Скины');
  SKINS.forEach(k => {
    const row = document.createElement('div'); row.className = 'row';
    const cvs = document.createElement('canvas'); cvs.width = 240; cvs.height = 200; const c = cvs.getContext('2d'); c.scale(2, 2); c.translate(26, 92); c.scale(0.85, 0.85); bikeFull(c, k, 0.5, 0);
    const t = document.createElement('div'); t.className = 't'; const has = owned.includes(k.id); t.innerHTML = k.n + '<br>' + (k.p ? k.p + ' бутылок' : 'бесплатно');
    const b = document.createElement('button'); b.className = 'btn';
    if (has) { b.textContent = skinId === k.id ? 'Выбрано' : 'Выбрать'; b.disabled = skinId === k.id; b.onclick = () => { skinId = k.id; S.set('skin', skinId); shop(); }; }
    else if (wallet >= k.p) { b.textContent = 'Купить'; b.onclick = () => { wallet -= k.p; owned.push(k.id); skinId = k.id; S.set('wallet', wallet); S.set('owned', owned); S.set('skin', skinId); shop(); ui(); }; }
    else { b.textContent = 'Не хватает ' + (k.p - wallet); b.disabled = true; }
    row.append(cvs, t, b); l.appendChild(row);
  });
  ui();
}
document.querySelectorAll('.shopbtn').forEach(b => b.onclick = () => { show('shop'); shop(); });
$('back').onclick = () => show(G.prev);
$('play').onclick = startRun; $('again').onclick = startRun;
$('snd').onclick = e => { e.stopPropagation(); snd = !snd; S.set('snd', snd); if (A.music) { snd ? A.playMusic() : A.stopMusic(); } if (!snd) A.engine(0, false); ui(); };

/* ---------- input ---------- */
document.querySelectorAll('.ctl button').forEach(b => {
  const k = b.dataset.k;
  b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) {} keys[k] = 1; b.classList.add('on'); });
  const up = () => { if (k !== 'jump') keys[k] = 0; b.classList.remove('on'); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => b.addEventListener(t, up));
  b.addEventListener('contextmenu', e => e.preventDefault());
});
const KM = { ArrowRight: 'gas', ArrowLeft: 'brake', Space: 'jump', ArrowUp: 'wheelie', KeyW: 'wheelie' };
addEventListener('keydown', e => { const k = KM[e.code]; if (k) { keys[k] = 1; e.preventDefault(); } });
addEventListener('keyup', e => { const k = KM[e.code]; if (k && k !== 'jump') keys[k] = 0; });
cv.addEventListener('pointerdown', () => { if (G.st === 'crash' && G.ct > 0.2) over(); }); // тап пропускает ролик
document.addEventListener('visibilitychange', () => { // пауза при переключении вкладки
  G.paused = document.hidden; if (document.hidden) { A.stopMusic(); A.engine(0, false); } else if (G.st !== 'menu') A.playMusic();
});
addEventListener('contextmenu', e => e.preventDefault());

/* ---------- main loop: фиксированный шаг ---------- */
let last = 0, acc = 0;
function loop(ts) {
  requestAnimationFrame(loop); if (!last) last = ts; let dt = (ts - last) / 1000; last = ts; if (dt > 0.1) dt = 0.1;
  if (G.paused) return; acc += dt; while (acc >= 1 / 60) { step(1 / 60); acc -= 1 / 60; } draw();
}
resize(); reset(); G.st = 'menu'; ui(); requestAnimationFrame(loop);
