// Demo mode (?demo=1): the real page plays a fixed 30 second tour by itself, for the demo video.
// Real page, real data, nothing faked. To adjust the tour, edit TEAM and the STEPS list only.
import { toIndex } from './calc.js';

const TEAM = '';                 // team name: fill in before recording
const CHALLENGE = 'NASA Space Apps Challenge 2026\nHarmonization of MODIS and VIIRS Hot Spots';

export function runDemo({ pack, map, setMonth, setArea, presetDef, riau }) {
  document.body.classList.add('demo');
  const $ = id => document.getElementById(id);
  const caption = text => { $('caption').hidden = !text; $('caption').textContent = text || ''; };
  const side = (cls, html) => {
    $('demo-side').hidden = !html;
    $('demo-side').className = 'demo-side ' + cls;
    $('demo-side').innerHTML = html || '';
    $('caption').style.right = cls === 'right' ? '34%' : '0'; // keep the caption clear of the side panel
  };
  const first = pack.firstMonth, last = pack.lastMonth;
  const used = pack.meta.test[pack.meta.model];
  const worst = Math.max(...Object.values(used.years).map(y => Math.abs(y.error)));

  // Each step: at (seconds), run(). Camera moves take { lon, lat, dist, tilt, turn } and a time in ms.
  const STEPS = [
    { at: 0, run() {
      map.setMode('3d');
      setArea(presetDef(null), { fly: false });
      setMonth(first);
      map.flyTo({ lon: 150, lat: 22, dist: 95, tilt: 0.25, turn: -0.9 }, 0);
      map.home(3800);
      caption(`${$('project-name').textContent}${TEAM ? '\n' + TEAM : ''}\n${CHALLENGE}`);
    } },
    { at: 4, run() {
      caption('Twenty-four years of hot spots, in one unit');
      map.flyTo({ turn: 0.3 }, 8000);
      const start = performance.now();
      const tick = now => {
        const k = Math.min(1, (now - start) / 7600);
        setMonth(first + Math.round(k * (last - first)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } },
    { at: 12, run() {
      caption('More satellites, not more fire');
      side('full', $('why-chart').innerHTML);
    } },
    { at: 18, run() {
      side('right', '<table class="cal">' + $('cal').innerHTML + '</table>');
      setArea(presetDef(riau));
      setMonth(toIndex(2019, 9));
      side('right', '<table class="cal">' + $('cal').innerHTML + '</table>');
      map.setSmoke(true);
      caption('Low counts under smoke are flagged, not trusted');
    } },
    { at: 25, run() {
      side('', '');
      const y = pack.meta.test_years;
      caption(`Tested on hidden years ${y[0]} to ${y[1]}: yearly totals within ${Math.ceil(worst * 100)}% of the real Aqua record\n` +
        `${location.host}${location.pathname}`);
    } },
  ];
  for (const s of STEPS) setTimeout(s.run, s.at * 1000);
}
