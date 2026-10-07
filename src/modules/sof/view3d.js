// The SOF's 3D view of the weather (SPEC-sof, "3D view", SOF-39, phase 1): the map area swapped for a three.js picture of
// the 250 NM square round home. The satellite picture is the ground, with the radar and lightning pictures the 2D map already holds laid
// on it; home and the alternates stand on it as pins with their category in words; the METAR cloud layers hang over them as flat
// round decks at their reported bases; the 25 and 50 NM rings run round home. It is for situational awareness only: it checks no
// limit and never raises or clears a caution.
//
// What is drawn and what the words say is decided in scene3d-model.js (tested in Node). This file builds the three.js objects and
// the camera's hands, and touches the page.
//
// three.js is loaded only when the view is first opened (ui-kit `loadThree`). It draws only while shown, and only when something
// changed (a new report or picture, a tile arriving, the camera moving), through the scheduler's frame: nothing runs while it
// sits still. Hiding it, or closing the module, frees everything three.js made and removes its canvas, because a canvas whose
// WebGL context has been let go can't be given another.
//
// World frame (ui-kit three-aircraft.js): X east, Y north, Z up, in the map's local feet. A height is feet above sea level times
// the height scale (the "3D height scale" setting); the ground is the home field's elevation.
import { h } from '../../ui-kit/dom.js';
import { loadThree, webglSupported, matchProjection, worldToScreen } from '../../ui-kit/three-aircraft.js';
import { createTileLayer, ESRI_IMAGERY } from '../../ui-kit/map-tiles.js';
import { cornersOf, RING_NM, FT_PER_NM } from './map-view.js';
import { drawGeoImage } from './map-draw.js';
import { BASE_DIM } from './map-layers.js';
import {
  AREA_NM, AREA_FT, DECK_FT, CATEGORY_TOKENS, START_CAMERA, ZOOM_STEP, KEY_ORBIT_PX, fitZoom, orbitBy, zoomCamera, sceneSignature,
} from './scene3d-model.js';

/** The ground picture is one square canvas this many pixels across (about 1,480 ft a pixel over 250 NM). */
const GROUND_PX = 1024;
/** The Esri tiles are asked for no finer than this zoom: about 16 to 25 tiles for the whole square, so it loads fast. An estimate. */
const GROUND_ZOOM = 8;
const GROUND_COLOUR = '#1b2a35'; // the plain ground when no satellite picture arrives
const BACKGROUND = '#0a141d';
/** A pin's line and head are this many screen pixels tall and wide at any zoom (they are scaled with the camera). */
const PIN_PX = Object.freeze({ line: 34, head: 5 });
/** Lines lie this far (scene feet) above what they follow, so the ground never hides them. */
const LIFT_FT = 400;
const WHEEL_ZOOM = 0.0015; // per wheel pixel, as the 2D map
const CLICK_PX = 4; // a press that moves less than this is a click, not a drag
const RING_SEGMENTS = 128;
const DECK_SEGMENTS = 64;
const DECK_COLOUR = '#f2f7fb';
const RING_COLOUR = '#8adfff';

const isColour = (v) => typeof v === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\))$/i.test(v.trim());

/**
 * options: { timers (a scheduler scope), getProjection() (the SOF map's projection: toXY and a reference, for the corners of the
 * square), getPictures() (the 2D map's pictures: { sig, list: [{ image, bbox, alpha }] }, read when it draws), onLost() (the graphics
 * context was lost: the caller goes back to 2D), win }.
 * Returns { element, show(), hide(), setScene({ airfields, heightScale }), touch(), home(), zoomBy(factor), isShown(), dispose() }.
 * `show()` resolves { ok: true } or { ok: false, reason: 'gl' | 'load' | 'closed' }.
 */
