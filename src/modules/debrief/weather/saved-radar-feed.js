// The saved radar's fetch (SPEC-debrief: Saved radar and lightning, task 12f):
// asked for by the person, never by a toggle (R5); it asks ECCC which pictures
// it still has, fetches every frame covering the flight a few at a time, keeps
// the ones that are pictures, thins them to the size limit, and holds the set
// until the debrief is saved. Cancelling, closing the flight or closing the
// debrief stops it and keeps nothing. Network and clock come in as arguments.
import {
  SAVED_LAYERS, LIMITS, notKeptText, inWindow, coveringTimes, savedBox, imageSize, frameUrl, capabilitiesUrl, layerTimes,
  frameFromReply, fitCap, makeSaved, savedSummary, hhmmZ, thinningNote,
} from './saved-radar.js';

const LAYER_NAMES = Object.freeze({ rain: 'rain radar', snow: 'snow radar', lightning: 'lightning' });
const capital = (text) => text[0].toUpperCase() + text.slice(1);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
/** How many requests are open at once: a few, so it is quick without hammering ECCC. */
const CONCURRENCY = 3;

const OFFLINE = "ECCC couldn't be reached. Check the connection and try again.";
const NONE_LEFT = 'ECCC had no pictures for this flight any more.';
const errorText = (status) => `ECCC gave an error (HTTP ${status}).`;
const tooLargeText = `the pictures are too large to keep (${LIMITS.maxFrameBytes / 1024 / 1024} MB each at most).`;

/**
 * fetch: the browser's fetch (replaceable in tests). now(): seconds since 1970.
 * onChange: called whenever the state changes, so the menu can redraw.
 * capBytes: the size limit (tests use a small one).
 * Returns { state(), start(flight), cancel(), setFlight(flight), load(saved), dispose() }.
 * `flight` is { startT, endT, bounds } (bounds as flightLatLonBounds gives).
 * state() is { phase: 'idle' | 'fetching' | 'done' | 'failed', done, total,
 * saved, notes, failure, fromFile }.
 */
