# Harmonized MODIS and VIIRS hot spots for Indonesia

NASA Space Apps Challenge 2026, challenge "Harmonization of MODIS and VIIRS Hot Spots".

MODIS is ending and VIIRS sees more and smaller fires, so the two fire records cannot be read as one
series. This project builds one monthly hot spot series for Indonesia in Aqua-equivalent units, with an
uncertainty interval, and tests the method by hiding MODIS for years where it exists and rebuilding it
from VIIRS alone. The result of that test is reported as it is, pass or fail.

This is work in progress. See [PLAN.md](PLAN.md) for what exists today.

## Why

Indonesian agencies publish different hot spot numbers for the same month, because each uses different
satellites and confidence thresholds, and some add satellites together. Raw detections in our region
doubled between 2015 and 2026 mainly because more VIIRS satellites fly, not because fires doubled.
A count is only comparable over time when it is expressed in one unit. Details and sources are in
[DESIGN.md](DESIGN.md), section 1.

## Result so far

First run on real data, 14 November 2026. Trained on 2012 to 2019, tested by hiding Aqua for 2020 to
2022 and rebuilding it from Suomi NPP alone.

| Model | Median log error | Interval coverage | Yearly total error | Verdict |
|---|---|---|---|---|
| Baseline, one ratio | 0.303 | 83% | +10% to +21% | reference |
| Ratio per calendar month | 0.304 | 83% | +9% to +18% | fails C1 |
| Fire-size curves | 0.270 | 84% | 0% to +10% | passes C1, C2, C3 |

The pass criteria were fixed before the run. The pass on C1 is narrow. The record was not complete at
the time, so these numbers will be replaced after the rerun. Limits are listed in DESIGN.md, 6.11.

## Layout

| Path | What it holds |
|---|---|
| `pipeline/` | Python: fetch detections and aerosol data, build monthly tables, fit and test the harmonization, write the pack |
| `tests/` | Tests for the pipeline (`python -m pytest tests -q`) |
| `web/` | The page (not written yet) and its data pack in `web/data/` |
| `data/` | Fetched data and outputs. Not in git; rebuilt by the pipeline |
| [DESIGN.md](DESIGN.md) | What the challenge asks, data sources, method, pass criteria |
| [PLAN.md](PLAN.md) | Schedule, status, submission checklist |
| [TEAM.md](TEAM.md) | Who does what, in what order, and the hand-offs |
| [PACK.md](PACK.md) | Format of the data pack the page reads |

## How to run

```
python pipeline/fetch.py --region sea --source modis --start 2002-07-04 --end 2026-11-13 --newest-first
python pipeline/celldays.py --region sea --static-years 2012-2019
python pipeline/harmonize.py --region sea
python pipeline/aod.py --region sea        # needs METEOMATICS_USER and METEOMATICS_PASS
python pipeline/pack.py --region sea
python -m pytest tests -q
```

Keys go in a `.env` file outside the repository. Nothing in this repository contains a key.

## Data sources

- NASA GIBS vector tiles: VIIRS (Suomi NPP, NOAA-20, NOAA-21) and MODIS (Aqua, Terra) thermal anomalies.
- NASA FIRMS area API.
- Meteomatics aerosol optical depth (Space Apps participant account).
- Open-Meteo air quality.

Details and the quirks we found are in [DESIGN.md](DESIGN.md).

## Use of AI tools

Code and documents in this repository were written with the help of an AI coding assistant (Claude,
through Claude Code), directed and reviewed by the team. Commits made this way carry a
`Co-Authored-By` line. No images in this repository are AI-generated.
