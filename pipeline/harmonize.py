"""Fit and test the mapping from VIIRS hot spots to Aqua-equivalent hot spots.

Usage:
    python pipeline/harmonize.py --region sea

Reads data/out/<region>/blockmonths.csv and satmonths.csv (made by celldays.py). Writes
    harmonize.json    test results, pass or fail for every criterion, model parameters, intervals
    harmonized.csv    bi,bj,year,month,sat,viirs,est   Aqua-equivalent estimate per block-month

Design, fixed before any result was seen:
    reference          Aqua MODIS, confidence 30 or higher
    predictor          one VIIRS satellite at a time, nominal or high confidence, day and night apart
    training years     2012-2019        test years 2020-2022        2023 onwards reported apart
    scored set         every block-month where the VIIRS satellite saw a fire (Aqua zeros included)
    baseline           one ratio for the whole record (per day or night)
    model "monthly"    ratio per calendar month, shrunk towards the baseline ratio
    model "size"       monotone curve per fire-size class (FRP per detection, high-confidence share)
    C1  median absolute log error at most 0.9 times the baseline
    C2  80% interval covers 70% to 90% of the scored block-months
    C3  each test year total within 25% of the real Aqua total (fires VIIRS missed count as real)
"""

import argparse
import calendar
import csv
import json
import math
from collections import defaultdict, namedtuple
from pathlib import Path

import celldays
import grid

TRAIN_YEARS = range(2012, 2020)
TEST_YEARS = range(2020, 2023)
DRIFT_YEARS = range(2023, 2100)     # Aqua overpass time drifts, so these years are not a fair test
MIN_DAY_SHARE = 0.8                 # a month counts when the satellite has data on this share of days
SHRINK = 200                        # pseudo-detections that pull a monthly ratio to the baseline
MIN_STRATUM = 200                   # records needed before a fire-size class gets its own curve
SIZE_EDGES = (10, 100, 1000)        # interval bins by size of the estimate
MIN_BIN = 30                        # residuals needed before a bin gets its own interval
SUPER = 5                           # blocks per side of the coarser squares used for intervals
C1_FACTOR, C2_RANGE, C3_LIMIT = 0.9, (0.70, 0.90), 0.25
REF = "A"

Rec = namedtuple("Rec", "bi bj y m dn x frp high aqua")


# ---- data ----

def good_months(satmonths, sat):
    return {(y, m) for (y, m, s), days in satmonths.items()
            if s == sat and days / calendar.monthrange(y, m)[1] >= MIN_DAY_SHARE}


def build_records(blockmonths, satmonths, sat, years, need_ref=True):
    """(records, missed). A record is one block, month, day-or-night where `sat` saw a fire.
    missed[year] is the Aqua count in block-months where `sat` saw nothing."""
    ok = good_months(satmonths, sat)
    if need_ref:
        ok &= good_months(satmonths, REF)
    recs, missed = [], defaultdict(int)
    for (bi, bj, y, m, s, dn), v in blockmonths.items():
        if y not in years or (y, m) not in ok:
            continue
        if s == sat:
            ref = blockmonths.get((bi, bj, y, m, REF, dn))
            n = v["n_det"]
            recs.append(Rec(bi, bj, y, m, dn, n, v["frp"] / n, v["n_high"] / n, ref["n_det"] if ref else 0))
        elif s == REF and (bi, bj, y, m, sat, dn) not in blockmonths:
            missed[y] += v["n_det"]
    return recs, missed


# ---- models ----

class GlobalRatio:
    name = "baseline"

    def fit(self, recs):
        sx, sy = defaultdict(float), defaultdict(float)
        for r in recs:
            sx[r.dn] += r.x
            sy[r.dn] += r.aqua
        self.ratio = {dn: sy[dn] / sx[dn] for dn in sx}
        return self

    def predict(self, r):
        return self.ratio.get(r.dn, 0.0) * r.x

    def params(self):
        return {"ratio": self.ratio}


class MonthlyRatio:
    name = "monthly"

    def fit(self, recs):
        self.base = GlobalRatio().fit(recs).ratio
        sx, sy = defaultdict(float), defaultdict(float)
        for r in recs:
            sx[(r.m, r.dn)] += r.x
            sy[(r.m, r.dn)] += r.aqua
        self.ratio = {k: (sy[k] + SHRINK * self.base[k[1]]) / (sx[k] + SHRINK) for k in sx}
        return self

    def predict(self, r):
        return self.ratio.get((r.m, r.dn), self.base.get(r.dn, 0.0)) * r.x

    def params(self):
        return {"ratio": {f"{m:02d}{dn}": round(v, 5) for (m, dn), v in sorted(self.ratio.items())}}


