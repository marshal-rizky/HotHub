"""Fetch active-fire detections from NASA GIBS vector tiles (no key), one cached CSV per source and day.

Usage:
    python pipeline/fetch.py --region sea --source viirs_n20 --start 2024-08-01 --end 2024-08-07
    python pipeline/fetch.py --region sea --source modis --audit

GIBS behaviour handled here (all measured):
- HTTP 400 means no data for that layer and day: never retried. A day where every tile is 400 is a gap.
- HTTP 404 means an empty tile. A day where every tile is 404 is cached as empty and listed for review.
- ACQ_DATE is YYYY/MM/DD on some days; SATELLITE labels changed over time (Aqua -> A, NOAA-20 1 -> N20).
  Both are normalised here, and the raw satellite label is kept in `sat_raw` for the audit table.
- VIIRS satellite comes from the layer, not the attribute, so labels can never drop a satellite.
"""

import argparse
import csv
import gzip
import os
import re
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

import mapbox_vector_tile as mvt

import grid

TILE_URL = ("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/"
            "{layer}/default/{day}/{tms}/{z}/{row}/{col}.mvt")
CAPS_URL = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml"
LAYERS = {
    "viirs_snpp": ("VIIRS_SNPP_Thermal_Anomalies_375m_All", "500m", "N"),
    "viirs_n20": ("VIIRS_NOAA20_Thermal_Anomalies_375m_All", "500m", "N20"),
    "viirs_n21": ("VIIRS_NOAA21_Thermal_Anomalies_375m_All", "500m", "N21"),
    "modis": ("MODIS_Combined_Thermal_Anomalies_All", "1km", None),
}
# NOAA-21 is listed from 2024-01-17 but every SEA tile is HTTP 400 until 2024-08-13.
START_OVERRIDES = {"viirs_n21": date(2024, 8, 13)}
MODIS_SAT = {"A": "A", "Aqua": "A", "T": "T", "Terra": "T"}
VIIRS_CONF = {"l": "low", "n": "nominal", "h": "high", "low": "low", "nominal": "nominal", "high": "high"}
FIELDS = ["date", "time", "lat", "lon", "family", "sat", "sat_raw", "conf", "frp"]
WIDTHS = [2, 3, 5, 10, 20, 40, 80, 160]  # GIBS EPSG:4326 matrix widths, levels 0-7
RECENT_DAYS = 7      # newer days are fetched but not cached: GIBS may still be filling them
CAPS_MAX_AGE = 86400
UA = {"User-Agent": "spaceapps-fire-calendar/1.0"}

_LAYER_RE = re.compile(r"<Layer>(.*?)</Layer>", re.S)
_IDENT_RE = re.compile(r"<ows:Identifier>([^<]+)</ows:Identifier>")
_RANGE_RE = re.compile(r"<Value>(\d{4}-\d{2}-\d{2})/(\d{4}-\d{2}-\d{2})/P1D</Value>")


class DayUnavailable(Exception):
    """Every tile of the day answered HTTP 400."""


