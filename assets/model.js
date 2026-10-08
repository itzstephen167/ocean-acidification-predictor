/* JavaScript port of ocean_ph_model.py (carbonate chemistry + projection).
   Same constants and equations as the Python model, so results match projections.json. */
(function (root) {
  const LAST_OBS_YEAR = 2025;
  const PREINDUSTRIAL_PPM = 278.0;
  const tk = (t) => t + 273.15;

  const k0 = (t, s) => { const T = tk(t); return Math.exp(-60.2409 + 93.4517 * (100 / T) + 23.3585 * Math.log(T / 100) + s * (0.023517 - 0.023656 * (T / 100) + 0.0047036 * (T / 100) ** 2)); };
  function k1k2(t, s) {
    const T = tk(t);
    const pk1 = 3633.86 / T - 61.2172 + 9.6777 * Math.log(T) - 0.011555 * s + 0.0001152 * s * s;
    const pk2 = 471.78 / T + 25.9290 - 3.16967 * Math.log(T) - 0.01781 * s + 0.0001122 * s * s;
    return [10 ** -pk1, 10 ** -pk2];
  }
  function kb(t, s) {
    const T = tk(t), sq = Math.sqrt(s);
    return Math.exp((-8966.90 - 2890.53 * sq - 77.942 * s + 1.728 * s * sq - 0.0996 * s * s) / T
      + (148.0248 + 137.1942 * sq + 1.62142 * s)
      + (-24.4344 - 25.085 * sq - 0.2474 * s) * Math.log(T)
      + 0.053105 * sq * T);
  }
  function kw(t, s) {
    const T = tk(t);
    return Math.exp(148.9802 - 13847.26 / T - 23.6521 * Math.log(T)
      + (-5.977 + 118.67 / T + 1.0495 * Math.log(T)) * Math.sqrt(s) - 0.01615 * s);
  }
  function kspArag(t, s) {
    const T = tk(t);
    return 10 ** (-171.945 - 0.077993 * T + 2903.293 / T + 71.595 * Math.log10(T)
      + (-0.068393 + 0.0017276 * T + 88.135 / T) * Math.sqrt(s)
      - 0.10018 * s + 0.0059415 * s ** 1.5);
  }
  const totalBoron = (s) => 0.0004326 * s / 35;
  const calcium = (s) => 0.02128 / 40.087 * (s / 1.80655);
  const vaporAtm = (t, s) => { const T = tk(t); return Math.exp(24.4543 - 67.4509 * (100 / T) - 4.8489 * Math.log(T / 100) - 0.000544 * s); };
  const xco2ToPco2 = (x, t, s) => x * (1 - vaporAtm(t, s));

  function solveCarbonate(taUmol, pco2Uatm, tempC, sal) {
    const ta = taUmol * 1e-6, p = pco2Uatm * 1e-6;
    const K0 = k0(tempC, sal), [K1, K2] = k1k2(tempC, sal), KB = kb(tempC, sal), KW = kw(tempC, sal), BT = totalBoron(sal);
    const co2 = K0 * p;
    let lo = -10, hi = -6;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi), h = 10 ** mid;
      const f = co2 * K1 / h + 2 * co2 * K1 * K2 / (h * h) + BT * KB / (KB + h) + KW / h - h - ta;
      if (f > 0) lo = mid; else hi = mid;
    }
    const logh = 0.5 * (lo + hi), h = 10 ** logh;
    const hco3 = co2 * K1 / h, co3 = co2 * K1 * K2 / (h * h);
    return {
      pH: -logh, h, co2aq: co2 * 1e6, hco3: hco3 * 1e6, co3: co3 * 1e6,
      dic: (co2 + hco3 + co3) * 1e6,
      omega: calcium(sal) * co3 / kspArag(tempC, sal),
    };
  }

  const DEFAULTS = { ta: 2300, temp: 18, sal: 35, eq: 0.891, ref: PREINDUSTRIAL_PPM, warming: 0 };

  function oceanState(xppm, year, p, over) {
    const o = Object.assign({}, p, over || {});
    const temp = o.temp + o.warming * Math.max(year - LAST_OBS_YEAR, 0) / 10;
    const xo = o.ref + o.eq * (xppm - o.ref);
    return solveCarbonate(o.ta, xToP(xo, temp, o.sal), temp, o.sal);
  }
  const xToP = xco2ToPco2;

  /* Monotone cubic (PCHIP, Fritsch-Carlson) – matches scipy's PchipInterpolator closely enough
     for smooth anchors. Returns a function. */
  function pchip(xs, ys) {
    const n = xs.length, h = [], d = [];
    for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
    const m = new Array(n).fill(0);
    if (n === 2) { m[0] = m[1] = d[0]; }
    else {
      for (let i = 1; i < n - 1; i++) {
        if (d[i - 1] * d[i] > 0) {
          const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
          m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
        }
      }
      const end = (h0, h1, d0, d1) => {
        let v = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
        if (Math.sign(v) !== Math.sign(d0)) v = 0;
        else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(v) > 3 * Math.abs(d0)) v = 3 * d0;
        return v;
      };
      m[0] = end(h[0], h[1], d[0], d[1]);
      m[n - 1] = end(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
    }
    return (x) => {
      let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
      const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
        + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
    };
  }

  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(rng) { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function percentile(sorted, q) { const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }

  /* history: array of {year, co2_ppm} up to LAST_OBS_YEAR.
     anchors: {2050: ppm, 2100: ppm}. Returns rows like projections.json. */
  function project(history, anchors, params, opts) {
    const p = Object.assign({}, DEFAULTS, params || {});
    const o = Object.assign({ nMc: 200, seed: 42, taSd: 40, tempSd: 1.5, eqSd: 0.05, end: 2100 }, opts || {});
    const last = history[history.length - 1];
    const ks = Object.keys(anchors).map(Number).sort((a, b) => a - b);
    const f = pchip([LAST_OBS_YEAR, ...ks], [last.co2_ppm, ...ks.map((k) => anchors[k])]);
    const series = history.map((r) => ({ year: r.year, co2_ppm: r.co2_ppm, phase: 'historical' }));
    for (let y = LAST_OBS_YEAR + 1; y <= o.end; y++) series.push({ year: y, co2_ppm: f(y), phase: 'projection' });

    const pre = oceanState(p.ref, LAST_OBS_YEAR, p);
    const rng = mulberry32(o.seed);
    const ens = [];
    for (let m = 0; m < o.nMc; m++) {
      ens.push({
        ta: p.ta + o.taSd * gauss(rng), temp: p.temp + o.tempSd * gauss(rng),
        eq: Math.min(1, Math.max(0.5, p.eq + o.eqSd * gauss(rng))),
      });
    }
    return series.map((r) => {
      const c = oceanState(r.co2_ppm, r.year, p);
      const phs = [], oms = [];
      for (const e of ens) { const s = oceanState(r.co2_ppm, r.year, p, e); phs.push(s.pH); oms.push(s.omega); }
      phs.sort((a, b) => a - b); oms.sort((a, b) => a - b);
      return {
        year: r.year, phase: r.phase, co2_ppm: r.co2_ppm, pH: c.pH,
        pH_lo: phs.length ? percentile(phs, 0.05) : c.pH, pH_hi: phs.length ? percentile(phs, 0.95) : c.pH,
        acidity_change_pct: 100 * (c.h / pre.h - 1),
        omega_arag: c.omega,
        omega_arag_lo: oms.length ? percentile(oms, 0.05) : c.omega, omega_arag_hi: oms.length ? percentile(oms, 0.95) : c.omega,
        dic_umol_kg: c.dic, co3_umol_kg: c.co3,
      };
    });
  }

  const api = { DEFAULTS, LAST_OBS_YEAR, PREINDUSTRIAL_PPM, solveCarbonate, oceanState, project, pchip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OceanModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
