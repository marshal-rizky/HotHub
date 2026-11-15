// Events and rendering. All numbers come from calc.js; this file only shows them.
import * as c from './calc.js';
import { loadPack } from './data.js';
import { createMap, STEP_COLORS } from './map3d.js';
import { runDemo } from './demo.js';
import { icon, fillIcons, logo } from './icons.js';
import { renderWhy, renderMethods, svg, niceMax, axes } from './explain.js';

const $ = id => document.getElementById(id);
const PRESETS = [ // simple boxes, not exact borders: lat1, lon1, lat2, lon2
  ['All Indonesia', 'all', null],
  ['Riau', 'riau', [-1.0, 100.3, 1.6, 103.4]],
  ['South Sumatra', 'south-sumatra', [-4.9, 102.1, -1.6, 105.9]],
  ['Central Kalimantan', 'central-kalimantan', [-3.5, 110.7, 0.8, 115.8]],
  ['West Kalimantan', 'west-kalimantan', [-3.0, 108.8, 1.2, 113.0]],
  ['Papua (south)', 'papua-south', [-9.2, 137.5, -6.0, 141.0]],
];
const SOURCE_TEXT = { aqua: 'Observed by Aqua MODIS', estimate: 'Estimated from VIIRS (Suomi NPP)', none: 'No data' };

let pack, map = null, area, sel, timer = null, pinned = null, spot = { key: '', rows: null };
let detail = false;
try { detail = localStorage.getItem('detail') === '1'; } catch (e) { /* storage blocked: stay on Simple */ }
const demo = new URLSearchParams(location.search).get('demo') === '1';

const presetDef = box => box
  ? { type: 'box', lat1: box[0], lon1: box[1], lat2: box[2], lon2: box[3] }
  : { type: 'box', lat1: pack.meta.bbox.lat_min, lon1: pack.meta.bbox.lon_min, lat2: pack.meta.bbox.lat_max, lon2: pack.meta.bbox.lon_max };
const rowAt = m => area.rows[m - pack.firstMonth];
const coord = (lat, lon) => `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'}, ${lon.toFixed(2)}°E`;

function areaName(def) {
  const hash = c.formatHash(def);
  const preset = PRESETS.find(p => c.formatHash(presetDef(p[2])) === hash);
  if (preset) return { label: preset[0], slug: preset[1] };
  if (def.type === 'pt') {
    return { label: `${def.km} km around ${coord(def.lat, def.lon)}`, slug: `pt_${def.lat.toFixed(2)}_${def.lon.toFixed(2)}_${def.km}km` };
  }
  const [a, b, d, e] = [def.lat1, def.lon1, def.lat2, def.lon2].map(v => v.toFixed(2));
  return { label: `Box ${coord(def.lat1, def.lon1)} to ${coord(def.lat2, def.lon2)}`, slug: `box_${a}_${b}_${d}_${e}` };
}

function rowsFor(cells) {
  return c.enrich(c.series(cells, pack), pack, c.smokyMonths(c.blocksOf(cells), pack.smoke, pack.meta));
}

// ---------- area ----------
function setArea(def, { fly = true } = {}) {
  const error = c.areaError(def, pack.meta.bbox);
  $('area-msg').textContent = error || '';
  if (error) return false;
  if (def.type === 'pt') { $('in-lat').value = def.lat; $('in-lon').value = def.lon; $('in-km').value = def.km; }
  else { $('in-lat').value = $('in-lon').value = ''; } // a box has no single point: do not leave a stale one
  const cells = c.selectCells(pack.cells, def);
  area = { def, ...areaName(def), cells, rows: rowsFor(cells), spread: c.spread(cells, pack),
    smokeDays: c.smokeDays(c.blocksOf(cells), pack.smoke) };
  area.peak = area.rows.reduce((a, r) => (r.value !== null && (!a || r.value > a.value) ? r : a), null);
  history.replaceState(null, '', c.formatHash(def));
  const fixed = c.selectCells(pack.staticCells, def).length;
  const empty = !area.rows.some(r => r.value > 0);
  $('area-info').textContent = `${area.label}: ${cells.length.toLocaleString('en-US')} cells of 0.1°` +
    (fixed ? `, ${fixed} persistent heat source${fixed > 1 ? 's' : ''} left out` : '') +
    (empty ? '. No hot spots recorded here.' : '.');
  for (const b of $('presets').children) b.classList.toggle('on', b.dataset.slug === area.slug);
  if (map) { map.setArea(def); if (fly) map.frameArea(def); }
  renderMonth();
  renderCalendar();
  renderRange();
  return true;
}

