// Takes a CT-156 delivery from the 3d-work repo into the app (plan Step 3b item 3.4; ALL-38: Blender owns the shape,
// the app takes only finished, checked files). Refuses a delivery that failed its checks, is a draft, or whose files
// are not the files its sheet checked; nothing is copied then. Node's own tools only, no library.
//
//   npm run models:import -- <delivery folder>            check it and copy it into public/models/ct156/
//   npm run models:import -- <delivery folder> --check    check only
//
// The delivery folder is made in 3d-work by `node ct156/build/deliver.mjs` (its sheet.md says what was checked).
// Re-checked here: the sheet's own results, every file's size and SHA-256 fingerprint, no extra files and no path
// outside the folder, each model file's parts as the app reads them (the parts the app expects, normals and one set of
// picture corners, no transform left on a
// node, the delivery's name on every part, triangles as the sheet says), the pictures' sizes, the named points; and
// the Khronos glTF validator again if this computer has it (set GLTF_VALIDATOR to its path, or have gltf_validator
// on the path); without it the sheet's validator result stands.
//
// An import that changes the files is a published change: its pull request changes the version on screen (rule book).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CT156_PICTURES } from '../../src/ui-kit/ct156-blender.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEST = join(ROOT, 'public', 'models', 'ct156');
// The sheet layout this app reads (3d-work ct156/build/app_layout.json "layout"); raised there when the app must change.
// Layout 2 (3d-work increment 2, 15 Oct 2026): the 18 parts the app drew from its own code come in the files, and the
// pilots have a file of their own. Layout 3 (3d-work slice 4.5A, 15 Oct 2026): the cockpit panels' plates, bezels and
// handles in the cockpit's body with a new colour slot `panel` (ct156-cockpit.js colours it PANEL_GREY), and the 53
// screen rectangles under "screens" in ct156-points.json (read; drawn into by slice 4.5B).
const LAYOUT = 3;
// The parts the app takes from each file: src/ui-kit/ct156-model.js EXTERIOR_PARTS and GEAR_PARTS with the prop's
// blade and tip (PROP_PARTS) and the gear lamp (since 3d-work delivery 423e5eb; the root cuffs F29 were withdrawn in
// 7bd9b52), layout 2's parts (LAYOUT2_EXTERIOR, GEAR_WELLS, PILOT_PARTS), and the cockpit's parts
// (ct156-cockpit-model.js takes every part the file has; these are the ones it has today).
const PARTS = {
  'ct156-exterior.glb': ['fuselage', 'fuselageCut', 'airframe', 'fin', 'frames', 'bowFront', 'seats', 'spinner', 'spinnerRing', 'vent', 'antenna', 'beacon', 'aileron', 'elevator', 'rudder', 'flapIn', 'flapOut', 'blade', 'bladeTip',
    'stubs', 'coamings', 'floor', 'speedBrake', 'speedBrakeWell', 'flapInWell', 'flapOutWell', 'tub'],
  'ct156-gear.glb': ['gearMain', 'gearMainDoor', 'gearInboardDoor', 'gearNose', 'gearNoseDoor', 'gearLamp', 'gearInboardWell', 'gearLegWell', 'gearNoseWell'],
  'ct156-cockpit.glb': ['body', 'canopy-rails', 'forward-bow', 'pcl', 'seat', 'shade', 'stick'],
  'ct156-pilots.glb': ['helmetFront', 'helmetRear'],
};
// The pictures the app loads by name beside each level's files, and the size each must be (ct156-blender.js
// CT156_PICTURES; 3d-work slice 4.1: the old bump and dirt pictures are gone). The cockpit's soft shadows are named by
// each part (ct156_ao) and checked against the sheet only.
const POINTS = { eyes: 2, reference: 12, hinges: 25, faces: 10, screens: 53 }; // hinges: blade1 to blade4 and the two gear lamps since 423e5eb; screens: layout 3

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const folder = args.find((a) => !a.startsWith('--'));
const refuse = (why) => {
  console.error(`Refused: ${why}\nNothing was copied.`);
  process.exit(1);
};
if (!folder) refuse('say which delivery: npm run models:import -- <delivery folder>');
const SRC = resolve(folder);
if (!existsSync(join(SRC, 'sheet.json'))) refuse(`${SRC} has no sheet.json: it is not a delivery folder (made by 3d-work's node ct156/build/deliver.mjs).`);
const sheet = JSON.parse(readFileSync(join(SRC, 'sheet.json'), 'utf8'));
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

