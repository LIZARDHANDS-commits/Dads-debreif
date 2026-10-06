// A basic HUD for the simulators (Patrick, 6 Oct: "put the HUD in all three, with attitude and altimeter that are live,
// and G"): a round attitude indicator, the altitude, G and indicated airspeed for one aircraft, drawn in a corner of the
// picture on a 2D canvas. Shared by the Formation Sim, Turn Fight and Traffic; each passes its own aircraft's numbers.

/** Its size and look (estimates, tuned by eye). */
export const HUD = Object.freeze({ width: 210, height: 112, margin: 12, radius: 44, pxPerDeg: 1.6, sky: '#3a78c2', ground: '#7a5a34' });

const num = (v, digits = 0) => (Number.isFinite(v) ? v.toLocaleString('en-CA', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—');

/**
 * Draws the HUD at the bottom left of a canvas `size` { width, height } in CSS pixels.
 * hud: { label, pitchDeg (nose up positive), bankDeg (right wing down positive), altFt, g, kias, headingDeg }.
 * Any number left out shows as a dash.
 */
export function drawHud(ctx, size, hud) {
  if (!hud) return;
  const x0 = HUD.margin;
  const y0 = size.height - HUD.margin - HUD.height;
  ctx.save();
  ctx.font = '12px system-ui, sans-serif';
  // The panel.
  ctx.fillStyle = 'rgba(8, 14, 22, 0.72)';
  ctx.strokeStyle = 'rgba(160, 200, 230, 0.6)';
  ctx.lineWidth = 1;
  ctx.fillRect(x0, y0, HUD.width, HUD.height);
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, HUD.width - 1, HUD.height - 1);

  // The attitude indicator: the horizon turns with the bank and moves with the pitch, under a fixed aircraft symbol.
  const cx = x0 + 10 + HUD.radius;
  const cy = y0 + HUD.height / 2;
  const r = HUD.radius;
  const bank = ((Number.isFinite(hud.bankDeg) ? hud.bankDeg : 0) * Math.PI) / 180;
  const pitch = Number.isFinite(hud.pitchDeg) ? hud.pitchDeg : 0;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-bank);
  const shift = pitch * HUD.pxPerDeg; // nose up moves the horizon down
  ctx.fillStyle = HUD.sky;
  ctx.fillRect(-r * 2, -r * 3 + shift, r * 4, r * 3);
  ctx.fillStyle = HUD.ground;
  ctx.fillRect(-r * 2, shift, r * 4, r * 3);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-r * 2, shift);
  ctx.lineTo(r * 2, shift);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.font = '9px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  for (let d = -60; d <= 60; d += 10) {
    if (d === 0) continue;
    const y = shift - d * HUD.pxPerDeg;
    if (Math.abs(y) > r * 1.4) continue;
    const half = d % 20 === 0 ? 16 : 9;
    ctx.beginPath();
    ctx.moveTo(-half, y);
    ctx.lineTo(half, y);
    ctx.stroke();
    if (d % 20 === 0) ctx.fillText(String(Math.abs(d)), half + 3, y + 3);
  }
  ctx.restore();
  // The ring, bank marks every 30° and the fixed aircraft symbol.
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  for (const m of [-60, -30, 0, 30, 60]) {
    const a = ((m - 90) * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6));
    ctx.stroke();
  }
  // The bank pointer: turns with the bank against the fixed marks above.
  const pa = -bank - Math.PI / 2;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(pa) * (r - 7), cy + Math.sin(pa) * (r - 7));
  ctx.lineTo(cx + Math.cos(pa + 0.12) * (r - 15), cy + Math.sin(pa + 0.12) * (r - 15));
  ctx.lineTo(cx + Math.cos(pa - 0.12) * (r - 15), cy + Math.sin(pa - 0.12) * (r - 15));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy);
  ctx.lineTo(cx - 9, cy);
  ctx.lineTo(cx - 4, cy + 5);
  ctx.moveTo(cx + 26, cy);
  ctx.lineTo(cx + 9, cy);
  ctx.lineTo(cx + 4, cy + 5);
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);

  // The numbers.
  const tx = cx + r + 14;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(200, 220, 235, 0.85)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText(hud.label ?? '', tx, y0 + 16);
  const row = (name, value, y) => {
    ctx.fillStyle = 'rgba(200, 220, 235, 0.85)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(name, tx, y);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px ui-monospace, Consolas, monospace';
    ctx.fillText(value, tx + 34, y);
  };
  row('ALT', `${num(hud.altFt)}`, y0 + 38);
  row('G', `${num(hud.g, 1)}`, y0 + 60);
  row('KIAS', `${num(hud.kias)}`, y0 + 82);
  ctx.fillStyle = 'rgba(200, 220, 235, 0.85)';
  ctx.font = '10px system-ui, sans-serif';
  const hdg = Number.isFinite(hud.headingDeg) ? String(Math.round(((hud.headingDeg % 360) + 360) % 360) || 360).padStart(3, '0') : '—';
  ctx.fillText(`HDG ${hdg}°  P ${num(pitch)}°  B ${num(Number.isFinite(hud.bankDeg) ? Math.abs(hud.bankDeg) : NaN)}°`, tx, y0 + 102);
  ctx.restore();
}
