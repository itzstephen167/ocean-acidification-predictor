"""
ocean_ph_model.py
=================
Predict surface-ocean pH and aragonite saturation under rising atmospheric CO2.

Design (so it can sit behind a website/API):
  * Physics first: a full seawater carbonate-system solver (CO2 + bicarbonate + carbonate
    + borate + water alkalinity) instead of a single Henderson-Hasselbalch ratio.
  * Pure functions + small dataclasses, no global state, no plotting, no file I/O at import.
  * Every public function returns pandas / numpy / plain dicts, so results serialise to JSON.

Public API (most useful first)
------------------------------
    project(scenario, params, ...)      -> DataFrame: year, co2_ppm, pH, pH_lo, pH_hi, omega_arag, ...
    projection_to_records(df)           -> list[dict] ready for jsonify()
    headline_stats(df)                  -> dict of key numbers for UI cards
    solve_carbonate(ta, pco2, T, S)     -> dict of arrays (pH, DIC, HCO3, CO3, omega_arag, ...)
    load_observations(path)             -> DataFrame(year, [co2_ppm], ph)
    check_observations(obs, params)     -> list of data-quality warnings
    validate(obs, params, split_year)   -> DataFrame of hold-out errors for several models
    SensorParams / calibrate_sensor / measure / years_to_detect_trend  (sensor simulation)

Units: CO2 in ppm (mole fraction, dry air), alkalinity/DIC in umol/kg, temperature in deg C,
pH on the TOTAL scale.

Known simplifications (see README): global-mean surface box, constant alkalinity and salinity,
sulfate/fluoride/phosphate/silicate alkalinity terms neglected, scenario CO2 paths are
illustrative approximations of SSP-like pathways.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Iterable

import numpy as np
import pandas as pd
from scipy.interpolate import PchipInterpolator
from scipy.optimize import brentq, minimize_scalar

__all__ = [
    "OceanParams", "Uncertainty", "SensorParams", "SensorCalibration", "SCENARIOS",
    "solve_carbonate", "revelle_factor", "co2_history", "co2_path", "load_noaa_co2_annual",
    "load_scenario_csv", "ocean_state", "project", "projection_to_records", "headline_stats",
    "calibrate_equilibration", "load_observations", "check_observations", "validate",
    "calibrate_sensor", "measure", "years_to_detect_trend", "LAST_OBS_YEAR",
]

LAST_OBS_YEAR = 2025          # last year of the historical CO2 record; scenarios start after it
PREINDUSTRIAL_PPM = 278.0     # atmospheric CO2 around 1750

# --------------------------------------------------------------------------------------
# 1. Seawater carbonate chemistry
# --------------------------------------------------------------------------------------

def _tk(t_c):
    return np.asarray(t_c, dtype=float) + 273.15


def k0_weiss(t_c, s):
    """CO2 solubility, mol/(kg*atm)  (Weiss 1974)."""
    t = _tk(t_c)
    return np.exp(-60.2409 + 93.4517 * (100 / t) + 23.3585 * np.log(t / 100)
                  + s * (0.023517 - 0.023656 * (t / 100) + 0.0047036 * (t / 100) ** 2))


def k1_k2_lueker(t_c, s):
    """First and second dissociation constants of carbonic acid, total scale (Lueker et al. 2000)."""
    t = _tk(t_c)
    pk1 = 3633.86 / t - 61.2172 + 9.6777 * np.log(t) - 0.011555 * s + 0.0001152 * s ** 2
    pk2 = 471.78 / t + 25.9290 - 3.16967 * np.log(t) - 0.01781 * s + 0.0001122 * s ** 2
    return 10.0 ** (-pk1), 10.0 ** (-pk2)


def kb_dickson(t_c, s):
    """Boric acid dissociation constant, total scale (Dickson 1990)."""
    t = _tk(t_c)
    sq = np.sqrt(s)
    ln_kb = ((-8966.90 - 2890.53 * sq - 77.942 * s + 1.728 * s * sq - 0.0996 * s ** 2) / t
             + (148.0248 + 137.1942 * sq + 1.62142 * s)
             + (-24.4344 - 25.085 * sq - 0.2474 * s) * np.log(t)
             + 0.053105 * sq * t)
    return np.exp(ln_kb)


def kw_millero(t_c, s):
    """Ion product of water (Millero 1995)."""
    t = _tk(t_c)
    ln_kw = (148.9802 - 13847.26 / t - 23.6521 * np.log(t)
             + (-5.977 + 118.67 / t + 1.0495 * np.log(t)) * np.sqrt(s) - 0.01615 * s)
    return np.exp(ln_kw)


def ksp_aragonite(t_c, s):
    """Aragonite solubility product at the surface, mol^2/kg^2 (Mucci 1983)."""
    t = _tk(t_c)
    log_ksp = (-171.945 - 0.077993 * t + 2903.293 / t + 71.595 * np.log10(t)
               + (-0.068393 + 0.0017276 * t + 88.135 / t) * np.sqrt(s)
               - 0.10018 * s + 0.0059415 * s ** 1.5)
    return 10.0 ** log_ksp


def total_boron(s):
    """Total dissolved boron, mol/kg (Lee et al. 2010)."""
    return 0.0004326 * np.asarray(s, dtype=float) / 35.0


def calcium(s):
    """Calcium concentration, mol/kg (Riley & Tongudai 1967)."""
    return 0.02128 / 40.087 * (np.asarray(s, dtype=float) / 1.80655)


def vapor_pressure_atm(t_c, s):
    """Water vapour pressure over seawater, atm (Weiss & Price 1980)."""
    t = _tk(t_c)
    return np.exp(24.4543 - 67.4509 * (100 / t) - 4.8489 * np.log(t / 100) - 0.000544 * s)


def xco2_to_pco2(xco2_ppm, t_c, s, p_atm=1.0):
    """Dry-air mole fraction (ppm) -> partial pressure (uatm) in water-saturated air at 1 atm."""
    return np.asarray(xco2_ppm, dtype=float) * (p_atm - vapor_pressure_atm(t_c, s))


def solve_carbonate(ta_umol_kg, pco2_uatm, temp_c=18.0, salinity=35.0):
    """Seawater carbonate system from total alkalinity and pCO2 (all inputs broadcast).

    Solves   TA = [HCO3-] + 2[CO3--] + [B(OH)4-] + [OH-] - [H+]   for [H+], with
    [CO2*] = K0*pCO2, [HCO3-] = K1[CO2*]/[H+], [CO3--] = K1K2[CO2*]/[H+]^2.
    Vectorised bisection on log10[H+] (robust, no iteration failures).
    """
    ta, p, t, s = np.broadcast_arrays(*[np.asarray(x, dtype=float)
                                        for x in (ta_umol_kg, pco2_uatm, temp_c, salinity)])
    ta = ta * 1e-6
    p = p * 1e-6
    k0 = k0_weiss(t, s)
    k1, k2 = k1_k2_lueker(t, s)
    kb = kb_dickson(t, s)
    kw = kw_millero(t, s)
    bt = total_boron(s)
    co2 = k0 * p

    def ta_calc(h):
        return co2 * k1 / h + 2 * co2 * k1 * k2 / h ** 2 + bt * kb / (kb + h) + kw / h - h

    lo = np.full(ta.shape, -10.0)   # log10[H+]  (pH 10)
    hi = np.full(ta.shape, -6.0)    # pH 6
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        f = ta_calc(10.0 ** mid) - ta          # decreasing in [H+]
        lo = np.where(f > 0, mid, lo)
        hi = np.where(f > 0, hi, mid)
    logh = 0.5 * (lo + hi)
    h = 10.0 ** logh
    hco3 = co2 * k1 / h
    co3 = co2 * k1 * k2 / h ** 2
    return {
        "pH": -logh,
        "h_mol_kg": h,
        "co2aq_umol_kg": co2 * 1e6,
        "hco3_umol_kg": hco3 * 1e6,
        "co3_umol_kg": co3 * 1e6,
        "dic_umol_kg": (co2 + hco3 + co3) * 1e6,
        "omega_arag": calcium(s) * co3 / ksp_aragonite(t, s),
    }


def revelle_factor(ta_umol_kg=2300.0, pco2_uatm=400.0, temp_c=18.0, salinity=35.0, eps=1e-3):
    """Buffer (Revelle) factor = (dpCO2/pCO2) / (dDIC/DIC) at constant alkalinity."""
    a = solve_carbonate(ta_umol_kg, pco2_uatm, temp_c, salinity)
    b = solve_carbonate(ta_umol_kg, np.asarray(pco2_uatm) * (1 + eps), temp_c, salinity)
    return eps / ((b["dic_umol_kg"] - a["dic_umol_kg"]) / a["dic_umol_kg"])


# --------------------------------------------------------------------------------------
# 2. Parameters
# --------------------------------------------------------------------------------------

@dataclass
class OceanParams:
    """Global-mean surface-ocean box. Defaults are typical round values, not a fit to any dataset
    (except `equilibration`, which is calibrated to the observed 1985-2022 trend, see below)."""
    ta_umol_kg: float = 2300.0          # total alkalinity
    temp_c: float = 18.0                # sea-surface temperature
    salinity: float = 35.0
    equilibration: float = 0.891         # fraction of the atmospheric CO2 rise seen by surface water
    pco2_ref_ppm: float = PREINDUSTRIAL_PPM
    warming_c_per_decade: float = 0.0   # optional SST warming applied after LAST_OBS_YEAR

    def to_dict(self):
        return asdict(self)


@dataclass
class Uncertainty:
    """1-sigma parameter uncertainties used for the Monte-Carlo band. These are *assumptions*
    chosen to span plausible global-mean values, not statistically estimated errors."""
    ta_sd: float = 40.0
    temp_sd: float = 1.5
    equilibration_sd: float = 0.05


# --------------------------------------------------------------------------------------
# 3. Atmospheric CO2: history and scenarios
# --------------------------------------------------------------------------------------

# Approximate annual-mean CO2 (ppm). 1960-2023 follow the NOAA Mauna Loa annual means to within
# ~0.5 ppm (rounded); 1850-1950 are ice-core based, +/- ~2 ppm; 2024-2025 are estimates.
# REPLACE with the official NOAA file via load_noaa_co2_annual() for publication-grade numbers.
_CO2_ANCHORS = {
    1850: 285.0, 1900: 296.5, 1925: 304.0, 1950: 311.0, 1960: 316.9, 1965: 320.0, 1970: 325.7,
    1975: 331.1, 1980: 338.8, 1985: 346.1, 1990: 354.4, 1995: 360.8, 2000: 369.7, 2005: 379.8,
    2010: 389.9, 2015: 400.8, 2020: 414.2, 2021: 416.4, 2022: 418.5, 2023: 421.1,
    2024: 424.5, 2025: 426.6,
}

# Illustrative future CO2 pathways (ppm). Rounded and *SSP-like*, not the official concentration files.
SCENARIOS = {
    "low": {"label": "Low emissions (peaks then declines; SSP1-2.6-like)",
            "anchors": {2050: 444.0, 2075: 442.0, 2100: 432.0}},
    "intermediate": {"label": "Intermediate (SSP2-4.5-like)",
                     "anchors": {2050: 485.0, 2075: 535.0, 2100: 600.0}},
    "high": {"label": "High (SSP3-7.0-like)",
             "anchors": {2050: 510.0, 2075: 650.0, 2100: 850.0}},
    "very_high": {"label": "Very high (SSP5-8.5-like)",
                  "anchors": {2050: 545.0, 2075: 760.0, 2100: 1100.0}},
}

_history_cache: pd.Series | None = None
_history_override: pd.Series | None = None


def load_noaa_co2_annual(path) -> pd.Series:
    """Read NOAA GML's Mauna Loa annual-mean file (co2_annmean_mlo.csv, '#' comment header,
    columns year, mean, unc) and use it as the historical CO2 record from now on.
    Years before the file starts keep the built-in approximations."""
    global _history_override
    df = pd.read_csv(path, comment="#")
    df.columns = [c.strip().lower() for c in df.columns]
    if "year" not in df or "mean" not in df:
        raise ValueError("Expected columns 'year' and 'mean' in the NOAA annual-mean file.")
    _history_override = pd.Series(df["mean"].values, index=df["year"].astype(int).values, name="co2_ppm")
    return _history_override


def co2_history(start: int = 1850, end: int = LAST_OBS_YEAR) -> pd.Series:
    """Annual-mean atmospheric CO2 (ppm), index = year."""
    global _history_cache
    if _history_cache is None:
        yrs = np.array(sorted(_CO2_ANCHORS))
        vals = np.array([_CO2_ANCHORS[y] for y in yrs])
        full = np.arange(yrs[0], LAST_OBS_YEAR + 1)
        _history_cache = pd.Series(PchipInterpolator(yrs, vals)(full), index=full, name="co2_ppm")
    hist = _history_cache.copy()
    if _history_override is not None:
        idx = _history_override.index.intersection(hist.index)
        hist.loc[idx] = _history_override.loc[idx].values
    return hist.loc[start:end]


def load_scenario_csv(path) -> pd.Series:
    """Load an official concentration pathway (e.g. an SSP) from a CSV with columns year, co2_ppm.
    Pass the returned Series as `scenario=` to project()."""
    df = pd.read_csv(path, comment="#")
    df.columns = [c.strip().lower() for c in df.columns]
    return pd.Series(df["co2_ppm"].values, index=df["year"].astype(int).values, name="co2_ppm")


def _future_co2(scenario, years: np.ndarray) -> np.ndarray:
    if isinstance(scenario, str):
        if scenario not in SCENARIOS:
            raise KeyError(f"Unknown scenario '{scenario}'. Options: {list(SCENARIOS)}")
        scenario = SCENARIOS[scenario]["anchors"]
    if isinstance(scenario, dict):
        xs = [LAST_OBS_YEAR] + sorted(scenario)
        ys = [float(co2_history().iloc[-1])] + [float(scenario[k]) for k in sorted(scenario)]
        return PchipInterpolator(xs, ys)(years)
    s = pd.Series(scenario).sort_index()
    return np.interp(years, s.index.values, s.values)


def co2_path(scenario="intermediate", start: int = 1850, end: int = 2100) -> pd.DataFrame:
    """Historical record followed by a scenario. Columns: year, co2_ppm, phase."""
    hist = co2_history(start, min(end, LAST_OBS_YEAR))
    out = [pd.DataFrame({"year": hist.index, "co2_ppm": hist.values, "phase": "historical"})]
    if end > LAST_OBS_YEAR:
        fy = np.arange(max(start, LAST_OBS_YEAR + 1), end + 1)
        out.append(pd.DataFrame({"year": fy, "co2_ppm": _future_co2(scenario, fy), "phase": "projection"}))
    return pd.concat(out, ignore_index=True)


# --------------------------------------------------------------------------------------
# 4. Forward model: CO2 -> pH
# --------------------------------------------------------------------------------------

def ocean_state(xco2_ppm, years, params: OceanParams | None = None, ta=None, temp_c=None, equilibration=None):
    """Carbonate state of surface water for an atmospheric CO2 series.

    Surface-water CO2 follows the atmosphere with an 'equilibration' factor k:
        x_ocean = x_ref + k * (x_atm - x_ref)
    (k<1 because the surface ocean lags the atmosphere). ta / temp_c / equilibration may be arrays
    of shape (m, 1) to run an ensemble; the result then has shape (m, n_years).
    """
    p = params or OceanParams()
    ta = p.ta_umol_kg if ta is None else ta
    temp_c = p.temp_c if temp_c is None else temp_c
    k = p.equilibration if equilibration is None else equilibration
    years = np.asarray(years, dtype=float)
    x = np.asarray(xco2_ppm, dtype=float)
    temp = temp_c + p.warming_c_per_decade * np.clip(years - LAST_OBS_YEAR, 0, None) / 10.0
    x_ocean = p.pco2_ref_ppm + k * (x - p.pco2_ref_ppm)
    pco2 = xco2_to_pco2(x_ocean, temp, p.salinity)
    return solve_carbonate(ta, pco2, temp, p.salinity)


def calibrate_equilibration(target_trend_per_yr=-0.0017, y0=1985, y1=2022, params: OceanParams | None = None):
    """Find the equilibration factor k that reproduces an observed global pH trend.
    Default target: Copernicus Marine global surface pH trend 1985-2022 (-0.017 +/- 0.002 per decade)."""
    p = params or OceanParams()
    hist = co2_history(y0, y1)

    def trend(k):
        st = ocean_state(hist.values, hist.index.values, p, equilibration=k)
        return np.polyfit(hist.index.values, st["pH"], 1)[0] - target_trend_per_yr

    return float(brentq(trend, 0.3, 1.2))


def project(scenario="intermediate", params: OceanParams | None = None, uncertainty: Uncertainty | None = None,
            start: int = 1850, end: int = 2100, n_mc: int = 500, seed: int = 42) -> pd.DataFrame:
    """Historical reconstruction + projection with a parameter-uncertainty band.

    Columns: year, phase, co2_ppm, pH (central), pH_lo / pH_hi (5th / 95th percentile),
    acidity_change_pct (change in [H+] vs pre-industrial), omega_arag (+_lo/_hi),
    dic_umol_kg, co3_umol_kg.
    The band reflects *parameter* uncertainty (alkalinity, temperature, equilibration), not
    year-to-year variability and not scenario choice.
    """
    p = params or OceanParams()
    u = uncertainty or Uncertainty()
    path = co2_path(scenario, start, end)
    years = path["year"].values
    x = path["co2_ppm"].values

    central = ocean_state(x, years, p)
    pre = ocean_state(np.array([p.pco2_ref_ppm]), np.array([LAST_OBS_YEAR]), p)  # equilibrated pre-industrial reference

    out = path.copy()
    out["pH"] = central["pH"]
    out["acidity_change_pct"] = 100.0 * (central["h_mol_kg"] / pre["h_mol_kg"] - 1.0)
    out["omega_arag"] = central["omega_arag"]
    out["dic_umol_kg"] = central["dic_umol_kg"]
    out["co3_umol_kg"] = central["co3_umol_kg"]

    if n_mc and n_mc > 1:
        rng = np.random.default_rng(seed)
        ta = rng.normal(p.ta_umol_kg, u.ta_sd, (n_mc, 1))
        tc = rng.normal(p.temp_c, u.temp_sd, (n_mc, 1))
        k = np.clip(rng.normal(p.equilibration, u.equilibration_sd, (n_mc, 1)), 0.5, 1.0)
        ens = ocean_state(x, years, p, ta=ta, temp_c=tc, equilibration=k)
        out["pH_lo"], out["pH_hi"] = np.percentile(ens["pH"], [5, 95], axis=0)
        out["omega_arag_lo"], out["omega_arag_hi"] = np.percentile(ens["omega_arag"], [5, 95], axis=0)
    else:
        out["pH_lo"] = out["pH_hi"] = out["pH"]
        out["omega_arag_lo"] = out["omega_arag_hi"] = out["omega_arag"]
    return out[["year", "phase", "co2_ppm", "pH", "pH_lo", "pH_hi", "acidity_change_pct",
                "omega_arag", "omega_arag_lo", "omega_arag_hi", "dic_umol_kg", "co3_umol_kg"]]


def projection_to_records(df: pd.DataFrame, decimals: int = 4) -> list:
    """JSON-ready list of dicts (plain Python types)."""
    return df.round(decimals).to_dict(orient="records")


def headline_stats(df: pd.DataFrame) -> dict:
    """Key numbers for UI cards."""
    d = df.set_index("year")
    last_hist = d[d["phase"] == "historical"].index.max()
    end = d.index.max()
    return {
        "pH_1850": round(float(d.loc[d.index.min(), "pH"]), 3),
        f"pH_{last_hist}": round(float(d.loc[last_hist, "pH"]), 3),
        f"pH_{end}": round(float(d.loc[end, "pH"]), 3),
        "pH_change_1850_to_now": round(float(d.loc[last_hist, "pH"] - d.loc[d.index.min(), "pH"]), 3),
        f"pH_change_now_to_{end}": round(float(d.loc[end, "pH"] - d.loc[last_hist, "pH"]), 3),
        f"acidity_change_pct_{end}": round(float(d.loc[end, "acidity_change_pct"]), 1),
        f"omega_arag_{last_hist}": round(float(d.loc[last_hist, "omega_arag"]), 2),
        f"omega_arag_{end}": round(float(d.loc[end, "omega_arag"]), 2),
        f"co2_ppm_{end}": round(float(d.loc[end, "co2_ppm"]), 1),
    }


# --------------------------------------------------------------------------------------
# 5. Observations: loading, quality checks, hold-out validation
# --------------------------------------------------------------------------------------

_YEAR_NAMES = {"year", "yr", "date"}
_CO2_NAMES = {"co2_ppm", "co2", "co2_atm_ppm", "xco2", "mean"}
_PH_NAMES = {"ph", "ocean_ph", "ph_total", "surface_ph", "sea_surface_ph"}


def load_observations(path) -> pd.DataFrame:
    """Read a CSV with year, pH and (optionally) CO2 columns. Columns are matched by exact
    (case-insensitive) names, never by substring, so 'ph' inside another word cannot match."""
    raw = pd.read_csv(path, comment="#")
    cols = {c.strip().lower(): c for c in raw.columns}

    def pick(names, required):
        for n in names:
            if n in cols:
                return cols[n]
        if required:
            raise ValueError(f"No column named any of {sorted(names)}; found {list(raw.columns)}")
        return None

    ycol, pcol, ccol = pick(_YEAR_NAMES, True), pick(_PH_NAMES, True), pick(_CO2_NAMES, False)
    out = pd.DataFrame({"year": raw[ycol].astype(int), "ph": raw[pcol].astype(float)})
    if ccol is not None:
        out["co2_ppm"] = raw[ccol].astype(float)
    return out.sort_values("year").reset_index(drop=True)


def check_observations(obs: pd.DataFrame, params: OceanParams | None = None) -> list:
    """Sanity-check an observed series against the reference CO2 record and carbonate chemistry.
    Returns a list of {'level': 'error'|'warning'|'info', 'message': str}."""
    p = params or OceanParams()
    msgs = []

    def add(level, text):
        msgs.append({"level": level, "message": text})

    if obs["ph"].min() < 7.6 or obs["ph"].max() > 8.4:
        add("error", f"pH values {obs['ph'].min():.2f}-{obs['ph'].max():.2f} fall outside the plausible "
                     "7.6-8.4 range for open-ocean surface water.")

    if "co2_ppm" in obs:
        ref = co2_history()
        s = obs.set_index("year")["co2_ppm"]
        common = s.index.intersection(ref.index)
        bias = float((s.loc[common] - ref.loc[common]).mean())
        mad = float((s.loc[common] - ref.loc[common]).abs().mean())
        if mad > 3.0:
            add("warning", f"CO2 differs from the reference Mauna Loa record by {mad:.1f} ppm on average "
                           f"(bias {bias:+.1f} ppm; 2025: {s.iloc[-1]:.1f} vs ~{ref.iloc[-1]:.1f} ppm).")
        drops = int((s.diff() < -0.5).sum())
        if drops:
            add("warning", f"Annual-mean CO2 falls by more than 0.5 ppm in {drops} year(s); the Mauna Loa annual "
                           "mean rises in essentially every year, so this looks like noise or synthetic data.")

    yrs = obs["year"].values
    slope = float(np.polyfit(yrs, obs["ph"].values, 1)[0])
    add("info", f"Observed pH trend: {slope:+.5f} per year over {yrs.min()}-{yrs.max()} "
                f"(global surface-ocean trend since 1985 is about -0.0017 per year).")

    co2 = obs["co2_ppm"].values if "co2_ppm" in obs else co2_history().reindex(obs["year"]).values
    sens_obs = float(np.polyfit(np.log10(co2), obs["ph"].values, 1)[0])
    mod = ocean_state(co2, obs["year"].values, p)["pH"]
    sens_mod = float(np.polyfit(np.log10(co2), mod, 1)[0])
    ratio = sens_obs / sens_mod
    if not 0.7 <= ratio <= 1.3:
        add("warning", f"The series' pH response to CO2 ({sens_obs:.2f} per log10 unit) is {ratio:.0%} of what "
                       f"carbonate chemistry predicts here ({sens_mod:.2f}). For a global-mean series this is "
                       "inconsistent; regional or coastal series can legitimately differ.")
    return msgs


def validate(obs: pd.DataFrame, params: OceanParams | None = None, split_year: int = 2005) -> pd.DataFrame:
    """Chronological hold-out test: fit on year <= split_year, score on later years.

    Models: physics (carbonate model, only alkalinity fitted on the training years),
    empirical log-CO2 regression, linear trend in time, and 'persistence' (last training value).
    """
    p = params or OceanParams()
    obs = obs.sort_values("year")
    tr, te = obs[obs["year"] <= split_year], obs[obs["year"] > split_year]
    if len(tr) < 5 or len(te) < 3:
        raise ValueError("Need >=5 training and >=3 test years; adjust split_year.")
    co2 = obs["co2_ppm"] if "co2_ppm" in obs else co2_history().reindex(obs["year"]).reset_index(drop=True)
    co2 = pd.Series(np.asarray(co2, dtype=float), index=obs["year"].values)

    def physics(ta, rows):
        return ocean_state(co2.loc[rows["year"]].values, rows["year"].values, p, ta=ta)["pH"]

    fit = minimize_scalar(lambda ta: float(np.sum((physics(ta, tr) - tr["ph"].values) ** 2)),
                          bounds=(1800, 2800), method="bounded")
    ta_fit = float(fit.x)
    b = np.polyfit(np.log10(co2.loc[tr["year"]].values), tr["ph"].values, 1)
    bt = np.polyfit(tr["year"].values, tr["ph"].values, 1)
    preds = {
        f"physics model (fitted TA = {ta_fit:.0f})": physics(ta_fit, te),
        "empirical: pH ~ log10(CO2)": np.polyval(b, np.log10(co2.loc[te["year"]].values)),
        "empirical: linear in time": np.polyval(bt, te["year"].values),
        "baseline: persistence": np.full(len(te), tr["ph"].iloc[-1]),
    }
    rows = []
    for name, yhat in preds.items():
        err = np.asarray(yhat) - te["ph"].values
        rows.append({"model": name, "test_RMSE": float(np.sqrt(np.mean(err ** 2))),
                     "test_MAE": float(np.mean(np.abs(err))), "test_bias": float(np.mean(err))})
    return pd.DataFrame(rows).sort_values("test_RMSE").reset_index(drop=True)


# --------------------------------------------------------------------------------------
# 6. Sensor simulation (potentiometric glass-electrode / ISFET-style)
# --------------------------------------------------------------------------------------

_R, _F = 8.314462618, 96485.33212


@dataclass
class SensorParams:
    """Simulated electrode: E = e0 + slope * (pH - 7) + noise + drift * t   (volts).
    slope = -ln(10) R T / F * efficiency  (about -0.058 V/pH at 18 C for an ideal electrode)."""
    temp_c: float = 18.0
    efficiency: float = 0.98          # fraction of ideal Nernst slope
    e0_v: float = 0.012               # offset at pH 7
    noise_mv: float = 0.3             # random noise (1 sigma, mV) per reading
    drift_mv_per_year: float = 0.0    # slow offset drift

    @property
    def slope_v_per_ph(self):
        return -np.log(10) * _R * (self.temp_c + 273.15) / _F * self.efficiency

    def voltage(self, ph_true, t_years=0.0, rng=None, noise=True):
        ph_true = np.asarray(ph_true, dtype=float)
        v = self.e0_v + self.slope_v_per_ph * (ph_true - 7.0) + self.drift_mv_per_year * 1e-3 * np.asarray(t_years)
        if noise:
            rng = rng or np.random.default_rng()
            v = v + rng.normal(0.0, self.noise_mv * 1e-3, size=np.shape(v))
        return v


@dataclass
class SensorCalibration:
    intercept_v: float
    slope_v_per_ph: float
    rmse_mv: float
    rmse_ph: float
    efficiency_pct: float

    def to_ph(self, volts):
        return (np.asarray(volts) - self.intercept_v) / self.slope_v_per_ph


def calibrate_sensor(sensor: SensorParams, buffers: Iterable[float] = (7.0, 7.5, 8.0, 8.5),
                     repeats: int = 5, seed: int = 7) -> SensorCalibration:
    """Least-squares calibration against buffers that bracket the seawater range."""
    rng = np.random.default_rng(seed)
    ph = np.repeat(np.asarray(list(buffers), dtype=float), repeats)
    v = sensor.voltage(ph, rng=rng)
    slope, intercept = np.polyfit(ph, v, 1)
    resid = v - (intercept + slope * ph)
    rmse_v = float(np.sqrt(np.mean(resid ** 2)))
    ideal = -np.log(10) * _R * (sensor.temp_c + 273.15) / _F
    return SensorCalibration(float(intercept), float(slope), float(rmse_v * 1e3), float(rmse_v / abs(slope)),
                             float(100 * slope / ideal))


def measure(sensor: SensorParams, cal: SensorCalibration, ph_true, t_years=0.0, seed=None) -> np.ndarray:
    """Simulate readings of a true pH series through the sensor and its calibration."""
    rng = np.random.default_rng(seed)
    return cal.to_ph(sensor.voltage(ph_true, t_years, rng=rng))


def years_to_detect_trend(noise_ph: float, trend_per_yr: float = -0.0017, z: float = 2.0,
                          readings_per_year: int = 1, max_years: int = 500):
    """Fewest years of annual means needed before a linear trend exceeds z standard errors,
    assuming independent noise (no drift). Returns None if not reached within max_years."""
    sigma = noise_ph / np.sqrt(readings_per_year)
    for n in range(3, max_years + 1):
        se = sigma * np.sqrt(12.0 / (n * (n ** 2 - 1)))
        if abs(trend_per_yr) / se >= z:
            return n
    return None
