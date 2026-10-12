# 4-ship live fighting wing: handover (12 Oct 2026, 14:50Z)

For a fresh Formation thread. Read `AGENTS.md`, then `docs/modules/turn-sim/` (decisions TS-182, TS-204, TS-205, TS-206).

## Where things are

- Main is V2.407 (80e8e1b). Turn Sim unit tests: 137 pass, 2 fail. Both come from one cause, below.
- The work branch is `claude/formation-architecture-review-a291b8`, with main merged in. It is not merged to main. It holds three commits on the 4-ship live law (Settings > Fluid settings > "#2 in fighting wing" Live):
  - #3 flies off #2 and #4 off #3, all sensing Lead's turn;
  - while the one ahead manoeuvres hard (more than 25° of bank or 1 G off Lead's), the one behind flies off his place on Lead instead, easing over in 1 s and back in 2 s;
  - every wingman keeps out of 500 ft of every other aircraft, by lag and by height;
  - a wingman may end a turn on either side.
- Patrick's card on the TS-207 wording (merge the steadier 4-ship turns) is still unanswered. Do not merge the branch before his yes.

## Patrick's asks behind it (12 Oct)

- 10:26Z "fix the transitions and the bumps".
- 10:38Z: every plane uses lead, lag and pure pursuit to respect the bubble. #3 may "fly off 1" while #2 manoeuvres.
- 10:41Z: if #2 is turned into, he turns in to Lead to reverse into the turn circle. #3 keeps his spacing from #2.
- 10:54Z: each wingman goes to whichever side the spacing and geometry need, and may switch. They can also stack vertically to deconflict.

## Open problems (measured on the branch after merging V2.407)

Probe: `fw4live.mjs`, from Lead in fighting wing.

- **Level turn right**, the turn into #2:
  - #2 crosses to the other side;
  - #3 overshoots to 670 ft ahead of #2;
  - rolls pass 100° of bank;
  - #3 and #4 bleed to 158-170 KIAS.
- **Reversal after it:** #4 starts 30 kt slow and 1,300 ft back, then stretches to 2,409 ft before he catches up.
- **Level turn left** is close to right: links 522-1,311 ft, 4.5 G.
- **Turns are not smooth yet:** the side switching and the off-Lead blend together give the chaotic picture above.
- Saved trials that lost #3 or #4 (do not retry as-is):
  - `fw4-miss-rule-only-ahead.patch`
  - `fw4-stack-at-press.patch`
  - `fw4-ghost-off-lead.patch`

## Main's 2 failing tests: line abreast to fighting wing turning rejoin

Since V2.392's 4.5 G cap, #2 enters the cone at its far edge and swings to about 31° off Lead's tail. He then drifts to 28° while he lines up, which is outside the SMM 30-60° (SMM 12.29 para 69). The fighting wing check turn that starts from there ends at 1,127 ft.

Patrick's card has three options:
- hold where he settles (recommended);
- turn in earlier;
- 5 G for the cone turn.

A first "hold where he settles" trial is on branch `claude/fw-rejoin-settle-mid-cone`: it ends 28.9° off the tail. The drift starts before lining up, while Lead is still rolling out, so that trial is not finished. Do not settle him mid-cone: that goes against Patrick's 5 Oct 08:58Z "the whole cone", and it doubled the rejoin time.

## Probes and notes

Project files, `formation-architecture-review/`:
- probes are in `probes/`;
- private manual notes are in `fw4-manual-notes.md` (page refs only, never for the repo).

Two failed fixes on one item means stop and ask Patrick.
