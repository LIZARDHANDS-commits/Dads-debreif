// "Limits not set" (plan Step 2c, part B; SOF-32, SOF-48): a home base whose site profile has `standards: null` has been given no weather limits,
// so nothing on the screen may read as if the weather had been checked against any. Its words, and the one change made to a wave's calls, are here,
// so the cards, the wave chips, the timeline and the banner all say the same thing.
//
// What stays: the METAR and TAF, the flight category and the NATO colour state are weather facts and still show; dangerous weather (thunderstorms,
// freezing precipitation, CB and the rest of wx's caution list) is not a limit and still raises a caution. What goes: "Within limits", a green
// tick, "No alternate needed", "Below limits", "At the limit", hatching for a piece below limits and a count of alternates that "meet".
//
// Pure, with no imports, so any SOF file can use it without an import cycle (the caller asks the site profile whether the limits are set).

/** The key line: what "Limits not set" means. The hover words wherever it shows. */
export const NOT_SET_KEY = 'No weather limits have been given for this base yet; the weather shown is not checked against any.';

/** "Limits not set for KDLF". */
export const notSetWords = (icao) => `Limits not set for ${icao || 'this base'}`;

/** An alternate at such a base: amber "Incomplete" (SOF-32), never a tick. */
export const INCOMPLETE_WORDS = 'Incomplete';

/** Why an alternate reads "Incomplete" at a base with no limits. */
export const incompleteWhy = (icao) => `No alternate rules or minima have been given for ${icao || 'this base'} yet; the weather shown is not checked against any.`;

/** The limits line on a card at such a base. */
export const NOT_SET_LIMITS_TEXT = 'Not set for this base';

/** Whether a site profile has weather limits. A profile without `standards` (or no profile) has none. */
export const limitsSet = (site) => site?.standards != null;

// A wave call's result with only its dangerous-weather pieces: nothing below or at a limit, nothing "PROB unchecked". The status is wx's own, kept so
// the banner can still tell a TAF it read from no TAF at all (its acknowledgements stay right).
const cautionsOnly = (result) => (result ? { ...result, hits: [], atLimit: [], probUnchecked: [] } : result);
const cautionLines = (details) => (Array.isArray(details) ? details.filter((d) => d.level === 'caution') : []);

/**
 * One wave's calls (waves.js `waveCalls`) at a base with no limits: home says "Limits not set for KDLF" (grey), every alternate "Incomplete" (amber),
 * and only the dangerous-weather lines are kept. A new object; wx's answers are not changed.
 */
export function notSetCall(call, homeIcao) {
  return {
    ...call,
    limitsNotSet: true,
    home: {
      ...call.home,
      status: 'not-set',
      words: notSetWords(homeIcao),
      tone: 'not-set',
      label: null, // the words already say it: "Home: Limits not set for KDLF"
      firstReason: null,
      hasHit: false,
      why: NOT_SET_KEY,
      details: cautionLines(call.home?.details),
      result: cautionsOnly(call.home?.result),
    },
    alternates: (call.alternates ?? []).map((a) => ({
      ...a,
      status: 'incomplete',
      words: INCOMPLETE_WORDS,
      tone: 'incomplete',
      minimaText: 'minima not set',
      note: null, // the why is said once for all of them (waves-view-model.js's summary), not on every line
      firstReason: null,
      hasHit: false,
      why: null,
      details: cautionLines(a.details),
      result: cautionsOnly(a.result),
    })),
    meeting: 0,
  };
}
