// What the 3D view draws flat over the picture, placed with scene.js
// projectPoint: the altitude ruler, ship labels and markers, heights on the
// sticks, the compass, the caption and the tennis ball. Kept apart from the
// picture itself so the same pieces sit over any renderer whose camera
// matches projectPoint (view.js today; a WebGL view later).
import { SHIP_COLORS, OUTLINED_SHIPS, OUTLINE_COLOR } from '../state.js';
import { projectPoint } from './scene.js';

export const TEXT = '#d9e6f2';
const CAPTION_BOTTOM_PX = 56;
const ALT_SCALE_LEFT_PX = 28; // the altitude ruler stands at the left edge, so it's always in view
export const ft = (n) => Math.round(n).toLocaleString('en-US');

export function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

export function outlined(ctx, text, x, y, color) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export const attitudeText = (s) => {
  const bank = Math.round(Math.abs(s.bankDeg));
  const pitch = Math.round(s.pitchDeg);
  const bankWords = s.bankKnown === false ? 'bank --' : `bank ${bank}°${bank ? (s.bankDeg > 0 ? ' L' : ' R') : ''}`;
  return `${bankWords}, pitch ${pitch > 0 ? '+' : ''}${pitch}°`;
};

// A ship's height above the datum, beside the middle of its stick (#26).
export function drawStickLabel(ctx, air, ground, heightFt, unit) {
  ctx.save();
  ctx.font = '11px system-ui, sans-serif';
  outlined(ctx, `${ft(heightFt)} ${unit}`, (air.x + ground.x) / 2 + 8, (air.y + ground.y) / 2, TEXT);
  ctx.restore();
}

// A ruler of altitude every 1,000 ft beside the formation (V6 drawAltitudeScale).
export function drawAltitudeScale(ctx, P, ctr, ships, datum) {
  const alts = ships.map((s) => s.altFt).filter(Number.isFinite);
  if (!alts.length) return;
  const top = Math.ceil((Math.max(...alts, ctr.z) + 1500) / 1000) * 1000;
  const base = Math.floor(datum / 1000) * 1000;
  // Heights as they stand at the formation's centre, drawn at the left edge.
  // (V6 stood it 42,000 ft west and 36,000 ft north, off the screen at most zooms.)
  const at = (altFt) => ({ x: ALT_SCALE_LEFT_PX, y: P({ x: ctr.x, y: ctr.y, altFt }).y });
  ctx.save();
  ctx.strokeStyle = TEXT;
  ctx.fillStyle = TEXT;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 2;
  ctx.font = '11px system-ui, sans-serif';
  const a = at(base);
  const b = at(top);
  ctx.beginPath();
  ctx.moveTo(a.x, Math.max(a.y, CAPTION_BOTTOM_PX));
  ctx.lineTo(b.x, Math.max(b.y, CAPTION_BOTTOM_PX));
  ctx.stroke();
  for (let alt = base; alt <= top; alt += 1000) {
    const p = at(alt);
    if (p.y < CAPTION_BOTTOM_PX) continue; // clear of the caption
    ctx.beginPath();
    ctx.moveTo(p.x - 6, p.y);
    ctx.lineTo(p.x + 6, p.y);
    ctx.stroke();
    ctx.fillText(`${ft(alt)} ft`, p.x + 10, p.y + 4);
  }
  ctx.restore();
}

// V6's flat marker, or a dot for a ship that isn't moving (no nose to point).
export function drawMarker(ctx, P, s, on) {
  const c = P(s);
  const color = SHIP_COLORS[s.slot];
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = OUTLINED_SHIPS.has(s.slot) ? OUTLINE_COLOR : '#061018';
  ctx.lineWidth = 2.5;
  if (s.hdg === null) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 7, 0, 2 * Math.PI);
  } else {
    const size = on.planeSize3d;
    const f = { x: Math.cos(s.hdg), y: Math.sin(s.hdg) };
    const r = { x: Math.cos(s.hdg + Math.PI / 2), y: Math.sin(s.hdg + Math.PI / 2) };
    const at = (fwd, left) => P({ x: s.x + f.x * fwd + r.x * left, y: s.y + f.y * fwd + r.y * left, altFt: s.altFt });
    polygon(ctx, [at(size, 0), at(0, size * 0.45), at(-size * 0.75, 0), at(0, -size * 0.45)]);
  }
  if (!s.inGap) ctx.fill();
  ctx.stroke();
  labelShip(ctx, c, s, on);
  ctx.restore();
}
export function labelShip(ctx, c, s, on) {
  ctx.font = '600 12px system-ui, sans-serif';
  outlined(ctx, s.estimated ? `#${s.slot} est.` : `#${s.slot}`, c.x + 12, c.y - 14, SHIP_COLORS[s.slot]);
  if (s.estimated) {
    // On a filled gap's best guess (DB-20): the estimated attitude, said to be one.
    if (on.attLabels3d && s.hdg !== null) {
      ctx.font = '10px system-ui, sans-serif';
      outlined(ctx, `est. ${attitudeText(s)}`, c.x + 12, c.y + 2, TEXT);
    }
  } else if (s.inGap) {
    // The position is a guess in a GPS gap, so no bank or pitch (D32).
    ctx.font = '10px system-ui, sans-serif';
    outlined(ctx, 'GPS gap', c.x + 12, c.y + 2, TEXT);
  } else if (on.attLabels3d && s.hdg !== null) {
    ctx.font = '10px system-ui, sans-serif';
    outlined(ctx, attitudeText(s), c.x + 12, c.y + 2, TEXT);
  }
}

