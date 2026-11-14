"""Shared grid, week and channel definitions.

Cells are 0.1 degree, blocks 0.5 degree (5 x 5 cells). Every VIIRS satellite keeps its own
channels from the start, because pooling satellites at grid time hides how many satellites
were in orbit, and that number changes over the record.
"""

import math
from datetime import date

CELL = 0.1
BLOCK = 0.5
CELLS_PER_BLOCK = 5
# 0.3 / 0.1 is just below 3 in floating point; nudge before flooring.
EPS = 1e-9

SEA = {"lat_min": -11.0, "lat_max": 8.0, "lon_min": 94.0, "lon_max": 142.0}
WNA = {"lat_min": 36.0, "lat_max": 46.0, "lon_min": -124.0, "lon_max": -116.0}
REGIONS = {"sea": SEA, "wna": WNA}

VIIRS_SATS = ("N", "N20", "N21")          # Suomi NPP, NOAA-20, NOAA-21
VIIRS_LEVELS = ("low", "nominal", "high")
MODIS_SATS = ("A", "T")                   # Aqua, Terra
MODIS_EDGES = (30, 50, 70, 80)
MODIS_LOWER = (0,) + MODIS_EDGES

CHANNELS = tuple(
    [f"v{s}_{lvl}" for s in VIIRS_SATS for lvl in VIIRS_LEVELS]
    + [f"{m.lower()}_{lo}" for m in MODIS_SATS for lo in MODIS_LOWER]
)
CH = {name: k for k, name in enumerate(CHANNELS)}


def cell_index(lat, lon, size=CELL):
    return (math.floor(lat / size + EPS), math.floor(lon / size + EPS))


def block_of(i, j):
    return (i // CELLS_PER_BLOCK, j // CELLS_PER_BLOCK)


def cell_center(i, j, size=CELL):
    return ((i + 0.5) * size, (j + 0.5) * size)


def iso_week(day):
    """'2026-08-31' -> (2026, 36). ISO year: early January can belong to the previous year."""
    y, w, _ = date.fromisoformat(day[:10]).isocalendar()
    return (y, w)


def week_label(y, w):
    return f"{y}-W{w:02d}"


def in_bbox(lat, lon, bbox):
    return bbox["lat_min"] <= lat <= bbox["lat_max"] and bbox["lon_min"] <= lon <= bbox["lon_max"]


def modis_bucket(conf):
    return sum(1 for edge in MODIS_EDGES if conf >= edge)


def channel(family, sat, conf):
    """Channel name for one detection, or None when the satellite or confidence is unknown."""
    if family == "viirs":
        if sat in VIIRS_SATS and conf in VIIRS_LEVELS:
            return f"v{sat}_{conf}"
        return None
    if family == "modis" and sat in MODIS_SATS:
        return f"{sat.lower()}_{MODIS_LOWER[modis_bucket(int(conf))]}"
    return None


def viirs_active(counts, sat):
    """At least one nominal or high detection from this VIIRS satellite."""
    return counts[CH[f"v{sat}_nominal"]] + counts[CH[f"v{sat}_high"]] > 0


def aqua_active(counts):
    """At least one Aqua detection at confidence 30 or higher."""
    return sum(counts[CH[f"a_{lo}"]] for lo in MODIS_EDGES) > 0
