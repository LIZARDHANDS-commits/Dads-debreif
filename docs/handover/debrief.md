# Debrief (2D/3D KML viewer)

Replays ForeFlight KML tracks for up to four ships, with formation spacing, sweep, aspect, estimated G and speed, the lead's FAST/SLOW call, historical weather (METAR, radar, winds) and a 2D/3D switch.

- Spec: `specs/SPEC-debrief.md`. Tasks: `tasks/debrief/`. Code: `src/modules/debrief/`. Checklist: `docs/checklists/debrief.md`.
- Built and live through #241 (5a695cb), which fixed the final check's three items.

## Final check (30 Sep): pass, with three items being fixed

- F1: the lead's FAST/SLOW call used estimated IAS from ground speed with no wind, up to 20 kt off. Fix: wind-correct it, or say "(no wind)".
- F2: GPS spikes showed as real over-G or overspeed; a 5 s hole was not treated as a gap. Fix: a hole of 5 s or more is a gap, G above the stall line is suppressed, no verdict above 350 kt ground speed.
- F3 (low): bank and G beside it could disagree at spikes.

The fix merged as PR #241 (5a695cb), built test-first. Verification's re-check of F1-F3 passed (`docs/records/verification/debrief-final.md`, "Re-check after #241").

What it does:
- F1: with **Winds aloft** on, Lead's est. IAS is corrected for the model wind and says "(wind-corrected)"; otherwise it says "(no wind)". The FAST/SLOW call follows the IAS shown. Wingmen stay "(no wind)".
- F2: in the Debrief only, a fix hole of 5 s or more is a gap; est. G above the stall line (IAS/86)² shows "--"; ground speed over 350 kt blanks speed, G and bank, and Lead reads "not judged: GPS speed over 350 kt". Recorded G and bank are never blanked. flight-data's shared gap rule ("more than 5 s") and the 2D/3D glyphs are unchanged.
- F3: bank uses the same 3 s speed as est. G, so they agree within 1°.
- Judgement calls for all three are logged in `logs/decisions-for-review.md` (18:05 rows).

Nothing left from the final check.

## Next

Patrick runs `docs/checklists/debrief.md` on the live site and signs off.

## Future (not built)

Printable sheet (FF4), library (FF5), GPX (FF6), drawing over the replay (FF10), synced graphs (FF16), event scan (FF17), geometry readouts (FF18), terrain height (FF19).
