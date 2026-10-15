// The phone link between the instructor's phone and the student's screen (spec, "The phone link"; EP-8 to EP-10). One small interface,
// createLink, so a direct link (EP-Q1 option (a), WebRTC) can be added beside the relay mailbox later without touching the screens:
//
//   createLink({ role: 'phone' | 'screen', session, key, relay, timers, fetch, current })
//     -> { send(view), onState(fn), onStatus(fn), status, close({ end }) }
//
// Built now: option (b), the relay mailbox (relay/ep-link.js). The phone PUTs the student view (studentView in student-view.js) at most
// twice a second, the latest one winning, and again every few seconds so the screen knows it is still there; the student's screen GETs
// it about once a second. No answer fresher than LOST_MS and the screen says the link is lost and keeps the last state (EP-R10).
// The session id and key are 128 random bits each; the key travels only in the QR code's address (after the #, so never to a server
// but the relay, in a header) and the relay keeps only its hash.
import { relayOrigin } from '../../wx/relay.js';

/** The student's screen asks this often (milliseconds): "about once a second" (spec). */
export const POLL_MS = 1000;
/** No fresh state for this long and the link reads as lost (EP-R10; "about 10 seconds", the brief for Step 2). */
export const LOST_MS = 10000;
/** The phone sends at most once in this long (about 2 a second), the latest view winning. */
export const SEND_GAP_MS = 500;
/** The phone sends again this often even when nothing changed, well inside LOST_MS, so the screen knows it is there. */
export const HEARTBEAT_MS = 4000;
/** A relay request that takes longer than this has failed (an estimate for a slow mobile network). */
const TIMEOUT_MS = 6000;

const ID = /^[A-Za-z0-9_-]{21}[AQgw]$/;

