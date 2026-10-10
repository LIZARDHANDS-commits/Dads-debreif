// Written by tools/cifp-runways.mjs: do not edit by hand (run the tool again). The shared runway list's best runway ends (DB-26), laid over
// OurAirports' by airports-data.js; a runway not here stays OurAirports' (approximate, for drawing only).
// - CYMJ: Patrick's measured points, the Traffic sim's (src/modules/traffic/airfield.js, TR-67: measured on Esri's true-scale photo, about
//   ±10 to 15 ft), turned from map feet into latitude and longitude about the field origin 50.3303 N 105.5592 W
//   (src/modules/traffic/data/moose-jaw.json "anchor") with core/geo.js localFtToLatLon. Patrick's own 29L number-base point comes back within 6 ft.
//   The same numbers are in the Traffic sim's map feet: two places until Patrick merges them (docs/PLAN.md waiting list). No elevations.
// - US fields: FAA CIFP cycle 2610 (effective 2026-10-01), runway records (PG): each end's pavement end (a displaced landing
//   threshold moved back along the runway by its displaced distance, the landing threshold kept as thresholdLat/thresholdLon), the landing
//   threshold's elevation (ft), the displaced distance (ft) and the magnetic bearing; the runway's length and width (ft). WGS 84 degrees.
// For drawing only: never for planning or navigation.
export const RUNWAY_ENDS_SOURCES = Object.freeze({
  patrick: Object.freeze({ words: "Patrick's measured points (Traffic airfield.js, TR-67)", accuracyFt: 15 }),
  'faa-cifp': Object.freeze({ words: 'FAA CIFP cycle 2610 (surveyed thresholds)', cycle: '2610', effective: '2026-10-01', accuracyFt: 3 }),
  ourairports: Object.freeze({ words: 'OurAirports (approximate)', accuracyFt: null }),
});
export const RUNWAY_ENDS = Object.freeze({
  CYMJ: Object.freeze({ source: 'patrick', runways: Object.freeze({
    '03/21': {"a":{"lat":50.32678,"lon":-105.558964},"b":{"lat":50.332847,"lon":-105.549861},"widthFt":100},
    '11L/29R': {"a":{"lat":50.33789,"lon":-105.574779},"b":{"lat":50.327041,"lon":-105.543647},"widthFt":150},
    '11R/29L': {"a":{"lat":50.332191,"lon":-105.574538},"b":{"lat":50.322691,"lon":-105.547194},"widthFt":150},
  }) }),
  KDLF: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '13C/31C': {"a":{"lat":29.36745,"lon":-100.787911,"elevationFt":1081,"displacedFt":0,"bearingMag":128.4},"b":{"lat":29.350108,"lon":-100.768411,"elevationFt":1067,"displacedFt":0,"bearingMag":308.4},"lengthFt":8852,"widthFt":150},
    '13L/31R': {"a":{"lat":29.368219,"lon":-100.784369,"elevationFt":1078,"displacedFt":0,"bearingMag":128.4},"b":{"lat":29.351928,"lon":-100.766053,"elevationFt":1063,"displacedFt":0,"bearingMag":308.4},"lengthFt":8316,"widthFt":150},
    '13R/31L': {"a":{"lat":29.365814,"lon":-100.788272,"elevationFt":1076,"displacedFt":0,"bearingMag":128.4},"b":{"lat":29.35294,"lon":-100.773799,"elevationFt":1077,"displacedFt":330,"bearingMag":308.4,"thresholdLat":29.353586,"thresholdLon":-100.774525},"lengthFt":6571,"widthFt":150},
  }) }),
  KDRT: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '13/31': {"a":{"lat":29.380864,"lon":-100.933482,"elevationFt":1002,"displacedFt":300,"bearingMag":132,"thresholdLat":29.380231,"thresholdLon":-100.932881},"b":{"lat":29.36755,"lon":-100.920831,"elevationFt":995,"displacedFt":0,"bearingMag":312},"lengthFt":6300,"widthFt":100},
  }) }),
  KSAT: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '04/22': {"a":{"lat":29.523233,"lon":-98.469906,"elevationFt":786,"displacedFt":0,"bearingMag":37},"b":{"lat":29.540942,"lon":-98.452436,"elevationFt":755,"displacedFt":0,"bearingMag":217},"lengthFt":8505,"widthFt":150},
    '13L/31R': {"a":{"lat":29.5403,"lon":-98.477697,"elevationFt":797,"displacedFt":0,"bearingMag":128},"b":{"lat":29.530217,"lon":-98.464728,"elevationFt":779,"displacedFt":0,"bearingMag":308},"lengthFt":5519,"widthFt":100},
    '13R/31L': {"a":{"lat":29.542747,"lon":-98.485542,"elevationFt":809,"displacedFt":0,"bearingMag":128},"b":{"lat":29.527222,"lon":-98.465553,"elevationFt":779,"displacedFt":0,"bearingMag":308},"lengthFt":8502,"widthFt":150},
  }) }),
  KSJT: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '03/21': {"a":{"lat":31.349703,"lon":-100.499867,"elevationFt":1916,"displacedFt":0,"bearingMag":38},"b":{"lat":31.361614,"lon":-100.486856,"elevationFt":1893,"displacedFt":0,"bearingMag":218},"lengthFt":5940,"widthFt":150},
    '09/27': {"a":{"lat":31.361242,"lon":-100.502061,"elevationFt":1902,"displacedFt":0,"bearingMag":92},"b":{"lat":31.359664,"lon":-100.488067,"elevationFt":1898,"displacedFt":0,"bearingMag":272},"lengthFt":4406,"widthFt":75},
    '18/36': {"a":{"lat":31.36878,"lon":-100.497511,"elevationFt":1899,"displacedFt":902,"bearingMag":182,"thresholdLat":31.366328,"thresholdLon":-100.497878},"b":{"lat":31.346831,"lon":-100.500794,"elevationFt":1919,"displacedFt":0,"bearingMag":2},"lengthFt":8054,"widthFt":150},
  }) }),
  KABI: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '17L/35R': {"a":{"lat":32.408531,"lon":-99.674781,"elevationFt":1791,"displacedFt":0,"bearingMag":175},"b":{"lat":32.388747,"lon":-99.674683,"elevationFt":1776,"displacedFt":0,"bearingMag":355},"lengthFt":7198,"widthFt":150},
    '17R/35L': {"a":{"lat":32.428083,"lon":-99.684919,"elevationFt":1758,"displacedFt":0,"bearingMag":175},"b":{"lat":32.408272,"lon":-99.684822,"elevationFt":1786,"displacedFt":0,"bearingMag":355},"lengthFt":7208,"widthFt":150},
  }) }),
  KLRD: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '14/32': {"a":{"lat":27.54945,"lon":-99.466728,"elevationFt":505,"displacedFt":0,"bearingMag":142},"b":{"lat":27.535733,"lon":-99.456853,"elevationFt":467,"displacedFt":0,"bearingMag":322},"lengthFt":5927,"widthFt":150},
    '18L/36R': {"a":{"lat":27.556369,"lon":-99.459333,"elevationFt":499,"displacedFt":0,"bearingMag":178},"b":{"lat":27.533736,"lon":-99.460469,"elevationFt":474,"displacedFt":0,"bearingMag":358},"lengthFt":8236,"widthFt":150},
    '18R/36L': {"a":{"lat":27.556492,"lon":-99.462419,"elevationFt":504,"displacedFt":0,"bearingMag":178},"b":{"lat":27.532469,"lon":-99.463625,"elevationFt":485,"displacedFt":120,"bearingMag":358,"thresholdLat":27.532797,"thresholdLon":-99.463608},"lengthFt":8743,"widthFt":150},
  }) }),
  KMAF: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '04/22': {"a":{"lat":31.931703,"lon":-102.20375,"elevationFt":2851,"displacedFt":0,"bearingMag":45},"b":{"lat":31.939203,"lon":-102.191794,"elevationFt":2855,"displacedFt":0,"bearingMag":225},"lengthFt":4605,"widthFt":75},
    '10/28': {"a":{"lat":31.947644,"lon":-102.21635,"elevationFt":2869,"displacedFt":0,"bearingMag":105},"b":{"lat":31.938514,"lon":-102.191825,"elevationFt":2855,"displacedFt":691,"bearingMag":285,"thresholdLat":31.939275,"thresholdLon":-102.193869},"lengthFt":8302,"widthFt":150},
    '16L/34R': {"a":{"lat":31.946236,"lon":-102.197461,"elevationFt":2865,"displacedFt":0,"bearingMag":168},"b":{"lat":31.934581,"lon":-102.196783,"elevationFt":2848,"displacedFt":0,"bearingMag":348},"lengthFt":4247,"widthFt":100},
    '16R/34L': {"a":{"lat":31.959406,"lon":-102.205517,"elevationFt":2872,"displacedFt":0,"bearingMag":166},"b":{"lat":31.933389,"lon":-102.202869,"elevationFt":2851,"displacedFt":0,"bearingMag":346},"lengthFt":9501,"widthFt":150},
  }) }),
  KEND: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '17C/35C': {"a":{"lat":36.355553,"lon":-97.914661,"elevationFt":1277,"displacedFt":0,"bearingMag":175},"b":{"lat":36.330236,"lon":-97.914678,"elevationFt":1294,"displacedFt":0,"bearingMag":355},"lengthFt":9217,"widthFt":150},
    '17L/35R': {"a":{"lat":36.346956,"lon":-97.911017,"elevationFt":1273,"displacedFt":0,"bearingMag":175},"b":{"lat":36.333156,"lon":-97.911025,"elevationFt":1284,"displacedFt":0,"bearingMag":355},"lengthFt":5024,"widthFt":150},
    '17R/35L': {"a":{"lat":36.349239,"lon":-97.923192,"elevationFt":1275,"displacedFt":0,"bearingMag":175},"b":{"lat":36.323922,"lon":-97.923206,"elevationFt":1307,"displacedFt":0,"bearingMag":355},"lengthFt":9217,"widthFt":150},
  }) }),
  KWDG: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '13/31': {"a":{"lat":36.381648,"lon":-97.788672,"elevationFt":1158,"displacedFt":112,"bearingMag":130,"thresholdLat":36.381431,"thresholdLon":-97.788403},"b":{"lat":36.375531,"lon":-97.7811,"elevationFt":1158,"displacedFt":0,"bearingMag":310},"lengthFt":3150,"widthFt":75},
    '17/35': {"a":{"lat":36.386817,"lon":-97.791077,"elevationFt":1165,"displacedFt":611,"bearingMag":175,"thresholdLat":36.385142,"thresholdLon":-97.791078},"b":{"lat":36.363161,"lon":-97.791086,"elevationFt":1137,"displacedFt":0,"bearingMag":355},"lengthFt":8613,"widthFt":100},
  }) }),
  KOKC: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '13/31': {"a":{"lat":35.404608,"lon":-97.615908,"elevationFt":1279,"displacedFt":0,"bearingMag":131},"b":{"lat":35.389439,"lon":-97.597428,"elevationFt":1286,"displacedFt":0,"bearingMag":311},"lengthFt":7800,"widthFt":150},
    '17L/35R': {"a":{"lat":35.405156,"lon":-97.588947,"elevationFt":1287,"displacedFt":0,"bearingMag":176},"b":{"lat":35.378231,"lon":-97.588925,"elevationFt":1283,"displacedFt":0,"bearingMag":356},"lengthFt":9802,"widthFt":150},
    '17R/35L': {"a":{"lat":35.40595,"lon":-97.605728,"elevationFt":1282,"displacedFt":0,"bearingMag":176},"b":{"lat":35.379025,"lon":-97.6057,"elevationFt":1264,"displacedFt":0,"bearingMag":356},"lengthFt":9801,"widthFt":150},
    '18/36': {"a":{"lat":35.393544,"lon":-97.607728,"elevationFt":1275,"displacedFt":0,"bearingMag":176},"b":{"lat":35.385086,"lon":-97.607719,"elevationFt":1271,"displacedFt":0,"bearingMag":356},"lengthFt":3079,"widthFt":75},
  }) }),
  KRND: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '15L/33R': {"a":{"lat":29.542753,"lon":-98.275958,"elevationFt":742,"displacedFt":0,"bearingMag":145},"b":{"lat":29.522858,"lon":-98.262844,"elevationFt":723,"displacedFt":0,"bearingMag":325},"lengthFt":8351,"widthFt":200},
    '15R/33L': {"a":{"lat":29.534956,"lon":-98.293219,"elevationFt":761,"displacedFt":0,"bearingMag":145},"b":{"lat":29.515076,"lon":-98.280109,"elevationFt":737,"displacedFt":3702,"bearingMag":325,"thresholdLat":29.523878,"thresholdLon":-98.285914},"lengthFt":8352,"widthFt":200},
  }) }),
  KSKF: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '16/34': {"a":{"lat":29.39935,"lon":-98.586675,"elevationFt":690,"displacedFt":0,"bearingMag":158},"b":{"lat":29.369117,"lon":-98.575558,"elevationFt":660,"displacedFt":0,"bearingMag":338},"lengthFt":11550,"widthFt":150},
  }) }),
  KCBM: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '13C/31C': {"a":{"lat":33.655286,"lon":-88.458389,"elevationFt":193,"displacedFt":0,"bearingMag":135},"b":{"lat":33.631961,"lon":-88.4305,"elevationFt":213,"displacedFt":0,"bearingMag":315},"lengthFt":12004,"widthFt":300},
    '13L/31R': {"a":{"lat":33.655372,"lon":-88.451753,"elevationFt":192,"displacedFt":0,"bearingMag":135},"b":{"lat":33.639828,"lon":-88.433161,"elevationFt":216,"displacedFt":0,"bearingMag":315},"lengthFt":8001,"widthFt":150},
    '13R/31L': {"a":{"lat":33.651175,"lon":-88.460442,"elevationFt":190,"displacedFt":0,"bearingMag":135},"b":{"lat":33.638894,"lon":-88.445758,"elevationFt":204,"displacedFt":0,"bearingMag":315},"lengthFt":6320,"widthFt":175},
  }) }),
  KGTR: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '18/36': {"a":{"lat":33.459264,"lon":-88.591283,"elevationFt":261,"displacedFt":0,"bearingMag":182},"b":{"lat":33.437272,"lon":-88.5915,"elevationFt":253,"displacedFt":0,"bearingMag":2},"lengthFt":8003,"widthFt":150},
  }) }),
  KBHM: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '06/24': {"a":{"lat":33.554781,"lon":-86.771569,"elevationFt":603,"displacedFt":0,"bearingMag":58},"b":{"lat":33.573481,"lon":-86.739097,"elevationFt":640,"displacedFt":1205,"bearingMag":238,"thresholdLat":33.571603,"thresholdLon":-86.742358},"lengthFt":12007,"widthFt":150},
    '18/36': {"a":{"lat":33.573214,"lon":-86.747189,"elevationFt":644,"displacedFt":0,"bearingMag":183},"b":{"lat":33.553706,"lon":-86.7472,"elevationFt":634,"displacedFt":0,"bearingMag":3},"lengthFt":7099,"widthFt":150},
  }) }),
  KSPS: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '15C/33C': {"a":{"lat":34.006267,"lon":-98.497144,"elevationFt":1003,"displacedFt":0,"bearingMag":153},"b":{"lat":33.980736,"lon":-98.484917,"elevationFt":989,"displacedFt":0,"bearingMag":333},"lengthFt":10003,"widthFt":150},
    '15L/33R': {"a":{"lat":34.011175,"lon":-98.493278,"elevationFt":1019,"displacedFt":0,"bearingMag":153},"b":{"lat":33.995861,"lon":-98.485944,"elevationFt":1000,"displacedFt":0,"bearingMag":333},"lengthFt":6000,"widthFt":150},
    '15R/33L': {"a":{"lat":34.003778,"lon":-98.499503,"elevationFt":998,"displacedFt":0,"bearingMag":153},"b":{"lat":33.970342,"lon":-98.483492,"elevationFt":1000,"displacedFt":0,"bearingMag":333},"lengthFt":13100,"widthFt":300},
  }) }),
  KLAW: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '17/35': {"a":{"lat":34.578553,"lon":-98.417153,"elevationFt":1110,"displacedFt":0,"bearingMag":171},"b":{"lat":34.554961,"lon":-98.415619,"elevationFt":1070,"displacedFt":0,"bearingMag":351},"lengthFt":8599,"widthFt":150},
  }) }),
  KDFW: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '13L/31R': {"a":{"lat":32.912555,"lon":-97.021479,"elevationFt":550,"displacedFt":627,"bearingMag":131,"thresholdLat":32.911331,"thresholdLon":-97.020042},"b":{"lat":32.894981,"lon":-97.000844,"elevationFt":508,"displacedFt":0,"bearingMag":311},"lengthFt":9000,"widthFt":200},
    '13R/31L': {"a":{"lat":32.909575,"lon":-97.083133,"elevationFt":591,"displacedFt":0,"bearingMag":135},"b":{"lat":32.890269,"lon":-97.063278,"elevationFt":577,"displacedFt":0,"bearingMag":315},"lengthFt":9300,"widthFt":150},
    '17C/35C': {"a":{"lat":32.915706,"lon":-97.025975,"elevationFt":562,"displacedFt":0,"bearingMag":176},"b":{"lat":32.878878,"lon":-97.026172,"elevationFt":563,"displacedFt":0,"bearingMag":356},"lengthFt":13400,"widthFt":150},
    '17L/35R': {"a":{"lat":32.898319,"lon":-97.009778,"elevationFt":524,"displacedFt":0,"bearingMag":176},"b":{"lat":32.874958,"lon":-97.009908,"elevationFt":576,"displacedFt":0,"bearingMag":356},"lengthFt":8500,"widthFt":150},
    '17R/35L': {"a":{"lat":32.915722,"lon":-97.029883,"elevationFt":567,"displacedFt":0,"bearingMag":176},"b":{"lat":32.878894,"lon":-97.030081,"elevationFt":563,"displacedFt":0,"bearingMag":356},"lengthFt":13400,"widthFt":200},
    '18L/36R': {"a":{"lat":32.9158,"lon":-97.050736,"elevationFt":602,"displacedFt":0,"bearingMag":176},"b":{"lat":32.878972,"lon":-97.050925,"elevationFt":575,"displacedFt":0,"bearingMag":356},"lengthFt":13401,"widthFt":200},
    '18R/36L': {"a":{"lat":32.915814,"lon":-97.054644,"elevationFt":606,"displacedFt":0,"bearingMag":176},"b":{"lat":32.878986,"lon":-97.054833,"elevationFt":582,"displacedFt":0,"bearingMag":356},"lengthFt":13400,"widthFt":150},
  }) }),
  KNSE: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '05/23': {"a":{"lat":30.715194,"lon":-87.032967,"elevationFt":169,"displacedFt":0,"bearingMag":49},"b":{"lat":30.726428,"lon":-87.018972,"elevationFt":183,"displacedFt":0,"bearingMag":229},"lengthFt":6003,"widthFt":200},
    '14/32': {"a":{"lat":30.730178,"lon":-87.028336,"elevationFt":199,"displacedFt":0,"bearingMag":139},"b":{"lat":30.718089,"lon":-87.015336,"elevationFt":159,"displacedFt":0,"bearingMag":319},"lengthFt":6001,"widthFt":200},
  }) }),
  KNPA: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '01/19': {"a":{"lat":30.342019,"lon":-87.321572,"elevationFt":28,"displacedFt":0,"bearingMag":9.2},"b":{"lat":30.361525,"lon":-87.319117,"elevationFt":16,"displacedFt":0,"bearingMag":189.2},"lengthFt":7136,"widthFt":200},
    '07L/25R': {"a":{"lat":30.350775,"lon":-87.329111,"elevationFt":23,"displacedFt":0,"bearingMag":71.3},"b":{"lat":30.358897,"lon":-87.305536,"elevationFt":16,"displacedFt":0,"bearingMag":251.3},"lengthFt":8001,"widthFt":200},
    '07R/25L': {"a":{"lat":30.348989,"lon":-87.328292,"elevationFt":24,"displacedFt":0,"bearingMag":71.3},"b":{"lat":30.357108,"lon":-87.304717,"elevationFt":15,"displacedFt":0,"bearingMag":251.3},"lengthFt":8000,"widthFt":200},
  }) }),
  KPNS: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '08/26': {"a":{"lat":30.471333,"lon":-87.195939,"elevationFt":97,"displacedFt":0,"bearingMag":80},"b":{"lat":30.475314,"lon":-87.1742,"elevationFt":113,"displacedFt":0,"bearingMag":260},"lengthFt":7000,"widthFt":150},
    '17/35': {"a":{"lat":30.482908,"lon":-87.190656,"elevationFt":121,"displacedFt":0,"bearingMag":169},"b":{"lat":30.464147,"lon":-87.185653,"elevationFt":103,"displacedFt":0,"bearingMag":349},"lengthFt":7004,"widthFt":150},
  }) }),
  KNGP: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '04/22': {"a":{"lat":27.690056,"lon":-97.297442,"elevationFt":17,"displacedFt":0,"bearingMag":42},"b":{"lat":27.699775,"lon":-97.286508,"elevationFt":13,"displacedFt":0,"bearingMag":222},"lengthFt":5001,"widthFt":200},
    '13L/31R': {"a":{"lat":27.695297,"lon":-97.2922,"elevationFt":13,"displacedFt":0,"bearingMag":131},"b":{"lat":27.685572,"lon":-97.281267,"elevationFt":18,"displacedFt":0,"bearingMag":311},"lengthFt":5002,"widthFt":220},
    '13R/31L': {"a":{"lat":27.700736,"lon":-97.301594,"elevationFt":9,"displacedFt":0,"bearingMag":131},"b":{"lat":27.685181,"lon":-97.284106,"elevationFt":17,"displacedFt":0,"bearingMag":311},"lengthFt":8001,"widthFt":200},
  }) }),
  KCRP: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '13/31': {"a":{"lat":27.778975,"lon":-97.51555,"elevationFt":46,"displacedFt":0,"bearingMag":132},"b":{"lat":27.764164,"lon":-97.499364,"elevationFt":42,"displacedFt":0,"bearingMag":312},"lengthFt":7510,"widthFt":150},
  }) }),
  KNQI: Object.freeze({ source: 'faa-cifp', runways: Object.freeze({
    '13L/31R': {"a":{"lat":27.513958,"lon":-97.815242,"elevationFt":48,"displacedFt":0,"bearingMag":130},"b":{"lat":27.498569,"lon":-97.7976,"elevationFt":37,"displacedFt":0,"bearingMag":310},"lengthFt":8000,"widthFt":198},
    '13R/31L': {"a":{"lat":27.512581,"lon":-97.81675,"elevationFt":50,"displacedFt":0,"bearingMag":130},"b":{"lat":27.497192,"lon":-97.799111,"elevationFt":41,"displacedFt":0,"bearingMag":310},"lengthFt":8000,"widthFt":198},
    '17L/35R': {"a":{"lat":27.514467,"lon":-97.808461,"elevationFt":48,"displacedFt":0,"bearingMag":175},"b":{"lat":27.492461,"lon":-97.808189,"elevationFt":47,"displacedFt":0,"bearingMag":355},"lengthFt":8000,"widthFt":197},
    '17R/35L': {"a":{"lat":27.514444,"lon":-97.810619,"elevationFt":48,"displacedFt":0,"bearingMag":175},"b":{"lat":27.492442,"lon":-97.81035,"elevationFt":48,"displacedFt":0,"bearingMag":355},"lengthFt":8000,"widthFt":198},
  }) }),
});
