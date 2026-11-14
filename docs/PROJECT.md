# Project notes: harmonized MODIS and VIIRS hot spots for Indonesia

NASA Space Apps Challenge 2026, challenge "Harmonization of MODIS and VIIRS Hot Spots".
Written 14 November 2026. Submission deadline: Sunday 15 November 2026, 23:59.

This file collects the analysis, the decisions and the plan in one place. It is a working document:
the status section at the end says what exists and what does not.

## 1. What the challenge asks for

The MODIS instruments (Terra since 2000, Aqua since 2002) are near the end of their life. VIIRS
(Suomi NPP, NOAA-20, NOAA-21) continues the active fire record, but it sees more and smaller fires, so
the two records cannot be read as one series. The challenge asks for a tool that:

- gives a harmonized hot spot series that continues after MODIS ends,
- lets a person pick a place (map, drawn area, or latitude and longitude) and a date range,
- shows the number of hot spots, with a monthly calendar view,
- compares the current month with the historical median,
- lets the person download the numbers (CSV).

Judging: Impact, Creativity, Validity, Relevance, Presentation (1 to 5 each).

## 2. Our answer in one paragraph

A web page for Indonesia. The person picks an area and sees monthly hot spot counts from 2002 to today
as one series in "Aqua-equivalent" units, with an uncertainty interval. Months where MODIS exists show
the MODIS count. Months where only VIIRS exists show an estimate made from VIIRS. The method is tested
by hiding MODIS for years where we do have it and rebuilding it from VIIRS alone. The pass or fail
result of that test is shown on the page, whichever way it goes.

## 3. Objective assessment before building

| Criterion | Where we stand | What it needs |
|---|---|---|
| Validity | Strongest point: test criteria fixed before looking at results, per-satellite handling, honest reporting | Keep the criteria fixed |
| Relevance | Weakest point: the challenge names monthly counts, date range, CSV, lat/lon entry | Build exactly these first |
| Impact | Haze matters to many people in Sumatra and Kalimantan | Plain-language cards, smoke flag |
| Creativity | Fire-size covariate, "MODIS-denial" test, fail-closed smoke flag | Explain them simply |
| Presentation | Not started | Teammate owns slides, video, project page |

Other public approaches we looked at for comparison:

- A ratio-of-totals method per calendar month with day and night split and shrinkage towards a pooled
  value, tested by rebuilding hidden MODIS years. Reported error about -10% to +27%.
- A physics-based method that models sensor footprints on a hexagonal grid with FRP calibration.
- Preset-region dashboards with a forecast and an AI assistant.

What we take from this: the ratio per calendar month is a fair baseline and we must beat it or say that
we did not. A hidden-years test is the expected standard of proof.

## 4. Scope decisions

- Region: Indonesia only (bounding box latitude -11 to 8, longitude 94 to 142).
- Headline unit: hot spots per month, Aqua-equivalent, with an interval. No weekly view.
- All data fetched fresh during the event. All code written during the event.
- Reference sensor: Aqua MODIS.
- Dropped: several areas at once, a second region, MERRA-2, heavy visual polish.
- Optional if time allows: Landsat cross-check, a compare tab.

## 5. Data sources

| Source | Use | Access |
|---|---|---|
| NASA GIBS vector tiles, `VIIRS_SNPP/NOAA20/NOAA21_Thermal_Anomalies_375m_All` | VIIRS detections | No key |
| NASA GIBS vector tiles, `MODIS_Combined_Thermal_Anomalies_All` | MODIS detections (Aqua and Terra) | No key |
| NASA FIRMS area API | Recent detections, Landsat cross-check | Free map key |
| Meteomatics `total_aod_550nm:idx` | Smoke flag (aerosol optical depth) | Space Apps participant account |
| Open-Meteo air quality | Live haze card | No key |

Tiles are requested in EPSG:4326 at zoom 4. Six tiles cover the bounding box.

Things we measured or ran into:

- GIBS answers HTTP 400 when a layer has no data for a day and 404 for an empty tile. During an outage
  a 400 can also be temporary, so a 400 on only some tiles of a day is retried.
- `ACQ_DATE` uses slashes (`YYYY/MM/DD`) from 2022-03-01 to 2022-06-14.
- The `SATELLITE` label changes over time: `Aqua` and `Terra` become `A` and `T` from 2020-08-01, and
  NOAA-20 is `1` before 2024-02-19 and `N20` after. We take the VIIRS satellite from the layer name.
- NOAA-21 has no data before 2024-08-13.
- Suomi NPP was still delivering data on 2026-11-02.
- FIRMS allows 5000 transactions per 10 minutes. `LANDSAT_NRT` accepts past dates.
- Meteomatics aerosol data starts on 2015-11-21. The account allows 1000 requests a day and ends on
  2026-11-22, so its data is fetched in the pipeline and stored in the data pack. The page never calls it.

