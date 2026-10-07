// Runways and field elevations for the airports the SOF's 3D view models (Dad, 7 Oct: "model the airport like in the pattern sim ...
// swift regina and saskatoon"). Source: OurAirports open data (airports.csv and runways.csv, public domain,
// https://ourairports.com/data/), downloaded 7 Oct 2026. Each runway's two ends are its thresholds as OurAirports gives them (degrees,
// WGS 84), headings in degrees true, lengths and widths in feet. Check against the Canada Flight Supplement before relying on any of it;
// these are for drawing only, never for planning. Displaced thresholds are not shown (none listed for these fields).
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
  }
]);
