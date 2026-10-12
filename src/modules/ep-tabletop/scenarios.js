// The EP Tabletop's example scenarios (plan Steps 1 and 3; save/load is Step 9). EP-Q3's working answer: the aircraft's indications and
// their causes only, never a checklist or boldface step, and nothing that names the right action (EP-3). A development may set a cause
// (`fault`, systems.js) as well as indications (`set`). Each number names its source: the open-source baseline (ALL-30,
// docs/references/open-source-performance-baseline.md) or "estimate" until a source backs it. The instructor can type any value.
// Since plan Step 5 the aircraft flies from the start (flight.js): `wind` is the weather line's wind as the flight reads it (degrees true,
// as a METAR gives it; an example, not a forecast), and `manoeuvre` is what it is flying when the scenario starts.

/**
 * A healthy PT6A-68 in cruise in the area, the panel before anything goes wrong.
 * - engine.npPct 100: 100 % Np = 1,995 RPM (baseline, "Propeller Shaft Speed"); held at 100 in flight is an estimate.
 * - engine.oilPsi 105: inside the 90 to 120 psi normal range (baseline, "Lubrication System Pressure Limits").
 * - engine.ittC 650: an estimate, below the 820 °C maximum continuous (baseline).
 * - engine.n1Pct 92: an estimate, below the 104 % maximum take-off N1 (baseline).
 * - engine.torquePct 58, fuelFlowPph 300, oilTempC 75, fuel 450 lb a side, volts 28.5, amps 20, hydPsi 3,000: estimates for the example.
 */
export const CRUISE_ENGINE = Object.freeze({
  'engine.torquePct': 58,
  'engine.n1Pct': 92,
  'engine.npPct': 100,
  'engine.ittC': 650,
  'engine.fuelFlowPph': 300,
  'engine.oilPsi': 105,
  'engine.oilTempC': 75,
  'engine.fuelLeftLb': 450,
  'engine.fuelRightLb': 450,
  'engine.volts': 28.5,
  'engine.amps': 20,
  'engine.hydPsi': 3000,
});

/** "Engine roughness in the area" (spec's first example; Dad's checklist line in testing.md): fuel flow starts to fluctuate, then the chip light comes on at Boldface. */
export const ENGINE_ROUGHNESS = Object.freeze({
  id: 'engine-roughness-area',
  title: 'Engine roughness in the area',
  start: Object.freeze({
    phase: 'Area / contact',
    altFt: 8000, // estimate, an area altitude for the example
    kias: 200, // estimate
    headingDegM: 270, // estimate
    position: Object.freeze({ fromIcao: 'CYMJ', bearingDegT: 225, distNm: 12 }), // estimate: 12 NM south-west of Moose Jaw
    fuelLb: 900, // the two tanks below (estimates)
    weather: 'Clear, visibility 15 SM, wind 290° at 10 kt (an example, not a forecast)',
    wind: Object.freeze({ fromDegT: 290, kt: 10 }), // the weather line's wind
    manoeuvre: 'straightLevel', // cruising in the area
    shown: Object.freeze({
      'flight.pitchDeg': 2, // estimate, level cruise
      'flight.bankDeg': 0,
      'flight.altFt': 8000,
      'flight.kias': 200,
      'flight.headingDegM': 270,
      ...CRUISE_ENGINE,
      'light.MASTER WARN': false,
      'light.MASTER CAUTION': false,
      'light.FIRE': false,
      'light.CHIP': false,
      'light.OIL PX': false,
      'cue.smoke': 'none',
      'cue.flames': 'none',
      'cue.oilWindscreen': 'none',
      'cue.roughness': 'none',
      'cue.noises': 'normal engine noise',
      'config.gear': 'up, three lights out',
      'config.flaps': 'up',
    }),
  }),
  developments: Object.freeze([
    Object.freeze({
      id: 'ff-fluctuates',
      label: 'Fuel flow fluctuates ±40 pph; slight roughness',
      at: Object.freeze({ timeS: 20 }),
      // ±40 pph as in the spec's mock-up; an estimate.
      set: Object.freeze({ 'engine.fuelFlowPph': Object.freeze({ v: 300, swing: 40 }), 'cue.roughness': 'slight roughness, felt through the seat and the stick' }),
    }),
    Object.freeze({
      id: 'chip-at-boldface',
      label: 'Chip light on; roughness worse',
      at: Object.freeze({ step: 'B' }),
      // The chip is a cause now (systems.js): it lights CHIP, and CHIP lights MASTER CAUTION (EP-11). Until V2.389 this development set the
      // two lights directly. The engine note is an example cue, an estimate.
      fault: Object.freeze({ id: 'chip', kind: 'chip' }),
      set: Object.freeze({ 'cue.roughness': 'roughness worse, the airframe shaking', 'cue.noises': 'engine note rougher' }),
    }),
  ]),
});

