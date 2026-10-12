// The CT-156 Harvard II's two cockpits as the student and the instructor see them (Dad's asks, 9 Oct 2026; Patrick
// approved; TS-154, TS-155, TS-156, TS-157). In each: the grey tombstone instrument panel under a moulded near-black
// coaming with its grab rail, the three lamps under the rail, the AOA indexer and the standby compass on top and an air
// vent at each upper corner; the lower panel with its centre pedestal, knee wells and landing gear handle; the side
// consoles (power lever, flap lever, striped handles, knobs); the stick in its boot; the rudder pedals; the ejection
// seat with its cushions, harness, headbox, canopy breakers, yellow and black seat handle and green oxygen hose. Round
// the canopy: the forward bow's channel with its row of studs and its two curved mirrors, the canopy's side frames with
// their rows of fasteners, and the inter-cockpit arch with its fasteners and the clear
// inter-cockpit shield. The rear cockpit's panel sits under a big moulded hump over the front seat's back, with its own
// grab rails, AOA indexer and compass. The canopy glass, the round bow tubes, the sill rails, the seat backs' frames,
// the tub (floor and walls), the wings and the tail are the ship's own (ct156-model.js setCockpitView). A picture only:
// no flight numbers, no flight formulas. Like ct156-model.js it imports nothing from the app, and three.js is passed in.
//
// From V2.275 some parts come from a Blender model file (ALL-32; ct156-cockpit-model.js): the forward bow and the
// canopy rails so far. The code still draws them, named ct156-cockpit-<part>, and they show until the file is in or if it
// fails to load.
//
//   const pit = createCt156Cockpit(THREE, { doc: document });
//   shipRoot.add(pit.group);   // a child of a createCt156Model root, so it moves, banks and pitches with the airframe
//   pit.update(hud);           // the live instruments and compass cards in both seats, from the HUD's numbers (hud.js drawHud's `hud`)
//   pit.dispose();
//
// Inside `group` everything is in feet, from the model's origin (on the spinner's axis), nose +X, left +Y, up +Z; the
// group itself is scaled to the model's units, so it lands on the model's canopy and seats at any ship size.
//
// Every size here is an ESTIMATE until Patrick rules: taken off the model's own tables (ct156-model.js, measured off
// Patrick's side-on photo of CT-156 156101) or off Dad's reference pictures of the T-6A cockpit (9 Oct 2026: photos, a
// panel poster, commercial-sim shots and renders of a commercial T-6A model; nothing copied from them, every shape and
// gauge drawn here), as each line says. From V2.235 (ALL-31) both eyes, the forward bow and the nose are the
// side view's (measured only, nothing kept), and the front cockpit (seat, panel, coaming, rail) moved with the front eye, the rail no higher than the
// windscreen's foot as seen from it: level at 220 KIAS the horizon sits about a quarter of the way up the windscreen
// (SMM ch.3, the 220 KIAS pitch attitude figure). From V2.238 the front seat sits 2 in higher than the view's
// (FRONT_SEAT_RAISE_FT, Patrick), which puts the dash and AOA indexer where that figure draws them against the horizon.
// V2.208 (TS-156) to V2.234 had fitted the eye to AETCMAN 11-248
// (13 Aug 2025, the USAF T-6 primary flying manual) Fig 2.7, p.42, half ground and half sky at 200 KIAS; the bow is
// still that manual's wide light band with its ring of round holes (Fig 2.7, Fig 5.3). Page cites only: nothing from
// the manual is copied here (docs/references/aetcman11-248-cockpit.md). The pictures are the T-6A's; the CT-156's
// own panel may differ.
import {
  CT156_UNIT_LENGTH, CT156_LENGTH_FT, CT156_FRAME_X, CT156_FRAME_LEAN, CT156_SEAT_X, CT156_HELMET_X, CT156_HELMET_Z, CT156_SEAT_BACK_FT, ct156SeatRakeFt, ct156SeatRaiseFt, CT156_REFERENCE_POINTS, CT156_BOW_LEAN,
  CT156_TUB_FLOOR_FT, CT156_RAIL_FORE_X, CT156_COAMING_CROWNS_FT, ct156CrownZ, ct156CanopySection, ct156FuselageSection, ct156CanopyHalfWidth, ct156HoopPoints, ct156JoinGeometries, ct156PiecesHash, setCockpitView,
} from './ct156-model.js';
import { drawAttitude } from './hud.js';
import { attachCockpitModel } from './ct156-cockpit-model.js';
import { browserStorage, createStore } from '../storage/store.js';

/** Feet per model unit (the model's 1.44 units are the T-6A's 33 ft 4 in). */
export const CT156_FT_PER_UNIT = CT156_LENGTH_FT / CT156_UNIT_LENGTH;
const F = CT156_FT_PER_UNIT;

/**
 * Where each eye sits from its helmet's centre, feet: at the front of the helmet, 0.4 ft ahead of its centre and
 * 0.07 ft above it, since the helmets moved 0.3 ft aft and down off the eyes (Patrick, 12 Oct 2026; the front eye
 * stayed where it was, the rear one came down 0.12 ft with its helmet). Until then 0.1 ft ahead and 0.09 ft below
 * (ALL-31), and until V2.234 0.13 ft under the helmet's centre, fitted to AETCMAN 11-248 Fig 2.7 (TS-156).
 */
export const EYE_AHEAD_OF_HELMET_FT = 0.4;
export const EYE_ABOVE_HELMET_FT = 0.07;
/**
 * How far the front seat is raised above the side view's, feet: 2 in (Patrick, 11 Oct 2026: "we raise the
 * seat until the bottom of the surface just under the three buttons is just covering the top of the EADI"; he chose
 * 1 in, then 1 in more, "yes, i'll fly it"). Fitted to the SMM's 220 KIAS picture (Fig 3.5): from the view's eye the
 * glareshield, AOA indexer and EADI sat about 4.5° too high against the horizon, 1 in up about 2.5°, 2 in up within
 * about half a degree. The view shows the aircraft with its propeller axis level (its propeller disc is
 * upright and both wheels touch its ground line), so the model's axis is the ADI's datum and stays unturned (the T-6
 * sits 2.5° nose up on the ramp, Patrick). Fitted, not measured: Patrick checks it in flight.
 */
export const FRONT_SEAT_RAISE_FT = 2 / 12;
/**
 * The student's eye in the front seat (the default front eye), feet: 3.0 ft ahead of the model's origin (12.3 ft behind
 * the spinner tip) and 2.07 ft above the spinner's axis, the side view's front pilot (re-read on a complete copy,
 * 11 Oct 2026; the model's CT156_SEAT_X) raised FRONT_SEAT_RAISE_FT (ALL-31; was 1.4 ft and 2.14 ft, then 1.9 ft up
 * until V2.238, then 2.06 ft ahead until the front cockpit moved 11 in forward, Patrick 11 Oct 2026 07:39Z).
 */
export const EYE_FT = Object.freeze({ x: CT156_HELMET_X[0] * F + EYE_AHEAD_OF_HELMET_FT, y: 0, z: CT156_HELMET_Z[0] * F + EYE_ABOVE_HELMET_FT + FRONT_SEAT_RAISE_FT });

/**
 * How far the rear seat is raised above the side view's, feet: 5.5 in (Patrick, 11 Oct 2026 08:34Z, "Raise
 * rear eye" so the rear seat's 220 KIAS picture matches the SMM's Fig 3.5). In that figure the top of the front seat's
 * headbox sits on the horizon at 220 KIAS level; from the view's eye (both helmets drawn level) it sat about 6° above
 * it at the model's -0.7°, 5.5 in up puts it about 0.2° under. Fitted to the figure, not measured. Since the front
 * seat's headbox came down 6 in to its right height (Patrick, 12 Oct 2026), 0.5 in up puts its top back on the
 * horizon (Patrick, 12 Oct 2026, "Refit to 0.5 in"; was 5.5 in).
 */
export const REAR_SEAT_RAISE_FT = 0.5 / 12;
/**
 * Both eyes, feet (TS-155, TS-156, ALL-31). Front: EYE_FT. Rear: 2.03 ft aft of the origin (17.3 ft behind the spinner
 * tip; 3.3 ft aft until the rear seat moved 1.27 ft forward, Patrick, 12 Oct 2026) and 2.13 ft above the spinner's axis,
 * its helmet's eye raised REAR_SEAT_RAISE_FT (2.66 ft up until 12 Oct 2026; was 3.0 ft aft and 2.29 ft up until V2.238, then the view's
 * until V2.279).
 */
export const EYES_FT = Object.freeze({
  front: EYE_FT,
  rear: Object.freeze({ x: CT156_HELMET_X[1] * F + EYE_AHEAD_OF_HELMET_FT, y: 0, z: CT156_HELMET_Z[1] * F + EYE_ABOVE_HELMET_FT + REAR_SEAT_RAISE_FT }),
});
/**
 * The seat stations SEAT_FT and the seats' parts are drawn for (model units: the front seat's until V2.234), and how
 * far each seat's parts move from there, feet: the front seat about 0.57 ft forward to the side view's (ALL-31),
 * the rear seat about 3.5 ft aft (model table).
 */
const SEAT_DRAWN_X = 0.06;
const FRONT_DX = (CT156_SEAT_X[0] - SEAT_DRAWN_X) * F;
const REAR_DX = (CT156_SEAT_X[1] - SEAT_DRAWN_X) * F;

/**
 * The forward canopy bow (the windscreen's frame), feet: the model's front frame hoop station (CT156_FRAME_X[0], about
 * 4.0 ft) and its crest, the canopy's top there (about 2.75 ft) (model tables; the side view's, ALL-31),
 * leaning aft 9° from the crest to the sills (CT156_BOW_LEAN, the same view's), so its feet stand about 0.3 ft behind
 * the crest's station, beside the coaming rather than on it. Seen from the seat it is a wide light
 * band lining the glass, with a ring of round dark holes and a dark tube along its inner edge (AETCMAN 11-248 Fig 2.7,
 * p.42, and Fig 5.3, para 5.13; TS-156): its aft face 0.05 ft behind the hoop station, 0.15 ft deep from the glass
 * inward, the tube 0.025 ft in radius, so it looks about 4.3° wide at the crest from the front eye (the figures look
 * about 4-5°); 22 holes from sill to sill, each 0.07 ft across. Sizes estimates judged off the figures. The manual's
 * figure wins over the commercial renders here (TS-157), which draw this bow with rows of fasteners.
 */
export const FORWARD_BOW_FT = Object.freeze({
  x: CT156_FRAME_X[0] * F,
  crestZ: ct156CanopySection(CT156_FRAME_X[0]).top * F,
  bandX: CT156_FRAME_X[0] * F - 0.05,
  glassInset: 0.01,
  bandDepth: 0.13,
  tubeR: 0,
  channel: Object.freeze({ deep: 0.08, lip: 0.025, back: 0.02 }),
  studs: Object.freeze({ n: 25, r: 0.01, head: 0.017, len: 0.05 }),
  lean: CT156_BOW_LEAN,
  dots: Object.freeze([]),
  footFillet: null,
});
// Its section is a channel open aft, as Patrick's reference picture of the cockpit draws it (Patrick, 12 Oct 2026,
// "Construction only", and "this side should be thinner?"): `bandDepth` (1.6 in) from the glass inward, `channel.deep`
// (1 in) fore and aft, its two silver lips `channel.lip` thick and its back `channel.back` thick, with a dark recess
// between the lips and a row of `studs` along it standing out of the back, and its legs running straight down into
// the canopy's lower frame (footFillet null). Sizes are estimates off that picture and Fig 3.5's band. Before: a T, an
// aft face 1 in deep with a flange 3 in forward along its inner edge (12 Oct 2026, from Patrick's photos), a ring of
// round holes, and a rounded join at each foot.

/**
 * The inter-cockpit arch over the rear seat's panel, feet (TS-157): the model's centre frame hoop (CT156_FRAME_X[1],
 * about 0.5 ft aft of the origin), seen from the rear seat as a light band like the forward bow, 0.2 ft deep, with a
 * row of small fasteners along each edge and a dark tube along its inner edge, as the commercial T-6A shots from the
 * rear seat show (Dad's pictures 21 and 27). Sizes estimates. Its top leans aft as the model's hoop does
 * (CT156_FRAME_LEAN[1], the side view's), its feet about 1 ft ahead of its crest.
 */
export const ARCH_FT = Object.freeze({
  x: CT156_FRAME_X[1] * F,
  bandX: CT156_FRAME_X[1] * F - 0.05,
  lean: CT156_FRAME_LEAN[1],
  glassInset: 0.01,
  bandDepth: 0.25, // 0.2 ft until Patrick, 12 Oct 2026
  tubeR: 0.025,
  dots: Object.freeze([Object.freeze({ at: 0.18, n: 34, dia: 0.032 }), Object.freeze({ at: 0.82, n: 30, dia: 0.032 })]),
});

/**
 * The front instrument panel's main face, feet: 4.44 ft ahead of the origin, from 0.22 ft up to 1.48 ft (just under the
 * coaming; 1.26 ft tall, the panel layout's, scaled by its 3-inch gauges; was 0.28 ft up, 1.2 ft tall),
 * 2.3 ft across at most and kept 0.06 ft inside the canopy. The coaming's aft edge is 2.13 ft (25.6 in) ahead of the
 * front eye, where the side view shows it through the windscreen, ahead of the bow's feet (Patrick, 11 Oct
 * 2026: "the panel is drawn in the wrong spot"; was 4.02 ft, 0.31 to 1.51 ft, the coaming at the bow's station; ALL-31
 * had moved it 0.57 ft forward with the front seat from 3.45 ft), and the face sits OVERHANG_FT (3 in) ahead of that
 * edge, under the coaming (Patrick, 11 Oct 2026: "the glare shield is more than an inch"; his cockpit clip, where the
 * lip shows well clear of the EADI from below the eye; 3 in an estimate). The panel's width matches
 * the panel layout scaled by its 3-inch gauges (about 2.4 ft). Its outline is a tombstone: straight sides up
 * to 52 % of its height, then shoulders in to a flat top 38 % as wide, so the grab rail round it follows the
 * front panel layout (scaled by its 3-inch gauges, 38 px to the inch: the rail's sides straight to about
 * 8 in up the face, then about 48° in to a flat top about 10 in across; Patrick, 11 Oct 2026, "make sure that the top
 * of the glareshield and the diagonals are scaled/angled/sized correctly"). Until V2.289 60 % and 55 % (TS-157, between
 * the T-6A panel poster's and the commercial render's, Dad's pictures 17 and 26), which put the shoulders about 2 in
 * high and the top about 2.5 in too wide each side. V2.264 tried 50 % and 84 % for a 23 in coaming read off Patrick's
 * cockpit frames; from the seat that made the top of the panel far too wide and Patrick put it back (11 Oct 2026
 * 07:06Z: "you made the panel way too wide at the top. it looked more accurate and better in v 2.263"). Estimates.
 */
// The front cockpit moved 0.95 ft forward with the front seat (Patrick, 11 Oct 2026 07:39Z, "whole cockpit 11 in
// (except the bow)"): the coaming's edge was 4.19 ft and the glareshield's fore end 5.87 ft; both keep their distance
// from the eye. Then the coaming's aft edge moved 5 in aft, to 1.68 ft (20.2 in) ahead of the front eye, and the face
// to 4.9 in ahead of that edge at its bottom, leaning back 5° so its top is 6.1 in ahead (Patrick, 12 Oct 2026; it was
// upright, OVERHANG_FT 3 in ahead). x is the face's station at its bottom edge, leanDeg its lean (top forward).
// The face is 1.2 in higher, so the grab rail's lower edge meets the EADI's case and the lip under the rail goes
// (Patrick, 12 Oct 2026, "panel up 1.2 in", the rail kept where it was; it was 0.22 to 1.48 ft up). Its outline now
// has the rail's shoulders 2.4 in higher and its top 1 in wider (shoulderV 0.595, topFrac 0.435; were 0.52 and 0.38),
// so the rail runs 12.6 in out each side, straight in at about 43 degrees to a flat top 11 in across (Patrick,
// 12 Oct 2026; it was 13.2 in out, curving in at about 48 degrees to a top 10 in across).
const COAMING_EDGE_X = CT156_COAMING_CROWNS_FT.front[0][0];
const FACE_AHEAD_FT = 0.41;
// Then the face came 1 in back down, with the rail and its shoulders kept where they are (shoulderV 0.661, was 0.595),
// so the small lamps sit on a thin strip under the rail and the whole EADI shows from the front eye (Patrick, 12 Oct 2026,
// "we should be able to see the whole EADI when the eye is at the correct height for the 220 knot attitude"; it was 0.32
// to 1.58 ft up).
export const PANEL_FT = Object.freeze({ x: COAMING_EDGE_X + FACE_AHEAD_FT, leanDeg: 5, top: 1.497, bottom: 0.237, width: 2.3, insetFromGlass: 0.06, shoulderV: 0.661, topFrac: 0.435 });

/**
 * The front coaming (glareshield), feet (TS-157): a moulded near-black hood over the panel, its aft edge following the
 * panel's tombstone outline with the grab rail along it, its crown 1.63 ft up at the aft edge (1.66 ft until the panel
 * moved forward, the rail kept 6° below the eye) and falling forward faster
 * than the eye's sight line over the rail, to 1.33 ft at 5.87 ft, just under the deck ahead of it, so from the seat the
 * rail stays the windscreen's bottom edge. ALL-31: the rail's top sits 6° below the front eye's level line, no higher
 * than the windscreen's foot seen from the eye (side view), so the cowl's top shows over it and the spinner
 * hides under the cowl (was 1.85 ft up at 3.35 ft, to 0.95 ft at 5.3 ft, TS-156's fit to AETCMAN 11-248 Fig 2.7); the three
 * lamps sit on a thin grey strip under the rail and the whole EADI shows from the eye (Patrick, 12 Oct 2026, "we should
 * be able to see the whole EADI when the eye is at the correct height for the 220 knot attitude"; from 11 Oct a lip hung
 * there just deep enough to cover the EADI's top, about 0.15 ft). Shape judged off Dad's pictures 17, 18, 20 and 26; sizes estimates.
 * railOut: the grab rail's sides 0.05 ft inside the panel's edge, over its rim, where the front panel layout
 * draws them, 1.1 ft out from the middle (RIM_FT.sideOut, 0.05 ft outside it, until V2.289). cheeks: the
 * coaming's dark sides out to the canopy's sills behind the rail (Patrick, 11 Oct 2026, "Dark sides", from his CT-156
 * cockpit photo; V2.289 left the windscreen's foot and the fuselage's inside showing past the narrower top).
 */
// Its crown since 12 Oct 2026: CT156_COAMING_CROWNS_FT.front (Patrick; from its aft edge, now 5 in further aft, at the
// same height, easing down and then falling to 1.07 ft at 6.3 ft, under the windscreen's foot).
const FRONT_CROWN = CT156_COAMING_CROWNS_FT.front;
/** How far the front seat's grey lamp strip shows under the grab rail, feet (0.66 in; Patrick, 12 Oct 2026; it hung 1.3 in under the rail). */
const LAMP_STRIP_FT = 0.055;
export const GLARESHIELD_FT = Object.freeze({
  crown: FRONT_CROWN, aftX: FRONT_CROWN[0][0], foreX: FRONT_CROWN[FRONT_CROWN.length - 1][0], top: FRONT_CROWN[0][1], foreTop: FRONT_CROWN[FRONT_CROWN.length - 1][1],
  lipDrop: 0, skirt: 0.12, topGrow: -0.1, sideGrow: 0, dropGrow: -0.1, railOut: -0.1, diagPow: 1, cheeks: true,
});
// No lip hangs under the rail (lipDrop 0; it was 0.15 ft, then 0.05 ft when the panel came up 1.2 in): the lamps' grey
// strip shows LAMP_STRIP_FT under it, and the panel's face came back 1 in down so the whole EADI shows (PANEL_FT;
// Patrick, 12 Oct 2026). The rail's sides run 0.1 ft inside the panel's edge (railOut, was 0.05) and its diagonals are
// straight (diagPow).
/**
 * The glareshield's rim, the thick dark grab rail along the coaming's aft edge and down the panel's sides to brackets
 * at 18 % of its height: its top run 0.03 ft behind the coaming at the coaming's own height, 0.045 ft in radius
 * (AETCMAN 11-248 Fig 2.7, p.42; TS-156), 0.05 ft out from the panel's edge. Its top is the windscreen's bottom edge
 * straight ahead. Sizes estimates.
 */
// In the front seat it comes forward onto the face's edge and ends there in a rounded end `frontEndV` up the face, about
// level with the GPS's top, as Patrick's reference picture of the cockpit draws it (Patrick, 12 Oct 2026, "Construction
// only", and on the rail's lower run "this black strip is wrong too, right?"; an estimate off that picture). Earlier on
// 12 Oct it ran on down the panel's sides and the lower panel's edge to the console's top (faceAbove, jogAbove), from
// his cockpit photos; before that it stopped at brackets 18 % up the face. The rear seat's still ends at brackets.
export const RIM_FT = Object.freeze({ aftOfGlareshield: 0.03, r: 0.045, sideOut: 0.05, lowV: 0.18, frontEndV: 0.5, faceAbove: 0.3, jogAbove: 0.18 });

/**
 * The AOA indexer on the front coaming's left, feet: a dark box 0.19 ft (2.3 in) tall, 0.065 ft wide and 0.24 ft deep,
 * its three lamp windows on its aft face 0.057 ft apart and its dimmer knob on its inboard side, the front
 * panel layout's size (Patrick, 11 Oct 2026, "sort out the scaling/positioning of the Aoa"). Until
 * V2.293 0.23 ft (2.75 in) tall, 0.07 wide and 0.29 deep, from Patrick's cockpit clip: forward and high
 * (Patrick's cockpit clip, 11 Oct 2026: its height about 0.9 of the 3-inch airspeed indicator's case, nearer the eye by
 * about 8 %; the case's 3.1 in checked by the KLN 900 GPS's 3.75 in face height beside it. The back-seat photos and his
 * other pictures give its depth about 1.3 times its height. The panel layout shows it about 2.3 in; estimates
 * read to about ±0.15 in), its middle 0.15 ft ahead of the coaming's aft edge and 0.47 ft left of the middle (0.52 until V2.306; the panel figure overlaid on the front-on render puts it 0.05 ft further in), over the
 * glareshield's flat top where the front panel layout shows it (0.74 ft until V2.289, when the
 * top narrowed to the figure's; 0.62 ft on the rear hump; places estimates). It stands on a pod, its foot 0.01 ft (clear) over each seat's eye's sight line
 * across the grab rail beside it, so all three lamps show above the rail (Patrick, 11 Oct 2026), as the diagram and the
 * SMM's 220 KIAS picture (Fig 3.5) draw it.
 */
export const AOA_INDEXER_FT = Object.freeze({ tall: 0.19, wide: 0.065, deep: 0.24, lampPitch: 0.057, aheadOfEdge: 0.15, y: 0.47, yRear: 0.62, clear: 0.01 });
/**
 * The standby compass at the coaming's right corner, feet: a wet compass, a dark ball 0.2 ft (2.4 in) across with a
 * round window facing aft, the card a ball 0.17 ft across floating inside it and turned by the heading (update(hud)),
 * the lubber line across the window, 0.1 ft ahead of the coaming's aft edge and 0.71 ft right of the middle (0.8 ft on
 * the rear hump), where the front panel layout shows it (Patrick, 11 Oct 2026: "can we make
 * the compas an actual sphere floating?" and "sort out the scaling/positioning of the Aoa and the compass"). It hangs
 * under a square flange 1.3 times its width across, the ball's top 0.14 of its radius up into it, the flange held by a
 * strap that runs 0.05 ft inboard and down onto the coaming, and a short dark cylinder (its light) under the ball, as
 * the figure draws them (Patrick, 11 Oct 2026: "the compas has a square top mount as per the diagrams"; V2.293 stood it
 * on a stem). Until V2.293 a bowl 2.2 in across under a 3.2 in square flange with an arm out to the bow's leg, 0.84 ft
 * right of the middle (V2.264, from Patrick's cockpit frame; V2.266 tried the diagram's size). Sizes estimates; the
 * rear seat's is unseen.
 */
export const STANDBY_COMPASS_FT = Object.freeze({ r: 0.1, cardR: 0.085, cardBandDeg: 35, clear: 0.03, flange: 0.68, cornerR: 0.025, flangeT: 0.022, strapIn: 0.05, windowDeg: 120, aheadOfEdge: 0.1, y: -0.71, yRear: -0.8 });
// Since 12 Oct 2026 (Patrick, from his photo) the flange is smaller (0.68 of the ball's width, so turned 45° its corners
// stay inside the ball's outline; was 0.95, and 1.3 before that, "smaller footprint for the compass mount"), its corners
// rounded and turned 45°, it and its strap light grey, and the card black with white marks (was cream with black).

/**
 * The rear cockpit's panel, feet: face 0.47 ft ahead of the origin, upright, 0.57 to 1.62 ft up, 2.2 ft across (Patrick,
 * 12 Oct 2026: 0.47 ft ahead of the rear coaming's aft edge, under it; was 0.7 ft aft of the origin, 0.7 to 1.75 ft up,
 * 0.1 ft ahead of the edge; height and width estimates).
 */
export const REAR_PANEL_FT = Object.freeze({ x: 0.47, leanDeg: 0, top: 1.62, bottom: 0.57, width: 2.2, insetFromGlass: 0.06, shoulderV: 0.6, topFrac: 0.55 });
/**
 * The rear coaming, feet (TS-157): the moulded hood the rear panel sits under (Dad's pictures 27 and 29), its aft edge
 * along the rear panel's outline with the grab rail on it, widening to the canopy forward, along
 * CT156_COAMING_CROWNS_FT.rear: 1.85 ft up at its aft edge on the origin, sloping down to 1.68 ft over the panel's face
 * and running almost level to under the centre arch (Patrick, 12 Oct 2026; until then a hump from 0.8 ft aft of the
 * origin, 1.9 ft up, rising 0.16 ft and falling onto the front seat's back 1.88 ft ahead of it). Widths estimates.
 */
const REAR_CROWN = CT156_COAMING_CROWNS_FT.rear;
export const REAR_HUMP_FT = Object.freeze({
  crown: REAR_CROWN, aftX: REAR_CROWN[0][0], foreX: REAR_CROWN[REAR_CROWN.length - 1][0], top: REAR_CROWN[0][1], foreTop: REAR_CROWN[REAR_CROWN.length - 1][1],
  lipDrop: 0.15, skirt: 0.12, topGrow: 0.35, sideGrow: 0.2, dropGrow: 0.35,
});

/**
 * The seats and their cockpits, feet (estimates off Dad's reference pictures; the seat back's frame is the model's).
 * The rear seat's are the same moved aft by REAR_DX.
 */
