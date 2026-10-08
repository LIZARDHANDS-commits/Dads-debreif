// The SOF's airspace log, decided without a page (SPEC-sof, "3D view", SOF-39, Dad 7 Oct): who is in which airspace, and a running log of
// aircraft that are not T-6s entering and leaving CYA304, CYA305 and CYA307 (WATCHED_AREAS). It reads the traffic feed's answers (one call to
// `update` for each new answer, never one per frame) and keeps the log for this session only, in memory, newest first, at most LOG_MAX lines.
//
// It is information only. It raises no caution and nothing in the SOF banner reads it: an advisory area's traffic is not a SOF caution.
//
// Failure and stale behaviour: with no current answer (the layer off, loading, or the relay failing) there is nobody "inside" anything; the
// list of intruders is taken away rather than left frozen, and the view says why. The lines already logged stay. When answers come back,
// aircraft already inside are logged as "first seen in", not "entered", because nobody saw them come in.
//
// What is logged depends on the two ticks (`showT6`, `showAll`) at the time of the movement: T-6 movements are not logged unless "Show T-6s
// too" is on, and areas other than the watched ones are not logged unless "Show all airspace" is on. Who is inside is always followed for
// every volume, so ticking one never makes a flood of "entered" lines for aircraft already there. The two ticks are independent: "Show all
// airspace" lists every aircraft that is not a T-6 in any volume, and the T-6s too only with "Show T-6s too".
import { aircraftName } from './scene3d-model.js';
import { WATCHED_AREAS, occupancy, isT6 } from './airspace-occupancy.js';

/** The most lines the log keeps in memory (Dad, 7 Oct). */
export const LOG_MAX = 200;
/** The hover text of the panel, as Dad's words asked. */
export const INFO_ONLY_WORDS = 'Information only. Advisory area activity is not a SOF caution.';

const two = (n) => String(n).padStart(2, '0');
/** A time as "0412Z". */
export const hhmmZ = (t) => {
  const d = new Date(t);
  return `${two(d.getUTCHours())}${two(d.getUTCMinutes())}Z`;
};
const thousands = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** A height in words, to the nearest 100 ft as the feed's pressure altitude is only read that finely here: "12,000 ft", "on the ground", "height unknown". */
export const heightWords = (ft) => (ft === 'ground' ? 'on the ground' : typeof ft === 'number' && Number.isFinite(ft) ? `${thousands(Math.round(ft / 100) * 100)} ft` : 'height unknown');

/** The watched areas as one phrase: "CYA304/305/307" when they share a prefix, else the ids with commas. */
export function areasWords(watched = WATCHED_AREAS) {
  const m = watched.map((id) => /^([A-Z]+)(\d+)$/.exec(id));
  if (watched.length > 1 && m.every((x) => x && x[1] === m[0][1])) return `${m[0][1]}${m.map((x) => x[2]).join('/')}`;
  return watched.join(', ');
}

const who = (rec) => `${rec.name} (${rec.type ?? 'type unknown'})`;

/**
 * Makes a log. options: { watched (area ids), max (lines kept) }. Returns { update(answer), pause(reason), setOptions({ showT6, showAll }), setWatched(ids), view(), reset() }.
 * The watched areas are the home base's site profile's (sites/); `setWatched` changes them when home changes (then call `reset()`).
 */
