// The live aircraft in the SOF's 3D view (SPEC-sof, "3D view", SOF-39 phase 4, SOF-40): one three.js object per aircraft the relay reports,
// standing at its position and barometric height (times the height scale) and pointing along its track. It only builds and moves three.js
// objects and the tags' buttons; what to draw (the checked, aged and faded aircraft, T-6s first, the words) is scene3d-model.js
// `sceneTraffic`, and the polling is the 2D layer's own (map.js), so there is one feed and one set of checks.
//
// - A T-6 (relay type TEX2) is the shared CT-156 model (ui-kit ct156-model.js, Harvard paint), drawn large at a fixed size on the screen, with
//   its tag always on in the highlight colour and a drop line to the ground (Dad, 7 Oct: "a noticeable T6 for any aircraft with TEX2").
// - Every other aircraft is a small stand-in (ui-kit three-aircraft.js `createStandInMesh`) in a muted colour; one with no track is a small
//   dot, because a model pointing somewhere would say a heading nobody gave. A helicopter (traffic.js marks it, helicopters.js) is a small
//   helicopter (helicopter3d.js: cabin, tail boom, rotor disc; Dad, 8 Oct 2026), and one with no track keeps its cabin and rotor but no tail. An airliner, a
//   business jet, a light aircraft, a military transport or tanker and a fighter or jet trainer (aircraft-kind.js; Dad, 8 Oct 2026) each have their own
//   simple shape (aircraft3d.js), any other the stand-in. Military aircraft are amber with a ring, as in 2D. Their tags
//   show on hover or focus, or all the time when the layer's Labels choice is on.
// - An aircraft that is not a T-6 inside a watched airspace area (airspace-log.js) gets an amber tag with ⚠ that stays on, whatever its kind (Dad, 7 Oct).
//   Its words say so (⚠ and the area in its hover text), the colour is only the second cue.
// - Size is on the screen, not in feet: at 250 NM across a real T-6 (33 ft) would be less than a pixel, so each is scaled by the camera's
//   feet per pixel (`fit`), as the pins are. The sizes are estimates for readability (SOF-39), named below.
// - Smoother traffic (Dad, 7 Oct): between answers `glide(items, nowMs)` moves each aircraft along its track at its ground speed (traffic-motion.js),
//   only moving the objects that already exist. Each aircraft also trails a line behind it: the last couple of minutes of reported positions at their
//   own heights, ending at the aircraft, fading from solid at the aircraft to clear at the end of the window (a vertex colour with alpha; a line is one
//   pixel wide, so it is a thin fading thread). A T-6's is in the highlight colour, an intruder's amber, the rest muted.
// - Stale aircraft fade with traffic.js's own opacity. Materials the CT-156 shares between ships are copied for each T-6 so fading one never
//   fades another.
//
// World frame as view3d.js: X east, Y north, Z up, in the map's local feet, the 3D world is true-north up. An aircraft's nose is +X, so a
// track of T degrees true turns it by 90 - T about Z.
import { h } from '../../ui-kit/dom.js';
import { createCt156Model, CT156_UNIT_LENGTH, PAINT_DEFAULT } from '../../ui-kit/ct156-model.js';
import { createStandInMesh, disposeAircraftMesh } from '../../ui-kit/three-aircraft.js';
import { createHelicopterMesh } from './helicopter3d.js';
import { createKindShapes, SHAPED_KINDS, SHAPE_UNITS } from './aircraft3d.js';
import { glideXY, trailAlpha, TRAIL_WINDOW_S } from './traffic-motion.js';
import { ICON_SCALE } from './scene3d-model.js';

/**
 * How long each kind is drawn on the screen, in CSS pixels, nose to tail, at the medium icon size. A T-6 is at least about 40 px (Dad, 7 Oct); a helicopter a
 * little longer than a stand-in so its rotor reads (about 21 px across); the big kinds a little bigger and the small ones a little smaller, so size says
 * something too. The icon size setting scales them all (scene3d-model.js ICON_SCALE). Estimates, SOF-39.
 */
export const SIZE_PX = Object.freeze({ t6: 44, other: 22, heli: 24, dot: 9, airliner: 25, bizjet: 21, light: 19, 'mil-cargo': 27, 'mil-fast': 21 });
/** The colours: the T-6's highlight (the 2D layer's own accent), muted for the rest, amber for military (the 2D layer's caution colour). */
export const COLOURS = Object.freeze({ t6: '#8adfff', other: '#9fb0bd', mil: '#f5c542', outline: '#0b1620', drop: '#8adfff' });
/** An aircraft on the ground, or at a pressure altitude under the ground below it, stands this far (scene feet) above the ground so it is seen. */
const LIFT_FT = 400;
/** What an aircraft whose height is under the terrain below it says in its tag: the reported height is probably off (a pressure altitude, a wrong barometer), not the aircraft down. */
export const BELOW_TERRAIN_WORDS = 'below terrain?';
/** The stand-in is about this long in its own units (createStandInMesh), a dot 1. */
const STANDIN_UNITS = 1.38;
const RING_SEGMENTS = 40;
const RING_RADIUS_UNITS = 0.95;
/** A T-6's halo: a flat disc and ring in the highlight colour under it, so it is found at a glance against a dark ground and navy paint. */
const HALO = Object.freeze({ inner: 0.86, opacity: 0.2, ringOpacity: 0.85 });

