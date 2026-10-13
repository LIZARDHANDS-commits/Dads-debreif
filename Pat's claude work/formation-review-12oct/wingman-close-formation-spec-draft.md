# The close-formation wingman: spec draft (phase B, rungs B1 and B2)

**DRAFT for Patrick, 12 Oct 2026. Not approved.** Once Patrick approves it, it moves into `docs/modules/turn-sim/spec.md` (a new section, "The wingman") with a decision row in `decisions.md`, and this file is deleted. Plan: `docs/modules/turn-sim/plan.md` step 12.4, rungs B1 (echelon, straight and level) and B2 (Lead's telegraphed turns in echelon). One spec covers both because it is the same law; B1 is built and flown first.

## 1. Objective

#2 holds echelon the way a pilot does: eyes on Lead, fingertip pressures, a small correction as soon as he moves off his references, and power added before it is needed when he sees Lead start to turn.

Patrick, 12 Oct 2026:
- "As soon as we move off the references we make small corrections."
- "When we see lead starts to turn, we anticipate what is happening based on what we see and add power BEFORE its needed, ideally only moving 2-3 feet out of position, depending on what happens."
- "A good pilot can stay in almost perfect echelon up to 45 degrees, with small deviations up to 60 or more."
- "In close form the control movements are pressures. you fly with your fingertips almost."

Done means Patrick flies it from the default start and it looks and feels like close formation (AGENTS.md lesson 2).

## 2. The loop, every step

Lead flies (one Lead, TS-225) → **perception**: what #2 sees and feels, about 0.3 s late → **supervisor**: picks the job (B1 and B2: on station only) → **close-formation technique**: the correction on each axis → **command shaper**: pressure-sized, smooth inputs → **#2's aircraft**: the same point mass as Lead → his new position goes back into what he sees.

## 3. Sensors: what #2 knows

| Sense | What he takes from it | Source |
|---|---|---|
| Eyes: his references | Where his references sit against Lead, as three errors from the echelon picture: up or down, in or out, fore or aft | SMM 12.4 paras 11-12, Figs 12.3-12.4; the place in feet, about 45 ft out, 25 ft back, 5 ft down (estimate, spec section 10) |
| Eyes: the picture moving | How fast each error is growing | Patrick 12 Oct 2026 |
| Memory | How long an error has been there, and which way | Patrick 12 Oct 2026 |
| Eyes: Lead's attitude | Lead's bank and nose, and a roll starting: the wing moving against his references | TS-211 |
| Body and hands | The G he feels, where his throttle sits, the pressure in his hand | estimate |
| Not used | His own instruments (eyes stay on Lead), Lead's plan, Lead's speed or power | TS-211 |

Everything he sees reaches his hands about 0.3 s late (TS-211, estimate).

## 4. Inputs: his controls

| Control | What it does | Close-formation size (estimates; today's values in `wing-moves.js` in brackets) |
|---|---|---|
| Pitch pressure | G a little more or less than he sees Lead pulling: up or down | about ±0.3 G, eased in (followG 0.5 G, onset 4 G/s) |
| Roll pressure | Bank a few degrees off Lead's: slides in or out | about ±5° off Lead's (sideBankDeg 15°) |
| Power | Torque a few percent: closes or opens fore and aft | about ±5-10% torque (powerG 0.1, about 2 kt/s) |
| Rudder | Not modelled: the point mass flies balanced | - |
| Speed brakes | Not used in close formation (assumption) | - |

Pressures are small, continuous and smooth, never the full-stick moves of tactical flying (the technique share, C1). The throttle above 5% torque answers in about 0.25 s (TS-218).

## 5. Outputs: what the aircraft does

#2's point mass (Lead's, TS-225: thrust, drag, G, roll, G onset, engine) gives his speed, height, heading, bank and G, and from them his position and how fast it is changing against his place in Lead's wing plane. That is what his eyes read next step. For us it is measured and drawn: the error in feet on each axis, his G, bank and torque against Lead's (the gauge and the plot page).

## 6. How he moves the controls

Patrick, 12 Oct 2026: "My input size would be driven based on how big the error is, how quickly its propogating, and how long its been there (to a lesser degree ... most of the time its mainly how big and how fast its changing). it's not an error, par say, because like i said before, formation is all about seeing lead do something, reacting to it smoothly, and staying 'in position', whatever that position is."

So each input has two parts:
1. **Reacting to Lead (the main part):** what he sees Lead do, matched smoothly: Lead's bank, Lead's pull, and a roll starting, met with power before it is needed. In control terms this is feed-forward: acting on the cause before the deviation appears.
2. **Staying in position:** the deviation from his place, sized mainly by how big it is and how fast it is growing, and to a lesser degree by how long it has been there. In control terms this is feedback, mostly proportional and rate (PD), with a weak integral.

| Axis | Corrected with | What he sees Lead do first |
|---|---|---|
| Up and down | Pitch pressure: G | Lead's wing rising or falling against his references: he starts pitching then catches up (TS-211) |
| In and out | Roll pressure: bank off Lead's | Lead's bank: he matches it |
| Fore and aft | Power | Lead's roll starting: power before it is needed, on when he will be on the outside of the turn, off on the inside |

On each axis the staying-in-position part weighs the deviation (how far off), how fast it is growing, and, less, how long it has been there (a slow trim, held still while a control is at its limit so it doesn't build up and overshoot).

```js
// close-formation.js, each step (a sketch, not final code); seen = what he saw 0.3 s ago
g      = seen.leadG    + kUp.p * dev.up  + kUp.d * rate.up  + trim.up;      // pitch pressure
bank   = seen.leadBank + kIn.p * dev.in  + kIn.d * rate.in;                 // roll pressure
torque = trim.power    + kLead * seen.leadRollDps * outside                 // power before it's needed
                       + kAft.p * dev.aft + kAft.d * rate.aft;
```

The gains come from two pilot numbers per axis: how firm a pressure a 1 ft deviation gets, and how fast he settles back without overshooting. The 0.3 s reaction limits how firm he can be before he starts to chase; the human-pilot models (McRuer's crossover model, AGARDograph 188, 1974) give the realistic range. He corrects from the smallest error he can see (about 0.5 ft, estimate). Each axis settles without overshoot; settle times are estimates to be tuned (up and down, in and out about 2 s; fore and aft about 4 s).

## 7. Success criteria: what Patrick checks, from the default start

1. Straight and level: on his references, within about 1 ft (estimate), with no visible hunting.
2. Lead's telegraphed turns (TS-209) up to 45° of bank, both ways, into and away from #2: almost perfect, 2 to 3 ft out at worst, then back on his references.
3. To 60° and beyond: small deviations, a few feet, back on his references after the roll.
4. Always within TS-80's close-formation band (5 ft and 5 kt).
5. The controls look like pressures: G within a few tenths of Lead's, bank within a few degrees of Lead's, torque moving a few percent.

**Feasibility (back of the envelope, estimates):**
- From the echelon place, about 45 ft out, Lead's 9°/s roll at 45° moves #2's place up or down at about 7 ft/s. Seeing it 0.3 s late costs about 2 ft. At 60° (12°/s) it moves at about 9 ft/s, about 3 ft.
- In the turn, at 200 KIAS and 8,000 ft, he needs about 1.5 kt more on the outside (45°) or about 2 kt (60°), or as much less on the inside: a few percent of torque.
- So 2 to 3 ft is reachable and tight, and it needs the 0.3 s reaction and the power anticipation both.

## 8. Code structure

`src/modules/turn-sim/live/wingman/`:

| File | Job |
|---|---|
| `wingman.js` | Runs the loop each step |
| `perception.js` | What he sees and feels, delayed |
| `supervisor.js` | Picks the job; on station only in B1 and B2 |
| `close-formation.js` | The correction on each axis |
| `shaper.js` | Pressure-sized, smooth inputs |

`fighting-wing.js` joins at B5, from `fw-live.js`. The aircraft is Lead's point mass (`fluid-lead.js` stepLead, TS-225). Numbers go in the tuning sheet (`wing-moves.js`), each with its source or marked as an estimate. Existing maths is used first: `holdInPlane` (`formation-turns.js`) already holds this place with error and rate on Lead's plan; `easeValue`, `softMin` and `softMax` (`src/core/flight-math.js`). Plain JavaScript, a header on each file in the repo's style. Behind a setting: the held poses stay until Patrick has flown the new wingman.

## 9. Commands

- Build check: `npm run build`
- Measure: `node tools/formation-gauge.mjs --only "<press>"`. Never `--save` without restoring the baseline afterwards.
- Plot: the dev page `/tools/flight-plot/`
- Tests: CI on the pull request only (AGENTS.md).

## 10. Testing

One test for the rung (AGENTS.md): echelon straight and level, then one telegraphed 45° turn and roll-out. #2 stays within TS-80's 5 ft of his place and never closer than the collision minimum. It checks what a pilot would recognise, with no tight time gate.

## 11. Boundaries

- **Always:** keep the old pilot behind a setting until Patrick flies the new one; source every number or mark it an estimate; run the gauge before and after.
- **Ask Patrick first:** any change to the aircraft's physics, the echelon place, TS-80's band, or Lead's roll.
- **Never:** feed #2 Lead's plan (TS-211); change the physics to make a test pass; delete the held poses before listing what they do.

## 12. Open questions for Patrick

1. The sensors in section 3: is that what you use? In particular: eyes never inside in close formation, and G and throttle by feel.
2. The size of the pressures (section 4).
3. How much power he leads with, and when (section 6).
4. The speed brakes in close formation.
5. The echelon place in feet (45 out, 25 back, 5 down), against the sight picture you fly.
