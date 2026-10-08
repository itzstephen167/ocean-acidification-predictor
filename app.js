(function () {
  'use strict';
  const D = window.OCEAN_DATA, M = window.OceanModel;
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

  const hist = D.projections.low.filter((r) => r.phase === 'historical');
  const PRESETS = {
    low: { label: 'Low emissions', anchors: { 2050: 444, 2075: 442, 2100: 432 } },
    intermediate: { label: 'Intermediate', anchors: { 2050: 485, 2075: 535, 2100: 600 } },
    high: { label: 'High', anchors: { 2050: 510, 2075: 650, 2100: 850 } },
    very_high: { label: 'Very high', anchors: { 2050: 545, 2075: 760, 2100: 1100 } },
  };
  const SCN_DESC = {
    low: D.meta.scenarios.low, intermediate: D.meta.scenarios.intermediate,
    high: D.meta.scenarios.high, very_high: D.meta.scenarios.very_high,
  };
  const YEAR0 = 1850, YEAR1 = 2100;

  const state = { scenario: 'intermediate', co2_50: 485, co2_100: 600, ta: 2300, temp: 18, warm: 0, year: 2025 };
  const defaultParams = () => state.ta === 2300 && state.temp === 18 && state.warm === 0;

  /* ---------- series ---------- */
  const cache = new Map();
  function getRows(fine) {
    if (state.scenario !== 'custom' && defaultParams()) return D.projections[state.scenario];
    const anchors = state.scenario === 'custom' ? { 2050: state.co2_50, 2100: state.co2_100 } : PRESETS[state.scenario].anchors;
    const n = fine ? 200 : 60;
    const key = [state.scenario, state.co2_50, state.co2_100, state.ta, state.temp, state.warm, n].join('|');
    if (!cache.has(key)) {
      if (cache.size > 40) cache.clear();
      cache.set(key, M.project(hist, anchors, { ta: state.ta, temp: state.temp, warming: state.warm }, { nMc: n }));
    }
    return cache.get(key);
  }
  const params = () => ({ ta: state.ta, temp: state.temp, warming: state.warm });

  /* ---------- colour from pH ---------- */
  const STOPS = [[8.18, [18, 150, 182], [4, 40, 70]], [8.0, [28, 150, 160], [5, 42, 62]], [7.85, [96, 160, 110], [14, 52, 52]], [7.68, [196, 150, 62], [44, 40, 24]]];
  function waterColors(ph) {
    let a = STOPS[0], b = STOPS[STOPS.length - 1];
    for (let i = 0; i < STOPS.length - 1; i++) if (ph <= STOPS[i][0] && ph >= STOPS[i + 1][0]) { a = STOPS[i]; b = STOPS[i + 1]; break; }
    if (ph > STOPS[0][0]) b = a; if (ph < STOPS[STOPS.length - 1][0]) a = b;
    const t = a === b ? 0 : (a[0] - ph) / (a[0] - b[0]);
    const mix = (i) => a[i].map((v, k) => Math.round(lerp(v, b[i][k], t)));
    return { top: mix(1), bot: mix(2) };
  }
  const rgb = (c, al) => `rgba(${c[0]},${c[1]},${c[2]},${al == null ? 1 : al})`;

  /* ---------- tiny seeded rng ---------- */
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ================= HERO ================= */
  const hero = $('heroCanvas'), hctx = hero.getContext('2d');
  let hw = 0, hh = 0, heroPh = 8.175, mouseX = 0.5;
  const heroBubbles = Array.from({ length: 46 }, (_, i) => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 4, s: 0.02 + Math.random() * 0.06, p: Math.random() * 6 }));
  function sizeHero() { const r = hero.getBoundingClientRect(), d = dpr(); hw = r.width; hh = r.height; hero.width = hw * d; hero.height = hh * d; hctx.setTransform(d, 0, 0, d, 0, 0); }
  window.addEventListener('resize', sizeHero); sizeHero();
  hero.parentElement.addEventListener('pointermove', (e) => { mouseX = e.clientX / innerWidth; });
  let heroVisible = true;
  new IntersectionObserver((e) => { heroVisible = e[0].isIntersecting; }, { threshold: 0 }).observe(hero);
  function drawHero(t) {
    if (heroVisible) {
      const c = waterColors(heroPh);
      const g = hctx.createLinearGradient(0, 0, 0, hh);
      g.addColorStop(0, rgb(c.bot.map((v) => v * 0.45))); g.addColorStop(0.55, rgb(c.bot, 1)); g.addColorStop(1, '#04121c');
      hctx.fillStyle = g; hctx.fillRect(0, 0, hw, hh);
      // light rays
      for (let i = 0; i < 5; i++) {
        const x = hw * (0.1 + i * 0.2) + Math.sin(t / 3000 + i) * 60 + (mouseX - 0.5) * 80;
        const rg = hctx.createLinearGradient(x, 0, x, hh * 0.8);
        rg.addColorStop(0, rgb(c.top.map((v) => Math.min(255, v + 90)), 0.12)); rg.addColorStop(1, 'transparent');
        hctx.fillStyle = rg; hctx.beginPath(); hctx.moveTo(x - 20, 0); hctx.lineTo(x + 20, 0); hctx.lineTo(x + 160 + Math.sin(t / 2500 + i) * 40, hh * 0.8); hctx.lineTo(x - 120, hh * 0.8); hctx.fill();
      }
      // bubbles
      for (const b of heroBubbles) {
        b.y -= b.s * 0.004 * 16; if (b.y < -0.05) { b.y = 1.05; b.x = Math.random(); }
        const x = (b.x + Math.sin(t / 1500 + b.p) * 0.01) * hw;
        hctx.beginPath(); hctx.arc(x, b.y * hh, b.r, 0, 6.283); hctx.strokeStyle = 'rgba(220,245,245,.25)'; hctx.lineWidth = 1; hctx.stroke();
      }
      // waves
      for (let k = 0; k < 4; k++) {
        const base = hh * (0.74 + k * 0.07), amp = 14 + k * 5, sp = (k + 1) * 0.00035 * (reduced ? 0 : 1);
        hctx.beginPath(); hctx.moveTo(0, hh);
        for (let x = 0; x <= hw; x += 8) hctx.lineTo(x, base + Math.sin(x * 0.006 + t * sp + k * 2) * amp + Math.sin(x * 0.013 - t * sp * 1.7) * amp * 0.4 + (mouseX - 0.5) * 12 * k);
        hctx.lineTo(hw, hh); hctx.closePath();
        hctx.fillStyle = rgb(c.top.map((v) => v * (0.35 + k * 0.13)), 0.55); hctx.fill();
      }
    }
    requestAnimationFrame(drawHero);
  }
  requestAnimationFrame(drawHero);

  // hero counter: sweep 1850 -> 2025 on the intermediate record
  (function heroCount() {
    const rows = D.projections.intermediate, end = 2025 - YEAR0, t0 = performance.now(), dur = reduced ? 1 : 3800;
    const ph = $('heroPh'), yr = $('heroYear'), sub = document.querySelector('.meter-sub');
    function step(now) {
      const t = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - t, 3), i = Math.round(e * end), r = rows[i];
      ph.textContent = r.pH.toFixed(2); yr.textContent = r.year; heroPh = r.pH;
      ph.style.color = rgb(waterColors(r.pH).top.map((v) => Math.min(255, v + 80)));
      if (t < 1) requestAnimationFrame(step); else sub.textContent = 'today. See where it goes next ↓';
    }
    requestAnimationFrame(step);
  })();

  /* ================= SHELL ================= */
  const shellCache = new Map();
  function shellCanvas(integrity) {
    const key = Math.round(integrity * 40);
    if (shellCache.has(key)) return shellCache.get(key);
    const S = 400, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'), I = key / 40, R = rng(7);
    const cx = 200, cy = 200, pts = [];
    for (let th = 0; th < 5 * Math.PI; th += 0.04) { const r = 4.5 * Math.exp(0.2 * th); pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th), r * 0.52, th]); }
    pts.forEach(([px, py, w, th], i) => {
      const g = x.createRadialGradient(px - w * 0.3, py - w * 0.3, w * 0.1, px, py, w);
      g.addColorStop(0, '#fff7ee'); g.addColorStop(0.6, '#ecd9c6'); g.addColorStop(1, '#c9a98d');
      x.beginPath(); x.arc(px, py, w, 0, 6.283); x.fillStyle = g; x.fill();
      if (i % 5 === 0) { x.strokeStyle = 'rgba(120,80,50,.28)'; x.lineWidth = 1; x.stroke(); }
    });
    // corrosion tint
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = `rgba(110,90,40,${(1 - I) * 0.45})`; x.fillRect(0, 0, S, S);
    // pits and eroded rim
    x.globalCompositeOperation = 'destination-out';
    const holes = Math.floor((1 - I) * (1 - I) * 160 + (1 - I) * 40);
    for (let h = 0; h < holes; h++) {
      const p = pts[Math.floor(R() * pts.length)], a = R() * 6.283, d = R() * p[2] * 0.95;
      const rad = 1.5 + R() * (2 + (1 - I) * 7);
      x.beginPath(); x.arc(p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d, rad, 0, 6.283); x.fill();
    }
    for (let h = 0; h < (1 - I) * 160; h++) { // bite the outline
      const p = pts[Math.floor(R() * pts.length)], a = R() * 6.283;
      x.beginPath(); x.arc(p[0] + Math.cos(a) * p[2], p[1] + Math.sin(a) * p[2], 1 + R() * (1 + (1 - I) * 6), 0, 6.283); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
    shellCache.set(key, c); if (shellCache.size > 60) shellCache.delete(shellCache.keys().next().value);
    return c;
  }
  const integrityOf = (om) => clamp((om - 1) / (3.4 - 1), 0, 1);
  const shellText = (i) => i > 0.8 ? 'Shell: healthy' : i > 0.55 ? 'Shell: slightly pitted' : i > 0.3 ? 'Shell: thinning and pitted' : 'Shell: heavily corroded';

  /* ================= TANK ================= */
  const tank = $('tank'), tctx = tank.getContext('2d');
  let tw = 0, th = 0, tankVisible = false;
  const view = { ph: 8.175, co2: 285, integ: 1 };
  const target = { ph: 8.175, co2: 285, integ: 1 };
  const molecules = [], ambient = Array.from({ length: 28 }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 3, s: 0.01 + Math.random() * 0.03, p: Math.random() * 6 }));
  function sizeTank() { const r = tank.getBoundingClientRect(), d = dpr(); tw = r.width; th = r.height; tank.width = tw * d; tank.height = th * d; tctx.setTransform(d, 0, 0, d, 0, 0); }
  new ResizeObserver(sizeTank).observe(tank); sizeTank();
  new IntersectionObserver((e) => { tankVisible = e[0].isIntersecting; }, { threshold: 0 }).observe(tank);
  let lastT = 0;
  function drawTank(t) {
    requestAnimationFrame(drawTank);
    if (!tankVisible || !tw) { lastT = t; return; }
    const dt = Math.min((t - lastT) / 16.7, 3); lastT = t;
    const k = 1 - Math.pow(0.001, dt / 60);
    view.ph += (target.ph - view.ph) * k; view.co2 += (target.co2 - view.co2) * k; view.integ += (target.integ - view.integ) * k;
    const c = waterColors(view.ph), surf = th * 0.14, sp = reduced ? 0 : 1;

    // sky
    const sky = tctx.createLinearGradient(0, 0, 0, surf);
    sky.addColorStop(0, '#0b1c2c'); sky.addColorStop(1, rgb(c.top.map((v) => v * 0.55 + 30)));
    tctx.fillStyle = sky; tctx.fillRect(0, 0, tw, th);
    // water body
    const wg = tctx.createLinearGradient(0, surf, 0, th);
    wg.addColorStop(0, rgb(c.top)); wg.addColorStop(1, rgb(c.bot));
    tctx.beginPath(); tctx.moveTo(0, th);
    for (let x = 0; x <= tw; x += 6) tctx.lineTo(x, surf + Math.sin(x * 0.02 + t * 0.002 * sp) * 4 + Math.sin(x * 0.045 - t * 0.003 * sp) * 2);
    tctx.lineTo(tw, th); tctx.closePath(); tctx.fillStyle = wg; tctx.fill();
    // rays
    for (let i = 0; i < 4; i++) {
      const x = tw * (0.15 + i * 0.24) + Math.sin(t / 2600 * sp + i * 2) * 30, rg = tctx.createLinearGradient(x, surf, x, th * 0.8);
      rg.addColorStop(0, 'rgba(255,255,240,.14)'); rg.addColorStop(1, 'transparent');
      tctx.fillStyle = rg; tctx.beginPath(); tctx.moveTo(x - 10, surf); tctx.lineTo(x + 24, surf); tctx.lineTo(x + 90, th * 0.8); tctx.lineTo(x - 70, th * 0.8); tctx.fill();
    }
    // ambient bubbles
    for (const b of ambient) {
      b.y -= b.s * 0.01 * dt * sp; if (b.y < surf / th) { b.y = 1.02; b.x = Math.random(); }
      tctx.beginPath(); tctx.arc((b.x + Math.sin(t / 900 + b.p) * 0.012) * tw, b.y * th, b.r, 0, 6.283); tctx.strokeStyle = 'rgba(235,255,255,.28)'; tctx.stroke();
    }
    // CO2 molecules diffusing in
    const want = clamp((view.co2 - 270) / 10, 0, 110);
    if (molecules.length < want && Math.random() < 0.6 * dt) molecules.push({ x: Math.random() * tw, y: surf, vx: (Math.random() - 0.5) * 0.4, vy: 0.3 + Math.random() * 0.6, life: 1, r: 3 + Math.random() * 2 });
    for (let i = molecules.length - 1; i >= 0; i--) {
      const m = molecules[i]; m.x += (m.vx + Math.sin(t / 400 + i) * 0.2) * dt * sp; m.y += m.vy * dt * sp; m.life -= 0.0028 * dt * sp;
      if (m.life <= 0 || m.y > th) { molecules.splice(i, 1); continue; }
      tctx.fillStyle = `rgba(255,122,89,${m.life * 0.85})`; tctx.beginPath(); tctx.arc(m.x, m.y, m.r, 0, 6.283); tctx.fill();
      tctx.fillStyle = `rgba(255,214,200,${m.life * 0.7})`; tctx.beginPath(); tctx.arc(m.x - m.r * 1.1, m.y + m.r * 0.4, m.r * 0.6, 0, 6.283); tctx.arc(m.x + m.r * 1.1, m.y + m.r * 0.4, m.r * 0.6, 0, 6.283); tctx.fill();
    }
    // sea floor
    const fl = tctx.createLinearGradient(0, th * 0.86, 0, th);
    fl.addColorStop(0, rgb(c.bot.map((v) => v * 0.8 + 18))); fl.addColorStop(1, rgb(c.bot.map((v) => v * 0.4)));
    tctx.beginPath(); tctx.moveTo(0, th);
    for (let x = 0; x <= tw; x += 10) tctx.lineTo(x, th * 0.9 + Math.sin(x * 0.012) * 9 + Math.sin(x * 0.03 + 1) * 4);
    tctx.lineTo(tw, th); tctx.fillStyle = fl; tctx.fill();
    // shell (pteropod-like) bobbing mid-water
    const sc = Math.min(tw, th) / 400 * 0.6, bob = Math.sin(t / 1100 * sp) * 8;
        tctx.save(); tctx.translate(tw * 0.5, th * 0.55 + bob); tctx.rotate(Math.sin(t / 1700 * sp) * 0.06 - 0.35); tctx.translate(-200 * sc, -200 * sc);
    tctx.shadowColor = 'rgba(0,0,0,.35)'; tctx.shadowBlur = 24;
    tctx.drawImage(shellCanvas(view.integ), 0, 0, 400 * sc, 400 * sc); tctx.restore();
    // acid shimmer overlay when low pH
    const sour = clamp((8.0 - view.ph) / 0.35, 0, 1);
    if (sour > 0) { tctx.fillStyle = `rgba(240,180,60,${sour * 0.1})`; tctx.fillRect(0, surf, tw, th); }
  }
  requestAnimationFrame(drawTank);

  /* ================= CHARTS ================= */
  function setupChart(canvas) {
    const o = { canvas, ctx: canvas.getContext('2d'), w: 0, h: 0, draw: null };
    const size = () => { const r = canvas.getBoundingClientRect(), d = dpr(); o.w = r.width; o.h = r.height; canvas.width = r.width * d; canvas.height = r.height * d; o.ctx.setTransform(d, 0, 0, d, 0, 0); if (o.draw) o.draw(); };
    new ResizeObserver(size).observe(canvas);
    const scrub = (e) => { const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left - PAD.l) / (r.width - PAD.l - PAD.r); setYear(Math.round(YEAR0 + clamp(x, 0, 1) * (YEAR1 - YEAR0))); stopPlay(); };
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); scrub(e); canvas.onpointermove = scrub; });
    canvas.addEventListener('pointerup', () => { canvas.onpointermove = null; });
    return o;
  }
  const PAD = { l: 46, r: 16, t: 14, b: 26 };
  const chPh = setupChart($('chartPh')), chOm = setupChart($('chartOm'));

  function drawChart(ch, o) {
    const { ctx, w, h } = ch; if (!w) return;
    ctx.clearRect(0, 0, w, h);
    const pw = w - PAD.l - PAD.r, ph = h - PAD.t - PAD.b;
    const X = (y) => PAD.l + (y - YEAR0) / (YEAR1 - YEAR0) * pw, Y = (v) => PAD.t + (1 - (v - o.min) / (o.max - o.min)) * ph;
    ctx.font = '11px "JetBrains Mono",monospace'; ctx.textBaseline = 'middle';
    // grid
    ctx.strokeStyle = 'rgba(159,194,200,.12)'; ctx.fillStyle = 'rgba(159,194,200,.7)'; ctx.lineWidth = 1; ctx.textAlign = 'right';
    for (let v = Math.ceil(o.min / o.step) * o.step; v <= o.max + 1e-9; v += o.step) { const y = Y(v); ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y); ctx.stroke(); ctx.fillText(v.toFixed(o.dec), PAD.l - 8, y); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let y = 1850; y <= 2100; y += 50) ctx.fillText(y, X(y), h - PAD.b + 8);
    // reference line
    if (o.ref != null && o.ref > o.min && o.ref < o.max) {
      ctx.strokeStyle = 'rgba(255,122,89,.8)'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(PAD.l, Y(o.ref)); ctx.lineTo(w - PAD.r, Y(o.ref)); ctx.stroke(); ctx.setLineDash([]);
    }
    // ghosts
    ctx.strokeStyle = 'rgba(159,194,200,.38)'; ctx.lineWidth = 1.3;
    for (const g of o.ghosts) { ctx.beginPath(); g.forEach((r, i) => { const x = X(r.year), y = Y(r[o.key]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }
    // band
    ctx.beginPath(); o.rows.forEach((r, i) => { const x = X(r.year), y = Y(r[o.key + '_hi']); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    for (let i = o.rows.length - 1; i >= 0; i--) ctx.lineTo(X(o.rows[i].year), Y(o.rows[i][o.key + '_lo']));
    ctx.closePath(); ctx.fillStyle = 'rgba(50,196,192,.22)'; ctx.fill();
    // projection start
    const fx = X(2025); ctx.strokeStyle = 'rgba(159,194,200,.25)'; ctx.beginPath(); ctx.moveTo(fx, PAD.t); ctx.lineTo(fx, h - PAD.b); ctx.stroke();
    ctx.fillStyle = 'rgba(159,194,200,.6)'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('observed ◂ ▸ projected', fx - 62, PAD.t + 2);
    // line (gradient by pH/omega)
    const lg = ctx.createLinearGradient(PAD.l, 0, w - PAD.r, 0); lg.addColorStop(0, '#6fe3d8'); lg.addColorStop(1, '#f2b548');
    ctx.strokeStyle = lg; ctx.lineWidth = 2.8; ctx.lineJoin = 'round'; ctx.beginPath();
    o.rows.forEach((r, i) => { const x = X(r.year), y = Y(r[o.key]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    // marker
    const r = o.rows[clamp(state.year - YEAR0, 0, o.rows.length - 1)], mx = X(r.year), my = Y(r[o.key]);
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(mx, PAD.t); ctx.lineTo(mx, h - PAD.b); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx, my, 5.5, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#32c4c0'; ctx.lineWidth = 2; ctx.stroke();
    const label = r[o.key].toFixed(o.dec + 1), tw2 = ctx.measureText(label).width + 14, lx = clamp(mx - tw2 / 2, PAD.l, w - PAD.r - tw2), ly = my < PAD.t + 50 ? my + 12 : my - 28;
    ctx.fillStyle = 'rgba(4,18,28,.92)'; ctx.beginPath(); ctx.roundRect(lx, ly, tw2, 20, 6); ctx.fill();
    ctx.fillStyle = '#e8f6f5'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, lx + tw2 / 2, ly + 10.5);
  }
  function domain(rows, ghosts, key, padFrac, step) {
    let lo = Infinity, hi = -Infinity;
    for (const set of [rows, ...ghosts]) for (const r of set) { lo = Math.min(lo, r[key + '_lo'] ?? r[key], r[key]); hi = Math.max(hi, r[key + '_hi'] ?? r[key], r[key]); }
    const pad = (hi - lo) * padFrac;
    return { min: Math.floor((lo - pad) / step) * step, max: Math.ceil((hi + pad) / step) * step };
  }

  /* ================= UPDATE ================= */
  let rows = D.projections.intermediate, fineTimer = 0;
  function render() {
    const ghosts = Object.keys(PRESETS).filter((s) => s !== state.scenario).map((s) => D.projections[s]);
    const dp = domain(rows, ghosts, 'pH', 0.05, 0.1), dom = domain(rows, ghosts, 'omega_arag', 0.06, 0.5);
    chPh.draw = () => drawChart(chPh, { rows, ghosts, key: 'pH', dec: 2, step: 0.1, min: dp.min, max: dp.max });
    chOm.draw = () => drawChart(chOm, { rows, ghosts, key: 'omega_arag', dec: 1, step: 0.5, min: Math.min(dom.min, 0.5), max: dom.max, ref: 1 });
    chPh.draw(); chOm.draw();
    readout();
  }
  function readout() {
    const r = rows[clamp(state.year - YEAR0, 0, rows.length - 1)];
    $('hudYear').textContent = r.year; $('hudPh').textContent = r.pH.toFixed(2);
    $('cCo2').textContent = Math.round(r.co2_ppm);
    $('cAcid').textContent = '+' + r.acidity_change_pct.toFixed(0) + '%';
    $('cOmega').textContent = r.omega_arag.toFixed(2);
    $('cDelta').textContent = (r.pH - rows[0].pH).toFixed(3).replace('-', '−');
    target.ph = r.pH; target.co2 = r.co2_ppm; target.integ = integrityOf(r.omega_arag);
    $('shellStatus').textContent = shellText(target.integ);
    $('yearRange').value = r.year;
    species(r);
    chPh.draw && chPh.draw(); chOm.draw && chOm.draw();
  }
  function setYear(y) { state.year = clamp(y, YEAR0, YEAR1); readout(); }

  function species(r) {
    const p = Object.assign({}, M.DEFAULTS, params()), base = M.oceanState(p.ref, 2025, p), now = M.oceanState(r.co2_ppm, r.year, p);
    const items = [
      ['Dissolved CO₂', 'CO₂(aq)', now.co2aq / base.co2aq - 1, '#ff7a59'],
      ['Bicarbonate', 'HCO₃⁻', now.hco3 / base.hco3 - 1, '#6fe3d8'],
      ['Carbonate', 'CO₃²⁻ · shell-builder', now.co3 / base.co3 - 1, '#f2b548'],
      ['Hydrogen ions', 'H⁺ · acidity', now.h / base.h - 1, '#ff7a59'],
    ];
    const el = $('species');
    if (!el.children.length) el.innerHTML = items.map(() => '<div class="sp"><div class="nm"></div><div class="axis"><i></i></div><div class="val"></div></div>').join('');
    items.forEach(([n, sub, pct, col], i) => {
      const row = el.children[i], f = Math.sign(pct) * Math.log1p(Math.abs(pct) * 10) / Math.log1p(25) * 50, bar = row.querySelector('i');
      row.querySelector('.nm').innerHTML = `${n}<small>${sub}</small>`;
      bar.style.background = col; bar.style.left = (f >= 0 ? 50 : 50 + f) + '%'; bar.style.width = Math.abs(clamp(f, -50, 50)) + '%';
      row.querySelector('.val').textContent = (pct >= 0 ? '+' : '−') + Math.abs(pct * 100).toFixed(pct > 0.1 ? 0 : 1) + '%';
    });
  }

  function recompute(fine) { rows = getRows(fine); render(); }
  function syncDials() {
    $('sCo250').value = state.co2_50; $('sCo2100').value = state.co2_100; $('sTa').value = state.ta; $('sTemp').value = state.temp; $('sWarm').value = state.warm;
    $('oCo250').textContent = state.co2_50 + ' ppm'; $('oCo2100').textContent = state.co2_100 + ' ppm';
    $('oTa').textContent = state.ta + ' µmol/kg'; $('oTemp').textContent = state.temp.toFixed(1) + ' °C'; $('oWarm').textContent = '+' + state.warm.toFixed(2) + ' °C/decade';
    document.querySelectorAll('#scenarioSeg button').forEach((b) => { const on = b.dataset.s === state.scenario; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    $('customBtn').hidden = state.scenario !== 'custom';
    const mod = !defaultParams() ? ' · modified ocean: ' + [state.ta !== 2300 && `TA ${state.ta}`, state.temp !== 18 && `${state.temp} °C`, state.warm && `+${state.warm}/decade warming`].filter(Boolean).join(', ') : '';
    $('scnDesc').textContent = (state.scenario === 'custom' ? `Your own path: ${state.co2_50} ppm in 2050, ${state.co2_100} ppm in 2100.` : SCN_DESC[state.scenario]) + mod;
  }
  function pick(s) {
    stopPlay(); state.scenario = s;
    if (s !== 'custom') { state.co2_50 = PRESETS[s].anchors[2050]; state.co2_100 = PRESETS[s].anchors[2100]; }
    syncDials(); recompute(true);
  }
  document.querySelectorAll('#scenarioSeg button').forEach((b) => b.addEventListener('click', () => pick(b.dataset.s)));

  const bindDial = (id, key, custom) => {
    const el = $(id);
    el.addEventListener('input', () => { state[key] = +el.value; if (custom) state.scenario = 'custom'; syncDials(); cancelAnimationFrame(fineTimer); fineTimer = requestAnimationFrame(() => recompute(false)); });
    el.addEventListener('change', () => recompute(true));
  };
  bindDial('sCo250', 'co2_50', true); bindDial('sCo2100', 'co2_100', true); bindDial('sTa', 'ta'); bindDial('sTemp', 'temp'); bindDial('sWarm', 'warm');
  $('resetBtn').addEventListener('click', () => { Object.assign(state, { ta: 2300, temp: 18, warm: 0 }); pick('intermediate'); });
  $('yearRange').addEventListener('input', (e) => { stopPlay(); setYear(+e.target.value); });

  /* play */
  let playing = 0;
  function stopPlay() { if (playing) { cancelAnimationFrame(playing); playing = 0; $('playBtn').textContent = '▶ Play'; } }
  $('playBtn').addEventListener('click', () => {
    if (playing) return stopPlay();
    if (state.year >= YEAR1) state.year = YEAR0;
    $('playBtn').textContent = '❚❚ Pause'; let last = performance.now(), acc = 0;
    const tick = (now) => { acc += now - last; last = now; while (acc > 45) { acc -= 45; state.year++; } if (state.year >= YEAR1) { setYear(YEAR1); return stopPlay(); } setYear(state.year); playing = requestAnimationFrame(tick); };
    playing = requestAnimationFrame(tick);
  });

  /* ================= SHOWDOWN ================= */
  (function bars() {
    const el = $('bars'); const cols = { low: '#32c4c0', intermediate: '#9bd36a', high: '#f2b548', very_high: '#ff7a59' };
    el.innerHTML = Object.keys(PRESETS).map((s) => {
      const h = D.headline[s];
      return `<button class="bar" data-s="${s}" aria-label="${PRESETS[s].label}: pH ${h.pH_2100.toFixed(2)} in 2100. Load into explorer."><div class="name">${PRESETS[s].label}<small>${h.co2_ppm_2100} ppm in 2100</small></div><div class="track"><div class="fill" data-w="${((h.pH_1850 - h.pH_2100) / 0.55 * 100).toFixed(1)}" style="background:${cols[s]}"></div></div><div class="num">${h.pH_2100.toFixed(2)}<small>+${h.acidity_change_pct_2100.toFixed(0)}% acid · Ω ${h.omega_arag_2100.toFixed(1)}</small></div></button>`;
    }).join('');
    el.querySelectorAll('.bar').forEach((b) => b.addEventListener('click', () => { pick(b.dataset.s); setYear(2100); $('explore').scrollIntoView({ behavior: 'smooth' }); }));
  })();

  /* ================= REVEAL ================= */
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); e.target.querySelectorAll('.fill').forEach((f) => { f.style.width = f.dataset.w + '%'; }); io.unobserve(e.target); } }), { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach((n) => io.observe(n));
  const nav = $('nav'); const onScroll = () => nav.classList.toggle('solid', scrollY > 40); addEventListener('scroll', onScroll, { passive: true }); onScroll();

  syncDials(); render();
  window.__ocean = { state, pick, setYear, getRows: () => rows };
})();
