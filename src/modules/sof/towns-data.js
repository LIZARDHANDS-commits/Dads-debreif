// The towns the SOF's 3D view draws as schematic blocks (SPEC-sof, "3D view"; Dad, 7 Oct: "Moose Jaw, Regina, Swift Current and Saskatoon modelled as schematic town blocks").
// Drawn for orientation only: the blocks are not real buildings and the view says so (towns3d.js, the Towns key).
//
// Sources and honesty about them (AGENTS.md: a number names its source, an estimate says it is one):
// - lat and lon: each town's centre as a well-known coordinate (the city centre / downtown, to about a kilometre), APPROXIMATE, FOR DRAWING. Not from a manual, a survey or a
//   Flight Supplement, and never to be used to navigate. They can be checked against the Esri imagery the view already shows under them.
// - builtUpNm: an ESTIMATE of the radius, in NM, of a circle that covers the town's built-up area (taken from the town's rough area, about 40 km2 at Swift Current, 60 km2 at
//   Moose Jaw, 180 km2 at Regina and 230 km2 at Saskatoon; not measured). It only sets how far out the blocks run.
// - downtownFt: an ESTIMATE of the tallest block's height in feet before the height scale (the biggest downtown towers are a few hundred feet; these are rounded down).
export const TOWNS = Object.freeze([
  Object.freeze({ id: 'moose-jaw', name: 'Moose Jaw', lat: 50.3933, lon: -105.535, builtUpNm: 2.4, downtownFt: 120 }),
  Object.freeze({ id: 'regina', name: 'Regina', lat: 50.4452, lon: -104.6189, builtUpNm: 4.1, downtownFt: 300 }),
  Object.freeze({ id: 'swift-current', name: 'Swift Current', lat: 50.2881, lon: -107.7939, builtUpNm: 1.9, downtownFt: 90 }),
  Object.freeze({ id: 'saskatoon', name: 'Saskatoon', lat: 52.1332, lon: -106.67, builtUpNm: 4.5, downtownFt: 300 }),
]);
