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

## Status on 14 November, 16:30

Done:

- `pipeline/fetch.py`, `grid.py`, `celldays.py`, `harmonize.py`, `aod.py`, `pack.py`. 44 tests pass.
- Detections fetched: Suomi NPP, NOAA-20 and NOAA-21 complete; MODIS from June 2010.
- First run of the test on real data: the size model passes C1, C2 and C3, the monthly ratio fails
  C1. Numbers are in DESIGN.md section 6.9.
- First data pack in `web/data/sea/` (5 MB, 1.4 MB gzipped). Format in PACK.md.
- Team plan in TEAM.md.

Running: aerosol fetch (75 of 132 months done earlier), then MODIS 2002 to mid-2010.

Not done yet: the web page, the smoke file in the pack, the rerun on the full record, NOAA-20
calibration, deploy, slides, project page text.

Things that went wrong and what we changed:

- The data service was unreachable for a while. The fetch now waits and retries, and records failed days.
- Two fetch processes wrote the same file. The write now tolerates that.
- The build machine has 3.4 GB of memory and the system stopped our jobs. Tables are now built one
  year at a time.

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
