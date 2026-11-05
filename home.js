// The overview page: key dates, the prediction card and the sensor calculator.
(function () {
  'use strict';
  const D = window.OCEAN_DATA, M = window.OceanModel, { PRESETS, YEAR0 } = window.OceanSite;
  const $ = (id) => document.getElementById(id);

  /* ================= OVERVIEW ================= */
  // Same rounding as the explorer readout, so the numbers agree.
  const vhRows = D.projections.very_high, at = (y) => vhRows[y - YEAR0].pH.toFixed(2);
  document.querySelectorAll('#keyDates [data-k]').forEach((b) => { b.textContent = at(+b.dataset.k.slice(3)); });
  $('guess').addEventListener('change', (e) => {
    const s = e.target.value, h = D.headline[s], out = $('guessAnswer');
    out.hidden = false;
    out.innerHTML = `On the <b>${PRESETS[s].label.toLowerCase()}</b> path, surface pH reaches <b>${h.pH_2100.toFixed(2)}</b> by 2100. The water would be ` +
      `<b>${h.acidity_change_pct_2100.toFixed(0)}%</b> more acidic than pre-industrial, and aragonite Ω would fall to <b>${h.omega_arag_2100.toFixed(2)}</b>. ` +
      `<a class="btn soft small" href="explore.html?s=${s}&y=2100">See it in the explorer</a>`;
  });

  // Highlight card: today vs 1850 on the observed record
  const today = D.projections.intermediate[2025 - YEAR0], first = D.projections.intermediate[0];
  $('hlAcid').textContent = '+' + today.acidity_change_pct.toFixed(0) + '%';
  $('hlCo2').textContent = Math.round(today.co2_ppm);
  $('hlDrop').textContent = (first.pH - today.pH).toFixed(2);
  $('miniBars').innerHTML = Object.keys(PRESETS).map((s) => {
    const h = D.headline[s];
    return `<div class="mini-row"><span>${PRESETS[s].label}</span><div class="drop"><i style="width:${((h.pH_1850 - h.pH_2100) / 0.55 * 100).toFixed(1)}%"></i></div><b>${h.pH_2100.toFixed(2)}</b></div>`;
  }).join('');

  /* ================= SENSOR DETECTION ================= */
  // Noise in mV is turned into pH through the default electrode slope, then the Python years_to_detect_trend logic runs.
  const TREND = -0.0017;
  function detect() {
    const mv = +$('sNoise').value, n = +$('sReads').value, noisePh = mv / 1000 / M.nernstSlope();
    const yrs = M.yearsToDetectTrend(noisePh, TREND, 2, n);
    $('oNoise').textContent = mv.toFixed(1) + ' mV';
    $('detectYears').textContent = yrs ? yrs + (yrs === 1 ? ' year' : ' years') : 'Over 500 years';
    $('detectText').textContent = `of readings before the ${TREND.toString().replace('-', '−')} pH/yr trend clears two standard errors (noise ≈ ${noisePh.toFixed(4)} pH, no drift).`;
  }
  $('sNoise').addEventListener('input', detect); $('sReads').addEventListener('change', detect);
  detect();
})();
