// The Home base choice in SOF settings (plan Step 2c, part B): one of the bases with a site profile (sites/), Moose Jaw first. Choosing one sets the
// home field and that base's usual alternates through the shared airfields setting (`app.airfields.update()`), so Settings → Airfields and the SOF
// never disagree, and nothing new is stored: what the choice shows is read back from the home field each time. A home field set in Airfields that
// has no profile of its own (Regina, Great Falls, any field typed in) shows "Other (set in Airfields)".
import { PROFILES, hasOwnProfile, siteFor } from './sites/index.js';
import { limitsSet, notSetWords, NOT_SET_KEY } from './limits-not-set.js';

/** The choice's value when the home field has no profile of its own. */
export const OTHER_HOME = 'other';

/** The choices: "Moose Jaw (CYMJ)", "Laughlin (KDLF)" ..., then "Other (set in Airfields)", which is only shown while it is the case. */
export const HOME_BASE_OPTIONS = Object.freeze([
  ...PROFILES.map((p) => Object.freeze({ value: p.icao, label: `${p.shortName} (${p.icao})` })),
  Object.freeze({ value: OTHER_HOME, label: 'Other (set in Airfields)' }),
]);

/** What the choice shows for a home field: its ICAO when it has a profile, else OTHER_HOME. */
export function homeBaseValue(homeIcao) {
  return hasOwnProfile(homeIcao) ? String(homeIcao).trim().toUpperCase() : OTHER_HOME;
}

/**
 * Choose a base: home and its usual alternates go into the airfields setting in one change. Anything that is not a profile's ICAO (Other included)
 * changes nothing. Returns true when the setting was changed.
 */
export function chooseHomeBase(airfields, icao) {
  const site = PROFILES.find((p) => p.icao === icao);
  if (!site) return false;
  airfields.update({ home: site.icao, alternates: [...site.usualAlternates] });
  return true;
}

/**
 * Whether the SOF can change the home field: the app's shell hands modules the airfields setting read-only today (src/shell/host.js), so the choice
 * shows only when an `update` is there. Without one the section says which base is home and where to change it.
 */
export const canChooseHomeBase = (airfields) => typeof airfields?.update === 'function';

/** "Moose Jaw (CYMJ)" for a base with a profile, else "KGTF Great Falls (set in Airfields)". */
export function homeBaseWords(home) {
  const own = PROFILES.find((p) => p.icao === home?.icao);
  return own ? `${own.shortName} (${own.icao})` : `${home?.icao ?? '?'}${home?.name ? ` ${home.name}` : ''} (set in Airfields)`;
}

/** The choice as ui-kit's controls bind to a setting: `{ get, update, subscribe }` over the airfields setting, holding nothing of its own. */
export function homeBaseSetting(airfields) {
  const get = () => ({ homeBase: homeBaseValue(airfields.home().icao) });
  return {
    get,
    update: (patch = {}) => {
      if ('homeBase' in patch) chooseHomeBase(airfields, patch.homeBase);
    },
    subscribe: (fn) => airfields.subscribe(() => fn(get())),
  };
}

/** The line under the choice for the home field now: at a base with no weather limits it says so, with the key line; else null. */
export function homeBaseNote(homeIcao) {
  return limitsSet(siteFor(homeIcao)) ? null : `${notSetWords(homeIcao)}. ${NOT_SET_KEY} The alternate trigger below is not used here.`;
}
