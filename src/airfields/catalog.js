// The airfields the app knows without being told: V6's 15 (sof.html line 563),
// with V6's names and positions, plus each one's time zone. Only CYMJ's field
// elevation is in V6 (shell.html line 737); the rest are unknown, not guessed.

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
});

// V6's WX SETUP defaults (sof.html line 180).
export const DEFAULT_HOME = 'CYMJ';
export const DEFAULT_ALTERNATES = Object.freeze(['CYQR', 'CYYN', 'CYXE']);
