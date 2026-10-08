// What the SOF map paints on its canvas, bottom to top (SPEC-sof, "Map"): a picture laid on the
// ground, the rings, the airfield dots with their wind barbs, and the traffic symbols. Each function
// paints one thing in CSS pixels and decides nothing: where things are and what they say comes from
// map-view.js and map-model.js. `project(lat, lon)` gives [x, y] in CSS pixels.
//
// Nothing is drawn by colour alone: dots carry their category in the label, the military mark is a
// ring, a ground aircraft is hollow, an old report is hollow.
import { imageStrips, FT_PER_NM } from './map-view.js';
import { windBarb } from './map-model.js';
import { trailAlpha, TRAIL_WINDOW_S } from './traffic-motion.js';

const FONT = '600 12px system-ui, sans-serif';
const HALO_WIDTH = 3;

/** Text with a dark outline so it reads on satellite, radar and chart alike. */
function label(ctx, text, x, y, palette, align = 'left') {
  ctx.textAlign = align;
  ctx.lineWidth = HALO_WIDTH;
  ctx.strokeStyle = palette.halo;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = palette.text;
  ctx.fillText(text, x, y);
}

/**
 * A picture over a box of latitude and longitude at `alpha`. The picture is web mercator, so it goes
 * on in strips whose latitudes follow the picture's own rows (map-view.js imageStrips), which keeps it
 * on the ground whatever the map's projection. `image` is a bitmap or canvas.
 */
export function drawGeoImage(ctx, image, bbox, project, alpha = 1) {
  const [west, , east] = bbox;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const strip of imageStrips(bbox, image.height)) {
    const [x1, y1] = project(strip.north, west);
    const [x2, y2] = project(strip.south, east);
    if (alpha < 1) {
      // See-through, an overlap would be drawn twice and show as a bright seam (L1). Neighbours share an edge, so rounding it to a
      // whole pixel makes them meet exactly: no overlap, and no half-covered row for a gap.
      const top = Math.round(Math.min(y1, y2));
      const bottom = Math.round(Math.max(y1, y2));
      if (bottom > top) ctx.drawImage(image, 0, strip.sy, image.width, strip.sh, Math.min(x1, x2), top, Math.abs(x2 - x1), bottom - top);
    } else {
      // A pixel of overlap hides the seams between strips.
      ctx.drawImage(image, 0, strip.sy, image.width, strip.sh, Math.min(x1, x2), Math.min(y1, y2) - 0.5, Math.abs(x2 - x1), Math.abs(y2 - y1) + 1);
    }
  }
  ctx.restore();
}

/**
 * Circles round home at each of `radii` (NM), labelled, and the lightning radius as a dotted circle in
 * its own colour. `centre` is home in pixels; `scale` is pixels per foot.
 */
export function drawRings(ctx, centre, scale, { radii, lightningNm = null }, palette) {
  const [cx, cy] = centre;
  ctx.save();
  ctx.font = FONT;
  ctx.textBaseline = 'bottom';
  const circle = (nm, dash, colour, text) => {
    const r = nm * FT_PER_NM * scale;
    if (r < 4) return;
    ctx.beginPath();
    ctx.setLineDash(dash);
    ctx.strokeStyle = palette.halo;
    ctx.lineWidth = 3;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, text, cx, cy - r - 2, palette, 'center');
  };
  for (const nm of radii) circle(nm, [8, 6], palette.ring, `${nm} NM${lightningNm === nm ? ' · lightning' : ''}`);
  if (lightningNm !== null && !radii.includes(lightningNm)) circle(lightningNm, [2, 5], palette.caution, `Lightning ${lightningNm} NM`);
  ctx.restore();
}

const BARB_LENGTH = 30;
const BARB_SPACING = 5;
const BARB_FEATHER = 10;

/**
 * A wind barb at a dot: the staff points into the wind (`dirDeg`, where it blows from), with the barbs
 * on the clockwise side at the far end, and calm is an extra ring. `barb` is map-model.js windBarb.
 */