// ---------- month ----------
function setMonth(m) {
  sel = Math.max(pack.firstMonth, Math.min(pack.lastMonth, m));
  $('slider').value = sel;
  $('slider-label').textContent = $('map-month').textContent = c.monthLabel(sel);
  const s = pack.meta.smoke;
  $('map-note').hidden = !(s && sel < s.first_month);
  if (map) map.setMonth(sel);
  renderMonth();
  for (const el of $('cal').querySelectorAll('.sel')) el.classList.remove('sel');
  const cell = $('cal').querySelector(`[data-m="${sel}"]`);
  if (cell) cell.classList.add('sel');
  renderPin();
}

function intervalText(r) {
  return `likely between ${c.fmt(r.low)} and ${c.fmt(r.high)} (80% interval)${pack.meta.calibrated ? '' : ', uncalibrated'}`;
}

function normalText(r) {
  const n = r.normal;
  if (n.median === null) return '';
  const name = c.MONTH_NAMES[r.m % 12];
  return `Median for ${name} in ${n.years} earlier years: ${c.fmt(n.median)}.` +
    (n.ratio !== null ? ` This month is ${n.ratio.toFixed(1)} times the median.` : '');
}

// What the month comes to, as one word: decides the icon and colour of the verdict.
function verdictKind(r) {
  if (r.normal.status === 'below') return r.smoke === 'clear' ? 'below' : 'warn';
  return r.normal.status;
}
const VERDICT_ICON = { above: 'up', near: 'equal', below: 'down', warn: 'warn', short: 'question', none: 'question' };
const chip = r => `<span class="chip v-${verdictKind(r)}">${icon(VERDICT_ICON[verdictKind(r)])}${r.sentence}</span>`;

// A bar from zero: shaded = usual range (middle half of earlier years), line = median, pointer = this month.
function gauge(r) {
  const n = r.normal;
  if (n.median === null) return '';
  const est = r.source === 'estimate';
  const top = Math.max(n.p75, r.value, est ? r.high : 0, 1) * 1.12, w = 300;
  const x = v => +(4 + v / top * (w - 8)).toFixed(1);
  return `<div class="gauge">${svg(w, 30,
    `<rect class="g-track" x="4" y="12" width="${w - 8}" height="12"/>` +
    `<rect class="g-band" x="${x(n.p25)}" y="12" width="${Math.max(2, x(n.p75) - x(n.p25)).toFixed(1)}" height="12"/>` +
    `<line class="g-med" x1="${x(n.median)}" y1="9" x2="${x(n.median)}" y2="27"/>` +
    (est ? `<line class="g-range" x1="${x(r.low)}" y1="18" x2="${x(r.high)}" y2="18"/>` : '') +
    `<path class="g-mark" d="M${x(r.value) - 6} 0h12l-6 11z"/>`)}
    <p class="small"><span class="key k-mark"></span>this month ${c.fmt(r.value)}
      <span class="key k-band"></span>usual range ${c.fmt(n.p25)} to ${c.fmt(n.p75)}
      <span class="key k-med"></span>median ${c.fmt(n.median)}</p></div>`;
}

// One bar per year for the same calendar month. The selected year is outlined.
function sameMonthChart(at) {
  const list = c.sameMonth(area.rows, at), max = Math.max(1, ...list.map(d => d.value || 0));
  const w = 300, h = 56, step = w / list.length;
  let body = '';
  list.forEach((d, k) => {
    const bh = d.value === null ? 4 : Math.max(1.5, d.value / max * (h - 14));
    body += `<rect class="${d.value === null ? 'm-none' : 'm-bar'}${d.current ? ' m-now' : ''}" x="${(k * step + 1).toFixed(1)}" y="${(h - 12 - bh).toFixed(1)}"` +
      ` width="${(step - 2).toFixed(1)}" height="${bh.toFixed(1)}"${d.value === null ? '' : ` fill="${STEP_COLORS[d.step]}"`}/>`;
  });
  body += `<text x="1" y="${h - 1}">${list[0].year}</text><text x="${w - 1}" y="${h - 1}" text-anchor="end">${list[list.length - 1].year}</text>`;
  return `<div class="mini">${svg(w, h, body)}</div>`;
}

