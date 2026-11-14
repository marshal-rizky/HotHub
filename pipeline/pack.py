"""Build the data pack the web page reads. The format is described in PACK.md.

Usage:
    python pipeline/pack.py --region sea

Reads data/out/<region>/ (cellmonths.csv, harmonized.csv, harmonize.json, satmonths.csv,
static_cells.csv and, when present, aodmonths.csv). Writes web/data/<region>/:
    meta.json     grid, month axis, good months, model verdict, interval table, smoke rule
    cells.json    {"i,j": [m, aqua, est10, ...]}      per 0.1 degree cell
    region.json   {"months": [[m, aqua, est, lo, hi, raw N, raw N20, raw N21, raw Terra], ...]}
    smoke.json    {"bi,bj": [m, smoke_days, days, ...]}    per 0.5 degree block, smoky months only
"""

import argparse
import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import celldays
import grid
import harmonize

BASE_YEAR = 2002
SMOKE_MIN_DAYS = 3          # a block-month is "smoky" from this many smoke days


def month_index(year, month):
    return (year - BASE_YEAR) * 12 + month - 1


def qualifying(counts, prefix, levels):
    return sum(counts[grid.CH[f"{prefix}_{lvl}"]] for lvl in levels)


def cell_values(counts, sat):
    """(aqua, viirs of `sat`, {other: count}) qualifying detections in one cell-month."""
    aqua = qualifying(counts, "a", (30, 50, 70, 80))
    raw = {s: qualifying(counts, f"v{s}", ("nominal", "high")) for s in grid.VIIRS_SATS}
    raw["T"] = qualifying(counts, "t", (30, 50, 70, 80))
    return aqua, raw[sat], raw


def build(out_dir, sat):
    """Stream cellmonths.csv once. Returns (cells, region raw totals)."""
    static = set(celldays.read_static_cells(out_dir / "static_cells.csv"))
    factor = {}
    with (out_dir / "harmonized.csv").open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if int(r["viirs"]):
                key = (int(r["bi"]), int(r["bj"]), int(r["year"]), int(r["month"]))
                factor[key] = float(r["est"]) / int(r["viirs"])
    cells = defaultdict(list)
    raw_totals = defaultdict(lambda: defaultdict(int))
    with (out_dir / "cellmonths.csv").open(newline="", encoding="utf-8") as fh:
        reader = csv.reader(fh)
        next(reader)
        for row in reader:
            i, j, y, m = (int(v) for v in row[:4])
            if (i, j) in static:
                continue
            aqua, viirs, raw = cell_values([int(v) for v in row[4:]], sat)
            idx = month_index(y, m)
            for s, n in raw.items():
                raw_totals[idx][s] += n
            est = viirs * factor.get((*grid.block_of(i, j), y, m), 0.0)
            if aqua or est:
                cells[f"{i},{j}"] += [idx, aqua, round(est * 10)]
    return cells, raw_totals, sorted(static)


def smoke_blocks(path):
    out = defaultdict(list)
    first = None
    with path.open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            idx = month_index(int(r["year"]), int(r["month"]))
            first = idx if first is None else min(first, idx)
            if int(r["smoke_days"]) >= 1:
                out[r["bi"] + "," + r["bj"]] += [idx, int(r["smoke_days"]), int(r["days"])]
    return out, first


def dump(path, obj):
    path.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")
    return path.stat().st_size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", choices=sorted(grid.REGIONS), required=True)
    ap.add_argument("--out", default="data/out")
    ap.add_argument("--web", default="web/data")
    args = ap.parse_args()
    out_dir, web = Path(args.out) / args.region, Path(args.web) / args.region
    web.mkdir(parents=True, exist_ok=True)
    report = json.loads((out_dir / "harmonize.json").read_text(encoding="utf-8"))
    sat, used = report["sat"], report["used"]
    satmonths = celldays.read_satmonths(out_dir / "satmonths.csv")
    cells, raw_totals, static = build(out_dir, sat)

    series = {month_index(r["year"], r["month"]): r for r in report["series"]}
    months = []
    for idx in sorted(set(series) | set(raw_totals)):
        r, raw = series.get(idx, {}), raw_totals.get(idx, {})
        months.append([idx, r.get("aqua"), r.get("est"), r.get("lo"), r.get("hi"),
                       raw.get("N", 0), raw.get("N20", 0), raw.get("N21", 0), raw.get("T", 0)])

    model = report["models"][used]
    meta = {
        "region": args.region, "bbox": grid.REGIONS[args.region], "cell": grid.CELL, "block": grid.BLOCK,
        "base_year": BASE_YEAR, "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "aqua_months": sorted(month_index(y, m) for y, m in harmonize.good_months(satmonths, harmonize.REF)),
        "est_months": sorted(month_index(y, m) for y, m in harmonize.good_months(satmonths, sat)),
        "drift_from": month_index(harmonize.DRIFT_YEARS[0], 1),
        "viirs_sat": sat, "model": used, "calibrated": report["calibrated"],
        "train_years": report["train_years"], "test_years": report["test_years"],
        "size_edges": list(harmonize.SIZE_EDGES), "intervals": model["intervals"],
        "test": {name: {"median_log_error": m["test"]["median_log_error"], "coverage": m["test"]["coverage"],
                        "years": m["test"]["years"], "criteria": m.get("criteria"),
                        "drift_years": m.get("drift", {}).get("years")}
                 for name, m in report["models"].items()},
        "criteria_definition": report["criteria_definition"],
        "static_cells": static, "smoke": None,
    }
    sizes = {"cells.json": dump(web / "cells.json", cells),
             "region.json": dump(web / "region.json", {"months": months})}
    aod_path = out_dir / "aodmonths.csv"
    if aod_path.exists():
        blocks, first = smoke_blocks(aod_path)
        meta["smoke"] = {"first_month": first, "min_days": SMOKE_MIN_DAYS, "aod_threshold": 1.0}
        sizes["smoke.json"] = dump(web / "smoke.json", blocks)
    sizes["meta.json"] = dump(web / "meta.json", meta)
    for name, size in sizes.items():
        print(f"{name:12s} {size / 1e6:6.2f} MB")
    print(f"{len(cells)} cells, {len(months)} months, model {used}, calibrated={report['calibrated']}")


if __name__ == "__main__":
    main()