const SB = CT156_SEAT_BACK_FT;
const SEAT_BACK_X = [SEAT_DRAWN_X * F + SB.aft, SEAT_DRAWN_X * F + SB.aft + SB.cushion]; // the model's seat back, aft and front faces
// The back cushion, headbox and breakers lean aft (ct156SeatRakeFt) and the rear seat's whole seat is raised as its
// helmet is (ct156SeatRaiseFt) (Patrick, 12 Oct 2026); the headbox until then 0.36 ft deep from 2.1 to 2.7 ft up,
// the breakers' tops 2.95 ft up.
export const SEAT_FT = Object.freeze({
  pan: { aft: SEAT_BACK_X[1], fore: SEAT_BACK_X[1] + 1.2, z0: -0.48, z1: SB.pivotZ, halfWidth: 0.5 }, // the front eye about 2.4 ft above its top (2.5 ft until ALL-31 lowered the eye)
  backCushion: { depth: 0.1, z1: SB.z0, halfWidth: 0.42 },
  headbox: { aft: SEAT_BACK_X[0], fore: SEAT_BACK_X[0] + SB.deep, z0: SB.z0, z1: SB.z1, halfWidth: 0.4 }, // Martin-Baker headbox
  breakers: { y: 0.24, top: SB.z1 + SB.breakers }, // the canopy breakers on the headbox (Dad's picture 27)
  // The side consoles: tops 0.45 ft below the spinner's axis, 0.67 ft under the main face's bottom, so the lower panel's
  // gear handle panel and park brake show above them as the front panel layout shows them;
  // 0.48 ft wide, the console figure's proportions on our length, narrowed to clear the knee wells.
  // Patrick, 11 Oct 2026: "i almost feel like the whole dash has to come up a bit?". Until then 0.2 ft up (TS-157,
  // lowered from 0.35 ft with the deeper floor) and 0.35 ft wide. Estimates.
  console: { aft: 0.6, inner: 0.82, outer: 1.3, top: -0.45 },
  floorZ: CT156_TUB_FLOOR_FT, // the tub's floor (ct156-model.js)
  stick: { x: 2.2, tiltDeg: 8, height: 1.65 },
  // The knee wells under the panel: their tops at the main face's bottom (0.02 ft under it), 0.88 ft out, their top
  // corners 0.25 ft round, edged with a rolled trim 0.025 ft round (Patrick, 12 Oct 2026, and his lower panel photo;
  // were 0.15 ft under it, 0.8 ft out, 0.17 ft round, no trim). Where a well is wider than the console's inner edge,
  // its outer side stops on the console's top.
  knee: { inner: 0.24, outer: 0.88, belowPanel: 0.02, r: 0.25, depth: 0.5, trim: 0.025 },
});
/** The canopy's side frames inside the glass, feet: 0.3 ft up from the sill, a fastener every 0.3 ft (estimates). */
// Since 12 Oct 2026 the canopy's own grey lower frame sitting on the sill, as tall as the band outside
// (CT156_RAIL_BAND_FT, 0.34 ft), with a row of round fasteners 0.25 ft apart (Patrick's cockpit photos; spacing an
// estimate); it was 0.3 ft tall, 0.06 ft thick, with square nubs 0.3 ft apart.
export const SIDE_FRAME_FT = Object.freeze({ height: 0.34, thick: 0.08, foot: 0.22, pitch: 0.25, boltR: 0.018 });
// Since 12 Oct 2026 a solid wedge, `thick` at its top by the glass and `foot` at the sill, so its inner face slopes up
// and out to the glass and stays broad from any eye (Patrick, 12 Oct 2026, "the canopy rail gets thin as soon as I move
// my head", from his over-the-sill photo; it was an upright plate `thick` wide). Foot width an estimate.

/**
 * The coaming's shade on each panel's top: darkest (top, the veil's opacity) at the face's top edge, gone `depth` of the
 * way down (Patrick's cockpit clip, 11 Oct 2026; a fixed shade, not a sun-following shadow; estimates).
 */
const PANEL_SHADE = Object.freeze({ top: 0.55, depth: 0.4 });

/** The live instruments redraw at most this often, and only when what they show has changed (a picture; 5 a second is plenty). */
export const PANEL_REDRAW_MS = 200;

const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const lerp = (a, b, t) => a + (b - a) * t;

/** The angle above (+) or below (-) the eye's level line of a round tube's edge (feet; side +1 its top, -1 its bottom). */
function tubeEdgeDeg(eye, x, z, r, side) {
  const d = Math.hypot(x - eye.x, z - eye.z);
  return deg(Math.atan2(z - eye.z, x - eye.x) + side * Math.asin(Math.min(1, r / d)));
}

/** A coaming's crown (its middle's height) at station x, feet (CT156_COAMING_CROWNS_FT). */
function crownZ(h, x) {
  return ct156CrownZ(h.crown, x);
}

/**
 * The windscreen as the pilot sees it straight ahead, head level (TS-156, TS-157): from the top of the glareshield (its
 * rim, or the coaming's crown if that shows higher) up to the bottom of the bow over him, in degrees above (+) or below
 * (-) the eye's level line along the nose (the model's x axis, so the horizon sits at minus the pitch attitude). Front
 * seat: the forward bow band's inner tube; rear seat: the inter-cockpit arch's, and headboxDeg, the top of the front
 * seat's headbox, which stands in the middle of the rear seat's view. eyeFt in feet, the model's frame (EYES_FT plus any
 * eye offsets).
 * @returns {{ topDeg: number, bottomDeg: number, heightDeg: number, headboxDeg?: number }}
 */
export function windscreenFrom(eyeFt = EYE_FT, seat = 'front') {
  const rear = seat === 'rear';
  const h = rear ? REAR_HUMP_FT : GLARESHIELD_FT;
  let bottomDeg = tubeEdgeDeg(eyeFt, h.aftX - RIM_FT.aftOfGlareshield, h.top, RIM_FT.r, +1);
  for (let i = 0; i <= 48; i++) {
    const x = lerp(h.aftX, h.foreX, i / 48);
    bottomDeg = Math.max(bottomDeg, deg(Math.atan2(crownZ(h, x) - eyeFt.z, x - eyeFt.x)));
  }
  const b = rear ? ARCH_FT : FORWARD_BOW_FT;
  const crest = ct156CanopySection(b.bandX / F).top * F;
  const topDeg = tubeEdgeDeg(eyeFt, b.bandX, crest - b.glassInset - b.bandDepth, b.tubeR, -1);
  const out = { topDeg, bottomDeg, heightDeg: topDeg - bottomDeg };
  if (rear) out.headboxDeg = deg(Math.atan2(SEAT_FT.headbox.z1 - eyeFt.z, SEAT_FT.headbox.fore + FRONT_DX - ct156SeatRakeFt(SEAT_FT.headbox.z1) - eyeFt.x));
  return out;
}

/** The outside reference points (ct156-model.js CT156_REFERENCE_POINTS) in feet, { x, y, z } from the model's origin. */
export const CT156_POINTS_FT = Object.freeze(Object.fromEntries(Object.entries(CT156_REFERENCE_POINTS)
  .map(([k, [x, y, z]]) => [k, Object.freeze({ x: x * F, y: y * F, z: z * F })])));

/** A frame's rotation (the model's: rotation.set(-bank, -pitch, heading), order 'ZYX'), as a 3 x 3 matrix, body to world. */
function frameMatrix({ headingRad = 0, pitchRad = 0, bankRad = 0 }) {
  const [ch, sh, cp, sp, cb, sb] = [Math.cos(headingRad), Math.sin(headingRad), Math.cos(-pitchRad), Math.sin(-pitchRad), Math.cos(-bankRad), Math.sin(-bankRad)];
  // Rz(heading) · Ry(-pitch) · Rx(-bank)
  return [
    [ch * cp, ch * sp * sb - sh * cb, ch * sp * cb + sh * sb],
    [sh * cp, sh * sp * sb + ch * cb, sh * sp * cb - ch * sb],
    [-sp, cp * sb, cp * cb],
  ];
}

/**
 * Where a point on another aircraft appears from a pilot's eye (TS-156), for checking formation sight pictures: the
 * point's bearing from the eye in the eye's own aircraft's axes. Frames are poses as the 3D views place the model
 * ({ x, y, z } world feet, z up, and headingRad, pitchRad, bankRad as view3d.js aircraftPose: the model is set with
 * rotation.set(-bank, -pitch, heading), order 'ZYX'). eyeFt and pointFt are { x, y, z } feet in their own aircraft's
 * axes (nose +X, left +Y, up +Z from the model's origin), e.g. EYES_FT.front and CT156_POINTS_FT.leftLight.
 * Pure geometry: no flight numbers.
 * @returns {{ azimuthDeg: number, elevationDeg: number, rangeFt: number }} azimuth right of the nose positive,
 *   elevation above the eye's level line (the wings' plane) positive.
 */
export function sightAnglesOf(eyeFt, eyeFrame, pointFt, pointFrame) {
  const toWorld = (f, v) => {
    const m = frameMatrix(f);
    return [0, 1, 2].map((i) => [f.x, f.y, f.z][i] + m[i][0] * v.x + m[i][1] * v.y + m[i][2] * v.z);
  };
  const eye = toWorld(eyeFrame, eyeFt), pt = toWorld(pointFrame, pointFt);
  const d = [pt[0] - eye[0], pt[1] - eye[1], pt[2] - eye[2]];
  const m = frameMatrix(eyeFrame);
  const [bx, by, bz] = [0, 1, 2].map((j) => m[0][j] * d[0] + m[1][j] * d[1] + m[2][j] * d[2]); // world to body: the transpose
  return { azimuthDeg: deg(Math.atan2(-by, bx)), elevationDeg: deg(Math.atan2(bz, Math.hypot(bx, by))), rangeFt: Math.hypot(bx, by, bz) };
}

/** The canopy's inside half-width at station x and height z (feet), less an inset; below the sill the fuselage is wider. */
function glassHalfWidthFt(z, x, inset) {
  const c = ct156CanopySection(x / F);
  if (z <= c.base * F) return Infinity;
  return Math.max(0, ct156CanopyHalfWidth(x / F, z / F) * F - inset);
}

/** A panel's half-width at height z (feet): its width at most, kept inside the canopy at its station. */
function panelHalfWidthFt(z, p = PANEL_FT, x = p.x) {
  return Math.max(0, Math.min(p.width / 2, glassHalfWidthFt(z, x, p.insetFromGlass)));
}

/**
 * Leans a part of a panel's face back with the face (p.leanDeg, its top forward), about the face's bottom edge: each
 * point above that edge moves forward by its height over it times the lean's tangent. Returns the geometry.
 */
function leanWithFace(g, p) {
  if (!p.leanDeg) return g;
  const pos = g.attributes.position, k = Math.tan((p.leanDeg * Math.PI) / 180);
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + Math.max(0, pos.getZ(i) - p.bottom) * k);
  pos.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
/** Whether a part sits on a panel's face (feet): just aft of it or in its back box, within its height, so it leans with it. */
function onFace(g, p) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  return b.min.x >= p.x - 0.2 && b.max.x <= p.x + 0.13 && b.min.z >= p.bottom - 0.005 && b.max.z <= p.top + 0.005;
}

/** A panel's tombstone outline (feet): its straight sides' half-width, its top's, and the shoulders' height. */
function tombstone(p) {
  const h = p.top - p.bottom;
  const shoulderZ = p.bottom + p.shoulderV * h;
  let side = p.width / 2;
  for (let i = 0; i <= 8; i++) side = Math.min(side, panelHalfWidthFt(p.bottom + ((shoulderZ - p.bottom) * i) / 8, p));
  const top = Math.min(p.topFrac * side, panelHalfWidthFt(p.top, p));
  return { side, top, shoulderZ, height: h };
}

/**
 * Leaning to see Lead (Patrick, 11 Oct 2026: "whenever lead is obscured by the canopy bow or the glare shield the eye
 * sight 'leans' (realistically, smoothly) up to 6 inches in any direction to see lead"; Fable's design): while a target
 * hides behind the seat's forward bow band (front seat; the arch from the rear) or under its coaming, with a margin, the
 * eye moves the smallest amount that clears him, at most `maxFt` (6 in): sideways for the bow, up for the coaming,
 * both when neither alone does it, never down. It eases there and back (easePerS, about 0.5 s to get there), and back to
 * the seat's eye once he shows `clearDeg` clear from it. Only the eye moves; the cockpit stays put. The rear seat's
 * headbox ahead isn't tested. The margins, step and ease are estimates.
 */
export const EYE_LEAN = Object.freeze({ maxFt: 0.5, marginDeg: 1, clearDeg: 1.5, stepFt: 0.025, easePerS: 6, everyS: 0.1 });

const leanParts = {};
/** What can hide a target from a seat (feet, cached): the coaming's top edges as lines across, and the bow band's outline. */
function leanObstructions(seat) {
  if (leanParts[seat]) return leanParts[seat];
  const rear = seat === 'rear';
  const p = rear ? REAR_PANEL_FT : PANEL_FT, h = rear ? REAR_HUMP_FT : GLARESHIELD_FT, b = rear ? ARCH_FT : FORWARD_BOW_FT;
  const ts = tombstone(p);
  const deck = [];
  for (let i = 0; i <= 14; i++) {
    const x = lerp(h.aftX, h.foreX, (i / 14) ** 1.3);
    deck.push(hoodSection(h, ts, x));
    if (h.cheeks) for (const s of [1, -1]) deck.push(cheekHalf(h, ts, x).map(([y, z]) => [x, s * y, z]));
  }
  const rx = h.aftX - RIM_FT.aftOfGlareshield;
  const edge = hoodHalf(h, ts, h.aftX).slice(0, -1); // the grab rail's top, as seatParts lays the rail
  deck.push([...edge.slice(1).reverse(), ...edge.slice(1).map(([y, z]) => [-y, z])].map(([y, z]) => [rx, y, z + RIM_FT.r]));
  const pts = ct156HoopPoints(b.bandX / F, 32, 0, b.lean ?? 0);
  const base = ct156CanopySection(b.bandX / F).base * F;
  const inward = ({ x, y, z }, d) => {
    const dy = -y * F, dz = base - z * F, l = Math.hypot(dy, dz) || 1;
    return [x * F, y * F + (dy / l) * d, z * F + (dz / l) * d];
  };
  const band = [...pts.map((q) => inward(q, 0)), ...pts.map((q) => inward(q, b.glassInset + b.bandDepth + 2 * (b.tubeR ?? 0))).reverse()];
  return (leanParts[seat] = { deck, band });
}

/** A point's bearing from an eye, degrees: [right of the nose, above the eye's level line] (the aircraft's own axes, feet). */
function bearingOf(eye, [x, y, z]) {
  const dx = x - eye.x, dy = y - eye.y;
  return [deg(Math.atan2(-dy, dx)), deg(Math.atan2(z - eye.z, Math.hypot(dx, dy)))];
}

/** Whether a target (feet, the aircraft's axes) hides from `eye` behind the bow band or under the coaming, within `margin` degrees. */
function leanHidden(eye, target, o, margin) {
  const [ta, te] = bearingOf(eye, [target.x, target.y, target.z]);
  // Under the coaming: below its top edge at his bearing (each line across, at his azimuth widened by the margin).
  for (const line of o.deck) {
    for (let i = 1; i < line.length; i++) {
      const [a0, e0] = bearingOf(eye, line[i - 1]), [a1, e1] = bearingOf(eye, line[i]);
      if (Math.max(a0, a1) < ta - margin || Math.min(a0, a1) > ta + margin) continue;
      const t = a1 === a0 ? 0.5 : clamp01((ta - a0) / (a1 - a0));
      if (te < lerp(e0, e1, t) + margin) return true;
    }
  }
  // Behind the band: inside its outline, or within the margin of its edge.
  const poly = o.band.map((q) => bearingOf(eye, q));
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ai, ei] = poly[i], [aj, ej] = poly[j];
    if ((ei > te) !== (ej > te) && ta < ((aj - ai) * (te - ei)) / (ej - ei) + ai) inside = !inside;
    const da = aj - ai, de = ej - ei, l2 = da * da + de * de || 1;
    const t = clamp01(((ta - ai) * da + (te - ei) * de) / l2);
    if (Math.hypot(ta - (ai + t * da), te - (ei + t * de)) < margin) return true;
  }
  return inside;
}

/**
 * The lean (EYE_LEAN) that shows `target` from `eyeFt` in `seat` ({ dy left, dz up } feet; the aircraft's axes, feet):
 * none when he is clear; the present one (`current`) while it still shows him and he isn't clear from the seat's eye;
 * else the smallest sideways, upward or both that clears him; none if 6 in doesn't. Pure geometry.
 */
export function eyeLeanFor(eyeFt, targetFt, seat = 'front', current = null) {
  const o = leanObstructions(seat === 'rear' ? 'rear' : 'front'), L = EYE_LEAN;
  const at = (dy, dz) => ({ x: eyeFt.x, y: eyeFt.y + dy, z: eyeFt.z + dz });
  const none = { dy: 0, dz: 0 };
  if (current && (current.dy || current.dz)) {
    if (!leanHidden(eyeFt, targetFt, o, L.clearDeg)) return none;
    if (!leanHidden(at(current.dy, current.dz), targetFt, o, L.marginDeg)) return current;
  } else if (!leanHidden(eyeFt, targetFt, o, L.marginDeg)) return none;
  const n = Math.round(L.maxFt / L.stepFt), r = Math.SQRT1_2;
  for (let k = 1; k <= n; k++) {
    const d = k * L.stepFt;
    for (const [dy, dz] of [[d, 0], [-d, 0], [0, d], [d * r, d * r], [-d * r, d * r]]) {
      if (!leanHidden(at(dy, dz), targetFt, o, L.marginDeg)) return { dy, dz };
    }
  }
  return none;
}

/**
 * An eye lean that eases (EYE_LEAN): update(tSec, eyeFt, targetFt, seat, on) gives the lean to add to the eye now
 * ({ dy, dz } feet), looking again every everyS seconds; with `on` false or no target it eases back to none.
 */
export function createEyeLean() {
  let want = { dy: 0, dz: 0 }, now = { dy: 0, dz: 0 }, lastLook = -Infinity, lastT = null;
  return {
    update(tSec, eyeFt, targetFt, seat = 'front', on = true) {
      const dt = lastT === null ? 0 : Math.min(0.25, Math.max(0, tSec - lastT));
      lastT = tSec;
      if (!on || !targetFt) want = { dy: 0, dz: 0 };
      else if (tSec - lastLook >= EYE_LEAN.everyS || tSec < lastLook) {
        lastLook = tSec;
        want = eyeLeanFor(eyeFt, targetFt, seat, want);
      }
      const k = 1 - Math.exp(-EYE_LEAN.easePerS * dt);
      now = { dy: now.dy + (want.dy - now.dy) * k, dz: now.dz + (want.dz - now.dz) * k };
      return now;
    },
  };
}

// ---------- the panel pictures ----------
// Layout (V2.238): measured off the front instrument panel layout (measured only), drawn
// flat-on and scaled by its 3-inch gauges (31.6 px to the inch), each instrument's middle and size in inches from the
// panel's middle line and the face's top, then turned into fractions of the front face (2.3 ft by 1.26 ft); the lamps
// on the coaming's lip are the diagram's master warning panel. Nothing is copied from the diagram but sizes and
// places. (Until V2.236 placed by eye off Dad's reference pictures 17, 26 and 27, within about 0.05 ft of these.)
// The KLN 900 GPS (Patrick, 11 Oct 2026; its face 5.75 by 3.75 in, the maker's listing) checks that scale: the diagram
// draws its box 3.8 in tall (6.1 in wide, likely its tray), so the GPS takes the KLN's own size.
// u 0 is the pilot's left edge of the main face and 1 its right; v 0
// its bottom and 1 its top. Round dials give d (a fraction of the face's width); rectangles give w (of its width) and
// h (of its height); square bezels give s (of its width), with the round dial d inside. Live ones read the HUD's
// numbers for the aircraft the camera sits in (the standby airspeed and altimeter in the bottom row read the same
// numbers as the main ones); the rest are drawn once (the sim has no numbers for them). Screens that would show radio
// or navigation data show the tool's own placeholder dashes. Both panels use this layout (picture 27 shows the rear
// panel laid out as the front's).

const PANEL_INSTRUMENTS = [
  { kind: 'aoa', u: 0.233, v: 0.78, d: 0.072 },
  { kind: 'asi', u: 0.336, v: 0.837, s: 0.112, d: 0.096, live: 'asi' },
  { kind: 'eadi', u: 0.498, v: 0.805, w: 0.175, h: 0.356, live: 'eadi', frame: true },
  { kind: 'alt', u: 0.666, v: 0.837, s: 0.112, d: 0.096, live: 'alt' },
  { kind: 'label', u: 0.795, v: 0.771, w: 0.07, h: 0.04 },
  { kind: 'lights', u: 0.111, v: 0.607, w: 0.026, h: 0.115, live: 'lights' }, // NWS over SPEED BRAKE
  { kind: 'clock', u: 0.17, v: 0.646, w: 0.092, h: 0.107 },
  { kind: 'g', u: 0.262, v: 0.617, d: 0.077, live: 'g' },
  { kind: 'rmu', u: 0.357, v: 0.498, w: 0.097, h: 0.4, frame: true },
  { kind: 'ehsi', u: 0.502, v: 0.445, w: 0.169, h: 0.347, live: 'ehsi', frame: true },
  { kind: 'vsi', u: 0.666, v: 0.586, s: 0.112, d: 0.096, live: 'vsi' },
  { kind: 'eng', u: 0.792, v: 0.586, s: 0.112, name: 'TRQ' },
  { kind: 'eng', u: 0.669, v: 0.372, s: 0.1, name: 'ITT' },
  { kind: 'eng', u: 0.792, v: 0.372, s: 0.1, name: 'NP' },
  { kind: 'elt', u: 0.902, v: 0.527, w: 0.076, h: 0.092 }, // the ELT switch
  { kind: 'deice', u: 0.909, v: 0.418, w: 0.076, h: 0.1 }, // the prop de-ice switch; no FIRE light here
  { kind: 'slave', u: 0.904, v: 0.298, w: 0.08, h: 0.062 }, // the heading slave switches
  { kind: 'gps', u: 0.181, v: 0.397, w: 0.208, h: 0.248, frame: true }, // the KLN 900's face, 5.75 x 3.75 in (Patrick; maker's listing)
  { kind: 'audio', u: 0.24, v: 0.131, w: 0.233, h: 0.251 },
  { kind: 'asi', u: 0.408, v: 0.157, d: 0.08, live: 'asi' },
  { kind: 'stby', u: 0.502, v: 0.157, s: 0.092, d: 0.08, live: 'stby' },
  { kind: 'alt', u: 0.597, v: 0.157, d: 0.08, live: 'alt' },
  { kind: 'turn', u: 0.684, v: 0.17, d: 0.074 }, // the turn coordinator
  { kind: 'placard', u: 0.684, v: 0.072, w: 0.062, h: 0.05 }, // its fuel placard
  { kind: 'placard', u: 0.048, v: 0.19, w: 0.055, h: 0.17 }, // the emergency gear placard over its handle
  { kind: 'annun', u: 0.846, v: 0.125, w: 0.214, h: 0.195 },
  { kind: 'emerGear', u: 0.059, v: 0.1, s: 0.045 },
];

/**
 * The audio control panel's knobs, each [across, down] as fractions of its box, its name and
 * whether it is a 3D knob standing proud (true) or a toggle drawn flat: two rows of four volume knobs, the VHF MIC/KEY
 * selector on the left and the bottom row's selector, toggles and intercom knob. Places read off the figure.
 */
const AUDIO_KNOBS = Object.freeze([
  [0.315, 0.27, 'VHF 1', true], [0.49, 0.27, 'UHF', true], [0.684, 0.27, 'NAV 1', true], [0.877, 0.27, 'ADF', true],
  [0.315, 0.58, 'VHF 2', true], [0.49, 0.58, 'MARKER', true], [0.684, 0.58, 'NAV 2', true], [0.877, 0.58, 'DME', true],
  [0.11, 0.5, 'MIC/KEY', true], [0.377, 0.86, 'BOTH', true], [0.55, 0.86, 'AUDIO', false], [0.693, 0.86, 'MKR HI/LO', false], [0.877, 0.86, 'INTPH', true],
]);

/** The live faces' windows in one shared picture (pixels); both seats' live instruments read the same windows. */
/** The caution panel's lights, row by row as the panel figure names them. */
const ANNUNCIATORS = Object.freeze([
  ['BAT BUS', 'GEN BUS', 'PMU FAIL', 'GEN', 'CKPT PX'],
  ['CANOPY', 'FUEL PX', 'OIL PX', 'OBOGS FAIL', 'CHIP'],
  ['CKPT ALT', '\u2014', 'HYDR FL LO', '\u2014', 'BUS TIE'],
  ['FUEL BAL', 'PMU STATUS', 'EHYD PX LO', 'TAD FAIL', 'OBOGS TEMP'],
  ['L FUEL LO', 'R FUEL LO', 'DUCT TEMP', 'IGN SEL', 'M FUEL BAL'],
  ['TRIM OFF', 'BOOST PUMP', 'ANTI ICE', 'TAD OFF', 'ST READY'],
]);

/** The caution panel's light names, row by row (for a caller that lights them, the EP Tabletop; '—' is a blank cell). */
export const ANNUNCIATOR_NAMES = Object.freeze(ANNUNCIATORS.flat().filter((n) => n !== '\u2014'));
/** The three lamps on the coaming's lip, left to right, which createCt156Cockpit's liveEngine can light. */
export const MASTER_LAMPS = Object.freeze(['MASTER WARN', 'MASTER CAUTION', 'FIRE']);

/**
 * The engine and systems numbers the live engine displays take (createCt156Cockpit's liveEngine; the EP Tabletop),
 * each with its scale's full value (the needle's far end) and, where its colours differ from the static picture's, the
 * bands as fractions of the scale. Sources: N1 red from 104 % (maximum take-off N1) and ITT red from 820 °C (maximum
 * continuous ITT, PT6A-68), docs/references/open-source-performance-baseline.md (ALL-30); the oil pressure scale is
 * 140 psi so the static picture's bands fall at about 42 and 119 psi, near that file's 40 psi aerobatic minimum and
 * 90 to 120 psi normal range. Every other full value and band (torque 110 %, ITT 1,000 °C, N1 110 %, oil temperature
 * 150 °C, hydraulic 4,000 psi green to 3,500, each tank 600 lb) is an ESTIMATE for the picture until a source backs it.
 * A picture only: the numbers come from the caller.
 */
export const ENGINE_LIVE = Object.freeze({
  torquePct: { full: 110 },
  npPct: { full: 110 },
  ittC: { full: 1000, bands: [[0, 0.82, '#2fbf4f'], [0.82, 1, '#e03a3a']] },
  n1Pct: { full: 110, bands: [[0, 104 / 110, '#2fbf4f'], [104 / 110, 1, '#e03a3a']] },
  fuelFlowPph: { full: 1000 },
  oilPsi: { full: 140 },
  oilTempC: { full: 150, bands: [[0, 0.8, '#2fbf4f'], [0.8, 1, '#e03a3a']] },
  hydPsi: { full: 4000, bands: [[0, 0.875, '#2fbf4f'], [0.875, 1, '#e03a3a']] },
  fuelLeftLb: { full: 600 },
  fuelRightLb: { full: 600 },
  volts: { full: 40 },
  amps: { full: 100 },
});

const ATLAS = Object.freeze({ width: 1024, height: 1024 });
/** The live engine displays' and caution panel's windows in their own shared picture (liveEngine only), each its box's shape. */
const ENGINE_WINDOWS = Object.freeze({
  TRQ: { x: 0, y: 0, w: 400, h: 400 },
  ITT: { x: 408, y: 0, w: 360, h: 360 },
  NP: { x: 0, y: 408, w: 360, h: 360 },
  annun: { x: 368, y: 408, w: 512, h: 256 },
});
const LIVE_WINDOWS = Object.freeze({
  // Each window has its face's shape (the EADI and EHSI 0.9 wide to 1 tall; until V2.287 they were drawn 1.75 to 1 and
  // squeezed onto their faces, which made the EADI's sphere an oval).
  eadi: { x: 0, y: 0, w: 360, h: 400 },
  ehsi: { x: 368, y: 0, w: 360, h: 404 },
  asi: { x: 736, y: 0, w: 280, h: 280 },
  alt: { x: 0, y: 416, w: 280, h: 280 },
  vsi: { x: 288, y: 416, w: 280, h: 280 },
  stby: { x: 576, y: 416, w: 220, h: 220 },
  g: { x: 804, y: 416, w: 200, h: 200 },
  lights: { x: 0, y: 704, w: 64, h: 280 },
});

