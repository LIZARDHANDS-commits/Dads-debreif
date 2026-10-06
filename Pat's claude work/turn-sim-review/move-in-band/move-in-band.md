# Move #2 anywhere in the band: code and wiring for refactor PR 3 (Fable, 6 Oct 2026 00:05Z)

Patrick's ask (5 Oct 23:54Z): when #2 is in position, show his position relative to Lead and let Patrick move it (climb in the cone, left or right, forward or back, out to 6,000 ft in line abreast) to the edge of the band or the envelope; the sim treats that as a move, #2 flies there, and every move after plans from there and only has to end "in position", anywhere in the band. 23:56Z: the control sits on the left of the screen with the other formation-position options, dynamic to the formation commanded. Approved for PR 3 (Patrick 23:55Z "write it, then pass it to Opus to incorporate into PR 3").

Formation thread (Opus) folds this in. One writer per file: these are drop-in pieces, not a commit.

## What is here

- `move-in-band.js`: the planner, a drop-in for `src/modules/turn-sim/live/move-in-band.js`. Dry-run on main V2.93's code (`dry-run.mjs`, output in `dry-run-output.txt`): fighting wing up to the cone's top (+200 ft), out to the 30° edge, back 200 ft, forward to the 500 ft edge, down to −200; line abreast out to 6,000, up 2,000, back 300, in to 4,000; echelon and route out to the 5 ft edge: every tap flown to within a foot of its spot and judged IN POSITION. No flight physics touched: one tracker phase at the close-in closure (hand-over.js onClosure), Lead straight.
- The wiring below: chooser.js (one candidate, like the lag roll), formation.js (three guard lines), transitions-panel.js (the Position group), index.js (one press route).

## Rules it keeps

- The band is the judge's and only the judge's (judge.js, TS-80): `inBandAt` builds a wingman at the spot and asks `judge`. No second copy of the numbers. Clamping finds the last in-band spot along the tap by bisection (`clampToBand`), a foot inside the edge, and reports `atEdge` for the panel's "at the band's edge" word.
- Past the band is allowed only when #2 is already outside it (the control then just moves where asked and the judge says what it is): a flag, never a wall.
- "In position" after the move is anywhere in the band, which TS-80's judge already gives; the next move plans from where he is (TS-94 "from here"). Nothing to add there.
- Numbers (all estimates, for the hand): `MOVE_STEP_FT` per formation (fighting wing 50 ft a tap; line abreast 100 forward, 250 out, 200 up; close 5 ft); `MOVE_ALT_RATE_FTPS` 1,000 ft/min for a height-only nudge. Close-formation up/down is left out: 5 ft is under the tracker's minimum height change (TRACKER.height.minChangeFt), so the panel hides Up/Down in echelon, route and line astern.

## Wiring

### chooser.js (one candidate, like the lag roll, TS-94)

```js
import { planMoveInBand, MOVE_IN_BAND_KEY } from './move-in-band.js';
/** #2 moving inside the band of the formation he is in (move-in-band.js): a control of its own, the only candidate when pressed. */
const MOVE_IN_BAND = Object.freeze({ name: 'move in the band', plan: (pair, _to, options, t0) => planMoveInBand(pair, options.target, options, t0), rejoin: null, fallback: false });
// in chooseChange:
const nudge = to === MOVE_IN_BAND_KEY;
const longMove = !lag && !nudge && rangeToSlotFt(pair, to, options) > HAND_OVER_FT;
const planners = lag ? [LAG_ROLL] : nudge ? [MOVE_IN_BAND] : ...;
// candidateOf's `to`: the formation the plan is in, so the lane is measured against its slot:
candidates.push(candidateOf(p.name, r, lag ? 'fw' : nudge ? r.to : to, spacingFt, t0, wing.id, p.fallback && longMove));
// offStandard: `options.errors && !lag && !nudge`.
```

### formation.js

`change(MOVE_IN_BAND_KEY, { target })` goes through startChange as any change (plan.to is the formation, so `state.current.change.to` reads the formation and the judge, tags and card read it). Three guards treat it like the lag roll, because it starts in band and must not be ended or re-planned on that account:

