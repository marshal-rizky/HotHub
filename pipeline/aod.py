"""Monthly smoke summary per 0.5 degree block, from Meteomatics aerosol optical depth at 550 nm.

Usage (credentials come from the environment, never from this repository):
    METEOMATICS_USER=... METEOMATICS_PASS=... python pipeline/aod.py --region sea

One request per month: the daily value at 06:00 UTC (early afternoon in Indonesia, close to the Aqua
and VIIRS daytime overpass) at the centre of every block. Each month is cached in
data/raw/<region>/aod/YYYY-MM.csv, so a rerun only asks for what is missing. Output:

    data/out/<region>/aodmonths.csv    bi,bj,year,month,days,smoke_days,mean,max

A smoke day is a day with optical depth of SMOKE_AOD or more. The data starts on 2015-11-21.
"""

import argparse
import base64
import calendar
import csv
import io
import os
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import grid

PARAM = "total_aod_550nm:idx"
FIRST_DAY = date(2015, 11, 21)
SMOKE_AOD = 1.0
HOUR = "T06:00:00Z"
FIELDS = ["bi", "bj", "year", "month", "days", "smoke_days", "mean", "max"]
HOST = "https://api.meteomatics.com"


def month_span(year, month, first=None, last=None):
    """(start, end) dates of the month clipped to the available record, or None when nothing is left."""
    start = max(date(year, month, 1), first or FIRST_DAY)
    end = date(year, month, calendar.monthrange(year, month)[1])
    if last is not None:
        end = min(end, last)
    return (start, end) if start <= end else None


def month_url(bbox, start, end):
    half = grid.BLOCK / 2
    area = "{},{}_{},{}:{},{}".format(bbox["lat_max"] - half, bbox["lon_min"] + half,
                                      bbox["lat_min"] + half, bbox["lon_max"] - half, grid.BLOCK, grid.BLOCK)
    return f"{HOST}/{start.isoformat()}{HOUR}--{end.isoformat()}{HOUR}:P1D/{PARAM}/{area}/csv"


def http_get(url, user, password, opener=urllib.request.urlopen, sleep=time.sleep, tries=4):
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    req = urllib.request.Request(url, headers={"Authorization": "Basic " + token})
    for attempt in range(tries):
        try:
            with opener(req, timeout=180) as resp:
                return resp.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == tries - 1:
                raise
        sleep(20 * (attempt + 1))


def summarize(text):
    """Meteomatics CSV (lat;lon;validdate;value) -> rows of FIELDS for one month."""
    acc = defaultdict(lambda: [0, 0, 0.0, 0.0])      # days, smoke_days, sum, max
    year = month = None
    reader = csv.reader(io.StringIO(text), delimiter=";")
    next(reader, None)
    for lat, lon, stamp, value in reader:
        try:
            v = float(value)
        except ValueError:
            continue
        if v != v or v < 0:                           # NaN or a missing-value marker
            continue
        year, month = int(stamp[:4]), int(stamp[5:7])
        a = acc[grid.cell_index(float(lat), float(lon), grid.BLOCK)]
        a[0] += 1
        a[1] += v >= SMOKE_AOD
        a[2] += v
        a[3] = max(a[3], v)
    return [[bi, bj, year, month, n, smoke, round(total / n, 3), round(top, 3)]
            for (bi, bj), (n, smoke, total, top) in sorted(acc.items())]


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with tmp.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(FIELDS)
        w.writerows(rows)
    os.replace(tmp, path)


def read_aodmonths(path):
    """{(bi, bj, year, month): {days, smoke_days, mean, max}}"""
    out = {}
    with Path(path).open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            out[(int(r["bi"]), int(r["bj"]), int(r["year"]), int(r["month"]))] = {
                "days": int(r["days"]), "smoke_days": int(r["smoke_days"]),
                "mean": float(r["mean"]), "max": float(r["max"])}
    return out


def fetch_all(root, region, user, password, last, get=http_get, log=print):
    """Fetch every missing month up to `last`. The month that contains `last` is never cached."""
    bbox = grid.REGIONS[region]
    folder = Path(root) / region / "aod"
    rows, y, m = [], FIRST_DAY.year, FIRST_DAY.month
    while (y, m) <= (last.year, last.month):
        span = month_span(y, m, last=last)
        path = folder / f"{y}-{m:02d}.csv"
        if path.exists():
            with path.open(newline="", encoding="utf-8") as fh:
                rows.extend(list(csv.reader(fh))[1:])
        elif span:
            t0 = time.time()
            part = summarize(get(month_url(bbox, *span), user, password))
            log(f"aod {y}-{m:02d} {len(part)} blocks {time.time() - t0:.1f}s")
            if (y, m) != (last.year, last.month):
                write_csv(path, part)
            rows.extend(part)
        y, m = (y, m + 1) if m < 12 else (y + 1, 1)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", choices=sorted(grid.REGIONS), required=True)
    ap.add_argument("--root", default="data/raw")
    ap.add_argument("--out", default="data/out")
    ap.add_argument("--end", default=None, help="last day to ask for (default: yesterday)")
    args = ap.parse_args()
    user, password = os.environ.get("METEOMATICS_USER"), os.environ.get("METEOMATICS_PASS")
    if not user or not password:
        raise SystemExit("set METEOMATICS_USER and METEOMATICS_PASS in the environment")
    last = date.fromisoformat(args.end) if args.end else date.today() - timedelta(days=1)
    rows = fetch_all(args.root, args.region, user.strip(), password.strip(), last)
    out = Path(args.out) / args.region / "aodmonths.csv"
    write_csv(out, rows)
    print(f"wrote {len(rows)} block-months to {out}")


if __name__ == "__main__":
    main()
