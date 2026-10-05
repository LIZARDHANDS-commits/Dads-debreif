// Recessed rivers for the 3D view: the Moose Jaw River and the south creek sit in a shallow valley sunk into the photo
// (Patrick, 5 Oct 02:38Z "the river be recessed a bit"; card "Both" 02:45Z; "Build it now" 03:19Z; TR-70).
//
// Each river is a valley centreline in feet from the ARP (x east, y north), traced by eye off Esri's true-scale photo on
// 5 Oct, about +/-150 ft (an estimate): the valley's middle, not every meander of the channel. The valley is a ribbon
// RIVER_VALLEY_WIDTH_FT wide and RIVER_VALLEY_DEPTH_FT deep (both estimates) laid in each photo square it crosses, textured
// with that square's own photo, so the river looks as it does on the photo, only lower, with darker banks.
// Only the High photo squares carry it; Performance shows the flat photo.

/** Valley centrelines, feet from the ARP. */
export const RIVERS = Object.freeze({
  mooseJawRiver: Object.freeze([
    [2800, 9450], [2700, 8750], [2750, 8350], [3050, 8225], [3350, 8700], [4000, 8800], [4800, 8850], [5125, 8350],
    [5000, 7750], [4400, 7300], [4300, 6500], [4550, 6300], [5000, 6900], [5500, 7400], [6000, 7425], [6100, 6700],
    [6200, 5950], [7000, 5750], [7650, 5800], [8050, 5400], [8350, 5050], [8850, 4800], [8850, 4500], [8400, 4400],
    [7650, 4375], [7150, 4275], [7050, 3850], [7200, 3500], [7500, 3200], [8000, 3050], [8600, 3200], [9100, 3600],
    [9500, 3750], [10000, 3700], [10300, 3500], [10300, 3050], [10000, 2925], [9500, 2875], [9200, 2500], [9100, 2000],
    [10000, 1900], [11000, 1800], [10400, 1000], [10400, 200], [11000, -600], [11700, -700], [12200, -800],
    [12500, -1200], [12900, -1700], [12700, -2300], [12400, -2700], [12500, -3400], [13100, -4000], [13800, -3300],
    [14600, -3100], [15000, -2200], [15400, -2100], [15700, -2800], [15500, -3400], [15400, -3800], [16000, -3900],
    [17000, -3750], [17800, -3800], [18100, -4400], [17200, -4700], [16400, -4900], [16500, -6000], [17000, -6900],
    [17600, -7600], [18300, -7700], [18200, -6800], [17900, -5600], [18600, -4600], [19600, -4200], [20300, -4400],
    [20600, -5300], [19900, -6000], [19800, -6600], [20500, -6900], [21000, -6300], [21700, -6000], [22400, -6300],
    [22500, -6800], [22000, -7100], [21200, -7200], [20700, -7500], [20750, -8000], [21100, -8500], [21700, -9100],
    [22300, -9500], [22600, -9000], [23100, -8300], [24000, -8100], [24800, -8500],
  ]),
  southCreek: Object.freeze([
    [4000, -23875], [4600, -24025], [5950, -24475], [7000, -25075], [8500, -25750], [10000, -26350], [11050, -26875],
    [11500, -27100], [13000, -26875], [14500, -27175], [16000, -27700], [16700, -27300], [17900, -26500],
    [19100, -25900], [20100, -24900], [20700, -24100], [21300, -23600], [21900, -23500], [22700, -23500],
  ]),
});

export const RIVER_VALLEY_WIDTH_FT = 400; // estimate: covers the tree belt along the channel
export const RIVER_VALLEY_DEPTH_FT = 15; // estimate: "recessed a bit"
const STEP_FT = 100; // sample spacing along the river
// Across the valley: offset (fraction of the half-width), depth (fraction of the full depth) and shade.
const PROFILE = Object.freeze([[-1, 0, 1], [-0.5, 0.75, 0.82], [0, 1, 0.72], [0.5, 0.75, 0.82], [1, 0, 1]]);

/** The river resampled every STEP_FT, with a unit normal (left of travel) at each point, smoothed over its neighbours. */
function sample(line) {
  const pts = [];
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / STEP_FT));
    for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  pts.push(line[line.length - 1]);
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 2)];
    const b = pts[Math.min(pts.length - 1, i + 2)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { x: p[0], y: p[1], nx: -(b[1] - a[1]) / len, ny: (b[0] - a[0]) / len };
  });
}

/**
 * The valley ribbon for one photo square, in that square's own frame (its centre at 0,0; the photo plane at z = 0), or
 * null when no river crosses it. Stretches whose valley would run off the square are left out, so its texture
 * coordinates stay on the square's own photo.
 * @param {any} THREE
 * @param {{ x: number, y: number, span: number }} square centre and side, ft
 */
export function createRiverGeometry(THREE, square, { widthFt = RIVER_VALLEY_WIDTH_FT, depthFt = RIVER_VALLEY_DEPTH_FT } = {}) {
  const half = square.span / 2;
  const halfW = widthFt / 2;
  const inside = (p) => Math.abs(p.x - square.x) <= half - halfW && Math.abs(p.y - square.y) <= half - halfW;
  const pos = [];
  const uv = [];
  const col = [];
  const index = [];
  const across = PROFILE.length;
  for (const line of Object.values(RIVERS)) {
    let prevRow = -1;
    for (const p of sample(line)) {
      if (!inside(p)) {
        prevRow = -1;
        continue;
      }
      const row = pos.length / 3;
      for (const [off, dep, shade] of PROFILE) {
        const lx = p.x + p.nx * off * halfW - square.x;
        const ly = p.y + p.ny * off * halfW - square.y;
        pos.push(lx, ly, -dep * depthFt);
        uv.push((lx + half) / square.span, (ly + half) / square.span);
        col.push(shade, shade, shade);
      }
      if (prevRow >= 0) {
        for (let k = 0; k < across - 1; k++) {
          const a = prevRow + k;
          const b = row + k;
          index.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
      prevRow = row;
    }
  }
  if (!index.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  return geo;
}
