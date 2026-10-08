# Ocean pH model

Physics-based surface-ocean pH and aragonite saturation under rising atmospheric CO2, with scenario projections to 2100.

## Files
| File | What it is |
|---|---|
| `ocean_ph_model.py` | The model. Import this from your backend. No plotting, no I/O at import. |
| `Predicting_Ocean_pH_Under_Rising_CO2_Conditions.ipynb` | Walkthrough with outputs already run. |
| `test_ocean_ph_model.py` | 13 tests. `python test_ocean_ph_model.py` (or `pytest`). |
| `export/projections.json` | All four scenarios + metadata, ready for a static site. |
| `data/ocean_acidification_dataset.csv` | Your original dataset (fails the quality checks, see below). |

## Quick start
```python
import ocean_ph_model as m
df = m.project("intermediate")                 # year, co2_ppm, pH, pH_lo, pH_hi, omega_arag, ...
m.headline_stats(df)                           # numbers for UI cards
m.projection_to_records(df)                    # list of dicts -> JSON
m.project({2050: 500, 2100: 700})              # custom CO2 pathway (ppm anchors)
m.project("high", m.OceanParams(ta_umol_kg=2250, temp_c=22))   # different ocean region
```
Scenarios: `low`, `intermediate`, `high`, `very_high`. Results for 500 Monte-Carlo members take about 0.4 s, so precompute or cache per scenario/parameter set.

## Two ways to build the site
1. **Static (simplest):** read `export/projections.json` in JavaScript and draw it. Regenerate by running the last notebook cell.
2. **API:** wrap `project()`. Untested sketch (FastAPI is not installed where I built this):
```python
from functools import lru_cache
from fastapi import FastAPI
import ocean_ph_model as m

app = FastAPI()

@lru_cache(maxsize=64)
def _run(scenario: str, ta: float, temp: float):
    df = m.project(scenario, m.OceanParams(ta_umol_kg=ta, temp_c=temp))
    return {"stats": m.headline_stats(df), "rows": m.projection_to_records(df)}

@app.get("/api/projection")
def projection(scenario: str = "intermediate", ta: float = 2300.0, temp: float = 18.0):
    return _run(scenario, ta, temp)
```
Validate and bound `scenario`, `ta` (about 1800-2800) and `temp` (about 0-35 C) before using them in production.

## Before you publish: replace the data
- **CO2 history:** the built-in record is approximate (1960-2023 within ~0.5 ppm of NOAA Mauna Loa annual means, rounded; pre-1958 ±2 ppm; 2024-2025 estimated). Download NOAA GML's `co2_annmean_mlo.csv`, then:
  ```python
  m.load_noaa_co2_annual("data/co2_annmean_mlo.csv")
  k = m.calibrate_equilibration()     # re-calibrate to the observed trend
  params = m.OceanParams(equilibration=k)
  ```
- **Observed pH:** use a real series (Copernicus Marine global mean pH, Station ALOHA, BATS) with columns `year`, `pH`, then run `m.check_observations(obs)` and `m.validate(obs)`.
- **Scenarios:** the four pathways are rounded, SSP-like illustrations. For official numbers load the SSP concentration files and pass the result of `m.load_scenario_csv(path)` as `scenario=`.

I could not download any of these here (no network access), so none are bundled.

## Why your original CSV is flagged
`m.check_observations` reports that its CO2 averages ~10 ppm above the Mauna Loa record, has years where annual CO2 falls, and its pH responds to CO2 at about half the strength carbonate chemistry predicts (and falls about 0.001/yr vs the observed global ~0.0017/yr). It looks synthetic. Treat it as a pipeline demo, not evidence, and label it so on the site.

## What the model is (and is not)
- Global-mean surface box: total alkalinity 2300 umol/kg, 18 C, salinity 35 (typical round values, not fitted).
- Carbonate system: CO2, bicarbonate, carbonate, borate and water alkalinity; constants from Weiss 1974 (K0), Lueker et al. 2000 (K1, K2), Dickson 1990 (KB), Millero 1995 (Kw), Mucci 1983 (aragonite Ksp), Lee et al. 2010 (boron), Weiss & Price 1980 (water vapour). pH is on the total scale.
- One calibrated parameter, `equilibration` = 0.891: the fraction of the atmospheric CO2 rise the surface water has caught up with, tuned so the 1985-2022 trend is -0.0017 pH/yr (Copernicus Marine global surface pH). It is assumed constant in the future.
- Checks that were *not* tuned: modelled pH change 1850 to 2022 is -0.125 (Copernicus quotes about -0.1, rounded), and the Revelle factor is 10.6 (typical range roughly 8-14). The 2100 pH under the very-high scenario is 7.70, in line with published high-emissions projections.
- Uncertainty bands are parameter uncertainty only (alkalinity ±40 umol/kg, temperature ±1.5 C, equilibration ±0.05), chosen as plausible spreads, not statistically estimated. They exclude scenario choice, regional differences and natural variability.
- Not modelled: regional variation, changing alkalinity or circulation, biology, sulfate/fluoride/phosphate/silicate alkalinity terms. Cross-check against PyCO2SYS before quoting numbers in anything formal.
- Regional note: the global mean hides large differences (cold, upwelling and coastal waters sit well away from 8.04). Say "global-mean surface ocean" on the site.

## Sensor simulation
`SensorParams`, `calibrate_sensor`, `measure`, `years_to_detect_trend` simulate a potentiometric electrode (ideal slope about -0.057 V/pH at 18 C). All sensor noise and drift values are simulation inputs, not specifications of any real product. One robust result: a drift of about 0.1 mV/yr mimics the entire global acidification trend.