function badges(r) {
  const s = pack.meta.smoke;
  const source = r.source === 'estimate'
    ? ['approx', `${SOURCE_TEXT.estimate}, ${intervalText(r)}`, 'Aqua could not be used this month, so the count is converted from the VIIRS sensor on Suomi NPP. The method was tested on years where Aqua was hidden.']
    : r.source === 'aqua'
      ? ['eye', SOURCE_TEXT.aqua, 'Counted directly by the MODIS sensor on the Aqua satellite, confidence 30 or higher.' + (r.drift ? ' Aqua\'s overpass time has drifted since 2023.' : '')]
      : ['question', 'No data', 'Neither Aqua nor the VIIRS estimate is usable for this month.'];
  const smoke = {
    smoky: ['cloud', 'Thick smoke can hide fires from the satellite, so a low count here is not good news.'],
    clear: ['sun', 'Smoke was not thick enough to hide fires from the satellite.'],
    nodata: ['question', s ? `Smoke records start in ${c.monthLabel(s.first_month)}. Before that, hidden fires cannot be ruled out.` : 'This data pack has no smoke records.'],
  }[r.smoke];
  const one = (ic, label, text) => `<details class="badge"${detail ? ' open' : ''}><summary>${icon(ic)}${label}</summary><p>${text}</p></details>`;
  return `<div class="badges">${one(...source)}${one(smoke[0], c.SMOKE_TEXT[r.smoke], smoke[1])}</div>`;
}

// Plain facts about where the month stands. Left out when smoke may have hidden fires.
function standingFacts(r, at) {
  const kind = verdictKind(r), st = c.standing(area.rows, at), n = r.normal, facts = [];
  if (!st || kind === 'warn') return facts;
  const name = c.MONTH_NAMES[r.m % 12];
  if (st.of >= 5) facts.push(`${c.ordinal(st.rank)} highest ${name} of ${st.of}`);
  if (kind === 'above') facts.push(st.highestSince ? `highest since ${st.highestSince}` : 'higher than every earlier year');
  if (kind === 'below') facts.push(st.lowestSince ? `lowest since ${st.lowestSince}` : 'lower than every earlier year');
  if (n.ratio !== null) facts.push(n.ratio >= 1 ? `${n.ratio.toFixed(1)} times the median` : `${Math.round(n.ratio * 100)}% of the median`);
  return facts;
}

// Outside figures for the two worst fire years. Shown only in the fire season of those years.
const EVENTS = {
  2015: ['In 2015, fires burned about 2.6 million hectares across Indonesia and cost about US$16.1 billion, by the World Bank\'s estimate.',
    'World Bank, The Cost of Fire (2016)', 'https://openknowledge.worldbank.org/entities/publication/391e19f4-18f7-56c2-8c28-bb89cc9e7d6f'],
  2019: ['In 2019, the World Bank estimated US$5.2 billion in losses, with more than 620,000 hectares burned in eight provinces from January to September.',
    'World Bank, December 2019, as reported by CNBC', 'https://www.cnbc.com/2019/12/11/world-bank-says-indonesia-fires-cost-5point2-billion-in-economic-losses.html'],
};

// What the numbers of this month mean on the ground, in plain words. Every figure comes from the pack,
// except the two World Bank notes above.
function realLife(r) {
  if (r.value === null) return '';
  const at = r.m - pack.firstMonth, { year, month } = c.toYearMonth(r.m), lines = [];
  const perDay = r.value / new Date(Date.UTC(year, month, 0)).getUTCDate();
  lines.push(['flame', r.value === 0 ? 'No hot spot was seen here this month.'
    : perDay >= 1 ? `About ${c.fmt(perDay)} hot spots a day, on average.`
      : `Fewer than one hot spot a day: ${c.fmt(r.value)} in the whole month.`]);
  const n = area.spread.count[at];
  if (n > 0) {
    lines.push(['pin', `Heat was seen in ${c.fmt(n)} map square${n > 1 ? 's' : ''} (each about 11 km across), ${c.fmt(area.spread.km2[at])} km² in all: ` +
      `${c.likePlace(area.spread.km2[at])}. That is where fire was seen, not how much land burned.`]);
  }
  const s = pack.meta.smoke, days = area.smokeDays.get(r.m) || 0;
  if (r.smoke === 'nodata') {
    lines.push(['question', 'No smoke records for this month, so the haze cannot be described.']);
  } else if (days >= s.min_days) {
    lines.push(['cloud', `Thick smoke on up to ${days} days in the worst-hit part of this area. Smoke that thick dims direct sunlight by ` +
      `${Math.round((1 - Math.exp(-s.aod_threshold)) * 100)}% or more.`]);
  } else {
    lines.push(['sun', days ? `Thick smoke on at most ${days} day${days > 1 ? 's' : ''} anywhere in this area.` : 'No day of thick smoke anywhere in this area.']);
  }
  const peak = area.peak;
  if (peak && peak.value > 0) {
    const share = r.value / peak.value * 100;
    lines.push(['up', r.m === peak.m ? 'This is the worst month in the record for this area.'
      : `${share < 1 ? 'Less than 1%' : Math.round(share) + '%'} of the worst month in the record here (${c.monthLabel(peak.m)}, ${c.fmt(peak.value)}).`]);
  }
  const event = month >= 6 && month <= 11 && EVENTS[year];
  if (event) lines.push(['warn', `${event[0]} <a href="${event[2]}" target="_blank" rel="noopener">${event[1]}</a>`]);
  return `<div class="real"><h3>In real life</h3><ul>${lines.map(([ic, text]) => `<li>${icon(ic)}<span>${text}</span></li>`).join('')}</ul></div>`;
}

