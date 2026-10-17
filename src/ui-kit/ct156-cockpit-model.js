// The CT-156 cockpit's parts built in Blender (ALL-32, Patrick 11 Oct 2026: "The CT-156 cockpit interior may be a
// Blender model file, built by script from the code model's numbers ... If the file fails to load, the code-drawn
// cockpit shows"; ALL-38: Blender owns the shape): public/models/ct156/high/ct156-cockpit.glb, delivered from the
// 3d-work master and taken in by `npm run models:import` (plan Step 3b item 3.4). Each top-level part in the
// file (forward-bow, canopy-rails, and the seat, pcl and stick rounded from the code's own pieces) replaces the code cockpit's mesh named ct156-cockpit-<part> once the file is in; until
// then, or if it never loads, the code's part shows. Built in the cockpit's own feet (nose +X, left +Y, up +Z), so the
// parts drop into the cockpit's group as they are. A picture only: no flight numbers.
import { aoShaded, CT156_PICTURES, ct156Files, ct156Generation, ct156Level, loadAo, loadDelivered, loadPicture, onCt156Level, shadeWhenLoaded, warnUnlessReported } from './ct156-blender.js';

const FILE = 'ct156-cockpit.glb';

// ---------- the moving controls (W25) ----------

/** The parts with pieces that move in each seat: the stick all of it, the power lever's quadrant only its lever. */
export const CONTROL_PARTS = Object.freeze(['stick', 'pcl']);

/**
 * Where a triangle of a control part goes: 'front' or 'rear' (moving, in that seat) or null (fixed). Its seat is the
 * nearer pivot along x; in the power lever's quadrant only the lever moves: everything higher than `fixedTop` over the
 * console, and the plate inside `stemHalf` across of the lever's middle, up out of the slot (pivots: seatParts).
 */
function controlSeat(name, c, pivots) {
  const seat = Math.abs(c[0] - pivots.front[name].x) <= Math.abs(c[0] - pivots.rear[name].x) ? 'front' : 'rear';
  if (name === 'stick') return seat;
  const p = pivots[seat].pcl, up = c[2] - p.z;
  return up > p.fixedTop || (Math.abs(c[1] - p.y) < p.stemHalf && up > 0.02) ? seat : null;
}

/**
 * A control part's pieces (meshes: [{ geometry, material }], each one colour, as the file's parts or the code's mesh
 * by colour) split by controlSeat: { fixed: the pieces that stay, moving: { front, rear }: the pieces that turn, each
 * moved so its seat's pivot is at the origin }. Every triangle goes to exactly one of them. The meshes' geometries are
 * left as they were (the caller frees them).
 */
export function splitControls(THREE, meshes, name, pivots) {
  const out = { fixed: [], moving: { front: [], rear: [] } };
  for (const { geometry: g0, material } of meshes) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const keys = ['position', 'normal', 'uv', 'tangent'].filter((k) => g.attributes[k]);
    const buckets = { fixed: [], front: [], rear: [] };
    const pos = g.attributes.position;
    for (let t = 0; t < pos.count; t += 3) {
      const c = [0, 1, 2].map((k) => (pos.array[t * 3 + k] + pos.array[(t + 1) * 3 + k] + pos.array[(t + 2) * 3 + k]) / 3);
      buckets[controlSeat(name, c, pivots) ?? 'fixed'].push(t);
    }
    for (const [bucket, starts] of Object.entries(buckets)) {
      if (!starts.length) continue;
      const geometry = new THREE.BufferGeometry();
      for (const key of keys) {
        const a = g.attributes[key], n = a.itemSize, arr = new Float32Array(starts.length * 3 * n);
        starts.forEach((t, i) => arr.set(a.array.subarray(t * n, (t + 3) * n), i * 3 * n));
        geometry.setAttribute(key, new THREE.BufferAttribute(arr, n));
      }
      if (bucket !== 'fixed') {
        const p = pivots[bucket][name];
        geometry.translate(-p.x, -p.y, -p.z);
      }
      (bucket === 'fixed' ? out.fixed : out.moving[bucket]).push({ geometry, material });
    }
    if (g !== g0) g.dispose();
  }
  return out;
}

/** A mesh's pieces one colour each ({ geometry, material }): its groups' triangles, or the whole mesh when it has none. */
export function piecesByColour(THREE, mesh) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const mats = [mesh.material].flat();
  if (!g.groups.length) return [{ geometry: g, material: mats[0] }];
  const keys = Object.keys(g.attributes);
  return g.groups.map(({ start, count, materialIndex }) => {
    const geometry = new THREE.BufferGeometry();
    for (const key of keys) {
      const a = g.attributes[key];
      geometry.setAttribute(key, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
    }
    return { geometry, material: mats[materialIndex ?? 0] };
  });
}

