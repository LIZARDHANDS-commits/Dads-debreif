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
 ('time.js','for (let dm = -1; dm <= 1; dm++) {','for (let dm = -1; dm <= 0; dm++) {'),
 ('time.js','return cand.sort((a, b) => Math.abs(a - ref) - Math.abs(b - ref))[0];','return cand.sort((a, b) => Math.abs(b - ref) - Math.abs(a - ref))[0];'),
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
