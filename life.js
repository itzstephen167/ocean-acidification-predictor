// The marine life page: compare the model's aragonite Ω with the levels shell-builders are known to struggle below.
(function () {
  'use strict';
  const D = window.OCEAN_DATA, M = window.OceanModel, { PRESETS, YEAR0, YEAR1 } = window.OceanSite;
  const $ = (id) => document.getElementById(id);
  const SCALE = 5; // the Ω bar runs from 0 to 5
  const listOf = (xs) => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];

  // Same values as the explorer's region presets, so "Open in the explorer" shows the same Ω.
  const REGIONS = {
    open: { ta: 2300, temp: 18, note: 'The model default: a mid-latitude open-ocean surface.' },
    polar: { ta: 2280, temp: 1, note: 'Cold water holds more CO₂, so polar seas start lower and reach corrosive levels first.' },
    tropical: { ta: 2350, temp: 28, note: 'Warm, high-alkalinity water: the best-buffered surface, and home to most coral reefs.' },
  };

  // Rounded thresholds from the literature, highest first. These are the only hand-entered numbers on the page.
  const GROUPS = [
    { omega: 3, name: 'Warm-water coral reefs', tag: 'Reefs',
      text: 'Healthy reefs today are mostly found where Ω is above about 3. Below it, corals build skeleton more slowly and erosion can start to outpace reef growth.',
      cite: 'Kleypas et al. 1999; Hoegh-Guldberg et al. 2007' },
    { omega: 1.5, name: 'Sea butterflies and shellfish larvae', tag: 'Plankton',
      text: 'Pteropods (sea butterflies) show shell dissolution, and oyster and mussel larvae struggle to build their first shell, once Ω drops below about 1.5.',
      cite: 'Bednaršek et al. 2019; Waldbusser et al. 2015' },
    { omega: 1, name: 'Any unprotected aragonite shell', tag: 'Chemistry',
      text: 'Below 1 the water is corrosive to aragonite itself: bare shell and skeleton dissolve unless the animal spends energy to protect it.',
      cite: 'The definition of Ω (see the glossary)' },
  ];

  const hist = D.projections.low.filter((r) => r.phase === 'historical');
  const q = new URLSearchParams(location.search);
  const qy = parseInt(q.get('y'), 10);
  const state = {
    scenario: PRESETS[q.get('s')] ? q.get('s') : 'intermediate',
    region: REGIONS[q.get('r')] ? q.get('r') : 'open',
    year: qy >= YEAR0 && qy <= YEAR1 ? qy : 2025,
  };

  /* ---------- series ---------- */
  // The open ocean uses the published projections; other regions rerun the same model with their preset (central values only).
  const cache = new Map();
  function rows() {
    if (state.region === 'open') return D.projections[state.scenario];
    const key = state.scenario + '|' + state.region;
    if (!cache.has(key)) {
      const r = REGIONS[state.region];
      cache.set(key, M.project(hist, PRESETS[state.scenario].anchors, { ta: r.ta, temp: r.temp }, { nMc: 0 }));
    }
    return cache.get(key);
  }
  // The first year Ω is below the threshold (the paths only fall or level off, so it rarely climbs back).
  function firstBelow(series, omega) {
    const r = series.find((x) => x.omega_arag < omega);
    return r ? r.year : null;
  }

  /* ---------- render ---------- */
  function render() {
    const series = rows(), now = series[state.year - YEAR0].omega_arag;
    $('lifeYearLabel').textContent = state.year;
    $('lifeYearOut').textContent = state.year;
    $('lifeYear').value = state.year;
    $('lifeRegionNote').textContent = REGIONS[state.region].note + ` Ω here is ${now.toFixed(2)}.`;
    $('lifeFill').style.width = Math.min(now / SCALE, 1) * 100 + '%';

    const below = GROUPS.filter((g) => now < g.omega);
    $('lifeSummary').textContent = below.length
      ? `In ${state.year}, Ω ${now.toFixed(2)} is below the line for ${listOf(below.map((g) => g.name.toLowerCase()))}.`
      : `In ${state.year}, Ω ${now.toFixed(2)} is above every threshold on this page.`;

    $('lifeCards').innerHTML = GROUPS.map((g) => {
      const ok = now >= g.omega, cross = firstBelow(series, g.omega);
      const when = cross === null ? `Not crossed by ${YEAR1} on this path.`
        : cross === YEAR0 ? `Already below in ${YEAR0}, before industrial CO₂.`
        : `First drops below in ${cross}${cross > M.LAST_OBS_YEAR ? ' (projected)' : ''}.`;
      const link = `explore.html?s=${state.scenario}&y=${cross || state.year}` +
        (state.region === 'open' ? '' : `&ta=${REGIONS[state.region].ta}&t=${REGIONS[state.region].temp}`);
      return `<div class="card life-card"><div class="card-head"><h2>${g.name}</h2>` +
        `<span class="badge${ok ? ' teal' : ''}">${ok ? 'Above' : 'Below'} Ω ${g.omega}</span></div>` +
        `<p class="card-sub">${g.text}</p>` +
        `<p class="life-when">${when}</p>` +
        `<p class="note">Source: ${g.cite}. <a class="term" href="${link}">Open ${cross || state.year} in the explorer</a></p></div>`;
    }).join('');

    const p = new URLSearchParams();
    if (state.scenario !== 'intermediate') p.set('s', state.scenario);
    if (state.region !== 'open') p.set('r', state.region);
    if (state.year !== 2025) p.set('y', state.year);
    history.replaceState(null, '', p.toString() ? '?' + p : location.pathname);
  }

  $('lifeTicks').innerHTML = GROUPS.map((g) =>
    `<i class="life-tick" style="left:${g.omega / SCALE * 100}%"><span>Ω ${g.omega}</span></i>`).join('');

  /* ---------- controls ---------- */
  function seg(id, attr, key) {
    const btns = document.querySelectorAll(`#${id} button`);
    const sync = () => btns.forEach((b) => { const on = b.dataset[attr] === state[key]; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    btns.forEach((b) => b.addEventListener('click', () => { state[key] = b.dataset[attr]; sync(); render(); }));
    sync();
  }
  seg('lifeSeg', 's', 'scenario');
  seg('lifeRegion', 'r', 'region');
  $('lifeYear').addEventListener('input', (e) => { state.year = +e.target.value; render(); });

  render();
  window.__life = { render, rows, state: () => ({ ...state }) };
})();
