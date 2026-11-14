# Notes for Claude Code sessions in this repository

Start by reading [HANDOFF.md](HANDOFF.md). Then, for web work, [WEB-SPEC.md](WEB-SPEC.md) and
[PACK.md](PACK.md); for method questions, [DESIGN.md](DESIGN.md).

- The web page is a static site in `web/`. It reads only `web/data/sea/*.json`. No server, no build
  step, no key or credential in any file under `web/`.
- Check numbers against WEB-SPEC section 14 before any visual work.
- For MapLibre GL JS (globe, 3D layers), read the current documentation; do not rely on memory.
- Pipeline tests: `python -m pytest tests -q` (45 pass). Do not change `pipeline/` or the pack format
  without updating PACK.md and the tests.
- Report results honestly: narrow passes, failed models and limits stay in the text.
- Docs and page text are in English. No NASA logos. Cite every source and library.
- Never commit `.env` or the top-level `data/` folder. Commit and push only when asked.
