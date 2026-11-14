# Team plan

Deadline: Sunday 15 November 2026, 23:59 WIB. Freeze: Sunday 18:00. First submission: Sunday 15:00.

How to read this: find your letter, work down your list in order. The table below is the only part
everyone needs to watch, because it lists the moments one person hands work to another.

## Hand-offs

| When | What | From | To |
|---|---|---|---|
| Sat 17:30 | `PACK.md` (data format) and a small sample pack | A | B |
| Sat night | Test result: pass or fail for C1, C2, C3, with numbers | A | C, D |
| Sun morning | Final data pack | A | B |
| Sun midday | Page running on the public host | B | C, D |
| Sun 15:00 | First "Submit for Judging" | D | all |
| Sun 18:00 | Freeze. Only fixes and re-submission after this | all | all |

## Who touches what

| Person | Area | Folders |
|---|---|---|
| A | Data and model | `pipeline/`, `tests/` |
| B | Web page | `web/` |
| C | Content and science writing | `DESIGN.md`, `README.md`, text files in `web/` agreed with B |
| D | Demo, hosting, submission | slides (outside the repo), deploy settings |

Stay in your folders. That is what keeps four people from breaking each other's work in git.

## A: data and model

1. Run the monthly tables and the harmonization test on real data. Report C1, C2, C3 as they come out.
2. Write `pipeline/pack.py`, `PACK.md` and a sample pack. Do this early: B is waiting for it.
3. Finish the aerosol fetch (smoke flag) and the MODIS fetch for 2002 to 2010.
4. Build the final pack. Keep it under about 8 MiB gzipped.
5. Give C and D the numbers: yearly error, interval coverage, record length, number of detections.
6. If time allows: Landsat cross-check.

## B: web page

Can start now with the sample pack. No need to wait for real data.

1. Skeleton in `web/`: map, draw a box, type latitude and longitude.
2. Monthly calendar (year by month) of hot spot counts for the chosen area.
3. "This month against the historical median" panel.
4. Date range selection and CSV download.
5. Smoke flag: say "below normal" only when smoke data exists and the air was clear.
6. Methods page and explainer page: layout only, text comes from C.
7. Check on a phone. If time allows: simple cards (haze now, fires in the last 24 hours).

## C: content and science writing

Does not depend on code. Start now.

1. Reference list. Every source must be cited: NASA GIBS, NASA FIRMS, Meteomatics, Open-Meteo, the map
   library, map tiles, fonts, icons. Missing citations can cost an award.
2. Explainer: why our number differs from BMKG, SiPongi+ and BRIN. Facts to use:
   - August 2026, high confidence only: SiPongi+ 9,409 and BRIN 9,587 for the same month.
   - BRIN, 1 to 5 September 2026: 2,109 high, 67,557 medium, 72,408 low confidence.
   - BMKG adds four satellites into one total and publishes an image, not data.
   - Source: Kompas, 7 September 2026. Link it.
3. Project page text in English: summary (50 to 200 words), project details, NASA data used, partner
   data and references, declaration of AI use.
4. Methods page text. Leave the pass or fail numbers blank until A reports them. Write them as they are.
5. Proofread the page once B has it on the host.

## D: demo, hosting, submission

Does not depend on code. Start now.

1. Check that all four members are registered on the team page. Read the Project Submission Guide.
2. Set up the public host with an empty page first (GitHub Pages is fastest). Confirm it serves gzip.
3. Slide outline, 7 slides at most, title slide counts: team and challenge, the problem, the solution,
   an image of the project, the user experience, how NASA open data makes it possible, the test result.
4. Screenshots once the page is up. No NASA logos. No AI-generated images without a watermark.
5. Open every link in a private window before submitting.
6. Submit at 15:00 on Sunday, then press "Submit for Judging" again after each later edit.

## If time runs out

Drop first: Landsat check, compare tab, simple cards.
Never drop: monthly calendar, CSV download, honest test result, citations, the demo.
