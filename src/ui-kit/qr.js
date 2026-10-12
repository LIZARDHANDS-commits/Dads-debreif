// A small QR code encoder (EP Tabletop, EP-Q2 working answer (a): our own encoder, no library). Byte mode, error correction level M,
// versions 1 to 10 (up to 213 bytes, plenty for a link), all eight masks scored by the standard penalty rules, the format bits with
// their BCH code and, from version 7, the version bits. Drawn as an SVG with a 4-module quiet zone.
//
// Follows ISO/IEC 18004:2015, cited by clause only; no table is copied from it. The Galois field tables are generated here. The
// block structure for level M (below) and the alignment-pattern spacing are the published capacity facts, as every open QR encoder
// carries them; each is checked in the comment against the known byte capacity of its version.
//
// encodeQr(text) is pure (no page); qrSvg(qr) draws it and needs a document.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The highest version this encoder makes (a 57 x 57 code, 213 bytes at level M). */
export const MAX_VERSION = 10;
/** The light border round the code, in modules (clause 6.3.8: at least 4). */
export const QUIET_ZONE = 4;

// Level M, versions 1..10 (clause 7.5.1, the error correction characteristics): error correction codewords in each block and the
// number of blocks. With the total codewords (rawCodewords below) they give the data capacity: version 1 16 data codewords (14 bytes),
// 2: 28 (26), 3: 44 (42), 4: 64 (62), 5: 86 (84), 6: 108 (106), 7: 124 (122), 8: 154 (152), 9: 182 (180), 10: 216 (213).
const EC_PER_BLOCK_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
/** Level M's two format bits (clause 7.9.1: L 01, M 00, Q 11, H 10). */
const EC_LEVEL_M_BITS = 0;

// ---- GF(256) and Reed-Solomon (clause 7.5.2) ----------------------------------------------------------------------------------
// The field is built on the primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D), with alpha = 2.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** The generator polynomial of `degree` (product of (x - alpha^i), i = 0..degree-1), highest term dropped, coefficients high to low. */
function rsGenerator(degree) {
  const g = new Uint8Array(degree);
  g[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      g[j] = mul(g[j], root);
      if (j + 1 < degree) g[j] ^= g[j + 1];
    }
    root = mul(root, 2);
  }
  return g;
}

/** The error correction codewords for `data`: the remainder of data(x) * x^degree divided by the generator. */
function rsRemainder(data, generator) {
  const out = new Uint8Array(generator.length);
  for (const b of data) {
    const factor = b ^ out[0];
    out.copyWithin(0, 1);
    out[out.length - 1] = 0;
    for (let i = 0; i < out.length; i++) out[i] ^= mul(generator[i], factor);
  }
  return out;
}

// ---- Sizes (clause 6.3) ---------------------------------------------------------------------------------------------------------
const sizeOf = (ver) => ver * 4 + 17;

/** Where the alignment patterns' centres sit on each axis (clause 6.3.6): from 6 to size - 7, evenly spaced, the step even. */
function alignmentPositions(ver) {
  if (ver === 1) return [];
  const count = Math.floor(ver / 7) + 2;
  const step = Math.ceil((ver * 4 + 4) / (count * 2 - 2)) * 2; // version 2: 6, 18; 7: 6, 22, 38; 10: 6, 28, 50
  const out = [6];
  for (let pos = sizeOf(ver) - 7; out.length < count; pos -= step) out.splice(1, 0, pos);
  return out;
}

/** The modules left for data and error correction once the function patterns are placed, in whole codewords (clause 6.4.10). */
function rawCodewords(ver) {
  let modules = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    modules -= (25 * n - 10) * n - 55;
    if (ver >= 7) modules -= 36;
  }
  return Math.floor(modules / 8);
}
const dataCodewords = (ver) => rawCodewords(ver) - EC_PER_BLOCK_M[ver] * BLOCKS_M[ver];
/** The character count's length in byte mode (clause 7.4.1, Table 3): 8 bits to version 9, 16 from version 10. */
const countBits = (ver) => (ver <= 9 ? 8 : 16);

// ---- Data (clause 7.4) ---------------------------------------------------------------------------------------------------------