// ---------- the sheet's own results ----------
if (sheet.format !== 1) refuse(`the sheet's format is ${sheet.format}; this import reads format 1.`);
if (sheet.layout !== LAYOUT) refuse(`the delivery is laid out for app layout ${sheet.layout}, and this app reads layout ${LAYOUT}: the app's loaders must change first (3d-work app_layout.json).`);
if (sheet.draft) refuse(`${sheet.name} is a draft (made from a master with uncommitted changes). Commit the master and deliver again.`);
if (sheet.refused || sheet.problems?.length) refuse(`${sheet.name} failed its checks in 3d-work:\n  - ${(sheet.problems ?? []).join('\n  - ')}`);
for (const [group, rows] of Object.entries(sheet.checks ?? {})) {
  if (!Array.isArray(rows)) continue;
  for (const r of rows) {
    if (r.status !== 'pass' && !String(r.status).startsWith('known gap')) refuse(`the delivery's ${group} check ${r.check} says "${r.status}".`);
  }
}

// ---------- every file as the sheet checked it, and nothing else ----------
// A path on the sheet stays inside the delivery folder: no '..' and nothing absolute, or it would read and write
// outside the folders (3d-work audit of 14 Oct 2026, auditor C item 9).
for (const p of [...sheet.files.map((f) => f.path), ...(sheet.pictures ?? []).map((pic) => pic.file), ...(sheet.glb ?? []).map((g) => g.file)]) {
  if (typeof p !== 'string' || !p || isAbsolute(p) || /^[a-zA-Z]:/.test(p) || p.split(/[\\/]/).includes('..')) refuse(`the sheet names a file outside the delivery folder: ${p}`);
}
const listed = new Map(sheet.files.map((f) => [f.path, f]));
for (const [path, f] of listed) {
  const p = join(SRC, path);
  if (!existsSync(p)) refuse(`${path} is on the sheet but not in the folder.`);
  if (statSync(p).size !== f.bytes || sha256(p) !== f.sha256) refuse(`${path} is not the file the delivery checked (its fingerprint differs). Run the delivery again in 3d-work.`);
}
const present = [];
for (const level of ['high', 'performance']) {
  if (!existsSync(join(SRC, level))) refuse(`the delivery has no ${level} folder.`);
  for (const f of readdirSync(join(SRC, level))) present.push(`${level}/${f}`);
}
for (const p of present) if (!listed.has(p)) refuse(`${p} is in the folder but not on the sheet: the files must be exactly the delivery's.`);

// ---------- each model file as the app reads it ----------
function readGlb(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error('not a glTF 2 binary file');
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('cut short');
  let at = 12;
  while (at < bytes.length) {
    const len = bytes.readUInt32LE(at);
    if (bytes.readUInt32LE(at + 4) === 0x4e4f534a) return JSON.parse(bytes.subarray(at + 8, at + 8 + len).toString('utf8'));
    at += 8 + len;
  }
  throw new Error('no glTF JSON part');
}
const moved = (n) => (n.matrix && n.matrix.some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-9))
  || (n.translation && n.translation.some((v) => Math.abs(v) > 1e-9))
  || (n.rotation && (Math.abs(n.rotation[3] - 1) > 1e-9 || n.rotation.slice(0, 3).some((v) => Math.abs(v) > 1e-9)))
  || (n.scale && n.scale.some((v) => Math.abs(v - 1) > 1e-9));
const cockpitPictures = { high: new Set(), performance: new Set() };
for (const level of ['high', 'performance']) {
  for (const [file, want] of Object.entries(PARTS)) {
    const rel = `${level}/${file}`;
    if (!listed.has(rel)) refuse(`${rel} is missing from the delivery.`);
    let json;
    try {
      json = readGlb(readFileSync(join(SRC, rel)));
    } catch (e) {
      refuse(`${rel} can't be read: ${e.message}.`);
    }
    const nodes = json.nodes ?? [];
    const tops = (json.scenes?.[json.scene ?? 0]?.nodes ?? []).map((i) => nodes[i]);
    const names = tops.map((n) => n.name);
    for (const p of want) if (!names.includes(p)) refuse(`${rel} has no part ${p}, which the app draws from it.`);
    let tris = 0;
    for (const top of tops) {
      if (top.extras?.ct156_delivery !== sheet.name) refuse(`${rel}: part ${top.name} is not from delivery ${sheet.name}.`);
      if (top.extras?.ct156_ao) cockpitPictures[level].add(top.extras.ct156_ao);
      const walk = (n) => {
        if (moved(n)) refuse(`${rel}: ${top.name} keeps a transform on ${n.name}; the delivery bakes every transform into the shape.`);
        if (n.mesh !== undefined) {
          for (const pr of json.meshes[n.mesh].primitives) {
            if (pr.attributes.NORMAL === undefined || pr.attributes.TEXCOORD_0 === undefined) refuse(`${rel}: ${top.name} has a piece without normals or picture corners.`);
            // The app reads one picture layout, TEXCOORD_0 (ct156-blender.js loadParts); a second one means the baked
            // pictures may sit on the layout the app drops (3d-work audit of 14 Oct 2026, auditor C item 1).
            if (pr.attributes.TEXCOORD_1 !== undefined) refuse(`${rel}: ${top.name} has more than one picture layout; the app reads only the first.`);
            tris += (pr.indices !== undefined ? json.accessors[pr.indices].count : json.accessors[pr.attributes.POSITION].count) / 3;
          }
        }
        for (const c of n.children ?? []) walk(nodes[c]);
      };
      walk(top);
    }
    const onSheet = sheet.glb.find((g) => g.file === rel);
    if (!onSheet || onSheet.triangles !== tris) refuse(`${rel} has ${tris} triangles but the sheet says ${onSheet?.triangles}.`);
  }
}

