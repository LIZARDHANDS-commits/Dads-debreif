// The CT-156 cockpit's parts built in Blender (ALL-32, Patrick 11 Oct 2026: "The CT-156 cockpit interior may be a
// Blender model file, built by script from the code model's numbers ... If the file fails to load, the code-drawn
// cockpit shows"; ALL-38: Blender owns the shape): public/models/ct156/high/ct156-cockpit.glb, delivered from the
// 3d-work master and taken in by `npm run models:import` (plan Step 3b item 3.4). Each top-level part in the
// file (forward-bow, canopy-rails, and the seat, pcl and stick rounded from the code's own pieces) replaces the code cockpit's mesh named ct156-cockpit-<part> once the file is in; until
// then, or if it never loads, the code's part shows. Built in the cockpit's own feet (nose +X, left +Y, up +Z), so the
// parts drop into the cockpit's group as they are. A picture only: no flight numbers.
import { aoShaded, CT156_PICTURES, ct156Files, ct156Generation, ct156Level, loadAo, loadDelivered, loadPicture, onCt156Level, shadeWhenLoaded } from './ct156-blender.js';

const FILE = 'ct156-cockpit.glb';
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
  old?.then((list) => list.forEach(({ meshes }) => meshes.forEach(({ geometry }) => geometry.dispose())), () => {});
}
function cockpitParts(THREE) {
  // Loaded at another level while no cockpit was open to hear the switch (a Performance view closed, then a High one): the old file goes.
  if (parts && partsLevel !== ct156Level()) dropParts();
  if (!parts) {
    partsLevel = ct156Level();
    parts = loadDelivered(FILE, { tangents: (name) => name === RELIEF_PART }).then((list) => list.map(({ name, extras, meshes }) => ({
      name, ao: extras.ct156_ao ? loadAo(THREE, ct156Files() + extras.ct156_ao) : null, meshes,
    })));
    parts.catch(() => {}); // a missing file leaves the code's parts showing
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
  const entry = { THREE, group, mats, partMats, own: (m) => (entry.mine.push(m), m), mine: [], added: [], hidden: [] };
  attached.set(group, entry);
  stopLevel ??= onCt156Level(onLevel);
  build(entry);
}

/** Frees what a cockpit's Blender parts made (its materials; the shared shapes are freed by onLevel) and shows the code's parts again. */
function unbuild(entry) {
  for (const part of entry.added) part.removeFromParent();
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
  cockpitParts(THREE).then((list) => {
    if (stale()) return;
    for (const { name, ao, meshes } of list) {
      // Every part of the imported delivery replaces the code's part of its name (loadDelivered checked the file came
      // from that delivery; since plan 3.4 the code's fingerprints are no longer compared). 'shade' is the pictured
      // faces' shadows, with no code part of its own.
      const code = group.getObjectByName(`ct156-cockpit-${name}`);
      const part = new THREE.Group();
      part.name = `ct156-cockpit-${name}-model`;
      const relief = []; // [mesh, base] of the body's lit colours, given the relief once its picture loads
      for (const { geometry, material } of meshes) {
        if (material === 'shade') { // the pictured faces' baked shadows, laid over the code's pictures
          if (ao) part.add(new THREE.Mesh(geometry, own(new THREE.MeshBasicMaterial({ map: ao, blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide, fog: false }))));
          continue;
        }
        const base = partMats[name]?.[material] ?? mats[material] ?? mats.frame; // a part may draw a slot in its own colour (partMats)
        // Lit colours take the part's baked shadows; the self-lit lamps don't.
        const m = ao && geometry.attributes.uv && base.isMeshStandardMaterial ? own(aoShaded(base, ao)) : base;
        const mesh = new THREE.Mesh(geometry, m);
        mesh.castShadow = mesh.receiveShadow = !m.transparent; // real-time shadows where a view has them (aircraft-shadows.js)
        part.add(mesh);
        if (m !== base && geometry.attributes.tangent) relief.push([mesh, base]);
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
  }, (e) => console.warn(`${FILE} did not load (${e?.message ?? e}); the code's cockpit parts show`));
}
