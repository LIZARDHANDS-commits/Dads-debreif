// The playback bar under the map, bound to flight-data's clock (#24): Play or
// Pause, Reset, step ±1 s, speed, a scrubber in 1 s steps across the whole
// flight (#23), and the time in Zulu and local in the order chosen in
// Settings (R10, D18). With no flight loaded, every control is disabled.
import { h } from '../../ui-kit/dom.js';
import { SPEEDS } from '../../flight-data/clock.js';

const speedLabel = (x) => `${x}×`;

/** time: app.time. Returns { element, setClock(clock | null), sync() }. */
export function createPlaybackBar({ time }) {
  let clock = null;

  const play = h('button', { type: 'button', class: 'button primary playback-play', 'aria-label': 'Play', onclick: () => (clock.playing ? clock.pause() : clock.play()) }, '▶');
  const reset = h('button', { type: 'button', class: 'button', onclick: () => clock.reset() }, 'Reset');
  const back = h('button', { type: 'button', class: 'button', 'aria-label': 'Back 1 second', onclick: () => clock.step(-1) }, '−1 s');
  const ahead = h('button', { type: 'button', class: 'button', 'aria-label': 'Ahead 1 second', onclick: () => clock.step(1) }, '+1 s');
  const speed = h(
    'select',
    { 'aria-label': 'Playback speed', onchange: () => clock.setSpeed(Number(speed.value)) },
    SPEEDS.map((x) => h('option', { value: String(x) }, speedLabel(x))),
  );
  const scrubber = h('input', {
    type: 'range',
    class: 'playback-scrubber',
    'aria-label': 'Flight time',
    min: '0',
    max: '1',
    step: '1',
    value: '0',
    oninput: () => clock.seek(Number(scrubber.value)),
  });
  // Report ticks under the scrubber (a METAR or SPECI each), drawn by the browser from a list.
  const ticks = h('datalist', { id: 'debrief-report-ticks' });
  const first = h('span', { class: 'playback-time' });
  const second = h('span', { class: 'playback-time-second' });
  const times = h('p', { class: 'playback-times', 'aria-live': 'off' }, first, ' ', second);

  const element = h(
    'div',
    { class: 'playback', role: 'group', 'aria-label': 'Playback' },
    play, back, ahead, speed, scrubber, ticks, times, reset,
  );

  function sync() {
    const on = Boolean(clock);
    for (const el of [play, reset, back, ahead, speed, scrubber]) el.disabled = !on;
    if (!on) {
      play.textContent = '▶';
      play.setAttribute('aria-label', 'Play');
      first.textContent = '--:--:--Z';
      second.textContent = '';
      scrubber.value = '0';
      return;
    }
    play.textContent = clock.playing ? '❚❚' : '▶';
    play.setAttribute('aria-label', clock.playing ? 'Pause' : 'Play');
    speed.value = String(clock.speed);
    const whole = String(Math.floor(clock.t));
    if (scrubber.value !== whole) scrubber.value = whole;
    const [a, b] = time.ordered(new Date(Math.floor(clock.t) * 1000));
    if (first.textContent !== a) first.textContent = a;
    if (second.textContent !== b) second.textContent = b;
    scrubber.setAttribute('aria-valuetext', a);
  }

  sync();

  return {
    element,
    setClock(next) {
      clock = next;
      if (clock) {
        scrubber.min = String(Math.floor(clock.startT)); // the scrubber shows whole seconds, floor(t)
        scrubber.max = String(Math.floor(clock.endT));
      }
      sync();
    },
    sync,
    /**
     * Marks these times on the scrubber, each { t (seconds since 1970), label }; none clears
     * them. The label is the option's text ("SPECI 14:32Z"), for sight and for a screen reader.
     */
    setTicks(marks) {
      const key = marks.map((m) => `${Math.floor(m.t)}=${m.label ?? ''}`).join(',');
      if (ticks.dataset.key === key) return;
      ticks.dataset.key = key;
      ticks.replaceChildren(...marks.map((m) => h('option', { value: String(Math.floor(m.t)), label: m.label ?? '' })));
      if (marks.length) scrubber.setAttribute('list', ticks.id);
      else scrubber.removeAttribute('list');
    },
  };
}
