"""Run with:  python test_ocean_ph_model.py   (or: pytest -q)"""
import json
import numpy as np
import ocean_ph_model as m

P = m.OceanParams()


def test_chemistry_round_trip():
    """Re-deriving pCO2 from the solved pH and the same alkalinity must give back the input."""
    pco2, ta, t, s = 400.0, 2300.0, 18.0, 35.0
    r = m.solve_carbonate(ta, pco2, t, s)
    h = r["h_mol_kg"]
    k0 = m.k0_weiss(t, s); k1, k2 = m.k1_k2_lueker(t, s); kb = m.kb_dickson(t, s); kw = m.kw_millero(t, s)
    bt = m.total_boron(s)
    carb_alk = ta * 1e-6 - bt * kb / (kb + h) - kw / h + h
    co2 = carb_alk / (k1 / h + 2 * k1 * k2 / h ** 2)
    assert abs(co2 / k0 * 1e6 - pco2) < 0.01


def test_known_chemistry_values():
    assert abs(-np.log10(m.k1_k2_lueker(25, 35)[0]) - 5.85) < 0.02      # pK1 at 25 C, S=35
    assert abs(-np.log10(m.k1_k2_lueker(25, 35)[1]) - 8.97) < 0.02      # pK2
    assert 0.027 < float(m.k0_weiss(25, 35)) < 0.030                    # CO2 solubility, seawater 25 C


def test_revelle_factor_in_typical_range():
    assert 8.0 < float(m.revelle_factor(2300, 400, 18, 35)) < 14.0


def test_ph_decreases_with_co2_and_buffering_is_sublinear():
    x = np.array([280, 400, 560, 800.0])
    ph = m.solve_carbonate(2300, x, 18, 35)["pH"]
    assert np.all(np.diff(ph) < 0)
    per_decade = np.diff(ph) / np.diff(np.log10(x))
    assert np.all(per_decade > -1.0)          # constant-bicarbonate HH would give exactly -1.0


def test_calibrated_equilibration_matches_default():
    assert abs(m.calibrate_equilibration() - P.equilibration) < 0.003


def test_model_reproduces_observed_trend_and_is_plausible():
    h = m.co2_history(1985, 2022)
    st = m.ocean_state(h.values, h.index.values, P)
    assert abs(np.polyfit(h.index, st["pH"], 1)[0] - (-0.0017)) < 0.0002
    df = m.project("intermediate", P, n_mc=0).set_index("year")
    assert -0.15 < df.loc[2022, "pH"] - df.loc[1850, "pH"] < -0.09        # ~0.1 quoted since pre-industrial
    assert 7.9 < df.loc[2100, "pH"] < 7.96


def test_scenarios_are_ordered_and_continuous():
    end = {s: m.project(s, P, n_mc=0).set_index("year") for s in m.SCENARIOS}
    ph2100 = [end[s].loc[2100, "pH"] for s in ("low", "intermediate", "high", "very_high")]
    assert ph2100 == sorted(ph2100, reverse=True)
    for s in end:
        jump = abs(end[s].loc[2026, "co2_ppm"] - end[s].loc[2025, "co2_ppm"])
        assert jump < 6, f"{s}: CO2 jumps {jump:.1f} ppm at the history/scenario boundary"


def test_uncertainty_band_brackets_central_and_is_reproducible():
    a = m.project("high", P, n_mc=200, seed=1); b = m.project("high", P, n_mc=200, seed=1)
    assert a.equals(b)
    assert ((a["pH_lo"] <= a["pH"]) & (a["pH"] <= a["pH_hi"])).all()


def test_aragonite_saturation_declines():
    df = m.project("high", P, n_mc=0)
    assert df["omega_arag"].is_monotonic_decreasing
    assert 1.5 < df["omega_arag"].iloc[175] < 4.0


def test_json_serialisable():
    df = m.project("low", P, n_mc=50)
    json.dumps(m.projection_to_records(df)); json.dumps(m.headline_stats(df))


def test_observation_checks_flag_the_original_dataset():
    obs = m.load_observations("data/ocean_acidification_dataset.csv")
    levels = [w["level"] for w in m.check_observations(obs, P)]
    assert "warning" in levels


def test_loader_matches_columns_exactly(tmp_path=None):
    import pandas as pd, tempfile, os
    d = tempfile.mkdtemp(); f = os.path.join(d, "x.csv")
    pd.DataFrame({"Year": [2000, 2001], "Graphite": [1, 2], "Ocean_pH": [8.1, 8.09]}).to_csv(f, index=False)
    assert list(m.load_observations(f).columns) == ["year", "ph"]


def test_sensor_calibration_and_detection():
    s = m.SensorParams(noise_mv=0.3)
    cal = m.calibrate_sensor(s)
    assert 95 < cal.efficiency_pct < 101 and cal.rmse_ph < 0.01
    ph = np.full(2000, 8.05)
    est = m.measure(s, cal, ph, seed=3)
    assert abs(est.mean() - 8.05) < 0.01
    assert m.years_to_detect_trend(0.083) > m.years_to_detect_trend(0.005)
    drift = m.SensorParams(noise_mv=0.0, drift_mv_per_year=0.1)
    cal0 = m.calibrate_sensor(m.SensorParams(noise_mv=0.0))
    est = m.measure(drift, cal0, np.full(50, 8.05), t_years=np.arange(50), seed=0)
    assert abs((est[-1] - est[0]) / 49 - (-0.1e-3 / abs(drift.slope_v_per_ph))) < 1e-4   # drift mimics a trend


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t(); print("PASS", t.__name__)
    print(f"\n{len(tests)} tests passed")
