// Parse a TAF into dated change groups, and build its timeline: the prevailing
// conditions for every moment of the valid period, plus the TEMPO, PROB and
// BECMG overlays on top of them. Never throws.

import { readConditions, mergeConditions, tokenize, joinSpans } from './conditions.js';
import { resolveDay, resolvePast, toDate, HOUR_MS, DAY_MS } from './dates.js';

const STATION = /^[A-Z][A-Z0-9]{3}$/;
const ISSUE_TIME = /^(\d{2})(\d{2})(\d{2})Z$/;
const PERIOD = /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/;
const FROM = /^FM(\d{2})(\d{2})(\d{2})$/;
const FROM_UNREADABLE = /^FM\d+$/;
const PROB = /^PROB(\d{2})$/;
const MAX_VALID_HOURS = 30;
const CHANGE_KINDS = new Set(['BECMG', 'TEMPO', 'PROB']);

const hhmm = (d) => d.toISOString().slice(8, 16).replace('T', ' ');

/**
 * Parse a TAF. `now` resolves the day-of-month in its issue time; the valid period
 * and groups are resolved from there.
 *
 * Groups: { kind: 'BASE'|'FM'|'BECMG'|'TEMPO'|'PROB', probability, tempo, from, to, conditions, raw }.
 * A PROB group followed by TEMPO has kind 'PROB' and tempo true. A group whose
 * time can't be read keeps null times. Anything that makes the forecast less than
 * fully readable is listed in `problems`.
 * @param {string} raw
 * @param {{ now?: Date }} [options]
 */
