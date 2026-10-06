// The formation's words for the screen (clean-up step 3, from formation.js): a press's label, into or away from #2, the
// compass heading readout and G-warm's G flown against each call. Pure functions of what they are given; the session
// (formation.js createFormation) and the screen (index.js, tags.js, four-ship-card.js) read them from here. They change
// nothing about how the aircraft fly.
import { MANOEUVRES, DEG } from './manoeuvres.js';
import { G_WARM } from './g-warm.js';

/** Compass heading (degrees, 000 to 359) from math radians. */
export function compassDeg(headingRad) {
  const d = Math.round(90 - headingRad / DEG);
  return ((d % 360) + 360) % 360;
}

/** G-warm's G flown against each call (design section 7): "in place 90 3.0 G (3 called), push over 0.5 G (0.5), …". */
export function gFlownWords(g) {
  const parts = g.steps.map((st, i) => {
    const f = g.flown[i];
    if (st.g === 1 || !Number.isFinite(f.max)) return null;
    const flown = st.g < 1 ? f.min : f.max;
    return `${st.name} ${flown.toFixed(1)} G (${st.g} called)`;
  }).filter(Boolean);
  return `G flown: ${parts.join(', ')}.`;
}

/** The words for a press: "Hook right", "Shackle". */
export function labelFor(key, dir) {
  const m = MANOEUVRES[key] ?? (key === G_WARM.key ? G_WARM : null);
  return m.sided ? `${m.label} ${dir > 0 ? 'left' : 'right'}` : m.label;
}

/** Into or away from the wingman, for a sided button, with #2 on `wingSide` of Lead (SMM 16.19 paras 53-57 name them from Lead's side). */
export function intoOrAway(dir, wingSide) {
  const wingDir = wingSide === 'left' ? 1 : -1;
  return dir === wingDir ? 'into #2' : 'away from #2';
}
