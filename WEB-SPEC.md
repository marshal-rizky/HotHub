# Web page specification (person B)

This is everything the page must do. The data format is in [PACK.md](PACK.md); the reasons behind the
numbers are in [DESIGN.md](DESIGN.md). Where this file and PACK.md disagree, tell A before coding.

**Revised 14 November, evening:** the map is now a 3D globe with a time slider, and the page has a
self-playing demo mode for the 30 second video. Section 15 describes both and overrides the map
details in sections 3, 5 and 7.2. Everything about numbers (sections 6, 8, 10, 14) is unchanged.

## 1. Outcome

One static page where a person picks an area in Indonesia and sees, for that area:

1. a monthly calendar of hot spot counts, 2002 to today, in one unit (Aqua-equivalent);
2. the latest complete month against the historical median;
3. a date range they can download as CSV;
4. a clear mark on every value saying whether it was observed by Aqua or estimated from VIIRS, and
   whether smoke may have hidden fires.

A judge should be able to open the link, click the map once, and understand the answer in 30 seconds.

## 2. Hard constraints

- **Static files only.** No server code, no build step, no framework. Plain HTML, CSS and JavaScript
  modules. It must work from any folder (GitHub Pages serves it under `/NASA/`), so use relative paths.
- **The page does no modelling.** It sums and ranks values from the pack. Never invent a number.
- **No keys or passwords** anywhere in `web/`.
- **English** for all text (submission rule).
- **No NASA logo or mission insignia.** No AI-generated images.
- **Every outside resource is cited** in the footer and reported to C: map library, tiles, fonts, icons.
- Stay inside `web/`. Do not edit `web/data/` by hand; A rebuilds it.

## 3. Files

| File | Holds |
|---|---|
| `web/index.html` | Markup for the whole page (sections shown and hidden, no second HTML file) |
| `web/style.css` | All styles |
| `web/calc.js` | Pure functions only: no DOM, no fetch. Everything in section 6 |
| `web/data.js` | Loads the four JSON files and builds the cell index |
| `web/app.js` | Map, events, rendering |
| `web/vendor/` | MapLibre GL JS (JS and CSS), copied in, with its licence file |
| `web/map3d.js`, `web/demo.js` | The 3D map layer and the demo tour (section 15) |
| `web/tests/calc.test.mjs` | Tests for `calc.js`, run with `node --test web/tests` |

Map: MapLibre GL JS, globe projection (section 15). Keep the attribution of the base map visible.

## 4. Data loading

Load `meta.json`, `region.json`, `cells.json`, `smoke.json` from `data/sea/` when the page opens
(`smoke.json` may be missing: treat as no smoke data). `cells.json` is 6 MB (1.7 MB gzipped): show a
"Loading data" state, and show a plain error message with a retry button if any load fails.

Build once after loading:

- For each key `"i,j"` in `cells.json`: centre latitude `(i + 0.5) * 0.1`, centre longitude
  `(j + 0.5) * 0.1`, and its triplets `[m, aqua, est10]`.
- `Set`s for `meta.aqua_months` and `meta.est_months`.
- `lastMonth` = the largest month index in either set. This is the **latest complete month**. The
  running month is left out of the pack on purpose, because a part-month would look quiet.
- `firstMonth` = the smallest month index in either set.

## 5. Choosing an area

Three ways, all ending in the same area object:

1. **Click the map** to set a point; the radius field applies (default 25 km). In top view a box can
   also be drawn (press, drag, release).
2. **Type a point and a radius:** latitude, longitude, radius in km (default 25, allowed 5 to 500).
3. **Preset buttons:** Riau, South Sumatra, Central Kalimantan, West Kalimantan, Papua (south), and
   "All Indonesia" (the whole box). Use simple boxes; exact borders are not needed.

Rules:

- A cell belongs to the area when its **centre** is inside. For a point and radius use great-circle
  distance.
- Reject input outside the region box (`meta.bbox`) with a message that names the allowed range.
- Reject non-numbers. Accept a comma or a point as decimal separator.
- The area is written into the page address (`#box=lat1,lon1,lat2,lon2` or `#pt=lat,lon,km`) so a link
  reproduces the view. Read it on load.
- An area with no cells is valid: every month is zero. Say "No hot spots recorded here" and still show
  the calendar.
- Show the area on the map, and show how many 0.1 degree cells it holds.
- Mark `meta.static_cells` inside the area with a small grey marker and the tooltip "Persistent heat
  source (industry or volcano), not counted". Name no facility.

## 6. Calculations (`calc.js`)

All functions take plain data and return plain data.

### 6.1 Month index
`m = (year - 2002) * 12 + (month - 1)`. Provide `toYearMonth(m)` and `toIndex(year, month)`.

### 6.2 Series for an area
For every month from `firstMonth` to `lastMonth`:

