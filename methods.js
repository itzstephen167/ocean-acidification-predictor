// The methods page: the sensor-detection calculator.
(function () {
  'use strict';
  const M = window.OceanModel;
  const $ = (id) => document.getElementById(id);

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
