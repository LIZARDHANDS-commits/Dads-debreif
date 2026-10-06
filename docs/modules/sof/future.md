# SOF: future ideas

Ideas for the SOF that are not being built. An idea moves into `plan.md` only with Patrick's yes (TQ-1), and a new idea goes on this list the same day it is asked for. "Feature Ideas" numbers are from the researched list of 54 ideas, kept at https://claude.ai/artifact/6PMvFiKigB29hBvVSoJ2op (`pf/reset/2-inventory/agents/sources/feature-ideas.md:10`). "FF" numbers are from the old plan's future-features list (`archive/docs/records/future-ideas.md:5`). Idea 8, crosswind per runway, is not listed below because it is now in the plan (SOF-R27, `plan.md` Step 3); its other half, a limits matrix by activity, is the open question SOF-Q14 in `plan.md` Step 4.

## Decided for the future list by Patrick (4 Oct)

- Large text for a desk screen across the room, the NATO colour chart, and the "Runway view" and "Lightning map" links: left out of the essentials-now list (`pf/reset/1-requirements/questions.md:65`).
- Live traffic on our own map through a small relay (a Cloudflare worker, code already in `relay/`): the ADS-B Exchange switch stays; the relay layer waits for an account Patrick owns; it was queued as PPQ-12 (`pf/reset/1-requirements/questions.md:72`, `archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:56`, `archive/HANDOVER.md:112`).
- NOTAMs on the SOF's detail pages: they need the relay too, so they wait (`pf/reset/1-requirements/questions.md:79`).
- A beep when a new caution appears (`pf/reset/1-requirements/questions.md:67`).
- Wind checks (SOF-R27, decision SOF-37): crosswind per runway (amber over 15 kt dry, 10 wet, 5 icy; red over 25 kt dry), a 30 kt wind or gust warning and a 35 kt cease-flying caution, each an editable setting with its page reference. Moved here by Patrick on 4 Oct 09:22Z; it was on the plan from his SOF-Q15 answer (00:56Z). Also Feature Ideas item 8.
- A favoured runway with headwind and crosswind on the NATO colour hover card (V6-A had it). It needs the same runway data as the crosswind check (SOF-Q12, 4 Oct 09:09Z).
- The 12-hour all-day soak run (PPQ-13): deferred; it breaks the "no heavy runs" rule (`archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:57`, `pf/reset/1-requirements/scope-and-ideas.md:68`).
- Keep the radar and lightning pictures all day so a later debrief can use them (old FF37). It needs somewhere to store them and has not been proposed to Patrick yet; it would also remove the 3-hour weather limit in the Debrief's DB-R18 (`archive/docs/records/future-ideas.md:11`, `pf/reset/2-inventory/agents/sources/plan-doc-future-features.md:40`).
- SIGMETs, PIREPs and the Prairies forecast chart on the SOF, through the same relay (old FF26) (`archive/docs/records/future-ideas.md:10`).

## Asked by Dad (6 Oct)

- **Live aircraft plotted on our own map** from ADS-B sites. This is the relay layer above (SOF-R17, SOF-7); it still waits on whose account runs the relay. V6 used Dad's own Netlify function for this (`v6/sof.html:727`), so that account is one option to put to Patrick.
- **A 3D SOF picture, like the pattern sim:** Moose Jaw's airspace drawn in 3D, with clouds, fronts, storms, radar and winds, and live aircraft in it. Clouds are built from reported and forecast bases and tops and the low, medium and high layers. Long-term goal; not proposed to Patrick yet. It needs new outside data sources, so it waits for his yes.

## Feature Ideas for the SOF

- **Sun and moon panel, sun in the eyes**: sunrise, sunset and twilight cutoffs, moon and last-land cues; the Debrief's sun-in-the-eyes half goes with it (Feature Ideas idea 9; value high, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:11`)
- **Wave timeline with forecast colours**: forecast ceiling, visibility, wind and storm risk painted onto the 24-hour wave timeline (Feature Ideas idea 34; value high, effort medium; `pf/reset/2-inventory/agents/sources/feature-ideas.md:36`)
- **Lightning rings and stop-work timers**: 5, 10 and 30 NM rings on the lightning layer with stop-work and all-clear countdowns; it relates to the lightning question SOF-Q7 (`pf/reset/1-requirements/questions.md:70`) (Feature Ideas idea 35; value high, effort medium; `pf/reset/2-inventory/agents/sources/feature-ideas.md:37`)
- **Audio and spoken alerts**: a chime or spoken alert when a limit colour changes, lightning comes close, a SPECI arrives, a wave launches or a feed goes stale; the beep above is the first step (Feature Ideas idea 36; value high, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:38`)
- **Density altitude**: density and pressure altitude from the METAR, with a high-density-altitude flag (Feature Ideas idea 37; value medium, effort small; flight math, so it needs a check first; `pf/reset/2-inventory/agents/sources/feature-ideas.md:39`)
- **Recall and divert aid**: for each alternate: category now and forecast, crosswind, distance, bearing and fuel, with the best divert highlighted and a recall timer (Feature Ideas idea 38; value high, effort large; flight math, so it needs a check first; `pf/reset/2-inventory/agents/sources/feature-ideas.md:40`)
- **Aircraft status board and ops log**: tails with status and a time-stamped log for shift handover (Feature Ideas idea 39; value medium, effort medium; `pf/reset/2-inventory/agents/sources/feature-ideas.md:41`)
- **Bird condition (BASH)**: low, moderate or severe bird condition set by the SOF and logged (Feature Ideas idea 40; value medium, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:42`)
- **Freezing level and storm risk strip**: hourly freezing level and storm-risk strip under the timeline (Feature Ideas idea 41; value medium, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:43`)
- **Heat stress and cold exposure**: heat stress flags in summer and wind chill in winter (Feature Ideas idea 42; value medium, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:44`)
- **Space weather and GPS risk badge**: a badge when GPS or HF could be degraded (Feature Ideas idea 43; value low, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:45`)
- **Desk, night and second-monitor modes**: a full-screen desk layout, a night red mode, a high-contrast mode, and any panel in its own window for a second monitor; the old spec had Large text but it was not built (`pf/reset/1-requirements/scope-and-ideas.md:84`) (Feature Ideas idea 44; value medium, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:46`)
- **NOTAMs, PIREPs, GFA and SIGMETs**: NOTAMs, nearby PIREPs, the forecast chart and SIGMETs; runway condition from NOTAMs or typed by hand; it is the same relay idea as FF26 above (Feature Ideas idea 45; value high, effort medium; waits on the relay decision; `pf/reset/2-inventory/agents/sources/feature-ideas.md:47`)

## Other ideas from the old lists

- Per-activity weather limits from the Gen Book (low level, formation, chase, advanced formation, a wx check flight) as optional checks: the question is SOF-Q14, in `plan.md` Step 4 (`pf/reset/1-requirements/questions.md:77`).
- Take-off minima and "to file" minima (Gen Book p.7); alternate rules when no forecast exists, radar-only or GNSS-only destination triggers, and flights over 3 hours (`pf/reset/1-requirements/scope-and-ideas.md:87`, `pf/reset/1-requirements/scope-and-ideas.md:88`).
- A real "SOF attention" badge on the home card, only if Patrick wants it; V6's was fake and always flashing (`pf/reset/1-requirements/scope-and-ideas.md:89`).
- An information-only lightning line at 50 NM (NFM Sec VII p. 7-4); moving the VNC chart layer into the screen kit; further map extras (`archive/docs/records/future-ideas.md:13`).
