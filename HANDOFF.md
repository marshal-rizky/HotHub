# Hand-off: state of the work on 14 November 2026, evening

Read this first when you pick the project up on another machine or in a new session. It says what is
done, what is decided and why, what is not in git, and what to do next. Details are in the linked
files; this file only carries what those files do not say.

## 1. Where things stand

| Part | State |
|---|---|
| Fetch (`pipeline/fetch.py`) | Done. Full record cached: 17,536 day files, 9.10 million detections, July 2002 to November 2026 |
| Monthly tables (`pipeline/celldays.py`) | Done. One year in memory at a time |
| Harmonization (`pipeline/harmonize.py`) | Done. Size model passes all three criteria on hidden years 2020 to 2022 |
| Smoke flag (`pipeline/aod.py`) | Done. 132 months from 21 November 2015 |
| Data pack (`pipeline/pack.py`) | Done and committed: `web/data/sea/` (6 MB, 1.7 MB gzipped, 20,552 cells) |
| Tests | 45 pass: `python -m pytest tests -q` |
| Web page | **Not started.** `web/` holds only the data pack |
| Hosting, slides or video, project page text | Not started |

Deadlines (WIB): first submission Sunday 15 November 15:00, freeze 18:00, hard deadline 23:59.

## 2. Next step

Build the web page from [WEB-SPEC.md](WEB-SPEC.md) and [PACK.md](PACK.md). The page needs **only**
the committed pack in `web/data/sea/`. It does not need the raw data, the pipeline, Python or any key.

Order (WEB-SPEC section 11): numbers right on a flat map first, then calendar, chart and download,
then the 3D layer (section 15), then demo mode `?demo=1` for the 30 second video.

Check every number against WEB-SPEC section 14 (reference values from the real pack) before adding
anything visual.

## 3. Decisions already made (do not reopen without a reason)

| Decision | Reason |
|---|---|
| Indonesia only | One team, one weekend; the local tools and their weak points are known (DESIGN.md section 1) |
| Unit is "Aqua MODIS hot spots per month" | Aqua is the long, stable record; VIIRS is converted to it, not the other way round |
| Each satellite fitted on its own, never pooled | Pooling hides how many satellites were in orbit, and that number changes |
| Size model (isotonic curve per fire-size class) is the model shown | It is the only one that passes criterion 1. The pass is narrow (0.2705 against a limit of 0.2727) and the page says so |
| Monthly-ratio model reported as failed | It failed criterion 1 on hidden years. Reported, not hidden |
| NOAA-20 not used for estimates | Direct calibration failed the test and drifts 13 to 27 percent low in 2023 to 2026 |
| Smoke flag fails closed | A low count under heavy smoke is shown as "not trusted", never as "below normal" |
| Persistent heat sources removed, never named | 17 cells; the page names no facility or company |
| Static page, no server, no key in the browser | Works on any host and cannot leak a credential |
| 3D globe for the map, flat panels for numbers | The map shows where and how much; exact numbers must stay readable and comparable |
| One fixed height scale on the map | Rescaling per view would make quiet months look like disasters |
| Demo video is the real page in `?demo=1`, screen-recorded | Nothing is faked; no AI video is used |

## 4. What is not in git

| Thing | Where it lives | Needed for |
|---|---|---|
| `.env` with `FIRMS_MAP_KEY`, `METEOMATICS_USER`, `METEOMATICS_PASS` | One folder above the repo on the first machine | Only re-running the pipeline |
| `data/raw/`, `data/out/` (cached detections and tables) | First machine | Only re-running the pipeline |

Move these by hand (USB stick, password manager) if the pipeline must run elsewhere. Never commit
them, never paste them into a chat, and never put a credential in `web/`. The web page does not need
any of them.

## 5. Rules that bind every change

Submission rules (from the local technical meeting):
- A working demo is required, behind one public link.
- At most 7 slides (the title slide counts) **or** a video of at most 30 seconds.
- Everything linked from the project page is in English.
- Summary of 50 to 200 words. Every data source, library and tool is cited.
- AI use is declared. AI-made images carry a watermark. No NASA logos.
- Resubmitting is allowed, but "Submit for Judging" must be pressed again each time.

House rules:
- Report results as they are: the narrow pass, the failed models and the limits stay in the text.
- Before each commit, check that no credential and no `data/` file is staged.
- Docs in this repo are in English and name no other team.

## 6. Traps already met

| Trap | What to do |
|---|---|
| GIBS returns 400 for a day with no data, sometimes transiently | Fetch retries; a 404 on a tile means an empty tile |
| GIBS dates between 2022-03-01 and 2022-06-14 use slashes | Handled in `fetch.py` |
| Two fetch processes writing the same day on Windows | Handled: the loser drops its temporary file |
| Low-memory machine kills long jobs | `celldays.py` holds one year at a time; do not load the whole record |
| Windows shell: one command over about 8,000 characters fails with a quoting error | Write long files in several smaller commands |
| `.gitignore` pattern `data/` also hides `web/data/` | The pattern is `/data/` (top level only) |
| The running month is not in the pack | By design; the page uses `lastMonth`, the last complete month |
| Aqua unusable in August 2020 and April 2022 | The page shows the estimate for those months and labels it |
| Smoke data starts 21 November 2015 | Earlier months show "no smoke data", not "no smoke" |

## 7. Open items

- Product name is not confirmed. Ask the team before it goes on the page.
- Host: a GitHub Pages workflow (`.github/workflows/pages.yml`) deploys `web/` on every push to
  `main` that touches it. Pages must be switched on in the repository settings (source: GitHub
  Actions). Not yet confirmed live.
- NASA GIBS Blue Marble as base map is untested (WEB-SPEC 15.1 gives the fallback).
- NOAA-20 standby through Suomi NPP (for the day Aqua and Suomi NPP stop) is described in DESIGN.md
  but not built. Cut it if time is short.
- Project page text, slides or video, references list: person C and D ([TEAM.md](TEAM.md)).

## 8. File map

| File | Read it for |
|---|---|
| [README.md](README.md) | What the project is, results table, how to run |
| [DESIGN.md](DESIGN.md) | Method, results, limits, weak points of existing tools |
| [PACK.md](PACK.md) | Format of the data pack and how the page computes from it |
| [WEB-SPEC.md](WEB-SPEC.md) | Full specification of the web page, including the 3D map and demo mode |
| [TEAM.md](TEAM.md) | Who does what, hand-offs, cut list |
| [PLAN.md](PLAN.md) | Schedule and submission checklist |
