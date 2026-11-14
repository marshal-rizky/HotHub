import urllib.error
from datetime import date

import pytest

import fetch
import grid


# ---- grid ----

def test_cell_index_float_edges():
    assert grid.cell_index(0.3, 0.3) == (3, 3)
    assert grid.cell_index(-0.0001, 0.0) == (-1, 0)


def test_block_and_week():
    assert grid.block_of(-3, 7) == (-1, 1)
    assert grid.iso_week("2021-01-03") == (2020, 53)
    assert grid.week_label(2026, 5) == "2026-W05"


def test_channels_keep_each_viirs_satellite():
    assert len(grid.CHANNELS) == 19
    assert grid.channel("viirs", "N21", "high") == "vN21_high"
    assert grid.channel("viirs", "X", "high") is None
    assert grid.channel("modis", "A", 51) == "a_50"
    assert grid.channel("modis", "T", 10) == "t_0"


def test_active_rules():
    c = [0] * len(grid.CHANNELS)
    c[grid.CH["vN_low"]] = 3
    c[grid.CH["a_0"]] = 2
    assert not grid.viirs_active(c, "N") and not grid.aqua_active(c)
    c[grid.CH["vN_nominal"]] = 1
    c[grid.CH["a_30"]] = 1
    assert grid.viirs_active(c, "N") and not grid.viirs_active(c, "N20") and grid.aqua_active(c)


# ---- fetch: normalisation ----

def props(**kw):
    base = {"LATITUDE": 0.5, "LONGITUDE": 100.5, "ACQ_DATE": "2024-09-02", "ACQ_TIME": "0612",
            "CONFIDENCE": "n", "SATELLITE": "N20", "FRP": 3.5}
    base.update(kw)
    return base


def test_viirs_sat_comes_from_layer_not_attribute():
    row = fetch.normalize(props(SATELLITE="1"), "viirs_n20", grid.SEA, "2022-04-01")
    assert row["sat"] == "N20" and row["sat_raw"] == "1" and row["conf"] == "nominal"


def test_old_modis_labels_and_slash_dates_are_normalised():
    row = fetch.normalize(props(SATELLITE="Aqua", CONFIDENCE=55, ACQ_DATE="2022/03/01"), "modis", grid.SEA, "x")
    assert (row["sat"], row["date"], row["conf"]) == ("A", "2022-03-01", 55)
    assert fetch.normalize(props(SATELLITE="Terra", CONFIDENCE=10), "modis", grid.SEA, "x")["sat"] == "T"


def test_normalize_drops_bad_rows():
    assert fetch.normalize(props(LATITUDE=20.0), "viirs_n20", grid.SEA, "d") is None
    assert fetch.normalize(props(CONFIDENCE="?"), "viirs_n20", grid.SEA, "d") is None
    assert fetch.normalize(props(SATELLITE="Z", CONFIDENCE=50), "modis", grid.SEA, "d") is None


# ---- fetch: HTTP behaviour ----

def http_error(code):
    return urllib.error.HTTPError("u", code, "x", {}, None)


def tile_fn_from(answers):
    """answers: list consumed per call; an int is an HTTP error code, a list is properties, None is a 404."""
    it = iter(answers)

    def fn(*_):
        a = next(it)
        if isinstance(a, int):
            raise http_error(a)
        return a
    return fn


def test_all_400_day_is_unavailable():
    n = len(fetch.tile_range(4, grid.SEA))
    with pytest.raises(fetch.DayUnavailable):
        fetch.fetch_day("modis", "2024-01-01", grid.SEA, workers=1, tile_fn=tile_fn_from([400] * n))


def test_some_400_raises():
    n = len(fetch.tile_range(4, grid.SEA))
    with pytest.raises(urllib.error.HTTPError):
        fetch.fetch_day("modis", "2024-01-01", grid.SEA, workers=1, tile_fn=tile_fn_from([400] + [[]] * (n - 1)))


def test_overlapping_tiles_dedupe_and_all_404_flag():
    n = len(fetch.tile_range(4, grid.SEA))
    p = props()
    rows, all_404 = fetch.fetch_day("viirs_n20", "2024-09-02", grid.SEA, workers=1,
                                    tile_fn=tile_fn_from([[p], [p]] + [[]] * (n - 2)))
    assert len(rows) == 1 and not all_404
    _, all_404 = fetch.fetch_day("viirs_n20", "2024-09-02", grid.SEA, workers=1, tile_fn=tile_fn_from([None] * n))
    assert all_404


