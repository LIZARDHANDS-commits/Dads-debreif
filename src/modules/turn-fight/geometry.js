// The Turn Fight's start geometry (SPEC-turn-fight, "Start geometry and altitudes
// (R28)"): where the two jets are and which way they point at T+0, from the
// range, the off-nose angle (ATA) and the aspect angle (AA), each with its side;
// the heading crossing angle (HCA) that follows; the pass; and which way each jet
// turns. Pure numbers, no page access. The turn math is not here: this only
// places the start and finds the pass (SMM 12.2 paras 5 to 9).
//
// Units: feet, seconds, radians, as sim.js. Heading 0 is east (+x), counter-clockwise
// is positive, so "left" is counter-clockwise from a nose.
import { KT_TO_FTPS, FT_PER_NM } from '../../core/units.js';
import { wrapPi, degToRad, headingCrossAngleDeg } from '../../core/angles.js';

/**
 * The start when nothing is changed: head-on (Red dead ahead of Blue, pointing at
 * it), Red level with Blue, turns starting at the pass. At these the fight is
 * V6's, with the centre start of Q49. The sides do not matter at 0° and 180°.
 *
 *  - `startAtaDeg`, `startAtaSide`: where Red sits off Blue's nose, 0 to 180°, 'left' or 'right'.
 *  - `startAaDeg`, `startAaSide`: Red's aspect angle, where Blue sits off Red's tail, 0 to 180°
 *    (180° is Red pointing at Blue), and which side of Red Blue is on.
 *  - `redAboveFt`: Red's starting height above Blue (used with Climb and dive only).
 *  - `turnsAt`: 'pass' (each jet flies straight until the range stops closing) or 'once' (T+0).
 *
 * @type {Readonly<{ startAtaDeg: number, startAtaSide: string, startAaDeg: number, startAaSide: string, redAboveFt: number, turnsAt: string }>}
 */
export const START_DEFAULTS = Object.freeze({
  startAtaDeg: 0,
  startAtaSide: 'left',
  startAaDeg: 180,
  startAaSide: 'left',
  redAboveFt: 0,
  turnsAt: 'pass',
});

/** The fight stops after this long (sim.js FIGHT_MAX_SEC, pinned by a test): a pass later than this is never reached. */
export const MAX_PASS_SEC = 600;

/** +1 for a turn to the left (counter-clockwise), −1 to the right. */
export const sideSign = (side) => (side === 'right' ? -1 : 1);

/** Head-on is ATA 0° with AA 180° exactly; the side is a tie there (V6's directions stand). */
export function isHeadOn(setup) {
  return setup.startAtaDeg === 0 && setup.startAaDeg === 180;
}

/**
 * Places both jets from the range, ATA and AA (each with its side), speeds in `setup`
 * ({ separationNm, blueKt, redKt, startAtaDeg, startAtaSide, startAaDeg, startAaSide }).
 *
 * Blue heads east. Red is the range away, `startAtaDeg` off Blue's nose on its side.
 * Red's heading puts Blue `180° − AA` off Red's nose, on Red's side. Both fly
 * straight, so the pass is where the range is smallest: the time t = −(r·v)/|v|²,
 * with r the vector from Blue to Red and v Red's velocity relative to Blue.
 * Then both are moved, without turning, so the midpoint between them where the turns
 * start (the pass; T+0 with `turnsAt: 'once'`) is the origin (Q49 does this for the head-on merge).
 *
 * Returns { blue, red } as { xFt, yFt, headingRad }, `passSec` (0 when the
 * range is not closing or the pass is after 10 minutes), `closing`, and `hcaDeg`, 0 to 180°.
 */
