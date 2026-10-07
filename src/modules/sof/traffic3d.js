// The live aircraft in the SOF's 3D view (SPEC-sof, "3D view", SOF-39 phase 4, SOF-40): one three.js object per aircraft the relay reports,
// standing at its position and barometric height (times the height scale) and pointing along its track. It only builds and moves three.js
// objects and the tags' buttons; what to draw (the checked, aged and faded aircraft, T-6s first, the words) is scene3d-model.js
// `sceneTraffic`, and the polling is the 2D layer's own (map.js), so there is one feed and one set of checks.
//
// - A T-6 (relay type TEX2) is the shared CT-156 model (ui-kit ct156-model.js, Harvard paint), drawn large at a fixed size on the screen, with
//   its tag always on in the highlight colour and a drop line to the ground (Dad, 7 Oct: "a noticeable T6 for any aircraft with TEX2").
// - Every other aircraft is a small stand-in (ui-kit three-aircraft.js `createStandInMesh`) in a muted colour; one with no track is a small
//   dot, because a model pointing somewhere would say a heading nobody gave. Military aircraft are amber with a ring, as in 2D. Their tags
//   show on hover or focus, or all the time when the layer's Labels choice is on.
// - Size is on the screen, not in feet: at 250 NM across a real T-6 (33 ft) would be less than a pixel, so each is scaled by the camera's
//   feet per pixel (`fit`), as the pins are. The sizes are estimates for readability (SOF-39), named below.
// - Stale aircraft fade with traffic.js's own opacity. Materials the CT-156 shares between ships are copied for each T-6 so fading one never
//   fades another.
//
// World frame as view3d.js: X east, Y north, Z up, in the map's local feet, the 3D world is true-north up. An aircraft's nose is +X, so a
// track of T degrees true turns it by 90 - T about Z.
import { h } from '../../ui-kit/dom.js';
import { createCt156Model, CT156_UNIT_LENGTH, PAINT_DEFAULT } from '../../ui-kit/ct156-model.js';
import { createStandInMesh, disposeAircraftMesh } from '../../ui-kit/three-aircraft.js';

/** How long each kind is drawn on the screen, in CSS pixels, nose to tail. A T-6 is at least about 40 px (Dad, 7 Oct). Estimates, SOF-39. */
export const SIZE_PX = Object.freeze({ t6: 44, other: 22, dot: 9 });
/** The colours: the T-6's highlight (the 2D layer's own accent), muted for the rest, amber for military (the 2D layer's caution colour). */
export const COLOURS = Object.freeze({ t6: '#8adfff', other: '#9fb0bd', mil: '#f5c542', outline: '#0b1620', drop: '#8adfff' });
/** An aircraft on the ground, or at a pressure altitude under the field's elevation, stands this far (scene feet) above the ground so it is seen. */
const LIFT_FT = 400;
/** The stand-in is about this long in its own units (createStandInMesh), a dot 1. */
const STANDIN_UNITS = 1.38;
const RING_SEGMENTS = 40;
const RING_RADIUS_UNITS = 0.95;
/** A T-6's halo: a flat disc and ring in the highlight colour under it, so it is found at a glance against a dark ground and navy paint. */
const HALO = Object.freeze({ inner: 0.86, opacity: 0.2, ringOpacity: 0.85 });

const rad = (d) => (d * Math.PI) / 180;

/** Which model an aircraft gets: a T-6 the CT-156, one with a track a stand-in, one without a dot. */
export const kindFor = (item) => (item.isT6 ? 'ct156' : item.trackDeg === null ? 'dot' : 'standin');

/**
 * `T` is three.js; `scene` takes the aircraft; `labels` is the element the tags' buttons go in; `onHover(hex | null)` and `onPick(hex)` hear the tags'
 * pointer and click. Returns { set(items, { scale, groundFt }), fit(ftPerPx), entries(), get(hex), dispose() }.
 */
