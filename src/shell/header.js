// The header clock and the `app.time` service modules get (SPEC-shell: Header,
// Module contract). Zulu and local both show; the shared `timePrimary` setting
// picks which comes first (D18, R10). The formatting is core/time.js's.
import { formatZulu, formatInZone, zoneAbbreviation, utcOffsetMinutes } from '../core/time.js';

// CYMJ's zone, UTC-6 all year: the default when no airfield list is given.
export const HOME_ZONE = 'America/Regina';

// settings: the shared settings ({ get }). zone: a time zone, or a function that
// returns one, read on every call so local time follows the home airfield
// (app.js passes `() => airfields.home().timeZone`). now: the clock, replaceable in tests.
export function createTime({ settings, zone = HOME_ZONE, now = () => new Date() }) {
  const currentZone = typeof zone === 'function' ? zone : () => zone;
  const zulu = (date = now()) => formatZulu(date);
  const local = (date = now()) => `${formatInZone(date, currentZone())} ${zoneAbbreviation(date, currentZone())}`;
  return Object.freeze({
    get zone() {
      return currentZone();
    },
    now,
    zulu,
    local,
    offsetMinutes: (date = now()) => utcOffsetMinutes(date, currentZone()),
    // [first, second] in the order the person chose in Settings.
    ordered(date = now()) {
      const z = zulu(date);
      const l = local(date);
      return settings.get().timePrimary === 'local' ? [l, z] : [z, l];
    },
  });
}

// Redraws the clock on each whole second while the tab is visible, and stops
// while it's hidden so a background tab does no work. A settings change redraws
// at once, and so does a change in anything in `watch` (each has subscribe(),
// such as the airfields setting). timers: a scheduler scope.
// render(first, second, date) draws it. Returns stop().
export function startClock({ time, settings, timers, render, watch = [], doc = globalThis.document }) {
  let cancel = null;

  const draw = () => {
    const date = time.now();
    render(...time.ordered(date), date);
    return date;
  };
  const tick = () => {
    const date = draw();
    cancel = timers.after(1000 - (date.getTime() % 1000), tick);
  };
  const pause = () => {
    cancel?.();
    cancel = null;
  };
  const onVisibility = () => {
    pause();
    if (doc.visibilityState !== 'hidden') tick();
  };

  doc.addEventListener('visibilitychange', onVisibility);
  const unsubscribes = [settings, ...watch].map((source) => source.subscribe(() => draw()));
  onVisibility();

  return () => {
    pause();
    for (const unsubscribe of unsubscribes) unsubscribe();
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}
