# Harmonized MODIS and VIIRS hot spots for Indonesia

NASA Space Apps Challenge 2026, challenge "Harmonization of MODIS and VIIRS Hot Spots".

MODIS is ending and VIIRS sees more and smaller fires, so the two fire records cannot be read as one
series. This project builds one monthly hot spot series for Indonesia in Aqua-equivalent units, with an
uncertainty interval, and tests the method by hiding MODIS for years where it exists and rebuilding it
from VIIRS alone. The result of that test is reported as it is, pass or fail.

This is work in progress. The pipeline, the data pack and the web page exist. See [PLAN.md](PLAN.md) for the
schedule and [HANDOFF.md](HANDOFF.md) for the state of the work.

## Why

Indonesian agencies publish different hot spot numbers for the same month, because each uses different
satellites and confidence thresholds, and some add satellites together. Raw detections in our region
doubled between 2015 and 2026 mainly because more VIIRS satellites fly, not because fires doubled.
A count is only comparable over time when it is expressed in one unit. Details and sources are in
[DESIGN.md](DESIGN.md), section 1.

## Result so far

Run on the full record, 14 November 2026. Trained on 2012 to 2019, tested by hiding Aqua for 2020 to
2022 and rebuilding it from Suomi NPP alone.

| Model | Median log error | Interval coverage | Yearly total error | Verdict |
|---|---|---|---|---|
| Baseline, one ratio | 0.303 | 83% | +10% to +21% | reference |
| Ratio per calendar month | 0.304 | 83% | +9% to +18% | fails C1 |
| Fire-size curves | 0.270 | 84% | 0% to +10% | passes C1, C2, C3 |

The pass criteria were fixed before the run. The pass on C1 is narrow. Limits are listed in DESIGN.md,
section 6.11.

## Layout

| Path | What it holds |
|---|---|
| `pipeline/` | Python: fetch detections and aerosol data, build monthly tables, fit and test the harmonization, write the pack |
| `tests/` | Tests for the pipeline (`python -m pytest tests -q`) |
| `web/` | The page: a flat voxel map with one pillar per 0.1 degree cell, a monthly calendar, a plain-language month panel, date range and CSV, explainer and methods. Its data pack is in `web/data/` |
| `data/` | Fetched data and outputs. Not in git; rebuilt by the pipeline |
| [DESIGN.md](DESIGN.md) | What the challenge asks, data sources, method, pass criteria |
| [PLAN.md](PLAN.md) | Schedule, status, submission checklist |
| [TEAM.md](TEAM.md) | Who does what, in what order, and the hand-offs |
| [HANDOFF.md](HANDOFF.md) | Current state, decisions, traps and next step: read first when picking the work up |
| [PACK.md](PACK.md) | Format of the data pack the page reads |
| [WEB-SPEC.md](WEB-SPEC.md) | Specification of the web page (person B), and section 16, what was built and where it differs |

## How to run

```
python pipeline/fetch.py --region sea --source modis --start 2002-07-04 --end 2026-11-13 --newest-first
python pipeline/celldays.py --region sea --static-years 2012-2019
python pipeline/harmonize.py --region sea
python pipeline/aod.py --region sea        # needs METEOMATICS_USER and METEOMATICS_PASS
python pipeline/pack.py --region sea
python -m pytest tests -q
node --test web/tests                 # tests of the page's calculations
python -m http.server 8765 --directory web   # preview the page at http://localhost:8765
```

Keys go in a `.env` file outside the repository. Nothing in this repository contains a key.

## Data sources

- NASA GIBS vector tiles: VIIRS (Suomi NPP, NOAA-20, NOAA-21) and MODIS (Aqua, Terra) thermal anomalies.
- NASA FIRMS area API.
- Meteomatics aerosol optical depth (Space Apps participant account).
- Open-Meteo air quality (not used yet).
- NASA GIBS Blue Marble Shaded Relief and Bathymetry: base map of the page.
- three.js (MIT licence), vendored in `web/vendor/three/`; colour steps from ColorBrewer (OrRd).
- World Bank, The Cost of Fire (2016) and Indonesia Economic Quarterly, December 2019: the two outside
  figures on the page (2015 and 2019 fire damage).

Details and the quirks we found are in [DESIGN.md](DESIGN.md).

## Use of AI tools

Code and documents in this repository were written with the help of an AI coding assistant (Claude,
through Claude Code), directed and reviewed by the team. Commits made this way carry a
`Co-Authored-By` line. No image in this repository comes from an image generator. The small pixel icons and the comic panels on
the page are grids and shapes drawn in code with the assistant.