// Facts the satellite tells. The first one always comes first; after that they come at random.
let FACTS = [], factAt = -1, satOver = false;
function buildFacts() {
  const raw = year => pack.region.months.filter(r => c.toYearMonth(r[0]).year === year).reduce((s, r) => s + r[5] + r[6] + r[7] + r[8], 0);
  const lastYear = c.toYearMonth(pack.lastMonth).year;
  FACTS = [
    'A low count can also mean smoke hid fires.',
    'VIIRS sees smaller fires than MODIS: its pixels are 375 m across, MODIS pixels are about 1 km.',
    `${pack.meta.static_cells.length} map squares here are hot almost every day: gas flares, smelters and volcanoes. They are left out of every count.`,
    `Terra and the VIIRS satellites logged ${c.fmt(raw(2015))} detections here in 2015 and ${c.fmt(raw(lastYear))} in ${lastYear} so far. Most of that rise is extra VIIRS satellites, not extra fire.`,
    'Aqua\'s orbit has been drifting since 2023, so it no longer passes over at the same time of day.',
    'At night VIIRS finds many small, cool fires that MODIS cannot see. That is why day and night are converted separately.',
    'One hot spot is one pixel that looked hot. Several fires inside the same pixel still count as one.',
    'Two agencies reported 9,409 and 9,587 high-confidence hot spots for the same month, August 2026. Different satellites and rules give different counts.',
  ];
}
function nextFact() {
  let k = 0;
  if (factAt >= 0) do { k = 1 + Math.floor(Math.random() * (FACTS.length - 1)); } while (k === factAt);
  factAt = k;
}
function pinFact() { nextFact(); pinned = { kind: 'fact' }; if (map) map.setMarker(null); renderPin(); }

function renderMonth() {
  if (!area) return;
  const r = rowAt(sel), at = sel - pack.firstMonth, n = r.normal, name = c.MONTH_NAMES[sel % 12];
  const latest = sel === pack.lastMonth ? ' <span class="small">latest complete month</span>' : '';
  const seg = (on, ic, label) => `<button type="button" data-detail="${on ? 1 : 0}" aria-pressed="${detail === on}">${icon(ic)}${label}</button>`;
  const facts = standingFacts(r, at);
  const numbers = !detail ? '' : `<div class="numbers">
      ${n.median !== null ? `<p>${normalText(r)} The usual range is the middle half of those years: ${c.fmt(n.p25)} to ${c.fmt(n.p75)}.</p>` : ''}
      ${r.est !== null && r.aqua !== null ? `<p>VIIRS-based estimate for the same month: ${c.fmt(r.est)}, ${intervalText(r)}.</p>` : ''}
      ${r.drift ? '<p>Aqua\'s overpass time has drifted since 2023.</p>' : ''}
      <p>Colour and "normal" compare this month only with the same calendar month in other years, for this area.</p></div>`;
  $('month-panel').innerHTML = `
    <div class="panel-head"><h2>${c.monthLabel(sel)}${latest}</h2>
      <div class="seg" role="group" aria-label="Level of detail">${seg(false, 'smile', 'Simple')}${seg(true, 'list', 'Detail')}</div></div>
    <p class="verdict-big v-${verdictKind(r)}">${icon(VERDICT_ICON[verdictKind(r)])}<span>${r.sentence}</span></p>
    <p class="count"><span class="big">${c.fmt(r.value)}</span> ${r.value === null ? '' : 'hot spots in ' + area.label}</p>
    <p class="small">A hot spot is heat seen by a satellite, not a confirmed fire. Every year is counted in one unit (Aqua MODIS).</p>
    ${r.value === null ? '' : gauge(r)}
    ${facts.length ? `<p class="facts">${facts.map(f => `<span>${f}</span>`).join('')}</p>` : ''}
    ${realLife(r)}
    ${sameMonthChart(at)}
    <p class="small">Every ${name} in the record. Outlined: ${c.toYearMonth(sel).year}.</p>
    ${badges(r)}
    ${numbers}
    <p class="small">The running month is not shown until it is complete.</p>`;
}

