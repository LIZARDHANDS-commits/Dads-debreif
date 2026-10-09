// The CT-156 Harvard II's front cockpit as the student sees it (Dad's ask, 9 Oct 2026; Patrick approved; TS-154):
// the instrument panel under its glareshield, the side consoles, the seats and headrests, and the rear cockpit's panel.
// The canopy bows, sill rails, seat backs, floor, wings and tail are the ship's own (ct156-model.js setCockpitView).
// A picture only: no flight numbers, no flight formulas. Like ct156-model.js it imports nothing from the app, and
// three.js is passed in.
//
//   const pit = createCt156Cockpit(THREE, { doc: document });
//   shipRoot.add(pit.group);   // a child of a createCt156Model root, so it moves, banks and pitches with the airframe
//   pit.update(hud);           // the panel's live instruments, from the HUD's numbers (hud.js drawHud's `hud`)
//   pit.dispose();
//
// Inside `group` everything is in feet, from the model's origin (on the spinner's axis), nose +X, left +Y, up +Z; the
// group itself is scaled to the model's units, so it lands on the model's canopy and seats at any ship size.
//
// Every size here is an ESTIMATE until Patrick rules: either taken off the model's own tables (ct156-model.js, measured
// off Patrick's side-on photo of CT-156 156101) or judged by eye, as each line says. No manual page backs them yet.
import {
  CT156_UNIT_LENGTH, CT156_LENGTH_FT, CT156_FRAME_X, CT156_SEAT_X, CT156_HELMET_Z,
  ct156CanopySection, ct156CanopyHalfWidth, ct156FuselageSection,
} from './ct156-model.js';
import { drawAttitude } from './hud.js';

/** Feet per model unit (the model's 1.44 units are the T-6A's 33 ft 4 in). */
export const CT156_FT_PER_UNIT = CT156_LENGTH_FT / CT156_UNIT_LENGTH;
const F = CT156_FT_PER_UNIT;

/**
 * The student's eye in the front seat, feet: the centre of the model's front helmet (CT156_SEAT_X[0], CT156_HELMET_Z),
 * about 1.4 ft ahead of the origin and 2.3 ft above the spinner's axis. Estimate (model table).
 */
export const EYE_FT = Object.freeze({ x: CT156_SEAT_X[0] * F, y: 0, z: CT156_HELMET_Z * F });

/**
 * The forward canopy bow (the windscreen's frame), feet: the model's front frame hoop station (CT156_FRAME_X[0], about
 * 3.7 ft) and its crest, the canopy's top there (about 2.6 ft). Estimate (model tables).
 */
export const FORWARD_BOW_FT = Object.freeze({ x: CT156_FRAME_X[0] * F, crestZ: ct156CanopySection(CT156_FRAME_X[0]).top * F });

/**
 * The instrument panel, feet. Its face stands at the forward bow's station (model table); its bottom is the fuselage's
 * top line there (about 1.0 ft, model table, where the floor meets it); its top is the glareshield (1.85 ft, estimate by
 * eye); 2.6 ft across at most (estimate), trimmed to fit inside the canopy at each height.
 */
export const PANEL_FT = Object.freeze({
  x: FORWARD_BOW_FT.x,
  top: 1.85,
  bottom: ct156FuselageSection(CT156_FRAME_X[0]).top * F,
  width: 2.6,
  insetFromGlass: 0.06, // the panel's edge stays this far inside the canopy (estimate)
});

/** The glareshield over the panel, feet: from just behind the panel face to 4.4 ft forward; its lip 0.09 ft deep (estimates). */
export const GLARESHIELD_FT = Object.freeze({ aftX: PANEL_FT.x - 0.1, foreX: 4.4, top: PANEL_FT.top, edgeTop: PANEL_FT.top - 0.05, lip: PANEL_FT.top - 0.09 });

/**
 * The seats (front and rear, at the model's seat stations), the side consoles beside the front seat and the rear
 * cockpit's panel behind the front seat, feet. All estimates by eye; the seat backs themselves are the model's.
 */
