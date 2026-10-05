// The ejection on screen (Patrick, 5 Oct 06:29Z; Traffic decision TR-75): where the seat, the parachute and the
// abandoned aircraft are a given time after a PFL that can't make the runway ejects. Pure: the 2D map and the 3D view
// both read it from the sim's record of the ejection (a.ejectAt = { x, y, alt, t, headingDeg, kias }), so a rewind
// or a replay shows the same thing. Every number here is an estimate for the picture, not a seat's published data.

import { KT_TO_FTPS } from '../../core/units.js';
import { windVectorFtps } from '../../core/wind.js';
import { iasToTasKt } from '../../core/t6-performance.js';

export const EJECTION = Object.freeze({
  /** The seat rises this far above where it left the aircraft, ft, over riseSec (estimates). */
  riseFt: 150,
  riseSec: 1.2,
  /** The seat falls away and the parachute starts to open this long after the ejection, s, and is full this long later (estimates). */
  chuteStartSec: 2,
  chuteOpenSec: 1.5,
  /** Coming down under the parachute, ft/s (an estimate: about 1,200 ft/min). */
  descentFtps: 20,
  /** The pilot loses the aircraft's forward speed through the air over about this long, s (an estimate). */
  slowSec: 1.5,
  /** The abandoned aircraft's nose drops this fast, °/s, to this steepest dive, ° (estimates). */
  noseDropDps: 6,
  steepestDiveDeg: 40,
});

const RAD = Math.PI / 180;

/**
 * Where everything is `sinceSec` after the ejection `ej` = { x, y, alt, headingDeg, kias }, in the wind
 * { windFromDeg, windKt }, over ground at `groundFt`. Returns
 * { person: { x, y, alt }, seat: boolean, chuteOpen: 0..1, down: boolean, aircraft: { x, y, alt, headingDeg, pitchDeg, kt } | null }:
 * `seat` while the pilot is still in the seat, `chuteOpen` how far the canopy is open (0 on the ground: collapsed),
 * `down` once the pilot is on the ground, and the aircraft until it reaches the ground.
 */
export function ejectionAt(ej, sinceSec, wind = {}, groundFt = 0) {
  const t = Math.max(0, sinceSec);
  const w = windVectorFtps(Number.isFinite(wind.windFromDeg) ? wind.windFromDeg : 360, Number.isFinite(wind.windKt) ? wind.windKt : 0);
  const hdg = (Number.isFinite(ej.headingDeg) ? ej.headingDeg : 0) * RAD;
  const vFtps = iasToTasKt(Number.isFinite(ej.kias) ? ej.kias : 125, ej.alt) * KT_TO_FTPS;
  const E = EJECTION;

  // The pilot: up the rails and over the top, then under the canopy, carried by the wind all the way.
  const topAlt = ej.alt + E.riseFt;
  const landSec = E.riseSec + Math.max(0, topAlt - groundFt) / E.descentFtps;
  const tp = Math.min(t, landSec);
  const ahead = vFtps * E.slowSec * (1 - Math.exp(-tp / E.slowSec));
  const alt = tp <= E.riseSec ? ej.alt + E.riseFt * Math.sin((tp / E.riseSec) * Math.PI / 2) : topAlt - E.descentFtps * (tp - E.riseSec);
  const down = t >= landSec;
  const person = { x: ej.x + ahead * Math.sin(hdg) + w.x * tp, y: ej.y + ahead * Math.cos(hdg) + w.y * tp, alt: Math.max(groundFt, alt) };
  const chuteOpen = down ? 0 : Math.max(0, Math.min(1, (t - E.chuteStartSec) / E.chuteOpenSec));

  // The aircraft: on at its speed, the nose dropping into a steepening dive, until it reaches the ground.
  const k = E.noseDropDps * RAD, gMax = E.steepestDiveDeg * RAD, t1 = gMax / k;
  const along = (s) => (s <= t1 ? Math.sin(k * s) / k : Math.sin(gMax) / k + (s - t1) * Math.cos(gMax));
  const drop = (s) => (s <= t1 ? (1 - Math.cos(k * s)) / k : (1 - Math.cos(gMax)) / k + (s - t1) * Math.sin(gMax));
  const aircraftAlt = ej.alt - vFtps * drop(t);
  const aircraft = aircraftAlt <= groundFt ? null : {
    x: ej.x + vFtps * along(t) * Math.sin(hdg) + w.x * t,
    y: ej.y + vFtps * along(t) * Math.cos(hdg) + w.y * t,
    alt: aircraftAlt,
    headingDeg: ej.headingDeg,
    pitchDeg: -Math.min(gMax, k * t) / RAD,
    kt: ej.kias,
  };
  return { person, seat: t < E.chuteStartSec, chuteOpen, down, aircraft };
}