// ---------- calendar ----------
function cellText(r) {
  if (r.value === null) return `${c.monthLabel(r.m)}: no data.`;
  return `${c.monthLabel(r.m)}: ${c.fmt(r.value)} hot spots. ${SOURCE_TEXT[r.source]}` +
    `${r.source === 'estimate' ? ', ' + intervalText(r) : ''}. ${normalText(r)} ${r.sentence} ${c.SMOKE_TEXT[r.smoke]}.` +
    (r.drift ? ' Aqua\'s overpass time has drifted since 2023.' : '');
}

function cellClass(r) {
  return 'cal-cell ' + (r.value === null ? 'none' : `step-${r.step}`) +
    (r.source === 'estimate' ? ' est' : '') + (r.smoke === 'smoky' ? ' smoky' : '');
}

function renderCalendar() {
  const first = c.toYearMonth(pack.firstMonth).year, last = c.toYearMonth(pack.lastMonth).year;
  let html = '<thead><tr><th class="year"></th>' + c.MONTH_NAMES.map(n => `<th scope="col" title="${n}">${n[0]}</th>`).join('') + '<th class="yt-head" scope="col">Year</th></tr></thead><tbody>';
  const totals = new Map(c.yearTotals(area.rows).map(t => [t.year, t]));
  const most = Math.max(1, ...[...totals.values()].map(t => t.total));
  for (let y = last; y >= first; y--) {
    html += `<tr><th class="year" scope="row">${y}</th>`;
    for (let k = 1; k <= 12; k++) {
      const m = c.toIndex(y, k);
      if (m < pack.firstMonth || m > pack.lastMonth) { html += '<td></td>'; continue; }
      const r = rowAt(m);
      html += `<td><button type="button" class="${cellClass(r)}${m === sel ? ' sel' : ''}" data-m="${m}" aria-label="${cellText(r)}"></button></td>`;
    }
    const t = totals.get(y);
    const text = `${y}: ${c.fmt(t.total)} hot spots in the year` + (t.months < 12 ? ` (only ${t.months} months with data)` : '') + '.';
    html += `<td class="yt" data-y="${y}" tabindex="0" title="${text}" aria-label="${text}">` +
      `<span class="yt-bar${t.months < 12 ? ' part' : ''}" style="width:${(t.total / most * 100).toFixed(1)}%"></span></td></tr>`;
  }
  $('cal').innerHTML = html + '</tbody>';
}

function buildCalendarLegend() {
  $('cal-legend').innerHTML = 'Quiet ' + [0, 1, 2, 3, 4].map(s => `<span class="cal-cell step-${s}"></span>`).join('') +
    ' very busy, for that month of the year' +
    '<span><span class="cal-cell step-1 est"></span> estimated from VIIRS</span>' +
    '<span><span class="cal-cell step-1 smoky"></span> thick smoke</span>' +
    '<span><span class="cal-cell none"></span> no data</span>' +
    '<span><span class="yt-bar key-bar"></span> year total (striped: year not complete)</span>';
  const info = e => {
    const y = e.target.closest('[data-y]');
    if (y) { $('cal-info').textContent = y.title; return; }
    const b = e.target.closest('[data-m]');
    if (!b) return;
    const r = rowAt(+b.dataset.m);
    $('cal-info').innerHTML = `<strong>${c.monthLabel(r.m)}</strong> ${chip(r)}<br>` + (r.value === null ? 'No data.'
      : `${c.fmt(r.value)} hot spots. ${SOURCE_TEXT[r.source]}${r.source === 'estimate' ? ', ' + intervalText(r) : ''}. ${c.SMOKE_TEXT[r.smoke]}.` +
        (r.drift ? ' Aqua\'s overpass time has drifted since 2023.' : ''));
  };
  $('cal').addEventListener('mouseover', info);
  $('cal').addEventListener('focusin', info);
  $('cal').addEventListener('click', e => {
    const b = e.target.closest('[data-m]');
    if (b) { stop(); setMonth(+b.dataset.m); info(e); }
  });
}

// ---------- charts ----------
function rangeChart(rows) {
  const w = 640, h = 220, l = 44, b = 20, n = rows.length;
  const max = niceMax(Math.max(...rows.map(r => r.source === 'estimate' ? r.high : r.value || 0)));
  const x = k => l + (n > 1 ? k / (n - 1) : 0.5) * (w - l - 6), y = v => h - b - v / max * (h - b - 10);
  let body = axes(w, h, l, b, max), path = '', pen = false, marks = '';
  rows.forEach((r, k) => {
    if (r.value === null) { pen = false; return; }
    path += `${pen ? 'L' : 'M'}${x(k).toFixed(1)} ${y(r.value).toFixed(1)}`;
    pen = true;
    if (r.source === 'estimate') {
      marks += `<line class="band" x1="${x(k)}" y1="${y(r.low)}" x2="${x(k)}" y2="${y(r.high)}"/><circle class="dot" cx="${x(k)}" cy="${y(r.value)}" r="2.5"/>`;
    }
    const ym = c.toYearMonth(r.m);
    if (ym.month === 1 && (n < 80 || ym.year % 4 === 0)) body += `<text x="${x(k)}" y="${h - 6}" text-anchor="middle">${ym.year}</text>`;
  });
  return svg(w, h, body + `<path class="line" d="${path}"/>` + marks);
}

