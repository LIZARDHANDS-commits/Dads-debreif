// Text for the Airfields panel, kept apart from the page so it can be unit-tested.

const FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

/** Statute miles the way minima are written: 1.5 → "1½", 0.75 → "¾", 2.4 → "2.4". */
export function formatSm(sm) {
  const whole = Math.floor(sm);
  const part = FRACTIONS[Math.round((sm - whole) * 100) / 100];
  if (sm === whole) return String(whole);
  if (part) return whole ? `${whole}${part}` : part;
  return String(Math.round(sm * 100) / 100);
}

export const formatPair = ({ ceilingFt, visSm }) => `${ceilingFt}-${formatSm(visSm)}`;

/** "CYQR 600-2 (or 700-1½, 800-1)", "CYYN 600-2, not checked". */
export function formatMinimaLine(icao, { minima, minimaChecked }) {
  const [first, ...rest] = minima;
  let text = `${icao} ${formatPair(first)}`;
  if (rest.length) text += ` (or ${rest.map(formatPair).join(', ')})`;
  if (!minimaChecked) text += ', not checked';
  return text;
}

/** Minutes ahead of UTC as "UTC−6", "UTC+5:30", "UTC". */
export function formatOffset(minutes) {
  if (!minutes) return 'UTC';
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  const mins = abs % 60;
  return `UTC${sign}${Math.floor(abs / 60)}${mins ? `:${String(mins).padStart(2, '0')}` : ''}`;
}

export const formatNm = (nm) => (nm === null ? 'unknown' : `${Math.round(nm)} NM`);
