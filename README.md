# Harmonized MODIS and VIIRS hot spots for Indonesia

NASA Space Apps Challenge 2026, challenge "Harmonization of MODIS and VIIRS Hot Spots".

MODIS is ending and VIIRS sees more and smaller fires, so the two fire records cannot be read as one
series. This project builds one monthly hot spot series for Indonesia in Aqua-equivalent units, with an
uncertainty interval, and tests the method by hiding MODIS for years where it exists and rebuilding it
from VIIRS alone. The result of that test is reported as it is, pass or fail.

This is work in progress. See [PLAN.md](PLAN.md) for what exists today.

## Layout

| Path | What it holds |
|---|---|
| `pipeline/` | Python: fetch detections, build monthly tables, fit and test the harmonization |
| `tests/` | Tests for the pipeline (`python -m pytest tests -q`) |
| `web/` | The page (not written yet) |
| `data/` | Fetched data and outputs. Not in git; rebuilt by the pipeline |
| [DESIGN.md](DESIGN.md) | What the challenge asks, data sources, method, pass criteria |
| [PLAN.md](PLAN.md) | Schedule, status, submission checklist |

## How to run

```
python pipeline/fetch.py --region sea --source modis --start 2002-07-04 --end 2026-11-13 --newest-first
python pipeline/celldays.py --region sea --static-years 2012-2019
python pipeline/harmonize.py --region sea
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
