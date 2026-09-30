# Debrief (2D/3D KML viewer)

Replays ForeFlight KML tracks for up to four ships, with formation spacing, sweep, aspect, estimated G and speed, the lead's FAST/SLOW call, historical weather (METAR, radar, winds) and a 2D/3D switch.

- Spec: `specs/SPEC-debrief.md`. Tasks: `tasks/debrief/`. Code: `src/modules/debrief/`. Checklist: `docs/checklists/debrief.md`.
- Built and live through #237.

## Final check (30 Sep): pass, with three items being fixed

- F1: the lead's FAST/SLOW call used estimated IAS from ground speed with no wind, up to 20 kt off. Fix: wind-correct it, or say "(no wind)".
- F2: GPS spikes showed as real over-G or overspeed; a 5 s hole was not treated as a gap. Fix: a hole of 5 s or more is a gap, G above the stall line is suppressed, no verdict above 350 kt ground speed.
- F3 (low): bank and G beside it could disagree at spikes.

The fix is one PR from the Debrief thread (in progress when this was written). After it merges, re-check only F1-F3.

## Next

Patrick runs `docs/checklists/debrief.md` on the live site and signs off.

## Future (not built)

Printable sheet (FF4), library (FF5), GPX (FF6), drawing over the replay (FF10), synced graphs (FF16), event scan (FF17), geometry readouts (FF18), terrain height (FF19).
