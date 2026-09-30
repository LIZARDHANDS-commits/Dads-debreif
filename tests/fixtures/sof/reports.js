// Reports for the SOF's tests. The two .txt files are real MET Norway replies
// (captured 2026-09-29/30, copied from tests/fixtures/wx/); the strings below
// are hand-written in the same Canadian format for cases the capture lacks.

import { readFileSync } from 'node:fs';
import { readMetNo } from '../../../src/wx/sources.js';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

/** Newest report per station from the real captures: { CYMJ: 'raw text', ... }. */
export const REAL = {
  metar: Object.fromEntries(readMetNo(read('metno-metar-CYMJ-CYQR-CYYN.txt'))),
  taf: Object.fromEntries(readMetNo(read('metno-taf-CYMJ-CYQR-CYYN.txt'))),
};

// Home (CYMJ) TAFs, all issued 291740Z and valid 29/18Z to 30/06Z.
export const HOME_TAF = {
  // Ceiling 2500 ft all period: fine for Local (below 2000), below Cross-country (3000).
  ceiling2500: 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM BKN025 RMK NXT FCST BY 300000Z',
  // Ceiling 2000 ft: exactly on the Local limit.
  ceiling2000: 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM BKN020 RMK NXT FCST BY 300000Z',
  // Good, then a TEMPO of fog from 00Z.
  tempoFog: 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM SKC TEMPO 3000/3003 1/2SM FG VV002 RMK NXT FCST BY 300000Z',
  // Below 2000 ft from 21Z (FM group).
  lowFromEvening: 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM SCT050 FM292100 22010KT 2SM BR OVC008 RMK NXT FCST BY 300000Z',
  good: 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM FEW100 RMK NXT FCST BY 300000Z',
  // Cloud base not reported: the ceiling can't be known.
  unknownCeiling: 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM OVC///',
  // Thunderstorms in the vicinity, ceiling fine.
  vicinityStorm: 'TAF CYMJ 291740Z 2918/3006 22010KT P6SM FEW100 TEMPO 2922/3002 VCTS FEW040CB',
};

// Alternate TAFs (CYQR), issued 291740Z, valid 29/18Z to 30/18Z.
export const ALT_TAF = {
  // Fog until 00Z, then lifting: below 600-2 while it lasts.
  fog: 'TAF CYQR 291740Z 2918/3018 00000KT M1/4SM FG BKN002 FM300000 27010KT P6SM FEW040',
  good: 'TAF CYQR 291740Z 2918/3018 25015KT P6SM FEW080 BKN240',
  // Ceiling 700 ft: meets 600-2 (not below it).
  ceiling700: 'TAF CYQR 291740Z 2918/3018 25015KT P6SM BKN007',
};

// METARs for the card model.
export const METAR = {
  fresh: 'METAR CYMJ 291800Z 27010KT 15SM FEW100 15/02 A2952 RMK AC1',
  belowLimits: 'METAR CYMJ 291800Z 27005KT 2SM BR BKN015 10/08 A2995',
  onLimits: 'METAR CYMJ 291800Z 27005KT 3SM BR BKN020 10/08 A2995',
  noCeilingGroup: 'METAR CYMJ 291800Z 27005KT 10SM 10/08 A2995',
  vicinityShowers: 'METAR CYMJ 291800Z 27010KT 15SM VCSH FEW040 15/02 A2952',
  thunderstorm: 'METAR CYMJ 291800Z 22008KT 15SM VCTS FEW040CB 22/14 A2980',
  foggy: 'METAR CYMJ 291800Z 00000KT 1/4SM FG VV002 08/08 A3001',
};
