// Pure functions only: no DOM, no fetch. WEB-SPEC section 6.
// A "pack" here is { meta, aquaSet, estSet, firstMonth, lastMonth } (built in data.js).
// A "cell" is { lat, lon, t } with lat/lon the cell centre and t the triplets [m, aqua, est10, ...].

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

export const toIndex = (year, month) => (year - 2002) * 12 + (month - 1);
export const toYearMonth = m => ({ year: 2002 + Math.floor(m / 12), month: m % 12 + 1 });
export const monthLabel = m => `${MONTH_NAMES[m % 12]} ${2002 + Math.floor(m / 12)}`;

// Accepts a comma or a point as decimal separator. Returns NaN for anything that is not a number.
export function parseNumber(text) {
  const s = String(text).trim().replace(',', '.');
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// area: { type: 'box', lat1, lon1, lat2, lon2 } or { type: 'pt', lat, lon, km }.
// A cell belongs to the area when its centre is inside (edges included).
export function selectCells(cells, area) {
  if (area.type === 'box') {
    const latMin = Math.min(area.lat1, area.lat2), latMax = Math.max(area.lat1, area.lat2);
    const lonMin = Math.min(area.lon1, area.lon2), lonMax = Math.max(area.lon1, area.lon2);
    return cells.filter(c => c.lat >= latMin && c.lat <= latMax && c.lon >= lonMin && c.lon <= lonMax);
  }
  return cells.filter(c => distanceKm(area.lat, area.lon, c.lat, c.lon) <= area.km);
}

// Checks an area against the region box. Returns an error text, or null when the area is valid.
export function areaError(area, bbox) {
  const range = `Latitude ${bbox.lat_min} to ${bbox.lat_max}, longitude ${bbox.lon_min} to ${bbox.lon_max}.`;
  const nums = area.type === 'box' ? [area.lat1, area.lon1, area.lat2, area.lon2] : [area.lat, area.lon, area.km];
  if (nums.some(n => !Number.isFinite(n))) return 'Enter numbers only. ' + range;
  const lats = area.type === 'box' ? [area.lat1, area.lat2] : [area.lat];
  const lons = area.type === 'box' ? [area.lon1, area.lon2] : [area.lon];
  if (lats.some(v => v < bbox.lat_min || v > bbox.lat_max) || lons.some(v => v < bbox.lon_min || v > bbox.lon_max)) {
    return 'Outside the region. ' + range;
  }
  if (area.type === 'pt' && (area.km < 5 || area.km > 500)) return 'Radius must be between 5 and 500 km.';
  return null;
}

// "#box=lat1,lon1,lat2,lon2" or "#pt=lat,lon,km". Returns null when the text is not an area.
export function parseHash(hash) {
  const m = /^#?(box|pt)=([-\d.,]+)$/.exec(hash || '');
  if (!m) return null;
  const n = m[2].split(',').map(Number);
  if (n.some(v => !Number.isFinite(v))) return null;
  if (m[1] === 'box' && n.length === 4) return { type: 'box', lat1: n[0], lon1: n[1], lat2: n[2], lon2: n[3] };
  if (m[1] === 'pt' && n.length === 3) return { type: 'pt', lat: n[0], lon: n[1], km: n[2] };
  return null;
}

export function formatHash(area) {
  const r = v => +v.toFixed(3);
  return area.type === 'box'
    ? `#box=${r(area.lat1)},${r(area.lon1)},${r(area.lat2)},${r(area.lon2)}`
    : `#pt=${r(area.lat)},${r(area.lon)},${r(area.km)}`;
}

export function interval(est, meta) {
  const bin = meta.size_edges.filter(e => est >= e).length;
  const [a, b] = meta.intervals[bin];
  return { low: Math.max(0, (est + 1) * Math.exp(a) - 1), high: (est + 1) * Math.exp(b) - 1 };
}

// Headline value of one month for given sums: Aqua where usable, else the estimate, else null.
export function headline(pack, m, aqua, est) {
  if (pack.aquaSet.has(m)) return aqua;
  if (pack.estSet.has(m)) return est;
  return null;
}

// One row per month from firstMonth to lastMonth for the given cells.
export function series(cells, pack) {
  const n = pack.lastMonth - pack.firstMonth + 1;
  const aqua = new Float64Array(n), est = new Float64Array(n);
  for (const c of cells) {
    const t = c.t;
    for (let k = 0; k < t.length; k += 3) {
      const at = t[k] - pack.firstMonth;
      if (at < 0 || at >= n) continue;
      aqua[at] += t[k + 1];
      est[at] += t[k + 2] / 10;
    }
  }
  const rows = [];
  for (let at = 0; at < n; at++) {
    const m = pack.firstMonth + at;
    const aquaOk = pack.aquaSet.has(m), estOk = pack.estSet.has(m);
    const source = aquaOk ? 'aqua' : estOk ? 'estimate' : 'none';
    const row = {
      m, aquaOk, estOk, source,
      aqua: aquaOk ? aqua[at] : null,
      est: estOk ? est[at] : null,
      value: aquaOk ? aqua[at] : estOk ? est[at] : null,
      low: null, high: null,
      drift: aquaOk && m >= pack.meta.drift_from,
    };
    if (estOk) Object.assign(row, interval(est[at], pack.meta));
    rows.push(row);
  }
  return rows;
}

function percentile(sorted, p) {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Normal for the calendar month of rows[at]: only earlier years that have a value are used.
export function normal(rows, at) {
  const value = rows[at].value;
  if (value === null) return { status: 'none', median: null, p25: null, p75: null, ratio: null, years: 0 };
  const earlier = [];
  for (let k = at - 12; k >= 0; k -= 12) if (rows[k].value !== null) earlier.push(rows[k].value);
  if (earlier.length < 5) return { status: 'short', median: null, p25: null, p75: null, ratio: null, years: earlier.length };
  earlier.sort((a, b) => a - b);
  const median = percentile(earlier, 0.5), p25 = percentile(earlier, 0.25), p75 = percentile(earlier, 0.75);
  const status = value > p75 ? 'above' : value < p25 ? 'below' : 'near';
  return { status, median, p25, p75, ratio: median > 0 ? value / median : null, years: earlier.length };
}

// Where rows[at] stands among the same calendar month of every year that has a value.
// rank 1 is the highest. highestSince / lowestSince: the last earlier year at least as high / as low
// (null when no earlier year was).
export function standing(rows, at) {
  const value = rows[at].value;
  if (value === null) return null;
  let of = 0, higher = 0, highestSince = null, lowestSince = null;
  for (let k = at % 12; k < rows.length; k += 12) {
    if (rows[k].value === null) continue;
    of++;
    if (rows[k].value > value) higher++;
  }
  for (let k = at - 12; k >= 0 && highestSince === null; k -= 12) {
    if (rows[k].value !== null && rows[k].value >= value) highestSince = toYearMonth(rows[k].m).year;
  }
  for (let k = at - 12; k >= 0 && lowestSince === null; k -= 12) {
    if (rows[k].value !== null && rows[k].value <= value) lowestSince = toYearMonth(rows[k].m).year;
  }
  return { rank: higher + 1, of, highestSince, lowestSince };
}

// The same calendar month in every year of the record, oldest first, for the small bar chart.
export function sameMonth(rows, at) {
  const list = [];
  for (let k = at % 12; k < rows.length; k += 12) {
    list.push({ year: toYearMonth(rows[k].m).year, value: rows[k].value, step: rows[k].step, current: k === at });
  }
  return list;
}

// Total per calendar year over the rows given. `months` counts the months that have a value:
// a year is complete only when it is 12.
export function yearTotals(rows) {
  const years = new Map();
  for (const r of rows) {
    const year = toYearMonth(r.m).year;
    if (!years.has(year)) years.set(year, { year, total: 0, months: 0 });
    if (r.value !== null) { years.get(year).total += r.value; years.get(year).months++; }
  }
  return [...years.values()];
}

// Ground covered by one 0.1 degree cell at the equator, in km2 (shrinks with the cosine of latitude).
export const CELL_KM2 = 11.132 * 11.057;

// Per month (index from firstMonth): how many of the cells had a hot spot, and the ground those cells cover.
// This is where heat was seen, not how much land burned.
export function spread(cells, pack) {
  const n = pack.lastMonth - pack.firstMonth + 1, count = new Int32Array(n), km2 = new Float64Array(n);
  for (const c of cells) {
    const size = CELL_KM2 * Math.cos(c.lat * Math.PI / 180), t = c.t;
    for (let k = 0; k < t.length; k += 3) {
      const at = t[k] - pack.firstMonth;
      if (at < 0 || at >= n) continue;
      if (headline(pack, t[k], t[k + 1], t[k + 2] / 10) > 0) { count[at]++; km2[at] += size; }
    }
  }
  return { count, km2 };
}

// Most thick-smoke days that any one block had, per month. Map: month index -> days.
export function smokeDays(blockKeys, smoke) {
  const days = new Map();
  if (!smoke) return days;
  for (const key of blockKeys) {
    const t = smoke[key];
    if (!t) continue;
    for (let k = 0; k < t.length; k += 3) if (t[k + 1] > (days.get(t[k]) || 0)) days.set(t[k], t[k + 1]);
  }
  return days;
}

// A familiar place to compare an area with: the largest one that fits inside it, else the smallest. Sizes in km2, rounded.
export const PLACES = [['Jakarta', 662], ['Bali', 5780], ['Java', 128300], ['Sumatra', 473500]];
export function likePlace(km2) {
  let pick = PLACES[0];
  for (const p of PLACES) if (km2 >= p[1]) pick = p;
  const times = km2 / pick[1];
  if (times < 0.95) return `about ${Math.max(1, Math.round(times * 100))}% of the size of ${pick[0]}`;
  if (times < 1.5) return `about the size of ${pick[0]}`;
  return `about ${times < 10 ? times.toFixed(1) : Math.round(times)} times the size of ${pick[0]}`;
}

export function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return n + 'th';
  return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
}

// Blocks ("bi,bj") that contain at least one of the cells.
export function blocksOf(cells) {
  const keys = new Set();
  for (const c of cells) keys.add(`${Math.floor(c.lat / 0.5)},${Math.floor(c.lon / 0.5)}`);
  return keys;
}

// Months in which any of the blocks reached the smoke-day threshold.
export function smokyMonths(blockKeys, smoke, meta) {
  const months = new Set();
  if (!smoke || !meta.smoke) return months;
  for (const key of blockKeys) {
    const t = smoke[key];
    if (!t) continue;
    for (let k = 0; k < t.length; k += 3) if (t[k + 1] >= meta.smoke.min_days) months.add(t[k]);
  }
  return months;
}

export function smokeState(meta, smoky, m) {
  if (!meta.smoke || m < meta.smoke.first_month) return 'nodata';
  return smoky.has(m) ? 'smoky' : 'clear';
}

// WEB-SPEC 6.6. Do not simplify.
export function sentence(status, smoke) {
  if (status === 'above') return 'Above normal for this month.';
  if (status === 'near') return 'Near normal for this month.';
  if (status === 'short') return 'History too short to say what is normal.';
  if (status === 'below') {
    if (smoke === 'clear') return 'Below normal for this month.';
    if (smoke === 'smoky') return 'Low count, but thick smoke was present and may have hidden fires.';
    return 'Low count. No smoke data for this period, so hidden fires cannot be ruled out.';
  }
  return 'No data for this month.';
}

export const SMOKE_TEXT = { smoky: 'Thick smoke present', clear: 'Air clear', nodata: 'No smoke data' };

// Colour step 0..4 of a value among all values of the same calendar month (the value itself included).
// Zero is always the lightest step. `zeros` counts values that are zero and not listed in `values`.
export function rankStep(value, values, zeros = 0) {
  if (!(value > 0)) return 0;
  const n = values.length + zeros;
  if (n < 2) return 0;
  let below = zeros;
  for (const v of values) if (v < value) below++;
  return Math.min(4, Math.floor(below / (n - 1) * 5));
}

// Adds smoke, normal, step and sentence to every row. `smoky` is the set from smokyMonths().
export function enrich(rows, pack, smoky) {
  const byCal = Array.from({ length: 12 }, () => []);
  for (const r of rows) if (r.value !== null) byCal[r.m % 12].push(r.value);
  rows.forEach((r, at) => {
    r.smoke = smokeState(pack.meta, smoky, r.m);
    r.normal = normal(rows, at);
    r.step = r.value === null ? null : rankStep(r.value, byCal[r.m % 12]);
    r.sentence = sentence(r.normal.status, r.smoke);
  });
  return rows;
}

const one = v => (v === null || v === undefined ? '' : v.toFixed(1));

export const CSV_HEADER = 'year,month,aqua,estimate,low,high,headline,source,drift,smoke,median,status';

// rows: enriched rows. Empty field when there is no value; one decimal for estimates.
export function csv(rows) {
  const lines = [CSV_HEADER];
  for (const r of rows) {
    const { year, month } = toYearMonth(r.m);
    lines.push([
      year, month,
      r.aqua === null ? '' : r.aqua,
      one(r.est), one(r.low), one(r.high),
      r.value === null ? '' : r.source === 'aqua' ? r.value : one(r.value),
      r.source, r.drift ? 'yes' : 'no', r.smoke,
      one(r.normal.median),
      r.normal.status === 'none' ? '' : r.normal.status,
    ].join(','));
  }
  return lines.join('\n') + '\n';
}

export function csvName(areaName, from, to) {
  const ym = m => { const { year, month } = toYearMonth(m); return `${year}${String(month).padStart(2, '0')}`; };
  return `hotspots_${areaName}_${ym(from)}_${ym(to)}.csv`;
}

// Whole numbers with thousands separators for display. Never returns NaN, null or undefined.
export function fmt(v) {
  return v === null || v === undefined || !Number.isFinite(v) ? 'no data' : Math.round(v).toLocaleString('en-US');
}
