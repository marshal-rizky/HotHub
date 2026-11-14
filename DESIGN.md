# Design: harmonized MODIS and VIIRS hot spots for Indonesia

NASA Space Apps Challenge 2026, challenge "Harmonization of MODIS and VIIRS Hot Spots".
Last updated 14 November 2026. Numbers in section 6.9 come from the run on the full record.

## 1. Goal and audience

A web page that turns the MODIS and VIIRS active fire records into one monthly hot spot series for any
area in Indonesia, in one unit (Aqua-equivalent hot spots), with an uncertainty interval, from 2002 to
today and onwards after MODIS ends.

Who it is for:

- **Journalists, NGOs and researchers** who need to say "this month is worse than usual" and be able to
  defend the number.
- **Local government and disaster staff** who compare this year with earlier fire years.
- **Residents** of fire-prone provinces, through plain-language cards.

The page reports what the sensors saw. It never says who lit a fire or why. Persistent heat sources are
described only by type ("industrial heat or volcano"); the page names no facility or company.

### What exists today in Indonesia, and where it falls short

| Tool | Data | What it shows |
|---|---|---|
| BMKG hot spot page | MODIS and VIIRS from Terra, Aqua, Suomi NPP, NOAA-20 | One image of the latest map |
| BMKG Geohotspot | Himawari-9, BMKG's own algorithm | Image and map layer, with a smoke RGB image |
| SiPongi+ (Ministry of Forestry) | MODIS and VIIRS from NASA | Table per district, filters, download, charts |
| BRIN Hotspot | VIIRS only (Suomi NPP, NOAA-20) | Interactive map, known mining sites removed |

