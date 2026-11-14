from datetime import date

import aod
import grid

SAMPLE = """lat;lon;validdate;total_aod_550nm:idx
-0.25;101.25;2019-09-01T06:00:00Z;0.4
-0.25;101.25;2019-09-02T06:00:00Z;1.0
-0.25;101.25;2019-09-03T06:00:00Z;2.5
-0.25;101.25;2019-09-04T06:00:00Z;-999
0.25;101.75;2019-09-01T06:00:00Z;0.2
"""


def test_month_span_clips_to_record():
    assert aod.month_span(2015, 11) == (date(2015, 11, 21), date(2015, 11, 30))
    assert aod.month_span(2015, 10) is None
    assert aod.month_span(2026, 11, last=date(2026, 11, 13)) == (date(2026, 11, 1), date(2026, 11, 13))


def test_month_url_asks_for_block_centres():
    url = aod.month_url(grid.SEA, date(2019, 9, 1), date(2019, 9, 30))
    assert url.endswith("/2019-09-01T06:00:00Z--2019-09-30T06:00:00Z:P1D/total_aod_550nm:idx/"
                        "7.75,94.25_-10.75,141.75:0.5,0.5/csv")


def test_summarize_counts_smoke_days_and_skips_missing_values():
    rows = aod.summarize(SAMPLE)
    assert rows == [[-1, 202, 2019, 9, 3, 2, 1.3, 2.5], [0, 203, 2019, 9, 1, 0, 0.2, 0.2]]


def test_fetch_all_caches_closed_months_only(tmp_path, monkeypatch):
    calls = []

    def get(url, user, password):
        calls.append(url)
        return SAMPLE
    monkeypatch.setattr(aod, "FIRST_DAY", date(2019, 8, 1))
    rows = aod.fetch_all(tmp_path, "sea", "u", "p", date(2019, 9, 10), get=get, log=lambda s: None)
    assert len(calls) == 2 and len(rows) == 4
    assert (tmp_path / "sea/aod/2019-08.csv").exists() and not (tmp_path / "sea/aod/2019-09.csv").exists()
    aod.fetch_all(tmp_path, "sea", "u", "p", date(2019, 9, 10), get=get, log=lambda s: None)
    assert len(calls) == 3                       # August came from the cache
    aod.write_csv(tmp_path / "out.csv", aod.summarize(SAMPLE))
    assert aod.read_aodmonths(tmp_path / "out.csv")[(-1, 202, 2019, 9)]["smoke_days"] == 2
