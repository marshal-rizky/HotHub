# Content specification (person C)

Everything written that a judge or a user will read, in English. Revised after reading a 2025 winning
project page: it was short. One paragraph of summary, one paragraph of details, a specific AI statement
and links. So: **write little, make every sentence carry a fact, and put the effort into the demo.**

Facts and numbers come from [DESIGN.md](DESIGN.md) and `web/data/sea/meta.json`. Do not write a number
that is not in one of those. The long explanations stay in the repository; the project page links to it.

## Where the effort goes

| Share of your time | What |
|---|---|
| 40% | The demo with D: the story, the wording of 7 slides, the screenshots |
| 25% | Project page fields (items 2 to 6) |
| 20% | Texts inside the web page (items 7 to 9) |
| 15% | Reference list (item 1) and the final proofread (item 10) |

## Rules for every text

- **Say what was measured, not more.** A hot spot is a heat anomaly seen by a satellite, not a confirmed
  fire. We never say who lit it or why. Name no company or facility.
- **One honest sentence about the test** wherever results are mentioned: what passed, and that one model
  failed. Do not hide it and do not write a paragraph about it.
- **Plain words, short sentences.** The reader is a journalist, not a remote sensing scientist.
- **No NASA logo**, no wording that suggests NASA endorses the project. Do not call any agency wrong.

## Deliverables

| # | What | Where | Length | Needed by |
|---|---|---|---|---|
| 1 | Reference list | Project page, page footer, README | complete | Sat 22:00 |
| 2 | Summary | Project page | 100 to 150 words, one paragraph (limit 200) | Sun 09:00 |
| 3 | Project details | Project page | 120 to 200 words, one paragraph | Sun 09:00 |
| 4 | Use of AI | Project page, page footer | 80 to 150 words, specific | Sun 09:00 |
| 5 | NASA data | Project page | 2 to 4 sentences plus links | Sun 09:00 |
| 6 | Partner and other data | Project page | 1 to 2 sentences plus links | Sun 09:00 |
| 7 | "Why numbers differ" | `web/text/`, for B | 80 to 120 words | Sun 08:00 |
| 8 | Methods text | `web/text/`, for B | 120 to 180 words | Sun 08:00 |
| 9 | Short interface texts | `web/text/`, for B | table below | Sun 08:00 |
| 10 | Slides wording and proofread | with D and B | 7 slides, whole page | Sun 14:00 |

## 1. Reference list

One line each: name, provider, link, what we used it for. Missing citations can cost an award.

- NASA GIBS: VIIRS 375 m thermal anomalies (Suomi NPP, NOAA-20, NOAA-21) and MODIS combined thermal
  anomalies (Aqua, Terra).
- NASA FIRMS: the active fire products behind those layers.
- Meteomatics: aerosol optical depth at 550 nm, for the smoke flag.
- Leaflet, and OpenStreetMap contributors: map library and map tiles.
- Kompas, 7 September 2026: article on differing hot spot numbers between agencies.
- BMKG, SiPongi+ and BRIN hot spot pages: the tools we compared with.
- Python standard library, pytest. Claude (AI coding assistant).

Ask B and D on Sunday morning whether they added a library, font, icon or image, and update.

## 2. Summary (100 to 150 words)

One paragraph, in this order: what we built, how it answers the challenge, why it matters. Use exactly
two numbers:

- the problem: raw detections in our region doubled between 2015 and 2026 because three VIIRS
  satellites now fly, while the Aqua-equivalent count did not;
- the proof: with Aqua hidden for 2020 to 2022, yearly totals rebuilt from VIIRS were within 0% to +10%.

## 3. Project details (120 to 200 words)

One paragraph: what a user does (pick an area, read the calendar, download CSV), how it works in one
sentence (VIIRS counts converted to Aqua-equivalent using fire size), how it was tested in one sentence
(criteria fixed in advance; the fire-size model passed, a simpler monthly ratio failed), the tools
(Python, plain JavaScript, Leaflet), and a link to DESIGN.md for the rest.

## 4. Use of AI (80 to 150 words)

The winning page was most specific here. Say which tool did what:

- Claude (through Claude Code) helped write the pipeline code, the tests and the documents.
- The team chose the method, fixed the pass criteria before the test, and checked the results.
- Commits made with it carry a `Co-Authored-By` line.
- No AI-generated images, video or audio. (Change this line if D uses any, and add the watermark.)

Select the matching entries in the drop-down. Use the same wording in the page footer.

## 5 and 6. Data fields

- **NASA data:** the GIBS layers and FIRMS, July 2002 to November 2026, 9.1 million detections; one
  sentence on how the per-satellite daily record made a hidden-years test possible. Links.
- **Partner and other data:** Meteomatics aerosol optical depth (a partner offer to participants), and
  the rest of the reference list.

## 7. "Why numbers differ" (80 to 120 words)

Sits next to a chart, so the chart does the work. Four points: agencies publish different numbers for
the same month (August 2026: SiPongi+ 9,409, BRIN 9,587); the confidence threshold changes the number
thirty-fold; adding satellites counts a fire several times and grows with each launch; our number is
one unit, for comparing months and years, not for dispatching a fire crew. Link the Kompas article.

## 8. Methods text (120 to 180 words)

B builds the result table from the data. You write five short lines around it: what we convert; why
fire size matters; the test (trained 2012 to 2019, Aqua hidden 2020 to 2022, criteria fixed first); the
result with its weak points (pass on C1 is narrow; monthly ratio failed; NOAA-20 not calibrated); the
smoke rule. End with a link to DESIGN.md section 6.11 for the full list of limits.

## 9. Short interface texts

| Key | Max length | Purpose |
|---|---|---|
| tagline | 90 characters | under the project name |
| source_aqua | 30 | "Observed by Aqua MODIS" |
| source_estimate | 45 | "Estimated from VIIRS (Suomi NPP)" |
| interval | 60 | "Likely between {low} and {high}" |
| drift_note | 90 | Aqua's overpass time has drifted since 2023 |
| running_month | 90 | why the current month is not shown |
| static_note | 90 | persistent heat source, not counted |
| no_data, empty_area | 60 each | month with no record; area with no hot spots |
| status sentences | WEB-SPEC.md 6.6 | six sentences; you may reword, B must not |

"Below normal" may appear only in the row "below, clear".

## 10. Slides and proofread

Seven slides at most, title slide counts, one message and few words per slide: team and challenge; the
problem (three agencies, three numbers); the idea (one unit, tested on hidden years); a picture of the
page; what a user does in 30 seconds; how NASA open data makes it possible; the result and its limits.

Then read every word on the live page: numbers match `meta.json`; "hot spot", not "fire"; no claim of
cause; all credits present; nothing left in Indonesian.

## Done means

- [ ] Each project page field fits in one screen without scrolling.
- [ ] Summary is under 200 words; every number traced to DESIGN.md or `meta.json`.
- [ ] The failed model is mentioned once on the project page and once in Methods.
- [ ] AI statement names the tool and what it did; same wording in the footer.
- [ ] Reference list confirmed with B and D.
- [ ] Texts for B are files in `web/text/`.
