# Data pack format

The page reads four JSON files from `web/data/sea/`. They are built by `python pipeline/pack.py --region sea`.
The page never calls a data service for history. Everything it needs is in these files.

## Month index

Every month is one integer: `m = (year - 2002) * 12 + (month - 1)`. January 2002 is 0.
`year = 2002 + Math.floor(m / 12)`, `month = m % 12 + 1`.

## meta.json

| Field | Meaning |
|---|---|
| `bbox` | `lat_min, lat_max, lon_min, lon_max` of the region |
| `cell`, `block` | cell size 0.1 degree, block size 0.5 degree |
| `aqua_months` | month indexes where the Aqua record is usable (data on at least 80% of days) |
| `est_months` | month indexes where the VIIRS-based estimate exists |
| `drift_from` | month index from which Aqua's overpass time has drifted (January 2023) |
| `viirs_sat` | the VIIRS satellite the estimate is made from (`N` is Suomi NPP) |
| `model`, `calibrated` | model in use, and whether it passed the test. If `calibrated` is false, label the estimate "uncalibrated" |
| `size_edges`, `intervals` | the interval table, see below |
| `test` | test results per model: `median_log_error`, `coverage`, `years`, `criteria` (C1, C2, C3, pass), `drift_years` |
| `criteria_definition` | the fixed thresholds for C1, C2, C3 |
| `static_cells` | `[i, j]` cells left out as persistent heat sources (industry, volcanoes) |
| `smoke` | `null` when there is no smoke data, else `first_month`, `min_days`, `aod_threshold` |

## cells.json

`{"i,j": [m, aqua, est10, m, aqua, est10, ...]}`

- `i = floor(lat / 0.1)`, `j = floor(lon / 0.1)`. The cell covers `i*0.1 .. (i+1)*0.1` in latitude.
- `aqua`: Aqua MODIS hot spots in that cell and month (confidence 30 or higher).
- `est10`: the Aqua-equivalent estimate made from VIIRS, times 10. Divide by 10.
- Months with nothing are left out. A missing month means zero.

## region.json

`{"months": [[m, aqua, est, lo, hi, rawN, rawN20, rawN21, rawTerra], ...]}`: totals for the whole region.
`aqua` is `null` where the Aqua month is not usable. `est`, `lo`, `hi` are `null` where there is no
estimate. The four raw counts are plain detection counts per satellite, for the explainer chart that
shows why adding satellites together is misleading.

## smoke.json (may be missing)

`{"bi,bj": [m, smoke_days, days, ...]}` per block, where `bi = floor(lat / 0.5)`, `bj = floor(lon / 0.5)`.
Only months with at least one smoke day are listed.

## How the page should compute things

For a chosen area and a month `m`:

1. Sum `aqua` and `est10 / 10` over the cells whose centre is inside the area.
2. The headline value is `aqua` when `m` is in `aqua_months`, otherwise `est`. Say which one it is.
3. Interval for an estimate `est` (only shown for estimates):
   ```js
   const bin = meta.size_edges.filter(e => est >= e).length;
   const [a, b] = meta.intervals[bin];
   const lo = Math.max(0, (est + 1) * Math.exp(a) - 1);
   const hi = (est + 1) * Math.exp(b) - 1;
   ```
4. Historical median for a calendar month: the median of the headline values of that calendar month
   over all earlier years that have a value.
5. Smoke: the month is smoky for the area when any block touching the area has
   `smoke_days >= meta.smoke.min_days`. Say "below normal" only when `meta.smoke` exists,
   `m >= meta.smoke.first_month`, and the month is not smoky. Otherwise say the count is low but
   smoke may have hidden fires, or that there is no smoke data.
6. CSV download: one row per month with `year, month, aqua, estimate, low, high, source, smoky`.

## Current state of the pack

Built on 14 November from the full record: 293 months, Aqua and Terra from July 2002, VIIRS from
January 2012, smoke from November 2015. 6 MB, 1.7 MB gzipped.
