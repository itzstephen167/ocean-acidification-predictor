// The chemistry page: pump CO₂ into seawater and show the carbonate system shifting.
(function () {
  'use strict';
  const D = window.OCEAN_DATA, M = window.OceanModel;
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const P = M.DEFAULTS, BASE_PPM = P.ref, MAX_PPM = 1400, PUMP = 50, STEP_MS = 650;
  const solve = (ppm) => M.oceanState(ppm, M.LAST_OBS_YEAR, P);
  const base = solve(BASE_PPM);
  const LEVELS = [
    ['Pre-industrial', BASE_PPM],
    ['Today', Math.round(D.projections.intermediate[M.LAST_OBS_YEAR - 1850].co2_ppm)],
    ['2100, very high', Math.round(D.projections.very_high[250].co2_ppm)],
  ];
  const signed = (v, dec) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(dec);

  /* ================= SPECIES BARS ================= */
  const SPECIES = [
    ['Dissolved CO₂', 'CO₂(aq)', 'co2aq', '#f2734f', 1],
    ['Bicarbonate', 'HCO₃⁻', 'hco3', '#13a89e', 2],
    ['Carbonate', 'CO₃²⁻ · builds shells', 'co3', '#e0a400', 2],
    ['Hydrogen ions', 'H⁺ · acidity', 'h', '#8d48e6', 3],
  ];
  $('species').innerHTML = SPECIES.map(([n, sub]) => `<div class="sp"><div class="nm">${n}<small>${sub}</small></div><div class="axis"><i></i></div><div class="val"></div></div>`).join('');
  function setBar(i, s) {
    const pct = s[SPECIES[i][2]] / base[SPECIES[i][2]] - 1, row = $('species').children[i], bar = row.querySelector('i');
    const f = Math.sign(pct) * Math.log1p(Math.abs(pct) * 10) / Math.log1p(25) * 50;
    bar.style.background = SPECIES[i][3]; bar.style.left = (f >= 0 ? 50 : 50 + f) + '%'; bar.style.width = Math.abs(clamp(f, -50, 50)) + '%';
    row.querySelector('.val').textContent = (pct >= 0 ? '+' : '−') + Math.abs(pct * 100).toFixed(pct > 0.1 ? 0 : 1) + '%';
  }

  /* ================= STATE ================= */
  let ppm = BASE_PPM, timers = [];
  const stepEls = [...document.querySelectorAll('#reactSteps li')];
  const reachStep = (n) => stepEls.forEach((li) => { const k = +li.dataset.step; li.classList.toggle('now', k === n); li.classList.toggle('done', k < n); });

  // What each stage changes: 1 dissolved CO₂, 2 carbonate and bicarbonate, 3 hydrogen ions, pH and Ω.
  function showStage(n, s, was) {
    if (n === 1) {
      setBar(0, s);
      $('chCo2').textContent = Math.round(ppm);
      $('stepCo2').textContent = `Dissolved CO₂ ${signed(s.co2aq - was.co2aq, 2)} µmol/kg with the air at ${Math.round(ppm)} ppm.`;
    } else if (n === 2) {
      setBar(1, s); setBar(2, s);
      $('chCo3').textContent = s.co3.toFixed(0);
      $('stepCo3').textContent = `Carbonate ${signed(s.co3 - was.co3, 1)} µmol/kg, bicarbonate ${signed(s.hco3 - was.hco3, 1)} µmol/kg.`;
    } else {
      setBar(3, s);
      $('chPh').textContent = s.pH.toFixed(2);
      $('chPhDelta').textContent = `${signed(s.pH - base.pH, 2)} since pre-industrial`;
      $('chOmega').textContent = s.omega.toFixed(2);
      $('stepH').textContent = `pH ${signed(s.pH - was.pH, 3)}, aragonite Ω ${signed(s.omega - was.omega, 2)}.`;
    }
  }
  function settle(s, was) { [1, 2, 3].forEach((n) => showStage(n, s, was)); reachStep(4); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  const TITLES = [['CO₂ dissolves', 'CO₂ leaves the water'], ['Carbonate is used up', 'Carbonate recovers'], ['Acidity rises', 'Acidity falls']];
  const setTitles = (falling) => stepEls.forEach((li, i) => { li.querySelector('b').textContent = TITLES[i][falling ? 1 : 0]; });

  function goTo(next, animate) {
    clearTimers();
    const was = solve(ppm);
    next = clamp(next, BASE_PPM, MAX_PPM);
    setTitles(next < ppm);
    ppm = next;
    const s = solve(ppm);
    $('co2Range').value = ppm;
    $('pumpBtn').disabled = ppm >= MAX_PPM;
    document.querySelectorAll('#co2Seg button').forEach((b) => b.classList.toggle('on', +b.dataset.ppm === ppm));
    if (!animate || reduced) return settle(s, was);
    showStage(1, s, was); reachStep(1);
    timers.push(setTimeout(() => { showStage(2, s, was); reachStep(2); }, STEP_MS));
    timers.push(setTimeout(() => { showStage(3, s, was); reachStep(3); }, STEP_MS * 2));
    timers.push(setTimeout(() => reachStep(4), STEP_MS * 3));
  }
  // A fresh start: full readout, with the step text back to its prompt.
  function reset() {
    goTo(BASE_PPM, false); reachStep(0); setTitles(false);
    $('stepCo2').textContent = 'Pump some in to begin.'; $('stepCo3').textContent = ''; $('stepH').textContent = '';
  }

  /* ================= CONTROLS ================= */
  $('co2Seg').innerHTML = LEVELS.map(([label, v]) => `<button data-ppm="${v}">${label}</button>`).join('');
  $('co2Seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) goTo(+b.dataset.ppm, true); });
  $('pumpBtn').addEventListener('click', () => goTo(ppm + PUMP, true));
  $('pumpReset').addEventListener('click', reset);
  const range = $('co2Range'); range.min = BASE_PPM; range.max = MAX_PPM;
  range.addEventListener('input', () => goTo(+range.value, false));

  reset();
  window.__chemistry = { goTo, reset, ppm: () => ppm };
})();