export function createSofView3d({ timers, getProjection, getPictures, onLost = () => {}, win = globalThis }) {
  const labels = h('div', { class: 'sof-3d-labels' });
  const corner = h('p', { class: 'sof-3d-corner' });
  const credit = h('p', { class: 'sof-3d-credit' }, ESRI_IMAGERY.credit);
  const outside = h('p', { class: 'sof-3d-outside', hidden: true });
  const note = h('p', { class: 'sof-3d-note', role: 'status', hidden: true });
  const tag = h('p', { class: 'sof-3d-tag', role: 'status', hidden: true });
  const element = h('div', { class: 'sof-3d', hidden: true }, labels, corner, outside, credit, note, tag);

  let airfields = [];
  let scale = 5;
  let sceneSig = '';
  let sceneDirty = true;
  let groundDirty = true;
  let picturesSig = null;
  let cam = { ...START_CAMERA, zoom: 1 }; // zoom is relative to the fitting zoom: 1 shows the whole square
  let THREE = null;
  let gl = null; // everything three.js made, while the view is shown
  let wanted = false;
  let loading = false;
  let disposed = false;
  let pending = null;
  let selected = null;
  let tilesFailed = false;
  let noTiles = false; // a tile the browser would not let three.js read: the ground is drawn plain instead
  let loadingNote = false;
  const sizes = new WeakMap(); // each label's size, read once (a read of the page's layout each frame would slow the drag)

  const setText = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
  };
  const showNote = () => {
    const parts = [];
    if (loadingNote) parts.push('Loading the 3D view…');
    if (tilesFailed || noTiles) parts.push('Satellite ground unavailable: plain ground shown.');
    note.hidden = parts.length === 0;
    setText(note, parts.join(' '));
  };
  const setCorner = () => setText(corner, `Heights ×${scale}`);
  setCorner();

  // ---- Drawing on demand ---------------------------------------------------------------------------
  function requestRender() {
    if (!gl || pending || disposed) return;
    pending = timers.frame(() => {
      pending?.();
      pending = null;
      render();
    });
  }

  // ---- Building and freeing the three.js objects ----------------------------------------------------
  function paletteFor(canvas) {
    const style = win.getComputedStyle?.(canvas);
    const out = {};
    for (const [key, [token, fallback]] of Object.entries(CATEGORY_TOKENS)) {
      const value = style?.getPropertyValue(token).trim();
      out[key] = isColour(value) ? value : fallback;
    }
    return out;
  }

  function disposeTree(root) {
    root.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material ?? [])) m.dispose();
    });
    root.removeFromParent();
  }

  /** The pins, decks, height lines and rings, made new each time the scene changes. Returns { root, pins, rings, planeZ, tops }. */
  function buildObjects() {
    const { THREE: T, scene, palette } = gl;
    const homeField = airfields.find((a) => a.home) ?? airfields[0];
    const drawn = airfields.filter((a) => !a.outside);
    const planeZ = (homeField?.groundFt ?? 0) * scale; // the ground is the home field's elevation
    const root = new T.Group();
    const pins = [];
    const rings = [];
    const decks = [];

    gl.ground.position.z = planeZ;

    // Rings: dashed lines on the ground, round home.
    for (const nm of RING_NM) {
      const pts = [];
      for (let i = 0; i < RING_SEGMENTS; i++) {
        const a = (i / RING_SEGMENTS) * Math.PI * 2;
        pts.push(new T.Vector3(Math.cos(a) * nm * FT_PER_NM, Math.sin(a) * nm * FT_PER_NM, planeZ + LIFT_FT));
      }
      const line = new T.LineLoop(new T.BufferGeometry().setFromPoints(pts), new T.LineDashedMaterial({ color: RING_COLOUR, dashSize: 14_000, gapSize: 9_000 }));
      line.computeLineDistances();
      root.add(line);
      const el = h('span', { class: 'sof-3d-ring-label' }, `${nm} NM`);
      labels.append(el);
      rings.push({ el, point: { x: 0, y: nm * FT_PER_NM, z: planeZ + LIFT_FT } });
    }

    const deckGeometry = new T.CircleGeometry(DECK_FT / 2, DECK_SEGMENTS);
    const rimPoints = [];
    for (let i = 0; i < DECK_SEGMENTS; i++) {
      const a = (i / DECK_SEGMENTS) * Math.PI * 2;
      rimPoints.push(new T.Vector3(Math.cos(a) * DECK_FT / 2, Math.sin(a) * DECK_FT / 2, 0));
    }
    const rimGeometry = new T.BufferGeometry().setFromPoints(rimPoints);

    for (const field of drawn) {
      const colour = new T.Color(palette[field.key] ?? palette.none);
      const opacity = field.old || field.key === 'none' ? 0.55 : 1;

      // The pin: a thin line and a head, kept the same size on the screen at any zoom (scaled in `render`).
      const pin = new T.Group();
      pin.position.set(field.x, field.y, planeZ);
      pin.add(new T.Line(
        new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 0, PIN_PX.line)]),
        new T.LineBasicMaterial({ color: colour, transparent: opacity < 1, opacity }),
      ));
      const head = new T.Mesh(new T.SphereGeometry(PIN_PX.head, 16, 12), new T.MeshBasicMaterial({ color: colour, transparent: opacity < 1, opacity }));
      head.position.z = PIN_PX.line;
      pin.add(head);
      root.add(pin);

      const button = h('button', {
        type: 'button',
        class: 'sof-3d-pin',
        dataset: { key: field.key },
        title: field.title,
        'aria-pressed': 'false',
        onclick: () => select(selected === field.icao ? null : field.icao),
      }, field.lines.map((line, i) => h('span', { class: i === 0 ? 'sof-3d-pin-main' : 'sof-3d-pin-extra' }, line)));
      labels.append(button);
      pins.push({ field, pin, button, point: { x: field.x, y: field.y } });

      // The decks: flat round discs at the reported bases, and a thin line from the ground up through them.
      let top = null;
      for (const deck of field.decks) {
        const z = deck.baseMslFt * scale;
        const disc = new T.Mesh(deckGeometry, new T.MeshBasicMaterial({ color: DECK_COLOUR, transparent: true, opacity: deck.opacity, side: T.DoubleSide, depthWrite: false }));
        disc.position.set(field.x, field.y, z);
        disc.renderOrder = 2;
        const rim = new T.LineLoop(rimGeometry, new T.LineBasicMaterial({ color: DECK_COLOUR, transparent: true, opacity: 0.9 }));
        rim.position.copy(disc.position);
        rim.renderOrder = 3;
        root.add(disc, rim);
        const el = h('span', { class: 'sof-3d-deck-label' }, deck.label);
        labels.append(el);
        decks.push({ el, point: { x: field.x, y: field.y, z } });
        top = Math.max(top ?? z, z);
      }
      if (top !== null) {
        root.add(new T.Line(
          new T.BufferGeometry().setFromPoints([new T.Vector3(field.x, field.y, planeZ), new T.Vector3(field.x, field.y, top)]),
          new T.LineBasicMaterial({ color: DECK_COLOUR, transparent: true, opacity: 0.45 }),
        ));
      }
    }
    scene.add(root);
    return { root, pins, rings, decks, planeZ, shared: [deckGeometry, rimGeometry] };
  }

  function freeObjects() {
    if (!gl?.objects) return;
    const { root, shared, pins, rings, decks } = gl.objects;
    disposeTree(root);
    for (const g of shared) g.dispose();
    for (const item of [...pins.map((p) => p.button), ...rings.map((r) => r.el), ...decks.map((d) => d.el)]) item.remove();
    gl.objects = null;
  }

  // ---- The ground: satellite, then radar and lightning on it ------------------------------------------
  function paintGround() {
    const { ctx, imagery, texture } = gl;
    const projection = getProjection();
    const k = GROUND_PX / AREA_FT;
    const half = AREA_FT / 2;
    const toPx = (lat, lon) => {
      const [x, y] = projection.toXY(lat, lon);
      return [(x + half) * k, (half - y) * k];
    };
    ctx.fillStyle = GROUND_COLOUR;
    ctx.fillRect(0, 0, GROUND_PX, GROUND_PX);
    if (!noTiles) {
      const corners = cornersOf(projection, { minX: -half, minY: -half, maxX: half, maxY: half });
      imagery.draw(ctx, { corners, pxPerFt: k, toScreen: toPx });
      const s = imagery.state();
      const failed = s.wanted > 0 && s.ready === 0 && s.failed > 0;
      if (failed !== tilesFailed) {
        tilesFailed = failed;
        showNote();
      }
    }
    ctx.fillStyle = `rgba(5, 10, 18, ${BASE_DIM})`; // dimmed a little under the pictures, as the 2D map does
    ctx.fillRect(0, 0, GROUND_PX, GROUND_PX);
    const { sig, list } = getPictures();
    picturesSig = sig;
    for (const picture of list) {
      try {
        drawGeoImage(ctx, picture.image, picture.bbox, toPx, picture.alpha);
      } catch {
        // A picture the 2D map has just let go of: the next change draws the new one.
      }
    }
    texture.needsUpdate = true;
    groundDirty = false;
  }

  // ---- One frame -----------------------------------------------------------------------------------
  function render() {
    if (!gl || !wanted || disposed) return;
    const { renderer, scene, camera, canvas } = gl;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width < 2 || height < 2) return; // hidden or not laid out yet: the resize observer draws when it has a size
    const ratio = Math.min(win.devicePixelRatio || 1, 2);
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) renderer.setSize(width, height, false);

    if (sceneDirty) {
      freeObjects();
      gl.objects = buildObjects();
      sceneDirty = false;
      if (selected && !airfields.some((a) => a.icao === selected && !a.outside)) select(null);
    }
    if (!groundDirty && getPictures().sig !== picturesSig) groundDirty = true;
    if (groundDirty) paintGround();

    const { pins, rings, decks, planeZ } = gl.objects;
    const size = { width, height };
    const zoom = fitZoom(size) * cam.zoom;
    matchProjection(THREE, camera, { x: 0, y: 0, z: planeZ / scale }, { yawDeg: cam.yawDeg, pitchDeg: cam.pitchDeg, zoom, altScale: scale }, size);
    const ftPerPx = 1000 / zoom;
    for (const { pin } of pins) pin.scale.setScalar(ftPerPx);

    // Labels go beside their points, and a deck's label steps down past any label already there, so words never sit on words.
    const headZ = planeZ + (PIN_PX.line + PIN_PX.head) * ftPerPx;
    const placed = [];
    const put = (el, box) => {
      const text = `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px)`;
      if (el.style.transform !== text) el.style.transform = text;
      placed.push(box);
    };
    const boxFor = (el, x, y) => {
      let s = sizes.get(el);
      if (!s || s.w === 0) {
        s = { w: el.offsetWidth, h: el.offsetHeight };
        sizes.set(el, s);
      }
      return { x, y, w: s.w, h: s.h };
    };
    const at = (point) => worldToScreen(THREE, camera, point, width, height);
    const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const clearOf = (box) => {
      for (let tries = 0; tries < 12 && placed.some((b) => overlaps(box, b)); tries++) box.y += box.h + 1;
      return box;
    };
    for (const { button, point } of pins) { // home first: it keeps its place and the others step down past it
      const p = at({ ...point, z: headZ });
      const s = boxFor(button, 0, 0);
      put(button, clearOf({ ...s, x: p.x + 10, y: p.y - s.h / 2 }));
    }
    for (const { el, point } of rings) {
      const p = at(point);
      const s = boxFor(el, 0, 0);
      put(el, { ...s, x: p.x - s.w / 2, y: p.y - s.h });
    }
    const deckLabels = decks.map(({ el, point }) => ({ el, p: at(point) })).sort((a, b) => a.p.y - b.p.y);
    for (const { el, p } of deckLabels) {
      const s = boxFor(el, 0, 0);
      put(el, clearOf({ ...s, x: p.x - 8 - s.w, y: p.y - s.h / 2 }));
    }
    const chosen = selected && pins.find((q) => q.field.icao === selected);
    if (chosen) {
      const p = at({ ...chosen.point, z: headZ });
      tag.style.transform = `translate(${Math.round(p.x + 10)}px, ${Math.round(p.y + 28)}px)`;
    }

    try {
      renderer.render(scene, camera);
    } catch (err) {
      // The browser refuses a picture from another site as a texture (a tile that came without permission): draw the ground plain.
      if (!noTiles && /security/i.test(`${err?.name} ${err?.message}`)) {
        noTiles = true;
        groundDirty = true;
        showNote();
        requestRender();
        return;
      }
      throw err;
    }
  }

  function select(icao) {
    selected = icao;
    if (gl?.objects) for (const { field, button } of gl.objects.pins) button.setAttribute('aria-pressed', String(field.icao === icao));
    const field = icao ? airfields.find((a) => a.icao === icao && !a.outside) : null;
    tag.hidden = !field;
    if (field) setText(tag, `${field.icao}: ${field.result?.words ?? field.lines.join(', ')}`); // the card's own result line, as words
    requestRender();
  }

  // ---- The camera's hands: drag to turn, wheel or pinch to zoom, arrow keys to turn --------------------
  const pointers = new Map();
  let drag = null; // { x, y, moved } for a single pointer
  let pinch = null; // the distance between two pointers last time

  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const hands = /** @type {[string, (e: any) => void][]} */ ([
    ['pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      gl?.canvas.setPointerCapture?.(e.pointerId);
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, moved: 0 };
      else {
        drag = null;
        pinch = spread();
      }
      gl?.canvas.classList.add('is-dragging');
    }],
    ['pointermove', (e) => {
      const held = pointers.get(e.pointerId);
      if (!held) return;
      held.x = e.clientX;
      held.y = e.clientY;
      if (pointers.size >= 2 && pinch) {
        const now = spread();
        if (now > 0) cam = zoomCamera(cam, now / pinch, 1);
        pinch = now;
      } else if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
        cam = orbitBy(cam, dx, dy);
      }
      requestRender();
    }],
    ['pointerup', endPointer],
    ['pointercancel', endPointer],
    ['keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const turn = KEY_ORBIT_PX[e.key];
      if (turn) {
        e.preventDefault();
        cam = orbitBy(cam, turn[0], turn[1]);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        cam = zoomCamera(cam, ZOOM_STEP, 1);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        cam = zoomCamera(cam, 1 / ZOOM_STEP, 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        cam = { ...START_CAMERA, zoom: 1 };
      } else if (e.key === 'Escape' && selected) {
        e.stopPropagation();
        select(null);
        return;
      } else return;
      requestRender();
    }],
    ['contextmenu', (e) => e.preventDefault()],
    ['webglcontextlost', (e) => {
      e.preventDefault();
      teardown({ lost: true });
      element.hidden = true;
      wanted = false;
      onLost();
    }],
  ]);

  // The wheel zooms over the whole view, labels included (a pin's label is a button over the picture).
  function onWheel(e) {
    e.preventDefault(); // the page does not scroll while the pointer is over the view
    if (!e.deltaY) return;
    cam = zoomCamera(cam, Math.exp(-e.deltaY * WHEEL_ZOOM), 1);
    requestRender();
  }

  function endPointer(e) {
    pointers.delete(e.pointerId);
    gl?.canvas.releasePointerCapture?.(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      gl?.canvas.classList.remove('is-dragging');
      // A press that never moved is a click on the ground: it only closes the pin's tag. The camera never moves on a click.
      if (drag && drag.moved < CLICK_PX && e.type === 'pointerup' && selected) select(null);
      drag = null;
    } else if (pointers.size === 1) {
      const [p] = pointers.values();
      drag = { x: p.x, y: p.y, moved: CLICK_PX };
    }
  }

  // ---- Building and tearing down the view -------------------------------------------------------------
  function build() {
    const canvas = win.document.createElement('canvas');
    canvas.className = 'sof-3d-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '3D view of the weather round home. Drag or press the arrow keys to turn it, scroll or press plus and minus to zoom, Home to start again. Each airfield pin is a button that shows its result.');
    element.prepend(canvas);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch (err) {
      canvas.remove();
      throw err;
    }
    renderer.setClearColor(BACKGROUND);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);

    const groundCanvas = win.document.createElement('canvas');
    groundCanvas.width = GROUND_PX;
    groundCanvas.height = GROUND_PX;
    const ctx = groundCanvas.getContext('2d');
    const texture = new THREE.CanvasTexture(groundCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy?.() ?? 1);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(AREA_FT, AREA_FT), new THREE.MeshBasicMaterial({ map: texture }));
    scene.add(ground);

    const imagery = createTileLayer({
      source: { ...ESRI_IMAGERY, maxZoom: GROUND_ZOOM },
      timers,
      onChange: () => {
        groundDirty = true;
        requestRender();
      },
    });
    let resizer = null;
    if (win.ResizeObserver) {
      resizer = new win.ResizeObserver(() => requestRender());
      resizer.observe(element);
    }
    for (const [type, fn] of hands) canvas.addEventListener(type, fn);
    element.addEventListener('wheel', onWheel, { passive: false });
    gl = { THREE, canvas, renderer, scene, camera, ctx, texture, ground, imagery, resizer, objects: null, palette: paletteFor(canvas) };
    sceneDirty = true;
    groundDirty = true;
    tilesFailed = false;
    noTiles = false;
  }

  function teardown({ lost = false } = {}) {
    pending?.();
    pending = null;
    pointers.clear();
    drag = null;
    pinch = null;
    if (!gl) return;
    const { canvas, renderer, scene, texture, ground, imagery, resizer } = gl;
    freeObjects();
    for (const [type, fn] of hands) canvas.removeEventListener(type, fn);
    element.removeEventListener('wheel', onWheel);
    resizer?.disconnect();
    imagery.dispose();
    ground.geometry.dispose();
    ground.material.dispose();
    texture.dispose();
    scene.clear();
    renderer.dispose();
    if (!lost) renderer.forceContextLoss?.();
    canvas.remove();
    gl = null;
    tilesFailed = false;
    noTiles = false;
    tag.hidden = true;
    selected = null;
    showNote();
  }

  const api = {
    element,
    isShown: () => wanted,
    /**
     * Shows the view, loading three.js the first time. 'gl': this browser cannot draw WebGL2. 'load': three.js would not load
     * (offline). 'closed': hidden or closed again while it was loading.
     */
    async show() {
      if (disposed) return { ok: false, reason: 'closed' };
      if (gl) return { ok: true };
      if (!webglSupported({ document: win.document })) return { ok: false, reason: 'gl' };
      if (loading) return { ok: true };
      wanted = true;
      loading = true;
      element.hidden = false;
      loadingNote = true;
      showNote();
      try {
        THREE = await loadThree();
      } catch {
        loading = false;
        loadingNote = false;
        wanted = false;
        element.hidden = true;
        showNote();
        return { ok: false, reason: 'load' };
      }
      loading = false;
      loadingNote = false;
      if (!wanted || disposed) {
        showNote();
        return { ok: false, reason: 'closed' };
      }
      try {
        build();
      } catch {
        wanted = false;
        element.hidden = true;
        showNote();
        return { ok: false, reason: 'gl' };
      }
      showNote();
      if (selected) select(selected);
      requestRender();
      return { ok: true };
    },
    /** Stops drawing, frees everything three.js made and takes the canvas out. Safe to call twice. */
    hide() {
      wanted = false;
      teardown();
      element.hidden = true;
    },
    /** The airfields and the height scale to show ({ airfields: scene3d-model.js `sceneAirfields`, heightScale }). Drawn again only when they differ. */
    setScene({ airfields: next = [], heightScale = scale } = {}) {
      const sig = `${heightScale}|${sceneSignature(next)}`;
      airfields = next;
      const far = next.filter((a) => a.outside).map((a) => a.icao);
      outside.hidden = far.length === 0;
      setText(outside, far.length ? `Not shown, outside this ${AREA_NM} NM square: ${far.join(', ')}` : '');
      if (heightScale !== scale) {
        scale = heightScale;
        setCorner();
      }
      if (sig === sceneSig) return;
      sceneSig = sig;
      sceneDirty = true;
      if (selected) {
        const field = next.find((a) => a.icao === selected && !a.outside);
        if (field) setText(tag, `${field.icao}: ${field.result?.words ?? field.lines.join(', ')}`);
        else select(null);
      }
      requestRender();
    },
    /** The 2D map's pictures or their fading may have changed: the ground is painted again if they did. */
    touch() {
      if (!gl || !wanted) return;
      if (getPictures().sig !== picturesSig) {
        groundDirty = true;
        requestRender();
      }
    },
    /** Back to the start view: from the south-east, 45 degrees down, the whole square in view. */
    home() {
      cam = { ...START_CAMERA, zoom: 1 };
      requestRender();
    },
    zoomBy(factor) {
      cam = zoomCamera(cam, factor, 1);
      requestRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      wanted = false;
      teardown();
      element.remove();
    },
  };
  return api;
}