def tile_range(zoom, bbox):
    deg = 360.0 / WIDTHS[zoom]
    cols = range(int((bbox["lon_min"] + 180) // deg), int((bbox["lon_max"] + 180) // deg) + 1)
    rows = range(int((90 - bbox["lat_max"]) // deg), int((90 - bbox["lat_min"]) // deg) + 1)
    return [(r, c) for r in rows for c in cols]


def fetch_tile(layer, day, zoom, row, col, tms, retries=3, opener=urllib.request.urlopen, sleep=time.sleep):
    """Feature properties of one tile; None for HTTP 404. HTTP 400 and other 4xx raise at once."""
    url = TILE_URL.format(layer=layer, day=day, tms=tms, z=zoom, row=row, col=col)
    for attempt in range(retries):
        try:
            raw = opener(urllib.request.Request(url, headers=UA), timeout=60).read()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            if (exc.code < 500 and exc.code != 429) or attempt == retries - 1:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == retries - 1:
                raise
        else:
            if not raw:
                return []
            if raw[:2] == b"\x1f\x8b":
                raw = gzip.decompress(raw)
            return [f["properties"] for layer_data in mvt.decode(raw).values() for f in layer_data["features"]]
        sleep(2 ** attempt)
    return []


def normalize(props, source, bbox, day):
    """One cache row from tile properties, or None when it is outside the bbox or unreadable."""
    lat, lon = props.get("LATITUDE"), props.get("LONGITUDE")
    if lat is None or lon is None or not grid.in_bbox(lat, lon, bbox):
        return None
    sat_raw = str(props.get("SATELLITE", ""))
    family = "modis" if source == "modis" else "viirs"
    if family == "viirs":
        sat = LAYERS[source][2]
        conf = VIIRS_CONF.get(str(props.get("CONFIDENCE", "")).lower())
    else:
        sat = MODIS_SAT.get(sat_raw)
        try:
            conf = int(props.get("CONFIDENCE"))
        except (TypeError, ValueError):
            conf = None
    if sat is None or conf is None:
        return None
    return {"date": str(props.get("ACQ_DATE") or day).replace("/", "-")[:10],
            "time": str(props.get("ACQ_TIME") or "").replace(":", ""),
            "lat": float(lat), "lon": float(lon), "family": family, "sat": sat,
            "sat_raw": sat_raw, "conf": conf, "frp": float(props.get("FRP") or 0.0)}


def _tile_or_400(tile_fn, *args):
    try:
        return tile_fn(*args)
    except urllib.error.HTTPError as exc:
        if exc.code == 400:
            return exc
        raise


def fetch_day(source, day, bbox, zoom=4, workers=8, tile_fn=fetch_tile):
    """(rows, all_404). Raises DayUnavailable when every tile is 400, HTTPError when only some are."""
    layer, tms, _ = LAYERS[source]
    jobs = tile_range(zoom, bbox)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(lambda rc: _tile_or_400(tile_fn, layer, day, zoom, rc[0], rc[1], tms), jobs))
    bad = [r for r in results if isinstance(r, urllib.error.HTTPError)]
    if bad and len(bad) == len(results):
        raise DayUnavailable(f"{source} {day}: all {len(bad)} tiles HTTP 400")
    if bad:
        raise bad[0]
    seen, rows = set(), []
    for props_list in results:
        for props in props_list or []:
            row = normalize(props, source, bbox, day)
            if row is None:
                continue
            key = (round(row["lat"], 5), round(row["lon"], 5), row["date"], row["time"], row["sat"])
            if key not in seen:   # tiles overlap at their edges
                seen.add(key)
                rows.append(row)
    return rows, all(r is None for r in results)


def cache_path(root, region, source, day):
    return Path(root) / region / source / f"{day}.csv"


def write_rows(path, rows):
    """Temp file then rename: an interrupted run never leaves a partial day."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    with tmp.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    try:
        os.replace(tmp, path)
    except PermissionError:
        # Windows: another fetch process is writing the same day. Its copy is as good as ours.
        tmp.unlink(missing_ok=True)
        if not path.exists():
            raise


def read_rows(path):
    out = []
    with Path(path).open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            r["lat"], r["lon"], r["frp"] = float(r["lat"]), float(r["lon"]), float(r["frp"])
            if r["family"] == "modis":
                r["conf"] = int(r["conf"])
            out.append(r)
    return out


def parse_ranges(xml_text):
    """WMTS capabilities -> {layer: [(first_day, last_day), ...]}."""
    out = {}
    for block in _LAYER_RE.findall(xml_text):
        ident = _IDENT_RE.search(block)
        if ident:
            out[ident.group(1)] = [(date.fromisoformat(a), date.fromisoformat(b)) for a, b in _RANGE_RE.findall(block)]
    return out


def capabilities_ranges(root):
    path = Path(root) / "gibs_capabilities.xml"
    if not path.exists() or time.time() - path.stat().st_mtime >= CAPS_MAX_AGE:
        path.parent.mkdir(parents=True, exist_ok=True)
        raw = urllib.request.urlopen(urllib.request.Request(CAPS_URL, headers=UA), timeout=120).read()
        tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")  # parallel streams each write their own
        tmp.write_bytes(raw)
        os.replace(tmp, path)
    return parse_ranges(path.read_text(encoding="utf-8"))


def is_gap(day, source, ranges):
    start = START_OVERRIDES.get(source)
    if start and day < start:
        return True
    return ranges is not None and not any(a <= day <= b for a, b in ranges)


def _log_once(path, iso):
    path.parent.mkdir(parents=True, exist_ok=True)
    seen = set(path.read_text(encoding="utf-8").split()) if path.exists() else set()
    if iso not in seen:
        with path.open("a", encoding="utf-8") as fh:
            fh.write(iso + "\n")


class NetworkDown(Exception):
    """A day kept failing with network errors after every backoff wait."""


# Seconds to wait before each retry of a day that hit a network error (timeouts, resets, 5xx, 429).
NETWORK_WAITS = (30, 60, 120, 300, 900)


def _is_network_error(exc):
    if isinstance(exc, urllib.error.HTTPError):
        # A 400 on only some tiles of a day was seen to clear on retry (GIBS recovering from an outage).
        return exc.code >= 500 or exc.code in (400, 429)
    return isinstance(exc, (urllib.error.URLError, TimeoutError, ConnectionError))


def _fetch_day_patiently(source, iso, bbox, zoom, workers, tile_fn, sleep):
    """fetch_day, waiting out network trouble. Raises NetworkDown when every wait is used up."""
    for wait in (*NETWORK_WAITS, None):
        try:
            return fetch_day(source, iso, bbox, zoom, workers, tile_fn)
        except Exception as exc:  # noqa: BLE001 - classified below, anything else re-raises
            if not _is_network_error(exc):
                raise
            if wait is None:
                raise NetworkDown(f"{source} {iso}: {exc}") from exc
            print(f"{source} {iso} network error ({exc}); waiting {wait}s", flush=True)
            sleep(wait)


def fetch_range(root, region, source, start, end, zoom=4, workers=8, ranges=None, tile_fn=fetch_tile,
                today=None, newest_first=False, sleep=time.sleep):
    """Fetch every uncached day. Returns {'fetched', 'cached', 'gaps', 'failed'}."""
    bbox, today = grid.REGIONS[region], today or date.today()
    a, b = date.fromisoformat(start), date.fromisoformat(end)
    days = [a + timedelta(days=k) for k in range((b - a).days + 1)]
    if newest_first:
        days.reverse()
    stats = Counter()
    base = Path(root) / region / source
    for day in days:
        iso, path = day.isoformat(), cache_path(root, region, source, day.isoformat())
        if is_gap(day, source, ranges):
            _log_once(base / "gaps.txt", iso)
            stats["gaps"] += 1
            continue
        if path.exists():
            stats["cached"] += 1
            continue
        t0 = time.time()
        try:
            rows, all_404 = _fetch_day_patiently(source, iso, bbox, zoom, workers, tile_fn, sleep)
        except DayUnavailable:
            _log_once(base / "gaps.txt", iso)
            stats["gaps"] += 1
            continue
        except NetworkDown:
            _log_once(base / "failed.txt", iso)   # not cached: the next run tries it again
            stats["failed"] += 1
            continue
        if (today - day).days >= RECENT_DAYS:
            write_rows(path, rows)
            if all_404:
                _log_once(base / "empty_days.txt", iso)
        stats["fetched"] += 1
        print(f"{source} {iso} {len(rows)} rows {time.time() - t0:.1f}s", flush=True)
    return dict(stats)


def audit(root, region, source):
    """Counts per (year, sat, sat_raw) and per date format: label drift shows up here, not silently."""
    sats, fmts = Counter(), Counter()
    for path in sorted((Path(root) / region / source).glob("*.csv")):
        for r in read_rows(path):
            sats[(r["date"][:4], r["sat"], r["sat_raw"])] += 1
            fmts["iso" if re.fullmatch(r"\d{4}-\d{2}-\d{2}", r["date"]) else r["date"]] += 1
    return sats, fmts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", choices=sorted(grid.REGIONS), required=True)
    ap.add_argument("--source", choices=sorted(LAYERS), required=True)
    ap.add_argument("--start")
    ap.add_argument("--end")
    ap.add_argument("--root", default="data/raw")
    ap.add_argument("--zoom", type=int, default=4)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--newest-first", action="store_true")
    ap.add_argument("--audit", action="store_true", help="print the (year, sat) and date-format tables")
    args = ap.parse_args()
    if args.audit:
        sats, fmts = audit(args.root, args.region, args.source)
        for (y, s, raw), n in sorted(sats.items()):
            print(f"{y} {s:4s} raw={raw:6s} {n}")
        print("date formats:", dict(fmts))
        return
    t0 = time.time()
    ranges = capabilities_ranges(args.root).get(LAYERS[args.source][0])
    stats = fetch_range(args.root, args.region, args.source, args.start, args.end, args.zoom, args.workers,
                        ranges, newest_first=args.newest_first)
    print(f"done {args.source}: {stats}, {(time.time() - t0) / 60:.1f} min", flush=True)


if __name__ == "__main__":
    main()
