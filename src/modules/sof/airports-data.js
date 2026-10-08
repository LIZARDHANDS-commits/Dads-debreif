// Runways and field elevations for the airports the SOF's 3D view models (Dad, 7 Oct: "model the airport like in the pattern sim ...
// swift regina and saskatoon"; Dad, 8 Oct, for the US bases: "the airfields will be 3D as well?"). One list for every base: each site profile
// (sites/) names which of these its 3D view draws (`airports3d`), and the crosswind check (crosswind.js) reads its runway headings from here.
//
// Source: OurAirports open data (airports.csv and runways.csv, public domain, https://ourairports.com/data/). The Canadian four (CYMJ, CYQR, CYYN,
// CYXE) were downloaded 7 Oct 2026; the US T-6 bases and their usual alternates (plan Step 2c part D) from
// https://davidmegginson.github.io/ourairports-data/runways.csv and airports.csv, read 8 Oct 2026. Each runway's two ends are its thresholds as
// OurAirports gives them (degrees, WGS 84; the US ones rounded to 6 decimals), headings in degrees true as OurAirports lists them, lengths and
// widths in feet. Runways OurAirports marks closed are left out (Vance 13/31, Whiting Field North 09/27 and 18/36, on 8 Oct 2026). Displaced
// thresholds are not shown (OurAirports lists some at the US fields, such as Del Rio 13, 300 ft; the strip is drawn end to end). Check against the
// Canada Flight Supplement or the FAA Chart Supplement before relying on any of it; these are for drawing only, never for planning.
export const AIRPORTS = Object.freeze([
  {
    icao: "CYMJ",
    name: "Moose Jaw Air Vice Marshal C. M. McEwen Airport",
    elevationFt: 1892,
    runways: [
      {
        ends: [
          "03",
          "21"
        ],
        lengthFt: 3400,
        widthFt: 100,
        surface: "ASP",
        a: {
          lat: 50.326099,
          lon: -105.557999,
          elevationFt: 1891,
          headingTrue: 44.0
        },
        b: {
          lat: 50.332802,
          lon: -105.547997,
          elevationFt: 1873,
          headingTrue: 224.0
        }
      },
      {
        ends: [
          "11L",
          "29R"
        ],
        lengthFt: 8326,
        widthFt: 150,
        surface: "ASP",
        a: {
          lat: 50.337898,
          lon: -105.574997,
          elevationFt: 1882,
          headingTrue: 118.5
        },
        b: {
          lat: 50.327,
          lon: -105.542999,
          elevationFt: 1880,
          headingTrue: 298.5
        }
      },
      {
        ends: [
          "11R",
          "29L"
        ],
        lengthFt: 7280,
        widthFt: 150,
        surface: "ASP",
        a: {
          lat: 50.3311,
          lon: -105.573997,
          elevationFt: 1891,
          headingTrue: 118.0
        },
        b: {
          lat: 50.321701,
          lon: -105.545998,
          elevationFt: 1892,
          headingTrue: 298.0
        }
      }
    ]
  },
  {
    icao: "CYQR",
    name: "Regina International Airport",
    elevationFt: 1894,
    runways: [
      {
        ends: [
          "08",
          "26"
        ],
        lengthFt: 6200,
        widthFt: 150,
        surface: "ASP",
        a: {
          lat: 50.428101,
          lon: -104.68,
          elevationFt: 1893,
          headingTrue: 89.0
        },
        b: {
          lat: 50.428299,
          lon: -104.653999,
          elevationFt: 1894,
          headingTrue: 269.0
        }
      },
      {
        ends: [
          "13",
          "31"
        ],
        lengthFt: 7900,
        widthFt: 150,
        surface: "ASP",
        a: {
          lat: 50.439201,
          lon: -104.670998,
          elevationFt: 1894,
          headingTrue: 138.0
        },
        b: {
          lat: 50.423302,
          lon: -104.648003,
          elevationFt: 1894,
          headingTrue: 318.0
        }
      }
    ]
  },
  {
    icao: "CYYN",
    name: "Swift Current Airport",
    elevationFt: 2680,
    runways: [
      {
        ends: [
          "04",
          "22"
        ],
        lengthFt: 2500,
        widthFt: 50,
        surface: "ASP",
        a: {
          lat: 50.288898,
          lon: -107.698997,
          elevationFt: 2680,
          headingTrue: 49.3
        },
        b: {
          lat: 50.293301,
          lon: -107.691002,
          elevationFt: 2661,
          headingTrue: 229.3
        }
      },
      {
        ends: [
          "13",
          "31"
        ],
        lengthFt: 4250,
        widthFt: 150,
        surface: "ASP",
        a: {
          lat: 50.2967,
          lon: -107.695999,
          elevationFt: 2650,
          headingTrue: 136.0
        },
        b: {
          lat: 50.2883,
          lon: -107.682999,
          elevationFt: 2667,
          headingTrue: 316.0
        }
      }
    ]
  },
  {
    icao: "CYXE",
    name: "Saskatoon John G. Diefenbaker International Airport",
    elevationFt: 1653,
    runways: [
      {
        ends: [
          "09",
          "27"
        ],
        lengthFt: 8300,
        widthFt: 200,
        surface: "ASP",
        a: {
          lat: 52.178501,
          lon: -106.718002,
          elevationFt: 1653,
          headingTrue: 101.0
        },
        b: {
          lat: 52.174198,
          lon: -106.681999,
          elevationFt: 1642,
          headingTrue: 281.0
        }
      },
      {
        ends: [
          "15",
          "33"
        ],
        lengthFt: 6200,
        widthFt: 150,
        surface: "ASP",
        a: {
          lat: 52.179199,
          lon: -106.705002,
          elevationFt: 1645,
          headingTrue: 165.0
        },
        b: {
          lat: 52.16294,
          lon: -106.696728,
          elevationFt: 1646,
          headingTrue: 345.0
        }
      }
    ]
  },
  // Laughlin (KDLF) and its usual alternates
  {
    icao: "KDLF", name: "Laughlin Air Force Base", elevationFt: 1082,
    runways: [
      { ends: ["13C", "31C"], lengthFt: 8852, widthFt: 150, surface: "PEM", a: { lat: 29.3675, lon: -100.788002, elevationFt: 1081, headingTrue: 135.4 }, b: { lat: 29.3501, lon: -100.767998, elevationFt: 1067, headingTrue: 315.4 } },
      { ends: ["13L", "31R"], lengthFt: 8316, widthFt: 150, surface: "PEM", a: { lat: 29.3682, lon: -100.783997, elevationFt: 1078, headingTrue: 135.4 }, b: { lat: 29.3519, lon: -100.765999, elevationFt: 1063, headingTrue: 315.4 } },
      { ends: ["13R", "31L"], lengthFt: 6571, widthFt: 150, surface: "ASP", a: { lat: 29.365801, lon: -100.788002, elevationFt: 1076, headingTrue: 135.4 }, b: { lat: 29.3536, lon: -100.775002, elevationFt: 1076, headingTrue: 315.4 } },
    ],
  },
  {
    icao: "KDRT", name: "Del Rio International Airport", elevationFt: 1002,
    runways: [
      { ends: ["13", "31"], lengthFt: 6300, widthFt: 100, surface: "ASP", a: { lat: 29.380899, lon: -100.932999, elevationFt: 1002, headingTrue: 140.2 }, b: { lat: 29.3675, lon: -100.920998, elevationFt: 995, headingTrue: 320.2 } },
    ],
  },
  {
    icao: "KSAT", name: "San Antonio International Airport", elevationFt: 809,
    runways: [
      { ends: ["04", "22"], lengthFt: 8505, widthFt: 150, surface: "CON", a: { lat: 29.523199, lon: -98.469902, elevationFt: 786, headingTrue: 41.0 }, b: { lat: 29.5389, lon: -98.454498, elevationFt: 762, headingTrue: 221.0 } },
      { ends: ["13L", "31R"], lengthFt: 5519, widthFt: 100, surface: "ASP", a: { lat: 29.5403, lon: -98.477699, elevationFt: 797, headingTrue: 132.0 }, b: { lat: 29.530199, lon: -98.464699, elevationFt: 779, headingTrue: 312.0 } },
      { ends: ["13R", "31L"], lengthFt: 8502, widthFt: 150, surface: "CON", a: { lat: 29.5427, lon: -98.485497, elevationFt: 809, headingTrue: 132.0 }, b: { lat: 29.527201, lon: -98.465599, elevationFt: 778, headingTrue: 312.0 } },
    ],
  },
  {
    icao: "KSJT", name: "San Angelo Regional Mathis Field", elevationFt: 1919,
    runways: [
      { ends: ["03", "21"], lengthFt: 5940, widthFt: 150, surface: "ASP", a: { lat: 31.349701, lon: -100.5, elevationFt: 1917, headingTrue: 43.2 }, b: { lat: 31.361601, lon: -100.486999, elevationFt: 1893, headingTrue: 223.2 } },
      { ends: ["09", "27"], lengthFt: 4406, widthFt: 75, surface: "ASP", a: { lat: 31.3612, lon: -100.501999, elevationFt: 1903, headingTrue: 97.5 }, b: { lat: 31.359699, lon: -100.487999, elevationFt: 1899, headingTrue: 277.5 } },
      { ends: ["18", "36"], lengthFt: 8054, widthFt: 150, surface: "ASP", a: { lat: 31.368799, lon: -100.498001, elevationFt: 1899, headingTrue: 187.3 }, b: { lat: 31.3468, lon: -100.501, elevationFt: 1919, headingTrue: 7.3 } },
    ],
  },
  {
    icao: "KABI", name: "Abilene Regional Airport", elevationFt: 1791,
    runways: [
      { ends: ["04", "22"], lengthFt: 3678, widthFt: 100, surface: "ASP", a: { lat: 32.419601, lon: -99.694801, elevationFt: 1751, headingTrue: 52.0 }, b: { lat: 32.4258, lon: -99.685402, elevationFt: 1762, headingTrue: 232.0 } },
      { ends: ["17L", "35R"], lengthFt: 7198, widthFt: 150, surface: "ASP", a: { lat: 32.408501, lon: -99.674797, elevationFt: 1791, headingTrue: 180.0 }, b: { lat: 32.388699, lon: -99.674698, elevationFt: 1775, headingTrue: 360.0 } },
      { ends: ["17R", "35L"], lengthFt: 7208, widthFt: 150, surface: "ASP", a: { lat: 32.428101, lon: -99.684898, elevationFt: 1757, headingTrue: 180.0 }, b: { lat: 32.408298, lon: -99.684799, elevationFt: 1785, headingTrue: 360.0 } },
    ],
  },
  {
    icao: "KLRD", name: "Laredo International Airport", elevationFt: 508,
    runways: [
      { ends: ["14", "32"], lengthFt: 5927, widthFt: 150, surface: "CON", a: { lat: 27.5495, lon: -99.466698, elevationFt: 505, headingTrue: 147.0 }, b: { lat: 27.5357, lon: -99.456802, elevationFt: 467, headingTrue: 327.0 } },
      { ends: ["18L", "36R"], lengthFt: 8236, widthFt: 150, surface: "CON", a: { lat: 27.5564, lon: -99.459297, elevationFt: 499, headingTrue: 183.0 }, b: { lat: 27.533701, lon: -99.460503, elevationFt: 475, headingTrue: 3.0 } },
      { ends: ["18R", "36L"], lengthFt: 8743, widthFt: 150, surface: "ASP", a: { lat: 27.554001, lon: -99.462502, elevationFt: 504, headingTrue: 183.0 }, b: { lat: 27.532499, lon: -99.4636, elevationFt: 484, headingTrue: 3.0 } },
    ],
  },
  // Vance (KEND)
  {
    icao: "KEND", name: "Vance Air Force Base", elevationFt: 1307,
    runways: [
      { ends: ["17C", "35C"], lengthFt: 9217, widthFt: 150, surface: "PEM", a: { lat: 36.355499, lon: -97.914597, elevationFt: 1276, headingTrue: 180.0 }, b: { lat: 36.330299, lon: -97.914703, elevationFt: 1293, headingTrue: 360.0 } },
      { ends: ["17L", "35R"], lengthFt: 5024, widthFt: 150, surface: "CON", a: { lat: 36.347, lon: -97.911003, elevationFt: 1273, headingTrue: 180.0 }, b: { lat: 36.333099, lon: -97.911003, elevationFt: 1284, headingTrue: 360.0 } },
      { ends: ["17R", "35L"], lengthFt: 9217, widthFt: 150, surface: "PEM", a: { lat: 36.349201, lon: -97.923203, elevationFt: 1275, headingTrue: 180.0 }, b: { lat: 36.323898, lon: -97.923203, elevationFt: 1307, headingTrue: 360.0 } },
    ],
  },
  {
    icao: "KWDG", name: "Enid Woodring Regional Airport", elevationFt: 1167,
    runways: [
      { ends: ["13", "31"], lengthFt: 3150, widthFt: 75, surface: "ASPH-P", a: { lat: 36.381599, lon: -97.788696, elevationFt: 1158, headingTrue: 135.0 }, b: { lat: 36.375301, lon: -97.781097, elevationFt: 1158, headingTrue: 315.0 } },
      { ends: ["17", "35"], lengthFt: 8613, widthFt: 100, surface: "ASP", a: { lat: 36.387199, lon: -97.7911, elevationFt: 1166, headingTrue: 180.0 }, b: { lat: 36.369701, lon: -97.7911, elevationFt: 1145, headingTrue: 360.0 } },
    ],
  },
  {
    icao: "KOKC", name: "OKC Will Rogers World Airport", elevationFt: 1295,
    runways: [
      { ends: ["13", "31"], lengthFt: 7800, widthFt: 150, surface: "PEM", a: { lat: 35.404598, lon: -97.615898, elevationFt: 1279, headingTrue: 135.1 }, b: { lat: 35.3894, lon: -97.597397, elevationFt: 1286, headingTrue: 315.1 } },
      { ends: ["17L", "35R"], lengthFt: 9802, widthFt: 150, surface: "CON", a: { lat: 35.405201, lon: -97.588898, elevationFt: 1286, headingTrue: 180.0 }, b: { lat: 35.378201, lon: -97.588898, elevationFt: 1283, headingTrue: 360.0 } },
      { ends: ["17R", "35L"], lengthFt: 9801, widthFt: 150, surface: "CON", a: { lat: 35.405899, lon: -97.605698, elevationFt: 1282, headingTrue: 180.0 }, b: { lat: 35.379002, lon: -97.605698, elevationFt: 1263, headingTrue: 360.0 } },
      { ends: ["18", "36"], lengthFt: 3079, widthFt: 75, surface: "ASP", a: { lat: 35.393501, lon: -97.607697, elevationFt: 1275, headingTrue: 180.0 }, b: { lat: 35.385399, lon: -97.607697, elevationFt: 1271, headingTrue: 360.0 } },
    ],
  },
  // Randolph (KRND); San Antonio (KSAT) is with Laughlin's
  {
    icao: "KRND", name: "Randolph Air Force Base", elevationFt: 761,
    runways: [
      { ends: ["15L", "33R"], lengthFt: 8351, widthFt: 200, surface: "CON", a: { lat: 29.54275, lon: -98.275962, elevationFt: 743, headingTrue: 150.0 }, b: { lat: 29.522858, lon: -98.262845, elevationFt: 723, headingTrue: 330.0 } },
      { ends: ["15R", "33L"], lengthFt: 8352, widthFt: 200, surface: "PEM", a: { lat: 29.534952, lon: -98.293222, elevationFt: 762, headingTrue: 150.0 }, b: { lat: 29.515058, lon: -98.280104, elevationFt: 738, headingTrue: 330.0 } },
    ],
  },
  {
    icao: "KSKF", name: "Lackland Air Force Base", elevationFt: 691,
    runways: [
      { ends: ["16", "34"], lengthFt: 11550, widthFt: 300, surface: "CON", a: { lat: 29.3993, lon: -98.5867, elevationFt: 690, headingTrue: 162.0 }, b: { lat: 29.369101, lon: -98.5756, elevationFt: 660, headingTrue: 342.0 } },
    ],
  },
  // Columbus (KCBM)
  {
    icao: "KCBM", name: "Columbus Air Force Base", elevationFt: 219,
    runways: [
      { ends: ["13C", "31C"], lengthFt: 12004, widthFt: 300, surface: "PEM", a: { lat: 33.655399, lon: -88.460899, elevationFt: 195, headingTrue: 134.0 }, b: { lat: 33.6325, lon: -88.432503, elevationFt: 214, headingTrue: 314.0 } },
      { ends: ["13L", "31R"], lengthFt: 8001, widthFt: 150, surface: "PEM", a: { lat: 33.655399, lon: -88.451401, elevationFt: 194, headingTrue: 135.0 }, b: { lat: 33.639801, lon: -88.432503, elevationFt: 219, headingTrue: 315.0 } },
      { ends: ["13R", "31L"], lengthFt: 6320, widthFt: 175, surface: "CON", a: { lat: 33.6507, lon: -88.459801, elevationFt: 192, headingTrue: 134.0 }, b: { lat: 33.639, lon: -88.445297, elevationFt: 207, headingTrue: 314.0 } },
    ],
  },
  {
    icao: "KGTR", name: "Golden Triangle Regional Airport", elevationFt: 264,
    runways: [
      { ends: ["18", "36"], lengthFt: 8003, widthFt: 150, surface: "ASP", a: { lat: 33.459301, lon: -88.591301, elevationFt: 260, headingTrue: 180.0 }, b: { lat: 33.441399, lon: -88.591499, elevationFt: 256, headingTrue: 360.0 } },
    ],
  },
  {
    icao: "KBHM", name: "Birmingham-Shuttlesworth International Airport", elevationFt: 650,
    runways: [
      { ends: ["06", "24"], lengthFt: 12007, widthFt: 150, surface: "ASP", a: { lat: 33.554798, lon: -86.771599, elevationFt: 603, headingTrue: 55.0 }, b: { lat: 33.5704, lon: -86.744499, elevationFt: 621, headingTrue: 235.0 } },
      { ends: ["18", "36"], lengthFt: 7099, widthFt: 150, surface: "ASP", a: { lat: 33.5732, lon: -86.7472, elevationFt: 644, headingTrue: 180.0 }, b: { lat: 33.553699, lon: -86.7472, elevationFt: 633, headingTrue: 360.0 } },
    ],
  },
  // Sheppard (KSPS)
  {
    icao: "KSPS", name: "Wichita Falls Municipal Airport / Sheppard Air Force Base", elevationFt: 1019,
    runways: [
      { ends: ["15C", "33C"], lengthFt: 10003, widthFt: 150, surface: "PEM", a: { lat: 34.006302, lon: -98.497101, elevationFt: 1002, headingTrue: 158.3 }, b: { lat: 33.980701, lon: -98.484901, elevationFt: 989, headingTrue: 338.3 } },
      { ends: ["15L", "33R"], lengthFt: 6000, widthFt: 150, surface: "PEM", a: { lat: 34.0112, lon: -98.493301, elevationFt: 1019, headingTrue: 158.3 }, b: { lat: 33.995899, lon: -98.485901, elevationFt: 999, headingTrue: 338.3 } },
      { ends: ["15R", "33L"], lengthFt: 13100, widthFt: 300, surface: "CON", a: { lat: 34.003899, lon: -98.499496, elevationFt: 1000, headingTrue: 158.3 }, b: { lat: 33.970299, lon: -98.483498, elevationFt: 998, headingTrue: 338.3 } },
      { ends: ["17", "35"], lengthFt: 7021, widthFt: 150, surface: "ASP", a: { lat: 33.982399, lon: -98.495796, elevationFt: 1001, headingTrue: 180.5 }, b: { lat: 33.9631, lon: -98.496002, elevationFt: 1014, headingTrue: 0.5 } },
    ],
  },
  {
    icao: "KLAW", name: "Lawton Fort Sill Regional Airport", elevationFt: 1110,
    runways: [
      { ends: ["17", "35"], lengthFt: 8599, widthFt: 150, surface: "CON", a: { lat: 34.578602, lon: -98.417198, elevationFt: 1110, headingTrue: 176.9 }, b: { lat: 34.555, lon: -98.415604, elevationFt: 1070, headingTrue: 356.9 } },
    ],
  },
  {
    icao: "KDFW", name: "Dallas Fort Worth International Airport", elevationFt: 607,
    runways: [
      { ends: ["13L", "31R"], lengthFt: 9000, widthFt: 200, surface: "CON", a: { lat: 32.912601, lon: -97.0215, elevationFt: 550, headingTrue: 135.3 }, b: { lat: 32.895, lon: -97.000801, elevationFt: 508, headingTrue: 315.3 } },
      { ends: ["13R", "31L"], lengthFt: 9300, widthFt: 150, surface: "CON", a: { lat: 32.909599, lon: -97.083099, elevationFt: 591, headingTrue: 139.0 }, b: { lat: 32.890301, lon: -97.063301, elevationFt: 577, headingTrue: 319.0 } },
      { ends: ["17C", "35C"], lengthFt: 13400, widthFt: 150, surface: "CON", a: { lat: 32.915699, lon: -97.026001, elevationFt: 562, headingTrue: 180.3 }, b: { lat: 32.878899, lon: -97.026199, elevationFt: 562, headingTrue: 0.3 } },
      { ends: ["17L", "35R"], lengthFt: 8500, widthFt: 150, surface: "CON", a: { lat: 32.8983, lon: -97.009804, elevationFt: 524, headingTrue: 180.3 }, b: { lat: 32.875, lon: -97.009903, elevationFt: 575, headingTrue: 0.3 } },
      { ends: ["17R", "35L"], lengthFt: 13400, widthFt: 200, surface: "CON", a: { lat: 32.915699, lon: -97.0299, elevationFt: 567, headingTrue: 180.3 }, b: { lat: 32.878899, lon: -97.030098, elevationFt: 563, headingTrue: 0.3 } },
      { ends: ["18L", "36R"], lengthFt: 13401, widthFt: 200, surface: "CON", a: { lat: 32.915798, lon: -97.050697, elevationFt: 602, headingTrue: 180.2 }, b: { lat: 32.879002, lon: -97.050903, elevationFt: 575, headingTrue: 0.2 } },
      { ends: ["18R", "36L"], lengthFt: 13400, widthFt: 150, surface: "CON", a: { lat: 32.915798, lon: -97.054604, elevationFt: 607, headingTrue: 180.3 }, b: { lat: 32.879002, lon: -97.054802, elevationFt: 582, headingTrue: 0.3 } },
    ],
  },
  // Whiting Field (KNSE)
  {
    icao: "KNSE", name: "Whiting Field Naval Air Station - North", elevationFt: 199,
    runways: [
      { ends: ["05", "23"], lengthFt: 6003, widthFt: 200, surface: "ASP", a: { lat: 30.7153, lon: -87.032997, elevationFt: 170, headingTrue: 47.0 }, b: { lat: 30.7265, lon: -87.018997, elevationFt: 183, headingTrue: 227.0 } },
      { ends: ["14", "32"], lengthFt: 6001, widthFt: 200, surface: "ASP", a: { lat: 30.7302, lon: -87.028397, elevationFt: 199, headingTrue: 137.0 }, b: { lat: 30.718201, lon: -87.015404, elevationFt: 160, headingTrue: 317.0 } },
    ],
  },
  {
    icao: "KNPA", name: "Naval Air Station Pensacola Forrest Sherman Field", elevationFt: 28,
    runways: [
      { ends: ["01", "19"], lengthFt: 7136, widthFt: 200, surface: "ASP", a: { lat: 30.341999, lon: -87.321602, elevationFt: 28, headingTrue: 6.0 }, b: { lat: 30.3615, lon: -87.319099, elevationFt: 16, headingTrue: 186.0 } },
      { ends: ["07L", "25R"], lengthFt: 8001, widthFt: 200, surface: "ASP", a: { lat: 30.3508, lon: -87.329102, elevationFt: 23, headingTrue: 68.0 }, b: { lat: 30.3589, lon: -87.305496, elevationFt: 16, headingTrue: 248.0 } },
      { ends: ["07R", "25L"], lengthFt: 8000, widthFt: 200, surface: "ASP", a: { lat: 30.349001, lon: -87.3283, elevationFt: 24, headingTrue: 68.0 }, b: { lat: 30.3571, lon: -87.304703, elevationFt: 15, headingTrue: 248.0 } },
    ],
  },
  {
    icao: "KPNS", name: "Pensacola International Airport", elevationFt: 121,
    runways: [
      { ends: ["08", "26"], lengthFt: 7000, widthFt: 150, surface: "ASP", a: { lat: 30.4713, lon: -87.1959, elevationFt: 97, headingTrue: 78.0 }, b: { lat: 30.4753, lon: -87.174202, elevationFt: 114, headingTrue: 258.0 } },
      { ends: ["17", "35"], lengthFt: 7004, widthFt: 150, surface: "ASP", a: { lat: 30.482901, lon: -87.190697, elevationFt: 121, headingTrue: 167.0 }, b: { lat: 30.4641, lon: -87.185699, elevationFt: 103, headingTrue: 347.0 } },
    ],
  },
  // Corpus Christi (KNGP)
  {
    icao: "KNGP", name: "Naval Air Station Corpus Christi Truax Field", elevationFt: 18,
    runways: [
      { ends: ["04", "22"], lengthFt: 5001, widthFt: 200, surface: "ASP", a: { lat: 27.6901, lon: -97.297401, elevationFt: 17, headingTrue: 45.0 }, b: { lat: 27.6998, lon: -97.286499, elevationFt: 13, headingTrue: 225.0 } },
      { ends: ["13L", "31R"], lengthFt: 5002, widthFt: 220, surface: "ASP", a: { lat: 27.695299, lon: -97.292198, elevationFt: 13, headingTrue: 135.0 }, b: { lat: 27.6856, lon: -97.281303, elevationFt: 18, headingTrue: 315.0 } },
      { ends: ["13R", "31L"], lengthFt: 8001, widthFt: 200, surface: "PEM", a: { lat: 27.700701, lon: -97.301598, elevationFt: 9, headingTrue: 135.0 }, b: { lat: 27.6852, lon: -97.284103, elevationFt: 17, headingTrue: 315.0 } },
      { ends: ["17", "35"], lengthFt: 5003, widthFt: 200, surface: "ASP", a: { lat: 27.6992, lon: -97.288498, elevationFt: 13, headingTrue: 180.0 }, b: { lat: 27.685499, lon: -97.288498, elevationFt: 16, headingTrue: 360.0 } },
    ],
  },
  {
    icao: "KCRP", name: "Corpus Christi International Airport", elevationFt: 44,
    runways: [
      { ends: ["13", "31"], lengthFt: 7510, widthFt: 150, surface: "ASP", a: { lat: 27.777, lon: -97.513397, elevationFt: 43, headingTrue: 135.8 }, b: { lat: 27.762199, lon: -97.4972, elevationFt: 40, headingTrue: 315.8 } },
      { ends: ["17", "35"], lengthFt: 6080, widthFt: 150, surface: "ASP", a: { lat: 27.7796, lon: -97.4963, elevationFt: 40, headingTrue: 179.1 }, b: { lat: 27.762899, lon: -97.496002, elevationFt: 39, headingTrue: 359.1 } },
    ],
  },
  {
    icao: "KNQI", name: "Kingsville Naval Air Station", elevationFt: 50,
    runways: [
      { ends: ["13L", "31R"], lengthFt: 8000, widthFt: 198, surface: "PEM", a: { lat: 27.513901, lon: -97.8153, elevationFt: 48, headingTrue: 134.4 }, b: { lat: 27.4986, lon: -97.7976, elevationFt: 37, headingTrue: 314.4 } },
      { ends: ["13R", "31L"], lengthFt: 8000, widthFt: 198, surface: "PEM", a: { lat: 27.5126, lon: -97.816803, elevationFt: 50, headingTrue: 134.4 }, b: { lat: 27.4972, lon: -97.799103, elevationFt: 42, headingTrue: 314.4 } },
      { ends: ["17L", "35R"], lengthFt: 8000, widthFt: 197, surface: "PEM", a: { lat: 27.5144, lon: -97.808502, elevationFt: 48, headingTrue: 179.4 }, b: { lat: 27.492399, lon: -97.808197, elevationFt: 47, headingTrue: 359.4 } },
      { ends: ["17R", "35L"], lengthFt: 8000, widthFt: 198, surface: "PEM", a: { lat: 27.5144, lon: -97.8106, elevationFt: 48, headingTrue: 179.4 }, b: { lat: 27.492399, lon: -97.810402, elevationFt: 48, headingTrue: 359.4 } },
    ],
  },
]);

/** The ICAOs of every airport above. */
export const AIRPORT_IDS = Object.freeze(AIRPORTS.map((a) => a.icao));

/**
 * The airports a site profile's 3D view draws (its `airports3d`, a list of ICAOs), in that order; one not in AIRPORTS is skipped. With no list
 * (null or undefined, the generic profile) every airport here is offered, and the 3D view keeps the ones inside its square, as before.
 */
export function airportsFor(icaos) {
  if (!Array.isArray(icaos)) return AIRPORTS;
  return icaos.map((icao) => AIRPORTS.find((a) => a.icao === icao)).filter(Boolean);
}
