// The scenarios page: overlay any two emissions paths, plus a summary row for each.
(function () {
  'use strict';
  const D = window.OCEAN_DATA, { PRESETS, YEAR0, YEAR1 } = window.OceanSite;
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const minus = (s) => s.replace('-', '−');

  const METRICS = {
    pH: { title: 'Surface pH', key: 'pH', dec: 2, step: 0.1, pad: 0.05, gapDec: 2, gapUnit: 'pH units' },
    omega: { title: 'Aragonite saturation (Ω)', key: 'omega_arag', dec: 2, step: 0.5, pad: 0.06, gapDec: 2, gapUnit: 'Ω units', ref: 1 },
  };
  const INK = { a: '#6a4cf5', b: '#f2734f' }, BAND = { a: 'rgba(106,76,245,.16)', b: 'rgba(242,115,79,.16)' };
  const state = { a: 'low', b: 'very_high', metric: 'pH', year: 2100 };
  const series = (w) => D.projections[state[w]];
  const rowAt = (w) => series(w)[state.year - YEAR0];

  /* ================= CHART ================= */
  const PAD = { l: 46, r: 20, t: 14, b: 26 };
  const canvas = $('cmpChart'), ctx = canvas.getContext('2d');
  let cw = 0, ch = 0;
  function size() { const r = canvas.getBoundingClientRect(), d = dpr(); cw = r.width; ch = r.height; canvas.width = cw * d; canvas.height = ch * d; ctx.setTransform(d, 0, 0, d, 0, 0); draw(); }

  // Chart colours come from CSS custom properties so the canvas follows dark mode.
  let C = {};
  const readColors = () => { const cs = getComputedStyle(document.documentElement); for (const k of ['grid', 'text', 'split', 'split-text', 'cursor', 'dot', 'tag']) C[k] = cs.getPropertyValue('--chart-' + k).trim(); };

  function draw() {
    if (!cw) return;
    const m = METRICS[state.metric], key = m.key;
    let lo = Infinity, hi = -Infinity;
    for (const w of ['a', 'b']) for (const r of series(w)) { lo = Math.min(lo, r[key + '_lo'], r[key]); hi = Math.max(hi, r[key + '_hi'], r[key]); }
    const pad = (hi - lo) * m.pad, min = Math.min(Math.floor((lo - pad) / m.step) * m.step, m.ref != null ? m.ref - m.step : Infinity), max = Math.ceil((hi + pad) / m.step) * m.step;
    const pw = cw - PAD.l - PAD.r, ph = ch - PAD.t - PAD.b;
    const X = (y) => PAD.l + (y - YEAR0) / (YEAR1 - YEAR0) * pw, Y = (v) => PAD.t + (1 - (v - min) / (max - min)) * ph;
    ctx.clearRect(0, 0, cw, ch);
    ctx.font = '11px Poppins, system-ui, sans-serif'; ctx.textBaseline = 'middle';
    // grid
    ctx.strokeStyle = C.grid; ctx.fillStyle = C.text; ctx.lineWidth = 1; ctx.textAlign = 'right';
    for (let v = Math.ceil(min / m.step) * m.step; v <= max + 1e-9; v += m.step) { const y = Y(v); ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(cw - PAD.r, y); ctx.stroke(); ctx.fillText(v.toFixed(1), PAD.l - 8, y); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let y = 1850; y <= 2100; y += 50) ctx.fillText(y, X(y), ch - PAD.b + 8);
    // reference line
    if (m.ref != null) { ctx.strokeStyle = '#e5484d'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(PAD.l, Y(m.ref)); ctx.lineTo(cw - PAD.r, Y(m.ref)); ctx.stroke(); ctx.setLineDash([]); }
    // projection start
    const fx = X(2025); ctx.strokeStyle = C.split; ctx.beginPath(); ctx.moveTo(fx, PAD.t); ctx.lineTo(fx, ch - PAD.b); ctx.stroke();
    ctx.fillStyle = C['split-text']; ctx.textAlign = 'right'; ctx.fillText('observed', fx - 6, PAD.t + 2); ctx.textAlign = 'left'; ctx.fillText('projected', fx + 6, PAD.t + 2);
    // bands, then lines: the second path is dashed so the two differ without relying on colour
    for (const w of ['a', 'b']) {
      const rows = series(w);
      ctx.beginPath(); rows.forEach((r, i) => { const x = X(r.year), y = Y(r[key + '_hi']); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      for (let i = rows.length - 1; i >= 0; i--) ctx.lineTo(X(rows[i].year), Y(rows[i][key + '_lo']));
      ctx.closePath(); ctx.fillStyle = BAND[w]; ctx.fill();
    }
    for (const w of ['a', 'b']) {
      ctx.strokeStyle = INK[w]; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.setLineDash(w === 'b' ? [8, 5] : []);
      ctx.beginPath(); series(w).forEach((r, i) => { const x = X(r.year), y = Y(r[key]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    }
    ctx.setLineDash([]);
    // markers
    const mx = X(state.year);
    ctx.strokeStyle = C.cursor; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(mx, PAD.t); ctx.lineTo(mx, ch - PAD.b); ctx.stroke();
    for (const w of ['a', 'b']) { ctx.fillStyle = C.dot; ctx.strokeStyle = INK[w]; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(mx, Y(rowAt(w)[key]), 5.5, 0, 6.283); ctx.fill(); ctx.stroke(); }
  }

  /* ================= READOUT ================= */
  const gapText = (m, a, b) => Math.abs(a - b).toFixed(m.gapDec);
  function readout() {
    const m = METRICS[state.metric], ra = rowAt('a'), rb = rowAt('b');
    $('cmpYear').textContent = state.year;
    $('cmpPhase').textContent = state.year <= 2025 ? 'observed record' : 'projection';
    $('cmpA').textContent = ra[m.key].toFixed(m.dec); $('cmpB').textContent = rb[m.key].toFixed(m.dec);
    $('cmpCo2A').textContent = Math.round(ra.co2_ppm) + ' ppm CO₂'; $('cmpCo2B').textContent = Math.round(rb.co2_ppm) + ' ppm CO₂';
    $('cmpGap').textContent = gapText(m, ra[m.key], rb[m.key]); $('cmpGapUnit').textContent = m.gapUnit;
    $('cmpRange').value = state.year;
    if ($('cmpTableBox').open) dataTable();
    draw();
    saveUrlSoon();
  }
  function setYear(y) { state.year = clamp(y, YEAR0, YEAR1); readout(); }

  function dataTable() {
    const m = METRICS[state.metric], nameA = PRESETS[state.a].label, nameB = PRESETS[state.b].label;
    $('cmpCaption').textContent = `${m.title}, every 10 years. The selected year (${state.year}) is highlighted.`;
    $('cmpHeadA').textContent = nameA; $('cmpHeadB').textContent = nameB;
    const a = series('a'), b = series('b');
    $('cmpBody').innerHTML = a.map((r, i) => [r, b[i]]).filter(([r]) => r.year % 10 === 0 || r.year === state.year).map(([r, s]) =>
      `<tr${r.year === state.year ? ' class="now" aria-current="true"' : ''}><td>${r.year}</td><td>${r[m.key].toFixed(3)}</td><td>${s[m.key].toFixed(3)}</td><td>${Math.abs(r[m.key] - s[m.key]).toFixed(3)}</td></tr>`).join('');
  }
  $('cmpTableBox').addEventListener('toggle', () => { if ($('cmpTableBox').open) dataTable(); });

  /* ================= CONTROLS ================= */
  const ids = Object.keys(PRESETS);
  for (const [seg, w] of [['segA', 'a'], ['segB', 'b']]) {
    $(seg).innerHTML = ids.map((s) => `<button role="radio" data-s="${s}">${PRESETS[s].label}</button>`).join('');
    $(seg).addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      const other = w === 'a' ? 'b' : 'a';
      // Picking the path the other side already shows swaps them, so the chart always has two.
      if (btn.dataset.s === state[other]) state[other] = state[w];
      state[w] = btn.dataset.s; sync();
    });
  }
  $('metricSeg').addEventListener('click', (e) => { const btn = e.target.closest('button'); if (btn) { state.metric = btn.dataset.m; sync(); } });
  function sync() {
    const mark = (seg, attr, val) => document.querySelectorAll(`#${seg} button`).forEach((b) => { const on = b.dataset[attr] === val; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    mark('segA', 's', state.a); mark('segB', 's', state.b); mark('metricSeg', 'm', state.metric);
    const m = METRICS[state.metric];
    $('cmpNameA').textContent = PRESETS[state.a].label; $('cmpNameB').textContent = PRESETS[state.b].label;
    $('cmpTitle').textContent = m.title;
    $('cmpRefSw').style.display = m.ref == null ? 'none' : ''; $('cmpRefText').textContent = m.ref != null ? 'Ω = 1' : '';
    readout();
  }
  const scrub = (e) => { const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left - PAD.l) / (r.width - PAD.l - PAD.r); setYear(Math.round(YEAR0 + clamp(x, 0, 1) * (YEAR1 - YEAR0))); };
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); scrub(e); canvas.onpointermove = scrub; });
  canvas.addEventListener('pointerup', () => { canvas.onpointermove = null; });
  $('cmpRange').addEventListener('input', (e) => setYear(+e.target.value));

  /* ================= SHAREABLE LINKS ================= */
  // ?a=path&b=path&m=omega&y=year. Defaults are left out.
  function loadUrl() {
    const q = new URLSearchParams(location.search), a = q.get('a'), b = q.get('b'), y = parseInt(q.get('y'), 10);
    if (PRESETS[a]) state.a = a;
    if (PRESETS[b]) state.b = b;
    if (state.a === state.b) state.b = state.a === 'very_high' ? 'low' : 'very_high';
    if (METRICS[q.get('m')]) state.metric = q.get('m');
    if (Number.isFinite(y)) state.year = clamp(y, YEAR0, YEAR1);
  }
  function shareUrl() {
    const q = new URLSearchParams();
    if (state.a !== 'low') q.set('a', state.a);
    if (state.b !== 'very_high') q.set('b', state.b);
    if (state.metric !== 'pH') q.set('m', state.metric);
    if (state.year !== 2100) q.set('y', state.year);
    const qs = q.toString();
    return location.pathname + (qs ? '?' + qs : '');
  }
  let urlTimer = 0;
  function saveUrlSoon() { clearTimeout(urlTimer); urlTimer = setTimeout(() => history.replaceState(null, '', shareUrl()), 300); }
  $('cmpShare').addEventListener('click', () => {
    const b = $('cmpShare'), done = (msg) => { b.textContent = msg; setTimeout(() => { b.textContent = 'Copy link'; }, 1600); };
    history.replaceState(null, '', shareUrl());
    if (navigator.clipboard) navigator.clipboard.writeText(location.origin + shareUrl()).then(() => done('Copied'), () => done('Use address bar'));
    else done('Use address bar');
  });

  /* ================= SCENARIO ROWS ================= */
  $('bars').innerHTML = Object.keys(PRESETS).map((s) => {
    const h = D.headline[s], w = ((h.pH_1850 - h.pH_2100) / 0.55 * 100).toFixed(1);
    return `<div class="row scn-row">
      <div class="row-name">${PRESETS[s].label}<span>${h.co2_ppm_2100.toLocaleString()} ppm CO₂ in 2100</span></div>
      <div class="drop" title="pH drop since 1850"><i style="width:${w}%"></i></div>
      <div><span class="badge">+${h.acidity_change_pct_2100.toFixed(0)}% acidity</span></div>
      <div class="row-val">pH <b>${h.pH_2100.toFixed(2)}</b></div>
      <div class="row-act"><a class="btn soft" href="explore.html?s=${s}&y=2100">Open</a></div>
    </div>`;
  }).join('');

  readColors();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });
  // Printing switches to the light palette, so the chart is redrawn for paper and again afterwards.
  window.matchMedia('print').addEventListener('change', () => { readColors(); draw(); });
  loadUrl(); sync();
  new ResizeObserver(size).observe(canvas);
  window.__scenarios = { state, setYear, sync, shareUrl };
})();