export function startGeometry(setup) {
  const rangeFt = setup.separationNm * FT_PER_NM;
  const ataRad = sideSign(setup.startAtaSide) * degToRad(setup.startAtaDeg);
  const losFromRed = ataRad + Math.PI; // the line from Red back to Blue
  const redHeading = wrapPi(losFromRed - sideSign(setup.startAaSide) * (Math.PI - degToRad(setup.startAaDeg)));
  const blueSpeed = setup.blueKt * KT_TO_FTPS, redSpeed = setup.redKt * KT_TO_FTPS;
  // Blue at the origin heading east; Red the range away.
  const rx = rangeFt * Math.cos(ataRad), ry = rangeFt * Math.sin(ataRad);
  const vx = redSpeed * Math.cos(redHeading) - blueSpeed, vy = redSpeed * Math.sin(redHeading);
  const closeRate = -(rx * vx + ry * vy); // positive while the range is closing
  const speedSq = vx * vx + vy * vy;
  // Closing only when it is more than rounding noise (a 90° beam start reports ~1e-15), and the pass comes within the fight.
  const closingNow = speedSq > 0 && closeRate > 1e-9 * rangeFt * Math.sqrt(speedSq);
  const closing = closingNow && closeRate / speedSq < MAX_PASS_SEC;
  const passSec = closing ? closeRate / speedSq : 0;
  // The midpoint between the jets where the turns start, to be the origin: at the pass, or at T+0
  // with the turns at once (and when there is no pass, which is the same thing).
  const t = setup.turnsAt === 'once' ? 0 : passSec;
  const midX = (blueSpeed * t + rx + redSpeed * Math.cos(redHeading) * t) / 2;
  const midY = (ry + redSpeed * Math.sin(redHeading) * t) / 2;
  return {
    blue: { xFt: -midX, yFt: -midY, headingRad: 0 },
    red: { xFt: rx - midX, yFt: ry - midY, headingRad: redHeading },
    passSec,
    closing,
    hcaDeg: headingCrossAngleDeg(0, redHeading),
  };
}

/** Which side of a jet's nose a point is on, +1 left, −1 right, 0 when it is ahead, astern or not there (a tie). */
function sideOf(from, dxFt, dyFt) {
  const length = Math.hypot(dxFt, dyFt);
  if (!(length >= 1)) return 0;
  const cross = Math.cos(from.headingRad) * dyFt - Math.sin(from.headingRad) * dxFt;
  return Math.abs(cross) <= 1e-9 * length ? 0 : Math.sign(cross);
}

/**
 * Which way each jet turns, +1 counter-clockwise (left) or −1 (right), before the
 * 1-circle flip for Red: each turns toward the other, from where they are when
 * the turns start (the pass, or T+0 with `turnsAt: 'once'` or no pass ahead).
 * At exactly head-on, or any geometry where the other is dead ahead or astern,
 * the side is a tie and V6's direction stands (+1). When the jets would be at
 * one point at the pass, the side they were set up on decides, with the same tie.
 * `geometry` is startGeometry(setup).
 */
export function turnDirections(setup, geometry) {
  const { blue, red } = geometry;
  const t = setup.turnsAt === 'once' ? 0 : geometry.passSec;
  const bx = blue.xFt + Math.cos(blue.headingRad) * setup.blueKt * KT_TO_FTPS * t;
  const by = blue.yFt + Math.sin(blue.headingRad) * setup.blueKt * KT_TO_FTPS * t;
  const rx = red.xFt + Math.cos(red.headingRad) * setup.redKt * KT_TO_FTPS * t;
  const ry = red.yFt + Math.sin(red.headingRad) * setup.redKt * KT_TO_FTPS * t;
  const tie = (deg) => deg === 0 || deg === 180;
  const fallback = {
    blue: tie(setup.startAtaDeg) ? 1 : sideSign(setup.startAtaSide),
    red: tie(setup.startAaDeg) ? 1 : sideSign(setup.startAaSide),
  };
  return {
    blue: sideOf(blue, rx - bx, ry - by) || fallback.blue,
    red: sideOf(red, bx - rx, by - ry) || fallback.red,
  };
}

/**
 * One line for the Start geometry section: when the jets pass, or that there is no pass
 * (the turns then start at once). `setup` has the range, speeds, ATA, AA and `turnsAt`.
 */
export function passNote(setup) {
  const g = startGeometry(setup);
  if (!g.closing) return 'No pass: the turns start at once';
  const at = `T+${g.passSec.toFixed(1)} s`;
  return setup.turnsAt === 'once' ? `Turns start at once (the jets pass at ${at})` : `Pass at ${at}`;
}

/**
 * Which way each jet will turn, as a line for the Start geometry section: "Blue turns left, Red turns right".
 * It is the rule of turnDirections (each toward the other from where the turns start) with the 1-circle
 * flip for Red, the same the fight flies (sim.js), so the student sees what 1-circle and 2-circle will do
 * from this start before pressing Play. `setup` has the start geometry, speeds and `circles`.
 * With First nose chases on, each jet turns toward the other after first nose-on whatever this says.
 */
export function turnNote(setup) {
  const dir = turnDirections(setup, startGeometry(setup));
  const red = setup.circles === 1 ? -dir.red : dir.red;
  const word = (d) => (d > 0 ? 'left' : 'right');
  return `Blue turns ${word(dir.blue)}, Red turns ${word(red)}`;
}
