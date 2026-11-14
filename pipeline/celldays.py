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


def write_tables(out_dir, tables, static=None, append=False):
    """Write the three monthly tables (append=True adds rows to existing files) and, when given, the
    static cell list."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    def table(name, header, rows):
        with (out_dir / name).open("a" if append else "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            if not append:
                w.writerow(header)
            w.writerows(rows)

    table("cellmonths.csv", ["i", "j", "year", "month", *grid.CHANNELS],
          ([*key, *tables.cellmonths[key]] for key in sorted(tables.cellmonths)))
    table("blockmonths.csv", BLOCK_FIELDS,
          ([*key, n_det, n_cd, round(frp, 1), n_high]
           for key, (n_det, n_cd, frp, n_high) in sorted(tables.blockmonths.items())))
    table("satmonths.csv", ["year", "month", "sat", "days"],
          ([*key, len(tables.sat_days[key])] for key in sorted(tables.sat_days)))
    if static is not None:
        with (out_dir / "static_cells.csv").open("w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["i", "j", "years"])
            w.writerows([i, j, n] for (i, j), n in sorted(static.items()))


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


def paths_by_year(root, region):
    """{year: [cached day files of every source]}"""
    out = defaultdict(list)
    for source in fetch.LAYERS:
        for path in sorted((Path(root) / region / source).glob("*.csv")):
            out[int(path.name[:4])].append(path)
    return out


def year_tables(paths, exclude=()):
    tables, n_rows = Tables(exclude=exclude), 0
    for path in paths:
        rows = fetch.read_rows(path)
        tables.add_day(rows)
        n_rows += len(rows)
    return tables, n_rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", choices=sorted(grid.REGIONS), required=True)
    ap.add_argument("--root", default="data/raw")
    ap.add_argument("--out", default="data/out")
    ap.add_argument("--static-years", default="2012-2019",
                    help="years used to find persistent heat sources (training years only)")
    ap.add_argument("--min-years", type=int, default=3)
    args = ap.parse_args()
    by_year = paths_by_year(args.root, args.region)
    out_dir = Path(args.out) / args.region
    # One year in memory at a time. Pass 1 (training years only) finds the persistent heat sources,
    # pass 2 builds the tables with those cells left out of blockmonths.
    hits = defaultdict(int)
    for year in sorted(parse_years(args.static_years) & set(by_year)):
        tables, _ = year_tables(by_year[year])
        for cell in tables.static_cells(min_years=1):
            hits[cell] += 1
        print(f"static pass {year}: {len(hits)} candidate cells", flush=True)
    static = {cell: n for cell, n in hits.items() if n >= args.min_years}
    totals, months = [0, 0, 0, 0], defaultdict(list)
    for k, year in enumerate(sorted(by_year)):
        tables, n_rows = year_tables(by_year[year], exclude=static)
        write_tables(out_dir, tables, static if k == 0 else None, append=k > 0)
        for n, add in enumerate((len(by_year[year]), n_rows, len(tables.cellmonths), len(tables.blockmonths))):
            totals[n] += add
        for (y, m, sat) in tables.sat_days:
            months[sat].append((y, m))
        print(f"{year}: {n_rows} detections, {len(tables.cellmonths)} cell-months", flush=True)
    print(f"{totals[0]} day files, {totals[1]} detections -> {totals[2]} cell-months, "
          f"{totals[3]} block-month-sat rows, {len(static)} static cells")
    for sat in SATS:
        span = sorted(months[sat])
        if span:
            print(f"  {sat:4s} {span[0][0]}-{span[0][1]:02d} .. {span[-1][0]}-{span[-1][1]:02d} ({len(span)} months)")


if __name__ == "__main__":
    main()