function renderRange() {
  let from = +$('sel-from').value, to = +$('sel-to').value;
  if (from > to) [from, to] = [to, from];
  const rows = area.rows.slice(from - pack.firstMonth, to - pack.firstMonth + 1);
  $('chart').innerHTML = rangeChart(rows);
  const valued = rows.filter(r => r.value !== null);
  const total = valued.reduce((s, r) => s + r.value, 0);
  const peak = valued.reduce((a, r) => (!a || r.value > a.value ? r : a), null);
  $('range-sum').textContent = valued.length
    ? `Total ${c.fmt(total)} hot spots over ${valued.length} months with data. Years are compared only when all 12 months have data. ` +
      'A low count can also mean smoke hid fires. Thick bars on the chart mark estimated months with their 80% interval.'
    : 'No data in this range.';
  const full = c.yearTotals(rows).filter(y => y.months === 12);
  const high = full.reduce((a, y) => (!a || y.total > a.total ? y : a), null);
  const low = full.reduce((a, y) => (!a || y.total < a.total ? y : a), null);
  const card = (ic, label, main, sub) => `<div class="stat">${icon(ic)}<span class="stat-label">${label}</span><strong>${main}</strong><span class="small">${sub}</span></div>`;
  $('range-cards').innerHTML = !valued.length ? '' :
    card('flame', 'Highest month', c.monthLabel(peak.m), `${c.fmt(peak.value)} hot spots`) +
    (high
      ? card('up', 'Highest year', high.year, `${c.fmt(high.total)} hot spots`) + card('down', 'Lowest year', low.year, `${c.fmt(low.total)} hot spots`)
      : card('question', 'Years', 'No full year', 'in this range'));
  $('csv-note').textContent = `${area.label}. Aqua-equivalent hot spots, Aqua MODIS confidence 30 or higher; estimate from Suomi NPP VIIRS.`;
  $('btn-csv').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([c.csv(rows)], { type: 'text/csv' }));
    a.download = c.csvName(area.slug, from, to);
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

// ---------- map: hover, click, pin ----------
function spotRow(kind, item, m) {
  const key = kind + item.idx;
  if (spot.key !== key) {
    const cells = kind === 'cell' ? [item]
      : c.selectCells(pack.cells, { type: 'box', lat1: item.lat1, lon1: item.lon1, lat2: item.lat1 + 0.5, lon2: item.lon1 + 0.5 });
    spot = { key, rows: rowsFor(cells) };
  }
  return spot.rows[m - pack.firstMonth];
}
const spotTitle = p => p.kind === 'cell' ? `Cell 0.1° at ${coord(p.lat, p.lon)}` : `Block 0.5° at ${coord(p.lat, p.lon)}`;

function showTip(p, x, y) {
  const tip = $('tip');
  if (!p || p.kind === 'ground') { tip.hidden = true; return; }
  if (p.kind === 'satellite') {
    tip.innerHTML = `<strong>${icon('sat')}Did you know?</strong><br>${FACTS[factAt]}`;
  } else if (p.kind === 'static') {
    tip.textContent = 'Persistent heat source (industry or volcano), not counted';
  } else {
    const r = spotRow(p.kind, p.item, sel);
    tip.innerHTML = `<strong>${spotTitle(p)}</strong><br>${c.fmt(r.value)} hot spots. ${SOURCE_TEXT[r.source]}.<br>${r.sentence}`;
  }
  tip.hidden = false;
  const box = $('map').getBoundingClientRect();
  tip.style.left = Math.min(x - box.left + 14, box.width - tip.offsetWidth - 6) + 'px';
  tip.style.top = Math.max(6, y - box.top - tip.offsetHeight - 10) + 'px';
}