// The panel's and consoles' face: matte medium grey, as Patrick's CT-156 cockpit photos show (Patrick, 12 Oct 2026; dark
// charcoal '#2b2e32' since 11 Oct 2026 22:06Z after US Navy T-6A photos, and mid grey '#8e9296' before). Shade an estimate.
const PANEL_GREY = '#5a5e63';
const SEAM = 'rgba(36, 39, 43, 0.55)';
const BEZEL = '#1d2024';
/** The displays' black frames round their screens, feet (about 0.5 in; Patrick's CT-156 photo, judged). */
const BEZEL_FT = 0.04;
const BLACK = '#0b0d10';
const FACE = '#0b0d10';
const INK = '#e8edf2';
const DIM = 'rgba(200, 215, 230, 0.7)';
const GREEN_INK = '#7fd18a';
const YELLOW = '#e8c21c';
const num = (v, digits = 0) => (Number.isFinite(v) ? v.toLocaleString('en-CA', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—');

function bezel(ctx, cx, cy, r) {
  const pad = Math.max(3, r * 0.12);
  ctx.fillStyle = '#16191d';
  ctx.fillRect(cx - r - pad, cy - r - pad, 2 * (r + pad), 2 * (r + pad));
  ctx.fillStyle = FACE;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A rounded rectangle path. */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Screw heads at a box's corners, in from its edges. */
function screws(ctx, x, y, w, h, inset, r) {
  ctx.fillStyle = '#5c6066';
  for (const [sx, sy] of [[x + inset, y + inset], [x + w - inset, y + inset], [x + inset, y + h - inset], [x + w - inset, y + h - inset]]) {
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A square instrument bezel, as round the T-6A's main dials and displays (Dad's pictures 17 and 26). */
function squareBezel(ctx, x, y, w, h) {
  ctx.fillStyle = BEZEL;
  roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.12);
  ctx.fill();
  screws(ctx, x, y, w, h, Math.min(w, h) * 0.08, Math.max(1.5, Math.min(w, h) * 0.025));
}

/**
 * A display's bezel on the panel, as Patrick's CT-156 cockpit photo shows them (11 Oct 2026, the panel step): a thick
 * rounded black frame `pad` pixels round the screen, a white dot (the light sensor) in its lower left corner, and a
 * Dzus fastener on the grey just outside each corner. Drawn under the screen; sizes judged off the photo.
 */
function displayBezel(ctx, x, y, w, h, pad) {
  const X = x - pad, Y = y - pad, W = w + 2 * pad, H = h + 2 * pad;
  ctx.fillStyle = '#121417';
  roundRect(ctx, X, Y, W, H, pad * 1.4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 126, 132, 0.55)'; // the frame's lit outer edge
  ctx.lineWidth = Math.max(1, pad * 0.12);
  roundRect(ctx, X + ctx.lineWidth / 2, Y + ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth, pad * 1.35);
  ctx.stroke();
  ctx.fillStyle = '#e9edf0';
  ctx.beginPath(); ctx.arc(X + pad * 0.75, Y + H - pad * 0.75, Math.max(1.5, pad * 0.28), 0, Math.PI * 2); ctx.fill();
  dzus(ctx, X, Y, W, H, pad);
}

/** Dzus fasteners on the grey just outside a box's corners. */
function dzus(ctx, X, Y, W, H, pad) {
  const r = Math.max(1.5, pad * 0.22), o = pad * 0.45;
  for (const [sx, sy] of [[X - o, Y - o], [X + W + o, Y - o], [X - o, Y + H + o], [X + W + o, Y + H + o]]) {
    ctx.fillStyle = '#6b7177'; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a3f44'; ctx.lineWidth = Math.max(1, r * 0.35);
    ctx.beginPath(); ctx.moveTo(sx - r * 0.6, sy); ctx.lineTo(sx + r * 0.6, sy); ctx.stroke();
  }
}


/** Yellow and black diagonal stripes filling a box. */
function stripes(ctx, x, y, w, h, n = 5) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = YELLOW;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#111';
  const step = Math.max(w, h) / n;
  ctx.lineWidth = step * 0.45;
  for (let k = -n; k <= 2 * n; k++) {
    ctx.beginPath();
    ctx.moveTo(x + k * step, y + h);
    ctx.lineTo(x + k * step + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

function label(ctx, text, x, y, px = 11, colour = DIM, align = 'center') {
  ctx.fillStyle = colour;
  ctx.font = `${Math.max(6, Math.round(px))}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/** A round dial: ticks from `from` to `to` over `sweepDeg` from the top, a needle at `value`, a digital box under it. */
function dial(ctx, { cx, cy, r, from, to, sweepDeg, startDeg = 0, major, minor, name, value, readout, labelOf = (n) => String(n), labelScale = 1 }) {
  bezel(ctx, cx, cy, r);
  const angleOf = (n) => ((startDeg + ((n - from) / (to - from)) * sweepDeg - 90) * Math.PI) / 180;
  ctx.strokeStyle = INK;
  for (let n = from; n <= to + 1e-9; n += minor) {
    const a = angleOf(n);
    const big = Math.abs(n / major - Math.round(n / major)) < 1e-6;
    ctx.lineWidth = Math.max(1, (big ? 2 : 1) * (r / 50));
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    ctx.lineTo(cx + Math.cos(a) * r * (big ? 0.78 : 0.85), cy + Math.sin(a) * r * (big ? 0.78 : 0.85));
    ctx.stroke();
    if (big) label(ctx, labelOf(n), cx + Math.cos(a) * r * 0.64, cy + Math.sin(a) * r * 0.64, r * 0.2 * labelScale, INK);
  }
  label(ctx, name, cx, cy - r * 0.32, r * 0.18);
  if (readout !== null) {
    ctx.fillStyle = '#000';
    ctx.fillRect(cx - r * 0.42, cy + r * 0.2, r * 0.84, r * 0.3);
    label(ctx, readout, cx, cy + r * 0.35, r * 0.24, INK);
  }
  if (Number.isFinite(value)) {
    const a = angleOf(Math.max(from, Math.min(to, value)));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * r * 0.12, cy - Math.sin(a) * r * 0.12);
    ctx.lineTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82);
    ctx.stroke();
  }
  ctx.fillStyle = '#555';
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, r * 0.08), 0, Math.PI * 2);
  ctx.fill();
}

/** The EHSI: a compass card turning with the heading under a fixed lubber line, the heading in a box on top. */
function ehsi(ctx, cx, cy, r, headingDeg) {
  ctx.fillStyle = FACE;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  const hdg = Number.isFinite(headingDeg) ? headingDeg : 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-hdg * Math.PI) / 180);
  ctx.strokeStyle = INK;
  for (let d = 0; d < 360; d += 5) {
    const a = ((d - 90) * Math.PI) / 180;
    const big = d % 30 === 0;
    ctx.lineWidth = d % 10 === 0 ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    ctx.lineTo(Math.cos(a) * r * (big ? 0.8 : d % 10 === 0 ? 0.85 : 0.89), Math.sin(a) * r * (big ? 0.8 : d % 10 === 0 ? 0.85 : 0.89));
    ctx.stroke();
    if (big) {
      ctx.save();
      ctx.translate(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66);
      ctx.rotate((d * Math.PI) / 180);
      const name = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10);
      label(ctx, name, 0, 0, r * 0.2, INK);
      ctx.restore();
    }
  }
  ctx.restore();
  // The course pointer and its deviation bar (green, as the panel layout's EHSI), centred and on the
  // nose: the sim has no course set, so it reads straight ahead, no deviation. The deviation dots either side.
  ctx.strokeStyle = '#2fd15a'; ctx.fillStyle = '#2fd15a'; ctx.lineWidth = Math.max(2, r * 0.045);
  ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.76); ctx.lineTo(cx, cy - r * 0.42); ctx.moveTo(cx, cy + r * 0.42); ctx.lineTo(cx, cy + r * 0.76); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.8); ctx.lineTo(cx - r * 0.07, cy - r * 0.66); ctx.lineTo(cx + r * 0.07, cy - r * 0.66); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.36); ctx.lineTo(cx, cy + r * 0.36); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, r * 0.02);
  for (const k of [-2, -1, 1, 2]) { ctx.beginPath(); ctx.arc(cx + k * r * 0.2, cy, r * 0.035, 0, Math.PI * 2); ctx.stroke(); }
  // The fixed aircraft symbol and lubber line.
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = Math.max(1.5, r * 0.035);
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.3); ctx.lineTo(cx, cy + r * 0.3);
  ctx.moveTo(cx - r * 0.22, cy - r * 0.05); ctx.lineTo(cx + r * 0.22, cy - r * 0.05);
  ctx.moveTo(cx - r * 0.1, cy + r * 0.25); ctx.lineTo(cx + r * 0.1, cy + r * 0.25);
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.95); ctx.lineTo(cx - r * 0.07, cy - r * 1.05); ctx.lineTo(cx + r * 0.07, cy - r * 1.05); ctx.closePath();
  ctx.fill();
}

/** A screen's heading box, top centre. */
function headingBox(ctx, cx, y, size, headingDeg) {
  const text = Number.isFinite(headingDeg) ? String(Math.round(((headingDeg % 360) + 360) % 360) || 360).padStart(3, '0') : '—';
  ctx.fillStyle = '#000';
  ctx.strokeStyle = 'rgba(232, 237, 242, 0.6)';
  ctx.lineWidth = 1;
  ctx.fillRect(cx - size * 1.6, y, size * 3.2, size * 1.3);
  ctx.strokeRect(cx - size * 1.6, y, size * 3.2, size * 1.3);
  label(ctx, `${text}°`, cx, y + size * 0.68, size, INK);
}

/** A screen: a black frame round a dark glass face. */
function screen(ctx, x, y, w, h, glass = '#05070a') {
  ctx.fillStyle = BLACK;
  ctx.fillRect(x, y, w, h);
  const m = Math.max(2, Math.min(w, h) * 0.06);
  ctx.fillStyle = glass;
  ctx.fillRect(x + m, y + m, w - 2 * m, h - 2 * m);
  return { x: x + m, y: y + m, w: w - 2 * m, h: h - 2 * m };
}

/** Rows of labels with dashes beside them, inside a screen. */
function rows(ctx, s, names, colour = GREEN_INK) {
  const step = s.h / (names.length + 0.5);
  names.forEach((name, i) => {
    const y = s.y + step * (i + 0.75);
    label(ctx, name, s.x + s.w * 0.08, y, step * 0.55, colour, 'left');
    label(ctx, '—', s.x + s.w * 0.92, y, step * 0.6, INK, 'right');
  });
}

/** A knob: a dark round with a lighter cap. */
function knob(ctx, x, y, r) {
  ctx.fillStyle = '#050608'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4b5056'; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fill();
}

/** A toggle switch seen from aft: a small dark base and a light lever dot. */
function toggle(ctx, x, y, r) {
  ctx.fillStyle = '#16181b'; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  ctx.fillStyle = '#c9ced4'; ctx.beginPath(); ctx.arc(x, y - r * 0.3, r * 0.45, 0, Math.PI * 2); ctx.fill();
}

/**
 * The EADI on its square screen `s`: a round attitude ball, black round it to the screen's
 * corners (Patrick, 11 Oct 2026: "the instrument is square but the attitude indicator is round and the outside of it is
 * black"; V2.287 filled the whole screen), its sky and ground turning with the bank and moving with the pitch (5° marks,
 * 10° bars with their numbers each side), the bank scale fixed on an arc just outside the ball's top (10, 20, 30, 45 and
 * 60°) with the pointer turning with the bank, the fixed aircraft symbol in the middle. The ball 0.72 of the screen's
 * width across, as the figure draws it (estimate). pitchDeg nose up positive, bankDeg right wing down positive. About 50°
 * of pitch shows top to bottom of the screen (estimate).
 */
function eadi(ctx, s, pitchDeg, bankDeg) {
  const cx = s.x + s.w / 2, cy = s.y + s.h * 0.52;
  const bank = rad(Number.isFinite(bankDeg) ? bankDeg : 0), pitch = Number.isFinite(pitchDeg) ? pitchDeg : 0;
  const ppd = s.h / 50, big = Math.hypot(s.w, s.h), ball = Math.min(s.w, s.h) * 0.36;
  ctx.fillStyle = '#000'; ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, ball, 0, Math.PI * 2); ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-bank);
  const shift = pitch * ppd;
  ctx.fillStyle = '#2b7fd4'; ctx.fillRect(-big, -2 * big + shift, 2 * big, 2 * big);
  ctx.fillStyle = '#8a5a2c'; ctx.fillRect(-big, shift, 2 * big, 2 * big);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, s.h * 0.006);
  ctx.beginPath(); ctx.moveTo(-big, shift); ctx.lineTo(big, shift); ctx.stroke();
  ctx.lineWidth = Math.max(1, s.h * 0.004);
  for (let d = -90; d <= 90; d += 5) {
    if (d === 0) continue;
    const y = shift - d * ppd;
    if (Math.abs(y) > ball * 0.85) continue;
    const half = ball * (d % 10 === 0 ? 0.4 : 0.18);
    ctx.beginPath(); ctx.moveTo(-half, y); ctx.lineTo(half, y); ctx.stroke();
    if (d % 10 === 0) {
      label(ctx, String(Math.abs(d)), -half - ball * 0.14, y, s.h * 0.04, '#ffffff');
      label(ctx, String(Math.abs(d)), half + ball * 0.14, y, s.h * 0.04, '#ffffff');
    }
  }
  ctx.restore();
  ctx.strokeStyle = '#c9ced4'; ctx.lineWidth = Math.max(1, s.h * 0.004);
  ctx.beginPath(); ctx.arc(cx, cy, ball, 0, Math.PI * 2); ctx.stroke();
  // The bank scale: fixed marks on an arc just outside the ball's top, the pointer turning with the bank.
  const R = ball + s.h * 0.01;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, s.h * 0.005);
  for (const m of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
    const a = rad(m - 90), len = [30, 60].includes(Math.abs(m)) ? s.h * 0.04 : s.h * 0.022;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.lineTo(cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len)); ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx - s.h * 0.022, cy - R - s.h * 0.04); ctx.lineTo(cx + s.h * 0.022, cy - R - s.h * 0.04); ctx.closePath(); ctx.fill();
  const pa = -bank - Math.PI / 2;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(pa) * R, cy + Math.sin(pa) * R);
  ctx.lineTo(cx + Math.cos(pa + 0.06) * (R - s.h * 0.045), cy + Math.sin(pa + 0.06) * (R - s.h * 0.045));
  ctx.lineTo(cx + Math.cos(pa - 0.06) * (R - s.h * 0.045), cy + Math.sin(pa - 0.06) * (R - s.h * 0.045));
  ctx.closePath(); ctx.fill();
  // The fixed aircraft symbol: two wing bars and a centre square, yellow outlined in black.
  const wing = (x0, x1) => { ctx.fillRect(Math.min(x0, x1), cy - s.h * 0.012, Math.abs(x1 - x0), s.h * 0.024); ctx.strokeRect(Math.min(x0, x1), cy - s.h * 0.012, Math.abs(x1 - x0), s.h * 0.024); };
  ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
  wing(cx - ball * 0.72, cx - ball * 0.3); wing(cx + ball * 0.3, cx + ball * 0.72);
  ctx.fillRect(cx - s.h * 0.014, cy - s.h * 0.014, s.h * 0.028, s.h * 0.028); ctx.strokeRect(cx - s.h * 0.014, cy - s.h * 0.014, s.h * 0.028, s.h * 0.028);
}

/** The electronic altimeter: a 0 to 9 dial with the needle on hundreds, the altitude to the foot in a window, the setting under it. */
function altimeter(ctx, cx, cy, r, altFt) {
  const alt = Number.isFinite(altFt) ? altFt : NaN;
  dial(ctx, { cx, cy, r, from: 0, to: 1000, sweepDeg: 360, major: 100, minor: 20, name: 'ALT', value: Number.isFinite(alt) ? ((alt % 1000) + 1000) % 1000 : NaN, readout: null, labelOf: (n) => (n === 1000 ? '' : String(n / 100)) });
  const text = Number.isFinite(alt) ? Math.round(alt).toLocaleString('en-CA') : '—';
  ctx.fillStyle = '#000'; ctx.strokeStyle = 'rgba(232, 237, 242, 0.7)'; ctx.lineWidth = 1;
  ctx.fillRect(cx - r * 0.5, cy + r * 0.08, r * 1.0, r * 0.28); ctx.strokeRect(cx - r * 0.5, cy + r * 0.08, r * 1.0, r * 0.28);
  label(ctx, text, cx, cy + r * 0.22, r * 0.22, INK);
  label(ctx, '29.92 IN', cx, cy + r * 0.45, r * 0.12, '#7fd18a');
}

/**
 * A small arc gauge on an engine display: a 240° scale with its coloured bands, the ticks, its name under it, the
 * needle parked at the scale's start and its digits dashed (the sim has no engine or systems numbers).
 * bands: [[from, to, colour]] as fractions of the scale.
 */
/**
 * @param {any} ctx @param {number} cx @param {number} cy @param {number} r @param {string} name
 * @param {Array<Array<number | string>>} [bands] @param {number | null} [f] the needle, a fraction of the scale @param {string} [text]
 */
function arcGauge(ctx, cx, cy, r, name, bands = [[0, 0.8, '#2fbf4f'], [0.8, 1, '#e03a3a']], f = null, text = '—') {
  const a0 = rad(150), sweep = rad(240), at = (f) => a0 + sweep * f;
  const needle = Number.isFinite(f) ? at(Math.max(0, Math.min(1, f))) : a0;
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  for (const [f0, f1, colour] of bands) { ctx.strokeStyle = colour; ctx.beginPath(); ctx.arc(cx, cy, r, at(f0), at(f1)); ctx.stroke(); }
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, r * 0.05);
  for (let k = 0; k <= 8; k++) {
    const a = at(k / 8);
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); ctx.lineTo(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62); ctx.stroke();
  }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, r * 0.08);
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(needle) * r * 0.75, cy + Math.sin(needle) * r * 0.75); ctx.stroke();
  label(ctx, text, cx + r * 0.2, cy + r * 0.38, r * 0.42, INK);
  label(ctx, name, cx, cy + r * 1.08, r * 0.34, DIM);
}

/**
 * The engine displays, as the panel layout lays them out, drawn as their
 * screens show them: `name` TRQ the primary engine display (the big torque dial, NP and IOAT digits, the ITT and N1
 * dials), ITT the engine and systems readouts (torque, N1, ITT, cabin altitude and pressure, the fuel quantity dial and
 * fuel flow) and NP the systems display (oil temperature and pressure and hydraulic pressure dials, volts and amps).
 * Scales and labels only: the sim has no engine or systems numbers, so needles rest at the scale's start and every
 * number is dashes. `e` (optional, the EP Tabletop's live displays, createCt156Cockpit's liveEngine): the numbers to
 * show (ENGINE_LIVE's keys); any one missing shows as above. With no `e` the picture is exactly the static one.
 */
function engineDisplay(ctx, s, name, e = null) {
  const px = s.h * 0.07;
  /** @type {(u: number, v: number) => [number, number]} */
  const at = (u, v) => [s.x + s.w * u, s.y + s.h * v];
  const val = (key) => (e && Number.isFinite(e[key]) ? e[key] : null);
  const txt = (key, digits = 0) => (val(key) === null ? '—' : num(val(key), digits));
  const frac = (key) => (val(key) === null ? null : val(key) / ENGINE_LIVE[key].full);
  const bands = (key) => (e ? ENGINE_LIVE[key].bands : undefined);
  if (name === 'TRQ') {
    const [cx, cy] = at(0.36, 0.3), r = s.h * 0.24;
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.strokeStyle = '#2fbf4f'; ctx.beginPath(); ctx.arc(cx, cy, r, rad(135), rad(135 + 270 * 100 / 110)); ctx.stroke();
    ctx.strokeStyle = '#e03a3a'; ctx.beginPath(); ctx.arc(cx, cy, r, rad(135 + 270 * 100 / 110), rad(405)); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1;
    for (let n = 0; n <= 110; n += 10) {
      const a = rad(135 + (270 * n) / 110);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86); ctx.lineTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72); ctx.stroke();
      if (n % 20 === 0) label(ctx, String(n / 10), cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, px * 0.7, INK);
    }
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, r * 0.06);
    const ta = rad(135 + 270 * Math.max(0, Math.min(1, frac('torquePct') ?? 0)));
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ta) * r * 0.8, cy + Math.sin(ta) * r * 0.8); ctx.stroke();
    label(ctx, `${txt('torquePct')} %`, cx, cy + r * 0.2, px, INK);
    label(ctx, 'TORQUE', cx, cy + r * 0.62, px * 0.75, DIM);
    for (const [t, v, value] of /** @type {Array<[string, number, boolean]>} */ ([['NP', 0.12, false], [`${txt('npPct')} %`, 0.21, true], ['IOAT', 0.33, false], ['— °C', 0.42, true]])) label(ctx, t, ...at(0.82, v), px * (value ? 0.9 : 0.7), value ? INK : DIM);
    arcGauge(ctx, ...at(0.27, 0.72), s.h * 0.12, 'ITT', bands('ittC'), frac('ittC'), txt('ittC'));
    arcGauge(ctx, ...at(0.73, 0.72), s.h * 0.12, 'N1', bands('n1Pct'), frac('n1Pct'), txt('n1Pct'));
  } else if (name === 'ITT') {
    for (const [t, u, v, key] of /** @type {Array<[string, number, number, string?]>} */ ([['TORQUE', 0.17, 0.1, 'torquePct'], ['N1', 0.5, 0.1, 'n1Pct'], ['COCKPIT', 0.83, 0.1], ['ITT', 0.17, 0.3, 'ittC'], ['ALT', 0.83, 0.3], ['ΔP', 0.83, 0.5], ['FF', 0.83, 0.72, 'fuelFlowPph']])) {
      label(ctx, t, ...at(u, v), px * 0.7, DIM);
      label(ctx, key ? txt(key) : '—', ...at(u, v + 0.09), px * 0.85, INK);
    }
    const [cx, cy] = at(0.36, 0.68), r = s.h * 0.2;
    ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, rad(180), rad(360)); ctx.stroke();
    for (let k = 0; k <= 6; k++) {
      const a = rad(180 + k * 30);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.lineTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82); ctx.stroke();
    }
    label(ctx, 'L', cx - r * 0.55, cy - r * 0.35, px * 0.7, INK);
    label(ctx, 'R', cx + r * 0.55, cy - r * 0.35, px * 0.7, INK);
    label(ctx, 'FUEL', cx, cy - r * 0.15, px * 0.6, DIM);
    label(ctx, 'QTY', cx, cy + r * 0.05, px * 0.6, DIM);
    label(ctx, 'LBS X100', cx, cy + r * 0.35, px * 0.55, DIM);
    // Live: a needle for each tank on the same scale, from the left end (empty) round to the right (full).
    for (const [key, colour] of [['fuelLeftLb', '#ffffff'], ['fuelRightLb', '#8fd3ff']]) {
      const f = frac(key);
      if (f === null) continue;
      const a = rad(180 + 180 * Math.max(0, Math.min(1, f)));
      ctx.strokeStyle = colour; ctx.lineWidth = Math.max(1.5, r * 0.06);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85); ctx.stroke();
    }
  } else {
    arcGauge(ctx, ...at(0.27, 0.24), s.h * 0.13, 'TEMP', bands('oilTempC'), frac('oilTempC'), txt('oilTempC'));
    arcGauge(ctx, ...at(0.73, 0.24), s.h * 0.13, 'PRESS', [[0, 0.15, '#e03a3a'], [0.15, 0.3, '#e0c03a'], [0.3, 0.85, '#2fbf4f'], [0.85, 1, '#e03a3a']], frac('oilPsi'), txt('oilPsi'));
    label(ctx, 'OIL', ...at(0.5, 0.08), px * 0.7, DIM);
    arcGauge(ctx, ...at(0.3, 0.68), s.h * 0.13, 'HYDR', e ? ENGINE_LIVE.hydPsi.bands : [[0, 0.75, '#2fbf4f'], [0.75, 1, '#e03a3a']], frac('hydPsi'), txt('hydPsi'));
    for (const [t, v] of /** @type {Array<[string, number]>} */ ([[`${txt('volts', 1)} VOLTS`, 0.62], [`${txt('amps')} AMPS`, 0.74]])) label(ctx, t, ...at(0.72, v), px * 0.75, INK);
  }
}

/** One instrument drawn into its box (x, y, w, h pixels), from the HUD's numbers `h` (null or {} shows dashes). */
function drawInstrument(ctx, kind, b, h, inst = {}) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const r = Math.min(b.w, b.h) / 2;
  const rr = r / 1.12; // inside a round dial's bezel
  switch (kind) {
    case 'deice': { // the prop de-ice panel: its placard, the ON/FAIL push-button, the monitor test switch
      ctx.fillStyle = '#1b1e22'; ctx.fillRect(b.x, b.y, b.w, b.h);
      label(ctx, 'PROP DE-ICE', cx, b.y + b.h * 0.12, b.h * 0.09, INK);
      const bx = b.x + b.w * 0.1, by = b.y + b.h * 0.24, bw = b.w * 0.42, bh = b.h * 0.42;
      ctx.fillStyle = BLACK; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#2b2416'; ctx.fillRect(bx + bw * 0.1, by + bh * 0.08, bw * 0.8, bh * 0.38); // ON, unlit
      ctx.fillStyle = '#2b1414'; ctx.fillRect(bx + bw * 0.1, by + bh * 0.54, bw * 0.8, bh * 0.38); // FAIL, unlit
      label(ctx, 'ON', bx + bw / 2, by + bh * 0.27, bh * 0.22, '#b59a5a');
      label(ctx, 'FAIL', bx + bw / 2, by + bh * 0.73, bh * 0.22, '#b56a6a');
      label(ctx, 'PUSH ON/OFF', bx + bw / 2, b.y + b.h * 0.8, b.h * 0.07, DIM);
      label(ctx, 'MONITOR', b.x + b.w * 0.78, b.y + b.h * 0.3, b.h * 0.07, DIM);
      label(ctx, 'TEST', b.x + b.w * 0.78, b.y + b.h * 0.38, b.h * 0.07, DIM);
      toggle(ctx, b.x + b.w * 0.78, b.y + b.h * 0.55, b.h * 0.06);
      label(ctx, 'NORM', b.x + b.w * 0.78, b.y + b.h * 0.72, b.h * 0.07, DIM);
      break;
    }
    case 'aoa': // unlabelled scale, needle mid-scale: the sim has no angle of attack
      dial(ctx, { cx, cy, r: rr, from: 0, to: 1, sweepDeg: 270, startDeg: -135, major: 0.25, minor: 0.125, name: 'AOA', value: 0.5, readout: null, labelOf: () => '' });
      break;
    case 'asi': // the electronic airspeed indicator: 40 to 320 knots, the digital speed under the hub
      dial(ctx, { cx, cy, r: rr, from: 40, to: 320, sweepDeg: 300, major: 40, minor: 10, name: 'KNOTS', value: h?.kias, readout: num(h?.kias), labelOf: (n) => String(n), labelScale: 0.72 });
      break;
    case 'alt': // the electronic altimeter (item 4): the needle on hundreds, the altitude to the foot in its window, the setting
      altimeter(ctx, cx, cy, rr, h?.altFt);
      break;
    case 'vsi': // the electronic VSI (item 5): thousands of feet a minute, 0 to 6 up and down, the rate under the hub
      dial(ctx, { cx, cy, r: rr, from: -6, to: 6, sweepDeg: 300, startDeg: -240, major: 1, minor: 0.5, name: 'VSI', value: h?.vsFpm / 1000, readout: Number.isFinite(h?.vsFpm) ? num(Math.round(h.vsFpm / 10) * 10) : '—', labelOf: (n) => ([0, 1, 2, 4, 6].includes(Math.abs(n)) ? String(Math.abs(n)) : '') });
      break;
    case 'g':
      dial(ctx, { cx, cy, r: rr, from: -4, to: 8, sweepDeg: 300, startDeg: -150, major: 2, minor: 1, name: 'G', value: h?.g, readout: num(h?.g, 1) });
      break;
    case 'stby':
      bezel(ctx, cx, cy, rr);
      drawAttitude(ctx, cx, cy, rr * 0.94, h?.pitchDeg, h?.bankDeg);
      break;
    case 'clock': { // the M850 chronometer: its LCD over the GMT LT FT ET marks, SELECT and CONTROL under
      ctx.fillStyle = BEZEL; roundRect(ctx, b.x, b.y, b.w, b.h, b.w * 0.06); ctx.fill();
      screws(ctx, b.x, b.y, b.w, b.h, b.w * 0.07, Math.max(1.5, b.w * 0.025));
      label(ctx, 'M850', cx, b.y + b.h * 0.1, b.h * 0.07, INK);
      label(ctx, 'CHRONOMETER', cx, b.y + b.h * 0.18, b.h * 0.06, INK);
      ctx.fillStyle = '#8f9a84'; ctx.fillRect(b.x + b.w * 0.14, b.y + b.h * 0.25, b.w * 0.72, b.h * 0.3); // the LCD, unlit
      ctx.fillStyle = '#1d2219'; ctx.font = `bold ${Math.round(b.h * 0.24)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('--:--', cx, b.y + b.h * 0.41);
      ['GMT', 'LT', 'FT', 'ET'].forEach((t, k) => label(ctx, t, b.x + b.w * (0.22 + k * 0.19), b.y + b.h * 0.6, b.h * 0.05, INK));
      ['SELECT', 'CONTROL'].forEach((t, k) => {
        const x = b.x + b.w * (0.3 + k * 0.4);
        label(ctx, t, x, b.y + b.h * 0.7, b.h * 0.05, INK);
        ctx.fillStyle = '#3a3e44'; ctx.fillRect(x - b.w * 0.08, b.y + b.h * 0.75, b.w * 0.16, b.h * 0.08);
      });
      label(ctx, 'DAVTRON', cx, b.y + b.h * 0.91, b.h * 0.06, INK);
      break;
    }
    case 'lights': // the nosewheel steering light over the speed brake light
      // The speed brake light is lit while the speed brake is out (Patrick, 11 Oct 2026 20:22Z: "the
      // 'speed brake' light comes on in the cockpit"): the HUD's speedBrake. Lit green, the colour a GUESS (no page
      // gives it). NWS stays unlit (the sims fly, they don't taxi).
      for (const [k, name] of [[0, 'NWS'], [1, 'SPEED BRAKE']]) {
        const y = b.y + (b.h * k) / 2 + b.h * 0.03, side = b.h / 2 - b.h * 0.06;
        const lit = k === 1 && h?.speedBrake === true;
        ctx.fillStyle = BLACK; ctx.fillRect(b.x, y, b.w, side);
        ctx.fillStyle = lit ? '#3fd25a' : '#2a2c22'; ctx.fillRect(b.x + b.w * 0.12, y + side * 0.12, b.w * 0.76, side * 0.76);
        const words = name.split(' ');
        words.forEach((t, j) => label(ctx, t, b.x + b.w / 2, y + side * (0.5 + (j - (words.length - 1) / 2) * 0.24), side * 0.2, lit ? '#0b2410' : '#b9b48a'));
      }
      break;
    case 'elt': // the ELT panel: its name over the XMT button and the ON/ARM switch, EMER USE ONLY under
      ctx.fillStyle = '#1b1e22'; ctx.fillRect(b.x, b.y, b.w, b.h);
      screws(ctx, b.x, b.y, b.w, b.h, b.h * 0.1, Math.max(1.5, b.h * 0.04));
      label(ctx, 'ELT', cx, b.y + b.h * 0.12, b.h * 0.11, INK);
      ctx.fillStyle = '#050608'; ctx.beginPath(); ctx.arc(b.x + b.w * 0.35, b.y + b.h * 0.5, b.h * 0.12, 0, Math.PI * 2); ctx.fill();
      label(ctx, 'XMT', b.x + b.w * 0.35, b.y + b.h * 0.74, b.h * 0.09, INK);
      label(ctx, 'ON', b.x + b.w * 0.68, b.y + b.h * 0.3, b.h * 0.09, INK);
      toggle(ctx, b.x + b.w * 0.68, b.y + b.h * 0.5, b.h * 0.09);
      label(ctx, 'ARM', b.x + b.w * 0.68, b.y + b.h * 0.74, b.h * 0.09, INK);
      label(ctx, 'EMER USE ONLY', cx, b.y + b.h * 0.9, b.h * 0.08, INK);
      break;
    case 'slave': { // the heading slave panel: a small square button, the DG/SLVD and CW/CCW buttons
      ctx.fillStyle = '#1b1e22'; roundRect(ctx, b.x, b.y, b.w, b.h, b.h * 0.3); ctx.fill();
      ctx.fillStyle = '#3c4147'; ctx.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.4, b.w * 0.1, b.h * 0.22);
      for (const [x, top, bottom] of [[0.48, 'DG', 'SLVD'], [0.7, 'CW', 'CCW']]) {
        const X = b.x + b.w * x, Y = b.y + b.h * 0.52;
        ctx.fillStyle = '#c9ced4'; ctx.beginPath(); ctx.arc(X, Y, b.h * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#050608'; ctx.beginPath(); ctx.arc(X, Y, b.h * 0.15, 0, Math.PI * 2); ctx.fill();
        label(ctx, top, X, b.y + b.h * 0.17, b.h * 0.13, INK);
        label(ctx, bottom, X, b.y + b.h * 0.88, b.h * 0.13, INK);
      }
      break;
    }
    case 'turn': { // the turn coordinator: the little aeroplane wings level, L and R marks, the ball
      bezel(ctx, cx, cy, rr);
      ctx.fillStyle = FACE; ctx.beginPath(); ctx.arc(cx, cy, rr * 0.94, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, rr * 0.05);
      for (const a of [-20, 20, 160, 200]) { // the standard-rate marks either side of wings level
        const t = rad(a);
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(t) * rr * 0.72, cy + Math.sin(t) * rr * 0.72); ctx.lineTo(cx + Math.cos(t) * rr * 0.88, cy + Math.sin(t) * rr * 0.88); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(cx - rr * 0.62, cy); ctx.lineTo(cx + rr * 0.62, cy); ctx.stroke(); // the aeroplane's wings
      ctx.beginPath(); ctx.arc(cx, cy, rr * 0.1, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, cy - rr * 0.1); ctx.lineTo(cx, cy - rr * 0.24); ctx.stroke();
      label(ctx, 'L', cx - rr * 0.68, cy + rr * 0.24, rr * 0.18, INK);
      label(ctx, 'R', cx + rr * 0.68, cy + rr * 0.24, rr * 0.18, INK);
      ctx.fillStyle = '#d7dadd'; roundRect(ctx, cx - rr * 0.4, cy + rr * 0.42, rr * 0.8, rr * 0.18, rr * 0.09); ctx.fill(); // the ball's tube
      ctx.fillStyle = BLACK; ctx.beginPath(); ctx.arc(cx, cy + rr * 0.51, rr * 0.08, 0, Math.PI * 2); ctx.fill();
      label(ctx, 'DC', cx, cy + rr * 0.76, rr * 0.13, DIM);
      break;
    }
    case 'placard': // a placard: a light plate with lines of small lettering (drawn as bars; no words copied)
      ctx.fillStyle = '#d9dcdf'; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#3b3f44';
      for (let y = b.y + b.h * 0.12, k = 0; y < b.y + b.h * 0.85; y += Math.max(3, b.w * 0.14), k++) ctx.fillRect(b.x + b.w * 0.1, y, b.w * (k % 3 === 2 ? 0.5 : 0.8), Math.max(1, b.w * 0.05));
      break;
    case 'label':
      ctx.fillStyle = '#16181b'; ctx.fillRect(b.x, b.y, b.w, b.h);
      break;
    case 'eadi': {
      const sc = screen(ctx, b.x, b.y, b.w, b.h, '#020304');
      eadi(ctx, sc, h?.pitchDeg, h?.bankDeg);
      break;
    }
    case 'ehsi': {
      const sc = screen(ctx, b.x, b.y, b.w, b.h, '#020304');
      // Its top tenth sits under the EADI's frame from the seat, so the heading box and labels start below it.
      const er = Math.min(sc.w, sc.h) * 0.37;
      ehsi(ctx, sc.x + sc.w / 2, sc.y + sc.h * 0.58, er, h?.headingDeg);
      headingBox(ctx, sc.x + sc.w / 2, sc.y + sc.h * 0.1, sc.h * 0.05, h?.headingDeg);
      label(ctx, 'HDG ---', sc.x + sc.w * 0.04, sc.y + sc.h * 0.13, sc.h * 0.045, '#d36bd3', 'left');
      label(ctx, 'CRS ---', sc.x + sc.w * 0.96, sc.y + sc.h * 0.13, sc.h * 0.045, '#7fd18a', 'right');
      label(ctx, 'VOR1', sc.x + sc.w * 0.04, sc.y + sc.h * 0.95, sc.h * 0.045, '#7fd18a', 'left');
      label(ctx, '--- NM', sc.x + sc.w * 0.96, sc.y + sc.h * 0.95, sc.h * 0.045, INK, 'right');
      break;
    }
    case 'rmu': { // the radio management unit: its five radio lines, line keys each side, keys and knob under it
      ctx.fillStyle = BEZEL; ctx.fillRect(b.x, b.y, b.w, b.h);
      label(ctx, 'BENDIX KING', cx, b.y + b.h * 0.035, b.h * 0.022, DIM);
      const sc = screen(ctx, b.x + b.w * 0.13, b.y + b.h * 0.06, b.w * 0.74, b.h * 0.58, '#0a0f0b');
      // Example frequencies and codes from the figure (a picture: the sim has no radios).
      const lines = [['UHF', '227.50', '314.60', 'MAIN'], ['VHF 1', '121.7', '118.20', ''], ['ATC', '', '6543', 'STBY'], ['ADF', '1799', '386.0', 'ADF'], ['NAV 1', '111.70', '113.80', 'DME']];
      const step = sc.h / lines.length, t = Math.min(step * 0.2, sc.w * 0.1);
      lines.forEach(([name, act, pre, tag], k) => {
        const y = sc.y + step * k;
        if (k) { ctx.strokeStyle = 'rgba(127, 209, 138, 0.35)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(sc.x + 2, y); ctx.lineTo(sc.x + sc.w - 2, y); ctx.stroke(); ctx.setLineDash([]); }
        label(ctx, name, sc.x + sc.w * 0.05, y + step * 0.22, t, GREEN_INK, 'left');
        label(ctx, act, sc.x + sc.w * 0.05, y + step * 0.6, t, INK, 'left');
        label(ctx, pre, sc.x + sc.w * 0.95, y + step * 0.22, t, GREEN_INK, 'right');
        label(ctx, tag, sc.x + sc.w * 0.95, y + step * 0.6, t * 0.85, GREEN_INK, 'right');
      });
      for (let k = 0; k < 5; k++) {
        const y = sc.y + step * (k + 0.5) - b.h * 0.015;
        for (const x of [b.x + b.w * 0.025, b.x + b.w * 0.895]) { ctx.fillStyle = '#3c4147'; ctx.fillRect(x, y, b.w * 0.08, b.h * 0.03); }
      }
      ['PAGE', 'DME', '1/2', 'SYS'].forEach((t2, k) => {
        const x = b.x + b.w * (0.08 + k * 0.215);
        ctx.fillStyle = '#3c4147'; ctx.fillRect(x, b.y + b.h * 0.68, b.w * 0.19, b.h * 0.05);
        label(ctx, t2, x + b.w * 0.095, b.y + b.h * 0.705, b.h * 0.022, INK);
      });
      ['SQ', 'MEM'].forEach((t2, k) => {
        const x = b.x + b.w * (0.08 + k * 0.215);
        ctx.fillStyle = '#3c4147'; ctx.fillRect(x, b.y + b.h * 0.76, b.w * 0.19, b.h * 0.05);
        label(ctx, t2, x + b.w * 0.095, b.y + b.h * 0.785, b.h * 0.022, INK);
      });
      knob(ctx, b.x + b.w * 0.62, b.y + b.h * 0.88, b.w * 0.15);
      break;
    }
    case 'gps': { // the KLN 900 GPS: its two-page screen, the keys under it, a big knob each side
      ctx.fillStyle = '#1b1e22'; ctx.fillRect(b.x, b.y, b.w, b.h);
      screws(ctx, b.x, b.y, b.w, b.h, b.h * 0.06, Math.max(1.5, b.h * 0.025));
      const sc = screen(ctx, b.x + b.w * 0.18, b.y + b.h * 0.08, b.w * 0.64, b.h * 0.46, '#0a0f0b');
      const t = sc.h * 0.12, mid = sc.x + sc.w * 0.52, col = '#ffb13b';
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mid, sc.y + 2); ctx.lineTo(mid, sc.y + sc.h * 0.84); ctx.moveTo(sc.x + 2, sc.y + sc.h * 0.84); ctx.lineTo(sc.x + sc.w - 2, sc.y + sc.h * 0.84); ctx.stroke();
      // The tool's home field as the active waypoint; the sim has no GPS numbers, so they are dashes.
      label(ctx, '\u2192CYMJ', sc.x + sc.w * 0.04, sc.y + sc.h * 0.1, t, col, 'left');
      [['DIS', '---NM'], ['GS', '---KT'], ['ETE', '--:--'], ['BRG', '---\u00b0']].forEach(([a, v], k) => {
        const y = sc.y + sc.h * (0.27 + k * 0.15);
        label(ctx, a, sc.x + sc.w * 0.04, y, t, col, 'left');
        label(ctx, v, mid - sc.w * 0.03, y, t, col, 'right');
      });
      label(ctx, 'CYMJ', mid + sc.w * 0.04, sc.y + sc.h * 0.1, t, col, 'left');
      label(ctx, 'N --\u00b0--.--\'', mid + sc.w * 0.04, sc.y + sc.h * 0.42, t, col, 'left');
      label(ctx, 'W ---\u00b0--.--\'', mid + sc.w * 0.04, sc.y + sc.h * 0.57, t, col, 'left');
      label(ctx, 'NAV 1', sc.x + sc.w * 0.04, sc.y + sc.h * 0.92, t * 0.85, col, 'left');
      label(ctx, 'ENR-LEG', sc.x + sc.w * 0.5, sc.y + sc.h * 0.92, t * 0.85, col);
      label(ctx, 'APT 1', sc.x + sc.w * 0.96, sc.y + sc.h * 0.92, t * 0.85, col, 'right');
      for (const [k, name] of ['\u2192D', 'CLR', 'ENT', 'MSG', 'ALT', 'NRST'].entries()) {
        const x = b.x + b.w * (0.27 + (k % 3) * 0.17), y = b.y + b.h * (k < 3 ? 0.62 : 0.76);
        ctx.fillStyle = '#3c4147'; ctx.fillRect(x, y, b.w * 0.12, b.h * 0.1);
        label(ctx, name, x + b.w * 0.06, y + b.h * 0.05, b.h * 0.045, INK);
      }
      for (const [x, y, name] of [[0.09, 0.3, 'CRSR'], [0.91, 0.3, 'CRSR']]) {
        ctx.fillStyle = '#3c4147'; ctx.fillRect(b.x + b.w * (x - 0.05), b.y + b.h * y, b.w * 0.1, b.h * 0.1);
        label(ctx, name, b.x + b.w * x, b.y + b.h * (y + 0.05), b.h * 0.04, INK);
      }
      knob(ctx, b.x + b.w * 0.09, b.y + b.h * 0.72, b.h * 0.12); knob(ctx, b.x + b.w * 0.91, b.y + b.h * 0.72, b.h * 0.12);
      ctx.fillStyle = '#c9ced4'; ctx.fillRect(b.x + b.w * 0.3, b.y + b.h * 0.92, b.w * 0.4, b.h * 0.02);
      break;
    }
    case 'eng': // the engine displays (static: the sim has no engine numbers, so every number is dashes)
      engineDisplay(ctx, screen(ctx, b.x, b.y, b.w, b.h, '#050709'), inst.name);
      break;
    case 'audio': { // the audio control panel: its knobs' wells and names (the knobs stand proud in 3D)
      ctx.fillStyle = '#1b1e22'; ctx.fillRect(b.x, b.y, b.w, b.h);
      screws(ctx, b.x, b.y, b.w, b.h, b.h * 0.06, Math.max(1.5, b.h * 0.025));
      label(ctx, 'AUDIO', cx, b.y + b.h * 0.06, b.h * 0.06, INK);
      ctx.strokeStyle = '#c9ced4'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(b.x + b.w * 0.2, b.y + b.h * 0.06); ctx.lineTo(b.x + b.w * 0.42, b.y + b.h * 0.06); ctx.moveTo(b.x + b.w * 0.58, b.y + b.h * 0.06); ctx.lineTo(b.x + b.w * 0.96, b.y + b.h * 0.06); ctx.stroke();
      for (const [fx, fy, name, solid] of AUDIO_KNOBS) {
        const x = b.x + b.w * fx, y = b.y + b.h * fy;
        label(ctx, name, x, y - b.h * 0.12, b.h * 0.045, INK);
        if (solid) { ctx.fillStyle = '#050608'; ctx.beginPath(); ctx.arc(x, y, b.w * 0.055, 0, Math.PI * 2); ctx.fill(); }
        else toggle(ctx, x, y, b.h * 0.05);
      }
      break;
    }
    case 'annun': // the caution panel: five across, six down, each with its name, all unlit
      annunciatorPanel(ctx, b, null);
      break;
    case 'emerGear':
      stripes(ctx, b.x, b.y, b.w, b.h, 3);
      break;
    default:
  }
}

/**
 * The caution panel: five across, six down, each with its name, unlit; `lit` (optional, the EP Tabletop's live panel) a
 * Set of names drawn lit: an amber face with dark letters (the colour an estimate; the CT-156's own panel unseen).
 */
function annunciatorPanel(ctx, b, lit) {
  ctx.fillStyle = '#1b1e22'; ctx.fillRect(b.x, b.y, b.w, b.h);
  screws(ctx, b.x, b.y, b.w, b.h, b.h * 0.07, Math.max(1.5, b.h * 0.025));
  const x0 = b.x + b.w * 0.1, y0 = b.y + b.h * 0.1, cw = (b.w * 0.8) / 5, ch = (b.h * 0.8) / 6;
  ANNUNCIATORS.forEach((row, j) => row.forEach((name, i) => {
    const x = x0 + i * cw, y = y0 + j * ch;
    const on = Boolean(lit?.has(name));
    ctx.fillStyle = on ? '#f0a81e' : '#26221a'; ctx.fillRect(x + cw * 0.06, y + ch * 0.1, cw * 0.88, ch * 0.8);
    label(ctx, name, x + cw / 2, y + ch / 2, ch * 0.3, on ? '#1a1200' : '#8f8a74');
  }));
}

/** An instrument's outer size on its panel, feet: { w, h } (the square bezel when it has one). */
function outerFt(inst, faceW, faceH) {
  const s = inst.s ?? inst.d;
  if (s) return { w: s * faceW, h: s * faceW };
  return { w: inst.w * faceW, h: inst.h * faceH };
}
/** An instrument's face (what its live quad covers), feet: the round dial inside a square bezel, or the whole box. */
function faceFt(inst, faceW, faceH) {
  if (inst.d) return { w: inst.d * faceW, h: inst.d * faceW };
  return outerFt(inst, faceW, faceH);
}

/** A panel's static picture: the grey face with its seams and every instrument drawn once (live ones dashed under their quads). */
function drawStaticPanel(ctx, width, height, instruments, faceW, faceH) {
  ctx.fillStyle = PANEL_GREY;
  ctx.fillRect(0, 0, width, height);
  const k = width / faceW;
  // The panel's edge and its sub-panel seams, as they read in the pictures.
  ctx.strokeStyle = 'rgba(40, 44, 48, 0.6)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, width - 6, height - 6);
  ctx.strokeStyle = SEAM;
  ctx.lineWidth = 2;
  for (const [u0, v0, u1, v1] of [[0.02, 0.263, 0.36, 0.263], [0.37, 0.02, 0.37, 0.98], [0.61, 0.02, 0.61, 0.98], [0.62, 0.255, 0.98, 0.255], [0.02, 0.7, 0.36, 0.7]]) {
    ctx.beginPath(); ctx.moveTo(u0 * width, (1 - v0) * height); ctx.lineTo(u1 * width, (1 - v1) * height); ctx.stroke();
  }
  const pad = BEZEL_FT * k;
  for (const inst of instruments) {
    const o = outerFt(inst, faceW, faceH);
    const w = o.w * k, h = o.h * k;
    const box = { x: inst.u * width - w / 2, y: (1 - inst.v) * height - h / 2, w, h };
    if (inst.s && inst.d) {
      if (inst.kind === 'stby') squareBezel(ctx, box.x, box.y, box.w, box.h);
      else displayBezel(ctx, box.x, box.y, box.w, box.h, pad * 0.5);
      const f = faceFt(inst, faceW, faceH);
      const fw = f.w * k;
      drawInstrument(ctx, inst.kind, { x: inst.u * width - fw / 2, y: (1 - inst.v) * height - fw / 2, w: fw, h: fw }, null, inst);
    } else {
      if (inst.kind === 'eadi' || inst.kind === 'ehsi' || inst.kind === 'eng') displayBezel(ctx, box.x, box.y, box.w, box.h, pad);
      else if (inst.frame) { ctx.fillStyle = BEZEL; ctx.fillRect(box.x - 4, box.y - 4, box.w + 8, box.h + 8); }
      drawInstrument(ctx, inst.kind, box, null, inst);
    }
  }
}

/**
 * The lower panel's picture (both seats), laid out as the front panel layout shows it (measured at
 * the main face's scale; places read off the figure, nothing copied): on the pedestal the EFIS control panel's keys and
 * knobs (item 18), lower down the defog switch, vent lever and round ECS vent (items 19 to 21); left of the left knee
 * well the landing gear panel (item 27: its two lights, the handle's slot, the warning silence button and the striped
 * downlock override); right of the right knee well the park brake's placard (item 13; the handle is 3D). Mapped in feet:
 * LOWER_PANEL_FT's width across (the pilot's left at u 0), the floor at v 0 and the main face's bottom at v 1.
 */
function drawLowerPanel(ctx, width, height) {
  ctx.fillStyle = PANEL_GREY;
  ctx.fillRect(0, 0, width, height);
  const LW = LOWER_PANEL_FT.halfWidth, z0 = SEAT_FT.floorZ, z1 = PANEL_FT.bottom, up = z1 - LOWER_PANEL_FT.laidOutAt;
  // Each place rises with the panel (`up`), except the floor itself.
  const X = (y) => ((LW - y) / (2 * LW)) * width, Z = (z) => ((z1 - (z === z0 ? z0 : z + up)) / (z1 - z0)) * height;
  const R = (ft) => (ft / (2 * LW)) * width; // a length across, pixels
  const rect = (yl, yr, zt, zb, fill) => { ctx.fillStyle = fill; ctx.fillRect(X(yl), Z(zt), X(yr) - X(yl), Z(zb) - Z(zt)); };
  const dot = (y, z, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(X(y), Z(z), R(r), 0, Math.PI * 2); ctx.fill(); };
  // The pedestal: the EFIS control panel, two knobs and two rows of keys.
  rect(0.27, -0.25, 0.205, 0.05, '#1b1e22');
  screws(ctx, X(0.27), Z(0.205), X(-0.25) - X(0.27), Z(0.05) - Z(0.205), R(0.025), Math.max(1.5, R(0.008)));
  for (const y of [0.18, -0.16]) knob(ctx, X(y), Z(0.14), R(0.03));
  for (const [z, ys] of [[0.16, [0.09, 0.03, -0.03, -0.09]], [0.1, [0.09, 0.03, -0.03, -0.09]]]) {
    for (const y of ys) rect(y + 0.022, y - 0.022, z + 0.017, z - 0.017, '#c9ced4');
  }
  // The defog and vent panel: the vent lever's slot, the defog switch and the big round vent.
  rect(0.27, -0.25, -0.18, -0.5, '#25282c');
  rect(0.215, 0.195, -0.22, -0.46, '#050608');
  toggle(ctx, X(0.1), Z(-0.3), R(0.02));
  dot(-0.07, -0.33, 0.125, '#3a3e43'); dot(-0.07, -0.33, 0.1, '#0a0b0d'); dot(-0.07, -0.33, 0.045, '#2b2f34');
  rect(0.27, -0.25, -0.52, z0, '#4c5055'); // the pedestal's foot
  // The landing gear panel: two lights at its top, the handle's slot, the warning silence button, the striped override.
  rect(1.24, 0.95, 0.1, -0.38, '#1b1e22');
  for (const y of [1.19, 0.99]) rect(y + 0.03, y - 0.03, 0.06, -0.0, '#0f2a14');
  rect(1.1, 1.08, 0.07, -0.14, '#050608');
  dot(1.17, -0.27, 0.025, '#0a0b0d');
  stripes(ctx, X(1.05), Z(-0.22), X(0.97) - X(1.05), Z(-0.31) - Z(-0.22), 3);
  // The park brake's placard: a plate with two lines of lettering (drawn as bars, the figure's words not copied).
  rect(-0.91, -1.15, 0.2, 0.12, '#25282c');
  ctx.fillStyle = '#c9ced4';
  for (const z of [0.18, 0.15]) ctx.fillRect(X(-0.94), Z(z), X(-1.12) - X(-0.94), Math.max(1, R(0.008)));
  // Placard lines.
  for (const [y, z] of [[1.2, -0.42], [0.25, -0.13]]) ctx.fillRect(X(y), Z(z), R(0.2), Math.max(1, R(0.008)));
}

/**
 * The power lever (PCL) on the left console, feet, shaped as the reference power lever shape shows it
 * and placed as the console figure draws it from above (Patrick, 11 Oct 2026: "you can do better
 * than that on the pcl. Make it accurate", then "The pcl shape still isn't right either. Make the handle exactly like
 * the picture"). Across the console (fractions, 0 its outboard edge): the lever's slot at `stem.across`, the quadrant's
 * hood inboard of it carrying MAX at its forward end and the friction adjust tab at its aft end (forward cockpit only),
 * a thin cheek outboard of the slot, the flap selector's D-shaped housing inboard with its own slot. `a` is half a
 * housing's length fore and aft, `b` its height, `t` its thickness across. The lever: a flat plate (`stem`, `w` fore
 * and aft at the slot, `top` at the grip, `t` across) up out of the slot, tilting `travelDeg` each way; its top is the
 * grip's outboard end, a round-topped `flange` proud of the grip all round. The grip lies across the console reaching
 * inboard `length` from the plate, flat underneath, straight-sided and round on top (`depth` fore and aft, `height`),
 * its underside `bottom` above the console; on its inboard end the speed brake switch at the top in its ring, the ICS
 * key and the UHF/VHF key on a block below; on its forward face the rudder trim rocker and, near the plate, the ICS
 * key/mute button. The cutoff finger lift pivots on the plate's inboard face under the grip and reaches forward,
 * dropping `dropDeg`, its tip turned up `tipDeg` over the finger lift guard's tray. Sizes from the console figure's
 * width (our console's 0.48 ft) and the detail's proportions; places from the console figure. Estimates.
 */
const PCL_FT = Object.freeze({
  quadrant: { a: 0.19, b: 0.17, across: [0.29, 0.63] },
  cheek: { a: 0.17, b: 0.13, t: 0.02, across: 0.13 },
  flap: { a: 0.16, b: 0.135, t: 0.085, across: 0.8, tabDeg: 62 },
  travelDeg: 28,
  stem: { across: 0.23, w: 0.12, top: 0.165, t: 0.025 },
  grip: { depth: 0.14, height: 0.2, length: 0.34, bottom: 0.37, flange: 0.012 },
  fingerLift: { length: 0.22, width: 0.045, dropDeg: 8, tipDeg: 35 },
});

/**
 * Where the console figure puts things, as fractions: `along` 0 at a console's aft end and 1 at
 * the panel, `across` 0 at its outboard edge (left console) or inboard edge (right console), as the figure draws them
 * from above. The left console's panels, aft to forward: anti-G test, maintenance (anti-G hookup, firewall shutoff
 * handle), battery breakers, system test, canopy fracture, seat adjust, the power lever and flap selector, the left
 * forward switches with the trim indicator. The right one's, starting 0.08 of the length further forward: utility light
 * and phone jack, generator breakers, backup VHF, oxygen regulator, environmental control, the right forward switches.
 */
const CONSOLE_PANELS = Object.freeze({
  left: [[0, 0.056], [0.056, 0.21], [0.21, 0.457], [0.457, 0.506], [0.506, 0.574], [0.574, 0.617], [0.617, 0.858], [0.858, 1]],
  right: [[0.08, 0.29], [0.29, 0.556], [0.556, 0.63], [0.63, 0.716], [0.716, 0.846], [0.846, 1]],
  pclSlot: { across: [0.16, 0.29], along: [0.646, 0.761], at: 0.72 }, // the lever's slot and where the lever sits in it
  flap: { across: 0.75, along: 0.73 },
  canopyFracture: { across: 0.5, along: 0.54 },
  firewall: { across: [0.07, 0.46], along: 0.105 },
  ecsKnob: { across: 0.41, along: 0.775 },
  vhfKnob: { across: 0.52, along: 0.6 },
  utilityLight: { across: 0.37, along: 0.206 },
});

/**
 * The side consoles' tops (both seats), the console figure's layout (CONSOLE_PANELS; places read off
 * it, nothing copied): the left console in the left half (u 0 its outboard edge), the right in the right half (u 0.5 its
 * inboard edge), aft (v 0) to forward (v 1). Dark panels with screws, breaker grids, toggles, knobs and the striped
 * handles' panels; the 3D parts stand on them (seatParts). Until 11 Oct 2026 drawn by eye off Dad's pictures 17, 26, 29.
 */
function drawConsoles(ctx, width, height) {
  ctx.fillStyle = '#7d8185';
  ctx.fillRect(0, 0, width, height);
  const half = width / 2;
  const Y = (v) => (1 - v) * height;
  const XL = (f) => half * f, XR = (f) => half * (1 + f);
  const panel = (X, v0, v1) => {
    ctx.fillStyle = '#25282c';
    ctx.fillRect(X(0.04), Y(v1) + 2, X(0.96) - X(0.04), Y(v0) - Y(v1) - 4);
    screws(ctx, X(0.04), Y(v1) + 2, X(0.96) - X(0.04), Y(v0) - Y(v1) - 4, half * 0.05, Math.max(1.5, half * 0.018));
  };
  const breakers = (X, v0, v1, cols, rows) => {
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = X(0.16 + (0.68 * i) / (cols - 1)), y = Y(v0 + ((v1 - v0) * (j + 0.6)) / (rows + 0.2));
      ctx.fillStyle = '#5c6066'; ctx.beginPath(); ctx.arc(x, y, half * 0.045, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a0b0d'; ctx.beginPath(); ctx.arc(x, y, half * 0.03, 0, Math.PI * 2); ctx.fill();
    }
  };
  const P = CONSOLE_PANELS, tr = half * 0.03;
  // Left console.
  for (const [v0, v1] of P.left) panel(XL, v0, v1);
  ctx.fillStyle = '#0a0b0d'; ctx.beginPath(); ctx.arc(XL(0.5), Y(0.028), half * 0.08, 0, Math.PI * 2); ctx.fill(); // anti-G test
  ctx.fillStyle = '#3a3e43'; ctx.beginPath(); ctx.arc(XL(0.75), Y(0.17), half * 0.15, 0, Math.PI * 2); ctx.fill(); // anti-G hookup
  ctx.fillStyle = '#0a0b0d'; ctx.beginPath(); ctx.arc(XL(0.75), Y(0.17), half * 0.1, 0, Math.PI * 2); ctx.fill();
  stripes(ctx, XL(P.firewall.across[0]), Y(0.142), XL(P.firewall.across[1]) - XL(P.firewall.across[0]), Y(0.068) - Y(0.142), 4);
  breakers(XL, 0.22, 0.45, 6, 9);
  for (const f of [0.2, 0.4, 0.6, 0.8]) toggle(ctx, XL(f), Y(0.48), tr);
  stripes(ctx, XL(0.06), Y(0.57), XL(0.94) - XL(0.06), Y(0.51) - Y(0.57), 6); // canopy fracture
  toggle(ctx, XL(0.8), Y(0.595), tr); // seat adjust
  ctx.fillStyle = '#050608'; ctx.fillRect(XL(P.pclSlot.across[0]), Y(P.pclSlot.along[1]), XL(P.pclSlot.across[1]) - XL(P.pclSlot.across[0]), Y(P.pclSlot.along[0]) - Y(P.pclSlot.along[1]));
  ctx.fillStyle = '#16181b'; ctx.fillRect(XL(0.84), Y(0.77), XL(0.95) - XL(0.84), Y(0.69) - Y(0.77)); // the flap gate
  for (const v of [0.705, 0.73, 0.755]) { ctx.fillStyle = '#c9ced4'; ctx.fillRect(XL(0.86), Y(v), XL(0.93) - XL(0.86), 2); }
  ctx.fillStyle = '#0a0b0d'; ctx.fillRect(XL(0.25), Y(0.995), XL(0.75) - XL(0.25), Y(0.955) - Y(0.995)); // the trim indicator
  ctx.strokeStyle = '#e9edf0'; ctx.lineWidth = 2;
  for (const f of [0.35, 0.5, 0.65]) { ctx.beginPath(); ctx.moveTo(XL(f - 0.05), Y(0.975)); ctx.lineTo(XL(f + 0.05), Y(0.975)); ctx.stroke(); }
  for (const f of [0.3, 0.5, 0.7]) knob(ctx, XL(f), Y(0.93), half * 0.04);
  for (const f of [0.2, 0.37, 0.54, 0.71]) toggle(ctx, XL(f), Y(0.89), tr);
  stripes(ctx, XL(0.8), Y(0.92), XL(0.96) - XL(0.8), Y(0.87) - Y(0.92), 3); // the trim disconnect
  // Right console.
  for (const [v0, v1] of P.right) panel(XR, v0, v1);
  ctx.fillStyle = '#0a0b0d'; ctx.beginPath(); ctx.arc(XR(0.35), Y(0.26), half * 0.06, 0, Math.PI * 2); ctx.fill(); // phone jack
  ctx.fillStyle = '#5c6066'; ctx.beginPath(); ctx.arc(XR(0.75), Y(0.25), half * 0.08, 0, Math.PI * 2); ctx.fill();
  breakers(XR, 0.3, 0.545, 5, 9);
  ctx.fillStyle = '#4b5056'; ctx.fillRect(XR(0.15), Y(0.62), XR(0.75) - XR(0.15), Y(0.565) - Y(0.62)); // backup VHF window
  ctx.fillStyle = '#16181b'; ctx.fillRect(XR(0.1), Y(0.705), XR(0.55) - XR(0.1), Y(0.66) - Y(0.705)); // oxygen flow window
  for (const f of [0.68, 0.85]) toggle(ctx, XR(f), Y(0.675), tr);
  for (const f of [0.15, 0.7]) toggle(ctx, XR(f), Y(0.8), tr);
  stripes(ctx, XR(0.8), Y(0.84), XR(0.96) - XR(0.8), Y(0.78) - Y(0.84), 3); // a guarded switch
  for (const f of [0.15, 0.35, 0.55, 0.75]) toggle(ctx, XR(f), Y(0.95), tr);
  for (const f of [0.15, 0.35, 0.55]) toggle(ctx, XR(f), Y(0.88), tr);
  knob(ctx, XR(0.8), Y(0.88), half * 0.04);
  ctx.fillStyle = '#c9ced4';
  for (const [x, v] of [[XL(0.1), 0.2], [XL(0.1), 0.47], [XL(0.1), 0.85], [XR(0.1), 0.555], [XR(0.1), 0.84], [XR(0.1), 0.98]]) ctx.fillRect(x, Y(v), half * 0.4, 2);
}

/** The live faces, each into its window of the shared picture. */
function drawLive(ctx, hud) {
  ctx.clearRect(0, 0, ATLAS.width, ATLAS.height);
  for (const [kind, win] of Object.entries(LIVE_WINDOWS)) drawInstrument(ctx, kind, win, hud ?? {});
}

/** The live engine displays and caution panel (liveEngine), each into its window, from `engine` (null shows them as the static picture does). */
function drawEngineLive(ctx, engine) {
  ctx.clearRect(0, 0, ATLAS.width, ATLAS.height);
  for (const [name, win] of Object.entries(ENGINE_WINDOWS)) {
    if (name === 'annun') annunciatorPanel(ctx, win, engine ? new Set(engine.lights ?? []) : null);
    else engineDisplay(ctx, screen(ctx, win.x, win.y, win.w, win.h, '#050709'), name, engine ?? null);
  }
}

/** The live engine numbers, rounded to what the displays show, as a key: a change smaller than this doesn't redraw them. */
function engineKey(engine) {
  if (!engine) return 'none';
  const r = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : 'x');
  return [...Object.keys(ENGINE_LIVE).map((k) => r(engine[k])), [...(engine.lights ?? [])].sort().join(',')].join('|');
}

/** What the panel shows, rounded to what it can show: a change smaller than this doesn't redraw it. */
function panelKey(hud) {
  if (!hud) return 'none';
  const r = (x, step) => (Number.isFinite(x) ? Math.round(x / step) : 'x');
  return [r(hud.pitchDeg, 0.5), r(hud.bankDeg, 0.5), r(hud.kias, 1), r(hud.altFt, 1), r(hud.headingDeg, 1), r(hud.g, 0.1), r(hud.vsFpm, 10), hud.speedBrake === true].join('|');
}

// ---------- the 3D parts ----------

/** A box from its corners (feet). */
function box(THREE, x0, x1, y0, y1, z0, z1) {
  return new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** A flat face in the plane x = const facing aft (feet), from an outline of [y, z] points, with uv over a box. */
function flatAft(THREE, x, outline, uvBox = null) {
  const shape = new THREE.Shape(outline.map(([y, z]) => new THREE.Vector2(y, z)));
  const g = new THREE.ShapeGeometry(shape);
  const p = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const y = p.getX(i), z = p.getY(i);
    p.setXYZ(i, x, y, z);
    n.setXYZ(i, -1, 0, 0);
    if (uvBox) uv.setXY(i, (uvBox.y0 - y) / (uvBox.y0 - uvBox.y1), (z - uvBox.z0) / (uvBox.z1 - uvBox.z0));
  }
  return g;
}

/**
 * A lofted surface through sections of equal point count (each an array of [x, y, z] feet), closed round each section
 * when `closed`; with `caps`, both end sections closed with a fan. Flat-shaded, or smooth (shared corners) with `smooth`.
 */
function loft(THREE, sections, { closed = true, caps = false, smooth = false } = {}) {
  const m = sections[0].length;
  const g = new THREE.BufferGeometry();
  if (smooth) {
    const pos = sections.flat(2), idx = [];
    for (let i = 0; i + 1 < sections.length; i++) {
      for (let j = 0; j < (closed ? m : m - 1); j++) {
        const a = i * m + j, b = i * m + ((j + 1) % m), c = a + m, d = b + m;
        idx.push(a, c, d, a, d, b);
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  for (let i = 0; i + 1 < sections.length; i++) {
    const A = sections[i], B = sections[i + 1];
    for (let j = 0; j < (closed ? m : m - 1); j++) {
      const k = (j + 1) % m;
      tri(A[j], B[j], B[k]);
      tri(A[j], B[k], A[k]);
    }
  }
  if (caps) {
    for (const S of [sections[0], sections[sections.length - 1]]) {
      const c = S.reduce((s, p) => [s[0] + p[0] / m, s[1] + p[1] / m, s[2] + p[2] / m], [0, 0, 0]);
      for (let j = 0; j < m; j++) tri(c, S[j], S[(j + 1) % m]);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Corner-cutting smoothing of an open polyline (points as number arrays), keeping its two ends. */
function chaikin(pts, iterations = 2) {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    const q = [p[0]];
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i], b = p[i + 1];
      q.push(a.map((v, j) => 0.75 * v + 0.25 * b[j]), a.map((v, j) => 0.25 * v + 0.75 * b[j]));
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

/** A round tube through points (feet): straight runs, or a smooth curve through them with `smooth`. */
function tubeThrough(THREE, pts, radius, segments = 64, { smooth = false, radial = 6 } = {}) {
  const v = pts.map((q) => new THREE.Vector3(...q));
  let path;
  if (smooth) path = new THREE.CatmullRomCurve3(v, false, 'centripetal');
  else {
    path = new THREE.CurvePath();
    for (let i = 0; i + 1 < v.length; i++) path.add(new THREE.LineCurve3(v[i], v[i + 1]));
  }
  return new THREE.TubeGeometry(path, segments, radius, radial, false);
}

/**
 * A coaming's half-outline across y at station x, from the middle out (feet, [y, z] pairs, before the glass clamp): a
 * flat top, shoulders falling to the panel's straight sides (at the aft edge they follow the panel's tombstone, the
 * rail's line), then a short skirt (TS-157).
 */
function hoodHalf(h, ts, x) {
  const t = clamp01((x - h.aftX) / (h.foreX - h.aftX));
  const crown = crownZ(h, x);
  const out = h.railOut ?? RIM_FT.sideOut;
  const topY = ts.top + out * 0.4 + h.topGrow * t;
  const sideY = ts.side + out + h.sideGrow * t;
  const drop = h.top - ts.shoulderZ + h.dropGrow * t;
  const pts = [[0, crown], [topY, crown]];
  for (let k = 1; k <= 6; k++) {
    const s = k / 6;
    pts.push([lerp(topY, sideY, s), crown - drop * s ** (h.diagPow ?? 1.15)]);
  }
  pts.push([sideY + 0.01, crown - drop - h.skirt]);
  return pts;
}
/**
 * The front coaming's side at station x (GLARESHIELD_FT.cheeks), from its top's edge out and down to the canopy's
 * sill, bulging 0.08 ft: [y, z] feet, the left half.
 */
function cheekHalf(h, ts, x) {
  const c = ct156CanopySection(x / F);
  const [y0, z0] = insideGlass(x, ...hoodHalf(h, ts, x)[1]);
  // Its outer edge just outside and under the glass's foot ahead of the sill rail (so no skin shows past it), and over
  // the rail (0.07 ft round) from 0.15 ft ahead of the rail's front end aft, so the rail runs in under it and its end
  // doesn't show (Patrick, 11 Oct 2026, the corner "still doesnt look quite right").
  const over = clamp01((CT156_RAIL_FORE_X * F + 0.45 - x) / 0.3);
  // Never inboard of the top's edge, where the windscreen narrows to its point, so the side doesn't fold back over the top.
  const y1 = Math.max(y0, c.w * F + lerp(0.02, -0.07, over)), z1 = c.base * F + lerp(-0.02, 0.08, over);
  const bulge = 0.08 * clamp01((x - h.aftX) / 0.4); // none at the aft edge, so its end is a thin line, not a slab
  return Array.from({ length: 7 }, (_, k) => insideGlass(x, lerp(y0, y1, k / 6), lerp(z0, z1, k / 6) + bulge * Math.sin((Math.PI * k) / 6)));
}
/**
 * The lower panel's half-width, feet: as wide as the main face (1.15 ft) at its top, flaring out to 1.27 ft over the
 * first 0.43 ft down and then straight to the consoles (Patrick, 12 Oct 2026; it was 1.25 ft all the way down). Its
 * picture's places were laid out with the main face's bottom 0.22 ft up (`laidOutAt`); they rise with the panel.
 */
const LOWER_PANEL_FT = Object.freeze({ halfWidth: 1.27, top: 1.15, flare: 0.43, laidOutAt: 0.22 });
/** A coaming's surface height at (x, y), feet (for standing things on it), on its sides too where it has them. */
function hoodZ(h, ts, x, y) {
  const top = hoodTopZ(h, ts, x, y);
  if (!h.cheeks) return top;
  const half = cheekHalf(h, ts, x), ay = Math.abs(y);
  for (let i = 1; i < half.length; i++) {
    if (ay <= half[i][0] && ay >= half[i - 1][0]) return Math.max(top, lerp(half[i - 1][1], half[i][1], (ay - half[i - 1][0]) / (half[i][0] - half[i - 1][0] || 1)));
  }
  return top;
}
function hoodTopZ(h, ts, x, y) {
  const half = hoodHalf(h, ts, x);
  const ay = Math.abs(y);
  for (let i = 1; i < half.length; i++) {
    if (ay <= half[i][0]) {
      const [y0, z0] = half[i - 1], [y1, z1] = half[i];
      return lerp(z0, z1, (ay - y0) / (y1 - y0 || 1));
    }
  }
  return half[half.length - 1][1];
}
/**
 * A point of a coaming's outline at station x, [y, z] feet, kept inside the glass: where it would stand outside the
 * glass, it drops onto the glass's foot instead of being pulled in towards the middle, so where the windscreen narrows
 * to its point the coaming runs out under the windscreen's frame and the fuselage's top rather than folding into spikes
 * (Patrick, 12 Oct 2026, "fix how the top of the glare shield ... interaction with the fusilage/canopy works").
 */
function insideGlass(x, y, z, inset = 0.04) {
  if (y <= glassHalfWidthFt(z, x, inset)) return [y, z];
  return [y, Math.min(z, ct156CanopySection(x / F).base * F - 0.01)];
}
/** A coaming's full section at x (left skirt over to right skirt), [x, y, z] feet, kept inside the glass, lowered by dz. */
function hoodSection(h, ts, x, dz = 0) {
  const half = hoodHalf(h, ts, x).map(([y, z]) => { const [cy, cz] = insideGlass(x, y, z); return [cy, cz + dz]; });
  return [...half.slice(1).reverse().map(([y, z]) => [x, y, z]), [x, 0, half[0][1]], ...half.slice(1).map(([y, z]) => [x, -y, z])];
}

/** An arch outline in the plane (y, z) between y0 and y1 (y0 > y1), up from zBottom to zTop with rounded corners of radius r. */
function archOutline(y0, y1, zBottom, zTop, r) {
  const pts = [[y0, zBottom], [y0, zTop - r]];
  for (let k = 1; k < 4; k++) { const a = (k / 4) * (Math.PI / 2); pts.push([y0 - r + r * Math.cos(a), zTop - r + r * Math.sin(a)]); }
  pts.push([y0 - r, zTop], [y1 + r, zTop]);
  for (let k = 1; k < 4; k++) { const a = Math.PI / 2 + (k / 4) * (Math.PI / 2); pts.push([y1 + r + r * Math.cos(a), zTop - r + r * Math.sin(a)]); }
  pts.push([y1, zTop - r], [y1, zBottom]);
  return pts;
}

/**
 * A band lining the glass at x = b.bandX facing aft (feet): from just inside the glass b.bandDepth inward, sill to sill,
 * with rows of round dark dots (the forward bow's ring of holes, TS-156; the arch's fasteners, TS-157) and a dark tube
 * along its inner edge. Returns { band, dots, tube }.
 */
function bandGeometries(THREE, b) {
  const n = 48;
  const pts = ct156HoopPoints(b.bandX / F, n, 0, b.lean ?? 0);
  const base = ct156CanopySection(b.bandX / F).base * F;
  const inward = ({ x, y, z }, d) => {
    const dy = -y * F, dz = base - z * F;
    const l = Math.hypot(dy, dz) || 1;
    return [x * F, y * F + (dy / l) * d, z * F + (dz / l) * d];
  };
  const outer = pts.map((q) => inward(q, b.glassInset)), inner = pts.map((q) => inward(q, b.glassInset + b.bandDepth));
  let band = null, tube = null;
  let recess = null;
  const studs = [];
  if (b.channel) {
    // A channel open aft: two lips from the aft face forward `deep`, one along the glass and one at the band's inner
    // edge, joined by its back, all closed, so it keeps its size from any eye (Patrick, 12 Oct 2026, "the canopy rail
    // gets thin as soon as I move my head"), with a dark recess just aft of the back and studs standing out of it.
    const { deep, lip, back } = b.channel, d0 = b.glassInset, d1 = d0 + b.bandDepth, k = deep - back;
    const ring = [[0, d0], [deep, d0], [deep, d1], [0, d1], [0, d1 - lip], [k, d1 - lip], [k, d0 + lip], [0, d0 + lip]];
    const hoop = (dx) => {
      const x = b.bandX + dx, bs = ct156CanopySection(x / F).base * F;
      return ct156HoopPoints(x / F, n, 0, b.lean ?? 0).map(({ x: hx, y, z }) => {
        const dy = -y * F, dz = bs - z * F, l = Math.hypot(dy, dz) || 1;
        return (d) => [hx * F, y * F + (dy / l) * d, z * F + (dz / l) * d];
      });
    };
    const hoops = new Map([0, deep, k, k - 0.002].map((dx) => [dx, hoop(dx)]));
    band = loft(THREE, pts.map((_, j) => ring.map(([dx, d]) => hoops.get(dx)[j](d))), { closed: true });
    const rec = hoops.get(k - 0.002);
    recess = loft(THREE, [pts.map((_, j) => rec[j](d0 + lip)), pts.map((_, j) => rec[j](d1 - lip))], { closed: false });
    // The studs: evenly spaced by length along the recess's middle line, half a spacing in from each sill.
    if (b.studs) {
      const { n: ns, r, head, len } = b.studs, mid = pts.map((_, j) => rec[j]((d0 + d1) / 2));
      const along = [0];
      for (let j = 1; j < mid.length; j++) along.push(along[j - 1] + Math.hypot(...[0, 1, 2].map((i) => mid[j][i] - mid[j - 1][i])));
      const total = along[along.length - 1];
      for (let q = 0; q < ns; q++) {
        const want = ((q + 0.5) / ns) * total;
        let j = 1;
        while (j < along.length - 1 && along[j] < want) j++;
        const t = (want - along[j - 1]) / (along[j] - along[j - 1] || 1);
        const [x, y, z] = [0, 1, 2].map((i) => mid[j - 1][i] + (mid[j][i] - mid[j - 1][i]) * t);
        studs.push(new THREE.CylinderGeometry(r, r, len, 10).rotateZ(Math.PI / 2).translate(x - len / 2, y, z));
        studs.push(new THREE.CylinderGeometry(head, head, 0.012, 12).rotateZ(Math.PI / 2).translate(x - len, y, z));
      }
    }
  } else {
    band = loft(THREE, [outer, inner], { closed: false });
    if (b.tubeR > 0) tube = tubeThrough(THREE, inner, b.tubeR, 60, { smooth: true, radial: 5 });
  }
  const dots = [];
  for (const row of b.dots) {
    // Evenly spaced by length along the row's line, half a spacing in from each sill.
    const mid = pts.map((q) => inward(q, b.glassInset + b.bandDepth * row.at));
    const along = [0];
    for (let j = 1; j < mid.length; j++) along.push(along[j - 1] + Math.hypot(mid[j][1] - mid[j - 1][1], mid[j][2] - mid[j - 1][2]));
    const total = along[along.length - 1];
    for (let k = 0; k < row.n; k++) {
      const want = ((k + 0.5) / row.n) * total;
      let j = 1;
      while (j < along.length - 1 && along[j] < want) j++;
      const t = (want - along[j - 1]) / (along[j] - along[j - 1] || 1);
      const [x, y, z] = [0, 1, 2].map((i) => mid[j - 1][i] + (mid[j][i] - mid[j - 1][i]) * t);
      dots.push(new THREE.CircleGeometry(row.dia / 2, 16).rotateY(-Math.PI / 2).translate(x - 0.004, y, z));
    }
  }
  return { band, dots, tube, recess, studs };
}

/**
 * The forward bow's two mirrors (Patrick, 11 Oct 2026, with a picture from the back seat: "they are the wrong shape and
 * in the wrong spot", on the front canopy bow, and "the mirror should cover the canopy rail not hang down"; TS-157 had
 * put flat ones on the side frames): curved strips on the bow's aft face, about 10 and 2 o'clock, each spanning `spans`
 * of the bow from the left sill (0) to the right (1), covering the bow from the glass to the far side of its inner tube
 * and no further, `aft` feet behind the band. Sizes estimates judged off the picture.
 */
const BOW_MIRRORS = Object.freeze({ spans: Object.freeze([[0.18, 0.4], [0.6, 0.82]]), aft: 0.02 });
// Since 12 Oct 2026 (Patrick's mirror photo) longer, each from about 10 and 2 o'clock up to near the crest with a short
// gap between, round-ended (they were [0.22, 0.35] and [0.65, 0.78], square-ended). Since the bow became a channel (12 Oct 2026) 0.02 ft behind its aft face (was 0.04).

/** One of the forward bow's curved mirrors between bow fractions t0 and t1 (BOW_MIRRORS), as { frame, face } (feet). */
function bowMirrorGeometries(THREE, b, t0, t1) {
  const n = 480; // fine enough for the round ends to show (48 until Patrick, 12 Oct 2026, "should have rounded ends")
  const pts = ct156HoopPoints(b.bandX / F, n, 0, b.lean ?? 0).slice(Math.round(t0 * n), Math.round(t1 * n) + 1);
  const base = ct156CanopySection(b.bandX / F).base * F;
  const at = ({ x, y, z }, d, dx) => {
    const dy = -y * F, dz = base - z * F, l = Math.hypot(dy, dz) || 1;
    return [x * F - dx, y * F + (dy / l) * d, z * F + (dz / l) * d];
  };
  const d0 = b.glassInset, d1 = b.glassInset + b.bandDepth + 2 * b.tubeR, { aft } = BOW_MIRRORS;
  // Round ends: near each end the strip narrows about its middle line as a half circle across its depth.
  const len = [0];
  for (let j = 1; j < pts.length; j++) len.push(len[j - 1] + Math.hypot(pts[j].y - pts[j - 1].y, pts[j].z - pts[j - 1].z) * F);
  const half = (d1 - d0) / 2 + 0.012, mid = (d0 + d1) / 2;
  const w = (j) => { const e = Math.min(len[j], len[len.length - 1] - len[j]); return e >= half ? 1 : Math.sqrt(Math.max(0, 1 - ((half - e) / half) ** 2)); };
  const edge = (sgn, grow, dx) => pts.map((q, j) => at(q, mid + sgn * (half - 0.012 + grow) * Math.max(w(j), 0.05), dx));
  const frame = loft(THREE, [edge(-1, 0.012, aft - 0.005), edge(1, 0.012, aft - 0.005)], { closed: false });
  const face = loft(THREE, [edge(-1, 0, aft), edge(1, 0, aft)], { closed: false });
  return { frame, face };
}

/** The canopy's side frames inside the glass, both sides, from the forward bow to the rear frame, with their fasteners (TS-157). */
function sideFrameParts(THREE) {
  const x0 = FORWARD_BOW_FT.bandX, x1 = CT156_FRAME_X[2] * F + 0.2, N = 28;
  const { height, thick, foot, pitch } = SIDE_FRAME_FT;
  const frames = [], nubs = [];
  const glassAt = (x, z) => Math.min(glassHalfWidthFt(z, x, 0.006), ct156CanopySection(x / F).w * F);
  for (const s of [1, -1]) {
    const sections = [];
    for (let i = 0; i <= N; i++) {
      const x = lerp(x0, x1, i / N);
      const base = ct156CanopySection(x / F).base * F + 0.004;
      const yb = glassAt(x, base + 0.001), yt = glassAt(x, base + height);
      sections.push([[x, s * yb, base], [x, s * yt, base + height], [x, s * (yt - thick), base + height], [x, s * (yb - foot), base]]);
    }
    frames.push(loft(THREE, sections, { closed: true }));
    for (let x = x0 - pitch / 2; x > x1; x -= pitch) {
      const base = ct156CanopySection(x / F).base * F, z = base + height / 2;
      const y = s * ((glassAt(x, base + 0.005) - foot + glassAt(x, base + height) - thick) / 2 - 0.006);
      nubs.push(new THREE.CylinderGeometry(SIDE_FRAME_FT.boltR, SIDE_FRAME_FT.boltR, 0.012, 10).translate(x, y, z));
    }
  }
  return { frames, nubs };
}

/** Where the forward bow's foot stands on side s (+1 left, -1 right), feet: [x, y, z], on the canopy's sill. */
function bowFoot(s) {
  const b = FORWARD_BOW_FT, pts = ct156HoopPoints(b.bandX / F, 32, 0, b.lean);
  const q = s > 0 ? pts[0] : pts[pts.length - 1];
  return [q.x * F, q.y * F, ct156CanopySection(q.x).base * F];
}
/**
 * The forward bow's rounded joins into the canopy's lower frame (FORWARD_BOW_FT.footFillet): each side a light web as
 * thick as the frame, filling the corner between the bow's aft edge and the frame's top with a concave quarter circle.
 * [geometry, slot] pairs.
 */
function bowFootParts(THREE) {
  if (!FORWARD_BOW_FT.footFillet) return []; // since 12 Oct 2026 the legs run straight into the lower frame
  const { r } = FORWARD_BOW_FT.footFillet, t = FORWARD_BOW_FT.glassInset + FORWARD_BOW_FT.bandDepth + 0.01, out = [];
  for (const s of [1, -1]) {
    // Where the bow's aft edge crosses the frame's top (z0) and how fast it runs forward going up (lean).
    const z0 = bowFoot(s)[2] + SIDE_FRAME_FT.height, b = FORWARD_BOW_FT;
    const hoop = ct156HoopPoints(b.bandX / F, 64, 0, b.lean).map((q) => [q.x * F, q.y * F, q.z * F]);
    const side = s > 0 ? hoop : hoop.slice().reverse();
    const atZ = (zz) => {
      const k = side.findIndex((q) => q[2] >= zz), [a, c] = [side[k - 1], side[k]], u = (zz - a[2]) / (c[2] - a[2]);
      return [lerp(a[0], c[0], u), lerp(a[1], c[1], u)];
    };
    const [x, y] = atZ(z0), lean = (x - atZ(z0 + r)[0]) / r;
    const sh = new THREE.Shape();
    sh.moveTo(x, z0); sh.lineTo(x - r, z0); sh.absarc(x - r, z0 + r, r, -Math.PI / 2, 0, false); sh.lineTo(x, z0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: t - 0.01, bevelEnabled: false, curveSegments: 12 }).rotateX(Math.PI / 2);
    g.translate(0, s > 0 ? Math.abs(y) - 0.01 : -Math.abs(y) + t, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) - lean * (pos.getZ(i) - z0));
    g.computeVertexNormals();
    out.push([g, SLOT.band]);
  }
  return out;
}
/**
 * The canopy's handle on the left lower frame just aft of the forward bow (Patrick, 12 Oct 2026, from his photo): a
 * black triangular handle, its open loop hanging from a pivot pin and hub near the frame's top by the bow, on a light
 * placard plate, and two round knobs on the frame ahead of it by the bow's foot. Sizes estimates. [geometry, slot] pairs.
 */
function canopyHandleParts(THREE) {
  const [fx0, fy, fz] = bowFoot(1), y = fy - SIDE_FRAME_FT.thick - 0.05, out = [];
  const px = fx0 - 0.2, pz = fz + SIDE_FRAME_FT.height - 0.06; // the pivot
  const loop = [[px, y, pz], [px - 0.55, y, pz - 0.2], [px - 0.08, y, pz - 0.4], [px, y, pz]];
  out.push([tubeThrough(THREE, loop, 0.025, 3, { radial: 6 }), SLOT.black]);
  out.push([new THREE.CylinderGeometry(0.045, 0.045, 0.04, 14).translate(px, y + 0.01, pz), SLOT.black]);
  out.push([new THREE.CylinderGeometry(0.014, 0.014, 0.08, 8).translate(px, y - 0.01, pz), SLOT.metal]);
  out.push([box(THREE, px - 0.6, px - 0.05, y + 0.03, y + 0.034, pz - 0.15, pz - 0.02), SLOT.knob]);
  for (const k of [0, 1]) out.push([new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12).translate(fx0 - 0.04 - k * 0.09, y + 0.02, fz + 0.12), SLOT.black]);
  return out;
}

/** The sill bands, both sides, from the forward bow to the rear bow (feet): 0.2 ft inside the canopy's foot, and out over the cut edge. */
function sillGeometry(THREE) {
  const x0 = CT156_FRAME_X[0] * F, x1 = CT156_FRAME_X[2] * F, N = 20;
  const parts = [];
  for (const s of [1, -1]) {
    const sections = [];
    for (let i = 0; i <= N; i++) {
      const x = x0 + ((x1 - x0) * i) / N;
      const c = ct156CanopySection(x / F);
      const w = c.w * F, z = c.base * F + 0.006;
      sections.push([[x, s * (w + 0.35), z], [x, s * (w - 0.2), z]]); // out past the glass, over the fuselage's cut edge
    }
    parts.push(loft(THREE, sections, { closed: false }));
  }
  return parts;
}

/** An air vent at a panel's upper corner (Dad's pictures 26, 27): a dark housing turned toward the seat with four slats. */
function ventParts(THREE, x, y, z, put, SLOT) {
  const s = Math.sign(y);
  const turn = (g) => g.rotateZ(s * rad(-35)).translate(x, y, z);
  put(turn(box(THREE, -0.04, 0.06, -0.13, 0.13, -0.08, 0.08)), SLOT.dark);
  for (let k = 0; k < 4; k++) put(turn(box(THREE, -0.05, -0.04, -0.11, 0.11, -0.055 + k * 0.037, -0.045 + k * 0.037)), SLOT.black);
}

// Material slots for the joined solid parts.
const SLOT = Object.freeze({
  grey: 0, black: 1, rail: 2, red: 3, mirror: 4, knob: 5, lampRed: 6, lampAmber: 7, lampGreen: 8, band: 9, seat: 10,
  dark: 11, green: 12, metal: 13, frame: 14,
});

/**
 * The cockpit parts of one seat (dx FRONT_DX the front, REAR_DX the rear: how far its seat's parts move from SEAT_FT's
 * stations), as { geometry, materials } entries for ct156JoinGeometries, plus what the textured faces need.
 */
/**
 * A display's frame (Patrick's CT-156 photo): a rounded rectangle `pad` feet wide round a screen of half-size hw by hh
 * centred at (yc, zc), 0.035 ft proud of the face at x (its back), its edges bevelled, open over the screen.
 */
function displayFrame(THREE, x, yc, zc, hw, hh, pad) {
  const bev = 0.006, depth = 0.035 - 2 * bev;
  const rect = (w, h, r) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w + r, -h); sh.lineTo(w - r, -h); sh.quadraticCurveTo(w, -h, w, -h + r); sh.lineTo(w, h - r);
    sh.quadraticCurveTo(w, h, w - r, h); sh.lineTo(-w + r, h); sh.quadraticCurveTo(-w, h, -w, h - r); sh.lineTo(-w, -h + r);
    sh.quadraticCurveTo(-w, -h, -w + r, -h);
    return sh;
  };
  const outer = rect(hw + pad - bev, hh + pad - bev, pad * 1.2);
  outer.holes.push(rect(hw + bev, hh + bev, pad * 0.4));
  const g = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 4 });
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, x - depth - bev + pos.getZ(i), yc + pos.getX(i), zc + pos.getY(i));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function seatParts(THREE, { dx, front, p, h, eye }) {
  const parts = [], striped = [], consoleTops = [], lower = [], cards = [];
  // Parts drawn while `tag` is set belong to that named part (seat, pcl, stick; the rest are 'body'), which the Blender cockpit replaces.
  let tag = null;
  const put = (geometry, slot) => parts.push({ geometry, materials: [slot], name: tag });
  const ts = tombstone(p);
  const faceW = 2 * ts.side, faceH = ts.height;
  const zOf = (v) => p.bottom + v * faceH;
  const yOf = (u) => ts.side * (1 - 2 * u);
  const S = SEAT_FT;
  const fx = (x) => x + dx; // a front-seat station moved to this seat

  // The panel's back and edges: a shallow black box behind the face, so it reads solid from any side.
  put(box(THREE, p.x + 0.01, p.x + 0.12, -ts.side, ts.side, p.bottom, ts.shoulderZ), SLOT.black);

  // The lower panel (TS-157; Dad's pictures 17, 26): one face from the main face's bottom to the floor, the consoles'
  // fronts cut out of its sides and the two knee wells out of its foot, with the centre pedestal between them.
  const k = S.knee, c = S.console, floor = S.floorZ;
  const wellTop = p.bottom - k.belowPanel;
  const right = archOutline(-k.inner, -k.outer, floor, wellTop, k.r), left = archOutline(k.outer, k.inner, floor, wellTop, k.r);
  const overConsole = k.outer > c.inner;
  if (overConsole) { right[right.length - 1][1] = c.top; left[0][1] = c.top; }
  const LP = LOWER_PANEL_FT, LW = Math.max(ts.side, LP.halfWidth), LT = Math.min(LP.top, LW);
  const step = (s) => (overConsole ? [] : s > 0 ? [[c.inner, floor], [c.inner, c.top]] : [[-c.inner, c.top], [-c.inner, floor]]);
  const outline = [
    [LT, p.bottom], [-LT, p.bottom], [-LW, p.bottom - LP.flare], [-LW, c.top], ...step(-1),
    ...right.slice().reverse(), ...left.slice().reverse(), ...step(1), [LW, c.top], [LW, p.bottom - LP.flare],
  ];
  lower.push(flatAft(THREE, p.x + 0.002, outline, { y0: LW, y1: -LW, z0: floor, z1: p.bottom }));
  // The knee wells' rolled trim, round each well's edge from foot to foot.
  for (const arch of [left, right]) put(tubeThrough(THREE, arch.map(([y, z]) => [p.x - 0.002, y, z]), k.trim, 48, { radial: 6 }), SLOT.dark);
  // The knee wells' dark recesses, with the rudder pedals in them.
  for (const arch of [left, right]) {
    const ys = arch.map(([y]) => y);
    const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
    put(loft(THREE, [arch.map(([y, z]) => [p.x + 0.004, y, z]), arch.map(([y, z]) => [p.x + k.depth, y, z])], { closed: false }), SLOT.black);
    put(flatAft(THREE, p.x + k.depth, arch), SLOT.black);
    // The rudder pedal: a broad black plate on its arm, as big as Patrick's CT-156 photo shows it (estimates).
    put(box(THREE, p.x + k.depth - 0.2, p.x + k.depth - 0.15, mid - 0.15, mid + 0.15, floor + 0.12, floor + 0.62), SLOT.black);
    put(box(THREE, p.x + k.depth - 0.15, p.x + k.depth, mid - 0.03, mid + 0.03, floor + 0.3, floor + 0.36), SLOT.dark);
  }
  // The park brake handle right of the right knee well, under its placard: a dark boss and a flat
  // paddle leaning inboard.
  {
    const by = -1.11, bz = p.bottom - 0.18;
    put(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 12).rotateZ(Math.PI / 2).translate(p.x - 0.025, by, bz), SLOT.black);
    put(box(THREE, -0.015, 0.015, -0.03, 0.03, 0, 0.17).rotateX(rad(-25)).translate(p.x - 0.06, by, bz - 0.02), SLOT.black);
  }

  // The coaming (TS-157): the moulded hood and its lip, smooth-shaded.
  // Sections close together at the fore end, where the windscreen narrows fast and the coaming runs out under it.
  const N = 30;
  const secs = [];
  for (let i = 0; i <= N; i++) secs.push(hoodSection(h, ts, lerp(h.aftX, h.foreX, (i / N) ** 0.8)));
  put(loft(THREE, secs, { closed: false, smooth: true }), SLOT.black);
  // The front coaming's sides: its moulding sloping from the top's edge out and down to the canopy's sill at each
  // station, bulging 0.08 ft, outside the rail, so the narrow top leaves no gap onto the windscreen's foot or the
  // fuselage's inside
  // (Patrick's CT-156 cockpit photo, 11 Oct 2026: the dark glareshield sweeps out to the sills behind the rim).
  if (h.cheeks) {
    for (const side of [1, -1]) {
      const rows = secs.map((sec) => cheekHalf(h, ts, sec[0][0]).map(([y, z]) => [sec[0][0], side * y, z]));
      put(loft(THREE, rows, { closed: false }), SLOT.black);
      // Its aft face, between the rail's line and the side's first section, so nothing shows under the side's edge.
      const edge = rows[0].map(([, y, z]) => [Math.abs(y), z]);
      const hood = hoodHalf(h, ts, h.aftX).slice(1);
      put(flatAft(THREE, h.aftX + 0.002, [...edge, ...hood.slice(1).reverse()].map(([y, z]) => [side * y, z])), SLOT.black);
    }
  }
  // The lip under the coaming's aft edge: a small one in the front seat, over the three lamps (Patrick, 12 Oct 2026,
  // from his cockpit photo; it went with the panel's rise), the rear hump's own.
  const lipDrop = h.lipDrop;
  if (lipDrop > 0) put(loft(THREE, [hoodSection(h, ts, h.aftX), hoodSection(h, ts, h.aftX, -lipDrop)], { closed: false }), SLOT.black);
  // The three lamps under the rail (Dad's pictures 17, 18, 26; AETCMAN 11-248 Fig 2.7): the
  // panel layout's master warning panel, MASTER WARN red on the left, MASTER CAUTION amber in the
  // middle and FIRE red on the right (was amber). Rear seat: centred over the EADI, 1.4 in apart on a light strip
  // (Patrick, 11 Oct 2026: "the three lights above the eadi are misaligned"). Front seat (Patrick, 12 Oct 2026, from his
  // cockpit photo): tucked under the small lip, MASTER WARN and MASTER CAUTION two oblong lamps side by side in one
  // housing, FIRE a separate square box to their right. Each lamp: [y, slot, lens half-width, lens half-height].
  const lx = h.aftX - 0.003, lz = front ? h.top - RIM_FT.r - LAMP_STRIP_FT / 2 : h.top - lipDrop / 2 - 0.015;
  const lamps = front
    ? [[0.19, SLOT.lampRed, 0.035, 0.017], [0, SLOT.lampAmber, 0.035, 0.017], [-0.25, SLOT.lampRed, 0.021, 0.021]]
    : [[0.16, SLOT.lampRed, 0.042, 0.025], [0, SLOT.lampAmber, 0.042, 0.025], [-0.16, SLOT.lampRed, 0.042, 0.025]];
  if (front) {
    // On a grey strip across the panel's top under the lip, each in its own housing, MASTER CAUTION 2.3 in from MASTER WARN and 3 in from FIRE, a small screw
    // either side of each oblong lamp (Patrick, 12 Oct 2026, "there is a grey surface the buttons are on" and "these
    // are more spaced out"; sizes off his photo, scaled on the lamps' width; until then 1.3 in apart in one housing,
    // the oblong lenses 1 x 0.6 in and FIRE 0.6 in square, then 1 x 0.8 in and 0.7 x 0.9 in). Since Patrick's 12 Oct
    // 2026 notes ("the right light is a box whereas the other two are rectangles", "note the size of these buttons",
    // "we should be able to see the whole EADI") the oblong lenses are 0.84 x 0.4 in and FIRE 0.5 in square, scaled off
    // his photo on the EADI's width, on a strip showing LAMP_STRIP_FT under the rail, with no lip above them.
    put(box(THREE, lx, lx + 0.012, -0.47, 0.5, h.top - RIM_FT.r - LAMP_STRIP_FT, h.top - lipDrop), SLOT.grey);
    for (const [y, , hw, hh] of lamps) {
      const m = 0.008;
      put(box(THREE, lx - 0.02, lx, y - hw - m, y + hw + m, lz - hh - m, lz + hh + m), SLOT.black);
      if (hw !== hh) for (const sy of [-1, 1]) put(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 8).rotateZ(Math.PI / 2).translate(lx - 0.003, y + sy * (hw + 0.022), lz), SLOT.metal);
    }
  } else {
    put(box(THREE, lx - 0.006, lx, -0.42, 0.42, lz - 0.045, lz + 0.045), SLOT.knob);
    for (const [y] of lamps) put(box(THREE, lx - 0.02, lx - 0.006, y - 0.055, y + 0.055, lz - 0.035, lz + 0.035), SLOT.black);
  }
  for (const [y, slot, hw, hh] of lamps) put(box(THREE, lx - 0.024, lx - 0.02, y - hw, y + hw, lz - hh, lz + hh), slot);
  // Where each lamp's face is (MASTER_LAMPS' order), for the live lamps laid just aft of them (liveEngine).
  const lampFaces = lamps.map(([y, , hw, hh]) => ({ x: lx - 0.0245, y, z: lz, w: 2 * hw, h: 2 * hh }));

  // The grab rail (the rim): along the coaming's aft edge and down the panel's sides to brackets (TS-156, TS-157).
  const rx = h.aftX - RIM_FT.aftOfGlareshield;
  const edge = hoodHalf(h, ts, h.aftX).slice(0, -1).map(([y, z]) => [Math.min(y, glassHalfWidthFt(z, rx, 0.06)), z]);
  const sideY = edge[edge.length - 1][0], lowZ = zOf(RIM_FT.lowV);
  if (front) {
    // Down the sides: from the shoulder forward onto the face's edge, ending there frontEndV up the face, each end
    // rounded off.
    const LP = LOWER_PANEL_FT, LW = Math.max(ts.side, LP.halfWidth), LT = Math.min(LP.top, LW);
    const shoulderZ = edge[edge.length - 1][1], lean = Math.tan(rad(p.leanDeg ?? 0));
    const faceX = (z) => p.x + Math.max(0, z - p.bottom) * lean - RIM_FT.r - 0.005;
    const ze = zOf(RIM_FT.frontEndV);
    const down = [[faceX(ze), sideY, ze], [lerp(faceX(ze), rx, 0.5), sideY, (ze + shoulderZ) / 2]];
    const top = [...edge.slice(1).reverse(), ...edge.slice(1).map(([y, z]) => [-y, z])].map(([y, z]) => [rx, y, z]);
    const rail = chaikin([...down, ...top, ...down.slice().reverse().map(([x, y, z]) => [x, -y, z])], 2);
    put(tubeThrough(THREE, rail, RIM_FT.r, 120, { smooth: true, radial: 7 }), SLOT.rail);
    for (const [x, y, z] of [rail[0], rail[rail.length - 1]]) put(new THREE.SphereGeometry(RIM_FT.r, 10, 8).translate(x, y, z), SLOT.rail);
    // The flat wall each side of the panel below the coaming's side, from the panel's edge out to the fuselage's
    // inside, the canopy's sill down to the console's top (Patrick, 12 Oct 2026, from his photos; until then the
    // tub's wall showed there).
    const sill = ct156CanopySection(p.x / F).base * F, wallY = ct156FuselageSection(p.x / F).halfWidth * F - 0.06;
    for (const side of [1, -1]) {
      const wall = [[LW, c.top], [wallY, c.top], [wallY, sill], [LT, sill], [LT, p.bottom], [LW, p.bottom - LP.flare]];
      put(flatAft(THREE, p.x + 0.003, wall.map(([y, z]) => [side * y, z])), SLOT.grey);
    }
  } else {
    const rail = chaikin([[sideY, lowZ], ...edge.slice(1).reverse(), ...edge.slice(1).map(([y, z]) => [-y, z]), [-sideY, lowZ]].map(([y, z]) => [rx, y, z]), 2);
    put(tubeThrough(THREE, rail, RIM_FT.r, 72, { smooth: true, radial: 7 }), SLOT.rail);
    for (const end of [rail[0], rail[rail.length - 1]]) {
      put(tubeThrough(THREE, [end, [end[0], end[1], end[2] - 0.05], [p.x, end[1] * 0.96, end[2] - 0.1]], 0.028, 6, { radial: 6 }), SLOT.rail);
    }
  }
  // The rear hump's second rail, across its top near the front (Dad's pictures 27, 29).
  if (!front) {
    const xr = lerp(h.aftX, h.foreX, 0.72);
    const top = hoodHalf(h, ts, xr).map(([y, z]) => [Math.min(y, glassHalfWidthFt(z, xr, 0.08)), z + 0.1]);
    const arc = chaikin([...top.slice(1).reverse(), ...top.slice(1).map(([y, z]) => [-y, z])].map(([y, z]) => [xr, y, z]), 2);
    put(tubeThrough(THREE, arc, 0.04, 48, { smooth: true, radial: 7 }), SLOT.rail);
  }
  // The air vents at the panel's upper corners (ventParts) are not drawn: from the seat they read as black boxes
  // either side of the glareshield, and Patrick's own cockpit frame shows only a small louvred wedge at the left
  // corner (Patrick, 11 Oct 2026 07:23Z: "just get rid of those vents for now").

  // The AOA indexer on the coaming's left and the standby compass on its right (AETCMAN 11-248 Fig 2.7, Fig 5.3, TS-156;
  // the rear one on the hump, Dad's picture 27). All unlit.
  {
    // The indexer (AOA_INDEXER_FT): a narrow upright box on a pod, its foot on this seat's eye's sight line over the
    // grab rail beside it, so all three lamps show above the rail.
    const A = AOA_INDEXER_FT;
    const ax = h.aftX + A.aheadOfEdge, ay = front ? A.y : A.yRear, hood = hoodZ(h, ts, ax, ay);
    const rx = h.aftX - RIM_FT.aftOfGlareshield, ry = (ay * (rx - eye.x)) / (ax - eye.x); // where the sight line crosses the rail
    const railTop = hoodTopZ(h, ts, h.aftX, ry) + RIM_FT.r;
    const bottom = Math.max(hood, eye.z + ((railTop - eye.z) * (ax - eye.x)) / (rx - eye.x) + A.clear);
    const top = bottom + A.tall, fx0 = ax - A.deep / 2;
    put(box(THREE, fx0, ax + A.deep / 2, ay - A.wide / 2, ay + A.wide / 2, bottom, top), SLOT.dark);
    put(box(THREE, ax - 0.02, ax + 0.02, ay - 0.02, ay + 0.02, hood - 0.03, bottom + 0.005), SLOT.metal); // its stud
    const knob = new THREE.CylinderGeometry(0.022, 0.022, 0.03, 10).translate(0, -0.015, 0); // pointing inboard (-y)
    put(knob.translate(ax + A.deep * 0.3, ay - A.wide / 2, top - 0.04), SLOT.black); // the dimmer knob
    // Three dark windows on its aft face: green chevron pointing down on top (slow), amber ring (on speed), red chevron
    // pointing up under it (fast), all unlit.
    const lamp = (i) => top - A.tall / 2 + (1 - i) * A.lampPitch;
    for (let i = 0; i < 3; i++) put(box(THREE, fx0 - 0.004, fx0, ay - A.wide / 2 + 0.012, ay + A.wide / 2 - 0.012, lamp(i) - 0.026, lamp(i) + 0.026), SLOT.black);
    for (const [i, slot, dir] of [[0, SLOT.lampGreen, -1], [2, SLOT.lampRed, 1]]) {
      for (const s of [1, -1]) {
        const arm = box(THREE, -0.002, 0.002, -0.013, 0.013, -0.004, 0.004).rotateX(-s * dir * rad(32));
        put(arm.translate(fx0 - 0.006, ay + s * 0.011, lamp(i)), slot);
      }
    }
    put(new THREE.TorusGeometry(0.013, 0.004, 5, 14).rotateY(Math.PI / 2).translate(fx0 - 0.006, ay, lamp(1)), SLOT.lampAmber);

    // The standby compass (STANDBY_COMPASS_FT): a dark ball hanging under its square flange, the flange's strap down
    // onto the coaming inboard of it, its window facing aft, the card ball floating inside (its picture turned by
    // update(hud)), and the lubber line across it.
    const C = STANDBY_COMPASS_FT;
    const cx = h.aftX + C.aheadOfEdge, cy = front ? C.y : C.yRear, cz = hoodZ(h, ts, cx, cy);
    const zc = cz + C.r + C.clear;
    const fh = C.r * C.flange, f0 = zc + C.r * 0.86, f1 = f0 + C.flangeT; // the flange's half-width, bottom and top
    // The flange: a square with rounded corners turned 45° (Patrick, 12 Oct 2026, from his photo), so a corner points
    // inboard to the strap.
    const sq = new THREE.Shape(), cr = C.cornerR, k = fh - cr;
    sq.moveTo(-k, -fh); sq.lineTo(k, -fh); sq.absarc(k, -k, cr, -Math.PI / 2, 0, false); sq.lineTo(fh, k);
    sq.absarc(k, k, cr, 0, Math.PI / 2, false); sq.lineTo(-k, fh); sq.absarc(-k, k, cr, Math.PI / 2, Math.PI, false);
    sq.lineTo(-fh, -k); sq.absarc(-k, -k, cr, Math.PI, 1.5 * Math.PI, false);
    const plate = new THREE.ExtrudeGeometry(sq, { depth: C.flangeT, bevelEnabled: false, curveSegments: 4 });
    put(plate.rotateZ(Math.PI / 4).translate(cx, cy, f0), SLOT.grey);
    for (const s of [1, -1]) put(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 8).rotateX(Math.PI / 2).translate(cx, cy + s * (fh - 0.025), f1 + 0.006), SLOT.metal); // its bolts
    const corner = Math.SQRT2 * fh - (Math.SQRT2 - 1) * cr; // how far its corner reaches inboard
    const sy = cy + corner + C.strapIn, sz = hoodZ(h, ts, cx, sy); // the strap's foot, inboard of the flange
    put(box(THREE, cx - 0.02, cx + 0.02, cy + corner - 0.02, sy + 0.005, f1 - 0.01, f1), SLOT.grey);
    put(box(THREE, cx - 0.02, cx + 0.02, sy - 0.005, sy + 0.005, sz - 0.01, f1), SLOT.grey);
    put(new THREE.CylinderGeometry(C.r * 0.47, C.r * 0.47, C.r * 0.6, 14).rotateX(Math.PI / 2).translate(cx, cy, zc - C.r * 0.95), SLOT.black); // the light under the ball
    // The case: the whole ball but its window (a round hole on the aft side, windowDeg across and 2 x cardBandDeg tall).
    const win = rad(C.windowDeg), band = rad(C.cardBandDeg);
    const phi0 = -win / 2; // SphereGeometry's phi 0 faces aft (-x) once turned upright; phi grows to the pilot's right
    const caseParts = [
      new THREE.SphereGeometry(C.r, 24, 16, phi0 + win, 2 * Math.PI - win, 0, Math.PI),
      new THREE.SphereGeometry(C.r, 10, 6, phi0, win, 0, Math.PI / 2 - band),
      new THREE.SphereGeometry(C.r, 10, 6, phi0, win, Math.PI / 2 + band, Math.PI / 2 - band),
    ];
    for (const g of caseParts) put(g.rotateX(Math.PI / 2).translate(cx, cy, zc), SLOT.black);
    // The card: a zone of a ball round its middle, the window's width, its picture the card strip.
    cards.push(new THREE.SphereGeometry(C.cardR, 24, 8, phi0, win, Math.PI / 2 - band, 2 * band).rotateX(Math.PI / 2).translate(cx, cy, zc));
    put(box(THREE, cx - C.cardR - 0.008, cx - C.cardR - 0.004, cy - 0.0015, cy + 0.0015, zc - C.cardR * Math.sin(band) - 0.004, zc + C.cardR * Math.sin(band) + 0.004), SLOT.red); // the lubber line
  }

  // The instruments' bezels standing proud of the face (Dad's pictures 17, 26): round the displays a thick rounded frame
  // with bevelled edges, as Patrick's CT-156 photo shows them (displayFrame); round the other boxes a thin square one.
  for (const inst of PANEL_INSTRUMENTS) {
    if (!inst.s && !inst.frame && inst.kind !== 'eng') continue;
    const o = outerFt(inst, faceW, faceH);
    const yc = yOf(inst.u), zc = zOf(inst.v);
    const display = inst.kind === 'eadi' || inst.kind === 'ehsi' || inst.kind === 'eng' || (inst.s && inst.d && inst.kind !== 'stby');
    if (display) {
      const pad = inst.s ? BEZEL_FT * 0.5 : BEZEL_FT;
      put(displayFrame(THREE, p.x - 0.002, yc, zc, o.w / 2, o.h / 2, pad), SLOT.dark);
      // The EADI's and EHSI's push-buttons on the frame either side of the screen (the photo; the panel
      // layout's DIM, CMP, GPS and APR), light squares: [side (+1 the pilot's left), fraction down from the top].
      const buttons = { eadi: [[1, 0.12], [1, 0.88], [-1, 0.72], [-1, 0.88]], ehsi: [[1, 0.1], [1, 0.22], [1, 0.9], [-1, 0.74], [-1, 0.9]] }[inst.kind] ?? [];
      for (const [side, at] of buttons) {
        const by = yc + side * (o.w / 2 + pad / 2), bz = zc + o.h / 2 - at * o.h, b = pad * 0.32;
        put(box(THREE, p.x - 0.044, p.x - 0.036, by - b, by + b, bz - b, bz + b), SLOT.knob);
      }
      continue;
    }
    const hw = o.w / 2 + 0.012, hh = o.h / 2 + 0.012, t = 0.024;
    const x0 = p.x - 0.03, x1 = p.x - 0.002;
    put(box(THREE, x0, x1, yc - hw, yc + hw, zc + hh - t, zc + hh), SLOT.dark);
    put(box(THREE, x0, x1, yc - hw, yc + hw, zc - hh, zc - hh + t), SLOT.dark);
    put(box(THREE, x0, x1, yc - hw, yc - hw + t, zc - hh + t, zc + hh - t), SLOT.dark);
    put(box(THREE, x0, x1, yc + hw - t, yc + hw, zc - hh + t, zc + hh - t), SLOT.dark);
  }
  // The radios' knobs standing proud of the face (Patrick, 11 Oct 2026: "the knobs in the bottom left (radio knobs)"):
  // the audio panel's (AUDIO_KNOBS), the GPS's two big ones and the radio management unit's, a dark knob with a grey cap.
  {
    const knobsOf = { audio: AUDIO_KNOBS.filter((k) => k[3]).map(([fx, fy]) => [fx, fy, 0.055]), gps: [[0.09, 0.72, 0.078], [0.91, 0.72, 0.078]], rmu: [[0.62, 0.88, 0.15]] };
    for (const inst of PANEL_INSTRUMENTS) {
      const list = knobsOf[inst.kind];
      if (!list) continue;
      const o = outerFt(inst, faceW, faceH), yc = yOf(inst.u), zc = zOf(inst.v);
      for (const [fx, fy, fr] of list) {
        const y = yc + o.w / 2 - fx * o.w, z = zc + o.h / 2 - fy * o.h, r = fr * o.w;
        put(new THREE.CylinderGeometry(r, r * 1.05, 0.05, 14).rotateZ(Math.PI / 2).translate(p.x - 0.027, y, z), SLOT.black);
        put(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.012, 10).rotateZ(Math.PI / 2).translate(p.x - 0.057, y, z), SLOT.knob);
      }
    }
  }
  // The emergency gear handle (a yellow and black T on the main face's lower left) and the landing gear handle (a lever
  // with its light wheel knob on the lower panel, left of the left knee well; Dad's pictures 17, 26, 27).
  {
    const eg = PANEL_INSTRUMENTS.find((i) => i.kind === 'emerGear');
    const y = yOf(eg.u), z = zOf(eg.v);
    striped.push(box(THREE, p.x - 0.12, p.x - 0.01, y - 0.012, y + 0.012, z - 0.012, z + 0.012), box(THREE, p.x - 0.14, p.x - 0.11, y - 0.06, y + 0.06, z - 0.018, z + 0.018));
    const gy = 1.09, gz = p.bottom - 0.27; // the handle's place on its panel
    put(box(THREE, p.x - 0.11, p.x, gy - 0.014, gy + 0.014, gz - 0.01, gz + 0.11), SLOT.metal);
    put(new THREE.CylinderGeometry(0.055, 0.055, 0.035, 16).rotateZ(Math.PI / 2).translate(p.x - 0.13, gy, gz + 0.11), SLOT.knob);
  }  // The thumbwheel in its housing at the main face's right edge and the G meter's push-to-set knob
  // at its lower right (item 33), as the panel figure draws them.
  {
    const y = yOf(0.972), z = zOf(0.43);
    put(box(THREE, p.x - 0.045, p.x, y - 0.028, y + 0.028, z - 0.08, z + 0.08), SLOT.dark);
    put(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 18).translate(p.x - 0.045, y, z), SLOT.black);
    const g = PANEL_INSTRUMENTS.find((i) => i.kind === 'g'), gd = g.d * faceW;
    put(new THREE.CylinderGeometry(0.013, 0.013, 0.025, 10).rotateZ(Math.PI / 2).translate(p.x - 0.013, yOf(g.u) - gd * 0.42, zOf(g.v) - gd * 0.42), SLOT.knob);
  }


  // The seat (Dad's pictures 26, 27, 29): a dark bucket, light grey cushion with a front roll and thigh bolsters, a
  // light grey back cushion in front of the model's seat back, the dark headbox with the canopy breakers on top,
  // harness straps lying on the cushions with a buckle, the yellow and black handle between the legs and the green
  // oxygen hose to the right console.
  const { pan, backCushion: bc, headbox: hb, breakers: br } = S;
  tag = 'seat';
  // The back, its headbox and breakers lean aft (ct156SeatRakeFt); the whole seat then rises as its helmet does.
  const leanAft = (g) => {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) - ct156SeatRakeFt(pos.getZ(i)));
    g.computeVertexNormals();
    return g;
  };
  const seatFrom = parts.length, stripedFrom = striped.length;
  put(box(THREE, fx(pan.aft), fx(pan.fore) - 0.05, -pan.halfWidth, pan.halfWidth, floor + 0.15, pan.z0), SLOT.dark);
  for (const s of [1, -1]) put(box(THREE, fx(pan.aft) - 0.1, fx(pan.fore) - 0.1, s * pan.halfWidth, s * (pan.halfWidth + 0.06), floor + 0.1, pan.z1 + 0.12), SLOT.dark);
  put(box(THREE, fx(pan.aft), fx(pan.fore) - 0.06, -pan.halfWidth + 0.02, pan.halfWidth - 0.02, pan.z0, pan.z1), SLOT.seat);
  put(new THREE.CylinderGeometry(0.075, 0.075, 2 * pan.halfWidth - 0.04, 12).translate(fx(pan.fore) - 0.075, 0, (pan.z0 + pan.z1) / 2), SLOT.seat);
  for (const s of [1, -1]) put(new THREE.SphereGeometry(1, 14, 7).scale(0.26, 0.14, 0.085).translate(fx(pan.fore) - 0.3, s * 0.33, pan.z1 + 0.01), SLOT.seat);
  put(leanAft(box(THREE, fx(pan.aft), fx(pan.aft) + bc.depth, -bc.halfWidth, bc.halfWidth, pan.z1 - 0.02, bc.z1)), SLOT.seat);
  put(leanAft(box(THREE, fx(hb.aft), fx(hb.fore), -hb.halfWidth, hb.halfWidth, hb.z0, hb.z1)), SLOT.dark);
  for (const s of [1, -1]) {
    const y = s * br.y, x = fx(hb.aft) + 0.3 - ct156SeatRakeFt(hb.z1);
    put(box(THREE, x - 0.03, x + 0.03, y - 0.025, y + 0.025, hb.z1, br.top - 0.08), SLOT.dark);
    put(new THREE.ConeGeometry(0.035, 0.08, 4).rotateX(Math.PI / 2).translate(x, y, br.top - 0.04), SLOT.dark);
  }
  put(leanAft(box(THREE, fx(hb.aft) + 0.26, fx(hb.aft) + 0.34, -br.y, br.y, hb.z1 + 0.08, hb.z1 + 0.12)), SLOT.dark); // their crossbar
  // The seat's side beams.
  for (const s of [1, -1]) put(leanAft(box(THREE, fx(pan.aft) - 0.32, fx(pan.aft) - 0.1, s * 0.5, s * 0.6, pan.z0, hb.z0 + 0.4)), SLOT.dark);
  // Harness: two shoulder straps down the back cushion, two lap belts across the cushion to a buckle.
  const bx = fx(pan.aft) + bc.depth + 0.008;
  for (const s of [1, -1]) {
    put(leanAft(box(THREE, bx, bx + 0.016, s * 0.13, s * 0.27, pan.z1 + 0.05, bc.z1 - 0.15)), SLOT.frame);
    put(box(THREE, fx(pan.aft) + 0.15, fx(pan.aft) + 0.6, s * 0.08, s * 0.45, pan.z1, pan.z1 + 0.016), SLOT.frame);
  }
  put(box(THREE, fx(pan.aft) + 0.5, fx(pan.aft) + 0.64, -0.08, 0.08, pan.z1 + 0.005, pan.z1 + 0.04), SLOT.metal);
  // The seat handle: a yellow and black loop standing at the cushion's front, a red T inside it.
  const hx = fx(pan.fore) - 0.02;
  striped.push(new THREE.TorusGeometry(0.16, 0.03, 6, 16, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(hx, 0, pan.z1 + 0.02));
  put(box(THREE, hx - 0.012, hx + 0.012, -0.012, 0.012, pan.z1, pan.z1 + 0.11), SLOT.red);
  put(box(THREE, hx - 0.015, hx + 0.015, -0.06, 0.06, pan.z1 + 0.1, pan.z1 + 0.13), SLOT.red);
  // The oxygen hose, from the cushion's front right round to the right console.
  put(tubeThrough(THREE, [[fx(pan.fore) - 0.25, -0.12, pan.z1 + 0.03], [fx(pan.fore) - 0.15, -0.42, pan.z1 + 0.06], [fx(1.45), -0.78, pan.z1 + 0.18],
    [fx(1.15), -c.inner - 0.02, c.top - 0.05]], 0.035, 36, { smooth: true, radial: 6 }), SLOT.green);
  const seatUp = front ? 0 : ct156SeatRaiseFt(1);
  if (seatUp) for (const g of [...parts.slice(seatFrom, -1).map((q) => q.geometry), ...striped.slice(stripedFrom)]) g.translate(0, 0, seatUp);
  tag = null;

  // The side consoles, from beside the seat to the panel: grey bodies, their tops pictures (drawConsoles).
  for (const s of [1, -1]) {
    put(box(THREE, fx(c.aft), p.x, s > 0 ? c.inner : -c.outer, s > 0 ? c.outer : -c.inner, floor, c.top), SLOT.grey);
    const q = flatAft(THREE, 0, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    // A unit square turned up to lie on the console top: y from inner to outer, x from aft to forward.
    const pos = q.attributes.position, uv = q.attributes.uv, nor = q.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const a = pos.getY(i), b = pos.getZ(i); // a across, b along
      pos.setXYZ(i, lerp(fx(c.aft), p.x, b), s * lerp(c.inner, c.outer, a), c.top + 0.003);
      nor.setXYZ(i, 0, 0, 1);
      uv.setXY(i, s > 0 ? 0.5 * (1 - a) : 0.5 + 0.5 * a, b);
    }
    consoleTops.push(q);
  }
  // The consoles' 3D parts, where the console figure puts them (CONSOLE_PANELS). Left: the power lever (PCL_FT) and
  // the flap selector; the striped canopy fracture T-handle and firewall shutoff handle. Right: the environmental
  // control's temperature knob, the backup VHF's knob and the utility light.
  const P = CONSOLE_PANELS;
  const L = (f) => lerp(fx(c.aft), p.x, f); // a station along the console, 0 aft and 1 forward
  const LY = (f) => lerp(c.outer, c.inner, f); // across the left console, 0 outboard
  const RY = (f) => -lerp(c.inner, c.outer, f); // across the right console, 0 inboard
  tag = 'pcl';
  {
    const Q = PCL_FT, G = Q.grip, S2 = Q.stem;
    const xs = P.pclSlot.along.map(L), qx = (xs[0] + xs[1]) / 2;
    const sy = LY(S2.across), hy = LY((Q.quadrant.across[0] + Q.quadrant.across[1]) / 2), ht = (Q.quadrant.across[1] - Q.quadrant.across[0]) * (c.outer - c.inner);
    // A D-shaped housing (flat on the console, round on top) `a` long and `b` tall, `t` thick across, its middle at y.
    const dHousing = (a, b, t) => {
      const shape = new THREE.Shape();
      shape.moveTo(-a, 0);
      shape.absellipse(0, 0, a, b, Math.PI, 0, true);
      shape.lineTo(-a, 0);
      const bev = Math.min(0.008, t / 4);
      return new THREE.ExtrudeGeometry(shape, { depth: t - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 24 })
        .rotateX(Math.PI / 2).translate(0, t / 2 - bev, 0);
    };
    const screw = (x, y, z) => put(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 8).translate(x, y, z), SLOT.metal); // axis across
    // The quadrant's hood inboard of the slot: MAX's mark on its forward slope, a screw beside it; the friction tab aft.
    const A = Q.quadrant.a, B = Q.quadrant.b;
    put(dHousing(A, B, ht).translate(qx, hy, c.top), SLOT.dark);
    const iq = hy - ht / 2 - 0.004; // its inboard face
    screw(qx + A * 0.72, iq, c.top + B * 0.42);
    {
      const t = rad(40), mx = qx + A * Math.cos(t), mz = c.top + B * Math.sin(t);
      put(box(THREE, -0.004, 0.004, -0.035, 0.035, -0.012, 0.012).rotateY(-t).translate(mx, hy + 0.01, mz), SLOT.knob); // MAX
    }
    if (front) { // the friction adjust tab standing up off the hood's aft end, by the slot (forward cockpit only)
      put(box(THREE, -0.006, 0.006, -0.03, 0.03, 0, 0.065).rotateY(rad(-20)).translate(qx - A * 0.62, hy + ht / 2 - 0.035, c.top + B * 0.78), SLOT.knob);
    }
    // The thin cheek outboard of the slot, and the slot itself, dark, between them.
    put(dHousing(Q.cheek.a, Q.cheek.b, Q.cheek.t).translate(qx, LY(Q.cheek.across), c.top), SLOT.dark);
    put(box(THREE, qx - A * 0.9, qx + A * 0.9, hy + ht / 2, LY(Q.cheek.across) - Q.cheek.t / 2, c.top, c.top + 0.012), SLOT.black);
    // The flap selector's housing inboard: three screws on its inboard face, its slot over the top, its tab at UP.
    const fy = LY(Q.flap.across);
    put(dHousing(Q.flap.a, Q.flap.b, Q.flap.t).translate(qx, fy, c.top), SLOT.dark);
    put(dHousing(Q.flap.a * 0.55, Q.flap.b + 0.003, 0.03).translate(qx - Q.flap.a * 0.1, fy, c.top), SLOT.black);
    for (const [u, v] of [[-0.68, 0.18], [0.68, 0.18], [0.8, 0.45]]) screw(qx + u * Q.flap.a, fy - Q.flap.t / 2 - 0.004, c.top + v * Q.flap.b);
    {
      const t = rad(Q.flap.tabDeg), tx = qx + Q.flap.a * Math.cos(t), tz = c.top + Q.flap.b * Math.sin(t);
      put(box(THREE, -0.018, 0.018, -0.01, 0.01, 0, 0.05).rotateY(Math.PI / 2 - t).translate(tx, fy, tz), SLOT.knob);
    }
    // The lever, pivoted at the slot's middle and leaning forward with where it sits in its slot (MAX forward). Its
    // parts below are in the lever's own frame: x forward, y across (0 the plate's middle, inboard negative), z up.
    const f = (L(P.pclSlot.at) - xs[0]) / (xs[1] - xs[0]), lean = rad(lerp(-Q.travelDeg, Q.travelDeg, f));
    const lever = (g) => g.rotateY(lean).translate(qx, sy, c.top);
    const g0 = G.bottom, hw = G.depth / 2, r = hw, yo = -S2.t / 2, yi = yo - G.length; // the grip's outboard and inboard ends
    // The grip's section: flat underneath with rounded corners, straight sides, round on top; grown by `grow` all round.
    const gripShape = (grow) => {
      const s = new THREE.Shape(), w = hw + grow, k = 0.02, top = G.height - r;
      s.moveTo(-w + k, -grow); s.lineTo(w - k, -grow); s.quadraticCurveTo(w, -grow, w, -grow + k);
      s.lineTo(w, top); s.absarc(0, top, w, 0, Math.PI, false);
      s.lineTo(-w, -grow + k); s.quadraticCurveTo(-w, -grow, -w + k, -grow);
      return s;
    };
    // The plate: up out of the slot, widening to the grip's outboard end, its top the flange round the grip.
    {
      const s = new THREE.Shape(), w0 = S2.w / 2, w1 = hw + G.flange, z0 = B - 0.04, z1 = g0 + G.height - r;
      s.moveTo(-w0, z0); s.lineTo(w0, z0); s.lineTo(w1, g0 - G.flange); s.lineTo(w1, z1);
      s.absarc(0, z1, w1, 0, Math.PI, false); s.lineTo(-w1, g0 - G.flange); s.lineTo(-w0, z0);
      put(lever(new THREE.ExtrudeGeometry(s, { depth: S2.t, bevelEnabled: false, curveSegments: 20 }).rotateX(Math.PI / 2).translate(0, S2.t / 2, 0)), SLOT.dark);
    }
    // The grip, from the plate inboard, its edges rounded.
    {
      const bev = 0.01;
      const grip = new THREE.ExtrudeGeometry(gripShape(-bev), { depth: G.length - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 20 });
      put(lever(grip.rotateX(Math.PI / 2).translate(0, yo - bev, g0)), SLOT.black);
    }
    // On its inboard end: the speed brake switch in its ring at the top; a block below with the ICS key (aft) and the
    // UHF/VHF key (forward).
    const zc = g0 + G.height - r;
    put(lever(new THREE.ExtrudeGeometry(gripShape(0.005), { depth: 0.016, bevelEnabled: false, curveSegments: 20 }).rotateX(Math.PI / 2).translate(0, yi + 0.016, g0)), SLOT.dark); // its end cap
    put(lever(new THREE.CylinderGeometry(0.048, 0.048, 0.012, 20).translate(0, yi - 0.004, zc)), SLOT.black);
    {
      const k = new THREE.Shape(), w = 0.026, v = 0.024, q = 0.012;
      k.moveTo(-w + q, -v); k.lineTo(w - q, -v); k.quadraticCurveTo(w, -v, w, -v + q); k.lineTo(w, v - q); k.quadraticCurveTo(w, v, w - q, v);
      k.lineTo(-w + q, v); k.quadraticCurveTo(-w, v, -w, v - q); k.lineTo(-w, -v + q); k.quadraticCurveTo(-w, -v, -w + q, -v);
      put(lever(new THREE.ExtrudeGeometry(k, { depth: 0.016, bevelEnabled: false, curveSegments: 6 }).rotateX(Math.PI / 2).translate(0, yi - 0.004, zc)), SLOT.knob); // the speed brake switch
    }
    put(lever(box(THREE, -hw + 0.008, hw - 0.008, yi - 0.012, yi + 0.004, g0 + 0.008, g0 + 0.07)), SLOT.black);
    put(lever(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 12).translate(-0.032, yi - 0.018, g0 + 0.04)), SLOT.knob);
    put(lever(box(THREE, 0.016, 0.046, yi - 0.026, yi - 0.01, g0 + 0.024, g0 + 0.056)), SLOT.knob);
    // On its forward face: the rudder trim rocker inboard, the ICS key/mute button near the plate.
    put(lever(box(THREE, hw - 0.002, hw + 0.016, yi + 0.09, yi + 0.13, g0 + 0.03, g0 + 0.105)), SLOT.knob);
    put(lever(new THREE.CylinderGeometry(0.013, 0.013, 0.02, 12).rotateZ(Math.PI / 2).translate(hw + 0.006, yo - 0.06, g0 + 0.115)), SLOT.knob);
    // The cutoff finger lift: pivoted on the plate's inboard face under the grip, reaching forward and a little down,
    // its tip turned up over the guard's tray, which hangs off the plate below it.
    {
      const fl = Q.fingerLift, pz = g0 - 0.06, y1 = yo - S2.t / 2, y0 = y1 - fl.width, d = rad(fl.dropDeg);
      put(lever(new THREE.CylinderGeometry(0.014, 0.014, fl.width + 0.01, 10).translate(-0.02, (y0 + y1) / 2, pz)), SLOT.metal); // its pivot
      put(lever(box(THREE, 0, fl.length, y0, y1, -0.008, 0.008).rotateY(d).translate(-0.02, 0, pz)), SLOT.metal);
      const ex = -0.02 + fl.length * Math.cos(d), ez = pz - fl.length * Math.sin(d);
      put(lever(box(THREE, 0, 0.065, y0 - 0.005, y1, -0.008, 0.008).rotateY(-rad(fl.tipDeg)).translate(ex, 0, ez)), SLOT.metal); // the tip
      const gz = ez - 0.045;
      put(lever(box(THREE, ex - 0.09, ex + 0.06, y0 - 0.015, y1, gz - 0.006, gz + 0.006)), SLOT.dark); // the guard's tray
      put(lever(box(THREE, ex + 0.05, ex + 0.062, y0 - 0.015, y1, gz, gz + 0.045)), SLOT.dark); // its front lip
      put(lever(box(THREE, S2.w / 2 - 0.03, ex - 0.08, y1 - 0.012, y1, gz - 0.006, gz + 0.006)), SLOT.dark); // its arm to the plate
    }
  }
  tag = null;
  {
    const x = L(P.canopyFracture.along), y = LY(P.canopyFracture.across);
    striped.push(box(THREE, x - 0.012, x + 0.012, y - 0.012, y + 0.012, c.top, c.top + 0.06), box(THREE, x - 0.02, x + 0.02, y - 0.09, y + 0.09, c.top + 0.06, c.top + 0.09));
    const fw = P.firewall, wx = L(fw.along);
    striped.push(box(THREE, wx - 0.025, wx + 0.025, LY(fw.across[0]) - 0.02, LY(fw.across[1]) + 0.02, c.top + 0.02, c.top + 0.05));
  }
  for (const [part, r, t] of [[P.ecsKnob, 0.05, 0.04], [P.vhfKnob, 0.025, 0.03]]) {
    put(new THREE.CylinderGeometry(r, r, t, 16).rotateX(Math.PI / 2).translate(L(part.along), RY(part.across), c.top + t / 2), SLOT.knob);
  }
  {
    const x = L(P.utilityLight.along), y = RY(P.utilityLight.across);
    put(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 14).translate(x, y, c.top + 0.06), SLOT.dark); // lying across the console
    put(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 14).translate(x, y + 0.085, c.top + 0.06), SLOT.mirror); // its lens, inboard end
  }
  // The canopy handle on the right side frame and a small handle on the left (Dad's picture 26).
  {
    const x = fx(1.25), z = ct156CanopySection(x / F).base * F + 0.16, y = -(Math.min(glassHalfWidthFt(z, x, 0), 1.4) - SIDE_FRAME_FT.thick - 0.04);
    const bar = (g) => g.rotateY(rad(-25)).translate(x, y, z);
    put(bar(box(THREE, -0.25, 0.25, -0.03, 0.03, -0.035, 0.035)), SLOT.dark);
    for (let i = 0; i < 4; i++) put(bar(box(THREE, -0.18 + i * 0.1, -0.15 + i * 0.1, -0.045, 0.03, -0.04, 0.04)), SLOT.black);
    const x2 = fx(2.6), z2 = ct156CanopySection(x2 / F).base * F + 0.15, y2 = Math.min(glassHalfWidthFt(z2, x2, 0), 1.4) - SIDE_FRAME_FT.thick - 0.03;
    put(box(THREE, x2 - 0.09, x2 + 0.09, y2 - 0.02, y2, z2 - 0.02, z2 + 0.02), SLOT.metal);
  }
  // The stick: a black boot on the floor, the grey stem leaning 8° forward, the dark grip with its red button.
  tag = 'stick';
  const st = S.stick, tilt = rad(st.tiltDeg);
  const stickPart = (g) => g.rotateY(tilt).translate(fx(st.x), 0, floor);
  put(stickPart(new THREE.CylinderGeometry(0.1, 0.22, 0.32, 12).rotateX(Math.PI / 2).translate(0, 0, 0.16)), SLOT.black);
  put(stickPart(new THREE.CylinderGeometry(0.045, 0.05, st.height - 0.3, 10).rotateX(Math.PI / 2).translate(0, 0, (st.height - 0.3) / 2 + 0.2)), SLOT.grey);
  put(stickPart(new THREE.CylinderGeometry(0.065, 0.055, 0.32, 10).rotateX(Math.PI / 2).translate(-0.02, 0, st.height - 0.13)), SLOT.black);
  put(stickPart(box(THREE, -0.075, 0.04, -0.05, 0.05, st.height - 0.02, st.height + 0.04)), SLOT.black);
  put(stickPart(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 8).rotateX(Math.PI / 2).translate(-0.04, 0.015, st.height + 0.05)), SLOT.red);
  put(stickPart(box(THREE, 0.04, 0.06, -0.015, 0.015, st.height - 0.12, st.height - 0.04)), SLOT.red);
  tag = null;
  // The face's parts lean back with it (PANEL_FT.leanDeg).
  for (const g of [...parts.map((q) => q.geometry), ...striped, ...cards]) if (onFace(g, p)) leanWithFace(g, p);
  return { parts, striped, consoleTops, lower, cards, ts, faceW, faceH, eye, lampFaces };
}

