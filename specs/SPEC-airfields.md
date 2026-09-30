# Spec: `airfields`, the home field and its alternates

Status: **draft, waiting for Patrick's approval.** Module id `airfields` in [`SPEC.md`](../SPEC.md). Requirements: R16 (home airfield and alternates are a setting), R10 (one Zulu/local switch, local is the home field's zone), R13 (SOF), R22 (essentials first). Decisions: the home airfield is a setting usable anywhere, default CYMJ (Patrick, 2026-09-29), D60 and D70 to D73 (Q30 alternate rules). Open questions: Q40 (RCAF orders), and Dad's GNSS visual-descent question. Decision, requirement and question numbers refer to the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102

## Objective

One place that knows the home airfield and the alternates, and what each alternate needs to count as legal. V6 hard-codes Moose Jaw in about 15 places with three different positions, assumes CST everywhere (#7, #42), keeps the alternates as a text box in the SOF's WX SETUP, and checks every alternate against one 600 ft / 2 SM limit that nothing actually reads (#4). Here:

1. The home field is a setting (default CYMJ). Its time zone drives local time in every module.
2. The alternates are a short list (default CYQR, CYYN, CYXE, as V6).
3. Each alternate carries its approach type and lowest landing minima, and `airfields` turns those into the numbers the weather parser's `assessAlternate` already takes: alternate minima (with the trade-offs), landing minima for PROB groups, the GNSS flag and the distance from home.

Users: the SOF (alternate calls), and every module that shows local time or needs the home field's position or elevation. Done means the SOF can call `assessAlternate(taf, window, airfields.checkOptions('CYXE'))` with nothing typed twice, and the header clock follows the home field.

## Scope

In:

- A built-in list of known airfields: V6's 15 (sof.html line 563: CYMJ, CYQR, CYYN, CYXE, CYQV, KGGW, KISN, CYPA, CYQW, KMIB, CYXH, KMOT, CYBR, CYQL, KGTF), with V6's names and positions, plus each one's time zone. CYMJ also carries V6's field elevation, 1,892 ft (shell.html line 737).
- The setting: home ICAO, the alternates list, and each airfield's approach type and lowest landing minima. Any four-character ICAO can be added. One that isn't in the built-in list needs a name and, for distances, a position; as the home field it also needs a time zone.
- The alternate-minima rules from the Canada Air Pilot (CAP GEN, "Operating Minima – Alternate"), as decided in D71 and D73. Research: `/mnt/project-files/wx-sources/canada-ifr-alternate-rules.md`.
- Great-circle distance from home to each alternate.
- One settings panel (below), built with `src/ui-kit/`.

Out:

- Deciding whether weather is good enough. `wx` does that (`src/wx/alternates.js`); `airfields` only supplies the numbers.
- The home-weather trigger (2000 ft / 3 SM), the ± window margin and the refresh rate. Those are SOF settings, in the SOF spec.
- Real runway data (FF20), SOF crosswind (FF21), NOTAMs, and any approach data shipped with the app. Approach charts change every 56 days, so the app never carries them. People enter the approach type and the lowest minima from the current Canada Air Pilot.
- The VNC charts and the 19 route overlays. They are pinned to places, not to the home setting, so they stay with the debrief (`src/modules/debrief/data/cymj.js`).
- "No IFR approach" alternates (500 ft above a minimum IFR altitude). That is V6's GNSS-only MEA branch, and it waits for Dad's answer on the GNSS visual descent. Until then it isn't offered.

## Behaviour

### The setting

```js
{
  version: 1,
  home: 'CYMJ',
  alternates: ['CYQR', 'CYYN', 'CYXE'],
  fields: {            // only what someone changed or added; the built-in list fills the rest
    CYXE: { approach: 'one-precision', lowestHatFt: 250, lowestVisSm: 0.75 },
  },
}
```

- Stored with `src/storage/` under the scope `airfields`. If the browser won't store it, it lasts for the visit, as every other setting does.
- Everything read back is checked: ICAO ids must be four letters or digits (upper-cased), numbers must be finite and in range (HAT 0 to 5,000 ft, visibility 0 to 10 SM, latitude ±90, longitude ±180, elevation −1,500 to 15,000 ft), the time zone must be one the browser knows, and the approach type must be one of the list below. Anything else is dropped, never guessed.
- The home field can't also be an alternate. Duplicates are dropped. Up to 6 alternates (V6 showed 3).
- Changing the home field changes local time everywhere at once (the shell's header clock, the SOF's clocks and wave times, debrief times) through `subscribe`.

### Approach type, and the alternate minima it gives

Each airfield has one approach type. It says which row of the CAP GEN table applies, counting only approaches that are usable at the ETA.

| Approach type (what the user picks) | Alternate minima (CAP GEN) | GNSS flag |
|---|---|---|
| Not set (default) | V6's 600-2, marked "not checked against approaches" | off |
| Two or more precision approaches, to separate runways | 400-1, or 200-½ above the lowest HAT and visibility | off |
| One precision approach (ILS or PAR) | 600-2, also 700-1½ or 800-1; or 300-1 above the lowest HAT and visibility | off |
| Non-precision only (LOC, VOR, NDB) | 800-2, also 900-1½ or 1000-1; or 300-1 above the lowest HAT/HAA and visibility | off |
| GNSS only (RNAV, LNAV minima) | as non-precision | on |

- **"Whichever is greater"**, for each of ceiling and visibility separately: for one precision approach with a lowest HAT of 350 ft and visibility ¾ SM, the minima are the greater of 600 and 650 ft, and of 2 and 1¾ SM, so 700-2. The trade-offs (700-1½, 800-1 and so on) apply only when the standard values win. When the lowest HAT or visibility isn't entered, the standard values are used.
- **Rounding** (CAP GEN): a computed ceiling up to 20 ft over a hundred rounds down, anything more rounds up (HAT 420 gives 400, 421 gives 500). A computed visibility is never more than 3 SM.
- **No LPV credit** (D73): the GNSS-only row uses the LNAV minima, and RNAV with vertical guidance is not a precision approach. The panel's help line says so.
- **PAR counts as a precision approach.** CAP GEN and military FLIP agree on this; Q40 asks Dad whether RCAF orders differ anywhere.

### Landing minima (for PROB groups)

- The lowest usable HAT and its visibility, as entered for the airfield (`lowestHatFt`, `lowestVisSm`), are the landing minima that PROB30/40 groups are checked against (D72). For a GNSS-only field these are the LNAV numbers, not LPV.
- When they aren't entered, `landingMinima` is `null`, and `wx` lists a PROB below the alternate minima as "unchecked" instead of passing or failing it, as it does today.

### GNSS and distance (D73)

- `gnssApproach` is on for an airfield whose approach type is GNSS only. A "Plan uses a GNSS approach here" checkbox (under More) can turn it on for any airfield, including home, for a day when the plan relies on RNAV although other approaches exist.
- `distanceNm` is the great-circle distance from the home field, from the two positions, rounded to 0.1 NM. It is `null` when either position is missing, which `wx` already reports as "distance unknown".
- From CYMJ with V6's positions: CYQR 35 NM, CYYN 82 NM, CYXE 119 NM, so only CYXE clears 100 NM, matching the research.

### Questions this spec doesn't answer (defaults until answered)

- **Q40, for Dad or a current SOF:** do RCAF orders (B-GA-100-001/AA-000, Vol 1, Ch 5) use the CAP GEN table, count PAR the same way, set other minima for 15 Wing, or add a GNSS rule for the Harvard II? Default: the civil CAP GEN rules above.
- **GNSS visual descent (Dad):** what weather does a GNSS-only alternate need for the visual-descent-from-MEA branch? Default: that branch isn't offered.
- **Who fills in the four default airfields' approaches:** the app ships them as "Not set (600-2)", which is exactly V6. Anyone can enter the current approach type and lowest minima from the Canada Air Pilot, and they are kept in that browser.

## The screen (R22)

An **Airfields** section in the Settings dialog. It shows only this by default:

```
Airfields
  Home field   [CYMJ    ]  Moose Jaw · local time UTC−6
  Alternates   ICAO   Approaches                    Lowest HAT   Vis     From home
               CYQR   [One precision (ILS/PAR) ▾]   [ 250 ] ft   [¾] SM  35 NM
               CYYN   [Not set (600-2)         ▾]   [     ] ft   [ ] SM  82 NM
               CYXE   [Not set (600-2)         ▾]   [     ] ft   [ ] SM  119 NM
               + Add alternate                                         (✕ removes a row)
  Minima used  CYQR 600-2 (or 700-1½, 800-1) · CYYN 600-2, not checked · CYXE 600-2, not checked
  ▸ More airfield settings
```

- **More airfield settings** (collapsed): per airfield, the name, position, elevation and time zone (filled in and read-only for built-in airfields, editable for added ones), and the "Plan uses a GNSS approach here" checkbox; the rounding and no-LPV notes; and "Reset airfields to defaults".
- An ICAO that isn't in the built-in list opens its row in More so the name, position and (for home) time zone can be entered. Until the home field has a time zone, local time stays on the last good zone and the row says so.
- Built with `src/ui-kit/` (`createPanel`, `h`, controls). Text in, never HTML. Every input has a real label, works from the keyboard, and states errors in words, not only colour.

## Interface

```js
import { createAirfields } from './src/airfields/airfields.js';

const airfields = createAirfields({ store: app.storage.scope('airfields') });
airfields.home();          // { icao: 'CYMJ', name: 'Moose Jaw', lat: 50.3303, lon: -105.559, elevationFt: 1892, timeZone: 'America/Regina', approach: 'not-set', ... }
airfields.alternates();    // [{ icao: 'CYQR', ... }, ...] in the user's order
airfields.stations();      // ['CYMJ', 'CYQR', 'CYYN', 'CYXE'], for the weather sources
airfields.checkOptions('CYXE');
// { minima: [{ ceilingFt: 600, visSm: 2 }, { ceilingFt: 700, visSm: 1.5 }, { ceilingFt: 800, visSm: 1 }],
//   minimaSource: 'not-set', landingMinima: null,
//   gnssApproach: false, homeGnssApproach: false, distanceNm: 119.x }
// → passed straight to wx's assessAlternate(taf, window, options)
airfields.update({ alternates: ['CYQR', 'CYXE'] });
const stop = airfields.subscribe((next) => { … });
```

Pure functions, tested on their own, in `src/airfields/minima.js` and `distance.js`: `alternateMinima(field)`, `landingMinima(field)`, `roundCeilingFt(ft)`, `greatCircleNm(a, b)`.

Other modules only read through this interface. Changes other threads make to use it go through the coordinator:

- **Shell** (app-frame thread): the header takes its zone from `airfields.home().timeZone` in place of `HOME_ZONE`, and the Settings dialog mounts the Airfields section.
- **Debrief**: the "Field elev" datum reads the home elevation.
- **SOF** (later): the station list, the alternate cards and `checkOptions`.

## Commands

```
npm test                                     # everything
node --test 'tests/unit/airfields/*.test.js' # this module
npm run test:e2e                              # includes the Airfields panel
```

## Project structure

```
src/airfields/
  airfields.js     createAirfields: the setting, checking what's read back, subscribe
  catalog.js       V6's 15 airfields: name, position, time zone; CYMJ's elevation
  minima.js        CAP GEN table, trade-offs, "whichever is greater", rounding, landing minima
  distance.js      great-circle distance in NM
  panel.js         the Settings section (R22)
  README.md        what each file does, and how to add a built-in airfield
tests/unit/airfields/
  *.test.js        one per source file
tests/e2e/airfields.spec.js   the panel, keyboard and blocked-storage cases (owned here, added through the app-frame thread)
tasks/airfields/   plan.md and todo.md, once this spec is approved
```

## Testing strategy

1. **Minima table.** Each row of the CAP GEN table, each trade-off, "whichever is greater" for ceiling and visibility separately (the 350 ft / ¾ SM example gives 700-2), the rounding examples (420 → 400, 421 → 500), the 3 SM cap, and "not set" giving exactly V6's 600/2.
2. **Straight into `wx`.** `checkOptions` fed to the real `assessAlternate` with TAFs from `tests/unit/wx/reports.js`: a field at 800-2 (non-precision) fails a TAF of `BKN007 3SM` that passes at 600-2; a PROB30 at 300 ft passes with landing minima of 250 ft and is "unchecked" without them; CYQR (35 NM) with GNSS at both ends warns, CYXE (119 NM) doesn't.
3. **Distances.** CYMJ to CYQR, CYYN and CYXE match 35, 82 and 119 NM to within 1 NM, and a missing position gives `null`.
4. **The setting.** Defaults are V6's (CYMJ; CYQR, CYYN, CYXE; 600-2). Bad ICAO ids, out-of-range numbers, unknown time zones and unknown approach types are dropped; home is never an alternate; blocked storage works for the visit; `subscribe` fires on every change.
5. **Screen** (Playwright): the default view shows only the rows above; More opens and closes; changing the home field to an airfield with a different zone changes the header's local time; everything reachable by keyboard; nothing overlaps at 1366 × 768 (R2).

## Boundaries

- **Always:** keep the minima functions pure; cite the CAP GEN rule in each test name; unknown stays unknown (a missing HAT or position is `null`, never a guess).
- **Ask first:** shipping any approach or runway data; changing a CAP GEN rule, a default, or the "not set" fallback; anything that depends on Q40 or the GNSS visual-descent answer.
- **Never:** decide pass or fail on weather here (that's `wx`); edit `original/`; put entered text into the page as HTML.

## Success criteria

- The tests above pass under `npm test` and `npm run test:e2e`.
- With nothing changed, every number the SOF would use is V6's (600-2 for each alternate, CYMJ local time UTC−6).
- Setting CYXE to "Non-precision only" makes the SOF check it against 800-2, 900-1½ and 1000-1 with no other change.
- Setting the home field to CYXH (Medicine Hat) shows local time in Mountain time across the app.
