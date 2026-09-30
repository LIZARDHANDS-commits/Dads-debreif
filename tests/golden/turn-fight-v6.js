// Runs V6's own Turn Fight script (`<script id="bfmFight">`, lines 4232 to 4294
// of original/shell.html) in Node, unchanged, against a stand-in page, so the
// golden tests can read its fight state after each step (R9, D10).
//
// The only addition is one line before the script's final `})();` that hands
// out its private state: `globalThis.__bfm={get S(){return S},get t(){return t},
// step,reset,M,ao}`. The getters matter: `S` is replaced on every reset, so a
// copied value would go stale.
import { v6Page } from './v6-source.js';

const MARKER = '<script id="bfmFight">';

/** V6's Turn Fight script text, exactly as it is in original/shell.html. */
export function v6TurnFightScript() {
  const src = v6Page();
  const from = src.indexOf(MARKER);
  if (from < 0) throw new Error('bfmFight script not found in original/shell.html');
  const body = src.slice(from + MARKER.length, src.indexOf('</script>', from));
  const end = body.lastIndexOf('})();');
  if (end < 0) throw new Error('bfmFight script does not end with })();');
  return body.slice(0, end) + 'globalThis.__bfm={get S(){return S},get t(){return t},step,reset,M,ao};' + body.slice(end);
}

/** A 2D context that draws nothing: any method is a no-op, any property can be set. */
function noContext() {
  const noop = () => {};
  return new Proxy({}, { get: (target, key) => (key in target ? target[key] : noop), set: (target, key, value) => { target[key] = value; return true; } });
}

function element(props = {}) {
  const ctx = noContext();
  return { value: '', checked: false, textContent: '', innerHTML: '', clientWidth: 800, clientHeight: 600, width: 800, height: 600, onclick: null, addEventListener() {}, getContext: () => ctx, ...props };
}

/** V6's own defaults for the Turn Fight boxes (line 778). */
const V6_INPUTS = { bfmType: 'two', bfmVertical: 'off', bfmPitch1: '0', bfmPitch2: '0', bfmVertScale: '2', bfmSep: '2', bfmRate: '1', bfmV1: '220', bfmG1: '4', bfmV2: '220', bfmG2: '4' };

/**
 * One running copy of V6's Turn Fight, set up as a student would set it with
 * the boxes on V6's screen:
 *   { circles: 1 | 2, separationNm, blueKt, redKt, blueG, redG,
 *     chase, vertical, bluePitchDeg, redPitchDeg }   (all optional, V6's defaults)
 * Returns V6's own `step`, `reset`, `M` and `ao`, its live `S` and `t`, and the
 * text it writes on the page (`time`, `phase`, `perf`, `live`).
 */
export function createV6Fight(setup = {}) {
  const inputs = { ...V6_INPUTS };
  const put = (id, value) => { if (value !== undefined) inputs[id] = String(value); };
  put('bfmType', setup.circles === undefined ? undefined : setup.circles === 1 ? 'one' : 'two');
  put('bfmVertical', setup.vertical === undefined ? undefined : setup.vertical ? 'on' : 'off');
  put('bfmSep', setup.separationNm);
  put('bfmV1', setup.blueKt); put('bfmV2', setup.redKt);
  put('bfmG1', setup.blueG); put('bfmG2', setup.redG);
  put('bfmPitch1', setup.bluePitchDeg); put('bfmPitch2', setup.redPitchDeg);

  const elements = { bfmCanvas: element() };
  for (const [id, value] of Object.entries(inputs)) elements[id] = element({ value });
  elements.bfmFirstNoseFollow = element({ checked: !!setup.chase });
  for (const id of ['bfmTime', 'bfmPhase', 'bfmPerf', 'bfmLive', 'bfmPlay', 'bfmPause', 'bfmReset']) elements[id] = element();

  const document = { readyState: 'complete', getElementById: (id) => elements[id] ?? null, addEventListener() {} };
  const window = { addEventListener() {} };
  // requestAnimationFrame and setTimeout do nothing: the tests drive `step` themselves.
  new Function('document', 'window', 'requestAnimationFrame', 'setTimeout', 'devicePixelRatio', v6TurnFightScript())(
    document, window, () => 0, () => 0, 1,
  );
  const api = globalThis.__bfm;
  delete globalThis.__bfm;
  if (!api) throw new Error('V6 Turn Fight script returned nothing; did it stop at `if(!c)return`?');

  return {
    get S() { return api.S; },
    get t() { return api.t; },
    step: api.step,
    reset: api.reset,
    M: api.M,
    ao: api.ao,
    /** The text V6 wrote to its four readout elements at the last step or reset. */
    text: {
      get time() { return elements.bfmTime.textContent; },
      get phase() { return elements.bfmPhase.textContent; },
      get perf() { return elements.bfmPerf.innerHTML; },
      get live() { return elements.bfmLive.innerHTML; },
    },
  };
}