/**
 * The standby compass's card all the way round, as the pilot reads it through the window: the numbers fall from left to
 * right (360° at the left edge down to 0° at the right), so higher headings show left of the lubber line. Ticks every
 * 5°, longer every 10°; N 3 6 E 12 15 S 21 24 W 30 33.
 */
function drawCompassCard(ctx, w, h) {
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f0f0f0';
  const xOf = (v) => ((360 - v) / 360) * w;
  for (let v = 0; v < 360; v += 5) ctx.fillRect(xOf(v) - 1.5, 0, 3, h * (v % 10 ? 0.16 : 0.3));
  ctx.font = `bold ${Math.round(h * 0.56)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (let v = 0; v < 360; v += 30) {
    const text = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[v] ?? String(v / 10);
    ctx.fillText(text, xOf(v), h * 0.93);
    if (v === 0) ctx.fillText(text, 0, h * 0.93); // N again at the left edge, where the card wraps round
  }
}
/** The compass card's picture offset showing heading headingDeg under the lubber line (the window's middle). */
function compassCardOffset(headingDeg) {
  const span = STANDBY_COMPASS_FT.windowDeg / 360;
  const hdg = ((headingDeg % 360) + 360) % 360;
  return (360 - hdg) / 360 - span / 2;
}

/** Geometries with position, normal and uv joined into one (non-indexed); the parts are disposed. */
function joinTextured(THREE, geoms) {
  const pos = [], nor = [], uv = [];
  for (const g0 of geoms) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    for (let i = 0; i < n * 3; i++) { pos.push(g.attributes.position.array[i]); nor.push(g.attributes.normal.array[i]); }
    for (let i = 0; i < n * 2; i++) uv.push(g.attributes.uv ? g.attributes.uv.array[i] : 0);
    if (g !== g0) g.dispose();
    g0.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/**
 * Both cockpits as a THREE.Group to add to a ship's root (createCt156Model), with update(hud) for the panels' live
 * instruments and dispose() to free everything it made. doc: the document its panel canvases are drawn on.
 * @param {any} THREE
 * @param {{ doc?: Document }} [options]
 */
/**
 * A fingerprint of a named part's pieces, so the Blender cockpit's part shows only while it was built from the pieces the
 * code draws now (ct156-cockpit-model.js): a cockpit change without a rebuilt model file shows the code's part, never a
 * stale one. pieces: [{ geometry }]. The same fingerprint as the outside's (ct156-model.js ct156PiecesHash).
 */
export const cockpitPiecesHash = ct156PiecesHash;

export function createCt156Cockpit(THREE, { doc = globalThis.document, keepPieces = false, liveEngine = false } = {}) {
  const group = new THREE.Group();
  group.name = 'ct156-cockpit';
  group.scale.setScalar(1 / F); // built in feet, drawn in the model's units
  const textures = [];
  const canvases = [];
  const canvasTexture = (w, h) => {
    const canvas = doc.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    textures.push(texture);
    canvases.push(canvas);
    return { canvas, ctx: canvas.getContext('2d'), texture };
  };
  const materials = [];
  const own = (m) => (materials.push(m), m);
  const solid = (color, extra = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide, fog: false, ...extra }));
  const lamp = (color) => own(new THREE.MeshBasicMaterial({ color, fog: false }));
  // Slots as SLOT (TS-157 colours, judged off Dad's pictures 26, 27, 29; the panel, consoles and cushions dark charcoal
  // since Patrick, 11 Oct 2026 22:06Z, after US Navy T-6A cockpit photos; the grey slot medium grey, PANEL_GREY, since
  // 12 Oct 2026): dark charcoal panel and consoles, near-black
  // coaming and rail, red, mirror, light knobs, unlit lamps, the light bow band, dark seat cushions, dark grey (seat
  // bucket, headbox, bezels, vents), the green oxygen hose, metal, mid grey canopy frames and straps (were light grey; the
  // T-6A photos' inner frame and rails are mid grey).
  const slotMats = [
    solid(PANEL_GREY, { roughness: 0.85 }), solid('#1d2023', { roughness: 0.75 }), solid('#1d2024', { roughness: 0.6 }), solid('#b3202a', { roughness: 0.5 }),
    // The mirrors chrome (Patrick, 12 Oct 2026, "Construction only", from his reference picture; were blue-grey).
    solid('#e4e8ec', { roughness: 0.12, metalness: 0.85, emissive: '#8f969d' }), solid('#c9ced4', { roughness: 0.5 }),
    lamp('#3a1414'), lamp('#3a2c0e'), lamp('#10301a'),
    // The forward bow band, white to light grey (TS-156), a little self-lit so it stays light with the sun ahead.
    solid('#d3d6d9', { roughness: 0.7, emissive: '#7a7d80' }),
    solid('#3a3c3f', { roughness: 0.9 }), solid('#3b3f44', { roughness: 0.8 }), solid('#4d6a2f', { roughness: 0.7 }),
    solid('#a9aeb4', { roughness: 0.35, metalness: 0.7 }), solid('#7d8185', { roughness: 0.75, emissive: '#26282a' }),
  ];
  const geometries = [];
  const add = (geometry, material) => {
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, material);
    group.add(m);
    return m;
  };

  // The live faces' shared picture, the lower panels' and the consoles' pictures (both seats share them).
  const live = canvasTexture(ATLAS.width, ATLAS.height);
  const liveMat = own(new THREE.MeshBasicMaterial({ map: live.texture, side: THREE.DoubleSide, fog: false }));
  const lowerPic = canvasTexture(768, 576);
  drawLowerPanel(lowerPic.ctx, 768, 576);
  lowerPic.texture.needsUpdate = true;
  const lowerMat = own(new THREE.MeshBasicMaterial({ map: lowerPic.texture, side: THREE.DoubleSide, fog: false }));
  const consolePic = canvasTexture(512, 2048);
  drawConsoles(consolePic.ctx, 512, 2048);
  consolePic.texture.needsUpdate = true;
  const consoleMat = own(new THREE.MeshStandardMaterial({ map: consolePic.texture, roughness: 0.85, side: THREE.DoubleSide, fog: false }));

  const shade = canvasTexture(4, 256);
  const fade = shade.ctx.createLinearGradient(0, 0, 0, 256);
  fade.addColorStop(0, `rgba(0, 0, 0, ${PANEL_SHADE.top})`);
  fade.addColorStop(PANEL_SHADE.depth, 'rgba(0, 0, 0, 0)');
  shade.ctx.fillStyle = fade;
  shade.ctx.fillRect(0, 0, 4, 256);
  shade.texture.needsUpdate = true;
  const shadeMat = own(new THREE.MeshBasicMaterial({ map: shade.texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));

  const seats = [
    { dx: FRONT_DX, front: true, p: PANEL_FT, h: GLARESHIELD_FT, eye: EYES_FT.front, width: 2048 },
    { dx: REAR_DX, front: false, p: REAR_PANEL_FT, h: REAR_HUMP_FT, eye: EYES_FT.rear, width: 1024 },
  ];
  const solidParts = [], striped = [], consoleTops = [], lowerFaces = [], liveQuads = [], cards = [];
  const engineQuads = [], lampQuads = []; // liveEngine only: the engine displays' and caution panel's quads, and each lamp's [quad, colour when lit]
  // The pictured faces (panel faces, lower panels, console tops, striped handles): they shade the Blender parts in its
  // bake, and the file carries their own baked shadows as its 'shade' part, shown only while they are drawn as now.
  const occluders = [];
  for (const seat of seats) {
    const sp = seatParts(THREE, seat);
    solidParts.push(...sp.parts);
    striped.push(...sp.striped);
    consoleTops.push(...sp.consoleTops);
    lowerFaces.push(...sp.lower);
    cards.push(...sp.cards);
    const { ts, faceW, faceH } = sp;
    const { p } = seat;
    // The panel's static picture, its pixels square on the face.
    const height = Math.round((seat.width * faceH) / faceW);
    const pic = canvasTexture(seat.width, height);
    drawStaticPanel(pic.ctx, seat.width, height, PANEL_INSTRUMENTS, faceW, faceH);
    pic.texture.needsUpdate = true;
    const panelMat = own(new THREE.MeshBasicMaterial({ map: pic.texture, side: THREE.DoubleSide, fog: false }));
    const outline = [[ts.side, p.bottom], [ts.side, ts.shoulderZ], [ts.top, p.top], [-ts.top, p.top], [-ts.side, ts.shoulderZ], [-ts.side, p.bottom]];
    const face = add(leanWithFace(flatAft(THREE, p.x, outline, { y0: ts.side, y1: -ts.side, z0: p.bottom, z1: p.top }), p), panelMat).geometry;
    occluders.push({ geometry: face, slot: 'grey' });
    // The coaming's shade on the panel's top (Patrick's cockpit clip, 11 Oct 2026, shows the top of the panel in the
    // coaming's shadow): a dark veil just in front of the face and its bezels, fading out PANEL_SHADE.depth of the way down.
    add(leanWithFace(flatAft(THREE, p.x - 0.035, outline, { y0: ts.side, y1: -ts.side, z0: p.bottom, z1: p.top }), p), shadeMat);
    // The live instruments: small quads just proud of the face, each showing its window of the shared picture.
    for (const inst of PANEL_INSTRUMENTS) {
      if (!inst.live) continue;
      const s = faceFt(inst, faceW, faceH);
      const yc = ts.side * (1 - 2 * inst.u), zc = p.bottom + inst.v * faceH;
      const q = flatAft(THREE, p.x - 0.005, [[yc + s.w / 2, zc - s.h / 2], [yc - s.w / 2, zc - s.h / 2], [yc - s.w / 2, zc + s.h / 2], [yc + s.w / 2, zc + s.h / 2]]);
      const win = LIVE_WINDOWS[inst.live];
      const uv = q.attributes.uv, pos = q.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const fu = (yc + s.w / 2 - pos.getY(i)) / s.w, fv = (pos.getZ(i) - (zc - s.h / 2)) / s.h;
        uv.setXY(i, (win.x + fu * win.w) / ATLAS.width, 1 - (win.y + (1 - fv) * win.h) / ATLAS.height);
      }
      liveQuads.push(leanWithFace(q, p));
    }
    // liveEngine (the EP Tabletop): the engine displays and the caution panel live too, each a quad over its whole box,
    // and the three lip lamps each a lamp face that lights. Built only when asked, so every other cockpit is unchanged.
    if (liveEngine) {
      for (const inst of PANEL_INSTRUMENTS) {
        if (inst.kind !== 'eng' && inst.kind !== 'annun') continue;
        const s = outerFt(inst, faceW, faceH);
        const yc = ts.side * (1 - 2 * inst.u), zc = p.bottom + inst.v * faceH;
        const q = flatAft(THREE, p.x - 0.005, [[yc + s.w / 2, zc - s.h / 2], [yc - s.w / 2, zc - s.h / 2], [yc - s.w / 2, zc + s.h / 2], [yc + s.w / 2, zc + s.h / 2]]);
        const win = ENGINE_WINDOWS[inst.kind === 'eng' ? inst.name : 'annun'];
        const uv = q.attributes.uv, pos = q.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const fu = (yc + s.w / 2 - pos.getY(i)) / s.w, fv = (pos.getZ(i) - (zc - s.h / 2)) / s.h;
          uv.setXY(i, (win.x + fu * win.w) / ATLAS.width, 1 - (win.y + (1 - fv) * win.h) / ATLAS.height);
        }
        engineQuads.push(leanWithFace(q, p));
      }
      sp.lampFaces.forEach((f, i) => {
        const q = flatAft(THREE, f.x, [[f.y + f.w / 2, f.z - f.h / 2], [f.y - f.w / 2, f.z - f.h / 2], [f.y - f.w / 2, f.z + f.h / 2], [f.y + f.w / 2, f.z + f.h / 2]]);
        lampQuads.push({ geometry: q, name: MASTER_LAMPS[i], colour: i === 1 ? '#ffb21a' : '#ff2a2a' });
      });
    }
  }
  for (const g of [...lowerFaces, ...consoleTops, ...striped]) occluders.push({ geometry: g, slot: 'grey' });
  group.userData.shadeHash = cockpitPiecesHash(occluders);
  if (keepPieces) group.userData.occluders = occluders.map(({ geometry, slot }) => ({ geometry: geometry.clone(), slot }));
  add(joinTextured(THREE, liveQuads), liveMat);
  // liveEngine: the engine displays' own shared picture, and each lip lamp's own colour (hidden while unlit).
  const engine = liveEngine ? canvasTexture(ATLAS.width, ATLAS.height) : null;
  const lampMeshes = [];
  if (engine) {
    add(joinTextured(THREE, engineQuads), own(new THREE.MeshBasicMaterial({ map: engine.texture, side: THREE.DoubleSide, fog: false })));
    for (const { geometry, name, colour } of lampQuads) {
      const mesh = add(geometry, own(new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide, fog: false })));
      mesh.name = `ct156-cockpit-lamp-${name}`;
      mesh.visible = false;
      lampMeshes.push({ mesh, name });
    }
    drawEngineLive(engine.ctx, null);
    engine.texture.needsUpdate = true;
  }
  add(joinTextured(THREE, lowerFaces), lowerMat);
  add(joinTextured(THREE, consoleTops), consoleMat);
  // The standby compasses' card (both seats show the same heading).
  const card = canvasTexture(2048, 96);
  drawCompassCard(card.ctx, 2048, 96);
  card.texture.wrapS = THREE.RepeatWrapping;
  card.texture.repeat.x = STANDBY_COMPASS_FT.windowDeg / 360;
  card.texture.offset.x = compassCardOffset(0);
  card.texture.needsUpdate = true;
  add(joinTextured(THREE, cards), own(new THREE.MeshBasicMaterial({ map: card.texture, color: '#d0d0d0', side: THREE.DoubleSide, fog: false })));

  // Round the canopy. The forward bow's light channel with its studs (FORWARD_BOW_FT), and its two curved chrome
  // mirrors (BOW_MIRRORS).
  // The bow itself and the canopy rails are named parts like the seat's, so the Blender cockpit rounds and shades these
  // same pieces and its parts show only while their fingerprints match (ct156-cockpit-model.js, ALL-32). Until 12 Oct
  // 2026 the Blender script drew its own bow and rails, unchecked, so changes to these in the code never showed.
  const fb = bandGeometries(THREE, FORWARD_BOW_FT);
  const bowParts = [{ geometry: fb.band, materials: [SLOT.band] }];
  if (fb.tube) bowParts.push({ geometry: fb.tube, materials: [SLOT.black] });
  if (fb.recess) bowParts.push({ geometry: fb.recess, materials: [SLOT.dark] });
  for (const g of fb.studs ?? []) bowParts.push({ geometry: g, materials: [SLOT.metal] });
  bowParts.push(...bowFootParts(THREE).map(([geometry, slot]) => ({ geometry, materials: [slot] })));
  for (const g of fb.dots) bowParts.push({ geometry: g, materials: [SLOT.black] });
  for (const part of bowParts) solidParts.push({ ...part, name: 'forward-bow' });
  for (const [t0, t1] of BOW_MIRRORS.spans) {
    const { frame, face } = bowMirrorGeometries(THREE, FORWARD_BOW_FT, t0, t1);
    solidParts.push({ geometry: frame, materials: [SLOT.black] }, { geometry: face, materials: [SLOT.mirror] });
  }
  // The inter-cockpit arch's light band with its fastener rows and inner tube, and the clear inter-cockpit shield
  // under it, down to the rear hump (Dad's picture 28). No mirrors: the rear seat has none (Patrick, 12 Oct 2026; two
  // were turned to the rear eye a third of the way down from the crest, Dad's pictures 21, 27, TS-155).
  const ab = bandGeometries(THREE, ARCH_FT);
  solidParts.push({ geometry: ab.band, materials: [SLOT.band] }, { geometry: ab.tube, materials: [SLOT.black] });
  for (const g of ab.dots) solidParts.push({ geometry: g, materials: [SLOT.black] });
  const rearTs = tombstone(REAR_PANEL_FT);
  {
    const x = ARCH_FT.x + 0.04;
    const hump = hoodSection(REAR_HUMP_FT, rearTs, x).map(([, y, z]) => [y, z]);
    const sideZ = hump[0][1];
    const base = ct156CanopySection(x / F).base * F;
    const hoop = ct156HoopPoints(x / F, 36).map(({ y, z }) => {
      const dy = -y * F, dz = base - z * F, l = Math.hypot(dy, dz) || 1, d = 0.1;
      return [y * F + (dy / l) * d, z * F + (dz / l) * d];
    }).filter(([, z]) => z > sideZ + 0.02);
    const shield = flatAft(THREE, x, [...hoop, ...hump.slice().reverse()]);
    // Leaned with the arch: each point forward by its drop below the crest times the lean's tangent.
    const crest = ct156CanopySection(x / F).top * F, sp = shield.attributes.position;
    for (let i = 0; i < sp.count; i++) sp.setX(i, x - (crest - sp.getZ(i)) * Math.tan(ARCH_FT.lean));
    add(shield, own(new THREE.MeshBasicMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, fog: false })));
  }
  // The canopy's side frames with their fasteners (Dad's pictures 19, 21, 27) and the sill bands below them.
  const sf = sideFrameParts(THREE);
  const railParts = [];
  for (const g of sf.frames) railParts.push({ geometry: g, materials: [SLOT.grey] }); // the cockpit's own grey (Patrick, 12 Oct 2026; was a lighter grey)
  for (const g of sf.nubs) railParts.push({ geometry: g, materials: [SLOT.dark] });
  for (const g of sillGeometry(THREE)) railParts.push({ geometry: g, materials: [SLOT.grey] }); // also the cockpit's grey (Patrick, 12 Oct 2026; was SLOT.frame's lighter grey)
  for (const [g, slot] of canopyHandleParts(THREE)) railParts.push({ geometry: g, materials: [slot] });
  for (const part of railParts) solidParts.push({ ...part, name: 'canopy-rails' });
  // The named parts (seatParts' tags) each their own mesh, for the Blender cockpit to replace; with keepPieces their pieces
  // stay unjoined in group.userData.pieces (as { name: [{ geometry, slot }] }) for the export to Blender.
  // Everything else solid is the 'body' part.
  const named = new Map();
  for (const part of solidParts) {
    const name = part.name ?? 'body';
    if (!named.has(name)) named.set(name, []);
    named.get(name).push(part);
  }
  if (keepPieces) {
    const slotName = Object.fromEntries(Object.entries(SLOT).map(([k, i]) => [i, k]));
    group.userData.pieces = Object.fromEntries([...named].map(([name, list]) => [name, list.map(({ geometry, materials }) => ({ geometry: geometry.clone(), slot: slotName[materials[0]] }))]));
  }
  for (const [name, list] of named) {
    const hash = cockpitPiecesHash(list);
    const mesh = add(ct156JoinGeometries(THREE, list), slotMats);
    mesh.name = `ct156-cockpit-${name}`;
    mesh.userData.hash = hash; // the model file's part shows only if it was built from these same pieces
  }
  // The Blender cockpit's parts (ALL-32), once its file is in, in place of the code's parts of the same names.
  attachCockpitModel(THREE, group, Object.fromEntries(Object.entries(SLOT).map(([k, i]) => [k, slotMats[i]])), own);

  // The yellow and black striped parts: the seat handles, the emergency gear T, the console T-handle and guard.
  const stripe = canvasTexture(32, 32);
  stripe.ctx.fillStyle = YELLOW;
  stripe.ctx.fillRect(0, 0, 32, 32);
  stripe.ctx.fillStyle = '#111';
  stripe.ctx.fillRect(0, 0, 16, 32);
  stripe.texture.wrapS = stripe.texture.wrapT = THREE.RepeatWrapping;
  stripe.texture.repeat.set(8, 1);
  stripe.texture.needsUpdate = true;
  const stripeMat = own(new THREE.MeshStandardMaterial({ map: stripe.texture, roughness: 0.6, side: THREE.DoubleSide, fog: false }));
  add(joinTextured(THREE, striped), stripeMat);

  let shownKey = null;
  // The VSI's rate: the HUD's vsFpm when it gives one, else the altitude's change between calls, smoothed over about a
  // second (the sim's numbers carry no vertical speed).
  let lastAlt = NaN, lastAt = NaN, vs = NaN;
  const withVerticalSpeed = (hud, nowMs) => {
    if (!hud || Number.isFinite(hud.vsFpm)) return hud;
    const dt = (nowMs - lastAt) / 1000;
    if (!(dt <= 0)) { // a later call (or the first)
      if (Number.isFinite(hud.altFt) && Number.isFinite(lastAlt) && dt < 2) {
        const now = ((hud.altFt - lastAlt) / dt) * 60;
        vs = Number.isFinite(vs) ? vs + (now - vs) * Math.min(1, dt) : now;
      } else vs = NaN;
      lastAlt = hud.altFt;
      lastAt = nowMs;
    }
    return { ...hud, vsFpm: vs };
  };
  let shownAt = -Infinity;
  drawLive(live.ctx, null);
  live.texture.needsUpdate = true;
  // Real-time shadows where a view switches them on (aircraft-shadows.js): the bows' and frames' shadows across the
  // cockpit. Glass and the self-lit faces neither cast nor take them.
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = ![o.material].flat().some((m) => m?.transparent);
  });

  return {
    group,
    /**
     * The live instruments from the HUD's numbers ({ pitchDeg, bankDeg (right wing down positive), altFt, g, kias,
     * headingDeg, and vsFpm if the module has it, else the altitude's change between calls; speedBrake true lights the
     * SPEED BRAKE light }; null shows dashes), in both seats' panels (the same aircraft's numbers). Redraws only when what it
     * shows changed, and not within PANEL_REDRAW_MS of the last redraw. Returns true when it redrew. The standby
     * compasses' card turns to headingDeg on every call (no redraw).
     * With liveEngine, `hud.engine` also drives the engine displays and the caution panel: ENGINE_LIVE's numbers, and
     * `lights`, the names lit (ANNUNCIATOR_NAMES and MASTER_LAMPS); anything missing shows as the static picture does.
     */
    update(hud, nowMs = globalThis.performance?.now?.() ?? Date.now()) {
      if (Number.isFinite(hud?.headingDeg)) card.texture.offset.x = compassCardOffset(hud.headingDeg);
      hud = withVerticalSpeed(hud, nowMs);
      const key = engine ? `${panelKey(hud)}|${engineKey(hud?.engine)}` : panelKey(hud);
      if (key === shownKey || nowMs - shownAt < PANEL_REDRAW_MS) return false;
      shownKey = key;
      shownAt = nowMs;
      drawLive(live.ctx, hud);
      live.texture.needsUpdate = true;
      if (engine) {
        drawEngineLive(engine.ctx, hud?.engine ?? null);
        engine.texture.needsUpdate = true;
        const lit = new Set(hud?.engine?.lights ?? []);
        for (const { mesh, name } of lampMeshes) mesh.visible = lit.has(name);
      }
      return true;
    },
    dispose() {
      group.userData.disposed = true;
      group.removeFromParent();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      for (const c of canvases) c.width = c.height = 0;
    },
  };
}

// ---------- riding a ship from one of its seats ----------
// Small helpers for a 3D view that puts its camera in a ship's seat, lifted from what Turn Sim and Turn Fight each do
// (their syncCockpit and aimPov). The Debrief's Cockpit camera uses them (DB-21); moving Turn Sim, Turn Fight and Traffic
// onto them is a separate tidy. A picture only: no flight numbers.

/** How far the head turns from the nose when the view is dragged, degrees: left of the nose and up positive (Turn Sim's and Turn Fight's HEAD). */
export const COCKPIT_HEAD = Object.freeze({ yawDeg: [-160, 160], pitchDeg: [-85, 80] });
/**
 * The view from a seat: fovTallDeg across the screen's shorter side (tall on a wide screen, across on a tall one), set
 * live by the view-angle slider above the camera buttons within fovRangeDeg (cockpitFovSetting), nothing nearer than
 * 0.5 ft (inside the cockpit), out to 400,000 ft. Set by the shorter side so a wide screen adds sides instead of cropping the panel and bow (Patrick,
 * 11 Oct 03:23Z). Patrick started it at 55° (11 Oct 03:44Z: "start it at 55 i think, its a bit too wide now"; was 65°,
 * V2.242). The 30-90° range is an estimate. fovAcrossDeg is the Debrief Chase lens's (aim.js). Picture choices, not
 * flying numbers.
 */
export const COCKPIT_VIEW = Object.freeze({ fovAcrossDeg: 60, fovTallDeg: 55, fovRangeDeg: Object.freeze([30, 90]), nearFt: 0.5, farFt: 400_000 });

// The slider's setting, shared by every 3D view on the page and kept in this browser through the app's store (a
// convenience: it starts at COCKPIT_VIEW.fovTallDeg when storage is empty or blocked; kept under 'ct156.cockpitFovDeg'
// until V2.317, so it starts there once).
const clampFov = (v) => Math.round(Math.max(COCKPIT_VIEW.fovRangeDeg[0], Math.min(COCKPIT_VIEW.fovRangeDeg[1], v)));
let fovStore = null;
const fovStoreScope = () => (fovStore ??= createStore(browserStorage).scope('cockpit'));
let fovSetting = null;
const savedFov = () => {
  const v = Number(fovStoreScope().get('fovDeg'));
  return v > 0 ? clampFov(v) : COCKPIT_VIEW.fovTallDeg;
};

/** The seat view's angle across the screen's shorter side, degrees, as the slider has it. */
export const cockpitFovSetting = () => (fovSetting ??= savedFov());

/** Sets the seat view's angle (kept within COCKPIT_VIEW.fovRangeDeg, whole degrees) and remembers it in this browser. */
export function setCockpitFovSetting(v) {
  if (!Number.isFinite(Number(v))) return cockpitFovSetting();
  fovSetting = clampFov(Number(v));
  fovStoreScope().set('fovDeg', fovSetting); // the store keeps it for the visit when storage is blocked
  return fovSetting;
}

/**
 * Holding Shift in a seat view zooms in on where the view looks (boresight, head turn or padlock), `times` closer:
 * 55° tall becomes about 24°, roughly true size on a desktop screen (Patrick, 11 Oct 03:29Z, asked for Shift to zoom;
 * the 2.5 is an estimate). A picture choice, not a flying number.
 */
export const COCKPIT_ZOOM = Object.freeze({ times: 2.5 });

/**
 * The vertical field of view, degrees, from a seat for a box `width` by `height`: the slider's angle across the shorter
 * side (cockpitFovSetting), COCKPIT_ZOOM closer when `zoomed`.
 */
export function cockpitFovDeg(width, height, zoomed = false) {
  const aspect = Math.max(width, 1) / Math.max(height, 1);
  const set = cockpitFovSetting();
  const fov = aspect >= 1 ? set : 2 * deg(Math.atan(Math.tan(rad(set / 2)) / aspect));
  return zoomed ? 2 * deg(Math.atan(Math.tan(rad(fov / 2)) / COCKPIT_ZOOM.times)) : fov;
}

/**
 * The view-angle slider, a row at the top of a 3D view's camera bar, above its buttons (Patrick, 11 Oct 03:46Z: "a
 * slider that shows up above the camera controls"), shown only while the view is from a seat: setShown(true) puts it
 * first in `bar` (the bar element, or a function giving the current one), setShown(false) hides it. Dragging it, a
 * wheel over it or the arrow keys on it change cockpitFovSetting live and call onChange (so a paused view redraws).
 * Its pointer, wheel and key events stay with it, not the view under it. dispose() takes it away.
 * @param {any} doc
 * @param {any} bar
 * @param {{ onChange?: () => void }} [options]
 */
export function createCockpitFovSlider(doc, bar, { onChange } = {}) {
  const [lo, hi] = COCKPIT_VIEW.fovRangeDeg;
  const wrap = doc.createElement('div');
  wrap.className = 'ct156-fov';
  // Its own line in the bar (a column bar, or Turn Fight's wrapping row); shown and hidden by its display.
  wrap.style.cssText = 'display:none;width:100%;box-sizing:border-box;justify-content:center;align-items:center;gap:8px;'
    + 'font:600 12px/1.2 system-ui, sans-serif;color:inherit;user-select:none;';
  const input = doc.createElement('input');
  input.type = 'range';
  input.min = String(lo);
  input.max = String(hi);
  input.step = '1';
  input.id = `ct156-fov-${Math.random().toString(36).slice(2, 8)}`;
  input.setAttribute('aria-label', 'Cockpit field of view, degrees');
  input.style.cssText = 'width:180px;margin:0;cursor:pointer;';
  const label = doc.createElement('label');
  label.textContent = 'FOV';
  label.htmlFor = input.id;
  const readout = doc.createElement('output');
  readout.style.cssText = 'min-width:2.5em;';
  wrap.append(label, input, readout);
  const show = () => {
    input.value = String(cockpitFovSetting());
    readout.textContent = `${cockpitFovSetting()}°`;
  };
  const set = (v) => {
    setCockpitFovSetting(v);
    show();
    onChange?.();
  };
  input.addEventListener('input', () => set(Number(input.value)));
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    e.stopPropagation();
    set(cockpitFovSetting() + (e.deltaY < 0 ? 1 : -1));
  }, { passive: false });
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click', 'dblclick', 'contextmenu', 'keydown', 'keyup']) {
    wrap.addEventListener(type, (e) => e.stopPropagation());
  }
  let shown = false;
  return {
    element: wrap,
    setShown(on) {
      on = Boolean(on);
      if (on) {
        const home = typeof bar === 'function' ? bar() : bar;
        if (home && wrap.parentElement !== home) home.prepend?.(wrap);
      }
      if (on === shown) return;
      shown = on;
      if (on) show();
      wrap.style.display = on ? 'flex' : 'none';
    },
    dispose() {
      shown = false;
      wrap.remove();
    },
  };
}

/**
 * Watches the Shift key on `win` for a 3D view's seat zoom (COCKPIT_ZOOM): held() is true while Shift is down (not
 * while typing in a box), and onChange runs each time it goes down or up, so a paused view redraws. start() and stop()
 * go with the view's own window key listener; stop() also lets go.
 * @param {any} win
 * @param {() => void} [onChange]
 */
export function createCockpitZoomKey(win, onChange) {
  let held = false;
  let on = false;
  const set = (v) => {
    if (v === held) return;
    held = v;
    onChange?.();
  };
  const down = (e) => {
    const tag = e.target?.tagName;
    if (e.key === 'Shift' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') set(true);
  };
  const up = (e) => {
    if (e.key === 'Shift') set(false);
  };
  const letGo = () => set(false);
  return {
    held: () => held,
    start() {
      if (on || !win?.addEventListener) return;
      on = true;
      win.addEventListener('keydown', down);
      win.addEventListener('keyup', up);
      win.addEventListener('blur', letGo);
    },
    stop() {
      if (!on) return;
      on = false;
      win.removeEventListener?.('keydown', down);
      win.removeEventListener?.('keyup', up);
      win.removeEventListener?.('blur', letGo);
      held = false;
    },
  };
}

/**
 * One CT-156 cockpit (createCt156Cockpit) that moves from ship to ship: mount(root, seat) puts it in the ship `root`
 * (a createCt156Model root built at its default length, its own scale setting its size, as Turn Sim and Turn Fight
 * make them) seen from 'front' or 'rear', building it on first need; mount(null) takes it
 * out and gives that ship back its outside look. update(hud) as createCt156Cockpit's. dispose() frees it. liveEngine as
 * createCt156Cockpit's (the EP Tabletop's live engine displays; every other view leaves it off).
 * @param {any} THREE
 * @param {{ doc?: Document, liveEngine?: boolean }} [options]
 */
export function createCockpitMount(THREE, { doc = globalThis.document, liveEngine = false } = {}) {
  let part = null;
  let root = null;
  let seat = null;
  const unmount = () => {
    if (!root) return;
    setCockpitView(root, { seat: null });
    part?.group.removeFromParent();
    root = null;
    seat = null;
  };
  return {
    mount(nextRoot, nextSeat = 'front') {
      const s = nextSeat === 'rear' ? 'rear' : 'front';
      if (root && root !== nextRoot) unmount();
      if (!nextRoot) return;
      part ??= createCt156Cockpit(THREE, { doc, liveEngine });
      if (root !== nextRoot || seat !== s) {
        nextRoot.add(part.group);
        setCockpitView(nextRoot, { seat: s });
        root = nextRoot;
        seat = s;
      }
    },
    update: (hud, nowMs) => part?.update(hud, nowMs) ?? false,
    get root() {
      return root;
    },
    dispose() {
      unmount();
      part?.dispose();
      part = null;
    },
  };
}

/** The eye of `seat` ('front' or 'rear', EYES_FT) of the ship `root` (a createCt156Model root, sized by its own scale) in world units, as a THREE.Vector3. */
export function cockpitEyeWorld(THREE, root, seat = 'front') {
  const eye = EYES_FT[seat] ?? EYES_FT.front;
  root.updateMatrixWorld(true);
  return root.localToWorld(new THREE.Vector3(eye.x, eye.y, eye.z).divideScalar(CT156_FT_PER_UNIT));
}

/**
 * Points a PerspectiveCamera out of `seat` of the ship `root`: at the eye, along the nose turned by the head (yawDeg
 * left, pitchDeg up, within COCKPIT_HEAD), rolling with the wings, cockpitFovDeg for a box `width` by `height`
 * (closer when `zoomed`) and nothing nearer than COCKPIT_VIEW.nearFt (in world units: the ship's own scale is the caller's).
 */
export function aimCockpitCamera(THREE, camera, root, { seat = 'front', yawDeg = 0, pitchDeg = 0, width = 1, height = 1, zoomed = false, near = COCKPIT_VIEW.nearFt, far = COCKPIT_VIEW.farFt } = {}) {
  /** @type {(v: number, range: readonly number[]) => number} */
  const clampTo = (v, range) => Math.max(range[0], Math.min(range[1], v));
  const eye = cockpitEyeWorld(THREE, root, seat);
  const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(root.quaternion);
  const up = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion);
  camera.aspect = width / Math.max(height, 1);
  camera.fov = cockpitFovDeg(width, height, zoomed);
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
  camera.position.copy(eye);
  camera.up.copy(up);
  const dir = fwd.clone().applyAxisAngle(up, rad(clampTo(yawDeg, COCKPIT_HEAD.yawDeg)));
  const right = dir.clone().cross(up).normalize();
  dir.applyAxisAngle(right, rad(clampTo(pitchDeg, COCKPIT_HEAD.pitchDeg)));
  camera.lookAt(eye.clone().add(dir));
  camera.updateMatrixWorld(true);
  return camera;
}