// North and east on the ground, in the corner, so they stay put as the view turns (#27).
export function drawCompass(ctx, size, camera) {
  const o = { x: 0, y: 0, z: 0 };
  const flat = { ...camera, altScale: 0, zoom: 1000 };
  const box = { width: 0, height: 0 };
  const origin = projectPoint({ x: 0, y: 0, altFt: 0 }, o, flat, box);
  const dir = (dx, dy) => {
    const p = projectPoint({ x: dx, y: dy, altFt: 0 }, o, flat, box);
    const len = Math.hypot(p.x - origin.x, p.y - origin.y) || 1;
    return [(p.x - origin.x) / len, (p.y - origin.y) / len];
  };
  const cx = size.width - 56;
  const cy = size.height - 56;
  ctx.save();
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.lineWidth = 3;
  /** @type {Array<[string, number[], string]>} */
  const arrows = [['N', dir(0, 1), '#7ee787'], ['E', dir(1, 0), '#58a6ff']];
  for (const [label, [ux, uy], color] of arrows) {
    const tipX = cx + ux * 36;
    const tipY = cy + uy * 36;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.fillText(label, tipX + ux * 8 - 4, tipY + uy * 8 + 4);
  }
  ctx.restore();
}

// What the picture is scaled by, and what the heights are measured from (#26, #27). groundSource: 'tracks' when the tracks gave the
// ground (DB-26), 'field' when it fell back to the field's elevation.
export function drawCaption(ctx, camera, on, datum, groundSource = 'tracks') {
  ctx.save();
  ctx.font = '12px system-ui, sans-serif';
  const scale = Number.isInteger(camera.altScale) ? camera.altScale : camera.altScale.toFixed(2);
  outlined(ctx, `Altitude ×${scale}`, 14, 22, TEXT);
  const from = on.datum3d === 'field' ? 'field elevation' : on.datum3d === 'zero' ? 'sea level' : on.datum3d === 'tracks' ? (groundSource === 'tracks' ? 'from the tracks' : 'field elevation') : 'lowest ship less 500 ft';
  outlined(ctx, `Ground: ${ft(datum)} ft (${from})`, 14, 40, TEXT);
  ctx.restore();
}

// The Cockpit and Chase cameras' caption (DB-21, DB-22): whose seat (or which ship the Chase is behind), that the attitude is an estimate, a GPS gap and whether its path is
// estimated, and what the wind and the altimeter are. words: cockpit.js COCKPIT_CAPTION.
export function drawCockpitCaption(ctx, { slot, seat, chase = false, gap, windKnown }, words) {
  ctx.save();
  ctx.font = '12px system-ui, sans-serif';
  const where = chase ? `Chase: behind #${slot}` : `Cockpit: #${slot} ${seat === 'rear' ? 'rear' : 'front'} seat`;
  outlined(ctx, `${where} · ${words.always}`, 14, 22, TEXT);
  outlined(ctx, `${windKnown ? 'nose into the model wind' : '(no wind)'} · ${words.altitude}`, 14, 40, TEXT);
  if (gap) {
    ctx.font = '600 12px system-ui, sans-serif';
    outlined(ctx, gap === 'filled' ? words.filled : words.gap, 14, 58, '#ffcc66');
  }
  ctx.restore();
}

// The tennis ball in 3D (the same solution as the map, #19): the ball's arc,
// the cone's edges as the same arc turned ±half the cone, the target's path,
// and the closest pass joined to where the target was then.
export function drawTennis3d(ctx, P, sol) {
  const color = sol.status === 'INTERCEPT' ? '#7ee787' : '#ffcc66';
  const line = (points) => {
    ctx.beginPath();
    points.forEach((p, i) => {
      const q = P(p);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.stroke();
  };
  const { shooter } = sol;
  const half = (sol.coneDeg / 2) * (Math.PI / 180);
  const turned = (a) => sol.points.map((p) => {
    const dx = p.x - shooter.x;
    const dy = p.y - shooter.y;
    return { x: shooter.x + dx * Math.cos(a) - dy * Math.sin(a), y: shooter.y + dx * Math.sin(a) + dy * Math.cos(a), altFt: p.altFt };
  });
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 204, 102, 0.55)';
  line(turned(-half));
  line(turned(half));
  ctx.strokeStyle = 'rgba(88, 166, 255, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 5]);
  line(sol.targetPoints);
  ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  line(sol.points);
  if (sol.best.ball) {
    const b = P(sol.best.ball);
    const tp = P(sol.best.target);
    ctx.strokeStyle = sol.status === 'INTERCEPT' ? '#7ee787' : '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(tp.x, tp.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
    ctx.fill();
    outlined(ctx, sol.status, b.x + 9, b.y - 8, color);
  }
  ctx.restore();
}
