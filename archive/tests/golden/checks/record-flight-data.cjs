// Records what V6's own KML reader (parseKmlText, original/shell.html line 2318)
// returns for each real track and each fixture, so tests/golden/flight-data-kml.test.js
// can check src/flight-data/kml.js against it in Node (R9, D10).
//
// parseKmlText needs the browser's XML parser, so it runs in Chromium. Only the
// function itself is loaded (cut out of original/shell.html, unchanged), not the
// whole V6 page.
//
// Usage: NODE_PATH=$(npm root -g) node tests/golden/checks/record-flight-data.cjs [extra.kml=label ...]
//   Extra files (such as Patrick's own track) are fingerprinted only: their points
//   are never written to the recording, so the recording can be committed.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.join(ROOT, 'tests/golden/v6-flight-data.json');

const EXAMPLES = [
  ['example-1', 'original/assets/585aab2601b787ed.kml'],
  ['example-2', 'original/assets/3ee2a7e81a74880c.kml'],
  ['example-3', 'original/assets/3085ab3861e2bae6.kml'],
  ['example-4', 'original/assets/46e14716b39044c4.kml'],
];
const FIXTURE_DIR = 'tests/fixtures/flight-data';

/** One point as the list the golden test compares: V6's raw fields in V6's order. */
const row = p => [p.lon, p.lat, p.altm, p.t, p.gNative, p.pitchNative];
const sha = rows => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');

(async () => {
  const { v6FunctionText } = await import('../v6-source.js');
  const source = `const KML_COLORS={1:'#0066ff',2:'#00cc44',3:'#ff2222',4:'#050505'};\n${v6FunctionText('parseKmlText')}`;

  const inputs = [
    ...EXAMPLES.map(([label, file]) => ({ label, file, keepPoints: 'samples' })),
    ...fs.readdirSync(path.join(ROOT, FIXTURE_DIR)).filter(f => f.endsWith('.kml')).sort()
      .map(f => ({ label: 'fixture:' + f, file: path.join(FIXTURE_DIR, f), keepPoints: 'all' })),
    ...process.argv.slice(2).map(arg => {
      const [file, label] = arg.split('=');
      return { label, file, keepPoints: 'none' };
    }),
  ];

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addScriptTag({ content: `${source}\nwindow.parseKmlText=parseKmlText;` });

  const recording = {
    source: 'V6 parseKmlText (original/shell.html line 2318), run in Chromium ' + browser.version(),
    fields: ['lon', 'lat', 'altm', 't', 'gNative', 'pitchNative'],
    tracks: {},
  };
  for (const input of inputs) {
    const text = fs.readFileSync(path.resolve(ROOT, input.file), 'utf8');
    const result = await page.evaluate(t => {
      try { return { raw: window.parseKmlText(t, 1, 'x').raw }; }
      catch (e) { return { error: e.message }; }
    }, text);
    const entry = { file: input.keepPoints === 'none' ? null : input.file };
    if (result.error) {
      entry.error = result.error;
    } else {
      const rows = result.raw.map(row);
      entry.count = rows.length;
      entry.sha256 = sha(rows);
      if (input.keepPoints === 'all') entry.points = rows;
      if (input.keepPoints === 'samples') {
        const step = Math.max(1, Math.floor(rows.length / 60));
        entry.samples = {};
        for (let i = 0; i < rows.length; i += step) entry.samples[i] = rows[i];
        entry.samples[rows.length - 1] = rows[rows.length - 1];
      }
    }
    recording.tracks[input.label] = entry;
    console.log(input.label.padEnd(40), entry.error || `${entry.count} points ${entry.sha256.slice(0, 12)}`);
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(recording, null, 1) + '\n');
  console.log('wrote', path.relative(ROOT, OUT));
})().catch(e => { console.error(e); process.exit(1); });