function renderPin() {
  const pin = $('pin');
  if (!pinned) { pin.hidden = true; return; }
  const p = pinned;
  if (p.kind === 'fact') {
    pin.innerHTML = `<h3>${icon('sat')}Did you know?</h3><p>${FACTS[factAt]}</p>` +
      `<div class="row"><button type="button" data-act="fact">${icon('sat')}Another</button><button type="button" data-act="close">${icon('close')}Close</button></div>`;
    pin.hidden = false;
    return;
  }
  if (p.kind === 'static') {
    pin.innerHTML = '<h3>Persistent heat source</h3><p>Industry or volcano. Hot on most days, so it is not counted as a fire.</p>' +
      `<div class="row"><button type="button" data-act="close">${icon('close')}Close</button></div>`;
  } else {
    const r = spotRow(p.kind, p.item, sel);
    pin.innerHTML = `<h3>${spotTitle(p)}</h3>
      <p>${chip(r)}</p>
      <p><strong>${c.monthLabel(sel)}: ${c.fmt(r.value)} hot spots</strong></p>
      <p>${icon(r.source === 'estimate' ? 'approx' : r.source === 'aqua' ? 'eye' : 'question')}${SOURCE_TEXT[r.source]}${r.source === 'estimate' ? ', ' + intervalText(r) : ''}.</p>
      <p>${icon({ smoky: 'cloud', clear: 'sun', nodata: 'question' }[r.smoke])}${c.SMOKE_TEXT[r.smoke]}.</p>
      <p class="small">${normalText(r)}</p>
      ${p.kind === 'cell' ? '<p class="small">One cell is a small area. Its count is uncertain.</p>' : '<p class="small">Zoom in to see single cells.</p>'}
      <div class="row"><button type="button" data-act="open">${icon('search')}Show in panels</button><button type="button" data-act="close">${icon('close')}Close</button></div>`;
  }
  pin.hidden = false;
}

function pointArea(lat, lon, km) {
  return setArea({ type: 'pt', lat: +lat.toFixed(3), lon: +lon.toFixed(3), km }, { fly: false });
}

const handlers = {
  onHover(p, x, y) {
    const over = !!p && p.kind === 'satellite';
    if (over && !satOver) nextFact(); // a new fact every time the pointer comes back to the satellite
    satOver = over;
    showTip(p, x, y);
  },
  onView({ top }) {
    $('btn-box').hidden = !top;
    $('btn-top').innerHTML = top ? icon('tilt') + 'Tilt view' : icon('eye') + 'Top view';
    if (!top) drawBox(false);
  },
  onClick(p) {
    $('tip').hidden = true;
    if (p.kind === 'satellite') { pinFact(); return; }
    if (p.kind === 'ground') {
      pinned = null;
      const km = c.parseNumber($('in-km').value);
      pointArea(p.lat, p.lon, Number.isFinite(km) ? km : 25);
    } else {
      pinned = p;
    }
    renderPin();
  },
  onBox(def) {
    drawBox(false);
    const r = v => +v.toFixed(2);
    setArea({ type: 'box', lat1: r(def.lat1), lon1: r(def.lon1), lat2: r(def.lat2), lon2: r(def.lon2) }, { fly: false });
  },
};

function drawBox(on) {
  $('btn-box').classList.toggle('on', on);
  if (map) { map.setDrawBox(on); if (!on) map.setArea(area.def); }
}

// ---------- time ----------
function stop() {
  clearInterval(timer);
  timer = null;
  $('btn-play').innerHTML = icon('play');
  $('btn-play').setAttribute('aria-label', 'Play');
}
function play() {
  if (sel >= pack.lastMonth) setMonth(pack.firstMonth);
  $('btn-play').innerHTML = icon('pause');
  $('btn-play').setAttribute('aria-label', 'Pause');
  timer = setInterval(() => { if (sel >= pack.lastMonth) stop(); else setMonth(sel + 1); }, 150);
}

