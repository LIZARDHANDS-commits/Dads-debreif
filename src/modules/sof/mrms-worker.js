// The background worker that reads NOAA MRMS files for the SOF's 3D radar (SOF-67): a thin wrapper, so the reading never makes the view stutter. All the work is
// mrms-model.js `decodeFile` with grib2.js `readGrib2Window` (pure, tested in Node); this file only passes messages. One file at a time, in the order asked.
//
// In:  { id, gz: ArrayBuffer, product, nameTime, target, layout }   (the bytes are handed over, not copied)
// Out: { id, ok: true, time, kind, cells | codes + covered + coveredShare } or { id, ok: false, reason }   (the arrays handed back, not copied)
import { decodeFile } from './mrms-model.js';
import { readGrib2Window } from './grib2.js';

const scope = /** @type {any} */ (self); // a dedicated worker's global scope
let queue = Promise.resolve();

scope.onmessage = (event) => {
  const { id, gz, product, nameTime, target, layout } = event.data ?? {};
  queue = queue.then(async () => {
    let reply;
    try {
      reply = await decodeFile({ gz: new Uint8Array(gz), product, nameTime, target, layout }, readGrib2Window);
    } catch {
      reply = { ok: false, reason: 'file could not be read' };
    }
    const transfer = [reply.cells, reply.codes, reply.covered].filter(Boolean).map((a) => a.buffer);
    scope.postMessage({ id, ...reply }, { transfer });
  });
};
