// The EP Tabletop's example scenario (plan Step 1; more and save/load are Step 3). EP-Q3's working answer: the aircraft's indications only,
// never a checklist or boldface step (EP-3). Each number names its source: the open-source baseline (ALL-30,
// docs/references/open-source-performance-baseline.md) or "estimate" until a source backs it. The instructor can type any value.

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
      set: Object.freeze({ 'light.CHIP': true, 'light.MASTER CAUTION': true, 'cue.roughness': 'roughness worse, the airframe shaking' }),
    }),
  ]),
});

export const SCENARIOS = Object.freeze([ENGINE_ROUGHNESS]);
