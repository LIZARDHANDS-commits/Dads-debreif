# SOF radar in 3D: echo tops, heights and tilts (research, 14 Oct 2026)

> **Status:** research only, nothing built. It answers Dad's ask of 14 Oct 2026 (`future.md`, "radar in 3D with real heights"): "I care about intensity, and location, and altitude", best fidelity, a performance mode, and "investigate radar tilt". It waits on Dad's pick (the SOF is his) and, for anything that needs a new library, Patrick's yes (AGENTS.md).
>
> **Labels.** **V**: verified this session (the address fetched or the file decoded). **S**: from a web-search summary only (the page could not be opened from here). **G**: a guess or estimate. Sizes are from one sample (12:00Z, 13 Oct 2026) and grow with the weather.

## The short answer

- **Today the radar gives no height.** Both feeds are flat pictures: ECCC's rain or snow rate at Moose Jaw, NOAA MRMS base reflectivity (the lowest tilt) at the US bases. A 3D block's height is the model cloud's (SOF-56), and like cells are merged into longer blocks only to keep the drawing light (`weather3d-model.js` `mergeShafts`).
- **The best new source, for Moose Jaw and the US alike, is NOAA's MRMS on AWS** (the public bucket `noaa-mrms-pds`): echo tops, reflectivity at 33 heights, about 1 km cells, a file about every 2 minutes, readable straight from a browser (V). Its grid runs to 55° N, so it covers Moose Jaw, and real echoes over Alberta, Saskatchewan and Manitoba were found in it (V); it merges Canadian radars (S). Each file is GRIB2 with PNG packing, which a browser can unpack with its own built-in tools and about 150 lines of our code, no new library (V in a test decoder written in Python; the JavaScript version is G).
- **Radar tilts** (single-radar elevation scans, NEXRAD Level II) are readable from a browser in the US (V) but need a bzip2 decoder, which browsers don't have: a new library (Patrick's yes) or our own decoder (about 300 lines, G). MRMS has already merged every radar's tilts into the height levels, so tilts add a "one radar, raw" view only.
- **ECCC publishes no free echo tops, heights by level or volume scans** (V for GeoMet and the free Datamart; raw volume scans are a paid service, S). Its only height product is a per-radar 1.5 km (rain) or 1.0 km (snow) CAPPI picture, which would need the relay (V).

## Option 1: echo tops (how high the returns reach)

| Source | Address | Format and size | Resolution and timing | From a browser |
|---|---|---|---|---|
| MRMS echo tops on AWS | `https://noaa-mrms-pds.s3.amazonaws.com/CONUS/EchoTop_18_00.50/YYYYMMDD/MRMS_EchoTop_18_00.50_YYYYMMDD-HHMMSS.grib2.gz`; also `EchoTop_30`, `EchoTop_50`, `EchoTop_60` (V) | GRIB2 (PNG-packed), 7000 × 3500 cells; 18 dBZ about 0.8 MB, 30 dBZ about 0.2 MB (V) | 0.01° (about 1 km); a file about every 2 min, in the bucket 1 to 2 min later (V) | Direct (open to any site, V) |
| MRMS echo tops as a picture | NCEP GeoServer WMS (already used by `feeds.js`), layer `conus_neet_v18`, "1km x 1km CONUS Radar Enhanced Echo Tops" (V) | coloured PNG, about 21 KB (V); legend 0 to 70, units not shown (probably thousands of feet, G) | 1 km, about 2 min (V) | Direct (V); heights in colour bands, not exact |
| NEXRAD Level III EET (one radar) | `https://unidata-nexrad-level3.s3.amazonaws.com/<SITE>_EET_<date>` (V) | NIDS binary, about 2 KB (V) | each volume scan, 4 to 10 min (V) | Direct; probably needs bzip2 (G) |
| ECCC | none: GeoMet's radar layers are rain and snow rate and coverage only (V) | | | |

MRMS echo-top values are kilometres above sea level (S; the file says "altitude above mean sea level", V); −1 is no echo, −3 no coverage (V).

