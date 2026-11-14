import celldays
import grid


def row(**kw):
    base = {"date": "2015-09-02", "time": "0612", "lat": 0.52, "lon": 100.53, "family": "viirs",
            "sat": "N", "sat_raw": "N", "conf": "nominal", "frp": 4.0}
    base.update(kw)
    return base


def test_day_or_night_uses_local_solar_time():
    assert celldays.day_or_night("0612", 100.5) == "D"    # 06:12 UTC + 6.7 h = 12:54 local
    assert celldays.day_or_night("1830", 100.5) == "N"    # 01:12 local
    assert celldays.day_or_night("612", 100.5) == "D"     # leading zero lost
    assert celldays.day_or_night("2300", 105.0) == "D"    # 06:00 local, next day
    assert celldays.day_or_night("2259", 105.0) == "N"


def test_low_confidence_counts_in_cellmonths_but_not_blockmonths():
    t = celldays.Tables()
    t.add_day([row(conf="low"), row(family="modis", sat="A", conf=20), row(family="modis", sat="A", conf=30)])
    i, j = grid.cell_index(0.52, 100.53)
    counts = t.cellmonths[(i, j, 2015, 9)]
    assert counts[grid.CH["vN_low"]] == 1 and counts[grid.CH["a_0"]] == 1 and counts[grid.CH["a_30"]] == 1
    assert list(t.blockmonths) == [(*grid.block_of(i, j), 2015, 9, "A", "D")]


def test_blockmonth_sums_and_celldays_dedupe():
    t = celldays.Tables()
    t.add_day([row(frp=4.0), row(frp=6.0, conf="high"), row(lat=0.61, frp=1.0), row(time="1830")])
    t.add_day([row(date="2015-09-03")])
    i, j = grid.cell_index(0.52, 100.53)
    day = t.blockmonths[(*grid.block_of(i, j), 2015, 9, "N", "D")]
    assert day == [4, 3, 15.0, 1]          # 4 detections, 3 cell-days (2 cells day one, 1 cell day two), FRP 4+6+1+4
    night = t.blockmonths[(*grid.block_of(i, j), 2015, 9, "N", "N")]
    assert night == [1, 1, 4.0, 0]
    assert t.sat_days[(2015, 9, "N")] == {"2015-09-02", "2015-09-03"}


def test_satellites_stay_separate():
    t = celldays.Tables()
    t.add_day([row(sat="N"), row(sat="N20"), row(family="modis", sat="T", conf=90)])
    assert {k[4] for k in t.blockmonths} == {"N", "N20", "T"}
    assert t.blockmonths[next(k for k in t.blockmonths if k[4] == "T")][3] == 1


def test_static_cells_need_share_and_years_and_respect_training_years():
    t = celldays.Tables()
    for year in (2012, 2013, 2014, 2020):
        for d in range(1, 11):
            day = f"{year}-01-{d:02d}"
            rows = [row(date=day)]                                   # cell A: every day
            if d <= 4:
                rows.append(row(date=day, lat=3.05, lon=110.05))     # cell B: 40% of days
            t.add_day(rows)
    a = grid.cell_index(0.52, 100.53)
    assert t.static_cells() == {a: 4}
    assert t.static_cells(years={2012, 2013, 2014}) == {a: 3}
    assert t.static_cells(years={2012, 2013}) == {}


def test_tables_round_trip(tmp_path):
    t = celldays.Tables()
    t.add_day([row(), row(family="modis", sat="A", conf=85, frp=20.25)])
    celldays.write_tables(tmp_path, t, {(5, 1005): 3})
    i, j = grid.cell_index(0.52, 100.53)
    cm = celldays.read_cellmonths(tmp_path / "cellmonths.csv")
    assert cm[(i, j, 2015, 9)][grid.CH["vN_nominal"]] == 1 and cm[(i, j, 2015, 9)][grid.CH["a_80"]] == 1
    bm = celldays.read_blockmonths(tmp_path / "blockmonths.csv")
    assert bm[(*grid.block_of(i, j), 2015, 9, "A", "D")] == {"n_det": 1, "n_celldays": 1, "frp": 20.2, "n_high": 1}
    assert celldays.read_satmonths(tmp_path / "satmonths.csv") == {(2015, 9, "A"): 1, (2015, 9, "N"): 1}
    assert celldays.read_static_cells(tmp_path / "static_cells.csv") == {(5, 1005): 3}


def test_parse_years():
    assert celldays.parse_years("2012-2014") == {2012, 2013, 2014}
    assert celldays.parse_years("2019") == {2019}
