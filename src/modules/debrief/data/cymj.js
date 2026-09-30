// CYMJ (15 Wing Moose Jaw) values the debrief needs until the Airfields module
// supplies them (SPEC-debrief, R16). Kept in one file so they move in one step.

/** Field elevation in feet, for the "field" ground datum while no home field is set. */
export const FIELD_ELEVATION_FT = 1892;

/**
 * Where the map's local feet are measured from when no track is loaded, so the
 * VNC charts still line up (V6 ensureEmbeddedVncRef, line 2578).
 */
export const VNC_ANCHOR = Object.freeze({ lat: 50.3916, lon: -105.5349 });
