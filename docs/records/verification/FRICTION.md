# Where the friction was, and what to simplify

Verification thread, 30 Sep 2026. This page is drawn from every report in this folder. It records where work kept going wrong or had to be redone, what made checking expensive, and what to do differently from here on.

## Where work went wrong or was redone

**By module**

- **Turn Sim.** The first pass found formation turns that didn't match SMM ch.16: the shackle didn't cross, the hook wasn't 180°, the cross wasn't two-stage, and the delayed 45 turned past 45°. These were fixed in #189. Later rounds found three more kinds of problem:
  - **Controls that didn't match what was flown.** A greyed-out turn still showed as picked while Delayed 90 was flown, "#2's side" and the shackle's Direction did nothing, and the Check turn and Roll-in boxes stayed live.
  - **The wrong standard at the end of a turn.** Every turn end was judged against line-abreast spacing. That flagged a perfect In-place 90, which should end in trail.
  - **A new version only right at its design point.** The check-turn Delayed 45 is only right at 45°, but it is flown at any angle.
- **Turn Fight / Energy.**
  - A slow forced slice dove to about 700 KIAS below the deck.
  - A pitch back above 220 KIAS took up to 390° to reach the max-performance turn.
  - The Mach limit took four PRs (#211, #218, #227, #232): the engine's EAS-like IAS was compared against a compressible-CAS line, so the jet flew Mach 0.69 to 0.70 up high.
- **Traffic.**
  - Pattern geometry numbers were off: a 72.5° plunge on final, the break roll-in height, and 76°/4.2 G in the closed pattern.
  - Aircraft were not sequenced.
  - Removing an aircraft rewrote the others' past, because they shared one set of dice.
  - Chasing exact numbers cost time until the tolerance rule came in.
- **SOF.**
  - The two High safety findings: the lightning-near-home caution vanished when one refresh failed, and lightning was nearly invisible on the satellite map.
  - The banner doubled in height when the report words were marked.
  - Alternates were marked below minima outside any landing window.
- **Debrief.**
  - The default standards read TIGHT 85% of the time (D114).
  - The Lead speed call ignored the wind.
  - GPS spikes showed as real G, because a hole of exactly 5 s wasn't counted as a gap.
  - Menus grew past 1280 px.
- **Weather.** PROB groups and some wording, settled by D72.

**By type of problem** (most common first)

1. **The screen said one thing and the engine did another.** This was mostly Turn Sim controls, plus text that read "below limits" for a period already over.
2. **Values on different bases or units were compared.** EAS against CAS for Mach, ground speed against IAS with no wind, and characters against bytes.
3. **A standard was applied out of context.** Line-abreast spacing was used to judge trail or check-turn finishes, and alternate minima were applied outside the landing window.
4. **Failure and stale states weren't specified.** The spec said "never show clear" but not "keep a live caution", and it didn't say what a stale METAR or an ended TAF should read.
5. **Edge values were off by one.** A 5 s hole counted with ">" instead of "≥", a delay-0 spawn was one step late, and "120 KIAS, below 120" came from rounding.
6. **Tests pinned the bug.** Expected numbers were taken from the code's own output, or from a V6 transcription by the same author. The tests then passed while the behaviour was wrong.
7. **A decision changed a rule but not the spec.** D265 (rewind), D280 (relay setting) and D220/R6 were logged, but the approved spec text was left saying the opposite.
8. **Layout regressions at 1280 px.** Whenever a menu or banner grew, nothing tested the tallest state.

## What made checking expensive

- **Re-checking after every merge.** There were about 30 re-check reports in one day, and many PRs were re-checked two or three times.
- **Insisting on exact matches, plus fuzz, mutation and stress runs.** They found real bugs, but most items they raised were Low.
- **An auditor on every Medium.** It corrected facts or severity in about a third of findings, which was worth it but doubled the cost.
- **No direct live-site access.** Chromium couldn't use the sandbox proxy, so every live check needed a curl mirror. Parallel checkers also collided on ports, and once one stopped the others' servers.
- **Pilot questions that only Dad can answer,** which were parked instead of closed. Examples are the box rear delay, the check-turn cue, the lightning radius, and whether to hold a caution through an outage.
- **The SMM disagrees with itself in places.** For example, the offset box's 10-15 s rear delay doesn't give its 6,000-8,000 ft trail at 220 KTAS.

## What to simplify from here on

1. **Check once per module at the end, and keep it light.** Cover safety items and flight numbers against the manuals, within tolerance (about ±1 kt, ±50 ft, ±1°, ±1%). This is now the project rule.
2. **Every control either changes the flight or is greyed with the reason shown.** Give one small test per control.
3. **Use one airspeed basis.** Always go through core's helpers (`modelMaxIasT6A` for the model, `maxKiasT6A` for display), and never compare across bases.
4. **Write the failure and stale behaviour into the spec for every safety item** before building it, especially what happens to a caution that is already showing.
5. **Take test expectations from the manuals or an independent calculation,** never from the code under test.
6. **When a decision changes an approved rule, amend the spec in the same PR.**
7. **Give each screen one layout test at 1280 px with every menu and banner at its tallest.**
8. **Send pilot questions to `docs/records/dads-questions.md` in one batch** and build on the recommended default meanwhile.

## Final results

- [Debrief final](debrief-final.md): numbers within tolerance. The speed call, GPS glitch and bank items were fixed in #241 and re-checked as passing.
- [SOF final](sof-final.md): pass, with both lightning Highs fixed. SOF's own report is [sof-end-of-module.md](sof-end-of-module.md).
- Turn Sim, Turn Fight and Traffic had not had their end-of-module check at handover. Their latest per-merge reports are in this folder; [index.md](index.md) lists them.
