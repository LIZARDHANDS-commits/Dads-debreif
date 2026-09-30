// Report strings the wx tests share. Real-format Canadian METAR/TAF text; the
// audit cases are the exact strings the V6 audit ran (docs/audit/findings.json).
// Add every report that ever parses wrong here, with the issue it belongs to.

export const NOW = new Date('2026-09-29T11:30:00Z');
// The METARs below are observed at 1500Z, so they are read half an hour later.
export const METAR_NOW = new Date('2026-09-29T15:30:00Z');

export const METAR = {
  typical: 'METAR CYMJ 291500Z 27010G18KT 15SM -SHRA FEW030TCU BKN080 OVC120 14/08 A2992 RMK TCU2AC3SC1 SLP134',
  // Audit #3 (sof-c#3, sof-b#2): V6 showed 4 SM and no ceiling.
  quarterMileFog: 'METAR CYMJ 291500Z 00000KT M1/4SM FG BKN002CB 08/08 A3001',
  mixedFraction: 'SPECI CYQR 291517Z 24015KT 1 1/2SM BR OVC004 10/09 A2990',
  metric: 'METAR CYXE 291500Z AUTO VRB03KT 9999 NCD 12/02 Q1012',
  cavok: 'METAR CYYN 291500Z 30012KT 260V330 CAVOK 18/M02 A3010',
  // Audit sof-a#13: V6 raised nothing for these.
  vicinityStorm: 'METAR CYMJ 291500Z 22008KT 15SM VCTS FEW040CB 22/14 A2980',
  towering: 'METAR CYMJ 291500Z 22008KT 15SM FEW040TCU BKN100 22/14 A2980',
  heavyStorm: 'METAR CYMJ 291500Z 36020G30KT 3/4SM +TSRAGR BKN015CB OVC030 18/16 A2975',
  freezingFog: 'METAR CYMJ 291500Z 01010KT 1/2SM FZFG VV002 M03/M03 A3020',
  freezingRainPellets: 'METAR CYMJ 291500Z 27005KT 2 1/2SM -FZRAPL OVC012 M01/M02 A2995',
  // Exactly on the default home limits (2000 ft, 3 SM).
  onLimits: 'METAR CYMJ 291500Z 27005KT 3SM BR BKN020 10/08 A2995',
  belowBoth: 'METAR CYMJ 291500Z 27005KT 2SM BR BKN015 10/08 A2995',
  unknownLayer: 'METAR CYMJ 291500Z AUTO 27005KT 10SM OVC/// 10/08 A2995',
};

export const TAF = {
  // Audit #1 (sof-c#0): V6 read the TEMPO visibility as 2920 SM.
  tempoHalfMile: 'TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC TEMPO 2916/2920 1/2SM FG RMK NXT FCST BY 18Z',
  // Audit #2 (sof-c#1): V6 dropped the BECMG conditions after 15Z.
  becmgIfr: 'TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC BECMG 2913/2915 VRB03KT 1SM BR OVC003 FM300600 27010KT P6SM SKC',
  // Audit #2 (sof-c#7): a leading TEMPO made V6 stretch the IFR base forecast to the end.
  leadingTempo: 'TAF CYMJ 291120Z 2912/3012 27010KT 1SM BR OVC004 TEMPO 2912/2914 1/2SM FG FM291500 27010KT P6SM SKC',
  // Audit #3 (sof-c#2): V6 saw no ceiling in BKN015CB.
  cbCeiling: 'TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC FM291500 27010KT P6SM BKN015CB',
  // Audit #3 (sof-c#3): M1/4SM overnight.
  overnightFog: 'TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC FM300600 00000KT M1/4SM FG SKC',
  // Audit sof-c#16: SKC must clear the inherited cloud.
  tempoClears: 'TAF CYMJ 291120Z 2912/3012 27010KT P6SM BKN008 TEMPO 2914/2918 SKC',
  // Audit sof-c#14: PROB30 TEMPO keeps its probability.
  prob: 'TAF CYMJ 291120Z 2912/3012 24012KT P6SM SCT050 PROB30 TEMPO 2918/2922 3SM TSRA BKN030CB PROB40 3002/3006 2SM BR',
  amended: 'TAF AMD CYQR 291305Z 2913/3012 22012G22KT P6SM BKN030 BECMG 2918/2920 5SM -SHRA OVC015 RMK NXT FCST BY 18Z',
  // For the alternate checks (audit #4).
  altFogLifting: 'TAF CYQR 291140Z 2912/3012 00000KT M1/4SM FG BKN002CB FM291800 27010KT P6SM FEW040',
  altTempoShowers: 'TAF CYYN 291140Z 2912/3012 27010KT P6SM BKN040 TEMPO 2916/2920 1SM -SHRA BR BKN005',
};

/** A date on the reference day at an hour and minute UTC. */
export const at = (day, hour, minute = 0) => new Date(Date.UTC(2026, 8, day, hour, minute));