**What it shows Dad:** intensity and location as now, plus a **measured top** for every return. The bottom still has to come from somewhere (the ground, or the model cloud's base). A tall storm would stand at its real height, not the model cloud's.

## Option 2: reflectivity at several heights (the 3D mosaic)

| Source | Levels | Size per update | Notes |
|---|---|---|---|
| MRMS `MergedReflectivityQC_HH.HH` on AWS (V) | 33, km above sea level: 0.50 to 3.00 every 0.25; 3.50 to 9.00 every 0.50; 10 to 19 every 1 (V) | all 33: about 19 MB (V, a quiet sample; a stormy day probably 2 to 4 times, G); about 12 chosen levels: about 8 to 10 MB (V sizes) | The whole grid comes down per level. For Moose Jaw only the first quarter of each file is needed (it is stored north to south), so a read can stop early (G). The 0.5 km level is underground at Moose Jaw (577 m field, V). |
| MRMS at set temperatures (0, −5, −10, −15, −20 °C) (V) | 5 | about 1 MB each (V) | Needs the freezing-level height too (9.8 MB, hourly, V): heavy. |
| MRMS composite, lowest altitude, height of the composite maximum, VIL (V) | 1 each | about 0.4 to 1.5 MB (V) | `HeightCompositeReflectivity` is a cheap single "altitude of the strongest echo" (meaning G, not read from its documentation). |
| ECCC CAPPI per radar | 1.5 km rain or 1.0 km snow | `https://dd.weather.gc.ca/today/radar/CAPPI/GIF/<STATION>/...CAPPI_1.5_RAIN.gif`, about 19 KB, every 6 min (V) | A picture with the legend and map lines drawn in, read by colour; no browser access header, so through the relay (V). One height only. |

**What it shows Dad:** all three he asked for. Each cell at each height has its own intensity, so a storm shows as stacked layers: rain shafts low, a strong core, an anvil spreading at the top. This is the closest to "modelled as accurately as possible".

## Option 3: splitting blocks by the model cloud's layers

- **Data:** none new; it's already fetched (Open-Meteo: HRDPS or GEM at Moose Jaw, HRRR or GFS in the US).
- **What it shows:** intensity and location stay correct.
  - Altitude is still only "inside the model cloud": the model's guess, not what the radar saw.
  - It can't show a storm top above the model cloud, a thin echo layer, or rain from cloud the model doesn't have.
  - It's the cheapest step, and the weakest on altitude.

## Radar tilts (elevation scans)

**United States: NEXRAD Level II on AWS.**
- **Address:** `https://unidata-nexrad-level2.s3.amazonaws.com/YYYY/MM/DD/KXXX/KXXXYYYYMMDD_HHMMSS_V06` (V). Open to any site, and partial reads work (V).
- **Size and timing:** 6 to 13 MB per volume (V, nine radars); 50 to 64 MB once unpacked (V). In the bucket 3 to 7 min after the scan starts; a volume every 4 to 9 min (V).
- **What's in it** (V, decoded):
  - each tilt's elevation angle, with 720 radials on the low tilts and 360 above;
  - reflectivity every 250 m along the beam, out to about 458 km;
  - the radar's position and height.
  - A quiet night's volume stopped near 6.5° (no weather aloft); a full volume runs 0.5° to 19.5° in about 4.6 min (S, NWS).
- **Height of a return:** the standard 4/3-earth-radius beam height, h = √(r² + (k·a)² + 2·r·k·a·sin θ) − k·a, with k = 4/3 and a = 6,371 km, plus the antenna height (Doviak and Zrnić, as quoted by the wradlib documentation; S).
  - Worked out here (V, arithmetic), the beam's centre above the antenna:

  | Tilt | 25 NM | 50 NM | 100 NM | 150 NM |
  |---|---|---|---|---|
  | 0.5° | 1,700 ft | 4,300 ft | 11,900 ft | 22,800 ft |
  | 2.4° | 6,800 ft | 14,400 ft | 32,000 ft | 53,000 ft |
  | 6.4° | 17,300 ft | 35,500 ft | 74,300 ft | 116,300 ft |

  - So far from a single radar only high cloud is seen; a 1° beam is about 3 km wide at 100 NM (G). That is why the multi-radar mosaic (Option 2) is better for a 450 NM square.
- **The catch:** each record is bzip2-compressed, and browsers have no bzip2 decoder.
  - The candidates are npm packages, MIT-licensed (V): `nexrad-level-2-data` (its bzip2 is WebAssembly), `seek-bzip`, `bz2`.
  - Any of them is a new library and needs Patrick's yes; the alternative is our own decoder of about 300 lines (G).
  - Not run in a browser yet (G).
- **Level III single tilts** (`unidata-nexrad-level3`, V): the lowest four tilts as separate small files (N0B about 0.3 MB). Same bzip2 issue (G).

**The radar for each US base** (radar positions from their own files, V; distances from `src/airfields/catalog.js`):

| Base | Radar | Distance |
|---|---|---|
| KCBM Columbus | KGWX | 16 NM |
| KDLF Laughlin | KDFX | 27 NM |
| KEND Vance | KVNX | 26 NM |
| KNGP Corpus Christi | KCRP | 13 NM |
| KNSE Whiting Field | KEVX 58 NM, KMOB 63 NM (none close; the lowest tilt is about 5,000 ft up there) | about 60 NM |
| KRND Randolph | KEWX | 17 NM |
| KSJT San Angelo | KSJT | 1 NM |
| KSPS Sheppard | KFDR | 33 NM |

**Canada.**
- **Volume scans:** ECCC's free Datamart radar folder holds only pictures (CAPPI, DPQPE, 24-hour totals; V). Raw volume scans (ODIM HDF5) are a cost-recovered service (S).
- **Radars near Moose Jaw**, with positions from ECCC's radar-zones file (V):

  | Station | Name | Distance |
  |---|---|---|
  | CASBE | Bethune | 20 NM |
  | CASRA | Radisson | 149 NM |
  | CASFW | Foxwarren | 172 NM |
  | CASSU | Schuler | 178 NM |

## Drawing it at full fidelity, and a performance mode

- **Cell counts.** At 1 km, a 450 NM square is about 695,000 cells per level, against today's 9,216 (96 × 96).
  - Measured echo counts in real squares (V, one sample):
    - Upper Midwest: about 80,000 cells at 10 dBZ or more in the composite, 66,000 at 3 km, 7,000 at 8 km.
    - Moose Jaw that hour: 1,527.
  - A big squall line over ten levels could reach half a million to a million cubes (G).
- **Ways to draw it** (three.js, already in the tool; G):
  - **Instanced boxes:** one box per cell per level, already used elsewhere in the repo (V). Fine up to about 50,000 to 150,000; heavy beyond.
  - **Point sprites or flat squares:** the cheapest, good to about a million.
  - **A see-through volume** (a 3D texture ray-marched in a shader): the standard way to show true volume. It gives smooth storms with no blocks at all, and is the best match to "no run-merging", but needs shader work.
  - **One sheet per level:** very cheap, like today's cloud sheets.
- **No merging needed:** either the count is capped by mode, or the volume method draws every cell.
- **A suggested split** (fits the project's `three-performance` High and Performance settings; G):

  | | Performance | High |
  |---|---|---|
  | Data | MRMS composite plus 18 and 30 dBZ echo tops: about 1 to 2.5 MB an update | MRMS 3D at about 12 levels (1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18 km): about 8 to 10 MB an update |
  | Drawing | cells thinned to about 4 km, one shape each from the ground (or model cloud base) to the measured top | every 1 km cell at every level, as a see-through volume or instanced cubes |
  | Decoding | in a background worker so the view stays smooth | same |

## Things any build would need (from the research, to be checked)

- **New host on the SOF's allowed list:** `noaa-mrms-pds.s3.amazonaws.com` (connect-src; `csp-hosts.md`). The existing Terrarium S3 entry may not cover it (G).
- **The 600 and 900 NM squares at Moose Jaw** reach north of MRMS's 55° N edge (the 900 NM square to about 57.8° N, G). There is no MRMS data beyond 55° N; that part would be said on screen.
- **Units:** MRMS is in dBZ, while today's Moose Jaw picture is a rain or snow rate. The colour key and words change (MRMS's precipitation-type product could keep a rain and snow split; G).
- **Stale and failure rules** (SOF safety items): MRMS's 2-minute files fit the existing 20-minute stale limit and 6-minute refresh (D67). Failure behaviour is to be written into the spec before building, as for every SOF feed.

## Recommendation

- **Moose Jaw:**
  - Keep ECCC's rain and snow rate for the flat map and its words.
  - Add MRMS for height: echo tops in Performance mode, the 3D levels in High.
  - Don't plan on ECCC tilts or echo tops; the per-radar CAPPI through the relay is a poor third.
- **US bases:** the same MRMS route.
  - Level II tilts are an optional later extra (a "nearest radar, raw" view). They need Patrick's yes for a bzip2 decoder.
- **Drawing:**
  - Drop the run-merging.
  - Performance: thinned cells with measured tops.
  - High: every cell at every level, as a see-through volume.

## Could not be reached from here

`mrms.ncep.noaa.gov`, `nomads.ncep.noaa.gov`, `nssl.noaa.gov`, `roc.noaa.gov`, `weather.gov`, `api.weather.gc.ca`, ECCC's documentation and licence pages, and the AWS open-data registry pages (facts about them are S). Not tested: any decoder in a browser, real in-browser decode times, the relay's time limits, MRMS quality over Canada beyond finding echoes there.