- `aqua` = sum of `aqua` over the area's cells; `est` = sum of `est10 / 10`.
- `source`:
  - `"aqua"` when `m` is in `aqua_months`. Headline `value = aqua`.
  - `"estimate"` when it is not, and `m` is in `est_months`. Headline `value = est`, with an interval.
  - `"none"` otherwise. `value = null`. Show as "no data", never as zero.
- `drift` = `source === "aqua" && m >= meta.drift_from`.

### 6.3 Interval (estimates only)
```js
const bin = meta.size_edges.filter(e => est >= e).length;
const [a, b] = meta.intervals[bin];
const low = Math.max(0, (est + 1) * Math.exp(a) - 1);
const high = (est + 1) * Math.exp(b) - 1;
```
Round displayed counts to whole numbers. Keep one decimal in the CSV.

### 6.4 Normal for a calendar month
For a month `m`, take the headline values of the same calendar month in all **earlier** years that have
a value.

- Fewer than 5 such years: `status = "short"` ("History too short to say what is normal").
- Otherwise compute the median, the 25th and the 75th percentile (linear interpolation).
  - `value > p75`: `"above"`. `value < p25`: `"below"`. Else `"near"`.
- Also return `ratio = value / median` when the median is above zero.

### 6.5 Smoke
A block is `"bi,bj"` with `bi = floor(lat / 0.5)`, `bj = floor(lon / 0.5)`. The blocks of an area are
the blocks that contain at least one of its cells.

- `meta.smoke` is null, or `m < meta.smoke.first_month`: `smoke = "nodata"`.
- Any block of the area has `smoke_days >= meta.smoke.min_days` in month `m`: `smoke = "smoky"`.
- Else `smoke = "clear"`.

### 6.6 The sentence about "below normal"
This rule is the point of the smoke flag. Do not simplify it.

| Status | Smoke | Text |
|---|---|---|
| above | any | "Above normal for this month." |
| near | any | "Near normal for this month." |
| below | clear | "Below normal for this month." |
| below | smoky | "Low count, but thick smoke was present and may have hidden fires." |
| below | nodata | "Low count. No smoke data for this period, so hidden fires cannot be ruled out." |
| short | any | "History too short to say what is normal." |

### 6.7 Calendar colour
For a cell of the calendar, rank its value among the values of the same calendar month across all
years for this area: `rank = (number of values below it) / (number of values - 1)`. Map to five steps
of one colour, light to dark. Zero is always the lightest step. "No data" is a grey hatch, not a
colour step.

## 7. What is on the page

Top to bottom on a phone; map left and panels right on a wide screen.