export function createSavedRadarFeed({
  fetch = (input, init) => globalThis.fetch(input, init),
  now = () => Date.now() / 1000,
  onChange = () => {},
  capBytes = LIMITS.maxTotalBytes,
  concurrency = CONCURRENCY,
} = {}) {
  let phase = 'idle';
  let done = 0;
  let total = 0;
  let saved = null;
  let notes = [];
  let failure = null;
  let fromFile = false;
  let run = null; // the fetch under way: { abort }
  let disposed = false;

  const emit = () => {
    if (!disposed) onChange();
  };

  function fail(why) {
    phase = 'failed';
    failure = why;
    run = null;
    emit();
  }

  async function go(flight, mine) {
    const live = () => run === mine && !disposed;
    const box = savedBox(flight.bounds);
    const size = imageSize(box);
    const { signal } = mine.abort;
    let reached = false; // ECCC answered something, so a failure isn't only a missing connection
    let errorStatus = null; // the first HTTP error ECCC answered with, so the failure can say so
    let tooLarge = false; // a picture came back over one frame's limit
    // Why nothing was kept, when every request came to nothing: an error, then too large, then none left.
    const whyNone = () => (errorStatus ? errorText(errorStatus) : tooLarge ? tooLargeText : reached ? NONE_LEFT : OFFLINE);

    // Which pictures ECCC still has, layer by layer.
    const plan = []; // { layer, t }
    const planned = {}; // layer → its times
    const layerNotes = [];
    for (const layer of Object.keys(SAVED_LAYERS)) {
      let times = null;
      try {
        const res = await fetch(capabilitiesUrl(layer), { signal });
        reached = true;
        if (!live()) return;
        if (res.ok) times = layerTimes(layer, await res.text());
        else errorStatus ??= res.status;
      } catch {
        if (!live()) return;
      }
      if (!live()) return;
      // The same window the reader keeps by, so whatever is kept is read back from the file.
      const wanted = times ? coveringTimes(times, flight.startT, flight.endT, SAVED_LAYERS[layer].stepS).filter((t) => inWindow(t, flight.startT, flight.endT)) : [];
      planned[layer] = wanted;
      for (const t of wanted) plan.push({ layer, t });
    }
    total = plan.length;
    emit();
    if (!total) return fail(whyNone());

    // The pictures, a few at a time.
    const got = [];
    const missed = { rain: 0, snow: 0, lightning: 0 };
    let next = 0;
    async function worker() {
      while (live() && next < plan.length) {
        const { layer, t } = plan[next++];
        try {
          const res = await fetch(frameUrl(layer, box, t, size), { signal });
          reached = true;
          let frame = null;
          if (res.ok) {
            const bytes = new Uint8Array(await res.arrayBuffer());
            frame = frameFromReply({ contentType: res.headers.get('content-type'), bytes });
            if (!frame && bytes.length > LIMITS.maxFrameBytes) tooLarge = true;
          } else {
            errorStatus ??= res.status;
          }
          if (!live()) return;
          if (frame) got.push({ layer, t, ...frame });
          else missed[layer] += 1;
        } catch {
          if (!live()) return;
          missed[layer] += 1;
        }
        done += 1;
        emit();
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    if (!live()) return;
    if (!got.length) return fail(whyNone());

    // What it says about what it kept.
    let skipped = 0;
    const startNotes = [];
    for (const layer of Object.keys(SAVED_LAYERS)) {
      const kept = got.filter((f) => f.layer === layer);
      if (!kept.length) {
        layerNotes.push(`No ${LAYER_NAMES[layer]} pictures could be fetched.`);
        continue;
      }
      skipped += missed[layer];
      if (planned[layer][0] > flight.startT) startNotes.push(`${capital(LAYER_NAMES[layer])} from ${hhmmZ(planned[layer][0])}: ECCC no longer had earlier pictures.`);
    }
    const kept = fitCap(got, capBytes);
    if (kept.over) return fail('the pictures are over the size limit.');
    notes = [
      ...layerNotes,
      ...startNotes,
      ...(skipped ? [`${plural(skipped, 'picture', 'pictures')} couldn't be fetched.`] : []),
      ...(kept.factor > 1 ? [thinningNote(kept.gapsS)] : []),
    ];
    saved = makeSaved({ box, frames: kept.frames, fetchedT: now(), thin: kept.factor });
    phase = 'done';
    run = null;
    emit();
  }

  function stop() {
    run?.abort.abort();
    run = null;
    phase = 'idle';
    done = 0;
    total = 0;
    notes = [];
    failure = null;
  }

  return {
    state: () => ({ phase, done, total, saved, notes, failure, fromFile }),
    /** Starts fetching for the flight. Does nothing if a fetch is already under way. */
    start(flight) {
      if (run || disposed) return;
      stop();
      saved = null;
      fromFile = false;
      if (!savedBox(flight.bounds)) return fail("the flight's tracks have no position.");
      phase = 'fetching';
      const mine = { abort: new AbortController() };
      run = mine;
      emit();
      go(flight, mine).catch(() => {
        if (run === mine && !disposed) fail(OFFLINE);
      });
    },
    /** Stops a fetch under way and keeps nothing of it. */
    cancel() {
      if (!run) return;
      stop();
      emit();
    },
    /** A new flight, or none: stops any fetch and forgets what was kept. */
    setFlight(_next) {
      stop();
      saved = null;
      fromFile = false;
    },
    /** Pictures read from an opened debrief file (or none). */
    load(set) {
      stop();
      saved = set ?? null;
      fromFile = Boolean(set);
      phase = set ? 'done' : 'idle';
    },
    dispose() {
      disposed = true;
      stop();
      saved = null;
    },
  };
}

/**
 * What the Weather menu shows for the offer: { button, status, live }. button is
 * 'hidden', 'save' or 'cancel'. status is the line shown (it counts every
 * picture); live is what a screen reader is told, which changes only at the
 * start, about every 25 % and at the end, so a fetch of forty pictures is not
 * forty announcements. Nothing is announced until the offer is pressed, so
 * loading a flight or opening a file reads nothing out. flight: whether one
 * is loaded. recent: whether it ended within 3 hours (radarKept). pressed:
 * whether the offer was pressed for this flight. The rest is the feed's state().
 */
export function offerState({ flight, recent, pressed = false, phase, done, total, saved, notes, failure, fromFile }) {
  const heard = pressed || phase === 'fetching' || phase === 'failed' || (phase === 'done' && !fromFile);
  const say = (button, status) => ({ button, status, live: heard ? status : '' });
  if (!flight) return say('hidden', '');
  if (phase === 'fetching') {
    if (!total) return say('cancel', 'Asking ECCC which pictures it has…');
    const quarter = Math.min(3, Math.floor((4 * done) / total));
    const live = quarter === 0 ? `Saving radar and lightning: ${total} pictures` : `Saving radar and lightning: ${quarter * 25} percent`;
    return { button: 'cancel', status: `Saving radar and lightning: ${done} of ${total}`, live };
  }
  if (saved) {
    return say('hidden', [savedSummary(saved), ...notes, fromFile ? '' : 'Save the debrief to put them in the file.'].filter(Boolean).join(' '));
  }
  if (!recent) return say('hidden', notKeptText('radar'));
  if (phase === 'failed') return say('save', `Couldn't save radar and lightning: ${failure}`);
  return say('save', 'ECCC keeps radar for 3 hours. This fetches every picture from the flight and keeps them in the debrief file.');
}

