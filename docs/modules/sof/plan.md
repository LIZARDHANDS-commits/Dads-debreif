# SOF: plan

How to read this plan: steps are in the order to do them. Only what is in a step gets built; new ideas go to `future.md`. A line marked "Patrick decides" waits for his yes (his answer TQ-1: `pf/reset/4-decisions/answers.md:12`). The last step is the sign-off. Requirement numbers such as SOF-R12 are in `requirements.md`; how each is checked is in `testing.md`.

## Where it stands

1. The SOF weather screen is built and live, but Patrick's answers on 4 Oct re-open it: it is rebuilt to one desk screen with buttons for more detail, so the sign-off checklist runs after the rebuild, not before (`pf/reset/1-requirements/questions.md:64`, `pf/reset/1-requirements/questions.md:76`).
2. The built screen does not yet do what two ratified lines say: the "extras" the old task list ticks as done are not in the code, and an alternate with unfilled approaches can still read "meets" instead of amber "Incomplete" (`pf/reset/1-requirements/requirements.md:117`, `archive/tasks/sof/todo.md:63`).
3. Two old task boxes (the live-traffic relay and the 12-hour soak run) were deferred to Phase 2; they are on the future list, not in this plan (`archive/tasks/sof/todo.md:55`, `archive/tasks/sof/todo.md:68`).

## Step 1. Refresh spec.md against the new requirements

- [ ] Refresh `spec.md` against the new requirements when work resumes, rewriting every "same answer V6 gives" or "pinned to V6" line: the "Times pinned before they move" rule that runs V6's own wave-time code (`archive/specs/SPEC-sof.md:316`), and the test lines in the weather-parser spec that name the archived V6 files (`archive/specs/SPEC-wx.md:172`). Patrick's answer: flight and weather math is checked against the manuals and the reports, never V6 (`pf/reset/1-requirements/questions.md:31`).
- [ ] Rewrite the spec lines the ratified answers replaced: the default-screen table of "five extras behind checkboxes" (`pf/reset/4-decisions/partb-sof.md:25`), the Blitzortung "link only" wording (`pf/reset/4-decisions/partb-sof.md:22`), and the spec lines that say the app never carries approach data (see the Shared plan).
- [ ] Add the "not for flight planning" line and "the chip always carries its reason" to `requirements.md` as the register says (moved from `archive/tasks/sof/plan.md` and `archive/specs/SPEC-sof.md`) (`pf/reset/2-inventory/file-register.md:121`).
- [ ] Move the relay README (`relay/README.md`) into this module's spec, or keep it next to the code; the relay itself is on the future list (`pf/reset/2-inventory/agents/agent-3-specs-plans.md:99`).
- [ ] Move `docs/modules/sof/csp-hosts.md` here as a reference (the hosts SOF and Debrief call), with a pointer from the Shared plan (`pf/reset/2-inventory/agents/agent-2-records.md:39`).

## Step 2. Rebuild to one desk screen, with the everyday extras