def pava(values, weights):
    """Weighted isotonic (non-decreasing) fit of a sequence."""
    blocks = []
    for v, w in zip(values, weights):
        blocks.append([v * w, w, 1])
        while len(blocks) > 1 and blocks[-2][0] / blocks[-2][1] > blocks[-1][0] / blocks[-1][1]:
            top = blocks.pop()
            for k in range(3):
                blocks[-1][k] += top[k]
    out = []
    for swv, sw, n in blocks:
        out.extend([swv / sw] * n)
    return out


class Curve:
    """Monotone curve through (0, 0) and the mean Aqua count of each log-spaced VIIRS bin."""

    def __init__(self, recs):
        bins = defaultdict(lambda: [0.0, 0.0, 0])
        for r in recs:
            b = bins[int(2 * math.log2(r.x))]
            b[0] += r.x
            b[1] += r.aqua
            b[2] += 1
        keys = sorted(bins)
        self.xs = [bins[k][0] / bins[k][2] for k in keys]
        self.ys = pava([bins[k][1] / bins[k][2] for k in keys], [bins[k][2] for k in keys])

    def __call__(self, x):
        xs, ys = self.xs, self.ys
        if not xs:
            return 0.0
        if x >= xs[-1]:
            return ys[-1] / xs[-1] * x                 # past the last knot: keep its ratio
        px, py = 0.0, 0.0
        for kx, ky in zip(xs, ys):
            if x <= kx:
                return py + (ky - py) * (x - px) / (kx - px)
            px, py = kx, ky
        return ys[-1]


