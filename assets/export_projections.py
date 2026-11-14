"""Re-export the website's data: assets/projections.json and assets/data.js.

Run from anywhere: python3 assets/export_projections.py
Uses the NOAA Mauna Loa record shipped as assets/co2_annmean_mlo.csv and the model's default
parameters, with the same settings as the notebook's export cell (300 Monte-Carlo draws, seed 42).
"""
import json
from pathlib import Path

import ocean_ph_model as m

HERE = Path(__file__).resolve().parent
params = m.OceanParams()
payload = {
    "meta": {"params": params.to_dict(),
             "scenarios": {k: v["label"] for k, v in m.SCENARIOS.items()},
             "co2_history": "NOAA GML Mauna Loa annual means from 1959; ice-core based estimates before.",
             "notes": "Global-mean surface box model. Band = parameter uncertainty only. Scenario CO2 paths are illustrative."},
    "projections": {}, "headline": {},
}
for name in m.SCENARIOS:
    d = m.project(name, params, n_mc=300)
    payload["projections"][name] = m.projection_to_records(d)
    payload["headline"][name] = m.headline_stats(d)

(HERE / "projections.json").write_text(json.dumps(payload))
(HERE / "data.js").write_text("window.OCEAN_DATA=" + json.dumps(payload, separators=(",", ":")) + ";\n")
print("wrote projections.json and data.js")
print(json.dumps(payload["headline"]["intermediate"], indent=2))
