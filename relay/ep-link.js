// The EP Tabletop's phone link mailbox (docs/modules/ep-tabletop/spec.md, "The phone link"; EP-8 to EP-10). The instructor's phone puts
// the student's view here and the student's screen reads it about once a second:
//
//   GET    /ep-link?s=<session>                      the latest student view: { ageMs, view }, or 404
//   PUT    /ep-link?s=<session>  x-ep-key: <key>     stores it (JSON object, at most 16 KB). The first PUT keeps a SHA-256 hash of the
//                                                    key; a later PUT with another key is refused (403)
//   DELETE /ep-link?s=<session>  x-ep-key: <key>     ends the session
//
// The session id and the key are each 128 random bits in base64url (22 characters). An entry older than 6 hours reads as gone and is
// deleted when touched; making a new entry also sweeps the old ones. Nothing else is kept and nothing about who asked is logged.
// The same allowed origins as every other answer (lib.js allowedOrigins, never "allow all").
//
// The store is passed in (netlify/functions/ep-link.mjs gives it Netlify Blobs), so this file needs no install and the tests can give
// it a plain in-memory one.
import { allowedOrigins, reply, readCapped } from './lib.js';

/** An entry this old (from its first PUT) reads as gone: a tabletop never runs this long (a tool choice, EP-10). */
export const MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** The largest student view taken, in bytes (a full view is about 2 KB). */
export const MAX_BODY_BYTES = 16 * 1024;
/** At most this many entries are looked at by one sweep, so a create stays quick. */
const SWEEP_MAX = 100;

// 128 bits in base64url is 22 characters, the last carrying only 2 bits (A, Q, g or w).
const ID = /^[A-Za-z0-9_-]{21}[AQgw]$/;
const METHODS = 'GET, PUT, DELETE, OPTIONS';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Equal-length strings compared without stopping at the first difference. */
function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The session id from the query: `s` only, once, a 128-bit base64url id; else null. */
export function sessionOf(url) {
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 1 || keys[0] !== 's') return null;
  const s = url.searchParams.get('s');
  return ID.test(s) ? s : null;
}

/** Whether `text` is a well-formed id (session or key). */
export const isLinkId = (text) => typeof text === 'string' && ID.test(text);

/**
 * Builds the handler. `openStore()` gives the store for one request: { get(id) -> entry | null, create(id, entry) -> true if it was new,
 * put(id, entry), delete(id), keys() -> ids }. An entry is { keyHash, created, t, view }. `now` is the clock in ms.
 * Returns async (request, env) => Response. Never throws.
 * @param {{ openStore: () => any, now?: () => number }} deps
 */
export function createEpLinkHandler({ openStore, now = Date.now }) {
  const expired = (entry) => !isObject(entry) || !Number.isFinite(entry.created) || now() - entry.created > MAX_AGE_MS;

  async function sweep(store) {
    let ids = [];
    try {
      ids = (await store.keys()).slice(0, SWEEP_MAX);
    } catch {
      return; // a failed sweep is tried again at the next create
    }
    for (const id of ids) {
      try {
        if (expired(await store.get(id))) await store.delete(id);
      } catch {
        // left for the next sweep
      }
    }
  }

  /** The live entry for `id`, or null; an expired one is deleted on the way. */
  async function live(store, id) {
    const entry = await store.get(id);
    if (entry == null) return null;
    if (expired(entry)) {
      await store.delete(id);
      return null;
    }
    return entry;
  }

  return async function handle(request, env = {}) {
    try {
      const sent = request.headers.get('origin');
      const origin = sent === null ? null : allowedOrigins(env).includes(sent) ? sent : undefined;
      if (origin === undefined) return reply(403, { error: 'origin not allowed' });

      if (request.method === 'OPTIONS') {
        return reply(204, null, {
          origin,
          extra: origin ? { 'access-control-allow-methods': METHODS, 'access-control-allow-headers': 'content-type, x-ep-key', 'access-control-max-age': '86400' } : {},
        });
      }
      if (!['GET', 'PUT', 'DELETE'].includes(request.method)) return reply(405, { error: 'GET, PUT or DELETE only' }, { origin, extra: { allow: METHODS } });

      const url = new URL(request.url);
      if (url.pathname !== '/ep-link') return reply(404, { error: 'not found' }, { origin });
      const id = sessionOf(url);
      if (!id) return reply(400, { error: 's must be a session id, and nothing else in the address' }, { origin });

      const store = openStore();
      if (request.method === 'GET') {
        const entry = await live(store, id);
        if (!entry) return reply(404, { error: 'no such session' }, { origin });
        return reply(200, { ageMs: Math.max(0, now() - entry.t), view: entry.view }, { origin });
      }

      const key = request.headers.get('x-ep-key');
      if (!isLinkId(key)) return reply(403, { error: 'key missing or malformed' }, { origin });
      const keyHash = await sha256Hex(key);

      if (request.method === 'DELETE') {
        const entry = await live(store, id);
        if (!entry) return reply(404, { error: 'no such session' }, { origin });
        if (!sameText(entry.keyHash, keyHash)) return reply(403, { error: 'wrong key' }, { origin });
        await store.delete(id);
        return reply(204, null, { origin });
      }

      // PUT: a JSON object, at most 16 KB.
      let view;
      try {
        view = JSON.parse(await readCapped(request, MAX_BODY_BYTES));
      } catch {
        return reply(400, { error: `body must be a JSON object of at most ${MAX_BODY_BYTES} bytes` }, { origin });
      }
      if (!isObject(view)) return reply(400, { error: 'body must be a JSON object' }, { origin });

      const t = now();
      let entry = await live(store, id);
      if (!entry) {
        const fresh = { keyHash, created: t, t, view };
        if (await store.create(id, fresh)) {
          await sweep(store);
          return reply(201, { ok: true }, { origin });
        }
        entry = await live(store, id); // made at the same moment by another PUT: checked like any later one
        if (!entry) return reply(409, { error: 'try again' }, { origin });
      }
      if (!sameText(entry.keyHash, keyHash)) return reply(403, { error: 'wrong key' }, { origin });
      await store.put(id, { keyHash: entry.keyHash, created: entry.created, t, view });
      return reply(200, { ok: true }, { origin });
    } catch {
      return reply(500, { error: 'relay error' });
    }
  };
}

/** A store kept in memory, the same shape as the Netlify Blobs one (for tests and a local stand-in). */
export function createMemoryLinkStore() {
  const entries = new Map();
  const copy = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  return {
    get size() {
      return entries.size;
    },
    async get(id) {
      return copy(entries.get(id));
    },
    async create(id, entry) {
      if (entries.has(id)) return false;
      entries.set(id, copy(entry));
      return true;
    },
    async put(id, entry) {
      entries.set(id, copy(entry));
    },
    async delete(id) {
      entries.delete(id);
    },
    async keys() {
      return [...entries.keys()];
    },
  };
}
