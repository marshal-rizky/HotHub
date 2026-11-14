# Content specification (person C)

Everything written that a judge or a user will read. All of it in English. Facts and numbers come from
[DESIGN.md](DESIGN.md) and from `web/data/sea/meta.json`; do not write a number that is not in one of
those two places. If a number you need is missing, ask A.

## Rules for every text

- **Say what was measured, not more.** A hot spot is a heat anomaly seen by a satellite. It is not a
  confirmed fire, and we never say who lit it or why.
- **Report the test as it is.** The size model passes; the monthly model fails; the pass on C1 is
  narrow; NOAA-20 calibration failed. All four go in.
- **Plain words.** Short sentences. Explain a term the first time it appears. A journalist, not a
  remote sensing scientist, is the reader.
- **Name no company, facility or person** as a heat source.
- **No NASA logo** and no wording that suggests NASA endorses the project.
- **Cite everything** (item 1). Missing citations can cost an award.

## Deliverables

| # | What | Where it goes | Length | Needed by |
|---|---|---|---|---|
| 1 | Reference list | Project page "References" field, page footer, README | complete | Sat 22:00 |
| 2 | High-level summary | Project page | 50 to 200 words (hard limit) | Sun 09:00 |
| 3 | Project details | Project page | 400 to 700 words | Sun 11:00 |
| 4 | "Why numbers differ" text | `web/` section, sent to B | 150 to 250 words | Sun 08:00 |
| 5 | Methods text | `web/` section, sent to B | 300 to 450 words | Sun 08:00 |
| 6 | NASA data and partner data fields | Project page | 80 to 150 words each | Sun 11:00 |
| 7 | AI use declaration | Project page drop-down and text, page footer | 2 to 4 sentences | Sun 11:00 |
| 8 | Short interface texts | sent to B | see item 8 | Sun 08:00 |
| 9 | Slide wording review | with D | 7 slides | Sun 13:00 |
| 10 | Proofread the live page | with B | whole page | Sun 14:00 |

Write items 4, 5 and 8 as plain text files in `web/text/` (one file per item) so B can paste them.

## 1. Reference list

One line each: name, who provides it, link, what we used it for. Start from this and add whatever B and
D introduce (map library, tiles, fonts, icons, slide template, images):

- NASA GIBS: VIIRS 375 m thermal anomalies (Suomi NPP, NOAA-20, NOAA-21) and MODIS combined thermal
  anomalies (Aqua, Terra). Source of every hot spot.
- NASA FIRMS: the active fire products behind those layers; map key service.
- Meteomatics: aerosol optical depth at 550 nm, used for the smoke flag (Space Apps participant offer).
- Open-Meteo: only if the haze card is built.
- Leaflet and OpenStreetMap contributors: map library and map tiles.
- Kompas, 7 September 2026, article on differing hot spot numbers between agencies.
- BMKG, SiPongi+ (Ministry of Forestry) and BRIN hot spot pages, as the tools we compared with.
- Python standard library and pytest. Claude (AI coding assistant), see item 7.

Ask B and D on Sunday morning: "Did you add any library, font, icon or image?" Then update.

## 2. High-level summary (50 to 200 words)

Must answer three questions in this order: what did we build, how does it answer the challenge, why
does it matter. Include one number that shows the problem (raw detections in our region doubled between
2015 and 2026 because three VIIRS satellites now fly, while Aqua-equivalent counts did not) and one
that shows the proof (test on hidden years: yearly totals within 0% to +10%). Count the words.

## 3. Project details (400 to 700 words)

Use these headings: What it does. How it works. How we tested it. What it does not do. What we used.
What comes next. Under "How we tested it" give the table from DESIGN.md 6.9 in words, including the
failed model. Under "What it does not do" use DESIGN.md 6.11.

## 4. "Why numbers differ" (150 to 250 words)

The reader has seen three official numbers for the same month and does not know which to believe.
Cover, in this order:

1. Agencies count differently, and all can be right. August 2026, high confidence only: SiPongi+ 9,409,
   BRIN 9,587 (Kompas, 7 September 2026).
2. The confidence threshold changes the number by a factor of thirty. BRIN, 1 to 5 September 2026:
   2,109 high, 67,557 medium, 72,408 low.
3. Adding satellites together counts the same fire several times, and the total grows when a new
   satellite is launched. Point at the chart B builds next to this text.
