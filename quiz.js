// The quiz page: guess the model's pH or aragonite Ω for a year and scenario, then the model computes the answer live.
(function () {
  'use strict';
  const D = window.OCEAN_DATA, M = window.OceanModel, { PRESETS, YEAR0 } = window.OceanSite;
  const $ = (id) => document.getElementById(id);

  const YEARS = [1900, 1950, 1975, 2000, 2025, 2050, 2075, 2100];
  const SCENARIOS = Object.keys(PRESETS);
  // What can be asked: slider range, decimals and the error bands worth 3, 2 and 1 points.
  const KINDS = {
    pH: { name: 'pH', min: 7.6, max: 8.3, step: 0.01, start: 7.95, dec: 2, bands: [0.02, 0.05, 0.1], pick: (r) => r.pH },
    omega: { name: 'aragonite saturation (Ω)', min: 1, max: 4, step: 0.05, start: 2.5, dec: 2, bands: [0.15, 0.35, 0.7], pick: (r) => r.omega },
  };
  const state = { round: 0, score: 0, q: null, locked: false };
  const rowAt = (s, y) => D.projections[s][y - YEAR0];
  const rand = (a) => a[Math.floor(Math.random() * a.length)];

  /* ================= QUESTION ================= */
  function ask() {
    let q;
    do q = { scenario: rand(SCENARIOS), year: rand(YEARS), kind: rand(Object.keys(KINDS)) };
    while (state.q && q.scenario === state.q.scenario && q.year === state.q.year && q.kind === state.q.kind);
    // Before 2025 every scenario shares the CO₂ record, so name it as observed rather than a scenario.
    if (q.year <= M.LAST_OBS_YEAR) q.scenario = 'intermediate';
    state.q = q; state.locked = false;
    const k = KINDS[q.kind], co2 = rowAt(q.scenario, q.year).co2_ppm, base = rowAt(q.scenario, YEAR0);
    const past = q.year <= M.LAST_OBS_YEAR;

    $('qzTitle').textContent = 'Question ' + (state.round + 1);
    $('qzScn').textContent = past ? 'Observed CO₂' : PRESETS[q.scenario].label;
    $('qzScn').className = 'badge ' + (past ? 'teal' : 'purple');
    $('qzQuestion').textContent = `In ${q.year}${past ? '' : ' on the ' + PRESETS[q.scenario].label.toLowerCase() + ' path'}, the air holds ${Math.round(co2)} ppm of CO₂. ` +
      `What ${k.name} does the model give at the sea surface?`;
    $('qzHint').textContent = `For reference, in 1850 (${Math.round(base.co2_ppm)} ppm) the model gives pH ${base.pH.toFixed(2)} and Ω ${base.omega_arag.toFixed(2)}.`;
    const g = $('qzGuess');
    Object.assign(g, { min: k.min, max: k.max, step: k.step, value: k.start });
    g.setAttribute('aria-label', 'Your guess for ' + k.name);
    showGuess();

    $('qzVerdict').textContent = 'Waiting'; $('qzVerdict').className = 'badge';
    $('qzIntro').textContent = 'Lock in a guess to run the model.';
    document.querySelectorAll('#qzSteps li').forEach((li) => { li.classList.remove('now', 'done'); li.querySelector('span').textContent = ''; });
    ['qzYou', 'qzModel', 'qzOff', 'qzPts'].forEach((id) => { $(id).textContent = '–'; });
    $('qzExplore').href = `explore.html?s=${q.scenario}&y=${q.year}`;
    $('qzCheck').disabled = false; $('qzNext').disabled = true; g.disabled = false;
  }
  const showGuess = () => { $('qzGuessOut').textContent = (+$('qzGuess').value).toFixed(KINDS[state.q.kind].dec); };

  /* ================= ANSWER ================= */
  // Runs the carbonate solver now (not a lookup), then reveals the three steps one after another.
  function check() {
    if (state.locked) return null;
    state.locked = true;
    const q = state.q, k = KINDS[q.kind], p = M.DEFAULTS;
    const co2 = rowAt(q.scenario, q.year).co2_ppm;
    const sea = p.ref + p.eq * (co2 - p.ref);
    const res = M.oceanState(co2, q.year, p);
    const answer = k.pick(res), guess = +$('qzGuess').value, off = Math.abs(guess - answer);
    const pts = k.bands.filter((b) => off <= b).length;
    state.round++; state.score += pts;

    const steps = [
      `${Math.round(co2)} ppm in the air brings the surface water to about ${Math.round(sea)} ppm (it lags the air slightly).`,
      `Solving for alkalinity ${p.ta} µmol/kg at ${p.temp} °C: carbonate ion ${res.co3.toFixed(0)} µmol/kg.`,
      `Surface ${k.name} = ${answer.toFixed(k.dec + 1)}.`,
    ];
    const lis = [...document.querySelectorAll('#qzSteps li')];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('qzCheck').disabled = true; $('qzGuess').disabled = true;
    $('qzIntro').textContent = 'Computing in your browser…';
    lis.forEach((li, i) => setTimeout(() => {
      lis.forEach((o, j) => { o.classList.toggle('now', j === i); o.classList.toggle('done', j < i); });
      li.querySelector('span').textContent = steps[i];
      if (i === lis.length - 1) reveal();
    }, reduce ? 0 : i * 450));

    function reveal() {
      $('qzYou').textContent = guess.toFixed(k.dec);
      $('qzModel').textContent = answer.toFixed(k.dec);
      $('qzOff').textContent = off.toFixed(k.dec);
      $('qzPts').textContent = pts;
      $('qzVerdict').textContent = ['Way off', 'Ballpark', 'Near', 'Spot on'][pts];
      $('qzVerdict').className = 'badge' + (pts >= 2 ? ' teal' : '');
      $('qzIntro').textContent = `The model's answer for ${q.year}, with the same settings the explorer uses.`;
      $('qzScore').textContent = state.score;
      $('qzOf').textContent = `from ${state.round} round${state.round === 1 ? '' : 's'}`;
      $('qzNext').disabled = false; $('qzNext').focus();
    }
    return { answer, guess, off, pts };
  }

  $('qzGuess').addEventListener('input', showGuess);
  $('qzCheck').addEventListener('click', check);
  $('qzNext').addEventListener('click', ask);

  ask();
  window.__quiz = { ask, check, state: () => ({ ...state }) };
})();
