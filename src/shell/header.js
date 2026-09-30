// The header clock and the `app.time` service modules get (SPEC-shell: Header,
// Module contract). Zulu and local both show; the shared `timePrimary` setting
// picks which comes first (D18, R10). The formatting is core/time.js's.
import { formatZulu, formatInZone, zoneAbbreviation, utcOffsetMinutes } from '../core/time.js';

// CYMJ's zone, UTC-6 all year, until step 2 brings the airfield list.
export const HOME_ZONE = 'America/Regina';

// settings: the shared settings ({ get }). now: the clock, replaceable in tests.
export function createTime({ settings, zone = HOME_ZONE, now = () => new Date() }) {
  const zulu = (date = now()) => formatZulu(date);
  const local = (date = now()) => `${formatInZone(date, zone)} ${zoneAbbreviation(date, zone)}`;
  return Object.freeze({
    zone,
    now,
    zulu,
    local,
    offsetMinutes: (date = now()) => utcOffsetMinutes(date, zone),
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
// at once. timers: a scheduler scope. render(first, second, date) draws it.
// Returns stop().
export function startClock({ time, settings, timers, render, doc = globalThis.document }) {
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
  const unsubscribe = settings.subscribe(() => draw());
  onVisibility();

  return () => {
    pause();
    unsubscribe();
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}
