// Checks: the air refuelling run (approved: Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build')), from its defaults in still
//   air over flat ground: the stand-in receiver takes off from CYMJ and leaves the runway, passes the IP, ends the join at
//   the pre-contact point behind the tanker's left basket, it is never ahead of the tanker's wing line from the tanker's
//   roll-out on, and the tanker never goes below its set height (what a pilot would recognise: it got airborne, it made
//   the IP, it joined, it never overran, the tanker held its height). Since RS-19 was amended (Dad, 20 Oct 2026: the
//   tanker "should really stay in orbit at the ARCP until the reciever hits "IP inbound""): until the receiver is IP
//   inbound the tanker stays in its hold at the ARCP (the place), never more than one of its turn radii out toward the IP.
// Serves: RS-R11, RS-R12, RS-R14 and RS-R19 (docs/modules/run-in-sim/testing.md; plan Steps 7, 7b and 7d).
// Expected values: the ground at CYMJ's field height (Patrick's 1,892 ft), the pre-contact point the test works out from the settings (the set pre-contact distance behind the
//   basket, and the basket's place on the tanker, the drogue's numbers), the IP the test works out from the settings (the
//   set distance back along the set track from the place), the ground the test lays and the tanker's set height; IP
//   inbound read off the receiver's own flight (the first moment it is on the IP's side of the track's square line,
//   heading inbound), and the tanker's turn radius from standard aerodynamics (r = V² ÷ (g tan φ) at the set bank, V its
//   true airspeed: the set KIAS over the standard day's density ratio at the set height, 0.7385 at 10,000 ft); nothing
//   from the code's own output or V6. Since RS-19 was amended the place is the ARCP and the IP is the set distance back
//   from it, so the IP check stands as written. The IP is passed within 0.5 NM: the pilot leads his turn onto the track there by up
//   to about a turn radius, as onto the run-in line. Margins: the pre-contact point within the shared table's loose formation margin, ±50 ft (a
//   station a pilot would call "in pre-contact"; wider than the ±20 ft close one because the point itself is an estimate);
//   the tanker's height within the shared ±100 ft (tests/helpers/tolerances.js); the hold's turn radius with a quarter of
//   a mile's slack (the radius here is worked without compressibility, and the roll into the turn widens it a little).
import test from 'node:test';
import assert from 'node:assert/strict';
import { flyRefuel, DROGUE, RECEIVER } from '../../../src/modules/run-in-sim/refuel.js';
import { DEFAULTS, runPatch, setupFrom } from '../../../src/modules/run-in-sim/defaults.js';
import { TOLERANCES } from '../../helpers/tolerances.js';
import { FT_PER_NM } from '../../../src/core/units.js';