const rad = (d) => (d * Math.PI) / 180;
/** The most vertices a trail has: the reported positions of the window (one every few seconds) and the aircraft itself. A trail with more drops its oldest. */
const TRAIL_MAX_POINTS = 64;
const trailRgb = (T, hex) => {
  const c = new T.Color(hex);
  return [c.r, c.g, c.b];
};

/**
 * Which model an aircraft gets: a T-6 the CT-156; a helicopter the helicopter ('heli', or 'heli-still' with no tail when it has no track); one with no
 * track a dot (a shape would show a heading nobody gave); an airliner, business jet, light aircraft, military transport or fighter its own shape (the
 * kind's name); any other a stand-in.
 */
export const kindFor = (item) => {
  if (item.isT6) return 'ct156';
  if (item.helicopter) return item.trackDeg === null ? 'heli-still' : 'heli';
  if (item.trackDeg === null) return 'dot';
  return SHAPED_KINDS.includes(item.kind) ? item.kind : 'standin';
};

/**
 * `T` is three.js; `scene` takes the aircraft; `labels` is the element the tags' buttons go in; `onHover(hex | null)` and `onPick(hex)` hear the tags'
 * pointer and click. Returns { set(items, { scale, groundFt, intruders, terrain }), fit(ftPerPx), entries(), get(hex), dispose() }.
 */
