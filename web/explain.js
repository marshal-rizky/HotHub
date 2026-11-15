// The two explaining sections: "Why our number differs" (comic strip and chart) and "Methods" (gauges and table).
// The comic is an illustration. Every number in the chart, the gauges and the table is read from the pack.
import * as c from './calc.js';
import { icon, iconPath } from './icons.js';

const $ = id => document.getElementById(id);

// ---------- small chart helpers, shared with app.js ----------
export function svg(w, h, body) {
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img">${body}</svg>`;
}
export function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map(k => k * p).find(k => k >= v);
}
export const short = v => v >= 1e6 ? +(v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(Math.round(v));
export function axes(w, h, l, b, max, top = 10) {
  let s = `<line class="axis" x1="${l}" y1="${h - b}" x2="${w}" y2="${h - b}"/>`;
  for (const f of [0, 0.5, 1]) {
    const y = h - b - f * (h - b - top);
    s += `<text x="${l - 4}" y="${y + 3}" text-anchor="end">${short(max * f)}</text>` +
      (f ? `<line class="axis" stroke-dasharray="2 4" x1="${l}" y1="${y}" x2="${w}" y2="${y}"/>` : '');
  }
  return s;
}

// ---------- comic strip: four pixel scenes built from the icon grids ----------
const spr = (name, x, y, s, fill) => `<path transform="translate(${x} ${y}) scale(${s})" d="${iconPath(name)}" fill="${fill}"/>`;
const SKY = '<rect width="120" height="76" fill="#0e1b30"/>';
const GROUND = '<rect y="56" width="120" height="20" fill="#2f6b3a"/><rect y="56" width="120" height="2" fill="#4a9a58"/>';
const fire = (x, y, s) => spr('flame', x, y, s, '#ff8a3d') + spr('flame', x + s * 2.2, y + s * 3.4, s * 0.5, '#ffe08a');

function field(x) { // a patch of land seen from above, with one big fire and two small ones
  return `<rect x="${x}" y="8" width="46" height="46" fill="#2f6b3a"/>` +
    fire(x + 12, 12, 1.2) + fire(x + 2, 44, 0.75) + fire(x + 37, 10, 0.75);
}
function gridLines(x, n) {
  let s = '';
  for (let k = 0; k <= n; k++) {
    const d = k * 46 / n;
    s += `<path d="M${x + d} 8v46M${x} ${8 + d}h46" stroke="#ffffff" stroke-width="0.4" opacity="0.7" fill="none"/>`;
  }
  return s;
}
const lit = (x, y, size) => `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#e34a33" opacity="0.55" stroke="#fff" stroke-width="0.8"/>`;

const SCENES = [
  [SKY + GROUND + spr('tree', 6, 38, 2, '#3f8f4f') + spr('tree', 25, 41, 1.7, '#3f8f4f') + spr('tree', 87, 39, 2, '#3f8f4f') +
    spr('tree', 104, 42, 1.6, '#3f8f4f') + spr('cloud', 60, 10, 2, '#8b93a1') + spr('cloud', 45, 22, 1.2, '#6b7483') + fire(50, 35, 2.4) +
    spr('sat', 4, 4, 1.6, '#d9dde3'),
  'A fire burns. A satellite passing overhead sees its heat.'],
  [SKY + field(8) + lit(8, 8, 23) + gridLines(8, 2) + field(66) + lit(77.5, 19.5, 11.5) + lit(66, 42.5, 11.5) + lit(100.5, 8, 11.5) + gridLines(66, 4) +
    '<text class="c-text" x="31" y="64" text-anchor="middle">MODIS: 1</text><text class="c-sub" x="31" y="71" text-anchor="middle">1 km squares</text>' +
    '<text class="c-text" x="89" y="64" text-anchor="middle">VIIRS: 3</text><text class="c-sub" x="89" y="71" text-anchor="middle">375 m squares</text>',
  'MODIS looks through 1 km squares and reports one hot spot. VIIRS looks through 375 m squares, so it also finds the small fires.'],
  [SKY + GROUND + [14, 60, 106].map(x => `<path d="M${x} 20L60 40" stroke="#ffe08a" stroke-width="0.8" stroke-dasharray="2 2"/>` +
    `<text class="c-text" x="${x}" y="30" text-anchor="middle">+1</text>`).join('') +
    spr('sat', 6, 3, 1.8, '#d9dde3') + spr('sat', 52, 2, 1.8, '#d9dde3') + spr('sat', 98, 3, 1.8, '#d9dde3') + fire(50, 37, 2.2) +
    '<text class="c-text" x="60" y="71" text-anchor="middle">one fire, counted 3 times</text>',
  'Several VIIRS satellites now fly. Add their counts together and the same fire is counted again for each one.'],
  [SKY + [8, 28, 48].map(y => spr('sat', 5, y, 1.4, '#d9dde3') + `<path d="M20 ${y + 6}L44 37" stroke="#ffffff" stroke-width="0.7" stroke-dasharray="2 2"/>`).join('') +
    '<rect x="44" y="25" width="32" height="24" fill="#17705f" stroke="#fff" stroke-width="1"/>' +
    '<text class="c-text" x="60" y="36" text-anchor="middle">ONE</text><text class="c-text" x="60" y="44" text-anchor="middle">UNIT</text>' +
    '<path d="M76 37h10" stroke="#ffffff" stroke-width="0.7" stroke-dasharray="2 2"/>' + fire(88, 26, 2) +
    '<text class="c-text" x="97" y="56" text-anchor="middle">= 1</text><text class="c-sub" x="60" y="71" text-anchor="middle">the same unit, 2002 to today</text>',
  'This page keeps every satellite apart and converts to one unit: what Aqua MODIS would have seen. That is why its number is lower, and steady.'],
];

function comic() {
  return '<ol class="comic">' + SCENES.map(([art, text], k) =>
    `<li><svg viewBox="0 0 120 76" shape-rendering="crispEdges" role="img" aria-label="Panel ${k + 1}">${art}</svg>` +
    `<p><span class="comic-no">${k + 1}</span>${text}</p></li>`).join('') +
    '</ol><p class="small">The four panels are an illustration, not data. The chart below is the real record.</p>';
}

// ---------- chart: raw detections per satellite against the Aqua-equivalent line ----------
function whyChart(pack) {
  const SERIES = [['Terra MODIS', 8, '#999999'], ['Suomi NPP VIIRS', 5, '#56b4e9'], ['NOAA-20 VIIRS', 6, '#0072b2'], ['NOAA-21 VIIRS', 7, '#cc79a7']];
  const years = new Map();
  for (const r of pack.region.months) {
    if (r[0] < pack.firstMonth || r[0] > pack.lastMonth) continue;
    const y = c.toYearMonth(r[0]).year;
    if (!years.has(y)) years.set(y, { raw: [0, 0, 0, 0], line: 0 });
    const t = years.get(y);
    SERIES.forEach((s, k) => { t.raw[k] += r[s[1]]; });
    t.line += c.headline(pack, r[0], r[1], r[2]) || 0;
  }
  const list = [...years], w = 640, h = 290, l = 44, b = 20, top = 40;
  const max = niceMax(Math.max(...list.map(([, t]) => t.raw.reduce((a, v) => a + v, 0))));
  const step = (w - l - 6) / list.length, y = v => h - b - v / max * (h - b - top);
  let body = axes(w, h, l, b, max, top), path = '', rockets = '';
  list.forEach(([year, t], k) => {
    let base = 0;
    t.raw.forEach((v, s) => {
      if (v > 0) body += `<rect class="bar" x="${(l + k * step + 2).toFixed(1)}" y="${y(base + v).toFixed(1)}" width="${(step - 4).toFixed(1)}" height="${(y(base) - y(base + v)).toFixed(1)}" fill="${SERIES[s][2]}"/>`;
      base += v;
      // a rocket marks the first year a VIIRS satellite shows up in this record
      if (s > 0 && v > 0 && !(k > 0 && list[k - 1][1].raw[s] > 0)) {
        const cx = l + (k + 0.5) * step;
        rockets += `<path d="M${cx} 30V${y(base).toFixed(1)}" stroke="${SERIES[s][2]}" stroke-width="1" stroke-dasharray="2 3"/>` +
          `<path transform="translate(${cx - 7} 2) scale(1.6)" d="${iconPath('rocket')}" fill="${SERIES[s][2]}"/>` +
          `<text x="${cx}" y="27" text-anchor="middle">${SERIES[s][0].replace(' VIIRS', '')}</text>`;
      }
    });
    const cx = l + (k + 0.5) * step;
    path += `${k ? 'L' : 'M'}${cx.toFixed(1)} ${y(t.line).toFixed(1)}`;
    if (k % 2 === 0) body += `<text x="${cx}" y="${h - 6}" text-anchor="middle">${year}</text>`;
  });
  return '<div class="chart-key">' + SERIES.map(s => `<span><i style="background:${s[2]}"></i>${s[0]}, raw detections</span>`).join('') +
    '<span><i style="background:#d55e00"></i>Aqua-equivalent hot spots (line)</span></div>' +
    svg(w, h, body + rockets + `<path d="${path}" fill="none" stroke="#d55e00" stroke-width="3" stroke-linejoin="miter"/>`) +
    `<p class="small">Per year, whole region. A rocket marks the year a satellite joins this record. The first year starts in ` +
    `${c.monthLabel(pack.firstMonth)}; the last year ends in ${c.monthLabel(pack.lastMonth)}.</p>`;
}

export function renderWhy(pack) {
  $('why-comic').innerHTML = comic();
  $('why-chart').innerHTML = whyChart(pack);
}

// ---------- methods: one gauge per criterion, one row per model ----------
const NAMES = { baseline: 'Baseline, one ratio', monthly: 'Ratio per calendar month', size: 'Fire-size curves' };
const pct = v => { const n = Math.round(v * 100); return `${n > 0 ? '+' : ''}${n === 0 ? 0 : n}%`; };

// rows: [{ name, values: [number], labels: [text], stamp: true | false | null, used }]
// axis: [low, high]; zone: [low, high] is where a value passes; ticks: [[value, label]]
function gauge(rows, axis, zone, ticks) {
  const w = 600, x0 = 176, x1 = 520, rowH = 26, h = rows.length * rowH + 24;
  const x = v => +(x0 + (Math.max(axis[0], Math.min(axis[1], v)) - axis[0]) / (axis[1] - axis[0]) * (x1 - x0)).toFixed(1);
  let body = `<rect class="z-pass" x="${x(zone[0])}" y="2" width="${(x(zone[1]) - x(zone[0])).toFixed(1)}" height="${rows.length * rowH}"/>`;
  for (const [v, label] of ticks) {
    body += `<line class="z-edge" x1="${x(v)}" y1="0" x2="${x(v)}" y2="${rows.length * rowH + 6}"/>` +
      `<text x="${x(v)}" y="${h - 4}" text-anchor="middle">${label}</text>`;
  }
  rows.forEach((r, k) => {
    const y = 2 + k * rowH + rowH / 2;
    body += `<text class="g-name${r.used ? ' used' : ''}" x="0" y="${y + 4}">${r.name}</text>` +
      `<line class="g-rail" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`;
    r.values.forEach((v, n) => {
      body += `<rect class="g-dot${r.used ? ' used' : ''}" x="${x(v) - 4}" y="${y - 4}" width="8" height="8"><title>${r.labels[n]}</title></rect>`;
    });
    if (r.values.length === 1) body += `<text class="g-val" x="${x(r.values[0]) + 8}" y="${y - 6}">${r.labels[0]}</text>`;
    const stamp = r.stamp === null ? ['REF', 'ref'] : r.stamp ? ['PASS', 'pass'] : ['FAIL', 'fail'];
    body += `<text class="g-stamp ${stamp[1]}" x="${w}" y="${y + 4}" text-anchor="end">${stamp[0]}</text>`;
  });
  return svg(w, h, body);
}

export function renderMethods(pack) {
  const meta = pack.meta, test = meta.test, def = meta.criteria_definition, keys = Object.keys(test);
  const years = Object.keys(test.baseline.years), limit = def.C1_factor * test.baseline.median_log_error;
  const row = (key, values, labels, crit) => ({ name: NAMES[key] || key, values, labels, used: key === meta.model,
    stamp: test[key].criteria ? test[key].criteria[crit] : null });

  const errors = keys.map(k => test[k].median_log_error);
  const c1 = gauge(keys.map(k => row(k, [test[k].median_log_error], [test[k].median_log_error.toFixed(4)], 'C1')),
    [Math.min(...errors, limit) * 0.95, Math.max(...errors) * 1.03], [0, limit], [[limit, `pass line ${limit.toFixed(4)}`]]);
  const c2 = gauge(keys.map(k => row(k, [test[k].coverage], [(test[k].coverage * 100).toFixed(1) + '%'], 'C2')),
    [def.C2_range[0] - 0.1, def.C2_range[1] + 0.1], def.C2_range, def.C2_range.map(v => [v, `${Math.round(v * 100)}%`]));
  const c3 = gauge(keys.map(k => row(k, years.map(y => test[k].years[y].error), years.map(y => `${y}: ${pct(test[k].years[y].error)}`), 'C3')),
    [-def.C3_limit - 0.08, def.C3_limit + 0.08], [-def.C3_limit, def.C3_limit],
    [[-def.C3_limit, pct(-def.C3_limit)], [0, '0%'], [def.C3_limit, pct(def.C3_limit)]]);

  const card = (no, title, text, art) => `<div class="crit"><h3><span class="comic-no">${no}</span>${title}</h3><p class="small">${text}</p>${art}</div>`;
  const verdicts = keys.filter(k => test[k].criteria).map(k => {
    const t = test[k], failed = ['C1', 'C2', 'C3'].filter(x => !t.criteria[x]);
    return `<li><strong>${NAMES[k] || k}</strong>: ${t.criteria.pass ? 'passes all three' : 'fails ' + failed.join(', ')}.` +
      (k === meta.model ? ` This is the model in use${meta.calibrated ? '' : ', shown as uncalibrated'}. Its pass on C1 is narrow: ` +
        `${t.median_log_error.toFixed(4)} against a pass line of ${limit.toFixed(4)}.` : ' Reported as it is.') + '</li>';
  }).join('');

  const mark = v => v === true ? '<span class="pass">PASS</span>' : v === false ? '<span class="fail">FAIL</span>' : '-';
  const tableRows = keys.map(k => {
    const t = test[k], cr = t.criteria;
    return `<tr><td>${NAMES[k] || k}${k === meta.model ? ' <strong>(in use)</strong>' : ''}</td>` +
      `<td>${t.median_log_error.toFixed(4)}</td><td>${(t.coverage * 100).toFixed(1)}%</td>` +
      years.map(y => `<td>${pct(t.years[y].error)}</td>`).join('') +
      `<td>${mark(cr && cr.C1)}</td><td>${mark(cr && cr.C2)}</td><td>${mark(cr && cr.C3)}</td>` +
      `<td>${cr ? (cr.pass ? '<span class="pass">PASSES</span>' : '<span class="fail">FAILS</span>') : 'reference'}</td></tr>`;
  }).join('');
  const s = meta.smoke, used = test[meta.model];
  const stepCard = (ic, title, text) => `<div class="step">${icon(ic)}<strong>${title}</strong><span class="small">${text}</span></div>`;

  $('methods-body').innerHTML = `
    <div class="steps">
      ${stepCard('list', `1. Learn`, `Fit the conversion on ${meta.train_years[0]} to ${meta.train_years[1]}, when Aqua and Suomi NPP both flew.`)}
      ${stepCard('close', `2. Hide`, `Hide Aqua for ${meta.test_years[0]} to ${meta.test_years[1]}, as if MODIS had already ended.`)}
      ${stepCard('approx', `3. Rebuild`, 'Rebuild those years from Suomi NPP VIIRS alone.')}
      ${stepCard('equal', `4. Compare`, 'Compare with what Aqua really saw. The pass lines were fixed before the run.')}
    </div>
    <div class="crits">
      ${card('C1', 'Is it closer than the simple method?', `Typical error per block-month (median log error). Lower is better. It must be at most ${def.C1_factor} times the baseline's.`, c1)}
      ${card('C2', 'Is the stated range honest?', `Share of test block-months that fell inside the 80% interval. It must be between ${def.C2_range[0] * 100}% and ${def.C2_range[1] * 100}%.`, c2)}
      ${card('C3', 'Does each hidden year add up?', `Error of each year's total (${years.join(', ')}), one square per year. Each must be within ${def.C3_limit * 100}%.`, c3)}
    </div>
    <p class="small"><span class="key k-zone"></span>shaded: where a value passes <span class="key k-dot"></span>a model's result
      <span class="key k-used"></span>the model in use. REF: the baseline is the reference and is not judged.</p>
    <ul class="verdicts">${verdicts}</ul>
    <details class="more"><summary>${icon('list')}All the numbers, as a table</summary>
      <div class="table-scroll"><table class="test">
        <thead><tr><th>Model</th><th>Median log error</th><th>Interval coverage</th>${years.map(y => `<th>${y} total</th>`).join('')}
          <th>C1</th><th>C2</th><th>C3</th><th>Verdict</th></tr></thead><tbody>${tableRows}</tbody></table></div>
    </details>
    <ul>
      <li><strong>Later years</strong> (Aqua's overpass time drifts from 2023, not a fair test):
        ${Object.entries(used.drift_years).map(([y, d]) => `${y} ${pct(d.error)}`).join(', ')}.</li>
      <li><strong>Smoke:</strong> ${s ? `a 0.5° block is smoky in a month with ${s.min_days} or more days of aerosol optical depth ${s.aod_threshold} or higher. Data starts ${c.monthLabel(s.first_month)}. The flag never changes a count.` : 'no smoke data in this pack.'}</li>
      <li><strong>Left out:</strong> ${meta.static_cells.length} cells with a persistent heat source (industry or volcano).</li>
      <li><strong>Limits:</strong> only Suomi NPP is calibrated; no cloud data; no field validation; one 0.1° cell is uncertain,
        large areas are much tighter.</li>
      <li><strong>Data pack built:</strong> ${meta.generated}.</li>
    </ul>`;
}
