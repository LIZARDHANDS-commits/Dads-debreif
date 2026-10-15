// Golden test (D10): the debrief's built-in routes are V6's own 19 route
// overlays (USER_KML_OVERLAYS in original/shell.html), read the way V6's
// parseKmlOverlayText reads them: every <coordinates> line with two or more
// points, as longitude and latitude.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROUTES } from '../../src/modules/debrief/data/routes.js';

const shell = readFileSync(new URL('../../original/shell.html', import.meta.url), 'utf8');
const start = shell.indexOf('const USER_KML_OVERLAYS=') + 'const USER_KML_OVERLAYS='.length;
const end = shell.indexOf(';\n', start);
const v6 = JSON.parse(shell.slice(start, end));

// V6 parseKmlOverlayText (line 2233) without the page's XML parser.
function v6Paths(kml) {
  const paths = [];
  for (const [, raw] of kml.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g)) {
    const path = [];
    for (const tok of raw.trim().split(/\s+/)) {
      const a = tok.split(',').map(Number);
      if (a.length >= 2 && Number.isFinite(a[0]) && Number.isFinite(a[1])) path.push([a[0], a[1]]);
    }
    if (path.length >= 2) paths.push(path);
  }
  return paths;
}

test('the 19 routes are V6\'s, with V6\'s names (without .kml) and the same points', () => {
  assert.equal(v6.length, 19);
  const byName = new Map(ROUTES.map((r) => [r.name, r.paths]));
  assert.equal(byName.size, 19);
  for (const overlay of v6) {
    const name = overlay.name.replace(/\.kml$/i, '');
    assert.deepEqual(byName.get(name), v6Paths(overlay.kml), name);
  }
});