/**
 * A healthy PT6A-68 climbing out after take-off, the panel before anything goes wrong.
 * - engine.npPct 100: 100 % Np = 1,995 RPM (baseline); held at 100 in the climb is an estimate.
 * - engine.oilPsi 105: inside the 90 to 120 psi normal range (baseline, "Lubrication System Pressure Limits").
 * - engine.ittC 760: an estimate, below the 820 °C maximum continuous (baseline).
 * - engine.n1Pct 98: an estimate, below the 104 % maximum take-off N1 (baseline).
 * - engine.torquePct 95: an estimate, below the 100 % maximum (baseline).
 * - engine.fuelFlowPph 450, oilTempC 70, fuel 440 lb a side, volts 28.5, amps 30, hydPsi 3,000: estimates for the example.
 */
export const CLIMB_ENGINE = Object.freeze({
  'engine.torquePct': 95,
  'engine.n1Pct': 98,
  'engine.npPct': 100,
  'engine.ittC': 760,
  'engine.fuelFlowPph': 450,
  'engine.oilPsi': 105,
  'engine.oilTempC': 70,
  'engine.fuelLeftLb': 440,
  'engine.fuelRightLb': 440,
  'engine.volts': 28.5,
  'engine.amps': 30,
  'engine.hydPsi': 3000,
});

/**
 * "Oil pressure dropping on departure" (the spec's example list; systems-plan Phase 1): shortly after take-off an oil leak starts, so the
 * oil pressure falls and, once it is low, OIL PX and MASTER CAUTION come on by themselves (EP-11); later a film of oil appears on the
 * windscreen. Indications and the cause only (EP-3). The leak's rate and the OIL PX threshold are estimates (systems.js).
 */
export const OIL_PRESSURE_DEPARTURE = Object.freeze({
  id: 'oil-pressure-departure',
  title: 'Oil pressure dropping on departure',
  start: Object.freeze({
    phase: 'Take-off and departure',
    altFt: 3500, // estimate: about 1,600 ft above Moose Jaw's 1,892 ft, climbing out
    kias: 150, // estimate
    headingDegM: 290, // estimate, off a westerly runway
    position: Object.freeze({ fromIcao: 'CYMJ', bearingDegT: 300, distNm: 2 }), // estimate: 2 NM west-north-west of Moose Jaw
    fuelLb: 880, // the two tanks below (estimates)
    weather: 'Clear, visibility 15 SM, wind 290° at 10 kt (an example, not a forecast)',
    wind: Object.freeze({ fromDegT: 290, kt: 10 }), // the weather line's wind
    manoeuvre: 'climb', // climbing out after take-off
    shown: Object.freeze({
      'flight.pitchDeg': 8, // estimate, climbing
      'flight.bankDeg': 0,
      'flight.altFt': 3500,
      'flight.kias': 150,
      'flight.headingDegM': 290,
      ...CLIMB_ENGINE,
      'light.MASTER WARN': false,
      'light.MASTER CAUTION': false,
      'light.FIRE': false,
      'light.CHIP': false,
      'light.OIL PX': false,
      'cue.smoke': 'none',
      'cue.flames': 'none',
      'cue.oilWindscreen': 'none',
      'cue.roughness': 'none',
      'cue.noises': 'normal engine noise',
      'config.gear': 'up, three lights out',
      'config.flaps': 'up',
    }),
  }),
  developments: Object.freeze([
    Object.freeze({
      id: 'oil-leak-starts',
      label: 'Oil leak starts: the pressure begins to fall',
      at: Object.freeze({ timeS: 15 }),
      fault: Object.freeze({ id: 'oil-leak', kind: 'oilLeak', severity: 0.5 }),
      set: Object.freeze({}),
    }),
    Object.freeze({
      id: 'oil-on-windscreen',
      label: 'A film of oil on the windscreen',
      at: Object.freeze({ timeS: 120 }),
      set: Object.freeze({ 'cue.oilWindscreen': 'a thin film of oil spreading up the windscreen' }),
    }),
  ]),
});

export const SCENARIOS = Object.freeze([ENGINE_ROUGHNESS, OIL_PRESSURE_DEPARTURE]);
export const scenarioById = (id) => SCENARIOS.find((sc) => sc.id === id) ?? null;