export function createTraffic3d(T, { scene, labels, onHover = () => {}, onPick = () => {} }) {
  const root = new T.Group();
  root.name = 'traffic';
  scene.add(root);
  const entries = new Map();
  const dropGeometry = new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 0, 1)]);
  const dotGeometry = new T.SphereGeometry(0.5, 12, 8);
  const ringPoints = [];
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2;
    ringPoints.push(new T.Vector3(Math.cos(a) * RING_RADIUS_UNITS, Math.sin(a) * RING_RADIUS_UNITS, 0));
  }
  const ringGeometry = new T.BufferGeometry().setFromPoints(ringPoints);
  const haloDisc = new T.CircleGeometry(RING_RADIUS_UNITS, RING_SEGMENTS);
  const haloRing = new T.RingGeometry(HALO.inner, RING_RADIUS_UNITS, RING_SEGMENTS);

  /** Gives each material of a model its own copy (a CT-156's are shared between ships), and returns the list to fade. */
  function fadeList(model, { copy }) {
    const list = [];
    model.traverse((o) => {
      if (!o.material) return;
      const own = [].concat(o.material).map((m) => {
        const mine = copy ? m.clone() : m;
        list.push({ m: mine, opacity: mine.opacity, transparent: mine.transparent, copied: copy });
        return mine;
      });
      o.material = Array.isArray(o.material) ? own : own[0];
    });
    return list;
  }

  function applyFade(entry, opacity) {
    if (entry.fade === opacity) return;
    entry.fade = opacity;
    for (const f of entry.mats) {
      const transparent = f.transparent || opacity < 1;
      if (f.m.transparent !== transparent) {
        f.m.transparent = transparent;
        f.m.needsUpdate = true; // an opaque material is compiled with its alpha forced to 1
      }
      f.m.opacity = f.opacity * opacity;
    }
  }

  function make(item) {
    const kind = kindFor(item);
    const colour = item.mil ? COLOURS.mil : item.isT6 ? COLOURS.t6 : COLOURS.other;
    const group = new T.Group();
    let model;
    let mats;
    let unit = STANDIN_UNITS;
    let px = SIZE_PX.other;
    if (kind === 'ct156') {
      model = createCt156Model(T, { color: COLOURS.t6, paint: PAINT_DEFAULT, lengthFt: CT156_UNIT_LENGTH });
      mats = fadeList(model, { copy: true });
      unit = CT156_UNIT_LENGTH;
      px = SIZE_PX.t6;
    } else if (kind === 'standin') {
      model = createStandInMesh(T, { color: colour, outline: COLOURS.outline });
      mats = fadeList(model, { copy: false });
    } else {
      model = new T.Mesh(dotGeometry, new T.MeshBasicMaterial({ color: colour }));
      mats = fadeList(model, { copy: false });
      unit = 1;
      px = SIZE_PX.dot;
    }
    group.add(model);
    let ring = null;
    if (item.mil) {
      ring = new T.LineLoop(ringGeometry, new T.LineBasicMaterial({ color: COLOURS.mil }));
      group.add(ring);
      mats.push({ m: ring.material, opacity: 1, transparent: false, copied: false });
    }
    let halo = null;
    if (item.isT6) {
      const flat = (geometry, opacity) => new T.Mesh(geometry, new T.MeshBasicMaterial({ color: COLOURS.t6, transparent: true, opacity, depthWrite: false, side: T.DoubleSide }));
      halo = [flat(haloDisc, HALO.opacity), flat(haloRing, HALO.ringOpacity)];
      for (const part of halo) {
        part.renderOrder = 1;
        group.add(part);
        mats.push({ m: part.material, opacity: part.material.opacity, transparent: true, copied: false });
      }
    }
    let drop = null;
    if (item.isT6) {
      drop = new T.Line(dropGeometry, new T.LineBasicMaterial({ color: COLOURS.drop }));
      root.add(drop);
      mats.push({ m: drop.material, opacity: 1, transparent: false, copied: false });
    }
    root.add(group);
    const entry = { hex: item.hex, kind, group, model, ring, halo, drop, mats, unit, px, item, fade: 1, tagEl: null, screen: { x: 0, y: 0 } };
    entry.tagEl = h('button', {
      type: 'button',
      class: `sof-3d-actag${item.isT6 ? ' is-t6' : ''}${item.mil ? ' is-mil' : ''}`,
      title: 'Show this aircraft’s facts',
      onclick: () => onPick(item.hex),
      onpointerenter: () => onHover(item.hex),
      onpointerleave: () => onHover(null),
    });
    labels.append(entry.tagEl);
    return entry;
  }

  function free(entry) {
    root.remove(entry.group);
    if (entry.drop) root.remove(entry.drop);
    if (entry.kind === 'ct156') {
      for (const f of entry.mats) if (f.copied) f.m.dispose();
      disposeAircraftMesh(entry.model); // hands a CT-156 to its own counted disposer
    } else if (entry.kind === 'standin') {
      disposeAircraftMesh(entry.model);
    } else {
      entry.model.material.dispose();
    }
    entry.ring?.material.dispose();
    for (const part of entry.halo ?? []) part.material.dispose();
    entry.drop?.material.dispose();
    entry.tagEl.remove();
  }

  return {
    /**
     * Brings the drawing in line with the items (scene3d-model.js `sceneTraffic`'s aircraft): new ones are made, known ones moved, and gone ones
     * freed. `scale` is the height scale, `groundFt` the ground the view draws (feet above sea level).
     */
    set(items, { scale, groundFt }) {
      const planeZ = groundFt * scale;
      const seen = new Set();
      for (const item of items) {
        seen.add(item.hex);
        let entry = entries.get(item.hex);
        if (entry && (entry.kind !== kindFor(item) || entry.item.mil !== item.mil)) {
          free(entry);
          entries.delete(item.hex);
          entry = undefined;
        }
        if (!entry) {
          entry = make(item);
          entries.set(item.hex, entry);
        }
        entry.item = item;
        const alt = item.altFt === 'ground' ? null : item.altFt;
        // A pressure altitude can read a little under the field's elevation: stand the aircraft on the ground rather than hide it under it.
        const z = alt === null || alt <= groundFt ? planeZ + LIFT_FT : alt * scale;
        entry.group.position.set(item.x, item.y, z);
        entry.group.rotation.z = rad(90 - (item.trackDeg ?? 0));
        if (entry.drop) {
          entry.drop.position.set(item.x, item.y, planeZ);
          entry.drop.scale.z = Math.max(1, z - planeZ);
        }
        applyFade(entry, item.opacity);
        if (entry.tagEl.textContent !== item.labelText) entry.tagEl.textContent = item.labelText;
      }
      for (const [hex, entry] of entries) {
        if (seen.has(hex)) continue;
        free(entry);
        entries.delete(hex);
      }
    },
    /** The camera's scene feet per screen pixel: each aircraft is scaled to its size on the screen. */
    fit(ftPerPx) {
      for (const e of entries.values()) e.group.scale.setScalar((e.px * ftPerPx) / e.unit);
    },
    /** Every aircraft drawn: { hex, item, group, kind, px, tagEl, screen } (`screen` is for the view to fill in, for tags and the hover). */
    entries: () => entries.values(),
    get: (hex) => entries.get(hex),
    dispose() {
      for (const entry of entries.values()) free(entry);
      entries.clear();
      root.removeFromParent();
      dropGeometry.dispose();
      dotGeometry.dispose();
      ringGeometry.dispose();
      haloDisc.dispose();
      haloRing.dispose();
    },
  };
}
