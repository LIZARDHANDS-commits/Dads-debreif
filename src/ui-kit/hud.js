// A basic HUD for the simulators (Patrick, 6 Oct: "put the HUD in all three, with attitude and altimeter that are live,
// and G"): a round attitude indicator, the altitude, G and indicated airspeed for one aircraft, drawn in a corner of the
// picture on a 2D canvas. Shared by the Formation Sim, Turn Fight and Traffic; each passes its own aircraft's numbers.

/** Its size and look (estimates, tuned by eye). */
export const HUD = Object.freeze({ width: 210, height: 112, margin: 12, radius: 44, pxPerDeg: 1.6, sky: '#3a78c2', ground: '#7a5a34' });

const num = (v, digits = 0) => (Number.isFinite(v) ? v.toLocaleString('en-CA', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—');

/**
 * The round attitude indicator alone, centred on (cx, cy) with radius r (CSS pixels of `ctx`): the horizon turns with the
 * bank and moves with the pitch under a fixed aircraft symbol. pitchDeg nose up positive, bankDeg right wing down
 * positive (a number left out draws as 0). Every size scales with r from the HUD's own (HUD.radius), so the HUD and the
 * CT-156 cockpit's EADI and standby (ct156-cockpit.js) draw the same instrument.
 */
export function drawAttitude(ctx, cx, cy, r, pitchDeg, bankDeg) {
  const k = r / HUD.radius; // 1 for the HUD, so its picture is unchanged
  const bank = ((Number.isFinite(bankDeg) ? bankDeg : 0) * Math.PI) / 180;
  const pitch = Number.isFinite(pitchDeg) ? pitchDeg : 0;
  ctx.save();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-bank);
  const shift = pitch * HUD.pxPerDeg * k; // nose up moves the horizon down
  ctx.fillStyle = HUD.sky;
  ctx.fillRect(-r * 2, -r * 3 + shift, r * 4, r * 3);
  ctx.fillStyle = HUD.ground;
  ctx.fillRect(-r * 2, shift, r * 4, r * 3);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5 * k;
  ctx.beginPath();
  ctx.moveTo(-r * 2, shift);
  ctx.lineTo(r * 2, shift);
  ctx.stroke();
  ctx.lineWidth = 1 * k;
  ctx.font = `${9 * k}px system-ui, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  for (let d = -60; d <= 60; d += 10) {
    if (d === 0) continue;
    const y = shift - d * HUD.pxPerDeg * k;
    if (Math.abs(y) > r * 1.4) continue;
    const half = (d % 20 === 0 ? 16 : 9) * k;
    ctx.beginPath();
    ctx.moveTo(-half, y);
    ctx.lineTo(half, y);
    ctx.stroke();
    if (d % 20 === 0) ctx.fillText(String(Math.abs(d)), half + 3 * k, y + 3 * k);
  }
  ctx.restore();
  // The ring, bank marks every 30° and the fixed aircraft symbol.
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5 * k;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  for (const m of [-60, -30, 0, 30, 60]) {
    const a = ((m - 90) * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(a) * (r - 6 * k), cy + Math.sin(a) * (r - 6 * k));
    ctx.stroke();
  }
  // The bank pointer: turns with the bank against the fixed marks above.
  const pa = -bank - Math.PI / 2;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(pa) * (r - 7 * k), cy + Math.sin(pa) * (r - 7 * k));
  ctx.lineTo(cx + Math.cos(pa + 0.12) * (r - 15 * k), cy + Math.sin(pa + 0.12) * (r - 15 * k));
  ctx.lineTo(cx + Math.cos(pa - 0.12) * (r - 15 * k), cy + Math.sin(pa - 0.12) * (r - 15 * k));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 3 * k;
  ctx.beginPath();
  ctx.moveTo(cx - 26 * k, cy);
  ctx.lineTo(cx - 9 * k, cy);
  ctx.lineTo(cx - 4 * k, cy + 5 * k);
  ctx.moveTo(cx + 26 * k, cy);
  ctx.lineTo(cx + 9 * k, cy);
  ctx.lineTo(cx + 4 * k, cy + 5 * k);
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(cx - 1.5 * k, cy - 1.5 * k, 3 * k, 3 * k);
  ctx.restore();
}

/**
 * Draws the HUD at the bottom left of a canvas `size` { width, height } in CSS pixels.
 * hud: { label, pitchDeg (nose up positive), bankDeg (right wing down positive), altFt, g, kias, headingDeg, rangeFt (optional),
 * torque (optional: { pct, text, red }, or null for an aircraft with no power set),
 * controller (optional: { open, lines }, closed by default beside the TQ row, T29r) }.
 * Any number left out shows as a dash.
 */
export function drawHud(ctx, size, hud) {
  if (!hud) return;
  // A RANGE row (feet to Lead) only when the simulator passes rangeFt (the Formation Sim: Patrick 12 Oct 2026 01:37Z); the
  // panel grows one row for it, and the other simulators' HUD is unchanged.
  const ranged = 'rangeFt' in hud;
  // A TQ row (torque, with a bar from 0 to 100% under it) only when the simulator passes torque (the Formation Sim: Patrick
  // 14 Oct 2026, "so i can see how th power is modulating as it flies"); the panel grows one row for it.
  const torqued = 'torque' in hud;
  const height = HUD.height + (ranged ? 22 : 0) + (torqued ? 26 : 0);
  const x0 = HUD.margin;
  const y0 = size.height - HUD.margin - height;
  ctx.save();
  ctx.font = '12px system-ui, sans-serif';
  // The panel.
  ctx.fillStyle = 'rgba(8, 14, 22, 0.72)';
  ctx.strokeStyle = 'rgba(160, 200, 230, 0.6)';
  ctx.lineWidth = 1;
  ctx.fillRect(x0, y0, HUD.width, height);
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, HUD.width - 1, height - 1);

  // The attitude indicator (drawAttitude, shared with the CT-156 cockpit's panel).
  const cx = x0 + 10 + HUD.radius;
  const cy = y0 + height / 2;
  const r = HUD.radius;
  const pitch = Number.isFinite(hud.pitchDeg) ? hud.pitchDeg : 0;
  drawAttitude(ctx, cx, cy, r, hud.pitchDeg, hud.bankDeg);

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
  if (ranged) row('RANGE', `${num(hud.rangeFt)}`, y0 + 104);
  if (torqued) {
    const ty = y0 + (ranged ? 126 : 104);
    const tq = hud.torque;
    row('TQ', tq ? (/^\d/.test(tq.text) ? `${tq.text}` : tq.text) : '—', ty);
    if (tq?.red) {
      ctx.fillStyle = '#ff6b5b';
      ctx.font = 'bold 15px ui-monospace, Consolas, monospace';
      ctx.fillText(tq.text, tx + 34, ty);
    }
    if (hud.controller) {
      ctx.save();
      ctx.textAlign = 'right';
      ctx.font = 'bold 10px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#7fd1ff';
      ctx.fillText('CTL ▾', x0 + HUD.width - 8, ty);
      ctx.restore();
    }
    // The bar: 0 to 100% across the numbers' width, ticks at 20% steps.
    const bx = tx;
    const bw = x0 + HUD.width - 12 - bx;
    const by = ty + 6;
    ctx.fillStyle = 'rgba(200, 220, 235, 0.18)';
    ctx.fillRect(bx, by, bw, 5);
    if (tq) {
      ctx.fillStyle = tq.red ? '#ff6b5b' : '#7fd1ff';
      ctx.fillRect(bx, by, (bw * tq.pct) / 100, 5);
    }
    ctx.fillStyle = 'rgba(8, 14, 22, 0.9)';
    for (let k = 1; k < 5; k++) ctx.fillRect(bx + (bw * k) / 5, by, 1, 5);
  }
  ctx.fillStyle = 'rgba(200, 220, 235, 0.85)';
  ctx.font = '10px system-ui, sans-serif';
  const hdg = Number.isFinite(hud.headingDeg) ? String(Math.round(((hud.headingDeg % 360) + 360) % 360) || 360).padStart(3, '0') : '—';
  ctx.fillText(`HDG ${hdg}°  P ${num(pitch)}°  B ${num(Number.isFinite(hud.bankDeg) ? Math.abs(hud.bankDeg) : NaN)}°`, tx, y0 + 102 + (ranged ? 22 : 0) + (torqued ? 26 : 0));

  // T29r: the controller drop-down beside the TQ row (closed by default; opens beside the HUD when CTL ▸ is clicked or ticked).
  if (hud.controller?.open && hud.controller.lines?.length) {
    const lines = hud.controller.lines;
    const cw = 304;
    const ch = 12 + lines.length * 16;
    const cx0 = x0 + HUD.width + 6;
    const cy0 = size.height - HUD.margin - ch;
    ctx.fillStyle = 'rgba(8, 14, 22, 0.78)';
    ctx.strokeStyle = 'rgba(160, 200, 230, 0.6)';
    ctx.fillRect(cx0, cy0, cw, ch);
    ctx.strokeRect(cx0 + 0.5, cy0 + 0.5, cw - 1, ch - 1);
    ctx.font = '11px ui-monospace, Consolas, monospace';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = i === 0 ? '#7fd1ff' : '#e6f1f8';
      ctx.fillText(lines[i], cx0 + 8, cy0 + 16 + i * 16);
    }
  }
  ctx.restore();
}
