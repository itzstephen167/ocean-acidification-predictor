// The timeline page: scroll through milestone years; the sticky readout shows the model's state for the one in view.
(function () {
  'use strict';
  const D = window.OCEAN_DATA, { PRESETS, YEAR0, YEAR1 } = window.OceanSite;
  const $ = (id) => document.getElementById(id);
  const signed = (v, dec) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(dec);

  const YEARS = [1850, 1900, 1950, 1975, 2000, 2025, 2050, 2075, 2100];
  const LAST_OBS = 2025;
  const q = new URLSearchParams(location.search);
  const state = { scenario: PRESETS[q.get('s')] ? q.get('s') : 'intermediate', year: YEARS[0] };
  const rowAt = (y) => D.projections[state.scenario][y - YEAR0];

  /* ================= MILESTONE CARDS ================= */
  // Every sentence is built from the model's numbers, so nothing here is hand-written data.
  function blurb(y) {
    const r = rowAt(y), first = rowAt(YEAR0);
    if (y === YEAR0) return `The model's starting point: ${Math.round(r.co2_ppm)} ppm of CO₂, surface pH ${r.pH.toFixed(2)} and aragonite Ω ${r.omega_arag.toFixed(2)}.`;
    const prev = rowAt(YEARS[YEARS.indexOf(y) - 1]);
    return `CO₂ ${signed(r.co2_ppm - prev.co2_ppm, 0)} ppm and pH ${signed(r.pH - prev.pH, 3)} since ${YEARS[YEARS.indexOf(y) - 1]}. ` +
      `Since 1850, pH has moved ${signed(r.pH - first.pH, 2)} and Ω ${signed(r.omega_arag - first.omega_arag, 2)}.`;
  }
  function renderList() {
    $('tlList').innerHTML = YEARS.map((y) => {
      const proj = y > LAST_OBS;
      return `<li class="card tl-item" data-y="${y}"><div class="card-head"><h2>${y}</h2>` +
        `<span class="badge${proj ? ' purple' : ' teal'}">${proj ? 'Projected' : 'Observed CO₂'}</span></div>` +
        `<p class="card-sub">${blurb(y)}</p>` +
        `<a class="btn soft small" href="explore.html?s=${state.scenario}&y=${y}">Open ${y} in the explorer</a></li>`;
    }).join('');
    items = [...$('tlList').children];
    items.forEach((li) => spy.observe(li));
    show(state.year);
  }

  /* ================= READOUT ================= */
  function show(y) {
    state.year = y;
    const r = rowAt(y), first = rowAt(YEAR0);
    $('tlYear').textContent = y;
    $('tlPhase').textContent = y > LAST_OBS ? 'Projected' : 'Observed CO₂';
    $('tlPhase').className = 'badge ' + (y > LAST_OBS ? 'purple' : 'teal');
    $('tlFill').style.width = ((y - YEAR0) / (YEAR1 - YEAR0) * 100) + '%';
    $('tlCo2').textContent = Math.round(r.co2_ppm);
    $('tlPh').textContent = r.pH.toFixed(2);
    $('tlPhDelta').textContent = `${signed(r.pH - first.pH, 2)} since 1850`;
    $('tlOmega').textContent = r.omega_arag.toFixed(2);
    $('tlAcid').textContent = '+' + r.acidity_change_pct.toFixed(0) + '%';
    items.forEach((li) => li.classList.toggle('now', +li.dataset.y === y));
  }

  // The milestone crossing the middle of the screen drives the readout; focusing or clicking a card does too.
  let items = [];
  const spy = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) show(+e.target.dataset.y); }), { rootMargin: '-45% 0px -50% 0px' });
  $('tlList').addEventListener('focusin', (e) => { const li = e.target.closest('.tl-item'); if (li) show(+li.dataset.y); });
  $('tlList').addEventListener('click', (e) => { const li = e.target.closest('.tl-item'); if (li) show(+li.dataset.y); });

  /* ================= SCENARIO ================= */
  function pick(s) {
    state.scenario = s;
    document.querySelectorAll('#tlSeg button').forEach((b) => { const on = b.dataset.s === s; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    $('tlScn').textContent = `After 2025: ${D.meta.scenarios[s]}.`;
    history.replaceState(null, '', s === 'intermediate' ? location.pathname : '?s=' + s);
    renderList();
  }
  document.querySelectorAll('#tlSeg button').forEach((b) => b.addEventListener('click', () => pick(b.dataset.s)));

  pick(state.scenario);
  window.__timeline = { show, pick, state: () => ({ ...state }) };
})();
