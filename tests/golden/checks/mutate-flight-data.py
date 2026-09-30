#!/usr/bin/env python3
"""Mutation check for src/flight-data (SPEC-flight-data, testing strategy 5).

Breaks the code on purpose, one change at a time, runs the flight-data tests,
and reports which changes no test noticed. Run before each flight-data PR:

    python3 tests/golden/checks/mutate-flight-data.py

Every surviving change must be explained as equivalent (it cannot change any
result) or get a new test. When flight-data code changes, update the list.
"""
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / 'src/flight-data'
TESTS = ['tests/golden/flight-data-*.test.js', 'tests/unit/flight-data/*.test.js']
M = [
 # kml.js: V6's reader
 ('kml.js', "when[i] ?? i", "when[i] ?? i + 1"),
 ('kml.js', ".filter(Number.isFinite);", ";"),
 ('kml.js', ".filter(Boolean);", ";"),
 ('kml.js', "a.length >= 2 && Number.isFinite(a[0])", "a.length >= 3 && Number.isFinite(a[0])"),
 ('kml.js', "altM: Number.isFinite(a[2]) ? a[2] : 0", "altM: Number.isFinite(a[2]) ? a[2] : null"),
 ('kml.js', "nativeG[idx] ?? nativeG[i] ?? null", "nativeG[i] ?? nativeG[idx] ?? null"),
 ('kml.js', "when[i] ?? idx", "when[idx] ?? idx"),
 ('kml.js', ".sort((a, b) => a.t - b.t)", ".sort((a, b) => b.t - a.t)"),
 ('kml.js', "if (fixes.length < 2)", "if (fixes.length < 1)"),
 ('kml.js', "v > 0 && v < 12", "v > 0 && v <= 12"),
 ('kml.js', "Math.abs(v) <= 90", "Math.abs(v) < 90"),
 ('kml.js', "(g|gforce|", "(gforce|"),
 ('kml.js', "/speed|alt|lat|lon|course|track|time/", "/alt|lat|lon|course|track|time/"),
 ('kml.js', "if (clean.filter(v => v !== null).length >= 2) return clean;", "if (clean.length >= 2) return clean;"),
 ('kml.js', "node.getAttribute('name') || node.getAttribute('displayName')", "node.getAttribute('name')"),
 ('kml.js', ".filter(kind.valid);", ".map(v => (kind.valid(v) ? v : null));"),
 ('kml.js', "if (vals.length >= 2) return vals;", "if (vals.length >= 1) return vals;"),
 ('kml.js', "if (xml.getElementsByTagName('parsererror').length)", "if (false)"),
 ('kml.js', "text.length > MAX_FILE_BYTES", "text.length > MAX_FILE_BYTES + 1"),
 ('kml.js', "if (gx.length > MAX_FIXES)", "if (gx.length > MAX_FIXES + 1)"),
 ('kml.js', "if (fixes.length > MAX_FIXES)", "if (fixes.length > MAX_FIXES + 1)"),
 ('kml.js', "return t === '' ? NaN : Number(t);", "return Number(t);"),
 ('kml.js', "Math.abs(v) <= 180", "Math.abs(v) < 180"),
 ('kml.js', "bank[idx] ?? bank[i] ?? null", "bank[i] ?? null"),
 # xml.js: well-formedness and text
 ('xml.js', "if (current.name !== name)", "if (false)"),
 ('xml.js', "if (current === doc && rootSeen) fail(", "if (false) fail("),
 ('xml.js', "fail(text.startsWith('<!DOCTYPE', i)", "if (!text.startsWith('<!DOCTYPE', i)) fail(text.startsWith('<!DOCTYPE', i)"),
 ('xml.js', "if (!semi) fail(", "if (false) fail("),
 ('xml.js', "if (!m) fail(`unknown entity", "if (false) fail(`unknown entity"),
 ('xml.js', "if (++depth > MAX_DEPTH)", "if (++depth > MAX_DEPTH + 1)"),
 ('xml.js', "if (quote !== '\"' && quote !== \"'\")", "if (false)"),
 ('xml.js', "if (attrs.has(attr)) fail(", "if (false) fail("),
 ('xml.js', "!declared.has(parts[0])", "false"),
 ('xml.js', "if (chunk.includes(']]>'))", "if (false)"),
 ('xml.js', "for (const c of this.children) out += typeof c === 'string' ? c : c.textContent;", "for (const c of this.children) if (typeof c === 'string') out += c;"),
 ('xml.js', "text = text.replace(/\\r\\n?/g, '\\n');", ""),
 ('xml.js', ".replace(/[\\t\\r\\n]/g, ' ')", ""),
 ('xml.js', "current.children.push(text.slice(i + 9, close));", ""),
 # flight.js: V6's projection and sampling
 ('flight.js', "altFt: f.altM * FT_PER_M", "altFt: f.altM * 3.28"),
 ('flight.js', "const first = tracks[slots[0]].fixes[0];", "const first = tracks[slots[slots.length - 1]].fixes[0];"),
 ('flight.js', "let startT = Math.max(", "let startT = Math.min("),
 ('flight.js', "let endT = Math.min(", "let endT = Math.max("),
 ('flight.js', "endT <= startT", "endT < startT"),
 ('flight.js', "if (fixes[mid].t < t) lo = mid;", "if (fixes[mid].t <= t) lo = mid;"),
 ('flight.js', "if (t <= f[0].t) return { ...f[0] };", "if (t < f[0].t) return { ...f[0] };"),
 ('flight.js', "* FTPS_TO_KT,", "/ 1.68781,"),
 ('flight.js', "if (Number.isFinite(a)) return a;", "if (Number.isFinite(a)) return b;"),
 ('flight.js', "if (!f || f.length < 2) return 0;", "if (!f || f.length < 2) return null;"),
 ('flight.js', "return Math.atan2(b.yFt - a.yFt, b.xFt - a.xFt);", "return Math.atan2(b.xFt - a.xFt, b.yFt - a.yFt);"),
 ('flight.js', "if (t1 - t0 < 0.25)", "if (t1 - t0 < 0.3)"),
 ('flight.js', "horizFt < 20) return", "horizFt < 19) return"),
 ('flight.js', "Math.max(-30, Math.min(30,", "Math.max(-31, Math.min(30,"),
 ('flight.js', "if (!f || f.length < 3) return null;", "if (!f || f.length < 2) return null;"),
 ('flight.js', "if (t1 - t0 < 0.5) return null;", "if (t1 - t0 < 0.6) return null;"),
 ('flight.js', "export function pitchAt(track, t, windowS = 1.5)", "export function pitchAt(track, t, windowS = 2)"),
 ('flight.js', "export function estimatedGAt(track, t, windowS = 1.5)", "export function estimatedGAt(track, t, windowS = 2)"),
 ('flight.js', "headingAt(track, t0), { x: p1.xFt", "headingAt(track, t1), { x: p1.xFt"),
 ('flight.js', ", t1 - t0);\n}", ", t1 - t0 + 0.1);\n}"),
 ('flight.js', "return wrapDeg180(a + wrapDeg180(b - a) * k);", "return a + (b - a) * k;"),
 # clean.js: C3, impossible fixes
 ('clean.js', "Math.abs(f.lat) <= 90", "Math.abs(f.lat) < 90"),
 ('clean.js', "Math.abs(f.lon) <= 180", "Math.abs(f.lon) < 180"),
 ('clean.js', "f.altM >= MIN_ALT_M", "f.altM > MIN_ALT_M"),
 ('clean.js', "f.altM <= MAX_ALT_M", "f.altM < MAX_ALT_M"),
 ('clean.js', "dropped.position++", "dropped.altitude++"),
 ('clean.js', "possible[b].t - possible[a].t, MIN_SPEED_TIME_S", "possible[b].t - possible[a].t, 0.5"),
 ('clean.js', "<= MAX_GROUND_SPEED_KT", "< MAX_GROUND_SPEED_KT + 5"),
 ('clean.js', "i + MAX_JUMP_FIXES,", "i + MAX_JUMP_FIXES - 1,"),
 ('clean.js', "i + MAX_JUMP_FIXES,", "i + MAX_JUMP_FIXES + 1,"),
 ('clean.js', "possible.length - 1);", "possible.length);"),
 ('clean.js', "dropped.jump += back - i;", "dropped.jump += 1;"),
 ('clean.js', "      last = i;\n", "\n"),
 ('clean.js', "if (fixes.length < 2)", "if (fixes.length < 1)"),
]


def run():
    # A change that makes the code loop forever counts as caught (the suite would time out).
    try:
        return subprocess.run(['node', '--test', *TESTS], cwd=ROOT, capture_output=True, timeout=30).returncode
    except subprocess.TimeoutExpired:
        return 'timeout'


assert run() == 0, 'tests must pass before mutating'
survived = []
for fname, old, new in M:
    path = SRC / fname
    src = path.read_text()
    assert src.count(old) >= 1, f'{fname}: not found: {old}'
    path.write_text(src.replace(old, new, 1))
    try:
        if run() == 0:
            survived.append((fname, old, new))
    finally:
        path.write_text(src)
print(f'{len(M) - len(survived)} of {len(M)} changes caught')
# Known equivalent, so not listed above: V6's "|| 1" guards in sampleAt
# (b.t - a.t is never 0 there, because the fixes around t differ in time), and
# the G formula itself, which is core's gFromTrack and is checked by core's own
# mutation run.
for s in survived:
    print('SURVIVED', s)