function dataBytes(bytes, ver) {
  const bits = [];
  const put = (value, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4); // byte mode (clause 7.4.5)
  put(bytes.length, countBits(ver));
  for (const b of bytes) put(b, 8);
  const capacity = dataCodewords(ver) * 8;
  put(0, Math.min(4, capacity - bits.length)); // the terminator (clause 7.4.9)
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < dataCodewords(ver); pad ^= 0xec ^ 0x11) out.push(pad); // the pad codewords, 11101100 and 00010001 in turn
  return out;
}

/** Splits the data into blocks, adds each block's error correction and interleaves them (clause 7.6). */
function withErrorCorrection(data, ver) {
  const blocks = BLOCKS_M[ver];
  const ecLen = EC_PER_BLOCK_M[ver];
  const raw = rawCodewords(ver);
  const shortBlocks = blocks - (raw % blocks);
  const shortData = Math.floor(raw / blocks) - ecLen;
  const generator = rsGenerator(ecLen);
  const dataBlocks = [];
  const ecBlocks = [];
  for (let i = 0, at = 0; i < blocks; i++) {
    const len = shortData + (i < shortBlocks ? 0 : 1);
    const block = data.slice(at, at + len);
    at += len;
    dataBlocks.push(block);
    ecBlocks.push(rsRemainder(block, generator));
  }
  const out = [];
  for (let i = 0; i <= shortData; i++) for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecLen; i++) for (const b of ecBlocks) out.push(b[i]);
  return out;
}

// ---- The symbol (clause 6.3 function patterns, 7.7 placement, 7.8 masking, 7.9 format, 7.10 version) ----------------------------

function makeGrid(size) {
  const dark = new Uint8Array(size * size);
  const fixed = new Uint8Array(size * size);
  const set = (x, y, on) => {
    dark[y * size + x] = on ? 1 : 0;
    fixed[y * size + x] = 1;
  };
  return { size, dark, fixed, set };
}

function drawFunctionPatterns(g, ver) {
  const { size, set } = g;
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0); // timing patterns (clause 6.3.5)
    set(i, 6, i % 2 === 0);
  }
  // Finder patterns with their separators (clause 6.3.3, 6.3.4).
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  // Alignment patterns, except where they would sit on a finder (clause 6.3.6).
  const pos = alignmentPositions(ver);
  const last = pos.length - 1;
  pos.forEach((cy, i) => pos.forEach((cx, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  drawFormatBits(g, 0); // reserves the format areas; the real bits go in once the mask is chosen
  if (ver >= 7) drawVersionBits(g, ver);
}

/** The 15 format bits: level and mask, BCH(15,5) with generator 0x537, masked with 0x5412 (clause 7.9.1, Annex C). */
export function formatBits(mask) {
  const data = (EC_LEVEL_M_BITS << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function drawFormatBits(g, mask) {
  const { size, set } = g;
  const bits = formatBits(mask);
  const bit = (i) => ((bits >>> i) & 1) === 1;
  // The copy round the top-left finder.
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  // The copy split between the other two finders.
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true); // the dark module (clause 6.3.9 / 7.9.1)
}

/** The 18 version bits from version 7: the version and BCH(18,6) with generator 0x1F25 (clause 7.10, Annex D). */
export function versionBits(ver) {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

function drawVersionBits(g, ver) {
  const { size, set } = g;
  const bits = versionBits(ver);
  for (let i = 0; i < 18; i++) {
    const on = ((bits >>> i) & 1) === 1;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    set(a, b, on);
    set(b, a, on);
  }
}

/** Places the codewords in the two-module-wide zigzag from the bottom right, skipping function modules (clause 7.7.3). */
function placeCodewords(g, codewords) {
  const { size, dark, fixed } = g;
  let i = 0;
  const total = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing pattern's column is skipped
    const upward = ((right + 1) & 2) === 0;
    for (let v = 0; v < size; v++) {
      const y = upward ? size - 1 - v : v;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (fixed[y * size + x]) continue;
        if (i < total) dark[y * size + x] = (codewords[i >>> 3] >>> (7 - (i & 7))) & 1;
        i++; // the few remainder bits stay light
      }
    }
  }
}

/** The eight data masks (clause 7.8.2, Table 10), x the column and y the row. */
const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(g, mask) {
  const { size, dark, fixed } = g;
  const test = MASKS[mask];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y * size + x] && test(x, y)) dark[y * size + x] ^= 1;
}

