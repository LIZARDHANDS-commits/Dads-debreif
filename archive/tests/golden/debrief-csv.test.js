// Golden test (D10): V6's "Export Combined CSV" (shell line 3274), run
// unchanged, against the debrief's CSV. V6 wrote one row per recorded fix,
// ship by ship ("ship,time_iso,lat,lon,alt_ft,x_ft,y_ft"); the rebuild writes
// one row per second with the ships side by side (SPEC-debrief: CSV export,
// #28), which is the layout change on purpose. What stays pinned: at every
// fix on a whole second inside the shared window, the position and altitude
// in the new file are V6's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { v6Page } from './v6-source.js';
import { seeded } from './inputs.js';
import { buildFlight } from '../../src/flight-data/flight.js';
import { csvRows } from '../../src/modules/debrief/export-csv.js';

// V6's click handler, as written.
const HANDLER = (() => {
  const src = v6Page();
  const i = src.indexOf("el('exportKmlCsv').onclick=");
  assert.ok(i > 0, 'V6 export handler not found');
  return src.slice(src.indexOf('=', i) + 1, src.indexOf('};', i) + 1);
})();

// Runs V6's handler on its own `tracks` shape and returns the CSV it would download.
function v6Csv(tracks) {
  let text = null;
  const env = {
    tracks,
    Blob: class { constructor([t]) { text = t; } },
    URL: { createObjectURL: () => 'blob:' },
    document: { createElement: () => ({ click() {} }) },
  };
  const run = new Function(...Object.keys(env), `return (${HANDLER})();`);
  run(...Object.values(env));
  return text;
}

test('V6\'s combined CSV header is what the rebuild replaces', () => {
  assert.match(HANDLER, /let rows=\['ship,time_iso,lat,lon,alt_ft,x_ft,y_ft'\]/);
});

test('at every whole-second fix, the rebuild\'s CSV carries V6\'s position and altitude', () => {
  const r = seeded(28);
  const T0 = Date.UTC(2026, 5, 2, 18, 17, 0) / 1000;
  const input = {};
  for (const slot of [1, 2, 3, 4]) {
    const fixes = [];
    let lat = 50.33 + 0.01 * r();
    let lon = -105.55 + 0.01 * r();
    let altM = 1800 + 600 * r();
    for (let s = Math.floor(5 * r()); s < 240; s += r() < 0.1 ? 2 : 1) {
      lat += 0.0005 * (r() - 0.3);
      lon += 0.0007 * (r() - 0.3);
      altM += 8 * (r() - 0.5);
      fixes.push({ t: T0 + s, lat, lon, altM });
    }
    input[slot] = { name: `#${slot}`, fixes };
  }
  const flight = buildFlight(input);

  // V6's tracks shape: pts with t, lat, lon, altFt, x, y.
  const v6Tracks = Object.fromEntries(Object.values(flight.tracks).map((tr) => [tr.slot, {
    pts: tr.fixes.map((f) => ({ t: f.t, lat: f.lat, lon: f.lon, altFt: f.altFt, x: f.xFt, y: f.yFt })),
  }]));
  const v6Lines = v6Csv(v6Tracks).split('\n');
  assert.equal(v6Lines[0], 'ship,time_iso,lat,lon,alt_ft,x_ft,y_ft');

  const [header, ...rows] = csvRows(flight);
  const byTime = new Map(rows.map((row) => [row[0], row]));
  let checked = 0;
  for (const line of v6Lines.slice(1)) {
    const [ship, iso, lat, lon, altFt] = line.split(',');
    const time = iso.replace(/\.000Z$/, 'Z');
    const row = byTime.get(time);
    if (!row) continue; // outside the shared window: not played, so not exported
    const col = (name) => row[header.indexOf(`${ship} ${name}`)];
    assert.equal(col('lat'), Number(lat).toFixed(6), `${ship} ${time}`);
    assert.equal(col('lon'), Number(lon).toFixed(6), `${ship} ${time}`);
    // V6 wrote altitude to 0.1 ft, the rebuild to the foot: within half a foot.
    assert.ok(Math.abs(Number(col('alt ft')) - Number(altFt)) <= 0.55, `${ship} ${time}: ${col('alt ft')} vs ${altFt}`);
    checked++;
  }
  assert.ok(checked > 800, `only ${checked} fixes compared`);
});