4. What our number is: Aqua MODIS hot spots with confidence 30 or higher, per month, with VIIRS-only
   months converted into that unit, and persistent heat sources (industry, volcanoes) left out.
5. One closing sentence: our number is for comparing months and years, not for dispatching a fire crew.
   For today's fires use the agencies' tools.

Do not say any agency is wrong. Link the Kompas article.

## 5. Methods text (300 to 450 words)

B builds the result table from the data. You write the words around it. Sections:

- **What we convert.** VIIRS (Suomi NPP) counts into the count Aqua MODIS would have reported.
- **Why fire size matters.** VIIRS sees small, cool fires that MODIS misses, so the conversion depends
  on fire radiative power and on the share of high-confidence detections.
- **The test.** Trained on 2012 to 2019. Aqua hidden for 2020 to 2022 and rebuilt from VIIRS alone.
  Criteria fixed before the run: C1, C2, C3 as defined in DESIGN.md 6.7.
- **The result, with the weak points.** Size model passes all three; the pass on C1 is narrow (0.2705
  against a limit of 0.2727). The monthly ratio fails C1. A typical block-month estimate is off by
  about 30%, while yearly regional totals were within 0% to +10%.
- **Smoke flag.** A month is flagged when aerosol optical depth reached 1.0 on three or more days. The
  flag never changes a count. We do not say "below normal" for a smoky month.
- **Limits.** Copy the list in DESIGN.md 6.11 in plain words, all of it, including the failed NOAA-20
  calibration.
- **After 2022.** Aqua's overpass time drifts, so those years are shown apart and not used as proof.

## 6. NASA data and partner data fields

- **NASA data:** which layers (item 1), the period (July 2002 to November 2026), the volume (17,536
  daily files, 9.10 million detections), how we used them, and how they shaped the idea: the
  day-by-day, per-satellite record is what makes a hidden-years test possible.
- **Partner and other data:** Meteomatics for aerosol optical depth. Say plainly that it is a partner
  offer to participants, not a space agency data set. Everything else goes under references.

At least one NASA resource from the challenge page is required for global awards. We use two.

## 7. AI use declaration

State: an AI coding assistant (Claude, through Claude Code) helped write the pipeline code, the tests
and the documents; the team directed the work, chose the method and the pass criteria, and checked the
results; commits made with it carry a `Co-Authored-By` line; no AI-generated images, video or audio are
used. Select the matching entries in the project page drop-down. Keep the wording identical in the
project page, the page footer and the README.

## 8. Short interface texts

B needs these exact strings. Keep each under the length given.

| Key | Max length | Purpose |
|---|---|---|
| tagline | 90 characters | under the project name |
| source_aqua | 30 | "Observed by Aqua MODIS" |
| source_estimate | 45 | "Estimated from VIIRS (Suomi NPP)" |
| interval | 60 | "Likely between {low} and {high}" |
| uncalibrated | 80 | shown only if the model had failed its test |
| drift_note | 90 | "Aqua's overpass time has drifted since 2023." |
| running_month | 90 | why the current month is not shown |
| static_note | 90 | persistent heat source, not counted |
| no_data | 40 | month with no usable record |
| empty_area | 60 | area with no hot spots |
| status sentences | as in WEB-SPEC.md 6.6 | six sentences; you may reword, B must not |

The six status sentences carry the smoke rule. "Below normal" may appear only in the row "below, clear".

## 9. Slides (with D)

D builds, you check the words. Seven slides at most, title slide counts: team and challenge; the
problem (three agencies, three numbers); the idea (one unit, tested on hidden years); a picture of the
page; what a user does in 30 seconds; how NASA open data makes it possible; the test result and the
limits. One message per slide. No number that is not in DESIGN.md.

## 10. Proofread the live page

Read every word on the public link. Check: every number matches `meta.json` or DESIGN.md; no "fire"
where "hot spot" is meant; no claim of cause; no agency called wrong; all credits present; nothing in
Indonesian left on the page.

## Done means

- [ ] Reference list complete, confirmed with B and D, identical in three places.
- [ ] Summary is between 50 and 200 words.
- [ ] Every number traced to DESIGN.md or `meta.json`.
- [ ] Failed results appear: monthly model, NOAA-20, narrow C1.
- [ ] AI declaration identical in project page, footer and README.
- [ ] Texts for B delivered as files in `web/text/`.
