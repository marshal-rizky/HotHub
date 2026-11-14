# Plan and status

NASA Space Apps Challenge 2026, challenge "Harmonization of MODIS and VIIRS Hot Spots".
Submission deadline: Sunday 15 November 2026, 23:59 WIB.

## Schedule

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

## Status on 14 November, afternoon

Done:

- `pipeline/grid.py`: grid, channels, activity rules.
- `pipeline/fetch.py`: GIBS fetch with a per-day cache, gap and empty-day logs, back-off on network
  errors, and an audit mode.
- `pipeline/celldays.py`: monthly tables and persistent heat sources.
- `pipeline/harmonize.py`: baseline, two models, intervals, scoring against C1 to C3. Written and
  tested on synthetic data only. It has not been run on real data yet.
- 35 tests pass (`python -m pytest tests -q`).
- Fetch is running. NOAA-21 is complete (from 2024-08-13). MODIS, Suomi NPP and NOAA-20 are still
  being fetched.

Not done yet: the run of the test on real data, aerosol fetch, data pack, the web page, deploy.
No validation numbers exist yet.

Before fitting: check `gaps.txt`, `failed.txt` and `empty_days.txt`, run `fetch.py --audit`, and run
the fetch once more to fill days lost to the GIBS outage.

## Submission checklist (from the Jakarta technical meeting)

- Deadline: 15 November 2026, 23:59 WIB. Edits after a submission need "Submit for Judging" again.
- Demo is required and is one public link: at most 7 slides (a title slide counts) or a video of at
  most 30 seconds. Test the link in a private window.
- Slides should show: team name, member names, challenge, an image of the project, the user experience,
  and how space agency open data makes the solution possible.
- Project page in English: high-level summary (50 to 200 words), project details, NASA data used,
  partner data and references, link to the project.
- At least one NASA resource from the challenge is needed for global awards. We use GIBS and FIRMS.
- Every source must be cited, including open source code, map tiles, fonts and images.
- Use of AI tools is allowed and must be declared on the project page. No NASA logos or mission
  identifiers in generated content. Generated images need a visible watermark.
- All team members must be registered on the team page before submissions close.