def test_fetch_tile_does_not_retry_400_but_retries_503():
    calls = []

    def opener(req, timeout):
        calls.append(1)
        raise http_error(400 if len(calls) == 1 else 503)
    with pytest.raises(urllib.error.HTTPError):
        fetch.fetch_tile("L", "d", 4, 0, 0, "500m", opener=opener, sleep=lambda s: None)
    assert len(calls) == 1
    calls.clear()
    calls.append(0)  # next call raises 503 every time
    with pytest.raises(urllib.error.HTTPError):
        fetch.fetch_tile("L", "d", 4, 0, 0, "500m", opener=opener, sleep=lambda s: None)
    assert len(calls) == 4  # 1 placeholder + 3 attempts


def test_fetch_range_gaps_cache_and_recent_days(tmp_path):
    n = len(fetch.tile_range(4, grid.SEA))
    ranges = [(date(2024, 9, 2), date(2024, 9, 3))]
    stats = fetch.fetch_range(tmp_path, "sea", "viirs_n20", "2024-09-01", "2024-09-03", workers=1, ranges=ranges,
                              tile_fn=tile_fn_from([[props()]] + [[]] * (2 * n)), today=date(2024, 9, 9))
    assert stats == {"gaps": 1, "fetched": 2}
    assert (tmp_path / "sea/viirs_n20/gaps.txt").read_text().split() == ["2024-09-01"]
    assert fetch.cache_path(tmp_path, "sea", "viirs_n20", "2024-09-02").exists()
    # 2024-09-03 is within RECENT_DAYS of "today": fetched, not cached.
    assert not fetch.cache_path(tmp_path, "sea", "viirs_n20", "2024-09-03").exists()
    again = fetch.fetch_range(tmp_path, "sea", "viirs_n20", "2024-09-02", "2024-09-02", ranges=ranges,
                              tile_fn=tile_fn_from([]), today=date(2024, 9, 9))
    assert again == {"cached": 1}


def test_network_errors_wait_then_record_failed_day_and_continue(tmp_path):
    n = len(fetch.tile_range(4, grid.SEA))
    waits = []

    def tile_fn(layer, day, *_):
        if day == "2024-09-01":
            raise urllib.error.URLError("timed out")
        return []
    stats = fetch.fetch_range(tmp_path, "sea", "modis", "2024-09-01", "2024-09-02", workers=1, tile_fn=tile_fn,
                              today=date(2024, 12, 1), sleep=waits.append)
    assert stats == {"failed": 1, "fetched": 1}
    assert waits == list(fetch.NETWORK_WAITS)
    assert (tmp_path / "sea/modis/failed.txt").read_text().split() == ["2024-09-01"]
    assert not fetch.cache_path(tmp_path, "sea", "modis", "2024-09-01").exists()


def test_network_error_recovers_after_one_wait(tmp_path):
    n = len(fetch.tile_range(4, grid.SEA))
    calls = {"k": 0}

    def tile_fn(*_):
        calls["k"] += 1
        if calls["k"] == 1:
            raise urllib.error.HTTPError("u", 503, "x", {}, None)
        return []
    waits = []
    stats = fetch.fetch_range(tmp_path, "sea", "modis", "2024-09-01", "2024-09-01", workers=1, tile_fn=tile_fn,
                              today=date(2024, 12, 1), sleep=waits.append)
    assert stats == {"fetched": 1} and waits == [30]


def test_partial_400_day_is_retried_not_fatal(tmp_path):
    n = len(fetch.tile_range(4, grid.SEA))
    waits = []
    stats = fetch.fetch_range(tmp_path, "sea", "modis", "2024-09-01", "2024-09-01", workers=1,
                              tile_fn=tile_fn_from([400] + [[]] * (n - 1) + [[]] * n),
                              today=date(2024, 12, 1), sleep=waits.append)
    assert stats == {"fetched": 1} and waits == [30]


def test_n21_override_and_round_trip(tmp_path):
    assert fetch.is_gap(date(2024, 8, 12), "viirs_n21", None)
    assert not fetch.is_gap(date(2024, 8, 13), "viirs_n21", None)
    row = fetch.normalize(props(), "viirs_n20", grid.SEA, "d")
    path = fetch.cache_path(tmp_path, "sea", "viirs_n20", "2024-09-02")
    fetch.write_rows(path, [row])
    back = fetch.read_rows(path)[0]
    assert back["lat"] == 0.5 and back["sat"] == "N20"


def test_parse_ranges():
    xml = ("<Layer><ows:Identifier>L1</ows:Identifier><Value>2020-01-01/2020-02-01/P1D</Value>"
           "<Value>2020-03-01/2020-04-01/P1D</Value></Layer>")
    assert fetch.parse_ranges(xml) == {"L1": [(date(2020, 1, 1), date(2020, 2, 1)), (date(2020, 3, 1), date(2020, 4, 1))]}