test('the stand-in receiver takes off, passes the IP and joins to pre-contact behind the left basket, never ahead of the wing line; the tanker holds at the ARCP until IP inbound', () => {
  const groundFt = 1892; // flat ground at CYMJ's field height (Patrick's 1,892 ft)
  const world = { groundAt: () => groundFt, known: () => true };
  const settings = { ...DEFAULTS, ...runPatch('aar'), windTopKt: 0, windGroundKt: 0 };
  const { flight, tanker } = flyRefuel(setupFrom(settings), world);
  const tl = flight.timeline;
  const n = tl.t.length;

  // It leaves the runway (climbs well clear of the ground) and never goes below the ground.
  let highest = -Infinity;
  for (let i = 0; i < n; i++) {
    highest = Math.max(highest, tl.z[i] - groundFt);
    assert.ok(tl.z[i] >= groundFt - 1, `above the ground at ${tl.t[i].toFixed(1)} s`);
  }
  assert.ok(tl.z[0] - groundFt >= 0 && tl.z[0] - groundFt < 10, 'it starts on the runway (its centre a few feet over its wheels)');
  assert.ok(highest > 1000, 'it leaves the runway and climbs away');

  // It passes the IP: the set distance back from the place along the set track (magnetic plus the place's variation).
  const trackRad = ((settings.aarTrackDegM + settings.magVarDegE) * Math.PI) / 180;
  const u = { x: Math.sin(trackRad), y: Math.cos(trackRad) };
  const ip = { x: -u.x * settings.aarIpNm * FT_PER_NM, y: -u.y * settings.aarIpNm * FT_PER_NM };
  let nearestIp = Infinity;
  for (let i = 0; i < n; i++) nearestIp = Math.min(nearestIp, Math.hypot(tl.x[i] - ip.x, tl.y[i] - ip.y));
  assert.ok(nearestIp <= 0.5 * FT_PER_NM, `passes ${(nearestIp / FT_PER_NM).toFixed(2)} NM from the IP`);

  // Until IP inbound the tanker holds at the ARCP: never more than one of its turn radii (plus the slack) out from the
  // ARCP toward the IP. IP inbound: the first moment the receiver is past the IP's line square to the track, heading inbound.
  const alongOf = (x, y) => x * u.x + y * u.y;
  let ipInbound = null;
  for (let i = 1; i < n && ipInbound === null; i++) {
    const inbound = tl.vx[i] * u.x + tl.vy[i] * u.y > 0;
    if (tl.z[i] - groundFt > 10 && inbound && alongOf(tl.x[i], tl.y[i]) >= -settings.aarIpNm * FT_PER_NM) ipInbound = tl.t[i];
  }
  assert.ok(ipInbound !== null, 'the receiver comes IP inbound');
  const ktasHold = settings.aarTankerKias / Math.sqrt(0.7385); // standard day at 10,000 ft
  assert.equal(settings.aarHeightFt, 10000, 'the density ratio above is the standard day\'s at the default 10,000 ft');
  const vFtps = ktasHold * 1.68781;
  const radiusFt = (vFtps * vFtps) / (32.174 * Math.tan((settings.aarBankDeg * Math.PI) / 180));
  for (let i = 0; i < n; i++) {
    if (tl.t[i] >= ipInbound) break;
    const out = -alongOf(tanker.x[i], tanker.y[i]); // + toward the IP from the ARCP
    assert.ok(out <= radiusFt + 0.25 * FT_PER_NM, `the tanker holds at the ARCP until IP inbound (${(out / FT_PER_NM).toFixed(2)} NM toward the IP at ${tl.t[i].toFixed(1)} s)`);
  }

  const rollOut = flight.events.rollOut;
  assert.ok(Number.isFinite(rollOut), 'the tanker rolls out ahead of the receiver');

  // The tanker's nose (its air velocity) and left, at a stored step.
  const frame = (i) => {
    const v = Math.hypot(tanker.vx[i], tanker.vy[i]);
    const f = { x: tanker.vx[i] / v, y: tanker.vy[i] / v };
    return { f, l: { x: -f.y, y: f.x } };
  };

  // Never ahead of the tanker's wing line (the line through it square to its heading) from the roll-out on.
  for (let i = 0; i < n; i++) {
    if (tl.t[i] < rollOut) continue;
    const { f } = frame(i);
    const ahead = (tl.x[i] - tanker.x[i]) * f.x + (tl.y[i] - tanker.y[i]) * f.y;
    assert.ok(ahead < 0, `behind the wing line at ${tl.t[i].toFixed(1)} s (${ahead.toFixed(0)} ft)`);
  }

  // At the end: at pre-contact, the receiver's nose the set distance behind the left basket.
  const i = n - 1;
  const { f, l } = frame(i);
  const down = (DROGUE.hoseDownDeg * Math.PI) / 180;
  const behindFt = DROGUE.hoseFt * Math.cos(down) - DROGUE.podTailAheadFt + settings.aarPreContactFt + RECEIVER.noseAheadFt;
  const pre = {
    x: tanker.x[i] - f.x * behindFt + l.x * DROGUE.podOutFt,
    y: tanker.y[i] - f.y * behindFt + l.y * DROGUE.podOutFt,
    z: tanker.z[i] + DROGUE.podUpFt - DROGUE.hoseFt * Math.sin(down),
  };
  const offFt = Math.hypot(tl.x[i] - pre.x, tl.y[i] - pre.y, tl.z[i] - pre.z);
  assert.ok(offFt <= TOLERANCES.FORMATION_LOOSE_FT, `ends ${offFt.toFixed(0)} ft from the pre-contact point`);

  // The tanker never below its set height by more than the shared margin.
  for (let k = 0; k < n; k++) {
    assert.ok(tanker.z[k] >= settings.aarHeightFt - TOLERANCES.ALTITUDE_FT, `the tanker at ${tanker.z[k].toFixed(0)} ft at ${tl.t[k].toFixed(1)} s`);
  }
});
