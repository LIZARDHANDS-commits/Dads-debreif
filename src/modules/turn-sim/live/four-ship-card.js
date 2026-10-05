// The Formation card's words for the 4-ship: the same card as the 2-ship's, with a line for
// each wingman against the aircraft it flies off, and the roll-out judged the same way, wingman
// by wingman (live/judge.js judge, for a roll-out and for a change of formation alike).
import { relativeTo, MANOEUVRES } from './manoeuvres.js';
import { compassDeg, intoOrAway } from './formation.js';
import { classify } from './judge.js';
import { fourWords } from './slots.js';

const ftText = (n) => `${Math.round(n).toLocaleString('en-CA')} ft`;
const signedFt = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('en-CA')}`;
const bankText = (deg) => (Math.abs(deg) < 0.5 ? 'wings level' : `bank ${Math.round(Math.abs(deg))}° ${deg > 0 ? 'L' : 'R'}`);

/** The card's content (the shape ui.renderCard takes) for the four-ship's state now. */
export function cardForFour(state, wingSide) {
  const byId = new Map(state.aircraft.map((a) => [a.id, a]));
  const lead = state.aircraft[0];
  const c = state.current;
  let flying = `${fourWords(classify(state.aircraft))} on ${String(compassDeg(lead.headingRad)).padStart(3, '0')}, waiting for a button.`;
  if (c) {
    const sided = MANOEUVRES[c.key]?.sided;
    flying = `Flying: ${c.label}${sided ? ` (${intoOrAway(c.dir, wingSide)})` : ''}`;
  }
  // G-warm: the step being flown and the G it calls for (design section 7).
  const step = c?.gWarm?.steps.find((st) => state.tSec >= st.t0 && state.tSec < st.t1) ?? null;

  const j = state.judged;
  let judged = null;
  if (j?.shape === 'formation') {
    judged = { text: `${j.label}: ${j.text}`, tone: j.tone }; // a change of formation, judged link by link
  } else if (j) {
    const words = j.ships.map((s) => {
      const numbers = j.shape === 'trail'
        ? `${ftText(s.gapFt)} in trail, ${ftText(Math.abs(s.offsetFt))} off line`
        : `${ftText(s.acrossFt)} abeam, ${ftText(Math.abs(s.foreAftFt))} ${s.foreAftFt >= 0 ? 'ahead' : 'behind'}`;
      return `${s.name} off ${s.refName} ${s.labels.join(', ')} (${numbers})`;
    });
    const good = j.ships.every((s) => s.labels[0] === 'ON SPACING' || s.labels[0] === 'IN TRAIL');
    judged = { text: `${j.label}: ${words.join('; ')}.${j.gFlown ? ` ${j.gFlown}` : ''}`, tone: good ? 'good' : 'caution' };
  }

  const nowLines = state.aircraft.filter((a) => a.ref != null).map((a) => {
    const ref = byId.get(a.ref);
    const rel = relativeTo(ref, a);
    const across = Math.abs(rel.left);
    const sweepDeg = Math.atan2(-rel.fwd, Math.max(across, 1)) * 180 / Math.PI;
    // Sweep the manual's way: back from the wing line of the aircraft flown off, 0° abeam (SMM 12.29 para 69, Fig 12.19)
    return `${a.name} off ${ref.name}: ${ftText(across)} abeam, sweep ${Math.abs(sweepDeg).toFixed(0)}° ${sweepDeg >= 0 ? 'back from' : 'ahead of'} ${ref.name}'s wing line`;
  });
  nowLines.push(`Heights above Lead: ${state.aircraft.filter((a) => a.ref != null).map((a) => `${a.name} ${signedFt(a.altAboveFt - lead.altAboveFt)}`).join(', ')} ft`);

  if (step) nowLines.unshift(`G-warm step: ${step.label}`);

  return {
    flying,
    note: c?.note ?? null,
    queued: state.queued?.label ?? null,
    nowLines,
    judged,
    ships: state.aircraft.map((a) => ({
      id: a.id,
      name: a.name,
      text: `${Math.round(a.kias)} KIAS, ${String(compassDeg(a.headingRad)).padStart(3, '0')}, ${bankText(a.bankDeg)}, ${a.g.toFixed(1)} G`,
    })),
  };
}
