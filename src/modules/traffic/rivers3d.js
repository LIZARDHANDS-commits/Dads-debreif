// The rivers in the 3D view: the Moose Jaw River and the south creek, traced by eye off Esri's true-scale photo on 5 Oct (TR-70; Patrick,
// 5 Oct 02:38Z "the river be recessed a bit"). Since TR-117 the valley's shape comes from the real ground heights (ground-heights3d.js),
// with the photo draped over them; each traced line still cuts a shallow channel and darkens its banks, so the river reads clearly where the
// height data is too coarse to show it (Patrick, 10 Oct: "Keep, carve channel").
//
// Each line is the valley's middle in feet from the ARP (x east, y north), about +/-150 ft (an estimate), not every meander of the channel.

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

/** The channel cut along each traced line: about the width of the tree belt (TR-70's valley width) and a little deeper than the ground round it. Both estimates (TR-117). */
export const RIVER_CHANNEL_WIDTH_FT = 400;
export const RIVER_CHANNEL_DEPTH_FT = 10;
const BUCKET_FT = 1000; // the lines are filed in squares this size, so a lookup checks only the segments near it
// Across the channel: distance from the line (a share of the half-width), depth (a share of the full depth) and shade.
const PROFILE = Object.freeze([[0, 1, 0.72], [0.5, 0.75, 0.82], [1, 0, 1]]);

const lerpProfile = (t, col) => {
  for (let i = 1; i < PROFILE.length; i++) {
    const [t0] = PROFILE[i - 1];
    const [t1] = PROFILE[i];
    if (t <= t1) return PROFILE[i - 1][col] + ((t - t0) / (t1 - t0)) * (PROFILE[i][col] - PROFILE[i - 1][col]);
  }
  return PROFILE[PROFILE.length - 1][col];
};

/**
 * The river channel as a lookup: channelAt(x, y) gives { depthFt, shade } at a point in feet from the ARP: how far the ground is cut below the
 * real height there, and how much darker the photo is drawn (1 is unchanged). Away from every traced line it is { depthFt: 0, shade: 1 }.
 * The real ground heights give the valley its shape (TR-117); the channel keeps the river and its tree banks readable where the height
 * data (about 80 ft a pixel) is too coarse to show them.
 */
export function createRiverChannel({ widthFt = RIVER_CHANNEL_WIDTH_FT, depthFt = RIVER_CHANNEL_DEPTH_FT, lines = Object.values(RIVERS) } = {}) {
  const halfW = widthFt / 2;
  const buckets = new Map();
  const bucketKey = (i, j) => `${i},${j}`;
  for (const line of lines) {
    for (let k = 0; k < line.length - 1; k++) {
      const [ax, ay] = line[k];
      const [bx, by] = line[k + 1];
      const seg = [ax, ay, bx, by];
      const i0 = Math.floor((Math.min(ax, bx) - halfW) / BUCKET_FT);
      const i1 = Math.floor((Math.max(ax, bx) + halfW) / BUCKET_FT);
      const j0 = Math.floor((Math.min(ay, by) - halfW) / BUCKET_FT);
      const j1 = Math.floor((Math.max(ay, by) + halfW) / BUCKET_FT);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const key = bucketKey(i, j);
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(seg);
        }
      }
    }
  }
  const none = Object.freeze({ depthFt: 0, shade: 1 });
  return function channelAt(x, y) {
    const segs = buckets.get(bucketKey(Math.floor(x / BUCKET_FT), Math.floor(y / BUCKET_FT)));
    if (!segs) return none;
    let best = Infinity;
    for (const [ax, ay, bx, by] of segs) {
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
      const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
      if (d < best) best = d;
    }
    if (best >= halfW) return none;
    const share = best / halfW;
    return { depthFt: lerpProfile(share, 1) * depthFt, shade: lerpProfile(share, 2) };
  };
}