- [ ] Rebuild the default SOF as one desk screen, laid out as decision SOF-38 (timeline across the top with the waves in its header; Dad approved the mock-up 6 Oct): bar, caution banner, waves, cards, map and timeline reachable without hunting, nothing overlapping at 1280 wide and larger, and a banner with many cautions does not push the screen out of reach (SOF-R19; Patrick's answer SOF-Q1: one screen with buttons for more detail, such as full weather briefs per area) (`pf/reset/1-requirements/requirements.md:163`, `pf/reset/1-requirements/questions.md:64`). The old screen is 2,198 px tall with no data and 3,286 px with five cautions at 1366 × 768.
- [ ] Build the extras that the task list ticked but the code lacks: world clocks (Zulu and local), a radar loop of the last hour, tapping a card centres the map on that airfield, and "Other airfields" and "About this screen" behind buttons (SOF-R26; Patrick: essentials now) (`pf/reset/1-requirements/requirements.md:164`, `archive/tasks/sof/todo.md:63`).
- [ ] Fix map labels piling up at the default zoom (SOF-R14, SOF-R28); keep the extra map layers (VNC chart bases, GOES satellite cloud, Environment Canada warnings, training routes, radar-coverage hatching), each off by default except radar coverage (SOF-Q11, keep all) (`pf/reset/1-requirements/requirements.md:154`, `pf/reset/1-requirements/questions.md:74`).
- [ ] Keep the ADS-B Exchange switch; the relay layer on our own map is on the future list (SOF-Q9) (`pf/reset/1-requirements/requirements.md:156`).

## Step 2b. 3D view of the weather (SOF-39)

Dad and Patrick agreed it on 7 Oct. Each phase is its own pull request and is usable on its own. The spec is "3D view" in `spec.md`.

- [x] **Phase 1, the scene** (built 7 Oct): a **3D** button in the map controls swaps the map area for a 3D view and back, as the ADS-B Exchange view does. In it: the satellite ground round home (the map's own tiles), home and the alternates as coloured pins with their ICAO and category, the 25 and 50 NM rings, each airfield's METAR cloud layers as flat decks at their reported bases, the latest radar and lightning pictures laid on the ground, and an orbit camera (drag to turn, wheel to zoom, Home to reset). Heights are exaggerated ×5 by default (a setting, 1 to 20), and the view says so.
- [x] **Phase 2, model clouds and winds** (built 7 Oct; clouds redrawn as smooth layers the same night): a grid of points over the area from Open-Meteo's GEM model: cloud cover at each pressure level with its height, so clouds get real bases and tops and the low, mid and high layers show; winds at 850, 700 and 500 hPa as barbs at their heights; the freezing level as a faint sheet. A time slider follows the timeline (now by default, up to 24 h ahead).
- [x] **Phase 3, airspace** (built 7 Oct, V2.174, SOF-41): the DAH airspace round Moose Jaw (MTCA, control zones, Regina and Saskatoon control area extensions, CYR303, CYA304 to 316) as see-through volumes, and the TACNAV routes at 500 ft AGL.
- [x] **Phase 4, live aircraft (built 7 Oct, V2.173):** the traffic relay's aircraft at their altitude with callsign tags, any T-6 (TEX2) as the CT-156 model drawn large, on the relay running on Dad's Netlify account (SOF-40). The 2D traffic layer comes on at the same time, when its address goes into SOF settings.

### Step 2b, more asked by Dad on 7 Oct

- [x] **Full screen, auto orbit, airspace log:** a Full screen button on the 3D view; an Orbit toggle that slowly circles the field; a log of which aircraft are in which airspace, flagging any aircraft other than a T-6 (TEX2) in CYA304, CYA305 or CYA307 (information only, not a SOF caution).
- [x] **Airports modelled like the pattern sim:** CYMJ, CYQR, CYYN and CYXE with their runways at true position and heading, numbers and markings, from a sourced runway list (waits on runway data: OurAirports, public domain, or the CFS page). The Traffic module's Moose Jaw model is not reused unless Patrick agrees to move it to shared code (modules never import each other, and Traffic belongs to other sessions).
- [x] **Map gets most of the screen (Dad, 7 Oct; built V2.176, SOF-44):** the timeline becomes a thin strip along the bottom, about 4–5 % of the window height, that can be hidden and scrolls through the airfields like a TV-guide listing (waves and now line kept; an Expand button opens the full timeline over the screen), the airfield cards a narrow column about 10 % of the width (ICAO, category and a limits mark in words; selecting one opens its full card over the screen), and the map takes the rest. Changes SOF-38's proportions, so SOF-38 is updated with it.
- [x] **Smoother live traffic (Dad, 7 Oct):** ask the relay every 5 s instead of 10 s (the relay keeps each answer 5 s; about 7,200 Netlify calls in a 10-hour day, estimate), glide each aircraft along its track and ground speed between answers, and a fading trail behind each aircraft (about the last 2 minutes, estimate) in 2D and 3D.
- [ ] **NOTAMs under each airfield's weather (Dad, 7 Oct):** current NOTAMs for home and each alternate in the airfield's card under its weather, the important ones (runway or aerodrome closures, approach aids out of service) in red and large at the top, the rest in plain text. Source to settle (NAV CANADA's flight weather site, through the Netlify relay if a page can't read it directly). A safety item: when the NOTAMs can't be fetched or are old, it says "NOTAMs unavailable" with the time of the last good fetch, never "no NOTAMs".
- [ ] **Bigger, sharper 3D ground (Dad, 7 Oct):** a higher-resolution satellite picture (sharp near home, coarser further out) and the 3D area grown by 100 NM each way so no empty corners show while orbiting.
- [ ] **Full screen holds the whole SOF picture (Dad, 7 Oct):** full screen includes the narrow airfield column and the bottom timeline strip with the map (2D or 3D); hovering an airfield row shows its whole card, NOTAMs included.
- [ ] **Winds as a gentle flow (Dad, 7 Oct):** the wind barbs are too prominent; show winds aloft as faint moving streaks drifting with the wind at each level, like Windy's animation, with the barbs smaller and behind a toggle (off by default). Streaks move only while the 3D view is shown, and step instead of moving under reduced motion.
- [ ] **Weather fidelity:** finer model clouds (more pressure levels and a denser grid); radar as 3D precipitation shafts up to the model cloud tops (estimate); lightning as strikes in 3D; fronts once a free data source is found (research first).

- [ ] **SIGMETs, AIRMETs and PIREPs (Dad, 7 Oct, item 1):** from NAV CANADA through the relay, as see-through volumes and points at their heights in 3D, and listed in the airfield cards.
- [ ] **T-6 area board (item 2):** every airborne TEX2 with callsign, the area it is in, altitude and time airborne; flags a T-6 that leaves the areas or drops out of the feed.
- [ ] **Lightning rings and stop-work timers (item 3):** 5, 10 and 30 NM rings round home, stop-work and all-clear countdowns from the last strike (was Feature Ideas idea 35 on the future list).
- [ ] **Show me the wave (item 4):** a wave chip sets the 3D model time to that wave's launch and recovery.
- [ ] **Recall and divert aid with fuel required (item 5):** for each airborne T-6, distance, bearing, time and fuel required to home and each alternate, with each alternate's category, best divert highlighted. Flight math, so it is checked first; the fuel numbers wait on Patrick (CT-156 performance charts are controlled and never shipped, so the planning burn and reserve need his ruling).
- [ ] **Crosswind per runway (item 6):** headwind and crosswind on each runway from the METAR wind and the true runway headings (OurAirports), with the SOF-R27 amber and red levels as editable settings. Patrick agreed (Dad, 7 Oct), which brings SOF-R27 back from the future list (SOF-37 changes with it).
- [ ] **Sun and moon panel (item 9):** sunrise, sunset, civil twilight, last-land cue, moonrise, moonset and moon phase and illumination for home, from standard astronomical formulas.
- Not wanted: recording the day for the Debrief (item 7). Not chosen: spoken alerts (item 8).

## Step 3. Build the safety and limits gaps between decided and built

- [ ] Amber "Incomplete" for any airfield whose approaches or landing minima are not filled in, never a green tick, including a PROB group below the alternate limits with minima unset (old decision D388, new decision SOF-32; SOF-R12). The code does not do it yet (`pf/reset/4-decisions/partb-sof.md:74`, `pf/reset/1-requirements/requirements.md:144`, `src/wx/alternates.js:163`).
- [ ] Ship the usual alternates (CYQR, CYYN, CYXE) with their approaches and published landing minima filled in and a "checked on" date, and let the SOF mark an approach out of service by NOTAM for the day (SOF-R12; Patrick's answer SOF-Q3, 4 Oct 00:48Z) (`pf/reset/1-requirements/questions.md:66`). This changes the airfield data in the Shared parts and reverses two lines of the airfields spec; the spec rewrite is in the Shared plan.
- [ ] A decoded line beside each raw METAR and TAF, for example "270/12G20, 2SM, 800 ft" (SOF-R4; SOF-Q4) (`pf/reset/1-requirements/requirements.md:131`).
- [x] Wind: Patrick moved every wind check (SOF-R27: crosswind per runway and the 30 and 35 kt field checks) and the favoured-runway hover card to the future list on 4 Oct 09:22Z (SOF-37; SOF-Q4, SOF-Q12). The SOF shows the wind but flags nothing for now. The beep is on the future list too (see `future.md`).
- [ ] When each requirement above is built, the check marked "New" in `testing.md` is written with it and fails until then (SOF-R4, R12, R14, R19, R26) (`pf/reset/1-requirements/requirements.md:131`, `pf/reset/1-requirements/requirements.md:144`).

## Step 4. Settle the open questions when the work resumes

- [ ] SOF-Q10: settings are in two places (the SOF's own menu and the app Settings dialog); should they be one? (`pf/reset/1-requirements/questions.md:73`)
- [ ] SOF-Q14: should the SOF check any of the Gen Book's weather limits by activity (low level, formation, chase, advanced formation, a wx check flight)? (`pf/reset/1-requirements/questions.md:77`)
- [x] Answered by Patrick on 4 Oct, in place of Dad (decisions SOF-33 to SOF-37): Questions for Dad, kept in `../../questions-for-dad.md`: SOF-Q5 (manual "alternate required" switch, quiet acknowledged cautions), SOF-Q6 (the alternate check window), SOF-Q7 (lightning caution, 20 NM radius), SOF-Q8 (how old is too old), SOF-Q12 (favoured runway on the NATO hover card) (`pf/reset/1-requirements/questions.md:68`, `pf/reset/1-requirements/questions.md:69`, `pf/reset/1-requirements/questions.md:70`, `pf/reset/1-requirements/questions.md:71`, `pf/reset/1-requirements/questions.md:75`).
- [ ] The alternate trigger (local MTCA 2000/3 default, cross-country 3000/3 option) is a settled number from the Gen Book p.7; confirm it with a current SOF when the checklist is run (`archive/docs/handover/sof.md:16`).

## Step 5. Sign-off

- [ ] Check two old findings during the sign-off run, since the later final check did not say they were fixed: an alternate's TAF marked "below limits" for forecast times no wave lists (M2), and a visual-descent alternate whose TAF is marked against the descent minima while its METAR is not (L2) (`archive/docs/records/verification/sof-recheck-228.md:54`, `archive/docs/records/verification/sof-recheck-228.md:79`, `archive/docs/handover/sof.md:12`).
- [ ] Sign-off: anyone runs the checklist in `testing.md` against NAV CANADA's own reports for the same day and sends Patrick the result; the next module starts only after his yes (SOF-R25; TQ-2) (`pf/reset/4-decisions/answers.md:13`, `pf/reset/1-requirements/requirements.md:170`).
- [ ] Remove the PROTOTYPE flag from the SOF card only if Patrick says so (ALL-R4) (`pf/reset/1-requirements/requirements.md:20`).
