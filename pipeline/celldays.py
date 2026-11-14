"""Aggregate cached detections into the monthly tables the harmonizer and the pack read.

Usage:
    python pipeline/celldays.py --region sea --static-years 2012-2019

Outputs in data/out/<region>/:
    cellmonths.csv    i,j,year,month,<19 channel counts>          what the page sums
    blockmonths.csv   bi,bj,year,month,sat,dn,n_det,n_celldays,frp,n_high   what the harmonizer fits
                      (persistent heat sources left out)
    satmonths.csv     year,month,sat,days                         days with data per satellite
    static_cells.csv  i,j,years                                   persistent heat sources

A qualifying detection is VIIRS nominal or high, or MODIS confidence 30 or higher.
Day or night comes from local solar time (06-18 h is day). Months follow the acquisition date (UTC).
"""

import argparse
import csv
from collections import defaultdict
from pathlib import Path

import fetch
import grid

SATS = ("A", "T") + grid.VIIRS_SATS
BLOCK_FIELDS = ["bi", "bj", "year", "month", "sat", "dn", "n_det", "n_celldays", "frp", "n_high"]


def day_or_night(time_utc, lon):
    """'D' when local solar time is 06:00-18:00, else 'N'. time_utc is 'HHMM' (or 'HMM')."""
    digits = str(time_utc).zfill(4)
    hour = (int(digits[:-2]) + int(digits[-2:]) / 60 + lon / 15.0) % 24
    return "D" if 6 <= hour < 18 else "N"


def qualifies(row):
    if row["family"] == "viirs":
        return row["conf"] in ("nominal", "high")
    return int(row["conf"]) >= 30


def is_high(row):
    return row["conf"] == "high" if row["family"] == "viirs" else int(row["conf"]) >= 80


class Tables:
    def __init__(self, exclude=()):
        self.exclude = set(exclude)                               # cells kept out of blockmonths
        self.cellmonths = defaultdict(lambda: [0] * len(grid.CHANNELS))
        self.blockmonths = defaultdict(lambda: [0, 0, 0.0, 0])   # n_det, n_celldays, frp, n_high
        self.sat_days = defaultdict(set)                          # (year, month, sat) -> {date}
        self.cell_year_days = defaultdict(set)                    # (year, i, j) -> {date}, any qualifying sensor
        self.year_days = defaultdict(set)                         # year -> {date} with any data

    def add_day(self, rows):
        """Add the detections of one cached file (any mix of dates is fine)."""
        seen_celldays = set()
        for r in rows:
            ch = grid.channel(r["family"], r["sat"], r["conf"])
            if ch is None:
                continue
            day = r["date"]
            y, m = int(day[:4]), int(day[5:7])
            i, j = grid.cell_index(r["lat"], r["lon"])
            self.cellmonths[(i, j, y, m)][grid.CH[ch]] += 1
            self.sat_days[(y, m, r["sat"])].add(day)
            self.year_days[y].add(day)
            if not qualifies(r):
                continue
            self.cell_year_days[(y, i, j)].add(day)
            if (i, j) in self.exclude:
                continue
            dn = day_or_night(r["time"], r["lon"])
            rec = self.blockmonths[(*grid.block_of(i, j), y, m, r["sat"], dn)]
            rec[0] += 1
            rec[2] += r["frp"]
            rec[3] += int(is_high(r))
            key = (day, i, j, r["sat"], dn)
            if key not in seen_celldays:
                seen_celldays.add(key)
                rec[1] += 1

    def static_cells(self, years=None, min_share=0.5, min_years=3):
        """{(i, j): n_years}: cells active on at least min_share of a year's data days in at least
        min_years years. `years` limits the search (use the training years, so the test is not leaked)."""
        hits = defaultdict(int)
        for (y, i, j), days in self.cell_year_days.items():
            if years is not None and y not in years:
                continue
            if len(days) / len(self.year_days[y]) >= min_share:
                hits[(i, j)] += 1
        return {cell: n for cell, n in hits.items() if n >= min_years}


