// Loads the four JSON files of the pack and builds the indexes the page needs. Format: PACK.md.
import { rankStep } from './calc.js';

const BASE = 'data/sea/';

async function get(name, optional = false) {
  let res;
  try {
    res = await fetch(BASE + name);
  } catch (e) {
    if (optional) return null;
    throw new Error(`Could not load ${name}. Check the connection and try again.`);
  }
  if (!res.ok) {
    if (optional) return null;
    throw new Error(`Could not load ${name} (HTTP ${res.status}).`);
  }
  try {
    return await res.json();
  } catch (e) {
    if (optional) return null;
    throw new Error(`${name} is damaged and could not be read.`);
  }
}

export async function loadPack() {
  const [meta, region, raw, smoke] = await Promise.all([
    get('meta.json'), get('region.json'), get('cells.json'), get('smoke.json', true),
  ]);
  const aquaSet = new Set(meta.aqua_months), estSet = new Set(meta.est_months);
  const withData = [...aquaSet, ...estSet];
  const firstMonth = Math.min(...withData), lastMonth = Math.max(...withData);
  const months = lastMonth + 1;

  // months with data, per calendar month (for ranking a value against other years)
  const calMonths = Array.from({ length: 12 }, () => []);
  for (let m = firstMonth; m <= lastMonth; m++) if (aquaSet.has(m) || estSet.has(m)) calMonths[m % 12].push(m);

  const cells = [], blocks = [], blockAt = new Map();
  const cellsByMonth = Array.from({ length: months }, () => ({ idx: [], val: [] }));
  let recordMax = 0;
  for (const key in raw) {
    const [i, j] = key.split(',').map(Number);
    const cell = { idx: cells.length, i, j, lat: (i + 0.5) * meta.cell, lon: (j + 0.5) * meta.cell, t: raw[key] };
    cells.push(cell);
    const bkey = `${Math.floor(cell.lat / meta.block)},${Math.floor(cell.lon / meta.block)}`;
    let block = blockAt.get(bkey);
    if (!block) {
      const [bi, bj] = bkey.split(',').map(Number);
      block = { idx: blocks.length, key: bkey, lat: (bi + 0.5) * meta.block, lon: (bj + 0.5) * meta.block,
        lat1: bi * meta.block, lon1: bj * meta.block, series: new Float32Array(months) };
      blocks.push(block);
      blockAt.set(bkey, block);
    }
    const t = cell.t;
    for (let k = 0; k < t.length; k += 3) {
      const m = t[k];
      if (m > lastMonth) continue;
      const v = aquaSet.has(m) ? t[k + 1] : estSet.has(m) ? t[k + 2] / 10 : 0;
      if (v > 0) {
        cellsByMonth[m].idx.push(cell.idx);
        cellsByMonth[m].val.push(v);
        block.series[m] += v;
        if (v > recordMax) recordMax = v;
      }
    }
  }

  // smoky blocks per month, as block corners
  const smokeByMonth = new Map();
  if (smoke && meta.smoke) {
    for (const key in smoke) {
      const [bi, bj] = key.split(',').map(Number);
      const t = smoke[key];
      for (let k = 0; k < t.length; k += 3) {
        if (t[k + 1] < meta.smoke.min_days) continue;
        if (!smokeByMonth.has(t[k])) smokeByMonth.set(t[k], []);
        smokeByMonth.get(t[k]).push({ lat: (bi + 0.5) * meta.block, lon: (bj + 0.5) * meta.block });
      }
    }
  }

  const staticKeys = new Set(meta.static_cells.map(([i, j]) => `${i},${j}`));
  const staticCells = meta.static_cells.map(([i, j]) => ({ lat: (i + 0.5) * meta.cell, lon: (j + 0.5) * meta.cell }));

  return { meta, region, smoke, aquaSet, estSet, firstMonth, lastMonth, calMonths, cells, blocks,
    cellsByMonth, recordMax, smokeByMonth, staticKeys, staticCells };
}

// Colour step of one cell in month m, ranked against the same calendar month in the other years.
export function cellStep(pack, cell, m, value) {
  const cal = m % 12, t = cell.t, values = [];
  for (let k = 0; k < t.length; k += 3) {
    if (t[k] % 12 !== cal || t[k] > pack.lastMonth) continue;
    const v = pack.aquaSet.has(t[k]) ? t[k + 1] : pack.estSet.has(t[k]) ? t[k + 2] / 10 : 0;
    if (v > 0) values.push(v);
  }
  return rankStep(value, values, pack.calMonths[cal].length - values.length);
}

export function blockStep(pack, block, m, value) {
  return rankStep(value, pack.calMonths[m % 12].map(k => block.series[k]));
}

// Blocks with a value above zero in month m: { idx, val } like cellsByMonth.
const blockCache = new Map();
export function blocksByMonth(pack, m) {
  if (!blockCache.has(m)) {
    const idx = [], val = [];
    for (const b of pack.blocks) if (b.series[m] > 0) { idx.push(b.idx); val.push(b.series[m]); }
    blockCache.set(m, { idx, val });
  }
  return blockCache.get(m);
}
