// What the SOF's 3D view shows, decided without a page (SPEC-sof, "3D view", SOF-39): the cloud decks
// from each airfield's METAR, the pins with their words, and the camera's numbers. Pure: reports, fields
// and numbers go in, plain data comes out. view3d.js only draws it.
//
// The 3D view is a picture for situational awareness. It never decides anything: no limit is checked here
// and nothing in it raises or clears a caution.
import { FT_PER_NM } from './map-view.js';

/** The square the view shows: 250 NM on a side, centred on home, so the usual alternates (CYYN, CYXE about 110 NM out) are inside (SOF-39). */
export const AREA_NM = 250;
export const AREA_FT = AREA_NM * FT_PER_NM;
/** A cloud deck is a flat round disc this wide at its base (SOF-39). */
export const DECK_NM = 10;
export const DECK_FT = DECK_NM * FT_PER_NM;

/**
 * How solid each cover is drawn, as opacity from 0 to 1. A deck is a picture of a layer, not a measurement
 * of it. FEW is 1 to 2 oktas, SCT 3 to 4, BKN 5 to 7, OVC 8 (METAR), and these steps follow that order.
 */
// estimate, SOF-39
export const COVER_OPACITY = Object.freeze({ FEW: 0.25, SCT: 0.45, BKN: 0.7, OVC: 0.9 });

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** A whole number of feet with its comma: 2500 reads "2,500". */
export const formatFeet = (ft) => String(Math.round(ft)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * The cloud decks for one airfield's METAR sky layers (wx's `conditions.sky`: { cover, baseFt, ... }, baseFt in feet
 * above the aerodrome, as a METAR gives it: BKN025 is 2,500 ft). `elevationFt` is the field's elevation above sea
 * level, or null when it is not known (the decks then stand on the ground the view draws, and `elevationKnown` says so).
 *
 * Returns { decks, baseUnknown, obscured, elevationKnown }:
 * - decks: [{ cover, baseAglFt, baseMslFt, opacity, label }], lowest first. A layer with no base is not drawn.
 * - baseUnknown: a FEW, SCT, BKN or OVC layer was reported without a base (BKN///), so the pin says so.
 * - obscured: the vertical visibility in feet when the sky is obscured (VV), else null. It is not a layer, so no deck.
 */
export function cloudDecks({ sky = [], elevationFt = null } = /** @type {any} */ ({})) {
  const elevationKnown = isNumber(elevationFt);
  const decks = [];
  let baseUnknown = false;
  let obscured = null;
  for (const layer of sky ?? []) {
    if (layer?.cover === 'VV') {
      if (isNumber(layer.baseFt)) obscured = layer.baseFt;
      else baseUnknown = true;
      continue;
    }
    const opacity = COVER_OPACITY[layer?.cover];
    if (opacity === undefined) continue;
    if (!isNumber(layer.baseFt)) {
      baseUnknown = true;
      continue;
    }
    decks.push({
      cover: layer.cover,
      baseAglFt: layer.baseFt,
      baseMslFt: layer.baseFt + (elevationKnown ? elevationFt : 0),
      opacity,
      label: `${layer.cover} ${formatFeet(layer.baseFt)}`,
    });
  }
  decks.sort((a, b) => a.baseMslFt - b.baseMslFt);
  return { decks, baseUnknown, obscured, elevationKnown };
}

/** The category colour tokens (the SOF page's own), with their fallbacks; `none` is for a field with no current METAR. */
export const CATEGORY_TOKENS = Object.freeze({
  VFR: ['--sof-vfr', '#3ecf8e'],
  MVFR: ['--sof-mvfr', '#6db3ff'],
  IFR: ['--sof-ifr', '#ff6b6b'],
  LIFR: ['--sof-lifr', '#e08bff'],
  none: ['--text-muted', '#9bb8c6'],
});

/**
 * One entry per airfield the map has a mark for, home first: where it stands in the view's feet, its colour key, the words on
 * its pin and its decks. `marks` are map-model.js `airfieldMarks` (category, old report, position); `fields` are the airfields
 * (home, then alternates) with their elevation; `cards` are the screen's airfield cards (the METAR's state and the result line); `snapshot` is the weather snapshot (for the sky layers); `toXY(lat, lon)` gives
 * [x, y] in the map's local feet.
 *
 * Failure and stale behaviour (SPEC-sof, "3D view"):
 * - No current METAR: the pin says "No METAR" and there are no decks.
 * - An old report (stale or closed): the pin says its category with "old report" and no decks are drawn, so an old sky is
 *   never drawn as the sky now.
 * - A layer with no base is not drawn, and the pin adds "base unknown".
 *
 * An airfield outside the square (`outside`: true; Saskatoon is some 110 NM from Moose Jaw, past the 75 NM half-width) is not drawn:
 * a pin hanging in the air past the edge of the ground would be misleading, so the view names it instead.
 *
 * Each: { icao, home, x, y, outside, groundFt, category, key, result, old, lines, title, decks } where `lines` are the pin's words, `title` is the same as a sentence for hover, `key` is a
 * CATEGORY_TOKENS key, `result` is the airfield card's result line ({ level, words }, or null) and `groundFt` is the field's elevation
 * (the home field's when this one has none).
 */
export function sceneAirfields({ marks = [], cards = [], fields = [], snapshot = {}, toXY } = /** @type {any} */ ({})) {
  const byIcao = new Map(fields.map((f) => [f.icao, f]));
  const cardOf = new Map(cards.map((c) => [c.icao, c]));
  const homeMark = marks.find((m) => m.home);
  const homeElevation = byIcao.get(homeMark?.icao)?.elevationFt;
  const out = [];
  for (const mark of marks) {
    const field = byIcao.get(mark.icao);
    const [x, y] = toXY(mark.lat, mark.lon);
    const card = cardOf.get(mark.icao);
    const fresh = card?.metar?.state === 'fresh';
    const noMetar = !fresh && !mark.old;
    const sky = fresh ? snapshot.metar?.[mark.icao]?.report?.conditions?.sky : null;
    const own = isNumber(field?.elevationFt) ? field.elevationFt : null;
    const result = cloudDecks({ sky: sky ?? [], elevationFt: own ?? (isNumber(homeElevation) ? homeElevation : null) });
    const lines = [];
    if (noMetar) lines.push(`${mark.icao} No METAR`);
    else lines.push(`${mark.icao} ${mark.category ?? 'no category'}${mark.old ? ', old report' : ''}`);
    if (mark.old) lines.push('no cloud decks drawn');
    if (fresh && result.baseUnknown) lines.push('base unknown');
    if (fresh && result.obscured !== null) lines.push(`sky obscured, vertical visibility ${formatFeet(result.obscured)}`);
    if (own === null && fresh && result.decks.length) lines.push('elevation unknown');
    out.push({
      icao: mark.icao,
      home: mark.home,
      x,
      y,
      outside: Math.abs(x) > AREA_FT / 2 || Math.abs(y) > AREA_FT / 2,
      groundFt: own ?? (isNumber(homeElevation) ? homeElevation : 0),
      category: mark.category,
      key: noMetar || mark.category === null ? 'none' : mark.category,
      result: card?.result ? { level: card.result.level, words: card.result.words } : null,
      old: mark.old,
      lines,
      // The pin's hover text: its words, and what an unknown elevation means for its decks.
      title: `${lines.join('. ')}.${own === null && fresh && result.decks.length ? ' This field’s elevation is not known, so its decks are drawn from home’s.' : ''}`,
      decks: fresh ? result.decks : [],
    });
  }
  return out;
}

/** Whether two scenes would draw the same, so the view is only rebuilt when something it shows changes. */
export const sceneSignature = (airfields) => JSON.stringify(airfields.map((a) => [a.icao, a.x, a.y, a.outside, a.groundFt, a.key, a.old, a.lines, a.result?.words, a.decks.map((d) => [d.cover, d.baseMslFt])]));

// ---- The camera -----------------------------------------------------------------------------------

/** pitchDeg is degrees from straight down (0 looks straight down, 90 is level), as ui-kit's `matchProjection` takes it. zoom is pixels to 1,000 ft. */
export const START_CAMERA = Object.freeze({ yawDeg: -45, pitchDeg: 45 });
/** From the south-east, 45 degrees down (SOF-39): looking north-west, so the ground's "up the screen" direction is -45 degrees. */
export const PITCH_LIMITS = Object.freeze([5, 85]);
/** A wheel notch, a pinch step and the keys' turn. Estimates for feel. */
export const ORBIT_DEG_PER_PX = Object.freeze({ yaw: 0.4, pitch: 0.25 });
export const ZOOM_STEP = 1.25;
/** The zoom limits as a share of the start (fit) zoom: out to half of it, in to twenty times it. */
export const ZOOM_RANGE = Object.freeze([0.5, 20]);
export const KEY_ORBIT_PX = Object.freeze({ ArrowLeft: [-30, 0], ArrowRight: [30, 0], ArrowUp: [0, -30], ArrowDown: [0, 30] });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * The zoom (pixels to 1,000 ft) at which the whole square fits the view at a pitch: its corners spread the square's diagonal
 * across the screen, and up the screen it spans the diagonal times the cosine of the pitch plus the tallest deck.
 * `size` is { width, height } in pixels, `topFt` the highest thing drawn above the ground, already scaled.
 */
export function fitZoom(size, pitchDeg = START_CAMERA.pitchDeg, topFt = 0) {
  const diagonal = AREA_FT * Math.SQRT2;
  const across = diagonal * 1.08;
  const up = (diagonal * Math.cos((pitchDeg * Math.PI) / 180) + topFt * Math.sin((pitchDeg * Math.PI) / 180)) * 1.12 + 1;
  const pxPerFt = Math.min(Math.max(size.width, 1) / across, Math.max(size.height, 1) / up);
  return pxPerFt * 1000;
}

/** The camera after a drag of (dx, dy) pixels (or a key press standing for one): right turns the view, down tilts it to look more from above. */
export function orbitBy(cam, dx, dy) {
  return {
    ...cam,
    yawDeg: wrapDeg(cam.yawDeg + dx * ORBIT_DEG_PER_PX.yaw),
    pitchDeg: clamp(cam.pitchDeg - dy * ORBIT_DEG_PER_PX.pitch, PITCH_LIMITS[0], PITCH_LIMITS[1]),
  };
}

/** The camera zoomed by a factor (above 1 zooms in), kept inside the limits round the start zoom `fit`. */
export function zoomCamera(cam, factor, fit) {
  const next = Number.isFinite(factor) && factor > 0 ? cam.zoom * factor : cam.zoom;
  return { ...cam, zoom: clamp(next, fit * ZOOM_RANGE[0], fit * ZOOM_RANGE[1]) };
}
