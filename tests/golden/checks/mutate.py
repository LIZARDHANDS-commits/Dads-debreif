#!/usr/bin/env python3
"""Mutation check for src/core (SPEC-core, testing strategy 4).

Breaks the ports on purpose, one change at a time, runs the test suite, and
reports which changes no test noticed. Run before each core PR:

    python3 tests/golden/checks/mutate.py

Every surviving change must be explained as equivalent (it cannot change any
result) or get a new test. When core code changes, update the list below.
"""
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[3]
M = [
 ('units.js','FT_PER_NM = 6076.12','FT_PER_NM = 6076.115'),
 ('units.js','KT_TO_FTPS = 1.68781','KT_TO_FTPS = 1.6878'),
 ('units.js','FTPS_TO_KT = 0.592484','FTPS_TO_KT = 0.5924837511331251'),
 ('units.js','FT_PER_M = 3.28084','FT_PER_M = 3.2808399'),
 ('units.js','M_PER_FT = 0.3048','M_PER_FT = 0.30479'),
 ('units.js','G_FTPS2 = 32.174','G_FTPS2 = 32.17405'),
 ('units.js','EARTH_RADIUS_M = 6371000','EARTH_RADIUS_M = 6371008.8'),
 ('units.js','return kt * KT_TO_FTPS;','return kt * 1.6878;'),
 ('units.js','return ftps * FTPS_TO_KT;','return ftps / KT_TO_FTPS;'),
 ('units.js',".toFixed(2) + ' NM'",".toFixed(3) + ' NM'"),
 ('angles.js','return deg * Math.PI / 180;','return deg / 180 * Math.PI;'),
 ('angles.js','return rad * 180 / Math.PI;','return rad / Math.PI * 180;'),
 ('angles.js','while (deg > 180) deg -= 360;','while (deg >= 180) deg -= 360;'),
 ('angles.js','while (deg < -180) deg += 360;','while (deg <= -180) deg += 360;'),
 ('angles.js','while (rad > Math.PI) rad -= Math.PI * 2;','while (rad >= Math.PI) rad -= Math.PI * 2;'),
 ('angles.js','while (rad < -Math.PI) rad += Math.PI * 2;','while (rad <= -Math.PI) rad += Math.PI * 2;'),
 ('angles.js','return Math.atan2(Math.sin(a - b), Math.cos(a - b));','return wrapPi(a - b);'),
 ('angles.js','return Math.abs(radToDeg(wrapPi(rad)));','return Math.abs(radToDeg(Math.atan2(Math.sin(rad), Math.cos(rad))));'),
 ('angles.js','return Math.atan2(p1.y - p0.y, p1.x - p0.x);','return Math.atan2(p1.x - p0.x, p1.y - p0.y);'),
 ('angles.js','return wrapDeg180(radToDeg(brg - a.hdg));','return wrapDeg180(radToDeg(a.hdg - brg));'),
 ('angles.js','if (!Number.isFinite(c)) c = 12;','if (!Number.isFinite(c)) c = 0;'),
 ('angles.js','return wrapDeg180(-c * 30);','return wrapDeg180(c * 30);'),
 ('angles.js','return 180 - absAngleDeg(observerToTarget - observerHeading);','return absAngleDeg(observerToTarget - observerHeading);'),
 ('angles.js','if (!observer || !target || !Number.isFinite(observerHeading)) return null;','if (!observer || !target) return null;'),
 ('angles.js','if (!Number.isFinite(h1) || !Number.isFinite(h2)) return null;','if (!Number.isFinite(h1)) return null;'),
 ('angles.js','return absAngleDeg(h2 - h1);','return absAngleDeg(h1 - h2);'),
 ('angles.js','return degToRad(90 - compassDeg);','return degToRad(compassDeg - 90);'),
 ('angles.js','const wrapped = deg < 0 ? deg + 360 : deg;','const wrapped = deg;'),
 ('angles.js','return wrapped >= 360 || wrapped === 0 ? 0 : wrapped;','return wrapped;'),
 ('angles.js','return { x: Math.cos(r), y: Math.sin(r) };','return { x: Math.cos(r), y: -Math.sin(r) };'),
 ('geo.js','lat0: lat * Math.PI / 180,','lat0: lat * Math.PI / 180.0001,'),
 ('geo.js','export function latLonToLocalFt(ref, lat, lon) {\n  if (!ref) return null;','export function latLonToLocalFt(ref, lat, lon) {'),
 ('geo.js','export function localFtToLatLon(ref, x, y) {\n  if (!ref) return null;','export function localFtToLatLon(ref, x, y) {'),
 ('geo.js','x: (lon - ref.lon) * Math.PI / 180 * Math.cos(ref.lat0) * ref.R * FT_PER_M,','x: (lon - ref.lon) * Math.PI / 180 * Math.cos(ref.lat0 + 1e-9) * ref.R * FT_PER_M,'),
 ('geo.js','lat: ref.lat + (y / (FT_PER_M * ref.R)) * 180 / Math.PI,','lat: ref.lat + (y / (FT_PER_M * ref.R)) * 180.0001 / Math.PI,'),
 ('geo.js','lon: ref.lon + (x / (FT_PER_M * ref.R * Math.cos(ref.lat0))) * 180 / Math.PI,','lon: ref.lon + (x / (FT_PER_M * ref.R * Math.cos(ref.lat0))) * 180.0001 / Math.PI,'),
 ('geo.js','return Math.hypot(a.x - b.x, a.y - b.y);','return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);'),
 ('geo.js','x: Math.floor((lon + 180) / 360 * n),','x: Math.round((lon + 180) / 360 * n),'),
 ('geo.js','y: Math.floor((1 - Math.log(','y: Math.round((1 - Math.log('),
 ('geo.js','south: radToDeg(Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)))),','south: radToDeg(Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1.0001) / n)))),'),
 ('geo.js','east: (x + 1) / n * 360 - 180,','east: (x + 1.0001) / n * 360 - 180,'),
 ('geo.js','return Math.max(1, Math.min(19, z));','return Math.max(1, Math.min(18, z));'),
 ('geo.js','Math.max(metersPerCssPixel, 0.01)','Math.max(metersPerCssPixel, 0.1)'),
 ('geo.js','const metersPerCssPixel = (1 / zoomPxPerFt) / FT_PER_M;','const metersPerCssPixel = (1 / zoomPxPerFt) * 0.3048;'),
 ('geo.js','return Math.log(Math.tan(Math.PI / 4 + r / 2));','return Math.log(Math.tan(Math.PI / 4 + r / 2.0001));'),
 ('geo.js','return (2 * Math.atan(Math.exp(v)) - Math.PI / 2) * 180 / Math.PI;','return (2 * Math.atan(Math.exp(v)) - Math.PI / 2.0001) * 180 / Math.PI;'),
 ('geo.js','y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n * 256,','y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4.0001 * Math.PI)) * n * 256,'),
 ('time.js',"toISOString().substr(11, 8) + 'Z';","toISOString().substr(11, 5) + 'Z';"),
 ('time.js',"if (!Number.isFinite(sec)) return '--';","if (Number.isNaN(sec)) return '--';"),
 ('time.js',"return date.toISOString().slice(11, 19) + 'Z';","return date.toISOString().slice(11, 16) + 'Z';"),
 ('time.js','return Date.parse(String(text).trim()) / 1000;','return Date.parse(String(text)) / 1000;'),
 ('time.js','String(date.getUTCFullYear()).slice(-2)','String(date.getUTCFullYear()).slice(-4)'),
 ('time.js',"second: '2-digit', hour12: false }]","second: '2-digit', hour12: true }]"),
 ('time.js',"{ timeZoneName: 'short' }","{ timeZoneName: 'long' }"),
 ('time.js',"hourCycle: 'h23',","hourCycle: 'h24',"),
 ('time.js','return Math.round((wall.getTime() - Math.floor(date.getTime() / 1000) * 1000) / 60000);','return Math.round((wall.getTime() - date.getTime()) / 60000);'),
 ('time.js','wall.setUTCFullYear(+parts.year, +parts.month - 1, +parts.day);','wall.setTime(Date.UTC(+parts.year, +parts.month - 1, +parts.day));'),
 ('time.js','let formatter = byZone.get(timeZone);','let formatter = byZone.values().next().value;'),
 ('flight-math.js','export const MIN_TURN_G = 1.01;','export const MIN_TURN_G = 1.001;'),
 ('flight-math.js','return Math.max(MIN_TURN_G, Math.min(maxG, g));','return Math.max(MIN_TURN_G, g);'),
 ('flight-math.js','return radToDeg(Math.acos(1 / g));','return radToDeg(Math.asin(1 / g));'),
 ('flight-math.js','return speedFtps * speedFtps / (G_FTPS2 * Math.sqrt(g * g - 1));','return speedFtps * speedFtps / (G_FTPS2 * Math.sqrt(g * g));'),
 ('flight-math.js','return speedFtps / turnRadiusFt(speedFtps, g);','return G_FTPS2 * Math.sqrt(g * g - 1) / speedFtps;'),
 ('flight-math.js','const h = altFt * M_PER_FT, T0 = 288.15,','const h = altFt / FT_PER_M, T0 = 288.15,'),
 ('flight-math.js','if (h < 11000) {','if (h <= 11000) {'),
 ('flight-math.js','return Math.pow(T / T0, g / (R * L) - 1);','return Math.pow(T / T0, g / (R * L));'),
 ('flight-math.js','  return .297;\n','  return .2971;\n'),
 ('flight-math.js','if (!now || !before || !after) return null;','if (!now || !after) return null;'),
 ('flight-math.js','const turnRateDeg = Math.abs(wrapPi(h1 - h0)) * 180 / Math.PI;','const turnRateDeg = Math.abs(wrapPi(h1 - h0)) * 180 / Math.PI / 2;'),
 ('flight-math.js','Math.hypot(after.x - before.x, after.y - before.y) / 2 / KT_TO_FTPS','Math.hypot(after.x - before.x, after.y - before.y) / 2 * FTPS_TO_KT'),
 ('flight-math.js','const altFt = Number.isFinite(now.altFt) ? now.altFt : 6500;','const altFt = Number.isFinite(now.altFt) ? now.altFt : 8000;'),
 ('flight-math.js','Math.sqrt(Math.max(.15, isaDensityRatio(altFt)))','Math.sqrt(isaDensityRatio(altFt))'),
 ('flight-math.js','if (!nowA || !nowB || !prevA || !prevB || dtSec <= 0) return null;','if (!nowA || !nowB || !prevA || !prevB || dtSec < 0) return null;'),
 ('flight-math.js','return ((prevR - nowR) / dtSec) * FTPS_TO_KT;','return ((nowR - prevR) / dtSec) * FTPS_TO_KT;'),
 ('flight-math.js',"if (kt === null || !Number.isFinite(kt)) return '--';","if (kt === null) return '--';"),
 ('flight-math.js',"if (Math.abs(rounded) < 1) return '0 kt';","if (Math.abs(kt) < 1) return '0 kt';"),
 ('flight-math.js',"return (rounded > 0 ? '+' : '') + rounded + ' kt';","return rounded + ' kt';"),
 ('flight-math.js','  if (!p0 || !p1) return null;\n  const omega','  const omega'),
 ('flight-math.js','const omega = Math.abs(wrapPi(h1 - h0)) / dtSec;','const omega = Math.abs(h1 - h0) / dtSec;'),
 ('flight-math.js','fps < 20) return null;','fps < 10) return null;'),
 ('flight-math.js','if (!Number.isFinite(g) || g < 0.8 || g > 9) return null;','if (!Number.isFinite(g) || g > 9) return null;'),
 ('flight-math.js','if (!Number.isFinite(g) || g < 0.8 || g > 9) return null;','if (!Number.isFinite(g) || g < 0.8) return null;'),
 ('tennis.js','const tof = Math.max(.25, tofSec);\n  const hitRadius','const tof = tofSec;\n  const hitRadius'),
 ('tennis.js','const hitRadius = Math.max(10, hitRadiusFt);','const hitRadius = Math.max(1, hitRadiusFt);'),
 ('tennis.js','const vx = dir.x * (sv + ballFps * Math.cos(pitch));','const vx = dir.x * (sv + ballFps) * Math.cos(pitch);'),
 ('tennis.js','const vz = shooterClimbFps + ballFps * Math.sin(pitch);','const vz = (sv + ballFps) * Math.sin(pitch);'),
 ('tennis.js','const vz = shooterClimbFps + ballFps * Math.sin(pitch);','const vz = ballFps * Math.sin(pitch);'),
 ('tennis.js','const there = targetAt(tau) || target;','const there = target;'),
 ('tennis.js','altFt: there.altFt || 0, tau };','altFt: target.altFt || 0, tau };'),
 ('tennis.js',"if (inConeNow) status = best.dist <= hitRadius ? 'INTERCEPT' : 'IN CONE';","status = best.dist <= hitRadius ? 'INTERCEPT' : inConeNow ? 'IN CONE' : status;"),
 ('tennis.js','const inConeNow = losAngle <= coneDeg / 2;','const inConeNow = losAngle <= coneDeg;'),
 ('tennis.js','const steps = Math.max(8, Math.ceil(tof / .15));','const steps = Math.max(8, Math.ceil(tof / .2));'),
 ('tennis.js','(gravity ? 0.5 * G_FTPS2 * tau * tau : 0)','(gravity ? G_FTPS2 * tau * tau : 0)'),
 ('tennis.js','if (d < best.dist) best =','if (d <= best.dist) best ='),
 ('tennis.js',"best.dist <= hitRadius ? 'INTERCEPT'","best.dist < hitRadius ? 'INTERCEPT'"),
 ('tennis.js','(target.altFt || 0) - (shooter.altFt || 0));\n  return','0);\n  return'),
 ('standards.js','spread: Object.freeze({ on: true, minFt: 4000, maxFt: 6000, foreAftTolFt: 250 }),','spread: Object.freeze({ on: true, minFt: 4100, maxFt: 6000, foreAftTolFt: 250 }),'),
 ('standards.js','offset: Object.freeze({ on: true, aftTargetFt: 8000, aftTolFt: 1000 }),','offset: Object.freeze({ on: true, aftTargetFt: 8000, aftTolFt: 900 }),'),
 ('standards.js','targetKt: 200, speedTolKt: 10, targetG: 1.0, gTol: 0.2 }),','targetKt: 200, speedTolKt: 10, targetG: 1.0, gTol: 0.25 }),'),
 ('standards.js','spread: Object.freeze({ on: true, minFt: 4000, maxFt: 6000, sweepMinDeg: 0, sweepMaxDeg: 10 }),','spread: Object.freeze({ on: true, minFt: 4000, maxFt: 6000, sweepMinDeg: 0, sweepMaxDeg: 11 }),'),
 ('standards.js','offset: Object.freeze({ on: true, aftTargetFt: 7000, aftTolFt: 1000 }),','offset: Object.freeze({ on: true, aftTargetFt: 8000, aftTolFt: 1000 }),'),
 ('standards.js','lowTargetKt: 220, midTargetKt: 200, lowBlockTopFt: 10250,','lowTargetKt: 220, midTargetKt: 200, lowBlockTopFt: 10000,'),
 ('standards.js','const SAME_SIDE_FT = 500;','const SAME_SIDE_FT = 400;'),
 ('standards.js','const SLOT_MARGIN_FT = 500;','const SLOT_MARGIN_FT = 400;'),
 ('standards.js','left: { x: Math.cos(leadHdg + Math.PI / 2), y: Math.sin(leadHdg + Math.PI / 2) },','left: { x: Math.cos(leadHdg - Math.PI / 2), y: Math.sin(leadHdg - Math.PI / 2) },'),
 ('standards.js','if (!lead || !p || id === 1) return null;','if (!lead || !p) return null;'),
 ('standards.js','if (Math.sign(lat3) === Math.sign(lateralFromLead) && Math.abs(lat3) > SAME_SIDE_FT) ref = live[3];','if (Math.abs(lat3) > SAME_SIDE_FT) ref = live[3];'),
 ('standards.js','if (id === 4 && live[3]) {','if (id === 2 && live[3]) {'),
 ('standards.js',"  if (spread.on) {\n    if (interval < spread.minFt) labels.push('TIGHT');","  if (spread.on) {\n    if (interval <= spread.minFt) labels.push('TIGHT');"),
 ('standards.js',"offsetAftFt = -foreAft;","offsetAftFt = foreAft;"),
 ('standards.js',"const offsetJudges3 = offset.on && id === 3;","const offsetJudges3 = offset.on && id !== 2;"),
 ('standards.js',"else offsetStatus = 'OFFSET OK';","else offsetStatus = 'ON PARAMETERS';"),
 ('standards.js',"if (!labels.length && (spread.on || offset.on)) labels.push('ON PARAMETERS');","if (!labels.length) labels.push('ON PARAMETERS');"),
 ('standards.js','  if (!on) return null;\n','\n'),
 ('standards.js','const gVal = Number.isFinite(nativeG) ? nativeG : estG;','const gVal = Number.isFinite(estG) ? estG : nativeG;'),
 ('standards.js','const spd = lead.spdKt || 0;','const spd = lead.spdKt || 200;'),
 ('standards.js',"else if (spd > targetKt + speedTol) labels.push('FAST');","else if (spd >= targetKt + speedTol) labels.push('FAST');"),
 ('standards.js',"else if (gVal > targetG + gTol) labels.push('HIGH G');","else if (gVal > targetG) labels.push('HIGH G');"),
 ('standards.js',"${lead.gTol.toFixed(2)} G`","${lead.gTol.toFixed(1)} G`"),
 ('standards.js',"if (formation === 'offsetBox') {","if (formation !== 'weighted') {"),
 ('standards.js',"const minLat = Math.min(0, lat2), maxLat = Math.max(0, lat2);","const minLat = Math.min(0, -lat2), maxLat = Math.max(0, -lat2);"),
 ('standards.js',"if (Number.isFinite(spread.sweepMaxDeg)) {","if (false) {"),
 ('standards.js',"if (sweepDeg < (Number.isFinite(spread.sweepMinDeg) ? spread.sweepMinDeg : 0)) return 'FORE';","if (sweepDeg < (Number.isFinite(spread.sweepMinDeg) ? spread.sweepMinDeg : 0) - 0.5) return 'FORE';"),
 ('standards.js',"if (sweepDeg < (Number.isFinite(spread.sweepMinDeg) ? spread.sweepMinDeg : 0)) return 'FORE';","if (sweepDeg < 0) return 'FORE';"),
 ('standards.js',"if (sweepDeg > spread.sweepMaxDeg) return 'AFT';","if (sweepDeg >= spread.sweepMaxDeg + 0.01) return 'AFT';"),
 ('standards.js',"return radToDeg(Math.atan2(-along(p, ref, fwd), interval));","return radToDeg(Math.atan2(along(p, ref, fwd), interval));"),
 ('standards.js',"const sweepDeg = sweepDegFrom(p, ref, fwd, interval);","const sweepDeg = sweepDegFrom(p, lead, fwd, interval);"),
 ('standards.js',"sweepDeg = sweepDegFrom(a, three, fwd, interval);","sweepDeg = sweepDegFrom(a, lead, fwd, interval);"),
 ('standards.js',"sweepDeg = sweepDegFrom(a, ref, fwd, interval);","sweepDeg = sweepDegFrom(a, lead, fwd, interval);"),
 ('standards.js',"const fa = offsetJudges3 ? null : spreadForeAft(spread, foreAft, sweepDeg);","const fa = spreadForeAft(spread, foreAft, sweepDeg);"),
 ('standards.js',"if (!Number.isFinite(leadStd.lowTargetKt)) return { targetKt: leadStd.targetKt, block: null };","if (false) return { targetKt: leadStd.targetKt, block: null };"),
 ('standards.js',"if (Number.isFinite(altFt) && altFt <= leadStd.lowBlockTopFt)","if (Number.isFinite(altFt) && altFt < leadStd.lowBlockTopFt)"),
 ('standards.js',"if (Number.isFinite(altFt) && altFt <= leadStd.lowBlockTopFt)","if (!(altFt > leadStd.lowBlockTopFt))"),
 ('standards.js',"return { targetKt: leadStd.midTargetKt, block: 'mid' };","return { targetKt: leadStd.lowTargetKt, block: 'mid' };"),
 ('standards.js',"const foreAftFrom3 = along(a, three, fwd);","const foreAftFrom3 = along(a, lead, fwd);"),
 ('standards.js',"interval = Math.abs(across(a, three, left));","interval = Math.abs(across(a, lead, left));"),
 ('standards.js',"      measureNote = 'front element';\n","\n"),
 ('standards.js',"return { labels: labels.length ? labels : ['ON SPACING'], intervalFt: aftDistance,","return { labels: labels.length ? labels : ['ON PARAMETERS'], intervalFt: aftDistance,"),
]


def suite_passes():
    try:
        run = subprocess.run(['node', '--test', 'tests/**/*.test.js'], cwd=ROOT, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        return False  # a change that makes the suite hang counts as caught
    return run.returncode == 0


if not suite_passes():
    raise SystemExit('The suite fails before any change; fix it before running the mutation check.')

caught, survived = 0, []
for f, a, b in M:
    p = ROOT / 'src/core' / f
    orig = p.read_text()
    assert orig.count(a) == 1, f'{f}: expected exactly one {a!r}; update this list'
    p.write_text(orig.replace(a, b))
    try:
        if suite_passes():
            survived.append((f, a, b))
        else:
            caught += 1
    finally:
        p.write_text(orig)
print(f'{caught} of {len(M)} mutations caught')
for s in survived:
    print('SURVIVED', s)