export function parseTaf(raw, { now } = {}) {
  now = now ?? new Date();
  // Spans are offsets into taf.raw (the trimmed text), which the screen shows.
  const { tokens, spans, remarks } = tokenize(String(raw ?? '').trim());
  const taf = {
    raw: String(raw ?? '').trim(),
    station: null,
    issued: null,
    validFrom: null,
    validTo: null,
    amendment: null,
    cancelled: false,
    nil: false,
    groups: [],
    remarks,
    unread: [],
    problems: [],
  };
  let i = 0;
  // Some feeds repeat the header ("TAF AMD TAF AMD CYMJ ..."); read it once.
  while (['TAF', 'AMD', 'COR', 'RTD'].includes(tokens[i])) {
    if (tokens[i] !== 'TAF') taf.amendment = tokens[i];
    i++;
  }
  if (tokens[i] && STATION.test(tokens[i])) taf.station = tokens[i++];
  const it = tokens[i]?.match(ISSUE_TIME);
  if (it) {
    taf.issued = resolvePast(Number(it[1]), Number(it[2]), Number(it[3]), now);
    i++;
  }
  const vp = tokens[i]?.match(PERIOD);
  if (vp) {
    taf.validFrom = resolveDay(Number(vp[1]), Number(vp[2]), 0, taf.issued || now);
    taf.validTo = taf.validFrom && resolveDay(Number(vp[3]), Number(vp[4]), 0, taf.validFrom, +taf.validFrom + 1);
    if (!taf.validFrom || !taf.validTo) taf.problems.push(`Valid period ${tokens[i]} could not be read`);
    else if (+taf.validTo <= +taf.validFrom || +taf.validTo - +taf.validFrom > MAX_VALID_HOURS * HOUR_MS
      || (taf.issued && Math.abs(+taf.validFrom - +taf.issued) > DAY_MS)) {
      taf.problems.push(`Valid period ${tokens[i]} is not plausible`);
    }
    i++;
  }
  if (tokens[i] === 'NIL') { taf.nil = true; i++; }
  if (tokens[i] === 'CNL') { taf.cancelled = true; i++; }

  // Split the rest into groups by their keywords. Group times resolve to the date
  // nearest the valid period, so a group starting just before it stays in its month.
  const ref = taf.validFrom || now;
  const pieces = [{ kind: 'BASE', probability: null, tempo: false, from: taf.validFrom, to: null, tokens: [], idx: [], head: [], at: i }];
  // `at` is the index of the group's first word, `idx` those of its condition words.
  const start = (g) => { pieces.push({ tokens: [], idx: [], at: i, ...g }); };
  const undated = (kind, head) => {
    taf.problems.push(`${head.join(' ')} has no time that can be read`);
    start({ kind, probability: null, tempo: kind === 'TEMPO', from: null, to: null, head });
  };
  const periodAt = (k) => tokens[k]?.match(PERIOD);
  const period = (m) => {
    const from = resolveDay(Number(m[1]), Number(m[2]), 0, ref);
    const to = from && resolveDay(Number(m[3]), Number(m[4]), 0, from, +from + 1);
    return { from, to };
  };
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    let m;
    if ((m = t.match(FROM))) {
      const from = resolveDay(Number(m[1]), Number(m[2]), Number(m[3]), ref);
      if (from) start({ kind: 'FM', probability: null, tempo: false, from, to: null, head: [t] });
      else undated('FM', [t]);
    } else if (FROM_UNREADABLE.test(t)) {
      undated('FM', [t]);
    } else if (t === 'BECMG' || t === 'TEMPO') {
      if ((m = periodAt(i + 1))) {
        start({ kind: t, probability: null, tempo: t === 'TEMPO', ...period(m), head: [t, tokens[i + 1]] });
        i++;
      } else undated(t, [t]);
    } else if ((m = t.match(PROB))) {
      const tempo = tokens[i + 1] === 'TEMPO';
      const head = tokens.slice(i, i + (tempo ? 3 : 2));
      const pm = periodAt(i + (tempo ? 2 : 1));
      if (pm) {
        start({ kind: 'PROB', probability: Number(m[1]), tempo, ...period(pm), head });
        i += tempo ? 2 : 1;
      } else {
        undated('PROB', tempo ? [t, 'TEMPO'] : [t]);
        pieces.at(-1).probability = Number(m[1]);
        if (tempo) i++;
      }
    } else {
      pieces.at(-1).tokens.push(t);
      pieces.at(-1).idx.push(i);
    }
  }

  // BASE and FM run until the next FM in time order (or the end of the TAF).
  const fms = pieces.filter((p) => (p.kind === 'BASE' || p.kind === 'FM') && p.from);
  const inOrder = [...fms].sort((a, b) => +a.from - +b.from);
  if (inOrder.some((p, k) => p !== fms[k])) taf.problems.push('FM groups are not in time order');
  inOrder.forEach((p, k) => { p.to = inOrder[k + 1]?.from ?? taf.validTo; });

  for (const p of pieces) {
    const read = readConditions(p.tokens, p.idx.map((k) => spans[k]));
    const words = [...spans.slice(p.at, p.at + p.head.length), ...p.idx.map((k) => spans[k])];
    taf.unread.push(...read.unread);
    if (p.kind !== 'BASE' && p.from && taf.validTo && (+p.from >= +taf.validTo || (p.to && +p.to <= +taf.validFrom))) {
      taf.problems.push(`${p.head.join(' ')} is outside the valid period ${hhmm(taf.validFrom)}Z to ${hhmm(taf.validTo)}Z`);
    } else if (CHANGE_KINDS.has(p.kind) && p.from && p.to && taf.validFrom && taf.validTo
      && (+p.to <= +p.from || +p.to - +p.from > +taf.validTo - +taf.validFrom || +p.to > +taf.validTo)) {
      // A period that ends before it starts (TEMPO 2920/2916) usually resolves a month
      // on, caught as longer than the TAF; when next month has no such day it resolves
      // before its start, caught by the first test.
      taf.problems.push(`${p.head.join(' ')} is not a plausible period for this TAF`);
    }
    taf.groups.push({
      kind: p.kind,
      probability: p.probability,
      tempo: p.tempo,
      from: p.from,
      to: p.to,
      conditions: read.conditions,
      raw: [...p.head, ...p.tokens].join(' '),
      span: joinSpans(words),
    });
  }
  if (taf.unread.length) taf.problems.push(`Could not read: ${taf.unread.join(' ')}`);
  return taf;
}

/**
 * The TAF's timeline.
 * prevailing: [{ from, to, conditions, group }] covering the valid period without gaps.
 * overlays: [{ kind, probability, tempo, from, to, conditions, group }] for BECMG change
 * periods and TEMPO/PROB groups, each merged with the prevailing conditions it sits on.
 * `group` is the index into taf.groups the piece came from. FM and BECMG groups are
 * applied in time order.
 */