export const SEATS_FT = Object.freeze(CT156_SEAT_X.map((x) => Object.freeze({
  backX: (x - 0.035) * F, // the model's seat back (ct156-model.js, the frames), whose front face the pan starts from
  pan: { aft: (x - 0.028) * F, fore: (x - 0.028) * F + 1.2, z0: 1.04, z1: 1.2, halfWidth: 0.55 },
  headrest: { aft: (x - 0.035) * F - 0.16, fore: (x - 0.035) * F + 0.16, z0: 2.2, z1: 2.7, halfWidth: 0.3 },
})));
export const CONSOLE_FT = Object.freeze({ aft: SEATS_FT[0].backX + 0.2, fore: PANEL_FT.x - 0.1, inner: 0.85, outer: 1.15, z0: 0.75, z1: 1.0 });
export const REAR_PANEL_FT = Object.freeze({ x: CT156_FRAME_X[1] * F, depth: 0.3, z0: 0.95, z1: 1.75, halfWidth: 1.05 });

/** The panel picture: 1,024 by 384 pixels over the full panel width, so its pixels are square on the panel. */
const CANVAS = Object.freeze({ width: 1024, height: 384 });
const PX_PER_FT = CANVAS.width / PANEL_FT.width;
/** The panel redraws at most this often, and only when what it shows has changed (a picture; 5 a second is plenty). */
export const PANEL_REDRAW_MS = 200;

const deg = (r) => (r * 180) / Math.PI;

/**
 * Where the forward bow's crest and the glareshield's top sit from an eye point (feet, the model's frame), in degrees
 * above (+) or below (-) the eye's level line along the nose, with the head straight ahead.
 */
export function panelAnglesFrom(eyeFt = EYE_FT) {
  return {
    bowCrestDeg: deg(Math.atan2(FORWARD_BOW_FT.crestZ - eyeFt.z, FORWARD_BOW_FT.x - eyeFt.x)),
    glareshieldDeg: deg(Math.atan2(GLARESHIELD_FT.top - eyeFt.z, GLARESHIELD_FT.aftX - eyeFt.x)),
  };
}

/** The panel's half-width at height z (feet): 2.6 ft across at most, kept inside the canopy at the panel's station. */
function panelHalfWidthFt(z, x = PANEL_FT.x) {
  const glass = ct156CanopyHalfWidth(x / F, z / F) * F - PANEL_FT.insetFromGlass;
  return Math.max(0, Math.min(PANEL_FT.width / 2, glass));
}

// ---------- the panel picture ----------
// Layout (an ESTIMATE until Patrick rules, from the CT-156's general arrangement, not a manual page): the EADI over the
// EHSI in the centre; airspeed left of them with the standby attitude under it; the altimeter right with the VSI under
// it; the G meter and the AOA indexer at the far left, the gear handle under them; the engine display column at the
// far right (static: the sim has no engine numbers). Only attitude, airspeed, altitude, heading and G are live.