export function createAirspaceLog({ watched: firstWatched = WATCHED_AREAS, max = LOG_MAX } = {}) {
  let watched = firstWatched;
  let inside = new Map(); // hex -> Map(id -> { name, type, t6, ft, possible, since })
  let known = new Set(); // the hexes of the last answer, to tell "entered" from "first seen in"
  let lines = []; // newest first: { id, at, text, alert }
  let lineCount = 0; // numbers each line once, so a line keeps its key as newer ones are added
  let state = 'off'; // 'off' | 'loading' | 'unavailable' | 'live'
  let options = { showT6: false, showAll: false };
  let words = areasWords(watched);

  function shownLine({ id, t6 }) {
    return (watched.includes(id) || options.showAll) && (!t6 || options.showT6);
  }

  return {
    /**
     * A new traffic answer: `aircraft` ({ hex, callsign, reg, type, lat, lon, alt }, or the layer model's `altitudeFt`), `volumes` (airspace-model.js
     * `checkedAirspace(...).volumes`), `groundFt` (home's elevation) and `at` (when the answer came, a Date or milliseconds).
     */
    update({ aircraft, volumes, groundFt = 0, at }) {
      const result = occupancy({ volumes, aircraft, groundFt, at });
      const seenBefore = state === 'live';
      const next = new Map();
      const gone = new Set(aircraft.map((a) => a.hex));
      const events = [];
      for (const a of aircraft) {
        const here = result.byHex.get(a.hex);
        const ids = [...here.inside, ...here.possibly];
        if (!ids.length) continue;
        const alt = a.alt ?? a.altitudeFt;
        const ft = alt === 'ground' ? 'ground' : typeof alt === 'number' && Number.isFinite(alt) ? alt : null;
        const was = inside.get(a.hex);
        const mine = new Map();
        for (const id of ids) {
          const before = was?.get(id);
          const rec = { id, name: aircraftName(a), type: a.type ?? null, t6: isT6(a), ft, possible: here.possibly.includes(id), since: before?.since ?? result.at };
          mine.set(id, rec);
          if (before || !shownLine(rec)) continue;
          const alert = watched.includes(id) && !rec.t6;
          const how = known.has(a.hex) && seenBefore ? 'entered' : 'first seen in';
          const where = rec.possible ? `${how === 'entered' ? 'may have entered' : 'first seen possibly in'} ${id}, height unknown` : `${how} ${id} at ${heightWords(ft)}`;
          events.push({ id: ++lineCount, at: result.at, text: `${hhmmZ(result.at)}  ${alert ? '⚠ ' : ''}${who(rec)} ${where}`, alert });
        }
        next.set(a.hex, mine);
      }
      for (const [hex, ids] of inside) {
        for (const [id, rec] of ids) {
          if (next.get(hex)?.has(id) || !shownLine(rec)) continue;
          events.push({ id: ++lineCount, at: result.at, text: `${hhmmZ(result.at)}  ${rec.name} ${gone.has(hex) ? `left ${id}` : `no longer reported (last in ${id})`}`, alert: false });
        }
      }
      inside = next;
      known = new Set(gone);
      state = 'live';
      lines = [...events.reverse(), ...lines].slice(0, max);
    },
    /** No current answer: 'off' (the layer is off), 'loading' or 'unavailable'. Nobody is inside anything until an answer comes; the lines stay. */
    pause(reason = 'off') {
      state = reason === 'loading' || reason === 'unavailable' ? reason : 'off';
      inside = new Map();
      known = new Set();
    },
    /** The two ticks: whether T-6 movements are logged, and whether areas other than the watched ones are. */
    setOptions({ showT6 = false, showAll = false } = {}) {
      options = { showT6: showT6 === true, showAll: showAll === true };
    },
    /**
     * What to show: { shown (false while the layer is off), state, stateWords (why there is nothing to list, or null), count (aircraft that are
     * not T-6s in the watched areas now), countWords, intruders: [{ key, hex, text }], lines: [{ key, text, alert }], hexes (a Map from each
     * intruder's hex id to the areas it is in, "CYA304", for the 3D tags), signature }.
     */
    view() {
      const intruders = [];
      for (const [hex, ids] of inside) {
        for (const [id, rec] of ids) {
          if (rec.t6 || !watched.includes(id)) continue;
          const detail = rec.possible ? `possibly in ${id}, height unknown` : `in ${id} at ${heightWords(rec.ft)}`;
          intruders.push({ key: `${hex}|${id}`, hex, since: rec.since, text: `${hhmmZ(rec.since)}  ⚠ ${who(rec)} ${detail}` });
        }
      }
      const hexes = new Map();
      for (const i of intruders) hexes.set(i.hex, [...(hexes.get(i.hex) ?? []), i.id]);
      for (const [hex, ids] of hexes) hexes.set(hex, ids.join(', '));
      const live = state === 'live';
      const count = hexes.size;
      const stateWords = live ? null : state === 'unavailable' ? 'Traffic unavailable: the airspace log is not being updated, and nobody is listed as inside.' : state === 'loading' ? 'Waiting for the first traffic answer.' : null;
      const countWords = !watched.length ? 'Airspace log: no watched areas for this base yet' : !live ? `Airspace log: no current traffic` : count ? `${count} non-T-6 in ${words}` : `No non-T-6 in ${words}`;
      const shownLines = lines.map((l) => ({ key: String(l.id), text: l.text, alert: l.alert }));
      return {
        shown: state !== 'off',
        state,
        stateWords,
        count,
        countWords,
        intruders,
        lines: shownLines,
        hexes,
        signature: [state, count, intruders.map((i) => i.text).join(';'), lines[0]?.id ?? 0].join('|'),
      };
    },
    /** The areas to watch for aircraft that are not T-6s (the site profile's `watchedAreas`); none for a base without any. */
    setWatched(/** @type {readonly string[]} */ ids = []) {
      watched = Array.isArray(ids) ? [...ids] : [];
      words = areasWords(watched);
    },
    /** Starts over (the module's home field changed, or a test). */
    reset() {
      inside = new Map();
      known = new Set();
      lines = [];
      state = 'off';
    },
  };
}