/**
 * Turns each seat's stick and power lever (W25, Patrick 17 Oct 2026: "cockpit stick/throttle (pcl) moving when the
 * aircraft moves and power changes"). rig: { front: { stick, pcl }, rear: { ... } } of pivot groups. hud.controls
 * { roll, pitch } from -1 to 1 (as setControls': roll 1 full right stick, pitch 1 full back stick) tilt the stick up to
 * STICK_THROW_DEG about its boot; the torque (hud.torquePct, or hud.torque.pct) sets the lever's place in its slot, idle
 * aft to MAX forward, and a stopped engine (hud.engineRunning false) puts it at the aft end. A picture only: the throw and
 * the torque-to-slot line are estimates.
 */
export const STICK_THROW_DEG = 15;
export function poseControls(rig, hud) {
  if (!rig) return;
  const unit = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
  const roll = unit(hud?.controls?.roll), pitch = unit(hud?.controls?.pitch);
  const tq = hud?.torquePct ?? hud?.torque?.pct;
  const running = hud?.engineRunning !== false;
  for (const seat of ['front', 'rear']) {
    const r = rig[seat];
    if (!r) continue;
    // Right stick tilts the top toward the right (-y): about +x; back stick tilts it aft: about +y, negative.
    if (r.stick) r.stick.rotation.set((roll * STICK_THROW_DEG * Math.PI) / 180, (-pitch * STICK_THROW_DEG * Math.PI) / 180, 0);
    if (r.pcl) {
      const p = r.pcl.userData.pivot;
      const f = !running ? 0 : Number.isFinite(tq) ? 0.12 + 0.88 * Math.max(0, Math.min(1, tq / 100)) : (p.restDeg + p.travelDeg) / (2 * p.travelDeg);
      r.pcl.rotation.y = ((-p.travelDeg + 2 * p.travelDeg * f - p.restDeg) * Math.PI) / 180;
    }
  }
}

/** Each seat's pivot groups for the moving pieces (splitControls' moving, with their materials by `paint(material)`), added to `parent`. */
export function rigControls(THREE, parent, name, moving, pivots, paint) {
  const out = {};
  for (const seat of ['front', 'rear']) {
    if (!moving[seat].length) continue;
    const p = pivots[seat][name];
    const at = new THREE.Group();
    at.name = `ct156-cockpit-${name}-${seat}-pivot`;
    at.position.set(p.x, p.y, p.z);
    at.userData.pivot = p;
    for (const { geometry, material } of moving[seat]) {
      const mesh = new THREE.Mesh(geometry, paint(material, geometry));
      mesh.castShadow = mesh.receiveShadow = true;
      at.add(mesh);
    }
    parent.add(at);
    out[seat] = at;
  }
  return out;
}
// The body's relief picture (3d-work slice 4.1: the glare shield's screws and rivets, on the body's own layout), drawn
// with MikkTSpace tangents worked out for the body only.
const RELIEF_PART = 'body';

/** The file's parts at partsLevel, loaded once per level and shared by every cockpit: Promise of [{ name, ao, meshes }]. */
let parts = null;
let partsLevel = null;
const attached = new Map(); // group -> its attach (what it added and made), while the cockpit lives
let stopLevel = null; // stops onLevel following the level, once no cockpit is left
/** Frees the cached file's shapes (no cockpit uses them any more) and forgets it. */
function dropParts() {
  const old = parts;
  parts = null;
  old?.then((list) => list.forEach(({ meshes, moving }) => [...meshes, ...(moving?.front ?? []), ...(moving?.rear ?? [])].forEach(({ geometry }) => geometry.dispose())), () => {});
}
/** The file's parts, the stick's and power lever's split once here into fixed and moving pieces (splitControls, with the cockpit's pivots). */
function cockpitParts(THREE, pivots) {
  // Loaded at another level while no cockpit was open to hear the switch (a Performance view closed, then a High one): the old file goes.
  if (parts && partsLevel !== ct156Level()) dropParts();
  if (!parts) {
    partsLevel = ct156Level();
    parts = loadDelivered(FILE, { tangents: (name) => name === RELIEF_PART }).then((list) => list.map(({ name, extras, meshes }) => {
      const ao = extras.ct156_ao ? loadAo(THREE, ct156Files() + extras.ct156_ao) : null;
      if (!pivots || !CONTROL_PARTS.includes(name)) return { name, ao, meshes };
      const { fixed, moving } = splitControls(THREE, meshes, name, pivots);
      for (const { geometry } of meshes) geometry.dispose();
      return { name, ao, meshes: fixed, moving };
    }));
    parts.catch((e) => warnUnlessReported(FILE, e, "the code's cockpit parts show")); // once per load; a missing file leaves the code's parts showing
  }
  return parts;
}

