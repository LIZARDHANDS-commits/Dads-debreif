// The example flight's track files (flight-data's EXAMPLE_FLIGHT), served from
// public/examples/ as gzip: about 0.7 MB instead of 11 MB. They download only
// when someone asks for the example (R5); the service worker keeps them once
// they have been fetched, so the example then works offline too (R6).
//
// Modules get this as app.exampleText(asset), which fits flight-data's
// loadExampleFlight(fetchText) as it is.

const ASSET = /^[0-9a-f]{16}\.kml$/;

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** createExampleFetcher({ base, fetch }) returns exampleText(asset), resolving to the file's text. */
export function createExampleFetcher({ base = globalThis.document?.baseURI, fetch = globalThis.fetch } = {}) {
  return async function exampleText(asset) {
    if (typeof asset !== 'string' || !ASSET.test(asset)) throw new Error(`Not an example file: ${asset}`);
    const response = await fetch(new URL(`examples/${asset}.gz`, base).href);
    if (!response.ok) throw new Error(`The example file ${asset} couldn't be downloaded (${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    // Some servers un-gzip it on the way (Content-Encoding); then it is already text.
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) return gunzip(bytes);
    return new TextDecoder().decode(bytes);
  };
}