```js
import { MOVE_IN_BAND_KEY } from './move-in-band.js';
const ownMove = (c) => c.key === `change:${LAG_ROLL_KEY}` || c.key === `change:${MOVE_IN_BAND_KEY}`;
// replanAtEvents, turnMidChange, inBandAndSteady: replace `c.key === \`change:${LAG_ROLL_KEY}\`` with `ownMove(c)`.
```

A tap while a nudge is still flying: `change` queues it (the later press replaces the queued one), as today. Smart wingman (PR 3): a nudge is not an error, so no errors line on the card (`offStandard` stays null, above).

### transitions-panel.js: the Position group

Under the Side switch, in the pair's grid, shown only when `where.key` is one of `MOVE_IN_BAND_FORMATIONS`, the pair is 2-ship, fluid is not running, and either nothing is flying or the move being flown is this one (so taps accumulate). Dynamic to the formation: the step sizes and which rows show come from `MOVE_STEP_FT[where.key]` (Up/Down hidden in the close formations).

```js
import { MOVE_IN_BAND_KEY, MOVE_IN_BAND_FORMATIONS, MOVE_STEP_FT, placeNow, clampToBand } from './live/move-in-band.js';
// state kept by the panel: target (Lead's frame), the formation key it belongs to; reset when where.key changes.
const rows = [
  { axis: 'fwd', minus: 'Aft', plus: 'Fore' },
  { axis: 'out', minus: 'In', plus: 'Out' },
  { axis: 'up', minus: 'Down', plus: 'Up' },
];
// readout line: "#2: 513 ft, 38°, 58 ft below" from judge's numbers (fwState for fw, judgeLink for the others), plus "at the band's edge" when the last tap clamped.
function tap(state, where, axis, sign) {
  const [lead, wing] = state.aircraft;
  const from = target ?? placeNow(lead, wing);
  const step = MOVE_STEP_FT[where.key][axis] * sign;
  const want = { ...from };
  if (axis === 'fwd') want.fwd += step;
  else if (axis === 'out') want.left += Math.sign(from.left || where.side || -1) * step; // out = away from Lead on #2's side
  else want.alt += step;
  const c = clampToBand(lead, wing, where.key, where.side, from, want, state.spacingFt);
  target = c.place; atEdge = c.atEdge;
  handlers.change(MOVE_IN_BAND_KEY, { target }); // the same onChange as the formation buttons
}
```

### Tap and hold (Patrick 6 Oct 00:04Z: "tap and hold to move")

A tap moves one step. Holding a button keeps him moving: on pointerdown take one step at once, then every `HOLD_REPEAT_MS` (250 ms, an estimate for the hand) take another from the latest target; on pointerup, pointerleave or pointercancel stop. Each repeat calls `handlers.change(MOVE_IN_BAND_KEY, { target })` as a tap does; for the 2-ship `formation.change` while a change is flying re-plans at once from where #2 is (startChange's `mid`, TS-76), not queued, so the moving target is followed smoothly (the tracker starts each re-plan from #2's actual bank and speed). When `clampToBand` reports `atEdge` and the place no longer moves, the repeat stops and the readout says "at the band's edge"; a new press in another direction starts again. Keyboard: the buttons stay focusable, Enter or Space = one step.

Words: group title "Position", buttons "Aft / Fore", "In / Out", "Down / Up" (Patrick's words, 6 Oct 00:04Z); hint under it "Moves #2 inside the band; the next move starts from there." A tap that clamps shows "at the band's edge" beside the readout for a few seconds. In line abreast, Out stops at 6,000 ft (the SMM band's far edge, TS-80), In at 4,000.

### index.js

`pressChange(to, options)` already routes `MOVE_IN_BAND_KEY` through `formation.change`; nothing new beyond the panel's `onChange` call. The card's "Now:" line reads the plan's `flying` ("Fighting wing right: #2 moving in the band").

## Decision row (TS-9x, wording for Patrick before it is written)

**#2 can be moved anywhere in the band** (V2.9x, refactor PR 3). Patrick 5 Oct 23:54Z: "when an aircraft is 'in the slot' its current 'position relative to lead' is on the screen, and I can move that position around ... to the edge of the envelope ... the simulator treats that as a move, the wingman moves to that position, and then it flies from there ... the 'in position' doesn't have to be 'exactly where it started'". The Position group (left panel, with the formation controls, dynamic to the formation) nudges #2 fore or aft, out or in, up or down; a tap is one step and holding keeps him moving, each step a move the tracker flies, Lead straight, re-planned at once from where he is; he stops at the band's edge (the judge's band, TS-80) and the panel says so; the next move plans from where he is (TS-94). Step sizes and the 1,000 ft/min height rate are estimates.

## Unseen

The panel itself (I cannot run the screen here); the planner is dry-run only, not flown in the app.