/**
 * Adds the Blender parts to a cockpit's group (createCt156Cockpit) when the file is in, hiding the code's parts they
 * replace. mats: the cockpit's own materials by the file's material names (its colour slots: band, black, frame, dark,
 * seat, knob and the rest), so the parts
 * light and dispose with the rest of the cockpit; the shaded copies are this file's to free (detachCockpitModel), so the
 * fourth argument (the cockpit's own list) is no longer used. Does nothing without a browser (tests, export scripts).
 */
export function attachCockpitModel(THREE, group, mats, _own, partMats = {}) {
  if (typeof document === 'undefined') return;
  // The shaded copies stay in entry.mine, freed at each level switch (unbuild) and when the cockpit goes
  // (detachCockpitModel), not handed to the cockpit's own list, where freed copies would pile up switch after switch.
  const entry = { THREE, group, mats, partMats, own: (m) => (entry.mine.push(m), m), mine: [], added: [], hidden: [], rig: null };
  attached.set(group, entry);
  stopLevel ??= onCt156Level(onLevel);
  build(entry);
}

/** Frees what a cockpit's Blender parts made (its materials; the shared shapes are freed by onLevel) and shows the code's parts again. */
function unbuild(entry) {
  for (const part of entry.added) part.removeFromParent();
  if (entry.group.userData.controlRig === entry.rig) delete entry.group.userData.controlRig;
  for (const code of entry.hidden) code.visible = true;
  for (const m of entry.mine) m.dispose();
  entry.added = [];
  entry.hidden = [];
  entry.mine = [];
}

/** A level switch: every cockpit's parts, the shared file and its pictures are freed, and the new level's loaded. */
function onLevel() {
  dropParts();
  for (const entry of attached.values()) {
    unbuild(entry);
    build(entry);
  }
}

/** Stops a cockpit following the level and frees its parts' shaded copies (its dispose calls this); the last one stops the listener. */
export function detachCockpitModel(group) {
  for (const m of attached.get(group)?.mine ?? []) m.dispose();
  attached.delete(group);
  if (!attached.size && stopLevel) {
    stopLevel();
    stopLevel = null;
  }
}

function build(entry) {
  const { THREE, group, mats, partMats, own } = entry;
  const gen = ct156Generation();
  const stale = () => group.userData.disposed || gen !== ct156Generation() || attached.get(group) !== entry;
  const pivots = group.userData.controlPivots;
  cockpitParts(THREE, pivots).then((list) => {
    if (stale()) return;
    entry.rig = { front: {}, rear: {} };
    for (const { name, ao, meshes, moving } of list) {
      // Every part of the imported delivery replaces the code's part of its name (loadDelivered checked the file came
      // from that delivery; since plan 3.4 the code's fingerprints are no longer compared). 'shade' is the pictured
      // faces' shadows, with no code part of its own.
      const code = group.getObjectByName(`ct156-cockpit-${name}`);
      const part = new THREE.Group();
      part.name = `ct156-cockpit-${name}-model`;
      const relief = []; // [mesh, base] of the body's lit colours, given the relief once its picture loads
      const baseOf = (material) => partMats[name]?.[material] ?? mats[material] ?? mats.frame; // a part may draw a slot in its own colour (partMats)
      // Lit colours take the part's baked shadows; the self-lit lamps don't.
      const paint = (material, geometry) => {
        const base = baseOf(material);
        return ao && geometry.attributes.uv && base.isMeshStandardMaterial ? own(aoShaded(base, ao)) : base;
      };
      for (const { geometry, material } of meshes) {
        if (material === 'shade') { // the pictured faces' baked shadows, laid over the code's pictures
          if (ao) part.add(new THREE.Mesh(geometry, own(new THREE.MeshBasicMaterial({ map: ao, blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide, fog: false }))));
          continue;
        }
        const base = baseOf(material);
        const m = paint(material, geometry);
        const mesh = new THREE.Mesh(geometry, m);
        mesh.castShadow = mesh.receiveShadow = !m.transparent; // real-time shadows where a view has them (aircraft-shadows.js)
        part.add(mesh);
        if (m !== base && geometry.attributes.tangent) relief.push([mesh, base]);
      }
      if (moving) { // the stick's and power lever's moving pieces, each seat's on its pivot (poseControls turns them)
        const rig = rigControls(THREE, part, name, moving, pivots, paint);
        for (const seat of ['front', 'rear']) entry.rig[seat][name] = rig[seat];
      }
      group.add(part);
      entry.added.push(part);
      if (code) {
        code.visible = false;
        entry.hidden.push(code);
      }
      if (relief.length) {
        const { cockpitNormal: n } = CT156_PICTURES[ct156Level()];
        shadeWhenLoaded({ normal: loadPicture(THREE, ct156Files() + n.file, n.size) }, ({ normal }) => {
          if (stale()) return;
          for (const [mesh, base] of relief) mesh.material = own(aoShaded(base, ao, { normal }));
        });
      }
    }
    if (Object.values(entry.rig).some((r) => Object.keys(r).length)) group.userData.controlRig = entry.rig; // else the code's own move
  }, () => {});
}