export function createTraffic3d(T, { scene, labels, onHover = () => {}, onPick = () => {} }) {
  const root = new T.Group();
  root.name = 'traffic';
  scene.add(root);
  const entries = new Map();
  const shapes = createKindShapes(T); // each kind's geometry, made once and shared
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
    let px = /** @type {number} */ (SIZE_PX.other);
    if (kind === 'ct156') {
      model = createCt156Model(T, { color: COLOURS.t6, paint: PAINT_DEFAULT, lengthFt: CT156_UNIT_LENGTH });
      mats = fadeList(model, { copy: true });
      unit = CT156_UNIT_LENGTH;
      px = SIZE_PX.t6;
    } else if (kind === 'standin') {
      model = createStandInMesh(T, { color: colour, outline: COLOURS.outline });
      mats = fadeList(model, { copy: false });
    } else if (kind === 'heli' || kind === 'heli-still') {
      model = createHelicopterMesh(T, { color: colour, outline: COLOURS.outline, tail: kind === 'heli' });
      mats = fadeList(model, { copy: false });
      px = SIZE_PX.heli;
    } else if (SHAPED_KINDS.includes(kind)) {
      model = shapes.mesh(kind, { color: colour, outline: COLOURS.outline });
      mats = fadeList(model, { copy: false });
      unit = SHAPE_UNITS;
      px = SIZE_PX[kind];
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
    const entry = { hex: item.hex, kind, group, model, ring, halo, drop, mats, unit, basePx: px, px: px * planeOf.iconScale, item, fade: 1, lifted: false, intruder: false, tagEl: null, screen: { x: 0, y: 0 }, trail: null };
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
    } else if (entry.kind === 'standin' || entry.kind === 'heli' || entry.kind === 'heli-still') {
      disposeAircraftMesh(entry.model);
    } else if (SHAPED_KINDS.includes(entry.kind)) {
      shapes.release(entry.model); // its materials; the kind's geometry is shared and freed with the view
    } else {
      entry.model.material.dispose();
    }
    freeTrail(entry);
    entry.ring?.material.dispose();
    for (const part of entry.halo ?? []) part.material.dispose();
    entry.drop?.material.dispose();
    entry.tagEl.remove();
  }

  const COLOUR_RGB = { t6: trailRgb(T, COLOURS.t6), mil: trailRgb(T, COLOURS.mil), other: trailRgb(T, COLOURS.other) };
  const planeOf = { z: 0, scale: 1, groundFt: 0, trailsOn: true, terrain: null, iconScale: 1, ftPerPx: null }; // what `set` last knew, for `glide` and `fit`
  /** The ground under a point, feet above sea level: the real terrain when the view has it, else home's elevation. */
  const groundAt = (x, y) => (planeOf.terrain ? planeOf.terrain.heightFt(x, y) : planeOf.groundFt);

  function freeTrail(entry) {
    if (!entry.trail) return;
    root.remove(entry.trail.line);
    entry.trail.line.geometry.dispose();
    entry.trail.line.material.dispose();
    entry.trail = null;
  }

  const zOf = (altFt, x, y) => {
    const ground = groundAt(x, y);
    return altFt === 'ground' || altFt === null || altFt === undefined || altFt <= ground ? ground * planeOf.scale + LIFT_FT : altFt * planeOf.scale;
  };

  /**
   * The trail of one aircraft for the moment `nowMs`: its reported positions in the window at their own heights, then the aircraft where it is now,
   * each vertex solid to clear by its age. Only vertex buffers are rewritten; the line is made the first time it is wanted.
   */
  function drawTrail(entry, nowMs) {
    const item = entry.item;
    const points = planeOf.trailsOn ? (item.trail ?? []).filter((p) => nowMs - p.t <= TRAIL_WINDOW_S * 1000).slice(-(TRAIL_MAX_POINTS - 1)) : [];
    if (points.length === 0) {
      if (entry.trail) entry.trail.line.visible = false;
      return;
    }
    if (!entry.trail) {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(TRAIL_MAX_POINTS * 3), 3));
      geometry.setAttribute('color', new T.BufferAttribute(new Float32Array(TRAIL_MAX_POINTS * 4), 4));
      const line = new T.Line(geometry, new T.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
      line.frustumCulled = false; // its bounds are never worked out, and it is always near the aircraft
      line.renderOrder = 2;
      root.add(line);
      entry.trail = { line };
    }
    const { line } = entry.trail;
    const rgb = entry.item.mil ? COLOUR_RGB.mil : entry.item.isT6 ? COLOUR_RGB.t6 : COLOUR_RGB.other;
    const colour = entry.intruder ? COLOUR_RGB.mil : rgb; // an intruder (not a T-6 in a watched area) is amber, whatever its kind
    const pos = line.geometry.attributes.position;
    const col = line.geometry.attributes.color;
    let lastAlt = null;
    points.forEach((p, i) => {
      lastAlt = p.altFt ?? lastAlt;
      pos.setXYZ(i, p.x, p.y, zOf(lastAlt, p.x, p.y));
      col.setXYZW(i, colour[0], colour[1], colour[2], trailAlpha(p.t, nowMs));
    });
    const n = points.length;
    pos.setXYZ(n, entry.group.position.x, entry.group.position.y, entry.group.position.z);
    col.setXYZW(n, colour[0], colour[1], colour[2], 1);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    line.geometry.setDrawRange(0, n + 1);
    line.material.opacity = entry.fade;
    line.visible = true;
  }

  function fitAll(ftPerPx) {
    planeOf.ftPerPx = ftPerPx;
    for (const e of entries.values()) e.group.scale.setScalar((e.px * ftPerPx) / e.unit);
  }

  return {
    /**
     * Brings the drawing in line with the items (scene3d-model.js `sceneTraffic`'s aircraft): new ones are made, known ones moved, and gone ones
     * freed. `scale` is the height scale, `groundFt` the ground the view draws (feet above sea level), `intruders` a Map from the hex id of each aircraft that is
     * not a T-6 inside a watched area to the area(s) it is in ("CYA304"): each gets the amber ⚠ tag. `nowMs` is the clock for gliding each aircraft
     * to where it should be by now (see `glide`); `trailsOn` shows the trails (the items carry their positions). `terrain` is the view's { heightFt(x, y), known(x, y) } (terrain3d.js):
     * an aircraft stays at its reported height above sea level whatever the ground does; one on the ground, with no height, or reported under the terrain below it is drawn just
     * above the terrain there, and the last of those says "below terrain?" in its tag (the data is off; it has not crashed). Its drop line goes to the terrain.
     * `display` is the Traffic display settings (scene3d-model.js `cleanTrafficDisplay`): the icon size scales every aircraft on the screen, the tag text
     * size goes on the tags' box (`data-tag-size`, sof.css), and a T-6's tag is the larger one only while "T-6 tags larger and always on" is on. Changing
     * them moves nothing and makes nothing again.
     */
    set(items, { scale, groundFt, intruders = new Map(), nowMs = Date.now(), trailsOn = true, terrain = null, display = null }) {
      const planeZ = groundFt * scale;
      const iconScale = ICON_SCALE[display?.iconSize] ?? 1;
      const t6Big = display?.t6Tags !== false;
      const tagSize = display?.tagSize ?? 'medium';
      if (labels.dataset.tagSize !== tagSize) labels.dataset.tagSize = tagSize;
      const rescale = iconScale !== planeOf.iconScale;
      Object.assign(planeOf, { z: planeZ, scale, groundFt, trailsOn, terrain, iconScale }); // before any aircraft is made, so a new one has the size in force
      const seen = new Set();
      for (const item of items) {
        seen.add(item.hex);
        let entry = entries.get(item.hex);
        if (entry && (entry.kind !== kindFor(item) || entry.item.mil !== item.mil)) { // a new kind (a helicopter found, a track lost) is made again
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
        const here = glideXY(item, nowMs);
        const ground = groundAt(here.x, here.y);
        // A pressure altitude can read a little under the ground: stand the aircraft just above it rather than hide it under it.
        const lifted = alt === null || alt <= ground;
        entry.lifted = lifted;
        const z = lifted ? ground * scale + LIFT_FT : alt * scale;
        const below = alt !== null && alt <= ground && terrain?.known(here.x, here.y) === true;
        entry.group.position.set(here.x, here.y, z);
        entry.group.rotation.z = rad(90 - (item.trackDeg ?? 0));
        if (entry.drop) {
          entry.drop.position.set(here.x, here.y, ground * scale);
          entry.drop.scale.z = Math.max(1, z - ground * scale);
        }
        applyFade(entry, item.opacity);
        entry.tagEl.classList.toggle('is-big', item.isT6 && t6Big);
        const area = intruders.get(item.hex);
        entry.intruder = area !== undefined;
        entry.tagEl.classList.toggle('is-intruder', entry.intruder);
        drawTrail(entry, nowMs);
        const words = `${entry.intruder ? '⚠ ' : ''}${item.labelText}${below ? ` ${BELOW_TERRAIN_WORDS}` : ''}`;
        if (entry.tagEl.textContent !== words) entry.tagEl.textContent = words;
        const facts = below ? `Reported height is under the terrain below it, so it is drawn just above the ground: the height data is off, not the aircraft down. ` : '';
        const heli = item.helicopter ? 'Helicopter. ' : item.kindWords && item.kind !== 'other' ? `${item.kindWords}. ` : ''; // its kind in words (aircraft-kind.js)
        const title = entry.intruder ? `${facts}${heli}Not a T-6, inside ${area}. Information only. Advisory area activity is not a SOF caution. Press to show this aircraft’s facts.` : `${facts}${heli}Show this aircraft’s facts`;
        if (entry.tagEl.title !== title) entry.tagEl.title = title;
      }
      for (const [hex, entry] of entries) {
        if (seen.has(hex)) continue;
        free(entry);
        entries.delete(hex);
      }
      if (rescale) for (const e of entries.values()) e.px = e.basePx * iconScale;
      if (planeOf.ftPerPx !== null) fitAll(planeOf.ftPerPx); // new aircraft (and all of them, for a new icon size) get their size now
    },
    /**
     * Moves each aircraft along its track to where it should be by `nowMs` (the items are the scene's latest, which may be newer than the ones `set` last
     * drew; a hex without an object yet is skipped), and stretches its trail to meet it. Moves existing objects only. Returns how many were moved.
     */
    glide(items, nowMs) {
      let moved = 0;
      for (const item of items) {
        const entry = entries.get(item.hex);
        if (!entry || !Number.isFinite(item.vx)) continue;
        const here = glideXY(item, nowMs);
        entry.group.position.x = here.x;
        entry.group.position.y = here.y;
        // Over rising ground an aircraft standing on it (no height, or under the terrain) keeps just above it as it moves, and a drop line keeps to the ground under it.
        if (planeOf.terrain && (entry.lifted || entry.drop)) {
          const ground = groundAt(here.x, here.y) * planeOf.scale;
          if (entry.lifted) entry.group.position.z = ground + LIFT_FT;
          if (entry.drop) {
            entry.drop.position.set(here.x, here.y, ground);
            entry.drop.scale.z = Math.max(1, entry.group.position.z - ground);
          }
        } else if (entry.drop) {
          entry.drop.position.x = here.x;
          entry.drop.position.y = here.y;
        }
        drawTrail(entry, nowMs);
        moved += 1;
      }
      return moved;
    },
    /** The camera's scene feet per screen pixel: each aircraft is scaled to its size on the screen (`px`, its kind's size times the icon size). */
    fit: fitAll,
    /** Every aircraft drawn: { hex, item, group, kind, px, tagEl, screen } (`screen` is for the view to fill in, for tags and the hover). */
    entries: () => entries.values(),
    get: (hex) => entries.get(hex),
    dispose() {
      for (const entry of entries.values()) free(entry);
      entries.clear();
      root.removeFromParent();
      shapes.dispose();
      dropGeometry.dispose();
      dotGeometry.dispose();
      ringGeometry.dispose();
      haloDisc.dispose();
      haloRing.dispose();
    },
  };
}
