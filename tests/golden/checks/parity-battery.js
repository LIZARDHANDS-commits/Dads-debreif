// Runs every src/core function on fixed inputs and returns the results as
// strings, so Node and Chromium can be compared exactly (including -0 and NaN).
export async function battery(base) {
  const units = await import(base + '/src/core/units.js');
  const angles = await import(base + '/src/core/angles.js');
  const geo = await import(base + '/src/core/geo.js');
  const time = await import(base + '/src/core/time.js');
  const fm = await import(base + '/src/core/flight-math.js');
  const tennis = await import(base + '/src/core/tennis.js');
  const standards = await import(base + '/src/core/standards.js');
  const out = [];
  const show = v => (typeof v === 'number' ? (Object.is(v, -0) ? '-0' : String(v)) : JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x)));
  const rec = (name, v) => out.push(name + ' = ' + show(v));
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const nums = [0, -0, 1, -1, Math.PI, -Math.PI, 3 * Math.PI, 100, -100, NaN, ...Array.from({ length: 200 }, () => (rnd() - 0.5) * 80)];
  for (const k of ['FT_PER_NM', 'KT_TO_FTPS', 'FTPS_TO_KT', 'FT_PER_M', 'M_PER_FT', 'G_FTPS2', 'EARTH_RADIUS_M']) rec(k, units[k]);
  for (const n of nums) {
    rec(`ktToFtps(${n})`, units.ktToFtps(n * 5)); rec(`ftpsToKt(${n})`, units.ftpsToKt(n * 9)); rec(`formatNm(${n})`, units.formatNm(n * 1000));
    rec(`degToRad(${n})`, angles.degToRad(n * 20)); rec(`radToDeg(${n})`, angles.radToDeg(n));
    rec(`wrapDeg180(${n})`, angles.wrapDeg180(n * 20)); rec(`wrapPi(${n})`, angles.wrapPi(n));
    rec(`angleDiffRad(${n})`, angles.angleDiffRad(n, 0.7)); rec(`absAngleDeg(${n})`, angles.absAngleDeg(n));
    rec(`headingRadToCompassDeg(${n})`, angles.headingRadToCompassDeg(n)); rec(`compassDegToHeadingRad(${n})`, angles.compassDegToHeadingRad(n * 9));
    rec(`unitVectorFromCompassDeg(${n})`, angles.unitVectorFromCompassDeg(n * 9));
    const a = { x: n * 300, y: -n * 170, hdg: n / 3 }, b = { x: n * 11, y: n * 470 };
    rec(`relativeBearingDeg(${n})`, angles.relativeBearingDeg(a, b)); rec(`aspectAngleDeg(${n})`, angles.aspectAngleDeg(a, b, n / 3));
    rec(`headingCrossAngleDeg(${n})`, angles.headingCrossAngleDeg(n, 1.3)); rec(`headingRad(${n})`, angles.headingRad(a, b)); rec(`distance(${n})`, geo.distance(a, b));
    rec(`clockToRelativeDeg(${n})`, angles.clockToRelativeDeg(Math.abs(n) % 13));
    const ref = geo.makeLocalRef(50.33 + n / 100, -105.56 + n / 50);
    rec(`makeLocalRef(${n})`, ref); rec(`latLonToLocalFt(${n})`, geo.latLonToLocalFt(ref, 50.4 + n / 90, -105.4 - n / 70));
    rec(`localFtToLatLon(${n})`, geo.localFtToLatLon(ref, n * 5000, -n * 3000));
    const z = Math.abs(Math.round(n)) % 20;
    const t = geo.lonLatToTile(-105.56 + n, 50.33 + n / 2, z);
    rec(`lonLatToTile(${n})`, t); rec(`tileBounds(${n})`, geo.tileBounds(t.x, t.y, z));
    rec(`pickTileZoom(${n})`, geo.pickTileZoom(50.33 + n, Math.abs(n) / 10 + 0.001));
    rec(`mercatorY(${n})`, geo.mercatorY(n * 2)); rec(`invMercatorY(${n})`, geo.invMercatorY(n / 20));
    rec(`lonLatToWorldPixel(${n})`, geo.lonLatToWorldPixel(-105.56 + n, 50.33 + n / 2, z));
  }
  for (const n of nums) {
    const kt = 100 + Math.abs(n) * 5, g = 1 + Math.abs(n) / 5, v = units.ktToFtps(kt);
    rec(`limitG(${n})`, fm.limitG(n, 9)); rec(`bankDegFromG(${n})`, fm.bankDegFromG(g));
    rec(`turnRadiusFt(${n})`, fm.turnRadiusFt(v, g)); rec(`turnRateRadPerSec(${n})`, fm.turnRateRadPerSec(v, g));
    rec(`isaDensityRatio(${n})`, fm.isaDensityRatio(n * 800));
    const a = { x: n * 30, y: n * 7 }, p = { x: n * 30 + v, y: n * 9 }, b = { x: n * 30 + 2 * v, y: n * 17 + 40, spdKt: n > 0 ? kt : undefined, altFt: n * 900 };
    rec(`emPoint(${n})`, fm.emPoint(a, { ...p, spdKt: b.spdKt, altFt: b.altFt }, b));
    rec(`closureKt(${n})`, fm.closureKt(a, { x: 3000, y: 100 }, p, { x: 3000 - n * 20, y: 90 }, 1)); rec(`formatClosureKt(${n})`, fm.formatClosureKt(n * 7));
    rec(`gFromTrack(${n})`, fm.gFromTrack(a, n / 10, b, n / 10 + g / 10, 2));
    const shooter = { x: 0, y: 0, altFt: 5000, spdKt: kt, hdg: n / 20 }, target = { x: 1500 + n * 20, y: n * 15, altFt: 5000 + n * 10, spdKt: 200 };
    const settings = { pitchDeg: n / 4, ballKt: 350, coneDeg: 6, tofSec: 3, gravity: n > 0 };
    rec(`tennisDebrief(${n})`, tennis.tennisDebrief({ ...settings, shooter, target, shooterHdg: n / 20, targetHdg: n / 7, hitRadiusFt: 250 }));
    rec(`tennis3D(${n})`, tennis.tennis3D({ ...settings, shooter, target, targetAt: t => ({ x: target.x + 300 * t, y: target.y + n * t, altFt: target.altFt }), radiusFt: 250 }));
  }
  for (const n of nums) {
    const hdg = n / 9, lead = { id: 1, x: n * 10, y: -n * 20, hdg, spdKt: 200 + n };
    const fleet = [lead, { id: 2, x: n * 130, y: 4800 - n * 40 }, { id: 3, x: -n * 90 + 900, y: -7800 + n * 60 }, { id: 4, x: n * 170 + 5100, y: -8100 }];
    const live = Object.fromEntries(fleet.map(a => [a.id, a]));
    for (const id of [2, 3, 4]) {
      rec(`classifyDebriefPosition(${n},${id})`, standards.classifyDebriefPosition(id, live, hdg));
      for (const f of ['weighted', 'offsetBox']) rec(`classifyTurnSimPosition(${n},${id},${f})`, standards.classifyTurnSimPosition(fleet[id - 1], fleet, f));
    }
    rec(`classifyLeadParameters(${n})`, standards.classifyLeadParameters(lead, 1 + n / 50));
  }
  const zones = ['America/Regina', 'America/Denver', 'America/Toronto', 'America/Los_Angeles', 'America/Edmonton', 'America/St_Johns', 'Asia/Kolkata', 'Europe/London', 'UTC'];
  const moments = [Date.UTC(2026, 2, 8, 8, 30), Date.UTC(2026, 2, 8, 9, 30), Date.UTC(2026, 10, 1, 6, 30), Date.UTC(2026, 10, 1, 8, 30), Date.UTC(2026, 6, 1, 6, 0), Date.UTC(2028, 1, 29, 23, 59, 59, 999),
    ...Array.from({ length: 150 }, () => Math.floor(Date.UTC(2020, 0, 1) + rnd() * 3.8e11))];
  for (const ms of moments) {
    const d = new Date(ms);
    rec(`formatZuluSeconds(${ms})`, time.formatZuluSeconds(ms / 1000)); rec(`formatZulu(${ms})`, time.formatZulu(d)); rec(`formatDtgZulu(${ms})`, time.formatDtgZulu(d));
    rec(`parseIsoSeconds(${ms})`, time.parseIsoSeconds(' ' + d.toISOString() + '\n'));
    for (const tz of zones) {
      rec(`formatInZone(${ms},${tz})`, time.formatInZone(d, tz)); rec(`zoneAbbreviation(${ms},${tz})`, time.zoneAbbreviation(d, tz)); rec(`utcOffsetMinutes(${ms},${tz})`, time.utcOffsetMinutes(d, tz));
    }
  }
  for (const w of ['2025-06-12T15:04:05-06:00', 'garbage', '']) rec(`parseIsoSeconds(${w})`, time.parseIsoSeconds(w));
  rec('formatZuluSeconds(NaN)', time.formatZuluSeconds(NaN));
  return out;
}