export function drawWindBarb(ctx, x, y, dirDeg, barb, palette) {
  if (!barb) return;
  ctx.save();
  ctx.strokeStyle = palette.text;
  ctx.fillStyle = palette.text;
  ctx.lineWidth = 1.5;
  if (barb.calm) {
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.translate(x, y);
  ctx.rotate(((dirDeg - 90) * Math.PI) / 180); // the staff along +x once rotated; 0 degrees (north) is up
  // A dark under-stroke, so it reads over any picture.
  const path = new Path2D();
  path.moveTo(9, 0);
  path.lineTo(BARB_LENGTH, 0);
  let at = BARB_LENGTH;
  const pennants = new Path2D();
  for (let i = 0; i < barb.pennants; i++) {
    pennants.moveTo(at, 0);
    pennants.lineTo(at, BARB_FEATHER * 0.9);
    pennants.lineTo(at - BARB_SPACING * 1.4, 0);
    pennants.closePath();
    at -= BARB_SPACING * 1.6;
  }
  for (let i = 0; i < barb.full; i++) {
    path.moveTo(at, 0);
    path.lineTo(at + 3, BARB_FEATHER);
    at -= BARB_SPACING;
  }
  if (barb.half) {
    // A lone half barb sits one step in from the end so it is not read as a full one
    if (barb.full === 0 && barb.pennants === 0) at -= BARB_SPACING;
    path.moveTo(at, 0);
    path.lineTo(at + 1.5, BARB_FEATHER / 2);
  }
  ctx.lineWidth = 4;
  ctx.strokeStyle = palette.halo;
  ctx.stroke(path);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = palette.text;
  ctx.stroke(path);
  ctx.fill(pennants);
  ctx.restore();
}

/**
 * The airfield dots with their labels and wind barbs. `marks` are map-model.js airfieldMarks; the dot's
 * colour is its category's (palette.vfr and so on), hollow when the report is old or missing, larger for home.
 * Returns the dots' screen places for hover: [{ x, y, mark }].
 */
export function drawAirfields(ctx, marks, project, palette, { width, height }) {
  const hits = [];
  ctx.save();
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  for (const mark of marks) {
    const [x, y] = project(mark.lat, mark.lon);
    if (x < -40 || y < -40 || x > width + 40 || y > height + 40) continue;
    const colour = palette[(mark.category ?? '').toLowerCase()] ?? palette.none;
    const w = mark.wind;
    const barb = w ? windBarb(w.speedKt) : null;
    if (barb?.calm) drawWindBarb(ctx, x, y, 0, barb, palette);
    else if (barb && !w.variable && Number.isFinite(w.dirDeg)) drawWindBarb(ctx, x, y, w.dirDeg, barb, palette);
    const r = mark.home ? 7 : 5.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = palette.halo;
    ctx.stroke();
    if (mark.category && !mark.old) {
      ctx.fillStyle = colour;
      ctx.fill();
    } else {
      ctx.fillStyle = palette.halo;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = colour;
      ctx.stroke();
    }
    if (mark.home) {
      ctx.beginPath();
      ctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = palette.text;
      ctx.stroke();
    }
    label(ctx, mark.label, x + r + 6, y - (mark.home ? 12 : 10), palette);
    hits.push({ x, y, mark });
  }
  ctx.restore();
  return hits;
}

/**
 * The traffic labels a size smaller (Dad, 8 Oct 2026: "Can the traffic tags be a lil smaller"): 9 px, was 11 px (about 18 % smaller); a T-6's (TEX2) 10 px
 * (about 9 %), so it stays easy to read. Estimates for readability.
 */
const TRAFFIC_FONT = Object.freeze({ other: '9px system-ui, sans-serif', t6: '600 10px system-ui, sans-serif' });
/** A helicopter's symbol (Dad, 8 Oct 2026: "Helo traffic is a helo"): a rotor disc ring this many pixels in radius round a small body and tail boom. Estimates for the look. */
const HELI_ROTOR_PX = 7.5;

/** The path of a helicopter seen from above, nose up the screen (the caller turns it by track): a small cabin and, with `tail`, a tail boom and tail rotor. */
function helicopterBody(ctx, tail) {
  ctx.beginPath();
  ctx.ellipse(0, -1, 2.8, 4.2, 0, 0, Math.PI * 2);
  if (tail) {
    // Drawn the same way round as the cabin (clockwise on the screen), so where the two overlap the fill stays solid.
    ctx.moveTo(0.9, 2.5);
    ctx.lineTo(0.9, 9);
    ctx.lineTo(3, 9);
    ctx.lineTo(3, 10.6);
    ctx.lineTo(-3, 10.6);
    ctx.lineTo(-3, 9);
    ctx.lineTo(-0.9, 9);
    ctx.lineTo(-0.9, 2.5);
    ctx.closePath();
  }
}

/**
 * The traffic symbols from traffic.js's view: an arrow rotated by track (a dot when there is no track),
 * hollow on the ground, ringed when military, faded by age, with the label the layer options ask for.
 * A helicopter (`a.helicopter`, helicopters.js) is a rotor disc ring round a small body with its tail boom along the track (no tail with no track).
 * Returns the symbols' screen places for hover: [{ x, y, aircraft }].
 */
export function drawTraffic(ctx, aircraft, project, palette, { width, height }, selectedHex = null) {
  const hits = [];
  ctx.save();
  ctx.textBaseline = 'middle';
  for (const a of aircraft) {
    const [x, y] = project(a.lat, a.lon);
    if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue;
    ctx.globalAlpha = a.opacity;
    ctx.save();
    ctx.translate(x, y);
    const colour = a.mil ? palette.military : palette.traffic;
    if (a.helicopter) {
      // The rotor disc: a thin ring with a dark halo, so it reads on any picture.
      ctx.beginPath();
      ctx.arc(0, 0, HELI_ROTOR_PX, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = palette.halo;
      ctx.stroke();
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = colour;
      ctx.stroke();
      if (a.hasTrack) ctx.rotate((a.rotationDeg * Math.PI) / 180);
      helicopterBody(ctx, a.hasTrack);
    } else if (a.hasTrack) {
      ctx.rotate((a.rotationDeg * Math.PI) / 180);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5, 6);
      ctx.closePath();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = palette.halo;
    ctx.stroke();
    if (a.onGround) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colour;
      ctx.stroke();
    } else {
      ctx.fillStyle = colour;
      ctx.fill();
    }
    ctx.restore();
    if (a.mil) {
      ctx.beginPath();
      ctx.arc(x, y, a.helicopter ? HELI_ROTOR_PX + 3.5 : 10, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colour;
      ctx.stroke();
    }
    if (a.hex === selectedHex) {
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = palette.text;
      ctx.stroke();
    }
    if (a.label) {
      ctx.font = a.type === 'TEX2' ? TRAFFIC_FONT.t6 : TRAFFIC_FONT.other;
      label(ctx, a.label, x + (a.helicopter ? HELI_ROTOR_PX + 3 : 10), y, { ...palette, halo: palette.halo });
    }
    ctx.globalAlpha = 1;
    hits.push({ x, y, aircraft: a });
  }
  ctx.restore();
  return hits;
}

/** A trail's alpha is drawn in this many steps, so each kind of trail is a few strokes however many aircraft there are. */
const TRAIL_STEPS = 6;
/** The T-6's trail (the highlight colour, a little thicker), the others' (muted) and an intruder's (amber, with the same thickness as a T-6's). */
const TRAIL_WIDTH = Object.freeze({ t6: 2.5, intruder: 2.5, other: 1.5 });

/**
 * The fading trails under the aircraft (Dad, 7 Oct): for each aircraft in `aircraft` (traffic.js's, with their glided `lat` and `lon`) that has
 * positions in `trails` (traffic-motion.js `createTrails`), a line through the last TRAIL_WINDOW_S seconds of reported positions to the aircraft
 * itself, solid at the aircraft and clear at the end of the window (and as faded as the aircraft is when its report is old). `intruders` is a Map
 * keyed by hex (the airspace log's aircraft that are not T-6s inside a watched area), `nowMs` the clock. A T-6 (type TEX2) uses `palette.traffic`
 * (the layer's highlight colour), an intruder `palette.military` (amber), the rest `palette.none` (muted). Returns how many trails were drawn.
 */
export function drawTrails(ctx, aircraft, trails, project, palette, { width, height }, nowMs, intruders = new Map()) {
  const strokes = new Map(); // `${kind}|${step}` -> { colour, widthPx, path }
  let drawn = 0;
  for (const a of aircraft) {
    const history = trails.get(a.hex).filter((p) => nowMs - p.t <= TRAIL_WINDOW_S * 1000);
    if (!history.length) continue;
    const kind = intruders.has(a.hex) ? 'intruder' : a.type === 'TEX2' ? 't6' : 'other';
    const colour = kind === 'intruder' ? palette.military : kind === 't6' ? palette.traffic : palette.none;
    const pts = [...history.map((p) => ({ xy: project(p.lat, p.lon), t: p.t })), { xy: project(a.lat, a.lon), t: nowMs }];
    if (pts.every(({ xy: [x, y] }) => x < -20 || y < -20 || x > width + 20 || y > height + 20)) continue; // all of it off the screen
    for (let i = 1; i < pts.length; i++) {
      const alpha = trailAlpha((pts[i - 1].t + pts[i].t) / 2, nowMs) * a.opacity;
      const step = Math.min(TRAIL_STEPS - 1, Math.floor(alpha * TRAIL_STEPS));
      if (alpha <= 0.01) continue;
      const key = `${kind}|${step}`;
      let stroke = strokes.get(key);
      if (!stroke) strokes.set(key, (stroke = { colour, widthPx: TRAIL_WIDTH[kind], alpha: (step + 1) / TRAIL_STEPS, path: new Path2D() }));
      stroke.path.moveTo(pts[i - 1].xy[0], pts[i - 1].xy[1]);
      stroke.path.lineTo(pts[i].xy[0], pts[i].xy[1]);
    }
    drawn += 1;
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const { colour, widthPx, alpha, path } of strokes.values()) {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = widthPx;
    ctx.strokeStyle = colour;
    ctx.stroke(path);
  }
  ctx.restore();
  return drawn;
}
