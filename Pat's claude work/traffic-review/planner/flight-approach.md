# PFL segment planner: how it flies (draft for Patrick's yes)

Approved by Patrick 10 Oct 2026 ("agreed.") and built in DADS v2.10.123 by the audit thread itself, not an agent (Patrick asked). It is now spec 4.5 item 3 and TR-113; the spec is the master copy. Two words changed in the spec, waiting on Patrick: the zoom is the flight's own zoom law shared by plan and flight (`flyZoomT6A` stays the reference), and landing flap goes rolling into base on a square-off (Patrick 20:06Z). `trace-after-planner.txt` is the after run. The rest of spec 4.5 (items 1-2 and 4-15, his rulings) stays as written and is carried over unchanged unless this page says otherwise.

## The idea in one line

The aircraft plans the whole glide as a chain of pieces, flies each piece as planned, and works out the height it needs by adding up the same pieces it will fly. That gives one height sum on one path (Fable F9, F16).

## The pieces

1. **Zoom or slow-down.** Above 150 KIAS: 2 G pull, push over, capture 125 KIAS, turning toward the join at up to 30° (item 5). At or below 150 KIAS: hold height and slow to 125. Planned and flown by the same code, the core zoom (`flyZoomT6A`), so the plan's apex is the flown apex.
2. **Turn.** A turn of a set size over the ground (the circle, a join turn, a turn onto final), in one direction. The bank is whatever holds that radius over the ground in the wind, up to 60° and the stall line (items 8, 11). The roll-in starts early enough to roll out on the next piece, so no corner is cut.
3. **Straight.** A ground track held wings level, crabbed for wind.
4. **Drag step.** Gear, T/O flap or landing flap at a planned point on the chain, at least 5 s after the step before it (Fable F6).
5. **Round-out and flare.** Below 200 ft lined up: check to 3° to 100 KIAS, hold it, flare to touch down in the first 1,000 ft (item 13, TR-110).

Height lost on each piece comes from the glide drag of the configuration down, at the speed flown, with the turn's G and the wind, in altimeter feet (TR-77). The plan and the aircraft use the same numbers.

## Flying it

- The aircraft flies the piece it is on. A small correction holds it on that piece's line if wind or rounding moves it off. It never steers at a point further ahead.
- **Re-planning happens only:**
  - at High Key, Low Key and Final Key;
  - when the margin is more than 300 ft short;
  - when a drag step is no longer enough, or too much, to land.
  
  A new plan is flown for at least 5 s before it can be given up (plan grace, an estimate).
- The margin is height now minus the chain's height needed, and it shows on the tag as today (item 14).

## When high: widen and square off (Patrick, 10 Oct)

A pattern PFL (the PFL button pressed in the circuit) still more than 100 ft high with all the drag out loses height the way a pilot does:
- **Wide Low Key.** It flies Low Key further out from the runway.
- **Square off the turns.** The rounded turns to Final Key and to the threshold become a straight leg, a turn of about 90°, another straight leg, and a turn of about 90° onto final, sized to burn the spare height.
- **Final Key stays where it is.** Base still passes the normal Final Key spot; it is never extended (TR-48; Patrick's card, 10 Oct 19:46Z).
- **Lands as normal.** It rolls out lined up, wings level, and touches down in the first 1,000 ft.

Area and High Key PFLs don't square off. They still lose extra height before High Key (TR-43).

Today's rounded widen (`widenPath`) is replaced by this.

## What the old flight loop did, and where it goes

Kept as rulings: join search and join rules (item 6), the drag ladder and margin table (item 7), false High Key and the orbit above 6,000 ft (item 9), carrying on the turn onto the runway and the direct (item 10), the gate (item 12), eject rules (items 10, 15), the tag (item 14).

Replaced: the steer-to-the-line follower, the separate in-loop zoom, the old height sum (`neededFt`), the rounded widen, and the unused chain functions written on 7 Oct. Also removed: `pfl-segment-planner.js` and the six `verify-*.mjs` scripts at the repo root.

## How it will be checked

Fable's 30 starts are run before and after, without the screen. A pilot would expect:
- Normal starts land in the first 1,000-2,430 ft (the first third).
- The inner downwind in 269/15 makes the runway (today it lands short).
- Low Key starts on profile stay on the circle.
- A start that can't make it glides on to Low Key, then ejects.

The PR adds one test: the inner downwind start in 269/15 lands on the runway. The PR goes up for Patrick to fly from the default start. Untested until then: everything on screen.

## Build

One Opus agent on one branch. It owns `pfl.js` and the PFL parts of `sim.js` for this job, briefed with AGENTS.md's testing lines. The thread checks its work against git, not its report.
