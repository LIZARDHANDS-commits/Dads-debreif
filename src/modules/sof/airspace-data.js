// The airspace the 3D view (view3d.js, SOF-39 phase 3) draws round Moose Jaw: the Moose Jaw MTCA and control zone, the Regina, Swift
// Current and Saskatoon terminal and control airspace, and the training and restricted areas (S-304, S-305, S-307, R303, S311, S-130,
// S-315, S-316). Empty for now: every entry needs its floor, ceiling and outline from a source (NAV CANADA's Designated Airspace
// Handbook, DAH), written in with the page, and an estimate is labelled as one. Never copy numbers from V6 (AGENTS.md).
//
// One entry, exactly this shape (lat and lon in degrees, points as [lat, lon]; the view skips an entry that fails `checkAirspace` in
// airspace-model.js and names it in its key, so a bad entry is never drawn wrong):
//
//   { id: 'CYR303', name: 'CYR303 Dundurn' , kind: 'restricted' | 'advisory' | 'terminal' | 'control-zone' | 'mtca' | 'other', classLetter: 'C' | 'D' | 'E' | 'F' | null, floor: { ft: number, ref: 'SFC' | 'AGL' | 'ASL' | 'FL' }, ceiling: { ft: number, ref: 'AGL' | 'ASL' | 'FL' | 'UNL' }, shape: { type: 'polygon', points: [[lat, lon], ...] } | { type: 'circle', centre: [lat, lon], radiusNm: number }, source: 'DAH p. N' }
//
// - FL: ft is the flight level times 100 (FL180 is 18000). It is drawn as feet above sea level, an approximation (pressure altitude is
//   taken as altitude here).
// - SFC: the ground at the home field's elevation; the floor's ft is ignored (give 0).
// - AGL: the home field's elevation plus ft (ground taken as flat prairie, an estimate); labelled so in the view's key.
// - UNL: the ceiling's ft is ignored; the top is drawn at the view's top, 60,000 ft.
// - A polygon needs at least 3 points; a repeated closing point is fine. Every entry needs a `source`, a page of the DAH or another
//   named reference, and an `id` used once.
export const AIRSPACE = Object.freeze([]);
