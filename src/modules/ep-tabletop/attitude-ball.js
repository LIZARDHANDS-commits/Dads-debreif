// The setup's attitude ball (Any setup, EP-17; Dad, 15 Oct 2026: "i also wanna be able to set aircraft pitch and bank as the instructor", and he
// picked both a mid-flight set and a ball to drag): a small attitude indicator on the console, phone or screen, that the instructor drags
// to set pitch and bank instead of typing them. Up and down sets pitch, left and right sets bank; a double tap levels it. It only writes the
// Pitch and Bank boxes beside it (console-setup.js), which Freeze and "Set attitude here" send as before, so nothing new travels.
//
// A picture only: the horizon moves PX_PER_DEG pixels a degree of pitch and turns with the bank; the yellow aircraft symbol stays put, as on
// the cockpit's own attitude indicator. Sizes and drag rates are picture choices.
import { h } from '../../ui-kit/dom.js';

/** The ball's side (CSS pixels), the horizon's travel a degree of pitch, and the drag rates (degrees a pixel). Picture choices. */
const SIZE_PX = 150;
const PX_PER_DEG = 1.6;
const PITCH_DEG_PER_PX = 0.5;
const BANK_DEG_PER_PX = 0.8;
const SKY = '#3b7fd1';
const GROUND = '#8a5a2b';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Bank kept to -180..180, so a roll past inverted carries on round. */
const wrapBank = (b) => ((((b + 180) % 360) + 360) % 360) - 180;

/**
 * pitchRange and bankRange: the setup's spans (steps.js SETUP_RANGES). onChange({ pitchDeg, bankDeg }) as the ball is dragged (whole
 * degrees). Returns { element, set({ pitchDeg, bankDeg }) } (set draws without calling onChange).
 */
export function createAttitudeBall({ pitchRange, bankRange, onChange }) {
  const canvas = h('canvas', {
    class: 'ep-att-ball', width: String(SIZE_PX * 2), height: String(SIZE_PX * 2), role: 'slider', tabindex: '0',
    'aria-label': 'Attitude: drag up or down for pitch, left or right for bank; arrow keys too; double tap to level',
  });
  canvas.style.width = `${SIZE_PX}px`;
  canvas.style.height = `${SIZE_PX}px`;
  canvas.style.touchAction = 'none';
  let pitch = 0;
  let bank = 0;

  function draw() {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = canvas.width;
    const r = s / 2;
    const k = (s / SIZE_PX) * PX_PER_DEG;
    ctx.save();
    ctx.clearRect(0, 0, s, s);
    ctx.beginPath();
    ctx.arc(r, r, r - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(r, r);
    ctx.rotate((-bank * Math.PI) / 180);
    ctx.translate(0, pitch * k);
    ctx.fillStyle = SKY;
    ctx.fillRect(-s * 2, -s * 4, s * 4, s * 4);
    ctx.fillStyle = GROUND;
    ctx.fillRect(-s * 2, 0, s * 4, s * 4);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.lineTo(s, 0);
    ctx.stroke();
    ctx.font = `${Math.round(s / 16)}px sans-serif`;
    ctx.textBaseline = 'middle';
    for (let d = -90; d <= 90; d += 10) {
      if (d === 0) continue;
      const y = -d * k;
      const w = d % 30 === 0 ? s * 0.22 : s * 0.12;
      ctx.beginPath();
      ctx.moveTo(-w / 2, y);
      ctx.lineTo(w / 2, y);
      ctx.stroke();
      if (d % 30 === 0) ctx.fillText(String(Math.abs(d)), w / 2 + 4, y);
    }
    ctx.restore();
    // The fixed aircraft symbol and the bank pointer.
    ctx.save();
    ctx.translate(r, r);
    ctx.strokeStyle = '#ffd400';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, 0);
    ctx.lineTo(-r * 0.15, 0);
    ctx.lineTo(0, r * 0.1);
    ctx.lineTo(r * 0.15, 0);
    ctx.lineTo(r * 0.5, 0);
    ctx.stroke();
    ctx.rotate((-bank * Math.PI) / 180);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -r + 6);
    ctx.lineTo(-8, -r + 22);
    ctx.lineTo(8, -r + 22);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r, r, r - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  const tell = () => {
    draw();
    canvas.setAttribute('aria-valuetext', `pitch ${pitch}° ${pitch >= 0 ? 'nose up' : 'nose down'}, bank ${Math.abs(bank)}° ${bank >= 0 ? 'right' : 'left'}`);
    onChange?.({ pitchDeg: pitch, bankDeg: bank });
  };
  const setFrom = (p, b) => {
    pitch = Math.round(clamp(p, pitchRange[0], pitchRange[1]));
    bank = Math.round(clamp(wrapBank(b), bankRange[0], bankRange[1]));
  };

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, pitch, bank };
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    setFrom(drag.pitch - (e.clientY - drag.y) * PITCH_DEG_PER_PX, drag.bank + (e.clientX - drag.x) * BANK_DEG_PER_PX);
    tell();
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('dblclick', () => {
    setFrom(0, 0);
    tell();
  });
  canvas.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 5;
    const moves = { ArrowUp: [step, 0], ArrowDown: [-step, 0], ArrowLeft: [0, -step], ArrowRight: [0, step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    setFrom(pitch + m[0], bank + m[1]);
    tell();
  });

  draw();
  return {
    element: canvas,
    set({ pitchDeg, bankDeg }) {
      const p = Number(pitchDeg);
      const b = Number(bankDeg);
      setFrom(Number.isFinite(p) ? p : 0, Number.isFinite(b) ? b : 0);
      draw();
    },
  };
}
