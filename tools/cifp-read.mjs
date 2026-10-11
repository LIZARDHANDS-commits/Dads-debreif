// The FAA CIFP's (ARINC 424-18, FAACIFP18) field readers, shared by the tools that read it: tools/cifp-approaches.mjs (the SOF's approaches)
// and tools/cifp-runways.mjs (the shared runway thresholds). Column positions are 1-based, as ARINC 424 numbers them. Every reader checks
// its field and gives null for one it can't read: the file is untrusted text. No side effects; nothing here reads a file.
export const col = (line, a, b) => line.slice(a - 1, b);
export const trim = (s) => s.trim();
export const round = (v, d = 5) => Math.round(v * 10 ** d) / 10 ** d;

/** "N29352103" / "W098324338" (hemisphere, degrees, minutes, seconds and hundredths) to decimal degrees, or null. */
export function latOf(s) {
  const m = /^([NS])(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (!m) return null;
  const v = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 100 / 3600;
  return v <= 90 ? (m[1] === 'S' ? -v : v) : null;
}
export function lonOf(s) {
  const m = /^([EW])(\d{3})(\d{2})(\d{4})$/.exec(s);
  if (!m) return null;
  const v = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 100 / 3600;
  return v <= 180 ? (m[1] === 'W' ? -v : v) : null;
}
/** The position starting at column `a` (latitude 9 characters, then longitude 10) as [lat, lon] rounded to `decimals` (5, about a metre), or null. */
export const posOf = (line, a, decimals = 5) => {
  const lat = latOf(col(line, a, a + 8));
  const lon = lonOf(col(line, a + 9, a + 18));
  return lat === null || lon === null ? null : [round(lat, decimals), round(lon, decimals)];
};
/** A signed variation such as "E0040" (degrees and tenths East) or "W0030": degrees East, West negative; null if blank or unreadable. */
export function varOf(s) {
  const m = /^([EWT])(\d{4})$/.exec(s);
  if (!m || m[1] === 'T') return null;
  const v = Number(m[2]) / 10;
  return m[1] === 'W' ? -v : v;
}
/** An altitude field: "04000" feet, "FL180" a flight level (read as feet), blank null. */
export function altOf(s) {
  const t = trim(s);
  if (!t) return null;
  if (/^FL\d{3}$/.test(t)) return Number(t.slice(2)) * 100;
  if (/^-?\d{1,5}$/.test(t)) return Number(t);
  return null;
}
/** A course in tenths of a degree ("1276" = 127.6° magnetic; "128T" style true courses end in T): { deg, true } or null. */
export function courseOf(s) {
  const t = trim(s);
  if (/^\d{4}$/.test(t)) return { deg: Number(t) / 10, isTrue: false };
  if (/^\d{3}T$/.test(t)) return { deg: Number(t.slice(0, 3)), isTrue: true };
  return null;
}
export const wrap360 = (d) => ((d % 360) + 360) % 360;/** The cycle and its effective date from the HDR04 line ("VOLUME 2610 EFFECTIVE 01 OCT 2026"): { cycle: '2610', effective: '2026-10-01' }, or null. */
export function cycleOf(line) {
  const m = /VOLUME\s+(\d{4})\s+EFFECTIVE\s+(\d{2})\s+([A-Z]{3})\s+(\d{4})/.exec(line);
  if (!m) return null;
  const month = 'JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC'.indexOf(m[3]) / 3 + 1;
  return { cycle: m[1], effective: `${m[4]}-${String(month).padStart(2, '0')}-${m[2]}` };
}
