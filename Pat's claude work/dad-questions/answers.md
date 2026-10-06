Status: All 13 answered (control thread, 4 Oct 2026 09:14Z). Patrick answers the 13 questions in `docs/questions-for-dad.md` himself (his words, 09:02Z: "i can answer the qeustions"), one card at a time. At the end, one docs PR moves each answer into the module's requirements.md or decisions.md and marks it answered; Traffic answers go to the Traffic thread. Coordinator 09:11Z: the docs PR leaves docs/modules/traffic/ (Traffic PR 4 records TR-Q8/Q11) and the Turn Sim module docs (the review records TS-Q5/Q7/Q17) alone; it only marks those answered in docs/questions-for-dad.md.

| ID | Patrick's answer | When |
|---|---|---|
| SOF-Q4 (wind limits) | Crosswind per runway: the SOF flags crosswind over the T-6 limit for each runway; needs runway data, so it goes on the SOF plan. No whole-field wind/gust limit. (Decoded line: add; beep: future, from 00:40Z.) | 09:04Z card |
| SOF-Q5 (three defaults) | Keep all three: no manual alternate-required switch; acknowledged caution stays quiet until it clears and returns; waves fixed day to day, apply to Today or Tomorrow. | 09:05Z card |
| SOF-Q7 (lightning) | Yes, 20 NM: caution kept, 20 NM default (settable 5-50), caution held through a feed outage ("can't tell now, last seen N min ago"). | 09:09Z card |
| SOF-Q8 (stale times) | Keep these: METAR 75 min, TAF past its end, radar 20 min, lightning 40 min, satellite cloud 60 min. | 09:09Z card |
| SOF-Q12 (favoured runway) | Future list: the favoured-runway hover card AND the crosswind-per-runway flag (SOF-Q4) both wait on the SOF future list (card consequence: "Both wait on the SOF future list"). So no wind flag is built now. | 09:09Z card |
| SOF-Q6 (weather window) | ETA ±1 h: keep today's windows, alternate checked 1 h either side of landing, home from takeoff to 1 h after landing. | 09:14Z card |
| TR-Q8 (type numbers) | Patrick's list + manuals: Patrick gives speeds and patterns per aircraft type, checked against the manuals where they exist. (Needs his list later; until then every type flies T-6 numbers.) | 09:09Z card |
| TR-Q11 (conflict distances) | Keep today's: conflict 200 ft lateral / 200 ft vertical; caution 500 / 500 ft (against the control thread's recommendation of 1,500/500 and 2,500/1,000). | 09:09Z card |
| TF-Q6 (chase window) | Strict 5 deg score, 60 deg chase: the "first nose-on" result stays strict (within 5 deg); the AI commits to pursuit inside 60 deg off the nose, shown as a labelled setting. | 09:09Z card |
| TF-Q10 (open flying numbers) | Keep, labelled: stall 83/86 KIAS, shaker 94%, roll rate, mid throttle, pitch-back 90 deg, MPT bank 68.5 vs SMM ~75, slice vs split S under 120 KIAS, 140 KIAS / 2.0 G energy floor, deck margin all keep today's values, labelled as estimates; looked at again in the Turn Fight step. | 09:10Z card |
| TS-Q5 (4312 preset) | Swap sides (not the recommended "Swap labels"): mirror the picture so the aircraft move, giving #4 #3 #1 #2 left to right from behind; labels unchanged. | 09:10Z card |
| TS-Q7 (roll-in rate) | Add roll rate: Turn Sim rolls in and out at a realistic rate, set in the rebuild or fix (review ruling 08:54Z: 90 deg/s). | 09:10Z card |
| TS-Q17 (correction model) | Review decides: the Turn Sim review recommends keep or remove; Patrick picks then. | 09:10Z card |