// ---------- pictures: there, and the size the sheet says ----------
function jpegSize(p) {
  const b = readFileSync(p);
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('not a JPEG');
  for (let at = 2; at < b.length;) {
    if (b[at] !== 0xff) { at++; continue; }
    const m = b[at + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(at + 7), b.readUInt16BE(at + 5)];
    at += 2 + b.readUInt16BE(at + 2);
  }
  throw new Error('no frame header');
}
function pngSize(p) {
  const b = readFileSync(p);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('latin1', 12, 16) !== 'IHDR') throw new Error('not a PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
const pictureSize = (p) => (/\.png$/i.test(p) ? pngSize(p) : jpegSize(p));
const needed = [...[...cockpitPictures.high].map((f) => `high/${f}`), ...[...cockpitPictures.performance].map((f) => `performance/${f}`)];
for (const [level, pics] of Object.entries(CT156_PICTURES)) for (const { file } of Object.values(pics)) needed.push(`${level}/${file}`);
for (const p of needed) if (!listed.has(p)) refuse(`${p} is missing: the app loads it.`);
for (const pic of sheet.pictures) {
  let size;
  try {
    size = pictureSize(join(SRC, pic.file));
  } catch (e) {
    refuse(`${pic.file} can't be read: ${e.message}.`);
  }
  if (size[0] !== pic.width || size[1] !== pic.height) refuse(`${pic.file} is ${size[0]} by ${size[1]} px; the sheet says ${pic.width} by ${pic.height}.`);
}
// The app's own sizes (a picture of another size would sit on the wrong layout): each level's table, square pictures.
for (const [level, pics] of Object.entries(CT156_PICTURES)) {
  for (const { file, size } of Object.values(pics)) {
    const [w, h] = pictureSize(join(SRC, `${level}/${file}`));
    if (w !== size || h !== size) refuse(`${level}/${file} is ${w} by ${h} px; the app reads it at ${size} by ${size} (ct156-blender.js CT156_PICTURES).`);
  }
}

// ---------- the named points ----------
const pointsPath = join(SRC, 'ct156-points.json');
if (!listed.has('ct156-points.json')) refuse('the named points (ct156-points.json) are missing.');
const points = JSON.parse(readFileSync(pointsPath, 'utf8'));
if (points.delivery !== sheet.name) refuse(`ct156-points.json is from ${points.delivery}, not ${sheet.name}.`);
for (const [k, n] of Object.entries(POINTS)) {
  if (Object.keys(points[k] ?? {}).length < n) refuse(`ct156-points.json has ${Object.keys(points[k] ?? {}).length} ${k}; the app reads ${n}.`);
}
for (const [name, s] of Object.entries(points.screens)) {
  const corner = (c) => Array.isArray(s[c]) && s[c].length === 3 && s[c].every(Number.isFinite);
  if (!['tl', 'tr', 'br', 'bl'].every(corner) || !['opening', 'plate'].includes(s.family)) refuse(`ct156-points.json screen ${name} lacks a corner or its family.`);
}

// ---------- the validator again, if this computer has it ----------
const validator = [process.env.GLTF_VALIDATOR, 'gltf_validator'].filter(Boolean).find((v) => !spawnSync(v, ['--version']).error);
if (validator) {
  for (const g of sheet.glb) {
    const r = spawnSync(validator, ['-o', join(SRC, g.file)], { encoding: 'utf8', maxBuffer: 1 << 28 });
    let issues;
    try {
      issues = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).issues;
    } catch {
      refuse(`the validator's report on ${g.file} could not be read.`);
    }
    if (issues.numErrors || issues.numWarnings) refuse(`the validator finds ${issues.numErrors} errors and ${issues.numWarnings} warnings in ${g.file}.`);
  }
  console.log(`Validator: 0 errors, 0 warnings on all ${sheet.glb.length} files.`);
} else {
  console.log('Validator: not on this computer (set GLTF_VALIDATOR to its path to run it); the delivery\'s own run stands (0 errors, 0 warnings).');
}