const PANEL_GREY = '#2b2f35';
const FACE = '#0b0d10';
const INK = '#e8edf2';
const DIM = 'rgba(200, 215, 230, 0.7)';
const num = (v, digits = 0) => (Number.isFinite(v) ? v.toLocaleString('en-CA', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—');
const u = (yFt) => CANVAS.width / 2 - yFt * PX_PER_FT; // the pilot's left (+y) is the picture's left
const v = (zFt) => (PANEL_FT.top - zFt) * PX_PER_FT;

function panelOutline(ctx) {
  ctx.beginPath();
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const z = PANEL_FT.bottom + ((PANEL_FT.top - PANEL_FT.bottom) * i) / steps;
    const w = panelHalfWidthFt(z);
    if (i === 0) ctx.moveTo(u(w), v(z));
    else ctx.lineTo(u(w), v(z));
  }
  for (let i = steps; i >= 0; i--) {
    const z = PANEL_FT.bottom + ((PANEL_FT.top - PANEL_FT.bottom) * i) / steps;
    ctx.lineTo(u(-panelHalfWidthFt(z)), v(z));
  }
  ctx.closePath();
}

function bezel(ctx, cx, cy, r) {
  ctx.fillStyle = '#16191d';
  ctx.fillRect(cx - r - 8, cy - r - 8, 2 * r + 16, 2 * r + 16);
  ctx.fillStyle = FACE;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function label(ctx, text, x, y, px = 11, colour = DIM, align = 'center') {
  ctx.fillStyle = colour;
  ctx.font = `${px}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/** A round dial: ticks from `from` to `to` over `sweepDeg` from the top, a needle at `value`, a digital box under it. */
function dial(ctx, { cx, cy, r, from, to, sweepDeg, startDeg = 0, major, minor, name, value, readout, labelOf = (n) => String(n) }) {
  bezel(ctx, cx, cy, r);
  const angleOf = (n) => ((startDeg + ((n - from) / (to - from)) * sweepDeg - 90) * Math.PI) / 180;
  ctx.strokeStyle = INK;
  for (let n = from; n <= to + 1e-9; n += minor) {
    const a = angleOf(n);
    const big = Math.abs(n / major - Math.round(n / major)) < 1e-6;
    ctx.lineWidth = big ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    ctx.lineTo(cx + Math.cos(a) * r * (big ? 0.78 : 0.85), cy + Math.sin(a) * r * (big ? 0.78 : 0.85));
    ctx.stroke();
    if (big) label(ctx, labelOf(n), cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, Math.round(r * 0.2), INK);
  }
  label(ctx, name, cx, cy - r * 0.32, Math.round(r * 0.18));
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - r * 0.42, cy + r * 0.2, r * 0.84, r * 0.3);
  label(ctx, readout, cx, cy + r * 0.35, Math.round(r * 0.24), INK);
  if (Number.isFinite(value)) {
    const a = angleOf(Math.max(from, Math.min(to, value)));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * r * 0.12, cy - Math.sin(a) * r * 0.12);
    ctx.lineTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82);
    ctx.stroke();
  }
  ctx.fillStyle = '#555';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
}

/** The EHSI: a compass card turning with the heading under a fixed lubber line, the heading in a box on top. */
function ehsi(ctx, cx, cy, r, headingDeg) {
  bezel(ctx, cx, cy, r);
  const hdg = Number.isFinite(headingDeg) ? headingDeg : 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-hdg * Math.PI) / 180);
  ctx.strokeStyle = INK;
  for (let d = 0; d < 360; d += 5) {
    const a = ((d - 90) * Math.PI) / 180;
    const big = d % 30 === 0;
    ctx.lineWidth = d % 10 === 0 ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    ctx.lineTo(Math.cos(a) * r * (big ? 0.8 : d % 10 === 0 ? 0.85 : 0.89), Math.sin(a) * r * (big ? 0.8 : d % 10 === 0 ? 0.85 : 0.89));
    ctx.stroke();
    if (big) {
      ctx.save();
      ctx.translate(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66);
      ctx.rotate(((d) * Math.PI) / 180);
      const name = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10);
      label(ctx, name, 0, 0, Math.round(r * 0.2), INK);
      ctx.restore();
    }
  }
  ctx.restore();
  // The fixed aircraft symbol and lubber line.
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.3); ctx.lineTo(cx, cy + r * 0.3);
  ctx.moveTo(cx - r * 0.22, cy - r * 0.05); ctx.lineTo(cx + r * 0.22, cy - r * 0.05);
  ctx.moveTo(cx - r * 0.1, cy + r * 0.25); ctx.lineTo(cx + r * 0.1, cy + r * 0.25);
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.95); ctx.lineTo(cx - 6, cy - r * 0.95 - 9); ctx.lineTo(cx + 6, cy - r * 0.95 - 9); ctx.closePath();
  ctx.fill();
  const text = Number.isFinite(headingDeg) ? String(Math.round(((headingDeg % 360) + 360) % 360) || 360).padStart(3, '0') : '—';
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - 26, cy - r - 8, 52, 18);
  label(ctx, `${text}°`, cx, cy - r + 1, 14, INK);
}

function drawPanel(ctx, hud) {
  const h = hud ?? {};
  ctx.clearRect(0, 0, CANVAS.width, CANVAS.height);
  ctx.save();
  panelOutline(ctx);
  ctx.fillStyle = PANEL_GREY;
  ctx.fill();
  ctx.clip();
  const mid = CANVAS.width / 2;
  // The EADI over the EHSI (the HUD's own attitude drawing, hud.js drawAttitude: bank right wing down positive).
  const eadi = { x: mid, y: v(PANEL_FT.top - 0.33), r: 58 };
  ctx.fillStyle = '#121418';
  ctx.fillRect(eadi.x - 74, eadi.y - 70, 148, 140);
  drawAttitude(ctx, eadi.x, eadi.y, eadi.r, h.pitchDeg, h.bankDeg);
  label(ctx, 'EADI', eadi.x - 62, eadi.y - 60, 9, DIM, 'left');
  ehsi(ctx, mid, v(PANEL_FT.bottom + 0.2), 54, h.headingDeg);
  // Airspeed, left of centre: the HUD's indicated airspeed, labelled as the HUD labels it (KIAS). Dial range an estimate.
  const left = mid - 150;
  dial(ctx, { cx: left, cy: eadi.y, r: 50, from: 0, to: 320, sweepDeg: 320, major: 40, minor: 10, name: 'KIAS', value: h.kias, readout: num(h.kias), labelOf: (n) => String(n / 10) });
  // The standby attitude under it (the same live attitude).
  bezel(ctx, left, v(PANEL_FT.bottom + 0.2), 36);
  drawAttitude(ctx, left, v(PANEL_FT.bottom + 0.2), 34, h.pitchDeg, h.bankDeg);
  label(ctx, 'STBY', left, v(PANEL_FT.bottom + 0.2) + 46, 9);
  // The altimeter, right of centre: one turn a thousand feet, the height in the box.
  const right = mid + 150;
  const alt = Number.isFinite(h.altFt) ? h.altFt : NaN;
  dial(ctx, { cx: right, cy: eadi.y, r: 50, from: 0, to: 1000, sweepDeg: 360, major: 100, minor: 20, name: 'ALT', value: Number.isFinite(alt) ? ((alt % 1000) + 1000) % 1000 : NaN, readout: num(alt), labelOf: (n) => (n === 1000 ? '' : String(n / 100)) });
  // The VSI under it: no vertical speed comes from the sim, so it shows no needle.
  dial(ctx, { cx: right, cy: v(PANEL_FT.bottom + 0.2), r: 38, from: -4, to: 4, sweepDeg: 300, startDeg: -240, major: 2, minor: 1, name: 'VSI', value: NaN, readout: '—', labelOf: (n) => String(Math.abs(n)) });
  // The G meter and the AOA indexer, far left; the gear handle under them.
  const farLeft = mid - 285;
  dial(ctx, { cx: farLeft, cy: eadi.y + 6, r: 42, from: -4, to: 8, sweepDeg: 300, startDeg: -150, major: 2, minor: 1, name: 'G', value: h.g, readout: num(h.g, 1) });
  for (const { dy, colour } of [{ dy: -14, colour: '#2ec95c' }, { dy: 0, colour: '#ffd23f' }, { dy: 14, colour: '#e8452c' }]) {
    ctx.fillStyle = colour;
    ctx.globalAlpha = 0.35; // unlit: the sim has no angle of attack to light it
    ctx.fillRect(farLeft + 56, eadi.y - 54 + dy, 18, 9);
  }
  ctx.globalAlpha = 1;
  label(ctx, 'AOA', farLeft + 65, eadi.y - 82, 9);
  const gear = { x: farLeft + 20, y: v(PANEL_FT.bottom + 0.2) };
  ctx.fillStyle = '#16191d';
  ctx.fillRect(gear.x - 36, gear.y - 36, 72, 72);
  ctx.fillStyle = '#c9ced4';
  ctx.fillRect(gear.x - 4, gear.y - 26, 8, 40);
  ctx.beginPath();
  ctx.arc(gear.x, gear.y + 18, 11, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, 'GEAR', gear.x, gear.y - 30, 9);
  // The engine display column, far right (static).
  const eng = { x: mid + 268, y: v(PANEL_FT.top - 0.15) };
  ctx.fillStyle = '#05070a';
  ctx.fillRect(eng.x - 48, eng.y, 96, 240);
  ['TRQ', 'ITT', 'NP', 'N1', 'OIL P', 'OIL T', 'FUEL'].forEach((name, i) => {
    label(ctx, name, eng.x - 40, eng.y + 18 + i * 32, 11, '#7fd18a', 'left');
    label(ctx, '—', eng.x + 38, eng.y + 18 + i * 32, 12, INK, 'right');
  });
  ctx.restore();
}

/** What the panel shows, rounded to what it can show: a change smaller than this doesn't redraw it. */
function panelKey(hud) {
  if (!hud) return 'none';
  const r = (x, step) => (Number.isFinite(x) ? Math.round(x / step) : 'x');
  return [r(hud.pitchDeg, 0.5), r(hud.bankDeg, 0.5), r(hud.kias, 1), r(hud.altFt, 10), r(hud.headingDeg, 1), r(hud.g, 0.1)].join('|');
}

// ---------- the 3D parts ----------

/** A box from its corners (feet). */
function box(THREE, x0, x1, y0, y1, z0, z1) {
  return new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** The glareshield: its cross-section (across and up) drawn once and pushed forward from just behind the panel face. */
function glareshieldGeometry(THREE) {
  const g = GLARESHIELD_FT;
  const hw = Math.min(panelHalfWidthFt(g.edgeTop, g.aftX), panelHalfWidthFt(g.edgeTop, g.foreX));
  const shape = new THREE.Shape();
  shape.moveTo(-hw, g.lip);
  shape.lineTo(hw, g.lip);
  shape.lineTo(hw, g.edgeTop);
  shape.quadraticCurveTo(0, g.top + (g.top - g.edgeTop), -hw, g.edgeTop); // a low arch, its middle at g.top
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: g.foreX - g.aftX, bevelEnabled: false, curveSegments: 8 });
  // The shape's (across, up, depth) to the model's (y, z, x): a turn, not a mirror.
  geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, g.aftX, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  return geo;
}

/**
 * The cockpit's parts as a THREE.Group to add to a ship's root (createCt156Model), with update(hud) for the panel's live
 * instruments and dispose() to free everything it made. doc: the document its panel canvas is drawn on.
 * @param {any} THREE
 * @param {{ doc?: Document }} [options]
 */
export function createCt156Cockpit(THREE, { doc = globalThis.document } = {}) {
  const group = new THREE.Group();
  group.name = 'ct156-cockpit';
  group.scale.setScalar(1 / F); // built in feet, drawn in the model's units
  const canvas = doc.createElement('canvas');
  canvas.width = CANVAS.width;
  canvas.height = CANVAS.height;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  // Two materials: the panel picture (lit by itself, as the screens are) and a dark grey for everything else.
  const panelMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, fog: false });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#25292f', roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide, fog: false });
  const geometries = [];
  const add = (geometry, material) => {
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, material);
    group.add(m);
    return m;
  };

  // The panel: one quad, facing aft, its picture's top at the glareshield.
  const quadH = (CANVAS.height / CANVAS.width) * PANEL_FT.width;
  const panelGeo = new THREE.PlaneGeometry(PANEL_FT.width, quadH);
  panelGeo.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)));
  panelGeo.translate(PANEL_FT.x, 0, PANEL_FT.top - quadH / 2);
  add(panelGeo, panelMat);
  add(glareshieldGeometry(THREE), trimMat);
  // The side consoles beside the front seat.
  for (const s of [1, -1]) add(box(THREE, CONSOLE_FT.aft, CONSOLE_FT.fore, s > 0 ? CONSOLE_FT.inner : -CONSOLE_FT.outer, s > 0 ? CONSOLE_FT.outer : -CONSOLE_FT.inner, CONSOLE_FT.z0, CONSOLE_FT.z1), trimMat);
  // The seat pans and headrests, front and rear.
  for (const seat of SEATS_FT) {
    const { pan, headrest } = seat;
    add(box(THREE, pan.aft, pan.fore, -pan.halfWidth, pan.halfWidth, pan.z0, pan.z1), trimMat);
    add(box(THREE, headrest.aft, headrest.fore, -headrest.halfWidth, headrest.halfWidth, headrest.z0, headrest.z1), trimMat);
  }
  // The rear cockpit's panel, its back seen over the front seat.
  const rp = REAR_PANEL_FT;
  add(box(THREE, rp.x - rp.depth, rp.x, -rp.halfWidth, rp.halfWidth, rp.z0, rp.z1), trimMat);

  let shownKey = null;
  let shownAt = -Infinity;
  drawPanel(ctx, null);
  texture.needsUpdate = true;

  return {
    group,
    /**
     * The panel's live instruments from the HUD's numbers ({ pitchDeg, bankDeg (right wing down positive), altFt, g,
     * kias, headingDeg }; null shows dashes). Redraws only when what it shows changed, and not within PANEL_REDRAW_MS of
     * the last redraw. Returns true when it redrew.
     */
    update(hud, nowMs = globalThis.performance?.now?.() ?? Date.now()) {
      const key = panelKey(hud);
      if (key === shownKey || nowMs - shownAt < PANEL_REDRAW_MS) return false;
      shownKey = key;
      shownAt = nowMs;
      drawPanel(ctx, hud);
      texture.needsUpdate = true;
      return true;
    },
    dispose() {
      group.removeFromParent();
      for (const g of geometries) g.dispose();
      panelMat.dispose();
      trimMat.dispose();
      texture.dispose();
      canvas.width = canvas.height = 0;
    },
  };
}
