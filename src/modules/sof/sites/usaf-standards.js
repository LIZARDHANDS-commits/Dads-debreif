// The weather standards the SOF uses at the USAF T-6 bases (plan Step 2c, part F; Dad, 8 Oct 2026: "start step f for the usaf bases"; Dad decides SOF
// calls, SOF-47): AFMAN 11-202 Volume 3, Chapter 4, paragraphs 4.16 and 4.17, as written up in our own words in
// docs/references/afman11-202v3-alternates.md (Dad gave the paragraphs on 7 and 8 Oct 2026). Paragraph numbers only, never the manual's text. Chapter 4
// of the manual wins over this file; the AETC supplement and each wing's local guidance can add rules and are not read yet.
//
// One shared object, referenced by the USAF bases' profiles (KDLF, KEND, KRND, KCBM, KSPS) and by San Angelo (KSJT), which is not a USAF base but Dad
// added it as an SOF location beside Laughlin, so it is given the same rules (flagged for Dad). The Navy bases (KNSE, KNGP) fly OPNAVINST 3710.7 and
// CNATRA rules and keep `standards: null` ("Limits not set").
//
// How the SOF applies it is in ../usaf-limits.js. Every number below names its paragraph in `source`.

/** The rule's name, as the screen says it, and the source line in place of Moose Jaw's Gen Book. */
export const USAF_BOOK = 'AFMAN 11-202V3';
export const USAF_SOURCE = 'AFMAN 11-202V3 4.16';

export const USAF_STANDARDS = Object.freeze({
  rule: 'usaf',
  book: USAF_BOOK,
  source: USAF_SOURCE,
  // "Worst weather" is the forecast from ETA − 1 h to ETA + 1 h (4.16.2.1, 4.16.4.1). The SOF takes the wave's planned landing time as the ETA, at home
  // and at each alternate (as Moose Jaw's alternate window does, SOF-34; the flight time to the alternate is not added).
  etaWindow: Object.freeze({ beforeMin: 60, afterMin: 60, source: 'AFMAN 11-202V3 4.16.2.1 and 4.16.4.1 (ETA ± 1 h)' }),
  // An alternate is required when the worst weather at the destination, TEMPO included, is below a 2,000 ft ceiling above the field or 3 SM (4.16.2.1).
  homeTrigger: Object.freeze({ ceilingFt: 2000, visSm: 3, tempoIncluded: true, source: 'AFMAN 11-202V3 4.16.2.1' }),
  // An alternate is also required when the destination has no compatible instrument approach (4.16.1). The SOF has no approach data for home: it takes
  // the base as having one (the training bases publish non-GPS instrument approaches; not checked by the tool) and says so.
  homeApproach: Object.freeze({ assumedCompatible: true, source: 'AFMAN 11-202V3 4.16.1' }),
  // A forecast crosswind outside the aircraft's limits also requires an alternate (4.16.2.3, T-3). The T-6A's limits are Dad's ruling (8 Oct 2026; no
  // manual page yet): 25 kt for a full-stop landing, 20 kt for a touch-and-go, 15 kt solo; "the rest are the same", so the wet and icy runway levels
  // stay the SOF's crosswind settings (crosswind.js). The alternate is required when the worst forecast crosswind at ETA ± 1 h is over the full-stop
  // limit on every runway at home. The runway display flags red over the full-stop limit, amber over the touch-and-go one (dry) and notes solo over 15 kt.
  crosswind: Object.freeze({
    fullStopKt: 25,
    touchAndGoKt: 20,
    soloKt: 15,
    source: "Dad's ruling, 8 Oct 2026 (T-6A: 25 kt full stop, 20 kt touch-and-go, 15 kt solo; wet and icy as the SOF settings)",
    alternateSource: 'AFMAN 11-202V3 4.16.2.3',
  }),
  // An alternate is suitable when its worst weather at ETA ± 1 h (TEMPO included, except TEMPO groups for thunderstorms, rain showers or snow
  // showers) is at or above a ceiling of 1,000 ft or the lowest compatible approach's minimum + 500 ft, whichever is higher, and a visibility of 2 SM or
  // the lowest compatible approach's minimum + 1 SM, whichever is higher (4.16.4, 4.16.4.1).
  alternate: Object.freeze({
    ceilingFloorFt: 1000,
    ceilingAddFt: 500,
    visFloorSm: 2,
    visAddSm: 1,
    tempoIncluded: true,
    // TEMPO groups left out of the alternate's test: thunderstorms (TS), rain showers (SHRA) and snow showers (SHSN) (4.16.4.1).
    tempoExcluded: Object.freeze(['TS', 'SHRA', 'SHSN']),
    source: 'AFMAN 11-202V3 4.16.4 and 4.16.4.1',
  }),
  // No compatible instrument approach at the alternate: the forecast must allow a descent from the MEA, approach and landing in basic VFR (4.16.4.3).
  // The SOF has no MEA data, so it says to check this by hand.
  noApproachAlternate: Object.freeze({ source: 'AFMAN 11-202V3 4.16.4.3' }),
  // The T-6A can't rely on GPS (Dad's ruling, 8 Oct 2026), so 4.17.3 applies: the alternate needs a compatible approach that doesn't use GNSS.
  gnss: Object.freeze({ alternateNeedsNonGnss: true, source: 'AFMAN 11-202V3 4.17.3; Dad, 8 Oct 2026 (the T-6A cannot rely on GPS)' }),
  // A field that doesn't report weather is not suitable (4.16.5.2).
  noWeatherReports: Object.freeze({ source: 'AFMAN 11-202V3 4.16.5.2' }),
  // Unmonitored NAVAIDs, "Alternate Not Authorized" marks and IFR alternate minimums notes (4.16.5.1, 4.16.5.3, 4.16.5.4; NOTAMs, note to 4.16.5) are
  // not in the SOF's data: each alternate says to check them.
  alsoCheck: Object.freeze({ source: 'AFMAN 11-202V3 4.16.5' }),
});