// ---------- what changes ----------
const before = existsSync(join(DEST, 'delivery.json')) ? JSON.parse(readFileSync(join(DEST, 'delivery.json'), 'utf8')) : null;
const oldFiles = new Map((before?.files ?? []).map((f) => [f.path, f.sha256]));
const changed = sheet.files.filter((f) => oldFiles.get(f.path) !== f.sha256).map((f) => f.path);
const gone = [...oldFiles.keys()].filter((p) => !listed.has(p));
console.log(`Delivery ${sheet.name}: the master as last changed in ${(sheet.master.master_last_changed_in ?? sheet.master.commit).slice(0, 7)}, ${sheet.files.length} files, all checks pass or are known gaps.`);
for (const g of sheet.glb.filter((x) => x.level === 'high')) console.log(`  ${g.file}: ${g.triangles.toLocaleString('en')} triangles`);
console.log(before ? `Against ${before.name}: ${changed.length} files change, ${gone.length} go.` : 'First delivery into this app.');
// The points that differ from the code's own (tools/blender/ct156-points.mjs): plan 3.5's list, until the app reads
// them from ct156-points.json.
const code = spawnSync(process.execPath, [join(ROOT, 'tools', 'blender', 'ct156-points.mjs')], { encoding: 'utf8', maxBuffer: 1 << 28 });
try {
  const c = JSON.parse(code.stdout);
  const far = [];
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (const k of ['eyes', 'reference']) for (const [n, at] of Object.entries(points[k])) if (c[k][n] && d(at, c[k][n]) > 0.01) far.push(`${k} ${n} ${d(at, c[k][n]).toFixed(2)} ft`);
  for (const [n, h] of Object.entries(points.hinges)) if (c.hinges[n] && d(h.at, c.hinges[n].at) > 0.01) far.push(`hinge ${n} ${d(h.at, c.hinges[n].at).toFixed(2)} ft`);
  console.log(far.length ? `Points the code still has elsewhere (plan 3.5): ${far.join(', ')}` : 'Points: every eye, reference point and hinge within 0.01 ft of the code\'s.');
} catch {
  console.log('Points: the code\'s own points could not be read for comparison (tools/blender/ct156-points.mjs).');
}

if (CHECK_ONLY) {
  console.log('Checked; nothing copied (--check).');
  process.exit(0);
}

// ---------- copy, all or nothing ----------
const STAGE = `${DEST}.importing`;
rmSync(STAGE, { recursive: true, force: true });
try {
  mkdirSync(STAGE, { recursive: true });
  for (const f of sheet.files) {
    mkdirSync(dirname(join(STAGE, f.path)), { recursive: true });
    cpSync(join(SRC, f.path), join(STAGE, f.path));
  }
  const { problems, notes, ...kept } = sheet;
  writeFileSync(join(STAGE, 'delivery.json'), `${JSON.stringify({ ...kept, notes, imported: new Date().toISOString() }, null, 1)}\n`);
} catch (e) {
  rmSync(STAGE, { recursive: true, force: true }); // no half-copied folder left beside the delivery
  refuse(`the files could not be copied (${e.code ?? e.message}).`);
}
// Swap the folders so a failure leaves the old delivery in place: on Windows a running dev server can hold the folder
// and refuse the rename (seen 13 Oct 2026), so stop it and import again.
const OLD = `${DEST}.previous`;
rmSync(OLD, { recursive: true, force: true });
try {
  if (existsSync(DEST)) renameSync(DEST, OLD);
  renameSync(STAGE, DEST);
} catch (e) {
  if (!existsSync(DEST) && existsSync(OLD)) renameSync(OLD, DEST);
  rmSync(STAGE, { recursive: true, force: true });
  refuse(`the files could not be put in place (${e.code}): close the dev server or anything else using public/models/ct156, and import again.`);
}
rmSync(OLD, { recursive: true, force: true });
console.log(`Copied into ${relative(ROOT, DEST)}. The version on screen must change in this pull request (rule book).`);
