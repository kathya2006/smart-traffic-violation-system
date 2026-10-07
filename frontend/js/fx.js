// Electric FX engine: drifting neon particles, random lightning strikes,
// cursor sparks and the pointer spotlight on glass cards.
// Everything is skipped when the user prefers reduced motion.
const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let canvas; let ctx; let W = 0; let H = 0; let dpr = 1;
let particles = [];
let bolts = [];
let sparks = [];
let lastStrike = 0;
let nextStrikeIn = 3500;
let running = false;
let mouse = { x: -999, y: -999, t: 0 };

const COLORS = ['0,229,255', '139,92,255', '77,124,255', '255,61,154'];
const rand = (a, b) => a + Math.random() * (b - a);

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = Math.round(Math.min(70, (W * H) / 26000));
  particles = Array.from({ length: n }, () => ({
    x: rand(0, W), y: rand(0, H), r: rand(.8, 2.4), vx: rand(-.12, .12), vy: rand(-.32, -.06),
    c: COLORS[Math.floor(Math.random() * COLORS.length)], a: rand(.25, .8), tw: rand(0, Math.PI * 2),
  }));
}

// midpoint-displacement lightning path with a few branches
function makeBolt(x1, y1, x2, y2, depth = 0) {
  const pts = [[x1, y1], [x2, y2]];
  let disp = Math.hypot(x2 - x1, y2 - y1) * 0.22;
  for (let pass = 0; pass < 6; pass++) {
    for (let i = pts.length - 1; i > 0; i--) {
      const [ax, ay] = pts[i - 1]; const [bx, by] = pts[i];
      const mx = (ax + bx) / 2 + rand(-disp, disp);
      const my = (ay + by) / 2 + rand(-disp * .35, disp * .35);
      pts.splice(i, 0, [mx, my]);
    }
    disp *= 0.52;
  }
  const branches = [];
  if (depth < 2) {
    for (let i = 3; i < pts.length - 3; i += Math.floor(rand(6, 12))) {
      if (Math.random() < .55) {
        const [bx, by] = pts[i];
        const ang = Math.atan2(y2 - y1, x2 - x1) + rand(-.9, .9);
        const len = rand(60, 190) / (depth + 1);
        branches.push(makeBolt(bx, by, bx + Math.cos(ang) * len, by + Math.sin(ang) * len, depth + 1));
      }
    }
  }
  return { pts, branches };
}

export function strike(x) {
  if (reduce || !ctx) return;
  const sx = x ?? rand(W * .08, W * .92);
  const bolt = makeBolt(sx, -10, sx + rand(-W * .18, W * .18), rand(H * .35, H * .85));
  bolts.push({ bolt, born: performance.now(), life: rand(420, 620), color: Math.random() < .7 ? '0,229,255' : '170,120,255' });
  const flash = document.getElementById('flash');
  if (flash) { flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go'); }
}

function drawPath(b, alpha, width) {
  ctx.beginPath();
  b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineWidth = width; ctx.globalAlpha = alpha; ctx.stroke();
  b.branches.forEach((br) => drawPath(br, alpha * .7, width * .6));
}

function frame(now) {
  if (!running) return;
  ctx.clearRect(0, 0, W, H);

  // particles + faint links
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.tw += .03;
    if (p.y < -10) { p.y = H + 10; p.x = rand(0, W); }
    if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
    const a = p.a * (.6 + .4 * Math.sin(p.tw));
    ctx.beginPath(); ctx.fillStyle = `rgba(${p.c},${a})`; ctx.shadowColor = `rgba(${p.c},.9)`; ctx.shadowBlur = 10;
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    for (let j = i + 1; j < particles.length; j++) {
      const q = particles[j]; const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < 110) { ctx.shadowBlur = 0; ctx.strokeStyle = `rgba(${p.c},${(1 - d / 110) * .14})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
    }
  }
  ctx.shadowBlur = 0;

  // lightning
  if (now - lastStrike > nextStrikeIn) { strike(); lastStrike = now; nextStrikeIn = rand(5200, 11000); }
  bolts = bolts.filter((b) => now - b.born < b.life);
  for (const b of bolts) {
    const t = (now - b.born) / b.life;
    const flicker = t < .3 ? 1 : (Math.random() < .35 ? .35 : .8) * (1 - t);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${b.color},1)`; ctx.shadowColor = `rgba(${b.color},1)`; ctx.shadowBlur = 28;
    drawPath(b.bolt, flicker * .75, 5);
    ctx.strokeStyle = '#ffffff'; ctx.shadowBlur = 12;
    drawPath(b.bolt, flicker, 1.6);
    ctx.restore();
  }

  // cursor sparks
  sparks = sparks.filter((s) => s.life > 0);
  for (const s of sparks) {
    s.x += s.vx; s.y += s.vy; s.vy += .06; s.life -= 1;
    ctx.beginPath(); ctx.fillStyle = `rgba(${s.c},${Math.max(0, s.life / s.max)})`; ctx.shadowColor = `rgba(${s.c},1)`; ctx.shadowBlur = 8;
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;

  requestAnimationFrame(frame);
}

function onMove(e) {
  // spotlight on glass cards
  const card = e.target.closest && e.target.closest('.glass');
  if (card) {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }
  if (reduce) return;
  const now = performance.now();
  if (now - mouse.t > 38 && Math.hypot(e.clientX - mouse.x, e.clientY - mouse.y) > 14) {
    mouse = { x: e.clientX, y: e.clientY, t: now };
    for (let i = 0; i < 2; i++) {
      sparks.push({ x: e.clientX, y: e.clientY, vx: rand(-1.4, 1.4), vy: rand(-1.8, .2), r: rand(.8, 1.9), life: 26, max: 26, c: Math.random() < .6 ? '0,229,255' : '190,140,255' });
    }
    if (sparks.length > 90) sparks.splice(0, sparks.length - 90);
  }
}

/** Gentle 3D tilt for elements with [data-tilt]. */
function onTilt(e) {
  if (reduce) return;
  const el = e.target.closest && e.target.closest('[data-tilt]');
  if (!el) return;
  const r = el.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width - .5; const py = (e.clientY - r.top) / r.height - .5;
  el.style.transform = `perspective(900px) rotateY(${px * 7}deg) rotateX(${-py * 7}deg) translateY(-4px)`;
}
function offTilt(e) {
  const el = e.target.closest && e.target.closest('[data-tilt]');
  if (el && !el.contains(e.relatedTarget)) el.style.transform = '';
}

export function startFx() {
  canvas = document.getElementById('fx');
  document.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('mousemove', onTilt, { passive: true });
  document.addEventListener('mouseout', offTilt);
  if (reduce || !canvas) return;
  ctx = canvas.getContext('2d');
  if (!ctx) return;
  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; requestAnimationFrame(frame); }
  });
  running = true;
  lastStrike = performance.now() - 2500;
  requestAnimationFrame(frame);
}
