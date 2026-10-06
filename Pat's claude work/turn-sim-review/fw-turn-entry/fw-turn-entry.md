# Fighting wing turn entry: #2 flies wide when Lead turns away (Fable, 6 Oct 2026 00:50Z)

Patrick, 6 Oct 00:35Z (V2.96 on screen): "#2 is at the back of the cone and Lead turns away. #2 makes their spacing worse by flying well outside the turn circle instead of capturing it quickly by turning into it. They will exceed 1,000 ft." 00:37Z: "look at the SMM pictures of how fighting wing turns work depending on your spacing."

## What the manual says (SMM part 5, PDF pages 23-24: Figs 12.20-12.23, para 69-73; cite only, no text in the repo)

| Case | Turn away | Turn into |
|---|---|---|
| In position (Fig 12.20) | Collapse to Lead's six by promptly aiming toward the inside of the turn circle, geometry for positioning (lead pursuit). This stops the range increasing. | Make the miss (lag pursuit or altitude separation), then reverse and promptly capture the turn circle by matching Lead's turn (pure pursuit). |
| Stretched / aft (Fig 12.21) | Immediately aim well inside the turn circle, then geometry (lead pursuit). Stops the range increasing and starts closure. | Lead turning into you is a chance to correct: delay the turn, slowly collapse to the six (lead pursuit), then capture the circle by matching Lead's turn. |
| Tight / forward (Fig 12.22) | Promptly aim at Lead's tail and capture the circle (pure pursuit); the extra distance flown fixes the closer range. | Make the miss: a climbing turn above Lead or a descending turn below him; the angular cut-off will likely put you outside the circle, then geometry to recapture it. |
| Turn exit (Fig 12.23) | Stretched or range increasing: flow to the inside of the turn (shortest path). Tight or high closure: flow to the outside (longer path). Good range, no closure: pick the side and regain position. | |

Para 69: once Lead manoeuvres, #2 is free to collapse to the six, flow to the other side, use the vertical, adjust power, or any combination; he must use lead, lag and pure pursuit.

## What the code does (V2.96, formation-turns.js planFwMove / planFwTurn, tracker.js)

#2 is the transitions tracker with a goal-seeking phase: a reference point in Lead's frame slides (40 ft/s fore-aft, 60 ft/s sideways) toward a goal, and #2's commanded velocity every step is the reference point's own velocity (Lead's speed plus the turn's omega x r) plus a closing pull toward it, capped by the closure law (30 ft/s near, never more than sqrt(2 x 2 ft/s2 x distance): about 50 ft/s at 670 ft). The goal (fwGoal) is Lead's six on his turn circle at #2's range, but it only starts once Lead's bank passes 32 deg and is full at 42 deg.

Why that flies wide when Lead turns away: with #2 on the outside of the turn, a point fixed in Lead's frame 950 ft back and 500 ft out moves at about 280 kt true along a bigger circle (the 60 deg turn at 200 KIAS has a 2,600 ft radius, so the point is 3,300 ft from the centre). #2 is told to match that point's velocity, which he cannot, with a 50 ft/s sideways nudge toward the six. The law is a station-keeping law ("fly what the slot flies, nudge the error out"), not a pursuit-curve law. The manual wants the opposite: aim well inside the circle at once (lead pursuit) and let geometry close the range.

## Sims (dry runs on V2.96 main f8af61f base, scratch fwback*.mjs; Lead level turn 60 deg at 200 KIAS, #2 placed in the band; all estimates of the code's behaviour, not requirements)

| Start | Lead turns | Max range (ft) and when | Then settles at |
|---|---|---|---|
| Back of the cone, 950 ft at 58 deg | away | **1,245 at 7 s** (out of the band) | ~770 ft, 82 deg (the six) |
| Mid cone, 750 ft at 45 deg | away | **1,039 at 7 s** | ~930 ft |
| Tight, 520 ft at 35 deg | away | 648 at 4 s | ~620 ft |
| Back of the cone, 950 ft | into | 953 (no bulge) | ~900 ft |
| Tight, 520 ft | into | dips to 265 ft at 6 s, then 817 | ~800 ft |

#2 banks up to 78 deg in every case; power stays within 15 kt of Lead. The bulge is geometry, not power.

What I tried inside the tracker (all with the same goal): a faster or instant slide of the reference point (no better, 1,217 to 1,402 ft), the goal moved 300 to 1,000 ft inside the circle (no change at all: the slide and the closure caps swallow it), the closure caps opened right up plus an instant slide (1,080 ft, with #2's bank reversing 70 deg each way). The tracker cannot be tuned into a pursuit curve.

## What to build (Formation thread or the four-ship thread, Opus high thinking; flight code)

A pursuit-curve step law for #2 in fighting wing turns, in place of the goal-seeking tracker phase, with the same dry-run-and-record shape so it stays repeatable:

1. **Aim point** each step: Lead's six on his turn circle at the band's middle range (750 ft; SMM 12.29 para 69, Fig 12.19), as fwGoal has it.
2. **Pursuit** from the range error and which side of the circle #2 is on:
   - stretched (range above the aim, or #2 outside the circle): lead pursuit: heading command toward a point inside the circle, the lead angle growing with the range error (estimate: full lead, aim at the circle's centre side of Lead, at 1,000 ft; none at 750 ft);
   - in band on the inside: pure pursuit on the six point, bank matched to Lead's (his turn rate);
   - tight (range under 600 ft, estimate) or turning into #2 when tight: lag pursuit (aim outside Lead's tail) and the vertical: a climbing turn above Lead or a descending turn below him (Fig 12.22), using the cone's height (TS-96).
3. **Bank** from the heading-rate demand through the envelope gate (gateRoll, TS-93), up to the G rule; **speed** by energy with the cone first, power last (TS-96).
4. **Collapse starts at the press**, from Lead's commanded bank, not from his measured bank passing 32 deg (today #2 waits 1 to 2 s while Lead rolls in).
5. **Turn exit** (Fig 12.23): stretched flows to the inside, tight to the outside, otherwise picks a side; the tracker can keep this part (it works from a near-six start).
6. Same law for the 4-ship fighting wing turn (planFwTurn), each wingman off the one ahead.

What a pilot would recognise, to check at sign-off (no tight numbers): from the back of the cone with Lead turning away, the range never grows past 1,000 ft and #2 ends at the six on the circle; from tight with Lead turning into him, #2 makes the miss high or low, never inside 500 ft, and recaptures.

Decision for Patrick: TS-100 (TS-99 is taken by the four-ship rebuild), "Fighting wing turns fly the SMM pursuit curves (Figs 12.20-12.23): lead pursuit when stretched or turned away from, pure pursuit in position, lag or the vertical when tight or turned into."

Unseen: on screen. Untested: anything beyond the dry runs above.