/** A new 128-bit random id in base64url (22 characters), for a session or its key. */
export function newLinkId(cryptoApi = globalThis.crypto) {
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const isLinkId = (text) => typeof text === 'string' && ID.test(text);

/**
 * The console's address for the QR code: this page's own address with the module's hash route and `console` (the shell's router reads
 * only the part before "?", so it still opens the EP Tabletop).
 */
export function consoleAddress({ session, key }, loc = globalThis.location) {
  return `${loc.origin}${loc.pathname}#/ep-tabletop?console&s=${session}&k=${key}`;
}

/** { session, key } from a console address's hash, or null when it isn't one (both ids checked strictly). */
export function readConsoleHash(hash) {
  const [path, query = ''] = String(hash ?? '').replace(/^#/, '').split('?');
  if (path.replace(/^\/+|\/+$/g, '').toLowerCase() !== 'ep-tabletop') return null;
  const q = new URLSearchParams(query);
  if (!q.has('console')) return null;
  const session = q.get('s');
  const key = q.get('k');
  return isLinkId(session) && isLinkId(key) ? { session, key } : null;
}

/**
 * @param {{ role: 'phone' | 'screen', session: string, key: string, relay: string, timers: any, fetch?: typeof fetch, now?: () => number, current?: () => any }} options
 *   timers: the module's scheduler scope; current: the phone's latest student view, sent again every HEARTBEAT_MS.
 */
export function createLink({ role, session, key, relay, timers, fetch: fetchFn = (u, i) => globalThis.fetch(u, i), now = () => Date.now(), current = null }) {
  const origin = relayOrigin(relay);
  const address = origin && isLinkId(session) ? `${origin}/ep-link?s=${session}` : null;
  let status = address ? (role === 'phone' ? 'connecting' : 'waiting') : 'unreachable';
  let closed = false;
  let stateFn = () => {};
  let statusFn = () => {};
  const cancels = [];

  const setStatus = (next) => {
    if (next === status) return;
    status = next;
    statusFn(next);
  };

  async function ask(method, { body = undefined, withKey = false } = {}) {
    const ctrl = new AbortController();
    const stop = timers.after(TIMEOUT_MS, () => ctrl.abort());
    try {
      /** @type {Record<string, string>} */
      const headers = {};
      if (withKey) headers['x-ep-key'] = key;
      if (body !== undefined) headers['content-type'] = 'application/json';
      return await fetchFn(address, { method, headers, body, cache: 'no-store', credentials: 'omit', mode: 'cors', signal: ctrl.signal });
    } finally {
      stop();
    }
  }

  // ---- The student's screen: reads about once a second ----
  let freshUntil = -Infinity;
  let everConnected = false;
  let failing = false;
  let lastText = '';
  let polling = false;
  async function poll() {
    if (polling || closed) return;
    polling = true;
    try {
      const res = await ask('GET');
      failing = false;
      if (res.status === 200) {
        const body = await res.json();
        const ageMs = Number(body?.ageMs);
        if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < LOST_MS) {
          freshUntil = now() + (LOST_MS - ageMs);
          everConnected = true;
          const text = JSON.stringify(body.view ?? null);
          if (text !== lastText) {
            lastText = text;
            if (!closed) stateFn(body.view, ageMs);
          }
        }
      } else if (res.status !== 404) failing = true;
    } catch {
      failing = true; // the relay can't be reached; what the screen shows stays as it was
    } finally {
      polling = false;
    }
    if (!closed) screenStatus();
  }
  const screenStatus = () => setStatus(now() < freshUntil ? 'connected' : everConnected ? 'lost' : failing ? 'unreachable' : 'waiting');

  // ---- The phone: sends the student view, at most every SEND_GAP_MS, the latest winning ----
  let latestText = null;
  let sentText = null;
  let lastSentAt = -Infinity;
  let sending = false;
  let waitCancel = null;
  function schedule() {
    if (closed || sending || waitCancel || latestText === null) return;
    const wait = lastSentAt + SEND_GAP_MS - now();
    if (wait > 0) {
      waitCancel = timers.after(wait, () => {
        waitCancel = null;
        schedule();
      });
      return;
    }
    put();
  }
  async function put() {
    sending = true;
    lastSentAt = now();
    const text = latestText;
    try {
      const res = await ask('PUT', { body: text, withKey: true });
      if (res.ok) {
        sentText = text;
        setStatus('connected');
      } else setStatus(res.status === 403 ? 'refused' : 'unreachable');
    } catch {
      setStatus('unreachable');
    } finally {
      sending = false;
    }
    if (latestText !== sentText) schedule();
  }

  if (address && !closed) {
    if (role === 'screen') {
      cancels.push(timers.every(POLL_MS, poll));
      poll();
    } else if (typeof current === 'function') {
      cancels.push(timers.every(HEARTBEAT_MS, () => {
        if (now() - lastSentAt < HEARTBEAT_MS - SEND_GAP_MS) return;
        latestText = JSON.stringify(current());
        sentText = null; // the same view still goes, so the relay's entry stays fresh
        schedule();
      }));
    }
  }

  return {
    get status() {
      return status;
    },
    /** The phone's latest student view, to be sent (coalesced). */
    send(view) {
      if (role !== 'phone' || !address || closed) return;
      latestText = JSON.stringify(view);
      if (latestText !== sentText) schedule();
    },
    onState(fn) {
      stateFn = typeof fn === 'function' ? fn : () => {};
    },
    onStatus(fn) {
      statusFn = typeof fn === 'function' ? fn : () => {};
    },
    /** Stops it. `end`: the student's screen also ends the session on the relay (the code stops working). */
    close({ end = false } = {}) {
      if (closed) return;
      closed = true;
      for (const c of cancels) c();
      waitCancel?.();
      if (end && address && isLinkId(key)) {
        fetchFn(address, { method: 'DELETE', headers: { 'x-ep-key': key }, credentials: 'omit', mode: 'cors', keepalive: true }).catch(() => {});
      }
    },
  };
}
