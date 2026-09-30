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
 ('kml.js', ".filter(Boolean);", ";"),
 ('kml.js', "a.length >= 2 && Number.isFinite(a[0])", "a.length >= 3 && Number.isFinite(a[0])"),
 ('kml.js', "altM: Number.isFinite(a[2]) ? a[2] : 0", "altM: Number.isFinite(a[2]) ? a[2] : null"),
 ('kml.js', "nativeG[idx] ?? nativeG[i] ?? null", "nativeG[i] ?? nativeG[idx] ?? null"),
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
 ('kml.js', "return t === '' ? NaN : Number(t);", "return Number(t);"),
 ('kml.js', "Math.abs(v) <= 180", "Math.abs(v) < 180"),
 ('kml.js', "bank[idx] ?? bank[i] ?? null", "bank[i] ?? null"),
 # C5: every position needs its own time
 ('kml.js', "(ISO_TIME.test(w) ? parseIsoSeconds(w) : NaN)", "parseIsoSeconds(w)"),
 ('kml.js', "if (nodes.some(n => n.children.some(c => typeof c !== 'string'))) throw nested(name, tag);", ""),
 ('kml.js', "if (up.name === 'gx:SimpleArrayData') throw", "if (false) throw"),
 ('kml.js', "if (positions > MAX_FIXES)", "if (positions > MAX_FIXES + 1)"),
 ('kml.js', "if (unreadable >= 0)", "if (false)"),
 ('kml.js', "if (positions && positions !== when.length)", "if (positions && positions > when.length)"),
 ('kml.js', "if (positions && positions !== when.length)", "if (positions && positions < when.length)"),
 ('kml.js', "const t = when[n++];", "const t = when[i]; n++;"),
 ('kml.js', ".split(/\\s+/).filter(Boolean));", ".split(/\\s+/));"),
 # xml.js: well-formedness and text
 ('xml.js', "if (current.name !== name)", "if (false)"),
 ('xml.js', "if (current === doc && rootSeen) fail(", "if (false) fail("),
 ('xml.js', "fail(text.startsWith('<!DOCTYPE', i)", "if (!text.startsWith('<!DOCTYPE', i)) fail(text.startsWith('<!DOCTYPE', i)"),
 ('xml.js', "if (semi < 0 || (nextAmp >= 0 && nextAmp < semi)) fail(", "if (semi < 0) fail("),
 ('xml.js', "if (semi < 0 || (nextAmp >= 0 && nextAmp < semi)) fail(", "if (false) fail("),
 ('xml.js', "if (!m) fail(`unknown entity", "if (false) fail(`unknown entity"),
 ('xml.js', "Object.hasOwn(NAMED, ref)", "ref in NAMED"),
 ('xml.js', "if (declared === scopes[scopes.length - 1]) declared = new Set(declared);", ""),
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
 ('clean.js', "if (!reachable(s - 1, s) && !reachable(0, s) && agree(s))", "if (!reachable(s - 1, s) && agree(s))"),
 ('clean.js', "if (!reachable(s - 1, s) && !reachable(0, s) && agree(s))", "if (!reachable(s - 1, s) && !reachable(0, s))"),
 ('clean.js', "j <= s + MAX_JUMP_FIXES; j++", "j < s + MAX_JUMP_FIXES; j++"),
 ('clean.js', "dropped.jump += first;", ""),
 ('clean.js', "} else if (i + MAX_JUMP_FIXES > possible.length - 1) {", "} else if (false) {"),
 ('clean.js', "} else if (i + MAX_JUMP_FIXES > possible.length - 1) {", "} else if (i + MAX_JUMP_FIXES >= possible.length - 1) {"),
 ('clean.js', "Math.cos((p.lat + q.lat) / 2 * Math.PI / 180)", "Math.cos(p.lat * Math.PI / 180)"),
 # C4: gaps
 ('clean.js', "fixes[i].t - fixes[i - 1].t > GAP_S", "fixes[i].t - fixes[i - 1].t >= GAP_S"),
 ('clean.js', "gaps.push({ fromT: fixes[i - 1].t, toT: fixes[i].t })", "gaps.push({ fromT: fixes[i].t, toT: fixes[i].t })"),
 ('flight.js', "inGap: b.t - a.t > GAP_S && t < b.t", "inGap: b.t - a.t > GAP_S"),
 ('flight.js', "inGap: b.t - a.t > GAP_S && t < b.t", "inGap: b.t - a.t >= GAP_S && t < b.t"),
 ('flight.js', "{ ...f[0], speedKt: segmentKt(f[0], f[1]), inGap: false }", "{ ...f[0], speedKt: segmentKt(f[0], f[1]), inGap: true }"),
 # C6: end-frame speed, interpolated lat/lon
 ('flight.js', "speedKt: segmentKt(f[0], f[1])", "speedKt: segmentKt(f[n - 2], f[n - 1])"),
 ('flight.js', "speedKt: segmentKt(f[n - 2], f[n - 1])", "speedKt: segmentKt(f[0], f[1])"),
 ('flight.js', "lat: a.lat + (b.lat - a.lat) * k,", ""),
 ('flight.js', "lon: a.lon + (b.lon - a.lon) * k,", ""),
 ('flight.js', "n < 2 ? { ...f[0], inGap: false } : { ...f[n - 1]", "n < 1 ? { ...f[0], inGap: false } : { ...f[n - 1]"),
 # C7: heading unknown when still
 ('flight.js', "if (segmentKt(a, b) < STILL_KT) return null;", ""),
 ('flight.js', "if (segmentKt(a, b) < STILL_KT) return null;", "if (segmentKt(a, b) <= STILL_KT + 0.1) return null;"),
 ('flight.js', "if (!f || f.length < 2) return null;\n  const n = f.length;\n  const [a, b]", "if (!f || f.length < 2) return 0;\n  const n = f.length;\n  const [a, b]"),
 ('flight.js', "|| h0 === null || h1 === null) return null;", ") return null;"),
 ('flight.js', "|| h0 === null || h1 === null) return null;", "|| h0 === null) return null;"),
 # C8: tracks that don't overlap
 ('flight.js', "if (!(endT > startT)) throw", "if (!(endT >= startT)) throw"),
 ('flight.js', "if (slots.length === 1) return new KmlError(", "if (false) return new KmlError("),
 ('flight.js', "if (a < startT || b > endT)", "if (a < startT)"),
 ('flight.js', "overlaps(slot) <= overlaps(worst)", "overlaps(slot) < overlaps(worst)"),
 ('flight.js', "Math.min(span(slot)[1], span(o)[1]) > Math.max", "Math.min(span(slot)[1], span(o)[1]) >= Math.max"),
 # C10: estimated pitch and G by default
 ('flight.js', "export function pitchAt(track, t, { recorded = false,", "export function pitchAt(track, t, { recorded = true,"),
 ('flight.js', "export function gAt(track, t, { recorded = false }", "export function gAt(track, t, { recorded = true }"),
 ('flight.js', "const g = recorded ? sampleAt(track, t)?.gRecorded : null;", "const g = null;"),
 ('flight.js', "const p = recorded ? sampleAt(track, t) : null;", "const p = null;"),
 # clock.js
 ('clock.js', "Math.min(MAX_FRAME_S, Math.max(0, (nowMs - lastMs) / 1000))", "Math.max(0, (nowMs - lastMs) / 1000)"),
 ('clock.js', "Math.min(MAX_FRAME_S, Math.max(0, (nowMs - lastMs) / 1000))", "Math.min(MAX_FRAME_S, (nowMs - lastMs) / 1000)"),
 ('clock.js', "if (t >= endT) t = startT;", ""),
 ('clock.js', "if (t >= endT) playing = false;", ""),
 ('clock.js', "      lastMs = null;\n      changed();", "      changed();"),
 ('clock.js', "t = clamp(Math.round(time));", "t = clamp(time);"),
 ('clock.js', "Math.floor(t) + 1 : Math.ceil(t) - 1", "t + 1 : t - 1"),
 ('clock.js', "if (dtS === 0) return;", ""),
 ('clock.js', "t = Math.min(endT, t + dtS * speed);", "t = t + dtS * speed;"),
 ('clock.js', "if (!SPEEDS.includes(x))", "if (false)"),
 ('clock.js', "if (!(endT > startT))", "if (!(endT >= startT))"),
 # debrief-file.js
 ('debrief-file.js', "if (file.version !== VERSION)", "if (false)"),
 ('debrief-file.js', "|| file.format !== FORMAT)", ")"),
 ('debrief-file.js', "tracks.length > MAX_TRACKS)", "tracks.length > MAX_TRACKS + 1)"),
 ('debrief-file.js', "dfps.length > MAX_DFPS)", "dfps.length > MAX_DFPS + 1)"),
 ('debrief-file.js', "!isText(d.note, MAX_NOTE_CHARS)", "!isText(d.note, Infinity)"),
 ('debrief-file.js', "!isText(d.label, MAX_LABEL_CHARS)", "!isText(d.label, Infinity)"),
 ('debrief-file.js', "!isText(tr.name, MAX_LABEL_CHARS)", "!isText(tr.name, Infinity)"),
 ('debrief-file.js', "!Number.isFinite(d.t)", "d.t === undefined"),
 ('debrief-file.js', ".sort((a, b) => a.t - b.t)", ""),
 ('debrief-file.js', "return { t: d.t, label: d.label, note: d.note };", "return d;"),
 ('debrief-file.js', "return { slot: tr.slot, name: tr.name, kml: tr.kml };", "return tr;"),
 ('debrief-file.js', "v >= rule.min && v <= rule.max", "true"),
 ('debrief-file.js', "(rule.oneOf ? rule.oneOf.includes(v) : v.length <= rule.max)", "true"),
 ('debrief-file.js', "typeof v === 'boolean'", "true"),
 ('debrief-file.js', "Object.entries(CLEANING).every(([k, v]) => file.cleaning[k] === v)", "true"),
 ('debrief-file.js', "if (!Array.isArray(files) || !files.length)", "if (!Array.isArray(files))"),
 ('load.js', "files: files.map(({ slot, name, text }) => ({ slot, name, text }))", "files"),
 ('clock.js', "if (!playing || !Number.isFinite(nowMs)) return;", "if (!playing) return;"),
 ('debrief-file.js', "tr.slot < 1 || tr.slot > MAX_TRACKS || seen.has(tr.slot)", "seen.has(tr.slot)"),
 ('debrief-file.js', "tr.slot < 1 || tr.slot > MAX_TRACKS || seen.has(tr.slot)", "tr.slot < 1 || tr.slot > MAX_TRACKS"),
 ('debrief-file.js', "if (Number.isInteger(file.version) && file.version > VERSION)", "if (file.version !== VERSION)"),
 ('debrief-file.js', "throw new DebriefFileError(e.reason, true);", "throw e;"),
 ('load.js', "s.length > MAX_NAME_CHARS ?", "false ?"),
 ('load.js', "s.slice(0, MAX_NAME_CHARS - 1) + '…'", "s.slice(0, MAX_NAME_CHARS)"),
 # C9: all-or-nothing load
 ('load.js', "files.length > MAX_TRACKS", "files.length > MAX_TRACKS + 1"),
 ('load.js', "|| !files.length ||", "||"),
 ('load.js', "|| tracks[slot])", ")"),
 ('load.js', "slot > MAX_TRACKS ||", "slot > MAX_TRACKS + 1 ||"),
 ('load.js', "!Number.isInteger(slot) ||", ""),
 ('load.js', "cleanTrack(readKml(text, name))", "readKml(text, name)"),
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
# mutation run. Also xml.js returning its name index's own array rather than a
# copy: no caller changes the list, the copy only guards future ones.
for s in survived:
    print('SURVIVED', s)
