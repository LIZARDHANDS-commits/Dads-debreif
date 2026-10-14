# Formation track logs

Patrick's ForeFlight track logs from four-ship sorties, kept as recorded formation flying for the Formation Sim (turn-sim). Parked by Patrick, 14 Oct 2026 ("Park it for now"), then placed in the plan the same day: how each rung can use it is `docs/modules/turn-sim/plan.md` 12.4, "Recorded formation flying". Background data, not instructions; Patrick's rulings and the manuals win, and "this isnt perfect" (Patrick): GPS a few tens of feet once a second, iPad bank and G estimated, phases unconfirmed. A four-ship is flown more gently than a two-ship, and academic fighting wing is smooth 60°/2 G; it can also be flown aggressively (spec 7e 1c).

| File | Sortie | Ship | Recorder | What it has |
|---|---|---|---|---|
| [2026-09-23-four-ship-as-no2.kml](2026-09-23-four-ship-as-no2.kml) | 23 Sep 2026, CYMJ-CYMJ, airborne 22:30 to 23:49Z | #2 | iPad's own GPS, on the GPS second, 1 per s | Position and height only (no bank, pitch or G recorded) |
| [2026-08-14-four-ship-as-no4.kml](2026-08-14-four-ship-as-no4.kml) | 14 Aug 2026, CYMJ-CYMJ, airborne about 20:17 to 21:33Z | #4 | iPad's own GPS, on the GPS second, 1 per s | Position and height only |

The 14 Aug upload came as two files (`TrackLog_B942C6A6…` and `TrackLog_858A1AF4…`). They are one recording: every fix they share matches to 0 ft. The second is trimmed to 20:18 to 21:34Z, so only the full one is kept here.

**What one ship's track can and can't say.** It can't place the wingman relative to Lead; that needs both ships from the same sortie. It gives the wingman's own bank, G, height and speed (bank and G estimated from the turn, so read them as estimates), Lead's turns where the wingman was in close, and the formation's speed. Measured 14 Oct 2026 (estimates): about 210 KIAS (true airspeed 236 to 249 kt at 7,750 to 10,450 ft from four steady turns, standard temperature assumed, wind 4 to 11 kt from the west).

**Phases on 23 Sep, the thread's guess from the track** (not confirmed by Patrick):
- 22:34 to 22:41Z: steep work to 80° of bank, 8,200 to 10,800 ft.
- 22:41 to 23:09Z: about 10,000 ft. Steady 45 to 50° turns held within ±10 kt and ±150 ft (close formation?), and long 30° turns of 230 to 640° (rejoin turns?).
- 23:09 to 23:17Z: loops, 7,100 to 11,650 ft (extended trail?).
- 23:17 to 23:21Z: a 400° left turn at about 32° (a rejoin?).
- 23:21 to 23:31Z: 50 to 70° turns and reversals with 300 to 450 ft of height and 50 to 60 kt of speed swing, and a loop (fighting wing?).
- 23:36 to 23:49Z: low work, the circuit, landing.

**The pair the repo already has.** The Debrief's example flight (`original/assets`, 2 Jun 2026, V6's example; read only) is one four-ship with all four ships recorded: #1 and #2 on iPads, #3 and #4 on Sentry pucks, whose files record bank, pitch and G every second. Measured with `pair-geometry.mjs` on 14 Oct 2026, airborne together about 73 min:
- #2 off Lead: about 30 min in close (under 150 ft), 9.4 min at 400 to 1,200 ft behind Lead's wing line, 5 s ahead of it.
- #4 off #3: about 25 min in close, 11.5 min at 400 to 1,200 ft behind #3's wing line, none ahead of it.
- 18:40 to 19:05Z looks like fighting wing in two two-ships (not confirmed): #2 mostly 500 to 1,000 ft and 15 to 35° off Lead's tail, #4 700 to 1,250 ft and 20 to 50° off #3's tail, both mostly within 100 to 200 ft of height; the leaders at 1.0 to 2.0 G with peaks of 2.3 to 3.0, the wingmen up to about 2.9 G.
- 18:35Z, after take-off: #2 closes from 1,300 to 450 ft straight behind Lead at up to 42 ft/s (about 25 kt), a straight-ahead rejoin.

Run `node "Pat's claude work/formation-track-logs/pair-geometry.mjs" 1 2` (or `3 4`) from the repo root; it uses the Debrief's own reader, timestamp snap and sampling, so the numbers match the Debrief.