## 6. Method

### Grid and tables

- Cells of 0.1 degrees, blocks of 0.5 degrees.
- 19 count channels: three confidence levels for each of three VIIRS satellites, and five confidence
  bands (0, 30, 50, 70, 80) for each of Aqua and Terra.
- A detection qualifies when it is VIIRS nominal or high, or MODIS confidence 30 or higher.
- Day or night comes from local solar time (06:00 to 18:00 is day).
- Monthly tables: per cell (what the page sums), per block, satellite and day or night (what the model
  fits, with detection count, FRP sum and high-confidence count), and days with data per satellite.
- Persistent heat sources (industry, volcanoes) are cells active on at least half of the data days in at
  least three years. They are found on the training years only.

### Two candidate models

1. **Ratio.** Aqua count divided by VIIRS count, per calendar month, per VIIRS satellite, day and night
   kept apart. This is the baseline.
2. **Isotonic with a fire-size covariate.** A monotone mapping from VIIRS count to Aqua count that also
   uses FRP per detection and the share of high-confidence detections. Small fires are seen by VIIRS and
   missed by MODIS, so the ratio should depend on fire size.

Each VIIRS satellite is handled on its own, because the number of VIIRS satellites in orbit changes
over time and a pooled count would drift with it.

### Test ("MODIS-denial")

- Train on 2012 to 2019.
- Rebuild 2020 to 2022 from VIIRS alone and compare with the real Aqua counts.
- Report 2023 onwards on its own, because Aqua's overpass time drifts from 2023.
- The set of block-months that is scored is fixed without looking at the outcome and includes zeros.

### Pass criteria, fixed before seeing results

- **C1** Median log error is at most 0.9 times that of the baseline.
- **C2** The 80% interval covers between 70% and 90% of the test block-months.
- **C3** Each test year total is within 25% of the real total.

The criteria are not changed after results are seen. If both models fail, the page labels the VIIRS-only
estimate "uncalibrated" and the calendar uses Aqua where Aqua exists.

### Smoke flag

Thick smoke hides fires from the satellite, so a low count under smoke is not good news. A month is
flagged when aerosol optical depth at 550 nm is 1.0 or more. The flag is display only. The page says
"below normal" only when smoke data exists and the air was clear.

## 7. Web page

- Map with a drawn area, or latitude and longitude entry.
- Monthly calendar (year by month) of hot spot counts.
- "This month against the historical median."
- Date range selection and CSV download.
- Smoke flag, and a short explanation of why our figure differs from official ones.
- Methods page with the test result, pass or fail.
- Simple cards: haze now, fires in the last 24 hours.
- Data pack target: under about 8 MiB gzipped. The host must serve gzip.

## 8. Schedule

| When | Work |
|---|---|
| Sat afternoon | Monthly tables, two models, MODIS-denial test, aerosol data |
| Sat evening | Data pack and core page: map, area, lat/lon, calendar, median, date range, CSV |
| Sat late | Smoke flag, official-figure explainer, Methods page |
| Sun morning | Simple cards, deploy, Landsat check if time allows |
| Sun midday | Browser and phone tests, README, citations |
| Sun 18:00 | Freeze. No new features. Submit before 23:59. |

Split of work: one person on pipeline, model and page; one person on the submission guide requirements,
project page text, slides or video, and hosting.

## 9. Status on 14 November, afternoon

Done:

- `pipeline/grid.py`: grid, channels, activity rules.
- `pipeline/fetch.py`: GIBS fetch with a per-day cache, gap and empty-day logs, back-off on network
  errors, and an audit mode.
- `pipeline/celldays.py`: monthly tables and persistent heat sources.
- 24 tests pass (`python -m pytest tests -q`).
- Fetch is running. Days cached so far, newest first: MODIS 1072, Suomi NPP 801, NOAA-21 773,
  NOAA-20 224.

Not done yet: the harmonization models and their test, aerosol fetch, data pack, the web page, deploy,
README. No validation numbers exist yet.

Before fitting: check `gaps.txt`, `failed.txt` and `empty_days.txt`, run `fetch.py --audit`, and run
the fetch once more to fill days lost to the GIBS outage.

## 10. How to run what exists

```
python pipeline/fetch.py --region sea --source modis --start 2002-07-04 --end 2026-11-13 --newest-first
python pipeline/celldays.py --region sea --static-years 2012-2019
python -m pytest tests -q
```

Keys go in a `.env` file outside the repository. Nothing in this repository contains a key.