// ---------- start ----------
function buildControls() {
  for (const [label, slug, box] of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button'; b.innerHTML = icon('pin') + label; b.dataset.slug = slug;
    b.onclick = () => { pinned = null; renderPin(); setArea(presetDef(box)); };
    $('presets').append(b);
  }
  $('point-form').onsubmit = e => {
    e.preventDefault();
    let [lat, lon, km] = ['in-lat', 'in-lon', 'in-km'].map(id => c.parseNumber($(id).value));
    const blank = !$('in-lat').value.trim() && !$('in-lon').value.trim();
    if (blank && area.def.type === 'pt') { lat = area.def.lat; lon = area.def.lon; } // only the radius was changed
    else if (blank) { $('area-msg').textContent = 'Type a latitude and a longitude first, or click the map to pick a point.'; return; }
    setArea({ type: 'pt', lat, lon, km });
  };
  const slider = $('slider');
  slider.min = pack.firstMonth; slider.max = pack.lastMonth;
  slider.oninput = () => { stop(); setMonth(+slider.value); };
  $('btn-play').onclick = () => (timer ? stop() : play());

  const options = [];
  for (let m = pack.firstMonth; m <= pack.lastMonth; m++) options.push(`<option value="${m}">${c.monthLabel(m)}</option>`);
  $('sel-from').innerHTML = $('sel-to').innerHTML = options.join('');
  $('sel-to').value = pack.lastMonth;
  $('sel-from').onchange = $('sel-to').onchange = renderRange;

  $('legend-steps').innerHTML = 'lower ' + STEP_COLORS.map(h => `<span class="swatch" style="background:${h}"></span>`).join('') + ' higher';
  $('legend-height').textContent = `Pillar height: hot spots in one 0.1° cell, square-root scale, the same in every month ` +
    `(tallest in the record: ${c.fmt(pack.recordMax)}). Zoomed out, cells merge into 0.5° blocks showing their mean per cell. ` +
    'Sparks mark the highest colour step.';
  $('legend').open = $('map').clientWidth >= 700;
  const s = pack.meta.smoke;
  $('map-note').textContent = s ? `No smoke data before ${c.monthLabel(s.first_month)}` : 'No smoke data';
  $('pin').onclick = e => {
    const button = e.target.closest('[data-act]');
    const act = button && button.dataset.act;
    if (act === 'open' && pinned.kind === 'cell') pointArea(pinned.lat, pinned.lon, 5);
    if (act === 'open' && pinned.kind === 'block') {
      const b = pinned.item;
      setArea({ type: 'box', lat1: b.lat1, lon1: b.lon1, lat2: b.lat1 + 0.5, lon2: b.lon1 + 0.5 }, { fly: false });
    }
    if (act === 'fact') pinFact();
    if (act === 'close') { pinned = null; if (map) map.setMarker(null); renderPin(); }
  };
  buildCalendarLegend();
  buildFacts();
  $('btn-fact').onclick = pinFact;
  $('month-panel').addEventListener('click', e => {
    const b = e.target.closest('[data-detail]');
    if (!b) return;
    detail = b.dataset.detail === '1';
    try { localStorage.setItem('detail', detail ? '1' : '0'); } catch (err) { /* storage blocked */ }
    renderMonth();
  });
  fillIcons(document);
}

function buildMapControls() {
  let mode = innerWidth < 600 || matchMedia('(prefers-reduced-motion: reduce)').matches ? '2d' : '3d';
  const apply = () => {
    $('btn-mode').innerHTML = mode === '3d' ? icon('cube') + '3D' : icon('flat') + '2D';
    $('btn-mode').setAttribute('aria-pressed', mode === '3d');
    $('btn-mode').title = 'Switch between 3D and 2D';
    $('btn-top').hidden = mode === '2d';
    map.setMode(mode);
  };
  $('btn-mode').onclick = () => { mode = mode === '3d' ? '2d' : '3d'; apply(); };
  $('btn-top').onclick = () => ($('btn-box').hidden ? map.topView() : map.tiltView());
  $('btn-box').onclick = () => drawBox(!$('btn-box').classList.contains('on'));
  $('btn-home').onclick = () => map.home();
  $('btn-smoke').onclick = () => {
    const on = $('btn-smoke').getAttribute('aria-pressed') !== 'true';
    $('btn-smoke').setAttribute('aria-pressed', on);
    map.setSmoke(on);
  };
  if (!demo) apply();
}

async function boot() {
  $('status').hidden = false;
  $('status').textContent = 'Loading data';
  try {
    pack = await loadPack();
  } catch (e) {
    $('status').textContent = e.message + ' ';
    const retry = document.createElement('button');
    retry.type = 'button'; retry.textContent = 'Retry'; retry.onclick = boot;
    $('status').append(retry);
    return;
  }
  $('status').hidden = true;
  $('panels').hidden = false;
  buildControls();
  renderWhy(pack);
  renderMethods(pack);
  try {
    map = await createMap($('map'), pack, handlers);
    buildMapControls();
  } catch (e) {
    $('map-fail').hidden = false;
    $('map-fail').textContent = 'The map needs WebGL, which this browser does not offer. Presets, typed coordinates, the calendar and the download still work.';
    for (const el of [$('legend'), ...document.querySelectorAll('.map-tools')]) el.hidden = true;
  }
  sel = pack.lastMonth;
  const fromHash = c.parseHash(location.hash);
  if (!fromHash || !setArea(fromHash)) setArea(presetDef(null));
  setMonth(pack.lastMonth);
  addEventListener('hashchange', () => {
    const def = c.parseHash(location.hash);
    if (def && c.formatHash(def) !== c.formatHash(area.def)) setArea(def);
  });
  if (demo && map) runDemo({ pack, map, setMonth, setArea, presetDef, riau: PRESETS[1][2] });
}

$('logo').innerHTML = logo();
boot();
