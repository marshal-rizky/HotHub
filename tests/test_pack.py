import json

import celldays
import grid
import pack


def test_month_index_and_cell_values():
    assert pack.month_index(2002, 1) == 0 and pack.month_index(2026, 11) == 298
    c = [0] * len(grid.CHANNELS)
    for name, n in (("a_0", 9), ("a_30", 1), ("a_80", 2), ("vN_low", 7), ("vN_nominal", 3), ("vN_high", 1),
                    ("vN20_high", 5), ("t_50", 4)):
        c[grid.CH[name]] = n
    aqua, viirs, raw = pack.cell_values(c, "N")
    assert (aqua, viirs) == (3, 4) and raw == {"N": 4, "N20": 5, "N21": 0, "T": 4}


def test_build_scales_cells_by_block_factor_and_drops_static(tmp_path):
    t = celldays.Tables()
    base = {"date": "2015-09-02", "time": "0612", "family": "viirs", "sat": "N", "sat_raw": "N",
            "conf": "nominal", "frp": 4.0}
    rows = [dict(base, lat=0.52, lon=100.53)] * 3 + [dict(base, lat=0.61, lon=100.53)]
    rows += [dict(base, lat=0.52, lon=100.53, family="modis", sat="A", conf=60)]
    rows += [dict(base, lat=3.05, lon=110.05)]
    t.add_day(rows)
    static_cell = grid.cell_index(3.05, 110.05)
    celldays.write_tables(tmp_path, t, {static_cell: 3})
    bi, bj = grid.block_of(*grid.cell_index(0.52, 100.53))
    (tmp_path / "harmonized.csv").write_text(f"bi,bj,year,month,sat,viirs,est\n{bi},{bj},2015,9,N,4,1.0\n")
    cells, raw_totals, static = pack.build(tmp_path, "N")
    idx = pack.month_index(2015, 9)
    assert cells == {"5,1005": [idx, 1, 8], "6,1005": [idx, 0, 2]}       # 3/4 and 1/4 of the block estimate, x10
    assert static == [static_cell] and raw_totals[idx]["N"] == 4


def test_smoke_blocks_keep_only_smoky_months(tmp_path):
    p = tmp_path / "aodmonths.csv"
    p.write_text("bi,bj,year,month,days,smoke_days,mean,max\n-1,202,2019,9,30,12,1.1,4.0\n-1,202,2019,8,31,0,0.3,0.8\n")
    blocks, first = pack.smoke_blocks(p)
    assert blocks == {"-1,202": [pack.month_index(2019, 9), 12, 30]} and first == pack.month_index(2019, 8)
    assert json.dumps(blocks)
