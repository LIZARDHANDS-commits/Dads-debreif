# SOF dashboard

The Supervisor of Flying's all-day desk screen: home field and alternates weather (METAR/TAF against limits), alternate trigger, lightning, radar, cloud, warnings, traffic map and timeline.

- Spec: `specs/SPEC-sof.md`. Tasks: `tasks/sof/`. Code: `src/modules/sof/`. Checklist: `docs/checklists/sof.md`.
- Built and live through #238. End-of-module tests passed; the final numbers-and-safety check found nothing.

## Next

Patrick runs `docs/checklists/sof.md` on the live site and signs off. No paused branches (the last backup was merged in #238).

## Open

- Live traffic layer needs the relay in `relay/` deployed as a Cloudflare Worker on an account Patrick owns. The layer stays off until then. Optional.
- Three questions for Dad (lightning caution through an outage, cloud picture age, 20 NM radius). See HANDOVER.md.
- Alternate trigger: local (MTCA) 2000/3 default, cross-country 3000/3 option (Gen Book p.7, D111).
- Future: all-day soak run, map extras, VNC layer into ui-kit, 50 NM info line, SIGMETs/PIREPs/GFA (FF26), radar kept all day (FF37), crosswind per runway (FF21).
