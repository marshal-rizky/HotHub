import math
import random

import harmonize as h


def make(n_blocks=40, years=range(2012, 2023), ratio=lambda m, dn: 0.2, seed=1, noise=True):
    """Synthetic blockmonths and satmonths: Aqua is Poisson-like around ratio * VIIRS."""
    rng = random.Random(seed)
    bm, sm = {}, {}
    for y in years:
        for m in range(1, 13):
            for sat in ("N", "A"):
                sm[(y, m, sat)] = 30
            for b in range(n_blocks):
                for dn in ("D", "N"):
                    x = int(rng.lognormvariate(3, 1)) + 1
                    mean = ratio(m, dn) * x
                    a = max(0, round(rng.gauss(mean, math.sqrt(mean)))) if noise else round(mean)
                    bm[(b, 0, y, m, "N", dn)] = {"n_det": x, "n_celldays": x, "frp": 5.0 * x, "n_high": x // 10}
                    if a:
                        bm[(b, 0, y, m, "A", dn)] = {"n_det": a, "n_celldays": a, "frp": 30.0 * a, "n_high": a // 3}
    return bm, sm


def test_pava_pools_violations():
    assert h.pava([1, 3, 2, 4], [1, 1, 1, 1]) == [1, 2.5, 2.5, 4]
    assert h.pava([3, 1], [1, 3]) == [1.5, 1.5]


def test_good_months_need_most_days():
    sm = {(2020, 1, "N"): 31, (2020, 2, "N"): 20, (2020, 3, "A"): 31}
    assert h.good_months(sm, "N") == {(2020, 1)}


def test_records_include_aqua_zero_and_count_missed():
    bm = {(0, 0, 2020, 1, "N", "D"): {"n_det": 4, "n_celldays": 2, "frp": 8.0, "n_high": 1},
          (1, 0, 2020, 1, "A", "D"): {"n_det": 3, "n_celldays": 3, "frp": 9.0, "n_high": 0},
          (0, 0, 2020, 2, "N", "D"): {"n_det": 9, "n_celldays": 2, "frp": 8.0, "n_high": 1}}
    sm = {(2020, 1, "N"): 31, (2020, 1, "A"): 31, (2020, 2, "N"): 29, (2020, 2, "A"): 3}
    recs, missed = h.build_records(bm, sm, "N", range(2020, 2021))
    assert [(r.x, r.aqua, r.frp, r.high) for r in recs] == [(4, 0, 2.0, 0.25)]   # February dropped: bad Aqua month
    assert dict(missed) == {2020: 3}
    recs, _ = h.build_records(bm, sm, "N", range(2020, 2021), need_ref=False)
    assert len(recs) == 2


def test_ratio_models_recover_the_ratio():
    bm, sm = make(noise=False)
    recs, _ = h.build_records(bm, sm, "N", h.TRAIN_YEARS)
    assert abs(h.GlobalRatio().fit(recs).ratio["D"] - 0.2) < 0.01
    bm, sm = make(ratio=lambda m, dn: 0.1 if m <= 6 else 0.3, noise=False)
    recs, _ = h.build_records(bm, sm, "N", h.TRAIN_YEARS)
    model = h.MonthlyRatio().fit(recs)
    assert abs(model.ratio[(1, "D")] - 0.1) < 0.01 and abs(model.ratio[(12, "N")] - 0.3) < 0.01


def test_curve_is_monotone_and_keeps_last_ratio():
    bm, sm = make(noise=True)
    recs, _ = h.build_records(bm, sm, "N", h.TRAIN_YEARS)
    curve = h.Curve(recs)
    values = [curve(x) for x in (0, 1, 2, 5, 10, 50, 200, 1000, 100000)]
    assert values[0] == 0 and values == sorted(values)
    assert abs(curve(100000) / 100000 - curve.ys[-1] / curve.xs[-1]) < 1e-9
    assert abs(curve(50) - 10) < 2


def test_intervals_and_bins():
    assert [h.size_bin(v) for v in (0, 9.9, 10, 999, 1000)] == [0, 0, 1, 2, 3]
    assert h.quantile([0, 1, 2, 3, 4], 0.5) == 2 and h.quantile([0, 10], 0.1) == 1
    lo, hi = h.interval(9, {0: (math.log(0.5), math.log(2))})
    assert (round(lo, 9), round(hi, 9)) == (4.0, 19.0)
    assert h.interval(0, {0: (-5, 0)})[0] == 0


def test_judge_applies_each_criterion():
    base = {"median_log_error": 1.0}
    good = {"median_log_error": 0.9, "coverage": 0.8, "years": {2020: {"error": 0.25}, 2021: {"error": -0.1}}}
    assert h.judge(good, base) == {"C1": True, "C2": True, "C3": True, "pass": True}
    assert not h.judge(dict(good, median_log_error=0.91), base)["C1"]
    assert not h.judge(dict(good, coverage=0.95), base)["C2"]
    assert not h.judge(dict(good, years={2020: {"error": 0.26}}), base)["C3"]


def test_run_scores_test_and_drift_years_and_rewards_seasonal_model():
    bm, sm = make(n_blocks=60, ratio=lambda m, dn: 0.08 if m <= 6 else 0.4, years=range(2012, 2025))
    report, fitted, intervals = h.run(bm, sm, "N")
    monthly, base = report["models"]["monthly"], report["models"]["baseline"]
    assert monthly["criteria"]["C1"]
    assert monthly["test"]["median_log_error"] < base["test"]["median_log_error"]
    assert set(monthly["test"]["years"]) == {2020, 2021, 2022}
    assert set(monthly["drift"]["years"]) == {2023, 2024}
    assert report["used"] in ("monthly", "size")


def test_run_reports_uncalibrated_when_nothing_beats_the_baseline():
    bm, sm = make(n_blocks=30)          # constant ratio: the baseline is already right
    report, _, _ = h.run(bm, sm, "N")
    assert report["chosen"] is None and report["used"] == "monthly" and report["calibrated"] is False


def test_estimates_and_region_series_cover_months_without_aqua():
    bm, sm = make(n_blocks=30, years=range(2012, 2023), noise=False)
    bm[(0, 0, 2030, 1, "N", "D")] = {"n_det": 100, "n_celldays": 50, "frp": 500.0, "n_high": 10}
    sm[(2030, 1, "N")] = 31
    report, fitted, intervals = h.run(bm, sm, "N")
    est = h.estimates(bm, sm, "N", fitted["monthly"])
    assert est[(0, 0, 2030, 1)][0] == 100 and abs(est[(0, 0, 2030, 1)][1] - 20) < 1
    last = h.region_series(bm, sm, est, intervals["monthly"])[-1]
    assert (last["year"], last["aqua"]) == (2030, None) and last["lo"] <= last["est"] <= last["hi"]
