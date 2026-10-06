// The one TAF line on a short airfield card (SOF-38): the group of the forecast that matters most, or "no changes".
// Pure: the card's TAF line (cards.js `taf`: its state, trimmed text and wx's marks on that text) goes in, plain words
// and marks come out. It reads no weather itself: which words matter is wx's own marking (marks.js), and this only
// cuts the TAF's text into its groups (FM, BECMG, TEMPO, PROB) to show the one the worst mark sits in.

/** Beside the words of the level, worst first: below the limits, then at the limit, then a caution. */
const RANK = { below: 0, 'at-limit': 1, caution: 2 };

// Where a change group begins: FM161500, BECMG, TEMPO (with its PROB30 or PROB40 in front), or a PROB group alone.
const GROUP_START = /(?:^|\s)((?:PROB\d{2}\s+)?(?:TEMPO|BECMG)|PROB\d{2}|FM\d{6})(?=\s|$)/g;
// The period the base forecast covers ("2918/3006"): it begins just after the TAF's header words.
const VALID = /(?:^|\s)(\d{4}\/\d{4})(?=\s|$)/;
const REMARKS = /(?:^|\s)RMK(?=\s|$)/;

/**
 * Where each group of `raw` begins and ends: `[{ start, end }]`, the base forecast first. The remarks and the closing "="
 * are left out. A text with no recognisable period gives one group, all of it.
 */
export function tafGroups(raw) {
  const text = typeof raw === 'string' ? raw : '';
  const remarks = text.search(REMARKS);
  const end = remarks >= 0 ? remarks : text.trimEnd().replace(/=$/, '').length;
  const valid = VALID.exec(text);
  const first = valid ? valid.index + valid[0].indexOf(valid[1]) : 0;
  const starts = [first];
  for (const m of text.matchAll(GROUP_START)) {
    const at = m.index + m[0].indexOf(m[1]);
    if (at > first && at < end) starts.push(at);
  }
  return starts.map((start, i) => ({ start, end: i + 1 < starts.length ? starts[i + 1] : end }));
}

/**
 * The card's TAF line in one line: `{ text, marks, tone }`. `taf` is cards.js's TAF line.
 * - A missing, cancelled, NIL or stale TAF says so in its own words, with no marks (tone 'bad').
 * - Otherwise the group holding the worst mark, with its words marked (tone 'warn'), and "no changes" when nothing is marked (tone 'ok').
 * `marks` are `[{ start, end, level }]` on `text`.
 */
export function tafHeadline(taf) {
  if (!taf) return { text: 'no TAF', marks: [], tone: 'bad' };
  if (taf.state !== 'fresh') return { text: taf.staleText ?? taf.words ?? 'no TAF', marks: [], tone: 'bad' };
  const raw = typeof taf.raw === 'string' ? taf.raw : '';
  const marks = (Array.isArray(taf.marks) ? taf.marks : []).filter((m) => Number.isInteger(m?.start) && Number.isInteger(m?.end) && m.level in RANK);
  if (!marks.length) return { text: 'no changes', marks: [], tone: 'ok' };
  const worst = marks.reduce((a, b) => (RANK[b.level] < RANK[a.level] || (RANK[b.level] === RANK[a.level] && b.start < a.start) ? b : a));
  const group = tafGroups(raw).reverse().find((g) => g.start <= worst.start) ?? { start: 0, end: raw.length };
  const body = raw.slice(group.start, group.end);
  const text = body.trimEnd();
  const kept = marks
    .map((m) => ({ ...m, start: Math.max(m.start, group.start) - group.start, end: Math.min(m.end, group.start + text.length) - group.start }))
    .filter((m) => m.start < m.end);
  return { text, marks: kept, tone: 'warn' };
}
