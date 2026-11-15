// Run with: node --test web/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../calc.js';

// A tiny hand-made pack: three cells, months 0..95 (2002 to 2009), estimates from month 60.
const meta = {
  drift_from: 90,
  size_edges: [10, 100, 1000],
  intervals: { 0: [-0.7, 0.5], 1: [-0.6, 0.4], 2: [-0.4, 0.3], 3: [-0.2, 0.2] },
  smoke: { first_month: 48, min_days: 3, aod_threshold: 1.0 },
};
const aquaMonths = [];
for (let m = 0; m < 96; m++) if (m !== 70 && m !== 71) aquaMonths.push(m);
const estMonths = [];
for (let m = 60; m < 96; m++) if (m !== 71) estMonths.push(m);
const pack = { meta, aquaSet: new Set(aquaMonths), estSet: new Set(estMonths), firstMonth: 0, lastMonth: 95 };

const cells = [
  { lat: 0.05, lon: 100.05, t: [0, 4, 0, 12, 6, 0, 70, 9, 85] },
  { lat: 0.15, lon: 100.05, t: [0, 1, 0, 70, 0, 20] },
  { lat: 2.05, lon: 110.05, t: [5, 7, 0] },
];

test('month index both ways, including December and January', () => {
  assert.equal(c.toIndex(2002, 1), 0);
  assert.equal(c.toIndex(2002, 12), 11);
  assert.equal(c.toIndex(2003, 1), 12);
  assert.deepEqual(c.toYearMonth(11), { year: 2002, month: 12 });
  assert.deepEqual(c.toYearMonth(12), { year: 2003, month: 1 });
  assert.deepEqual(c.toYearMonth(297), { year: 2026, month: 10 });
  assert.equal(c.monthLabel(164), 'September 2015');
});

test('parseNumber accepts comma or point, rejects non-numbers', () => {
  assert.equal(c.parseNumber('1,5'), 1.5);
  assert.equal(c.parseNumber(' -0.25 '), -0.25);
  assert.ok(Number.isNaN(c.parseNumber('abc')));
  assert.ok(Number.isNaN(c.parseNumber('')));
  assert.ok(Number.isNaN(c.parseNumber('1.2.3')));
});

test('box selection, a cell exactly on the edge, an empty area', () => {
  const box = { type: 'box', lat1: 0, lon1: 100, lat2: 0.15, lon2: 100.1 };
  assert.equal(c.selectCells(cells, box).length, 2); // 0.15 is exactly on the edge: included
  const flipped = { type: 'box', lat1: 0.15, lon1: 100.1, lat2: 0, lon2: 100 };
  assert.equal(c.selectCells(cells, flipped).length, 2);
  assert.equal(c.selectCells(cells, { type: 'box', lat1: -5, lon1: 120, lat2: -4, lon2: 121 }).length, 0);
});

test('point and radius selection uses great-circle distance', () => {
  assert.ok(Math.abs(c.distanceKm(0, 100, 0, 101) - 111.19) < 0.1);
  assert.equal(c.selectCells(cells, { type: 'pt', lat: 0.05, lon: 100.05, km: 5 }).length, 1);
  assert.equal(c.selectCells(cells, { type: 'pt', lat: 0.05, lon: 100.05, km: 12 }).length, 2);
});

test('areaError names the allowed range', () => {
  const bbox = { lat_min: -11, lat_max: 8, lon_min: 94, lon_max: 142 };
  assert.equal(c.areaError({ type: 'pt', lat: 0, lon: 100, km: 25 }, bbox), null);
  assert.match(c.areaError({ type: 'pt', lat: 20, lon: 100, km: 25 }, bbox), /-11 to 8/);
  assert.match(c.areaError({ type: 'pt', lat: NaN, lon: 100, km: 25 }, bbox), /numbers/);
  assert.match(c.areaError({ type: 'pt', lat: 0, lon: 100, km: 2 }, bbox), /5 and 500/);
});

test('hash round trip', () => {
  const box = { type: 'box', lat1: -1, lon1: 100.3, lat2: 1.6, lon2: 103.4 };
  assert.deepEqual(c.parseHash(c.formatHash(box)), box);
  const pt = { type: 'pt', lat: -2.5, lon: 113.9, km: 25 };
  assert.deepEqual(c.parseHash(c.formatHash(pt)), pt);
  assert.equal(c.parseHash('#nothing'), null);
  assert.equal(c.parseHash('#box=1,2,3'), null);
});