### 7.1 Header
Project name, one line saying what it is ("One monthly hot spot count for Indonesia, 2002 to today,
comparable across MODIS and VIIRS"), links to Methods and "Why numbers differ".

### 7.2 Map and area controls
Section 5. Start on "All Indonesia" so the page is never empty.

### 7.3 Latest month panel
- Month name and year of `lastMonth`, the headline value in large type, and its source in words:
  "Observed by Aqua MODIS" or "Estimated from VIIRS (Suomi NPP)".
- For an estimate: "likely between LOW and HIGH" (the 80% interval). If `meta.calibrated` is false, add
  the word "uncalibrated".
- The median of that calendar month, the ratio ("1.8 times the median"), and the sentence from 6.6.
- A smoke line: "Thick smoke present", "Air clear" or "No smoke data".
- A small note: "The running month is not shown until it is complete."

### 7.4 Monthly calendar
- Rows are years (newest on top), columns are January to December. Colour by 6.7.
- A small corner mark on estimated months, a dot on smoky months, a hatch for no data. Put all three in
  a legend with the colour scale.
- Tap or hover a cell: month, value, source, interval if estimated, median and status, smoke state.
  When `drift` is true add: "Aqua's overpass time has drifted since 2023."
- Clicking a cell selects it as the month shown in 7.3.

### 7.5 Date range and download
- Two month pickers, "from" and "to", limited to `firstMonth` .. `lastMonth`. Default: the full record.
- A line chart of the headline value over the range, with the interval drawn as a band on estimated
  months. Plain SVG or canvas is enough. No chart library is needed.
- Total and peak month for the range.
- **Download CSV** button. File name `hotspots_<area>_<fromYYYYMM>_<toYYYYMM>.csv`.

CSV columns, one row per month, empty field when there is no value:

`year,month,aqua,estimate,low,high,headline,source,drift,smoke,median,status`

Put no comment lines in the file. Show under the button, as page text, the area definition and the
sentence "Aqua-equivalent hot spots, Aqua MODIS confidence 30 or higher; estimate from Suomi NPP VIIRS".

### 7.6 Why numbers differ (section, not a new page)
- One chart from `region.json`: raw detections per satellite per year (Suomi NPP, NOAA-20, NOAA-21,
  Terra) stacked, against the Aqua-equivalent series as a line. The point: the stack grows when
  satellites are launched; the line does not.
- Text comes from C. Leave a marked placeholder until it arrives.

### 7.7 Methods (section, not a new page)
Build the test table from `meta.test`, do not type numbers by hand: one row per model with median log
error, interval coverage, yearly errors, and pass or fail for C1, C2, C3 from `criteria`. Show the
thresholds from `meta.criteria_definition`, the training and test years, `meta.generated`, and the
smoke rule. A failed criterion is shown as failed, in the same weight as a pass. Text around the table
comes from C.

### 7.8 Footer
Data sources and credits (list from C), the sentence on AI use, link to the repository.

## 8. States and errors

| Situation | What the person sees |
|---|---|
| Data loading | "Loading data" in place of the panels; map already usable |
| A file fails to load | Plain message naming the problem, and a retry button |
| `smoke.json` missing | Everything works; smoke shows "No smoke data" |
| Coordinates outside the box or not numbers | Message next to the field, area unchanged |
| Area with no cells | Zeros, "No hot spots recorded here" |
| Month with no value | Hatched cell, "no data", left out of medians |

Never show `NaN`, `null` or `undefined`.

## 9. Quality bar

- **Phone first.** Usable at 360 px wide. The calendar may scroll sideways inside its own box; the page
  itself must not.
- **Speed.** Changing the area updates everything in under half a second on a mid-range phone. Sum only
  the area's cells; do not loop over all 20,000 cells for every month.
- **Colour.** One sequential scale that works for colour-blind readers. Never rely on colour alone:
  source and smoke also have a shape mark and a text label.
- **Keyboard.** Every control reachable by Tab; calendar cells focusable; visible focus ring.
- **Light and dark** follow the device setting if time allows. Light only is acceptable.

## 10. Tests (`node --test web/tests`)

Cover `calc.js` with a tiny hand-made pack (three cells, a few months):

- month index both ways, including December and January;
- box and point-radius selection, a cell exactly on the edge, an empty area;
- series: source `aqua`, `estimate` and `none`; `none` is not zero;
- interval for each size bin, never below zero;
- normal: fewer than 5 years gives `short`; above, near, below; only earlier years are used;
- smoke: `nodata` before `first_month`, `smoky` at the threshold, `clear` below it;
- every row of the table in 6.6;
- calendar rank with ties and with a single value;
- CSV: header, empty fields for missing values, one decimal.

Check against the real pack by hand, "All Indonesia" (the whole box): your sum of `aqua` over all cells
must equal the `aqua` value in `region.json` for the same month. Reference values are in section 14.

## 11. Order of work

| Step | Done when | Target |
|---|---|---|
| 1 | Data loads; presets and typed point work; latest month panel shows the right number (flat map is fine) | Sat 21:00 |
| 2 | Monthly calendar with marks and tooltip | Sat 23:30 |
| 3 | Date range, chart, CSV | Sun 01:00 |
| 4 | Smoke sentence, Methods table from `meta.test`, "Why numbers differ" chart | Sun 09:00 |
| 5 | 3D columns, time slider, smoke layer, 2D fallback (section 15) | Sun 11:00 |
| 6 | Phone check, keyboard check, link sharing, texts from C in place; on the public host | Sun 13:00 |
| 7 | Demo mode `?demo=1`, recorded at 1080p | Sun 15:00 |

Push after every step, even if rough. D and C need something to look at early.

## 12. Not in scope

Weekly or daily views, several areas at once, a forecast, user accounts, an AI assistant, a second
region, live calls to FIRMS or Meteomatics. Simple cards (haze now, fires in the last 24 hours) only
after step 6 is done.

## 13. Done means

- [ ] A fresh browser opens the public link and shows numbers without any setup.
- [ ] Map click, typed coordinates and presets all give an area.
- [ ] Calendar, latest month panel, date range and CSV agree with each other for the same month.
- [ ] Every value says "observed" or "estimated"; estimates show an interval.
- [ ] "Below normal" never appears for a smoky month or a month without smoke data.
- [ ] Methods table matches `meta.json`, including any failed criterion.
- [ ] Works on a phone. No horizontal page scroll.
- [ ] `node --test web/tests` passes.
- [ ] All outside resources are listed in the footer and sent to C.

## 14. Reference values from the real pack (14 November)

Use these to check your code. Area: the whole box.

| Month | Index `m` | Aqua | Estimate | Source the page must show |
|---|---|---|---|---|
| October 2006 | 57 | 28,958 | none (before VIIRS) | aqua |
| September 2015 | 164 | 37,352 | about 34,919 | aqua |
| September 2019 | 212 | 23,978 | about 22,771 | aqua |
| August 2020 | 223 | not usable (Aqua outage) | present | **estimate** |
| April 2022 | 243 | not usable (Aqua outage) | present | **estimate** |
| October 2026 | 297 | 24,268 | about 25,259 | aqua |

- `firstMonth` is 6 (July 2002). `lastMonth` is 297 (October 2026). Estimates start at 121 (February
  2012).
- August 2020 and April 2022 are the two months in the record where the page shows an estimate today.
  They are the live example of what happens to every month after MODIS ends. Make sure they look right.
- Estimates summed from cells differ from `region.json` by a few units because of rounding to one
  decimal per cell. That is expected.

## 15. 3D map, time slider and demo mode

The map is the centre of the page. Numbers stay in flat panels beside it: a calendar, a median and a
CSV file are read and compared, and 3D makes that harder. The map answers "where and how much"; the
panels answer "exactly how many, and is that normal".

Build order matters: sections 6 and 7 must work first on a flat map. Then add the layers below.

### 15.1 Globe and base map
- MapLibre GL JS with globe projection. Check the current MapLibre documentation for the exact API of
  your version; do not write it from memory.
- Start centred on Indonesia, pitched about 45 degrees. The person can rotate, tilt and zoom.
- A **Top view** button sets pitch and bearing to zero. Box drawing is offered only in top view.
- Base map: try NASA GIBS Blue Marble raster tiles first (it is NASA data and fits the theme). This has
  not been tested. If it does not work within 30 minutes, use OpenStreetMap raster tiles. Cite
  whichever is used and tell C.

### 15.2 Hot spot columns
- One column per 0.1 degree cell for the **selected month**. Height is the cell's headline value for
  that month (Aqua count, or the estimate where the month has no usable Aqua). Draw nothing for zero.
- **One height scale for the whole map and the whole record**, shown in a legend. Never rescale per
  month or per area to make a view look dramatic. Use a square-root scale so small values stay visible,
  and say so in the legend.
- Colour: the same five-step scale as the calendar (6.7), computed per cell against the same calendar
  month in other years. Cells with too little history use a neutral colour.
- When zoomed far out, merge cells into 0.5 degree blocks (sum the values) so the map stays fast.
- Draw only the selected month. The pack has about 20,000 cells but a single month has far fewer.
- Hover or tap a column: place (latitude, longitude), value, source, and the status sentence.
- Persistent heat sources (`meta.static_cells`) are flat grey markers, never columns.

### 15.3 Time slider
- A slider over `firstMonth` .. `lastMonth` with the month and year shown large, plus play and pause.
- Playing advances one month about every 150 ms. The columns, the latest month panel and the
  highlighted calendar cell all follow the slider.
- Clicking a calendar cell moves the slider. Arrow keys step one month.

### 15.4 Smoke layer
A translucent grey cap over each 0.5 degree block that is smoky in the selected month (6.5), drawn
above the columns. Before `meta.smoke.first_month` show a small label "No smoke data before November
2015". A toggle turns the layer off. Default is on.

### 15.5 Fallback
- If WebGL is missing, the screen is narrower than 600 px, or the device reports reduced motion, show
  a flat map: the same data as coloured squares, no pitch, no autoplay.
- A visible switch lets the person choose 2D or 3D on any device.
- Every number, sentence and download is identical in both modes.

### 15.6 Demo mode (`?demo=1`)
The page plays a fixed 30 second tour by itself, for the demo video. It uses the real page and the
real data; nothing is faked. Controls are hidden, captions are large, and the tour ends on a still
frame.

| Seconds | On screen | Caption |
|---|---|---|
| 0 to 4 | Globe turns to Indonesia | Project name, team, challenge |
| 4 to 12 | Slider runs 2002 to 2026, columns rise and fall | "Twenty-four years of hot spots, in one unit" |
| 12 to 18 | Chart from 7.6: raw detections per satellite against the Aqua-equivalent line | "More satellites, not more fire" |
| 18 to 25 | Fly to Riau, September 2019, smoke layer on, calendar visible | "Low counts under smoke are flagged, not trusted" |
| 25 to 30 | Test result in one line, the site address | "Tested on hidden years" |

- Captions are short English text from C. No voice is needed.
- The tour is a list of timed steps in `demo.js` (time, camera, month, caption), so D can adjust it
  without touching the rest.
- Record on a desktop at 1920 by 1080, 60 frames per second, and trim to 30 seconds or less.
- The tour must not start unless `?demo=1` is in the address.

### 15.7 Done means, for this section
- [ ] The same month gives the same numbers in 3D, in 2D and in the panels.
- [ ] One fixed height scale with a legend.
- [ ] Playing the slider is smooth on a desktop and does not freeze a phone (fallback takes over).
- [ ] `?demo=1` runs start to finish with no input and takes 30 seconds or less.
- [ ] Base map and library are cited.
