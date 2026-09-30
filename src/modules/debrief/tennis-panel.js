// The tennis ball's panel in the Formation column (SPEC-debrief: Tennis ball):
// who throws at whom, V6's settings, and the answer in words. Opened from
// Tools and closed again with its own button. The views draw the same
// solution (tennis.js), so the words and the pictures never disagree (#19).
import { h, clear } from '../../ui-kit/dom.js';
import { TENNIS_LIMITS, tennisTone } from './tennis.js';

const SHIPS = [1, 2, 3, 4].map((n) => ({ value: n, label: n === 1 ? '#1 Lead' : `#${n}` }));
const ft = (n) => Math.round(n).toLocaleString('en-US');

/** The answer as lines of text: the status, then the numbers behind it. */
export function tennisLines(sol) {
  if (!sol.points) return { status: sol.status, lines: [sol.message] };
  const bias = sol.pitchBias ? `, bias ${sol.pitchBias > 0 ? '+' : ''}${sol.pitchBias}°` : '';
  return {
    status: sol.status,
    lines: [
      `#${sol.shooterId} at #${sol.targetId}, range ${ft(sol.rangeNow)} ft`,
      `Line of sight ${sol.losAngle.toFixed(1)}° off the nose; cone ±${(sol.coneDeg / 2).toFixed(1)}°`,
      `Closest pass ${ft(sol.best.dist)} ft after ${sol.best.t.toFixed(2)} s (hit within ${ft(sol.hitRadiusFt)} ft)`,
      `Ball ${ft(sol.ballKt)} kt; pitch ${sol.pitchDeg.toFixed(1)}° (${sol.pitchSource}${bias})`,
    ],
  };
}

/** controls: the debrief's createControls. layout: its remembered settings. Returns { element, render(solution) }. */
export function createTennisPanel({ controls, layout }) {
  const status = h('p', { class: 'tennis-status', role: 'status' });
  const details = h('ul', { class: 'tennis-lines' });
  const { ballKt, pitchBiasDeg, coneDeg, tofSec, hitRadiusFt } = TENNIS_LIMITS;
  const element = h(
    'section',
    { class: 'tennis-panel', 'aria-labelledby': 'debrief-tennis-title', hidden: true },
    h(
      'div',
      { class: 'tennis-head' },
      h('h2', { id: 'debrief-tennis-title' }, 'Tennis ball'),
      h('button', { type: 'button', class: 'button', 'aria-label': 'Close tennis ball', onclick: () => layout.update({ tennisOpen: false }) }, 'Close'),
    ),
    status,
    details,
    h(
      'div',
      { class: 'tennis-controls' },
      controls.select('tennisShooter', { label: 'Shooter', options: SHIPS }),
      controls.select('tennisTarget', { label: 'Target', options: SHIPS }),
      controls.number('tennisBallKt', { label: 'Ball speed', unit: 'kt', ...ballKt }),
      controls.number('tennisPitchBias', { label: 'Pitch bias', unit: '°', ...pitchBiasDeg }),
      controls.number('tennisConeDeg', { label: 'Cone width', unit: '°', ...coneDeg }),
      controls.number('tennisTofSec', { label: 'Time of flight', unit: 's', ...tofSec }),
      controls.number('tennisRadiusFt', { label: 'Hit radius', unit: 'ft', ...hitRadiusFt }),
      controls.checkbox('tennisGravity', { label: 'Gravity drop' }),
    ),
  );

  let last = '';
  return {
    element,
    /** Shows a solution from tennisAt, or null with no flight. */
    render(sol) {
      const { status: word, lines } = sol ? tennisLines(sol) : { status: '', lines: ['Load a flight to throw a tennis ball.'] };
      const key = `${word}|${lines.join('|')}`;
      if (key === last) return;
      last = key;
      status.textContent = word;
      status.className = `tennis-status tone-${sol ? tennisTone(sol.status) : 'none'}`;
      clear(details);
      for (const line of lines) details.append(h('li', {}, line));
    },
  };
}