test('series: source aqua, estimate and none; none is not zero', () => {
  const rows = c.series(cells.slice(0, 2), pack);
  assert.equal(rows.length, 96);
  assert.equal(rows[0].source, 'aqua');
  assert.equal(rows[0].value, 5);
  assert.equal(rows[0].est, null);
  assert.equal(rows[70].source, 'estimate');
  assert.equal(rows[70].aqua, null);
  assert.equal(rows[70].value, 10.5);
  assert.ok(rows[70].low !== null && rows[70].high > rows[70].value);
  assert.equal(rows[71].source, 'none');
  assert.equal(rows[71].value, null);
  assert.equal(rows[1].value, 0); // a month with data and no fire is zero, not "none"
  assert.equal(rows[89].drift, false);
  assert.equal(rows[90].drift, true);
});

test('an empty area gives zeros, not missing values', () => {
  const rows = c.series([], pack);
  assert.equal(rows[0].value, 0);
  assert.equal(rows[71].value, null);
});

test('interval for each size bin, never below zero', () => {
  for (const [est, bin] of [[0, 0], [5, 0], [10, 1], [99, 1], [100, 2], [1000, 3], [50000, 3]]) {
    const [a, b] = meta.intervals[bin];
    const { low, high } = c.interval(est, meta);
    assert.ok(low >= 0);
    assert.ok(Math.abs(high - ((est + 1) * Math.exp(b) - 1)) < 1e-9);
    assert.ok(Math.abs(low - Math.max(0, (est + 1) * Math.exp(a) - 1)) < 1e-9);
  }
  assert.equal(c.interval(0, meta).low, 0);
});

function rowsFrom(values) {
  // values of the same calendar month, one per year, oldest first
  const rows = [];
  values.forEach((v, y) => { for (let k = 0; k < 12; k++) rows.push({ m: y * 12 + k, value: k === 0 ? v : 0 }); });
  return rows;
}

test('normal: fewer than 5 earlier years gives short', () => {
  const rows = rowsFrom([1, 2, 3, 4, 5]);
  assert.equal(c.normal(rows, 48).status, 'short');
  assert.equal(c.normal(rows, 48).years, 4);
});

test('normal: above, near, below, and only earlier years are used', () => {
  const base = [10, 20, 30, 40, 50];
  assert.equal(c.normal(rowsFrom([...base, 45]), 60).status, 'above'); // p75 is 40
  assert.equal(c.normal(rowsFrom([...base, 30]), 60).status, 'near');
  assert.equal(c.normal(rowsFrom([...base, 15]), 60).status, 'below'); // p25 is 20
  const n = c.normal(rowsFrom([...base, 60, 9999]), 60);
  assert.equal(n.median, 30); // the later year 9999 is not used
  assert.equal(n.ratio, 2);
  assert.equal(c.normal(rowsFrom([...base, null]), 60).status, 'none');
});

test('normal skips years without a value', () => {
  const n = c.normal(rowsFrom([10, null, 20, 30, 40, 50, 30]), 72);
  assert.equal(n.years, 5);
  assert.equal(n.median, 30);
});

test('smoke: nodata before first_month, smoky at the threshold, clear below it', () => {
  const smoke = { '0,200': [50, 3, 30, 51, 2, 31] };
  const smoky = c.smokyMonths(c.blocksOf(cells.slice(0, 2)), smoke, meta);
  assert.deepEqual([...c.blocksOf(cells.slice(0, 2))], ['0,200']);
  assert.equal(c.smokeState(meta, smoky, 47), 'nodata');
  assert.equal(c.smokeState(meta, smoky, 50), 'smoky');
  assert.equal(c.smokeState(meta, smoky, 51), 'clear');
  assert.equal(c.smokeState({ smoke: null }, new Set(), 50), 'nodata');
  assert.equal(c.smokyMonths(new Set(['0,200']), null, meta).size, 0);
});

test('every row of the sentence table', () => {
  for (const s of ['smoky', 'clear', 'nodata']) {
    assert.equal(c.sentence('above', s), 'Above normal for this month.');
    assert.equal(c.sentence('near', s), 'Near normal for this month.');
    assert.equal(c.sentence('short', s), 'History too short to say what is normal.');
  }
  assert.equal(c.sentence('below', 'clear'), 'Below normal for this month.');
  assert.equal(c.sentence('below', 'smoky'), 'Low count, but thick smoke was present and may have hidden fires.');
  assert.equal(c.sentence('below', 'nodata'), 'Low count. No smoke data for this period, so hidden fires cannot be ruled out.');
  assert.ok(!c.sentence('below', 'smoky').includes('Below normal'));
  assert.ok(!c.sentence('below', 'nodata').includes('Below normal'));
});

