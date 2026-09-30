// Parse a TAF into dated change groups, and build its timeline: the prevailing
// conditions for every moment of the valid period, plus the TEMPO, PROB and
// BECMG overlays on top of them. Never throws.

import { readConditions, mergeConditions, tokenize } from './conditions.js';
import { resolveDay } from './dates.js';

const STATION = /^[A-Z][A-Z0-9]{3}$/;
const ISSUE_TIME = /^(\d{2})(\d{2})(\d{2})Z$/;
const PERIOD = /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/;
const FROM = /^FM(\d{2})(\d{2})(\d{2})$/;
const PROB = /^PROB(\d{2})$/;

/**
 * Parse a TAF. `now` resolves the day-of-month in its issue time; the valid period
 * and groups are resolved from there.
 *
 * Groups: { kind: 'BASE'|'FM'|'BECMG'|'TEMPO'|'PROB', probability, tempo, from, to, conditions, raw }.
 * A PROB group followed by TEMPO has kind 'PROB' and tempo true.
 */
export function parseTaf(raw, { now = new Date() } = {}) {
  const { tokens, remarks } = tokenize(raw);
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
  };
  let i = 0;
  if (tokens[i] === 'TAF') i++;
  while (['AMD', 'COR', 'RTD'].includes(tokens[i])) taf.amendment = tokens[i++];
  if (tokens[i] && STATION.test(tokens[i])) taf.station = tokens[i++];
  const it = tokens[i]?.match(ISSUE_TIME);
  if (it) {
    taf.issued = resolveDay(Number(it[1]), Number(it[2]), Number(it[3]), now);
    i++;
  }
  const vp = tokens[i]?.match(PERIOD);
  if (vp) {
    taf.validFrom = resolveDay(Number(vp[1]), Number(vp[2]), 0, taf.issued || now);
    taf.validTo = resolveDay(Number(vp[3]), Number(vp[4]), 0, taf.validFrom, +taf.validFrom + 1);
    i++;
  }
  if (tokens[i] === 'NIL') { taf.nil = true; i++; }
  if (tokens[i] === 'CNL') { taf.cancelled = true; i++; }

  // Split the rest into groups by their keywords.
  const pieces = [{ kind: 'BASE', probability: null, tempo: false, from: taf.validFrom, to: null, tokens: [], head: [] }];
  const start = (g) => { pieces.push({ tokens: [], ...g }); };
  const periodAt = (k) => tokens[k]?.match(PERIOD);
  const period = (m) => {
    const from = resolveDay(Number(m[1]), Number(m[2]), 0, taf.validFrom || now, taf.validFrom);
    const to = from && resolveDay(Number(m[3]), Number(m[4]), 0, from, +from + 1);
    return { from, to };
  };
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    let m;
    if ((m = t.match(FROM))) {
      const from = resolveDay(Number(m[1]), Number(m[2]), Number(m[3]), taf.validFrom || now, taf.validFrom);
      start({ kind: 'FM', probability: null, tempo: false, from, to: null, head: [t] });
    } else if ((t === 'BECMG' || t === 'TEMPO') && (m = periodAt(i + 1))) {
      start({ kind: t, probability: null, tempo: t === 'TEMPO', ...period(m), head: [t, tokens[i + 1]] });
      i++;
    } else if ((m = t.match(PROB))) {
      const tempo = tokens[i + 1] === 'TEMPO';
      const pm = periodAt(i + (tempo ? 2 : 1));
      if (!pm) { pieces.at(-1).tokens.push(t); continue; }
      start({ kind: 'PROB', probability: Number(m[1]), tempo, ...period(pm), head: tokens.slice(i, i + (tempo ? 3 : 2)) });
      i += tempo ? 2 : 1;
    } else {
      pieces.at(-1).tokens.push(t);
    }
  }

  // FM and BASE run until the next FM (or the end of the TAF).
  const fms = pieces.filter((p) => p.kind === 'BASE' || p.kind === 'FM');
  fms.forEach((p, k) => { p.to = fms[k + 1]?.from ?? taf.validTo; });

  for (const p of pieces) {
    const read = readConditions(p.tokens);
    taf.unread.push(...read.unread);
    taf.groups.push({
      kind: p.kind,
      probability: p.probability,
      tempo: p.tempo,
      from: p.from,
      to: p.to,
      conditions: read.conditions,
      raw: [...p.head, ...p.tokens].join(' '),
    });
  }
  return taf;
}

/**
 * The TAF's timeline.
 * prevailing: [{ from, to, conditions, group }] covering the valid period without gaps.
 * overlays: [{ kind, probability, tempo, from, to, conditions, group }] for BECMG change
 * periods and TEMPO/PROB groups, each merged with the prevailing conditions it sits on.
 * `group` is the index into taf.groups the piece came from.
 */
export function tafTimeline(taf) {
  const prevailing = [];
  const overlays = [];
  if (!taf?.validFrom || !taf?.validTo) return { validFrom: null, validTo: null, prevailing, overlays };
  const clip = (t) => new Date(Math.min(Math.max(+t, +taf.validFrom), +taf.validTo));
  const addPrevailing = (from, to, conditions, group) => {
    const a = clip(from);
    const b = clip(to);
    if (+b > +a) prevailing.push({ from: a, to: b, conditions, group });
  };

  let current = taf.groups[0]?.conditions;
  let currentGroup = 0;
  let cursor = taf.validFrom;
  const temporary = [];
  taf.groups.forEach((g, index) => {
    if (index === 0 || !g.from || !g.to) return;
    if (g.kind === 'FM') {
      addPrevailing(cursor, g.from, current, currentGroup);
      current = g.conditions;
      currentGroup = index;
      cursor = g.from;
    } else if (g.kind === 'BECMG') {
      // Old conditions prevail until the change period ends; either may occur during it.
      const after = mergeConditions(current, g.conditions);
      addPrevailing(cursor, g.to, current, currentGroup);
      const a = clip(g.from);
      const b = clip(g.to);
      if (+b > +a) overlays.push({ kind: 'BECMG', probability: null, tempo: false, from: a, to: b, conditions: after, group: index });
      current = after;
      currentGroup = index;
      cursor = new Date(Math.max(+cursor, +g.to));
    } else {
      temporary.push(index);
    }
  });
  addPrevailing(cursor, taf.validTo, current, currentGroup);

  // TEMPO and PROB: split wherever the prevailing conditions under them change.
  for (const index of temporary) {
    const g = taf.groups[index];
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

/** True when [from, to) touches the window. A window with from == to is a point in time. */
export function touches(piece, window) {
  const f = +window.from;
  const t = +window.to;
  if (f === t) return +piece.from <= f && f <= +piece.to;
  return +piece.from < t && +piece.to > f;
}

/**
 * What the TAF says for a time or window: the prevailing pieces and overlays that
 * touch it, and whether the valid period covers it. `when` is a Date or { from, to }.
 */
export function forecastAt(taf, when) {
  const window = when instanceof Date ? { from: when, to: when } : when;
  const tl = tafTimeline(taf);
  const covered = !!tl.validFrom && +tl.validFrom <= +window.from && +tl.validTo >= +window.to;
  return {
    covered,
    validFrom: tl.validFrom,
    validTo: tl.validTo,
    prevailing: tl.prevailing.filter((p) => touches(p, window)),
    overlays: tl.overlays.filter((o) => touches(o, window)),
  };
}
