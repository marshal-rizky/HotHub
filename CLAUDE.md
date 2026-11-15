# Notes for Claude Code sessions in this repository

Start by reading [HANDOFF.md](HANDOFF.md). Then, for web work, [WEB-SPEC.md](WEB-SPEC.md) and
[PACK.md](PACK.md); for method questions, [DESIGN.md](DESIGN.md).

- The web page is a static site in `web/`. It reads only `web/data/sea/*.json`. No server, no build
  step, no key or credential in any file under `web/`. It is built: see HANDOFF.md section 1 and
  WEB-SPEC.md section 16 ("As built").
- Check numbers against WEB-SPEC section 14 before any visual work.
- The map is three.js, copied into `web/vendor/three/` (pinned, with its licence). It is a flat voxel map,
  not a MapLibre globe. For three.js API details, read the current documentation; do not rely on memory.
- Web tests: `node --test web/tests` (24 pass). Keep `web/calc.js` pure: no DOM, no fetch.
- Pipeline tests: `python -m pytest tests -q` (45 pass). Do not change `pipeline/` or the pack format
  without updating PACK.md and the tests.
- Report results honestly: narrow passes, failed models and limits stay in the text.
- Docs and page text are in English. No NASA logos. Cite every source and library; the page footer lists them.
- To preview locally, from the repository root: `python -m http.server 8765 --directory web`. A browser may
  cache old files; reload with Ctrl+Shift+R after a change.
- Never commit `.env` or the top-level `data/` folder. Commit and push only when asked.
