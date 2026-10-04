// Checks: the example flight files the app serves (gzipped) read back identical to Dad's original track files; names that are not example assets are refused.
// Serves: DB-R1, ALL-R14.
// Expected values: real recorded data: Dad's track files in original/assets, compared byte for byte; the error wording is the code's own.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { EXAMPLE_FLIGHT } from '../../../src/flight-data/examples.js';
import { createExampleFetcher } from '../../../src/shell/examples.js';

const BASE = 'https://example.test/Dads-debreif/';
const root = (path) => new URL(`../../../${path}`, import.meta.url);

// A fetch that serves files from public/ as the static host would.
function publicFetch(calls = []) {
  return async (url) => {
    calls.push(String(url));
    const path = new URL(url).pathname.replace('/Dads-debreif/', '');
    try {
      return new Response(readFileSync(root(`public/${path}`)));
    } catch {
      return new Response('not found', { status: 404 });
    }
  };
}

test('every example track is served from public/examples/, gzipped, identical to V6', async () => {
  const calls = [];
  const exampleText = createExampleFetcher({ base: BASE, fetch: publicFetch(calls) });
  for (const { asset } of EXAMPLE_FLIGHT) {
    const text = await exampleText(asset);
    assert.equal(text, readFileSync(root(`original/assets/${asset}`), 'utf8'), asset);
  }
  assert.deepEqual(calls, EXAMPLE_FLIGHT.map(({ asset }) => `${BASE}examples/${asset}.gz`));
});

test('a file the server already un-gzipped is read as it is', async () => {
  const exampleText = createExampleFetcher({ base: BASE, fetch: async () => new Response('<kml/>') });
  assert.equal(await exampleText('585aab2601b787ed.kml'), '<kml/>');
  const gz = createExampleFetcher({ base: BASE, fetch: async () => new Response(gzipSync('<kml>é</kml>')) });
  assert.equal(await gz('585aab2601b787ed.kml'), '<kml>é</kml>');
});

test('refuses names that are not example assets, and fails on a missing file', async () => {
  let fetched = 0;
  const exampleText = createExampleFetcher({ base: BASE, fetch: async () => (fetched++, new Response('', { status: 404 })) });
  for (const name of ['../sw.js', 'x.kml', '585aab2601b787ed.kml/../../a', '585AAB2601B787ED.kml', 42]) {
    await assert.rejects(exampleText(name), /Not an example file/, String(name));
  }
  assert.equal(fetched, 0);
  await assert.rejects(exampleText('585aab2601b787ed.kml'), /couldn't be downloaded \(404\)/);
});