Weak points we answer (source: Kompas, 7 September 2026, and the agencies' own pages):

1. **Agencies publish different numbers for the same month.** August 2026, high confidence: SiPongi+
   9,409 and BRIN 9,587. We publish one definition and show how other counts relate to it.
2. **The number depends on the confidence threshold.** BRIN, 1 to 5 September 2026: 2,109 high,
   67,557 medium, 72,408 low. Our threshold is stated on the page and never changes.
3. **Satellites are added together.** A total over four satellites counts the same fire several times,
   and it grows when a satellite is launched. We keep every satellite apart and convert to one unit.
4. **No series is consistent across sensors.** Nobody offers a MODIS-equivalent value for a VIIRS-only
   month. That is the core of this project.
5. **BMKG gives an image, not data.** We give area selection, a date range and a CSV file.
6. **Cloud and smoke are admitted but not measured.** We flag months where thick smoke may have hidden
   fires, and we refuse to call such a month "below normal".
7. **Non-fire heat sources.** BRIN removes them from a list of known mines, so new sites slip through.
   We find them from the data itself.

We are a complement, not a replacement. We are not near real time, and we have no field validation.

## 2. What the challenge asks, and our answer

| The challenge asks for | Our answer | State |
|---|---|---|
| A harmonized series that continues after MODIS | Aqua-equivalent monthly series with an interval | Model fitted and tested |
| Pick a place: map, area, latitude and longitude | Draw a box or type coordinates | Page not built yet |
| Number of hot spots | Monthly count for the chosen area | Data pack built |
| Monthly calendar view | Year by month grid | Page not built yet |
| Current month against the historical median | Median of the same calendar month in earlier years | Rule defined in PACK.md |
| Date range and CSV download | One row per month with value, interval, source, smoke flag | Page not built yet |

## 3. Scope

- **Region:** Indonesia only. Bounding box latitude -11 to 8, longitude 94 to 142. The box also covers
  parts of Malaysia, Singapore, Brunei, Papua New Guinea and Timor-Leste.
- **Time step:** one month. Days and weeks are not shown.
- **Reference sensor:** Aqua MODIS, because it has the longest record with one afternoon overpass.
- **Fresh data and code:** all data was fetched and all code was written during the event.
- **Dropped:** several areas at once, a second region, MERRA-2, heavy visual polish.
- **Optional if time allows:** Landsat cross-check, a compare tab, simple cards.

## 4. Architecture

```
GIBS tiles -> fetch -> celldays -> harmonize -> pack -> web page
Meteomatics -> aod ---------------------------^
```

| Unit | Does | Reads | Writes |
|---|---|---|---|
| `pipeline/fetch.py` | Downloads detections per source and day, one cached file per day. Logs gap days, empty days and failed days. Waits and retries when the service is down | NASA GIBS vector tiles (no key) | `data/raw/sea/{source}/YYYY-MM-DD.csv` |
| `pipeline/grid.py` | Shared definitions: cells, blocks, the 19 count channels, activity rules | - | - |
| `pipeline/celldays.py` | Builds monthly tables, one year in memory at a time. Finds persistent heat sources on the training years and leaves them out of the block table | raw day files | `data/out/sea/cellmonths.csv`, `blockmonths.csv`, `satmonths.csv`, `static_cells.csv` |
| `pipeline/harmonize.py` | Fits the baseline and two models on the training years, scores them on the test years against fixed criteria, writes the estimate per block-month | block and satellite tables | `harmonize.json`, `harmonized.csv` |
| `pipeline/aod.py` | One request per month for daily aerosol optical depth at every block centre, reduced to smoke days per block-month | Meteomatics API (account in the environment) | `data/raw/sea/aod/YYYY-MM.csv`, `data/out/sea/aodmonths.csv` |
| `pipeline/pack.py` | Writes the static files the page reads | all outputs above | `web/data/sea/*.json` (format in PACK.md) |
| `web/` | Map, area, calendar, median, date range, CSV, explainer, methods | the pack only | - |

Rules:

- The page does no fitting. It only sums and ranks values from the pack.
- Every pipeline unit is pure functions plus a thin `main`. Tests cover the pure functions with small
  fixtures. Only the Python standard library and pytest are used.
- No key or password is in the repository. The Meteomatics account ends on 22 November 2026, so its
  data is stored in the pack and the page never calls that service.
- The machine used for the build has 3.4 GB of memory. Tables are built one year at a time for that
  reason.

## 5. Data sources

| Source | Use | Access |
|---|---|---|
| NASA GIBS vector tiles, `VIIRS_SNPP/NOAA20/NOAA21_Thermal_Anomalies_375m_All` | VIIRS detections | No key |
| NASA GIBS vector tiles, `MODIS_Combined_Thermal_Anomalies_All` | MODIS detections (Aqua and Terra) | No key |
| NASA FIRMS area API | Landsat cross-check (optional) | Free map key |
| Meteomatics `total_aod_550nm:idx` | Smoke flag | Space Apps participant account |
| Open-Meteo air quality | Live haze card (optional) | No key |

Tiles are requested in EPSG:4326 at zoom 4. Six tiles cover the bounding box. Detections on tile
edges appear twice and are removed.

What was fetched (14 November): 17,536 day files, 9.10 million detections. MODIS (Aqua and Terra) from
4 July 2002, Suomi NPP from 20 January 2012, NOAA-20 from 1 January 2020, NOAA-21 from 13 August 2024,
all up to November 2026. No day failed.

Quirks we measured, each handled in `fetch.py`:

- HTTP 400 means the layer has no data that day. HTTP 404 means an empty tile. During an outage a 400
  can be temporary, so a 400 on only some tiles of a day is retried.
- `ACQ_DATE` uses slashes (`YYYY/MM/DD`) from 2022-03-01 to 2022-06-14.
- The `SATELLITE` label changes over time: `Aqua` and `Terra` become `A` and `T` from 2020-08-01, and
  NOAA-20 is `1` before 2024-02-19 and `N20` after. We take the VIIRS satellite from the layer name.
- NOAA-21 has no data before 2024-08-13.
- Suomi NPP has 78 gap days declared by GIBS, 28 of them in 2022 and 28 in 2024. No day failed.
- Suomi NPP was still delivering data in November 2026.
- Meteomatics aerosol data starts on 2015-11-21. One month of daily values on a 0.5 degree grid is one
  request.

## 6. Harmonization method

### 6.1 Target scale

The unit is the **Aqua MODIS hot spot** (confidence 30 or higher), counted per month. A VIIRS-only
month is converted into the number Aqua would have reported. We chose this direction because the long
record is MODIS, and people already quote MODIS-era numbers.

### 6.2 Grid and channels

- Cells of 0.1 degree. Blocks of 0.5 degree (5 by 5 cells).
- 19 count channels per cell-month: three confidence levels for each of three VIIRS satellites, and
  five confidence bands (0, 30, 50, 70, 80) for each of Aqua and Terra.
- A detection **qualifies** when it is VIIRS nominal or high, or MODIS confidence 30 or higher.
- **Day or night** comes from local solar time: 06:00 to 18:00 is day. The two are fitted apart because
  the sensors differ most at night, when small cool fires are visible to VIIRS only.

### 6.3 Persistent heat sources

Gas flares, smelters and volcanoes are hot every day and are not fires. A cell is a persistent source
when it has a qualifying detection on at least half of the data days of a year, in at least three of
the training years (2012 to 2019). Using only training years keeps the test honest. 17 cells were
found. They are left out of the model and of the page totals, and listed in the pack.

### 6.4 The record that is scored

One record is one block, one month, day or night, where the VIIRS satellite saw at least one fire. It
holds the VIIRS count, the mean fire radiative power (FRP) per detection, the share of high-confidence
detections, and the Aqua count (zero when Aqua saw nothing).

- A month is used only when both satellites have data on at least 80% of its days.
- Block-months where Aqua saw fire and VIIRS saw none are not records, but their Aqua count is added to
  the real yearly totals. A model cannot hide what VIIRS missed.
- This set is defined from VIIRS alone, without looking at the outcome.

### 6.5 Baseline and two models

Each VIIRS satellite is handled on its own. The number of VIIRS satellites in orbit changes over time,
so a pooled count would drift.

| Name | What it is |
|---|---|
| **Baseline** | One ratio (Aqua count divided by VIIRS count) for the whole record, day and night apart |
| **Monthly** | One ratio per calendar month, day and night apart, pulled towards the baseline by 200 pseudo-detections so thin months stay stable |
| **Size** | A monotone curve from VIIRS count to Aqua count, one curve per fire-size class |

The size model in detail:

1. Records are split into four classes per day or night: FRP per detection above or below its median,
   and high-confidence share above or below its median. Small, cool fires are seen by VIIRS and missed
   by MODIS, so the conversion should depend on fire size.
2. Inside a class, records are grouped into bins of VIIRS count, two bins per doubling. The mean Aqua
   count of each bin is made non-decreasing (isotonic fit, pool-adjacent-violators).
3. The curve runs from the origin through those points. Past the last point it keeps the last ratio.
4. A class with fewer than 200 records uses the curve of all classes together.

### 6.6 Test: MODIS-denial

- Train on 2012 to 2019.
- Hide Aqua for 2020 to 2022, rebuild it from Suomi NPP alone, and compare with the real Aqua counts.
- Report 2023 onwards apart, because Aqua's overpass time drifts from 2023 and it is no longer a fair
  reference.

### 6.7 Pass criteria, fixed before any result was seen

| | Criterion |
|---|---|
| **C1** | Median absolute log error per block-month is at most 0.9 times the baseline's |
| **C2** | The 80% interval covers between 70% and 90% of the scored block-months |
| **C3** | Each test year total is within 25% of the real Aqua total |

The criteria are not changed after results are seen. A model that fails is reported as failed. If no
model passes, the page shows the monthly ratio and labels the estimate "uncalibrated".

### 6.8 Intervals

The residual is `log((real + 1) / (estimate + 1))`. Its 10th and 90th percentiles on the training
years give an 80% interval. Residuals are taken at three sizes of area (block, 2.5 degree square,
whole region) and grouped by the size of the estimate: under 10, 10 to 100, 100 to 1000, 1000 and
over. Large totals get narrower intervals because errors average out. A group with fewer than 30
residuals uses all residuals together.

For an area the page sums cell estimates. A cell's estimate is its VIIRS count times the ratio of its
block's estimate to its block's VIIRS count.

### 6.9 Test result on the full record (14 November 2026)

Suomi NPP against Aqua. 95,817 training records, 19,336 scored block-months in the test years.

| Model | Median log error | Interval coverage | 2020 | 2021 | 2022 | Verdict |
|---|---|---|---|---|---|---|
| Baseline | 0.303 | 83% | +17% | +10% | +21% | reference |
| Monthly | 0.304 | 83% | +11% | +9% | +18% | fails C1 |
| Size | 0.270 | 84% | +10% | 0% | +8% | passes C1, C2, C3 |

How to read this honestly:

- **The size model passes and is the one in use.** Its pass on C1 is narrow: 0.2705 against a limit of
  0.2727.
- **The monthly ratio does not beat one ratio.** Season alone does not explain the difference between
  the sensors here. Fire size does.
- **Drift years** (not a fair test, shown for information), size model: 2023 0%, 2024 -7%, 2025 +5%,
  2026 -6%.
- A median log error of 0.27 means a typical block-month estimate is off by about 30%. Small areas are
  uncertain. Regional totals are much tighter, which is what the interval table expresses.

Why this matters, in one example: raw detections in the box were 1.15 million in 2015 and 2.32
million in 2026, because three VIIRS satellites now fly. In Aqua-equivalent units September 2026 is
about 27,000 hot spots and September 2015 about 37,000. Adding satellites together would have called
2026 twice as bad as 2015.

The test was first run when MODIS before June 2010 was still missing, and run again on the full
record. The numbers did not change, as expected: the training and test years were already complete.

### 6.10 Smoke flag

Thick smoke hides fires from the satellite, so a low count under smoke is not good news.

- Data: aerosol optical depth at 550 nm, daily at 06:00 UTC (early afternoon in Indonesia, close to the
  daytime overpass), at the centre of every 0.5 degree block, from 21 November 2015.
- A **smoke day** is a day with optical depth of 1.0 or more. A block-month is **smoky** from three
  smoke days.
- The flag is display only. It never changes a count.
- Fail closed: the page says "below normal" only when smoke data exists for that month and the area
  was not smoky. Before November 2015 it says there is no smoke data.

### 6.11 Known limits

- Only Suomi NPP is calibrated. NOAA-20 and NOAA-21 have no training years before 2020, so they are
  not converted yet. If Suomi NPP stops, the series stops until that is done.
- No cloud data. A cloudy month can look quiet. The smoke flag does not cover cloud.
- Aerosol optical depth comes from a model product, not a direct measurement, and one time of day.
- Aqua after 2022 drifts in overpass time, so "Aqua observed" in those years is itself changing.
- No field validation. Hot spots are heat anomalies, not confirmed fires.
- The persistent-source rule is strict and finds few cells. Smaller or newer sites remain in the
  counts.
- Months follow the UTC date, so a fire near local midnight at a month boundary can fall in the
  neighbouring month.

## 7. Interface

### 7.1 Map and area
A map of Indonesia. The person draws a box or types latitude and longitude with a radius. The value
of an area is the sum over 0.1 degree cells whose centre is inside it.

### 7.2 Monthly calendar
Rows are years, columns are the twelve months. Colour shows how the month ranks among the same
calendar month in other years for that area. Each cell is marked as "Aqua observed" or "estimated
from VIIRS". Estimated cells show the interval on hover. Smoky months carry a marker.

### 7.3 This month against the historical median
The current month's value next to the median of the same calendar month in earlier years, with the
plain statement "above", "near" or "below" normal. "Below" follows the smoke rule in 6.10. Fewer than
five earlier years shows "history too short".

### 7.4 Date range and CSV
Pick a start and end month. Download one row per month: year, month, Aqua count, estimate, low, high,
which one is the headline, smoky or not.

### 7.5 Why our number differs from official figures
A short explainer with one chart: raw detections per satellite for the region against the
Aqua-equivalent series. It states our threshold, that satellites are never added together, and that
persistent heat sources are left out. It quotes the published disagreement between agencies and links
the source.

### 7.6 Methods
The table in 6.9 as produced by the pipeline, the criteria, the training and test years, the smoke
threshold, the list of limits in 6.11, data sources with fetch dates, and the declaration of AI use.

### 7.7 Simple cards (optional)
Haze now and fires in the last 24 hours near a place, in plain words.

## 8. Open items

- Calibrate NOAA-20 against Aqua on 2020 to 2022, and say clearly that it has no independent test.
- Landsat cross-check with the FIRMS key (works for past dates; coverage is limited).
- Decide the public host and confirm it serves gzip (the pack is 6 MB, 1.7 MB gzipped).