def median(values):
    v = sorted(values)
    n = len(v)
    return (v[n // 2] + v[(n - 1) // 2]) / 2 if n else float("nan")


class SizeCurves:
    name = "size"

    def fit(self, recs):
        self.cut, self.fallback, self.curves = {}, {}, {}
        for dn in ("D", "N"):
            part = [r for r in recs if r.dn == dn]
            if not part:
                continue
            self.cut[dn] = (median([r.frp for r in part]), median([r.high for r in part]))
            self.fallback[dn] = Curve(part)
            groups = defaultdict(list)
            for r in part:
                groups[self.stratum(r)].append(r)
            for key, rows in groups.items():
                if len(rows) >= MIN_STRATUM:
                    self.curves[key] = Curve(rows)
        return self

    def stratum(self, r):
        frp_cut, high_cut = self.cut[r.dn]
        return (r.dn, int(r.frp > frp_cut), int(r.high > high_cut))

    def predict(self, r):
        if r.dn not in self.cut:
            return 0.0
        return self.curves.get(self.stratum(r), self.fallback[r.dn])(r.x)

    def params(self):
        def knots(c):
            return [[round(x, 2), round(y, 3)] for x, y in zip(c.xs, c.ys)]
        return {"cut": {dn: [round(a, 3), round(b, 4)] for dn, (a, b) in self.cut.items()},
                "curves": {f"{dn}{f}{h}": knots(c) for (dn, f, h), c in sorted(self.curves.items())},
                "fallback": {dn: knots(c) for dn, c in self.fallback.items()}}


MODELS = {"baseline": GlobalRatio, "monthly": MonthlyRatio, "size": SizeCurves}


# ---- scoring ----

def block_sums(recs, model):
    """{(bi, bj, y, m): [estimate, real Aqua count]} with day and night added together."""
    out = defaultdict(lambda: [0.0, 0])
    for r in recs:
        t = out[(r.bi, r.bj, r.y, r.m)]
        t[0] += model.predict(r)
        t[1] += r.aqua
    return out


def coarser(sums, level):
    out = defaultdict(lambda: [0.0, 0])
    for (bi, bj, y, m), (hat, real) in sums.items():
        key = (bi // SUPER, bj // SUPER, y, m) if level == "super" else (y, m)
        out[key][0] += hat
        out[key][1] += real
    return out


def size_bin(hat):
    return sum(hat >= e for e in SIZE_EDGES)


def quantile(sorted_values, q):
    pos = q * (len(sorted_values) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(sorted_values) - 1)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (pos - lo)


def fit_intervals(sums):
    """{bin: (q10, q90)} of log((real + 1) / (estimate + 1)), from blocks, coarser squares and the region."""
    resid = defaultdict(list)
    for level in ("block", "super", "region"):
        for hat, real in (sums if level == "block" else coarser(sums, level)).values():
            resid[size_bin(hat)].append(math.log((real + 1) / (hat + 1)))
    everything = sorted(v for vals in resid.values() for v in vals)
    out = {}
    for b in range(len(SIZE_EDGES) + 1):
        vals = sorted(resid[b]) if len(resid[b]) >= MIN_BIN else everything
        out[b] = (quantile(vals, 0.1), quantile(vals, 0.9)) if vals else (0.0, 0.0)
    return out


def interval(hat, intervals):
    lo, hi = intervals[size_bin(hat)]
    return max(0.0, (hat + 1) * math.exp(lo) - 1), (hat + 1) * math.exp(hi) - 1


def score(model, intervals, recs, missed):
    sums = block_sums(recs, model)
    errors, covered = [], 0
    years = defaultdict(lambda: [0.0, 0])
    for (bi, bj, y, m), (hat, real) in sums.items():
        errors.append(abs(math.log((hat + 1) / (real + 1))))
        lo, hi = interval(hat, intervals)
        covered += lo <= real <= hi
        years[y][0] += hat
        years[y][1] += real
    for y, n in missed.items():
        years[y][1] += n
    return {"n": len(sums), "median_log_error": median(errors),
            "coverage": covered / len(sums) if sums else float("nan"),
            "years": {y: {"est": round(hat, 1), "real": real,
                          "error": (hat - real) / real if real else float("nan")}
                      for y, (hat, real) in sorted(years.items())}}


def judge(result, baseline):
    c1 = result["median_log_error"] <= C1_FACTOR * baseline["median_log_error"]
    c2 = C2_RANGE[0] <= result["coverage"] <= C2_RANGE[1]
    c3 = bool(result["years"]) and all(abs(v["error"]) <= C3_LIMIT for v in result["years"].values())
    return {"C1": c1, "C2": c2, "C3": c3, "pass": c1 and c2 and c3}


def run(blockmonths, satmonths, sat="N", train=TRAIN_YEARS, test=TEST_YEARS, drift=DRIFT_YEARS):
    """Fit on `train`, score on `test` and `drift`. Returns (report, fitted models, intervals)."""
    train_recs, _ = build_records(blockmonths, satmonths, sat, train)
    test_recs, test_missed = build_records(blockmonths, satmonths, sat, test)
    drift_recs, drift_missed = build_records(blockmonths, satmonths, sat, drift)
    if not train_recs or not test_recs:
        raise SystemExit(f"not enough data: {len(train_recs)} training and {len(test_recs)} test records for {sat}")
    report = {"sat": sat, "train_years": [train[0], train[-1]], "test_years": [test[0], test[-1]],
              "n_train": len(train_recs), "models": {}}
    fitted, intervals = {}, {}
    for name, cls in MODELS.items():
        model = cls().fit(train_recs)
        iv = fit_intervals(block_sums(train_recs, model))
        fitted[name], intervals[name] = model, iv
        entry = {"test": score(model, iv, test_recs, test_missed),
                 "intervals": {str(b): [round(lo, 4), round(hi, 4)] for b, (lo, hi) in iv.items()},
                 "params": model.params()}
        if drift_recs:
            entry["drift"] = score(model, iv, drift_recs, drift_missed)
        report["models"][name] = entry
    base = report["models"]["baseline"]["test"]
    for name in ("monthly", "size"):
        report["models"][name]["criteria"] = judge(report["models"][name]["test"], base)
    passed = [n for n in ("monthly", "size") if report["models"][n]["criteria"]["pass"]]
    passed.sort(key=lambda n: report["models"][n]["test"]["median_log_error"])
    report["chosen"] = passed[0] if passed else None
    # Nothing passed: the page still needs a number, so it shows the monthly ratio and says "uncalibrated".
    report["used"] = report["chosen"] or "monthly"
    report["calibrated"] = bool(passed)
    return report, fitted, intervals


# ---- output ----

def estimates(blockmonths, satmonths, sat, model):
    """{(bi, bj, y, m): [viirs count, estimate]} for every month the satellite has data."""
    recs, _ = build_records(blockmonths, satmonths, sat, range(1900, 2200), need_ref=False)
    out = defaultdict(lambda: [0, 0.0])
    for r in recs:
        t = out[(r.bi, r.bj, r.y, r.m)]
        t[0] += r.x
        t[1] += model.predict(r)
    return out


def region_series(blockmonths, satmonths, est, intervals):
    """Monthly totals for the whole region: real Aqua where its month is good, and the estimate."""
    aqua = defaultdict(int)
    for (bi, bj, y, m, s, dn), v in blockmonths.items():
        if s == REF:
            aqua[(y, m)] += v["n_det"]
    ref_ok = good_months(satmonths, REF)
    total = defaultdict(float)
    for (bi, bj, y, m), (_, hat) in est.items():
        total[(y, m)] += hat
    rows = []
    for ym in sorted(set(total) | (set(aqua) & ref_ok)):
        row = {"year": ym[0], "month": ym[1], "aqua": aqua[ym] if ym in ref_ok else None}
        if ym in total:
            lo, hi = interval(total[ym], intervals)
            row.update(est=round(total[ym], 1), lo=round(lo, 1), hi=round(hi, 1))
        rows.append(row)
    return rows


def year_errors(result):
    return "  ".join("{}: {:+.0%}".format(y, v["error"]) for y, v in result["years"].items())


def print_report(report):
    print("satellite {}, train {}, test {}, {} training records".format(
        report["sat"], report["train_years"], report["test_years"], report["n_train"]))
    for name, entry in report["models"].items():
        t = entry["test"]
        crit = entry.get("criteria")
        verdict = ""
        if crit is not None:
            verdict = "  " + " ".join("{}={}".format(k, "ok" if crit[k] else "FAIL") for k in ("C1", "C2", "C3"))
        print("  {:9s} median log error {:.3f}  coverage {:.0%}  {}{}".format(
            name, t["median_log_error"], t["coverage"], year_errors(t), verdict))
        if "drift" in entry:
            print("  {:9s} drift years: {}".format("", year_errors(entry["drift"])))
    print("chosen: {}  (page uses {}, calibrated={})".format(report["chosen"], report["used"], report["calibrated"]))


def year_range(text):
    a, _, b = text.partition("-")
    return range(int(a), int(b or a) + 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", choices=sorted(grid.REGIONS), required=True)
    ap.add_argument("--out", default="data/out")
    ap.add_argument("--sat", default="N", choices=grid.VIIRS_SATS)
    ap.add_argument("--train", default=None, help="training years, for example 2020-2021 (default 2012-2019)")
    ap.add_argument("--test", default=None, help="test years, for example 2022 (default 2020-2022)")
    args = ap.parse_args()
    train = year_range(args.train) if args.train else TRAIN_YEARS
    test = year_range(args.test) if args.test else TEST_YEARS
    drift = range(max(DRIFT_YEARS[0], test[-1] + 1), DRIFT_YEARS[-1] + 1)
    # Only the default run (Suomi NPP, default years) writes the files the pack reads.
    suffix = "" if (args.sat, train, test) == ("N", TRAIN_YEARS, TEST_YEARS) else f"_{args.sat}"
    out = Path(args.out) / args.region
    blockmonths = celldays.read_blockmonths(out / "blockmonths.csv")
    satmonths = celldays.read_satmonths(out / "satmonths.csv")
    report, fitted, intervals = run(blockmonths, satmonths, args.sat, train, test, drift)
    print_report(report)
    model, iv = fitted[report["used"]], intervals[report["used"]]
    est = estimates(blockmonths, satmonths, args.sat, model)
    report["series"] = region_series(blockmonths, satmonths, est, iv)
    report["criteria_definition"] = {"C1_factor": C1_FACTOR, "C2_range": C2_RANGE, "C3_limit": C3_LIMIT}
    (out / f"harmonize{suffix}.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    with (out / f"harmonized{suffix}.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["bi", "bj", "year", "month", "sat", "viirs", "est"])
        for (bi, bj, y, m), (x, hat) in sorted(est.items()):
            w.writerow([bi, bj, y, m, args.sat, x, round(hat, 2)])
    print("wrote harmonize{0}.json and {1} block-months to harmonized{0}.csv in {2}".format(suffix, len(est), out))


if __name__ == "__main__":
    main()