def write_tables(out_dir, tables, static):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / "cellmonths.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["i", "j", "year", "month", *grid.CHANNELS])
        for key in sorted(tables.cellmonths):
            w.writerow([*key, *tables.cellmonths[key]])
    with (out_dir / "blockmonths.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(BLOCK_FIELDS)
        for key in sorted(tables.blockmonths):
            n_det, n_cd, frp, n_high = tables.blockmonths[key]
            w.writerow([*key, n_det, n_cd, round(frp, 1), n_high])
    with (out_dir / "satmonths.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["year", "month", "sat", "days"])
        for key in sorted(tables.sat_days):
            w.writerow([*key, len(tables.sat_days[key])])
    with (out_dir / "static_cells.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["i", "j", "years"])
        for (i, j), n in sorted(static.items()):
            w.writerow([i, j, n])


def read_cellmonths(path):
    """{(i, j, year, month): [counts]}"""
    out = {}
    with Path(path).open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            out[(int(r["i"]), int(r["j"]), int(r["year"]), int(r["month"]))] = [int(r[c]) for c in grid.CHANNELS]
    return out


def read_blockmonths(path):
    """{(bi, bj, year, month, sat, dn): {'n_det', 'n_celldays', 'frp', 'n_high'}}"""
    out = {}
    with Path(path).open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            key = (int(r["bi"]), int(r["bj"]), int(r["year"]), int(r["month"]), r["sat"], r["dn"])
            out[key] = {"n_det": int(r["n_det"]), "n_celldays": int(r["n_celldays"]),
                        "frp": float(r["frp"]), "n_high": int(r["n_high"])}
    return out


def read_satmonths(path):
    """{(year, month, sat): days}"""
    with Path(path).open(newline="", encoding="utf-8") as fh:
        return {(int(r["year"]), int(r["month"]), r["sat"]): int(r["days"]) for r in csv.DictReader(fh)}


def read_static_cells(path):
    with Path(path).open(newline="", encoding="utf-8") as fh:
        return {(int(r["i"]), int(r["j"])): int(r["years"]) for r in csv.DictReader(fh)}


def parse_years(text):
    a, _, b = text.partition("-")
    return set(range(int(a), int(b or a) + 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", choices=sorted(grid.REGIONS), required=True)
    ap.add_argument("--root", default="data/raw")
    ap.add_argument("--out", default="data/out")
    ap.add_argument("--static-years", default="2012-2019",
                    help="years used to find persistent heat sources (training years only)")
    args = ap.parse_args()
    paths = [p for source in fetch.LAYERS
             for p in sorted((Path(args.root) / args.region / source).glob("*.csv"))]
    # Pass 1 finds the persistent heat sources, pass 2 builds the tables without them in blockmonths.
    first = Tables()
    for path in paths:
        first.add_day(fetch.read_rows(path))
    static = first.static_cells(parse_years(args.static_years))
    del first
    tables, n_rows, n_files = Tables(exclude=static), 0, len(paths)
    for path in paths:
        rows = fetch.read_rows(path)
        tables.add_day(rows)
        n_rows += len(rows)
    write_tables(Path(args.out) / args.region, tables, static)
    years = sorted(tables.year_days)
    print(f"{n_files} day files, {n_rows} detections -> {len(tables.cellmonths)} cell-months, "
          f"{len(tables.blockmonths)} block-month-sat rows, {len(static)} static cells; "
          f"years {years[0] if years else '-'}..{years[-1] if years else '-'}")
    for sat in SATS:
        months = sorted((y, m) for (y, m, s) in tables.sat_days if s == sat)
        if months:
            print(f"  {sat:4s} {months[0][0]}-{months[0][1]:02d} .. {months[-1][0]}-{months[-1][1]:02d} ({len(months)} months)")


if __name__ == "__main__":
    main()