// The penalty weights (clause 7.8.3.1, Table 11): N1 = 3, N2 = 3, N3 = 40, N4 = 10.
const N1 = 3, N2 = 3, N3 = 40, N4 = 10;
// The finder-like 1:1:3:1:1 run with four light modules on one side (clause 7.8.3.1, feature 3), as module strings.
const FINDER_LIKE = ['00001011101', '10111010000'];

/** The penalty score of a finished symbol (clause 7.8.3): lower is better. */
export function penalty(dark, size) {
  const at = (x, y) => dark[y * size + x];
  let score = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < size; a++) {
      const line = [];
      for (let b = 0; b < size; b++) line.push(pass === 0 ? at(b, a) : at(a, b));
      // Feature 1: five or more of the same colour in a row: N1, plus one for each more.
      let run = 1;
      for (let b = 1; b <= size; b++) {
        if (b < size && line[b] === line[b - 1]) run++;
        else {
          if (run >= 5) score += N1 + (run - 5);
          run = 1;
        }
      }
      // Feature 3: a finder-like pattern, the light quiet zone counting as light.
      const text = `0000${line.join('')}0000`;
      for (const pattern of FINDER_LIKE) for (let i = text.indexOf(pattern); i >= 0; i = text.indexOf(pattern, i + 1)) score += N3;
    }
  }
  // Feature 2: each 2 x 2 block of one colour.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += N2;
    }
  }
  // Feature 4: N4 for each whole 5 % the dark share is away from 50 %.
  let darkCount = 0;
  for (const d of dark) darkCount += d;
  const total = size * size;
  score += Math.floor(Math.abs(darkCount * 20 - total * 10) / total) * N4;
  return score;
}

/**
 * The QR code for `text` (UTF-8, byte mode, level M): { version, size, mask, dark } where dark[y * size + x] is 1 for a dark module.
 * Picks the smallest version that holds it and the mask with the lowest penalty. Throws when it needs more than version 10.
 * @param {string} text
 */
export function encodeQr(text) {
  const bytes = new TextEncoder().encode(String(text));
  let ver = 1;
  while (ver <= MAX_VERSION && 4 + countBits(ver) + bytes.length * 8 > dataCodewords(ver) * 8) ver++;
  if (ver > MAX_VERSION) throw new Error(`Too long for a version ${MAX_VERSION} QR code (${bytes.length} bytes)`);
  const codewords = withErrorCorrection(dataBytes(bytes, ver), ver);
  const base = makeGrid(sizeOf(ver));
  drawFunctionPatterns(base, ver);
  placeCodewords(base, codewords);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const g = { ...base, dark: base.dark.slice() };
    g.set = (x, y, on) => { g.dark[y * g.size + x] = on ? 1 : 0; };
    applyMask(g, mask);
    drawFormatBits(g, mask);
    const score = penalty(g.dark, g.size);
    if (!best || score < best.score) best = { score, mask, dark: g.dark };
  }
  return { version: ver, size: base.size, mask: best.mask, dark: best.dark };
}

/**
 * The code drawn as an SVG element: dark modules on white, with the quiet zone, scaled by CSS. `label` names it for screen readers.
 * @param {{ size: number, dark: Uint8Array }} qr
 * @param {{ doc?: Document, label?: string }} [options]
 */
export function qrSvg(qr, { doc = globalThis.document, label = 'QR code' } = {}) {
  const full = qr.size + QUIET_ZONE * 2;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${full} ${full}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const back = doc.createElementNS(SVG_NS, 'rect');
  back.setAttribute('width', String(full));
  back.setAttribute('height', String(full));
  back.setAttribute('fill', '#ffffff');
  const path = doc.createElementNS(SVG_NS, 'path');
  let d = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) if (qr.dark[y * qr.size + x]) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
  }
  path.setAttribute('d', d);
  path.setAttribute('fill', '#000000');
  svg.append(back, path);
  return svg;
}
