# Hand-off: state of the work on 15 November 2026

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
| Tests | 45 pipeline tests: `python -m pytest tests -q`. 24 web tests: `node --test web/tests` |
| Web page | **Built and committed** in `web/` (commit 8d5d157). See WEB-SPEC.md section 16 for what it does and where it differs from the spec |
| Hosting | The Pages workflow is committed; not confirmed live |
| Slides or video, project page text | Not started. `?demo=1` plays the 30 second tour on the real page; it still has to be recorded |

Deadlines (WIB): first submission Sunday 15 November 15:00, freeze 18:00, hard deadline 23:59.

## 2. Next step

The page is built. What is left, in order:

1. Look at it on a real desktop screen and a real phone. The build was checked in a small preview pane and
   on emulated phone widths only. Smoothness of the animation and real touch use were not judged.
2. Confirm that the public host serves it (Settings, Pages, source GitHub Actions) and open the link in a
   private window.
3. Put the team name in `TEAM` at the top of `web/demo.js`, record `?demo=1` at 1920 by 1080 and trim to 30
   seconds or less.
4. Person C: replace the draft wording in "Why our number differs" and "Methods", and the references.
5. Slides, project page text and the AI-use declaration ([TEAM.md](TEAM.md)).

The page needs **only** the committed pack in `web/data/sea/`. It does not need the raw data, the pipeline,
Python or any key. Check any number you change against WEB-SPEC section 14 (reference values from the real
pack).

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
| Flat voxel map (one pillar per cell), flat panels for numbers | Changed from a 3D globe on 14 November: simpler, no globe risk, and it reads as the same map in the video. The map shows where and how much; exact numbers stay in the panels |
| three.js, not MapLibre | The pillars, clouds and sparks are cheap instanced meshes; the base map is Blue Marble tiles sampled once into pixels |
| Month panel leads with a verdict, then a picture, then numbers; a Simple and a Detail view | A reader should not have to compare numbers to know whether a month is unusual. The smoke rule is unchanged |
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

- Product name: **HotHub** (page title and heading in `index.html`, `#project-name`; the demo's first caption reads it from there). Confirm with the team before the slides and the project page use it.
- Team name for the demo captions: `TEAM` in `web/demo.js` is empty.
- Host: a GitHub Pages workflow (`.github/workflows/pages.yml`) deploys `web/` on every push to
  `main` that touches it. Pages must be switched on in the repository settings (source: GitHub
  Actions). Not yet confirmed live.
- NASA GIBS Blue Marble base map works (tiles are fetched in the browser at zoom 5 and sampled to one colour per
  0.1 degree cell). If the tiles fail to load within 8 seconds, the page draws land where the record ever saw a
  hot spot, which is patchy.
- NOAA-20 standby through Suomi NPP (for the day Aqua and Suomi NPP stop) is described in DESIGN.md
  but not built. Cut it if time is short.
- Project page text, slides or video, references list: person C and D ([TEAM.md](TEAM.md)).
- Person C: the 2019 figure links to a CNBC report of the World Bank estimate; replace it with the World Bank
  document itself. The explainer cards and the methods text around the gauges are drafts.
- Whether code-drawn pixel icons and comic panels need a watermark under the AI-image rule is a team decision.
  The footer says they were drawn in code with the assistant.
- Not built: simple cards (haze now, fires in the last 24 hours), Landsat cross-check, NOAA-20 standby.

## 8. File map

| File | Read it for |
|---|---|
| [README.md](README.md) | What the project is, results table, how to run |
| [DESIGN.md](DESIGN.md) | Method, results, limits, weak points of existing tools |
| [PACK.md](PACK.md) | Format of the data pack and how the page computes from it |
| [WEB-SPEC.md](WEB-SPEC.md) | Specification of the web page, including the demo mode; section 16 says what was built |
| [TEAM.md](TEAM.md) | Who does what, hand-offs, cut list |
| [PLAN.md](PLAN.md) | Schedule and submission checklist |
