// Marked report words (SPEC-sof, "Airfield cards" and "Caution banner"). wx says where in
// a report's text the words behind each limit or caution are (`span: { start, end }`,
// character offsets into the trimmed text, `reasonSpans` parallel to `reasons`). This turns
// that into plain and marked pieces of the text for the cards and the banner to draw.
//
// Pure, and safe by construction: the report text is only ever cut with slice() into
// strings, the level of a piece is one of three fixed words, and nothing here builds
// HTML or a style. The views put each piece in as a text node.

/** What each level says in words. The views put these beside the colour, so a mark never depends on colour alone. */
export const LEVEL_WORDS = Object.freeze({
  below: 'below limits: ',
  'at-limit': 'at the limit: ',
  caution: 'caution: ',
});

// Where marks overlap, the worse level shows.
const RANK = { below: 0, 'at-limit': 1, caution: 2 };
const isLevel = (level) => typeof level === 'string' && Object.hasOwn(LEVEL_WORDS, level);

// Far more than a report has words; a hostile list can't make the sweep slow.
const MAX_MARKS = 200;

/** One mark checked and clamped to [0, length], or null. Reading a hostile object never throws. */
function cleanMark(mark, length) {
  try {
    if (mark === null || typeof mark !== 'object') return null;
    const { start, end, level } = mark;
    if (!Number.isInteger(start) || !Number.isInteger(end) || !isLevel(level)) return null;
    const from = Math.max(0, start);
    const to = Math.min(length, end);
    return from < to ? { start: from, end: to, level } : null;
  } catch {
    return null;
  }
}

/**
 * Cuts `raw` into `[{ text, level }]`: `level` is 'below', 'at-limit' or 'caution' for a marked
 * piece, null for plain text. Pieces are in order, none is empty, and their texts joined are `raw`.
 * `marks` is `[{ start, end, level }]`; overlapping ones merge, the worse level winning the shared
 * characters; touching ones of one level become one piece; positions are clamped to the text; null,
 * empty, reversed, non-integer and unknown-level marks are ignored.
 * @param {any} raw
 * @param {any} marks
 * @returns {Array<{ text: string, level: 'below' | 'at-limit' | 'caution' | null }>}
 */
export function segments(raw, marks) {
  if (typeof raw !== 'string' || raw === '') return [];
  const list = (Array.isArray(marks) ? marks.slice(0, MAX_MARKS) : []).map((m) => cleanMark(m, raw.length)).filter(Boolean);
  const cuts = [...new Set([0, raw.length, ...list.flatMap((m) => [m.start, m.end])])].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const [from, to] = [cuts[i], cuts[i + 1]];
    let level = null;
    for (const m of list) {
      if (m.start <= from && m.end >= to && (level === null || RANK[m.level] < RANK[level])) level = m.level;
    }
    const text = raw.slice(from, to);
    const last = out[out.length - 1];
    if (last && last.level === level) last.text += text;
    else out.push({ text, level });
  }
  return out;
}

/** Only the marked pieces of `segments(raw, marks)`, in order: the words that triggered, for the banner. */
export function markedWords(raw, marks) {
  return segments(raw, marks).filter((s) => s.level !== null);
}

// wx's reasons: the limit lines start CEILING or VIS; the at-limit ones say AT LIMIT; the rest are cautions.
const levelOfReason = (reason) => (/^(CEILING|VIS) /.test(reason) ? (/ AT LIMIT /.test(reason) ? 'at-limit' : 'below') : 'caution');

/**
 * The marks behind one wx check (or one TAF piece, which has the same `reasons` and `reasonSpans`):
 * `[{ start, end, level }]`, each reason's words in that reason's level. A reason with no positions
 * gives none, so a report wx could not place words in is shown unmarked, never wrongly marked.
 */
export function marksOfCheck(check) {
  const { reasons, reasonSpans } = check ?? {};
  if (!Array.isArray(reasons) || !Array.isArray(reasonSpans)) return [];
  const out = [];
  reasons.forEach((reason, i) => {
    const spans = reasonSpans[i];
    if (typeof reason !== 'string' || !Array.isArray(spans)) return;
    const level = levelOfReason(reason);
    for (const span of spans) {
      const start = span?.start;
      const end = span?.end;
      if (Number.isInteger(start) && Number.isInteger(end)) out.push({ start, end, level });
    }
  });
  return out;
}

/**
 * Moves marks from wx's text (`parsed`, trimmed) onto the text that is shown (`shown`), which may have
 * spaces around it. When the shown text does not contain wx's text there is nothing to align to and no
 * mark is kept: a mark on the wrong word is worse than none.
 */
export function alignMarks(marks, shown, parsed) {
  if (typeof shown !== 'string' || typeof parsed !== 'string' || parsed === '' || !Array.isArray(marks)) return [];
  const base = parsed.trim();
  const shift = shown === base ? 0 : base ? shown.indexOf(base) : -1;
  if (shift < 0) return [];
  return marks.map((m) => ({ ...m, start: m.start + shift, end: m.end + shift }));
}