export function tafTimeline(taf) {
  let prevailing = [];
  let overlays = [];
  if (!taf?.validFrom || !taf?.validTo) return { validFrom: null, validTo: null, prevailing, overlays };
  const clip = (t) => new Date(Math.min(Math.max(+t, +taf.validFrom), +taf.validTo));
  const addPrevailing = (from, to, conditions, group) => {
    const a = clip(from);
    const b = clip(to);
    if (+b > +a) prevailing.push({ from: a, to: b, conditions, group });
  };
  // An FM starts a complete new forecast: nothing earlier runs past it.
  const endAt = (list, t) => list
    .map((p) => (+p.to > +t ? { ...p, to: new Date(Math.max(+p.from, +t)) } : p))
    .filter((p) => +p.to > +p.from);

  let current = taf.groups[0]?.conditions;
  let currentGroup = 0;
  let cursor = taf.validFrom;
  const changes = taf.groups
    .map((g, index) => ({ g, index }))
    .filter(({ g, index }) => index > 0 && g.from && g.to);
  const temporary = changes.filter(({ g }) => g.kind === 'TEMPO' || g.kind === 'PROB');
  const lasting = changes.filter(({ g }) => g.kind === 'FM' || g.kind === 'BECMG').sort((a, b) => +a.g.from - +b.g.from);

  for (const { g, index } of lasting) {
    if (g.kind === 'FM') {
      addPrevailing(cursor, g.from, current, currentGroup);
      prevailing = endAt(prevailing, g.from);
      overlays = endAt(overlays, g.from);
      current = g.conditions;
      currentGroup = index;
      cursor = g.from;
    } else {
      // BECMG: old conditions prevail until the change period ends; either may occur during it.
      const after = mergeConditions(current, g.conditions);
      addPrevailing(cursor, g.to, current, currentGroup);
      const a = clip(g.from);
      const b = clip(g.to);
      if (+b > +a) overlays.push({ kind: 'BECMG', probability: null, tempo: false, from: a, to: b, conditions: after, group: index });
      current = after;
      currentGroup = index;
      cursor = new Date(Math.max(+cursor, +g.to));
    }
  }
  addPrevailing(cursor, taf.validTo, current, currentGroup);

  // TEMPO and PROB: split wherever the prevailing conditions under them change.
  for (const { g, index } of temporary) {
    for (const p of prevailing) {
      const a = Math.max(+g.from, +p.from);
      const b = Math.min(+g.to, +p.to);
      if (b <= a) continue;
      overlays.push({
        kind: g.kind,
        probability: g.probability,
        tempo: g.tempo,
        from: new Date(a),
        to: new Date(b),
        conditions: mergeConditions(p.conditions, g.conditions),
        group: index,
      });
    }
  }
  overlays.sort((x, y) => +x.from - +y.from);
  return { validFrom: taf.validFrom, validTo: taf.validTo, prevailing, overlays };
}

/**
 * A time or window as { from, to } Dates, or null if it can't be read. `when` is a
 * Date, a date string, or { from, to } of either.
 */
export function toWindow(when) {
  if (when != null && typeof when === 'object' && !(when instanceof Date)) {
    const from = toDate(when.from);
    const to = toDate(when.to);
    return from && to && +to >= +from ? { from, to } : null;
  }
  const t = toDate(when);
  return t ? { from: t, to: t } : null;
}

/**
 * True when a piece [from, to) touches the window. A point in time (from == to)
 * counts both ends of the piece, so an ETA exactly where one period ends and the
 * next begins is checked against both: the safer answer.
 */
export function touches(piece, window) {
  const f = +window.from;
  const t = +window.to;
  if (f === t) return +piece.from <= f && f <= +piece.to;
  return +piece.from < t && +piece.to > f;
}

/**
 * What the TAF says for a time or window: the prevailing pieces and overlays that
 * touch it, and whether the valid period covers it. `when` is as for toWindow;
 * if it can't be read, nothing is covered.
 */
export function forecastAt(taf, when) {
  const window = toWindow(when);
  const tl = tafTimeline(taf);
  if (!window) return { covered: false, validFrom: tl.validFrom, validTo: tl.validTo, prevailing: [], overlays: [] };
  const covered = !!tl.validFrom && +tl.validFrom <= +window.from && +tl.validTo >= +window.to;
  return {
    covered,
    validFrom: tl.validFrom,
    validTo: tl.validTo,
    prevailing: tl.prevailing.filter((p) => touches(p, window)),
    overlays: tl.overlays.filter((o) => touches(o, window)),
  };
}
