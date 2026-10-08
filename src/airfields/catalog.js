// The airfields the app knows without being told: V6's 15 (sof.html line 563),
// with V6's names and positions, plus each one's time zone. Only CYMJ's field
// elevation is in V6 (shell.html line 737); the rest of V6's are unknown, not guessed.
// Then the US T-6 bases and their alternates, from OurAirports (below).

const field = (name, lat, lon, timeZone, elevationFt = null) => Object.freeze({ name, lat, lon, timeZone, elevationFt });

export const CATALOG = Object.freeze({
  CYMJ: field('Moose Jaw', 50.3303, -105.559, 'America/Regina', 1892),
  CYQR: field('Regina', 50.4319, -104.6658, 'America/Regina'),
  CYYN: field('Swift Current', 50.2919, -107.6906, 'America/Swift_Current'),
  CYXE: field('Saskatoon', 52.1708, -106.6997, 'America/Regina'),
  CYQV: field('Yorkton', 51.2647, -102.4617, 'America/Regina'),
  KGGW: field('Glasgow', 48.2125, -106.6147, 'America/Denver'),
  KISN: field('Williston', 48.1779, -103.6423, 'America/Chicago'),
  CYPA: field('Prince Albert', 53.2142, -105.6728, 'America/Regina'),
  CYQW: field('North Battleford', 52.7692, -108.2436, 'America/Regina'),
  KMIB: field('Minot AFB', 48.4156, -101.3577, 'America/Chicago'),
  CYXH: field('Medicine Hat', 50.0189, -110.7208, 'America/Edmonton'),
  KMOT: field('Minot Intl', 48.2577, -101.278, 'America/Chicago'),
  CYBR: field('Brandon', 49.91, -99.9519, 'America/Winnipeg'),
  CYQL: field('Lethbridge', 49.6303, -112.7997, 'America/Edmonton'),
  KGTF: field('Great Falls', 47.482, -111.3707, 'America/Denver'),
  // The seven US T-6 bases and their usual alternates (SOF plan Step 2c, part B; Dad, 7 Oct 2026). Name shortened from, and position and field
  // elevation from, OurAirports' airports.csv (public domain), read 8 Oct 2026; positions rounded to 4 decimals. Time zone from each field's
  // location: all are in Central time with daylight saving (Texas east of the Mountain-time strip, Oklahoma, Mississippi, Alabama, and the
  // Florida panhandle west of the Apalachicola River).
  KDLF: field('Laughlin AFB', 29.3595, -100.778, 'America/Chicago', 1082),
  KEND: field('Vance AFB', 36.3392, -97.9165, 'America/Chicago', 1307),
  KRND: field('Randolph (JBSA)', 29.5297, -98.2789, 'America/Chicago', 761),
  KCBM: field('Columbus AFB', 33.6438, -88.4438, 'America/Chicago', 219),
  KSPS: field('Sheppard AFB', 33.9888, -98.4919, 'America/Chicago', 1019),
  KNSE: field('NAS Whiting Field North', 30.7242, -87.0219, 'America/Chicago', 199),
  KNGP: field('NAS Corpus Christi', 27.6926, -97.2911, 'America/Chicago', 18),
  KDRT: field('Del Rio', 29.3742, -100.927, 'America/Chicago', 1002),
  KSAT: field('San Antonio', 29.5337, -98.4698, 'America/Chicago', 809),
  KSJT: field('San Angelo', 31.3577, -100.496, 'America/Chicago', 1919),
  KABI: field('Abilene', 32.4113, -99.6819, 'America/Chicago', 1791),
  KLRD: field('Laredo', 27.5438, -99.4616, 'America/Chicago', 508),
  KWDG: field('Enid Woodring', 36.3792, -97.7911, 'America/Chicago', 1167),
  KOKC: field('Oklahoma City', 35.3934, -97.5982, 'America/Chicago', 1295),
  KSKF: field('Lackland (JBSA)', 29.3842, -98.5811, 'America/Chicago', 691),
  KGTR: field('Golden Triangle', 33.4503, -88.5914, 'America/Chicago', 264),
  KBHM: field('Birmingham', 33.5629, -86.7507, 'America/Chicago', 650),
  KLAW: field('Lawton', 34.5677, -98.4166, 'America/Chicago', 1110),
  KDFW: field('Dallas Fort Worth', 32.8968, -97.038, 'America/Chicago', 607),
  KNPA: field('NAS Pensacola', 30.3527, -87.3186, 'America/Chicago', 28),
  KPNS: field('Pensacola', 30.4727, -87.1866, 'America/Chicago', 121),
  KCRP: field('Corpus Christi', 27.7704, -97.5012, 'America/Chicago', 44),
  KNQI: field('NAS Kingsville', 27.5072, -97.8097, 'America/Chicago', 50),
});

// V6's WX SETUP defaults (sof.html line 180).
export const DEFAULT_HOME = 'CYMJ';
export const DEFAULT_ALTERNATES = Object.freeze(['CYQR', 'CYYN', 'CYXE']);