test('calendar rank with ties and with a single value', () => {
  assert.equal(c.rankStep(5, [5]), 0);
  assert.equal(c.rankStep(0, [0, 1, 2]), 0);
  assert.equal(c.rankStep(9, [1, 2, 3, 4, 9]), 4);
  assert.equal(c.rankStep(1, [1, 2, 3, 4, 9]), 0);
  assert.equal(c.rankStep(3, [1, 3, 3, 3, 9]), 1); // ties: only strictly lower values count
  assert.equal(c.rankStep(3, [3], 4), 4); // four zero years left out of the list
});

test('csv: header, empty fields for missing values, one decimal', () => {
  const rows = c.enrich(c.series(cells.slice(0, 2), pack), pack, new Set([70]));
  const lines = c.csv(rows.slice(69, 72)).trim().split('\n');
  assert.equal(lines[0], 'year,month,aqua,estimate,low,high,headline,source,drift,smoke,median,status');
  assert.equal(lines.length, 4);
  const est = lines[2].split(',');
  assert.equal(est.length, 12);
  assert.deepEqual(est.slice(0, 4), ['2007', '11', '', '10.5']);
  assert.equal(est[6], '10.5');
  assert.equal(est[7], 'estimate');
  assert.equal(est[9], 'smoky');
  const none = lines[3].split(',');
  assert.deepEqual(none.slice(2, 8), ['', '', '', '', '', 'none']);
  assert.equal(none[11], '');
  assert.ok(!c.csv(rows).includes('null') && !c.csv(rows).includes('NaN') && !c.csv(rows).includes('undefined'));
  assert.equal(c.csvName('riau', 6, 297), 'hotspots_riau_200207_202610.csv');
});

test('fmt never shows NaN, null or undefined', () => {
  assert.equal(c.fmt(null), 'no data');
  assert.equal(c.fmt(NaN), 'no data');
  assert.equal(c.fmt(undefined), 'no data');
  assert.equal(c.fmt(37352.4), '37,352');
});

test('standing: rank among all years, and the last earlier year at least as high or as low', () => {
  const rows = rowsFrom([10, 50, 20, null, 30, 40, 5]);
  assert.deepEqual(c.standing(rows, 60), { rank: 2, of: 6, highestSince: 2003, lowestSince: 2006 });
  assert.deepEqual(c.standing(rows, 12), { rank: 1, of: 6, highestSince: null, lowestSince: 2002 });
  assert.deepEqual(c.standing(rows, 72), { rank: 6, of: 6, highestSince: 2007, lowestSince: null });
  assert.equal(c.standing(rows, 36), null);
});

test('sameMonth lists every year of that calendar month and marks the current one', () => {
  const list = c.sameMonth(rowsFrom([10, null, 30]), 24);
  assert.deepEqual(list.map(d => d.year), [2002, 2003, 2004]);
  assert.deepEqual(list.map(d => d.value), [10, null, 30]);
  assert.deepEqual(list.map(d => d.current), [false, false, true]);
});

test('ordinal', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 25].map(c.ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '25th']);
});

test('yearTotals: sums per year and counts the months that have a value', () => {
  const rows = [];
  for (let m = 6; m < 36; m++) rows.push({ m, value: m === 20 ? null : 2 });
  assert.deepEqual(c.yearTotals(rows), [
    { year: 2002, total: 12, months: 6 },
    { year: 2003, total: 22, months: 11 },
    { year: 2004, total: 24, months: 12 },
  ]);
});

test('spread: cells with a hot spot per month and the ground they cover', () => {
  const s = c.spread(cells, pack);
  assert.equal(s.count[0], 2);  // two cells had Aqua hot spots in month 0
  assert.equal(s.count[5], 1);
  assert.equal(s.count[70], 2); // month 70 is an estimate month: est10 85 and 20
  assert.equal(s.count[71], 0); // no data: nothing counted
  assert.equal(s.count[12], 1);
  assert.ok(Math.abs(s.km2[0] - 2 * c.CELL_KM2) < 0.01); // near the equator
});

test('smokeDays: the most thick-smoke days of any block, per month', () => {
  const smoke = { '0,200': [50, 3, 30, 51, 2, 31], '1,200': [50, 9, 30] };
  const days = c.smokeDays(new Set(['0,200', '1,200', '9,9']), smoke);
  assert.equal(days.get(50), 9);
  assert.equal(days.get(51), 2);
  assert.equal(days.get(52), undefined);
  assert.equal(c.smokeDays(new Set(['0,200']), null).size, 0);
});

test('likePlace picks the largest place that fits', () => {
  assert.equal(c.likePlace(123), 'about 19% of the size of Jakarta');
  assert.equal(c.likePlace(700), 'about the size of Jakarta');
  assert.equal(c.likePlace(23120), 'about 4.0 times the size of Bali');
  assert.equal(c.likePlace(128300 * 1.8), 'about 1.8 times the size of Java');
  assert.equal(c.likePlace(1), 'about 1% of the size of Jakarta');
});
