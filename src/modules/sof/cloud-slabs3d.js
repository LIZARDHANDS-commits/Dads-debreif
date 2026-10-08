// Draws the SOF 3D view's cloud slabs (SOF-39; Fable review, 7 Oct) from the plain numbers cloud-field.js works out: for each stage (low, mid, high) a few see-through
// sheets stacked from the slab's base to its top, so the cloud has a thickness, not one flat sheet at a level's mean height. It only builds three.js objects.
//
// World frame as view3d.js: X east, Y north, Z up, in the map's local feet; a height is feet above sea level times the height scale. Each sheet is a plane across the whole
// square bent to the slab: at each of its vertices the height is the slab's base, its top, or a step between (sheet k of n at k / (n - 1) of the way up). The sheets of a stage
// share one picture coloured by cover, each with the share of the opacity that makes the stack read as the old single sheet from above (`sheetAlphaShare`); the bottom
// sheet is a shade darker and the top one whiter (estimates for the look), and a soft noise alpha map, offset differently on each sheet, breaks up the flat look. Drawn
// without writing depth and from both sides, like the old sheets, so they sort by distance and blend.
//
// The altitude sheet (`buildHeightSheet`, V2.184) is drawn here too: one plain see-through plane at a chosen height.
import { slabPixels, slabSummary, slabWords, noisePixels, noiseMean, sampleBilinear, STAGES, SLAB_SHEETS, NOISE_PX, NOISE_REPEAT } from './cloud-field.js';
import { AREA_FT } from './scene3d-model.js';

/** Each sheet is bent to the slab on this many squares each way (about 7 NM a square over 450 NM). Estimate, SOF-39. */
export const SLAB_SEGMENTS = 64; // estimate, SOF-39
/** The bottom sheet's tint and the top's: a shade darker underneath, white on top. Estimates for the look, SOF-39. */
const TINT_BOTTOM = [0.76, 0.8, 0.85]; // estimate, SOF-39
const TINT_TOP = [1, 1, 1]; // estimate, SOF-39

let noiseCache = null;

/**
 * Builds the slabs. `T` is three.js; `slabs` are cloud-field.js `slabFields` (masked and anchored as the view wants); `scale` the height scale; `fade` 0 to 1 dims every
 * sheet (an old picture); `noise` the alpha-map pixels (NOISE_PX square, RGBA), made once and kept when left out.
 *
 * Returns { root, groups, labels, summary, dispose() } where `root` holds one Group per stage named `low`, `mid` and `high` (`root.userData.groups`, also `groups`);
 * `labels` are [{ group, text, point, side }] for the view to put beside the east corner, one per stage drawn; `summary` is cloud-field.js `slabSummary` plus `drawn`
 * ({ low, mid, high } true where a stage has a slab with cloud) and `words` ({ low, mid, high }, each `slabWords`).
 */
export function buildCloudSlabs(T, { slabs, scale, fade = 1, noise = null }) {
  const root = new T.Group();
  root.name = 'cloud-slabs';
  const groups = {};
  for (const stage of STAGES) {
    groups[stage] = new T.Group();
    groups[stage].name = stage;
    root.add(groups[stage]);
  }
  root.userData.groups = groups;
  const owned = [];
  const own = (thing) => {
    owned.push(thing);
    return thing;
  };
  const labels = [];
  const stats = slabSummary(slabs);
  const drawn = { low: false, mid: false, high: false };
  const words = { low: slabWords('low', null), mid: slabWords('mid', null), high: slabWords('high', null) };
  const px = slabs?.px ?? 0;
  const h2 = AREA_FT / 2;

  const noiseData = noise ?? (noiseCache ??= noisePixels(NOISE_PX));
  const gain = 1 / Math.max(0.1, noiseMean(noiseData)); // the noise dims each sheet by its mean; this keeps the stack's average opacity
  const noiseTexture = own(new T.DataTexture(noiseData, NOISE_PX, NOISE_PX, T.RGBAFormat));
  noiseTexture.wrapS = T.RepeatWrapping;
  noiseTexture.wrapT = T.RepeatWrapping;
  noiseTexture.magFilter = T.LinearFilter;
  noiseTexture.minFilter = T.LinearFilter;
  noiseTexture.generateMipmaps = false;
  noiseTexture.needsUpdate = true;

  for (const stage of STAGES) {
    const f = slabs?.[stage];
    if (!f) continue;
    const { pixels, drawn: any } = slabPixels(f.cover, px, { levels: f.levels, sheets: SLAB_SHEETS, fade, gain });
    if (!any || !stats[stage]) continue;
    drawn[stage] = true;
    words[stage] = slabWords(stage, stats[stage]);
    // A DataTexture has no row flip: row 0 is the plane's south edge, which is how the fields are laid out.
    const texture = own(new T.DataTexture(pixels, px, px, T.RGBAFormat));
    texture.colorSpace = T.SRGBColorSpace;
    texture.magFilter = T.LinearFilter;
    texture.minFilter = T.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    for (let k = 0; k < SLAB_SHEETS; k++) {
      const t = SLAB_SHEETS > 1 ? k / (SLAB_SHEETS - 1) : 0;
      const geometry = own(new T.PlaneGeometry(AREA_FT, AREA_FT, SLAB_SEGMENTS, SLAB_SEGMENTS));
      const position = geometry.attributes.position;
      for (let v = 0; v < position.count; v++) {
        const u = position.getX(v) / AREA_FT + 0.5;
        const w = position.getY(v) / AREA_FT + 0.5;
        const base = sampleBilinear(f.base, px, u, w);
        const top = sampleBilinear(f.top, px, u, w);
        position.setZ(v, (base + (top - base) * t) * scale);
      }
      position.needsUpdate = true;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const alphaMap = own(noiseTexture.clone());
      alphaMap.repeat.set(NOISE_REPEAT, NOISE_REPEAT);
      alphaMap.offset.set((k * 0.37) % 1, (k * 0.61) % 1); // a different part of the noise on each sheet
      alphaMap.needsUpdate = true;
      const tint = TINT_BOTTOM.map((b, c) => b + (TINT_TOP[c] - b) * t);
      const material = own(new T.MeshBasicMaterial({
        map: texture, alphaMap, color: new T.Color(tint[0], tint[1], tint[2]), transparent: true, depthWrite: false, side: T.DoubleSide, fog: false,
      }));
      const mesh = new T.Mesh(geometry, material);
      mesh.renderOrder = 1;
      mesh.name = `slab-${stage}-${k}`;
      groups[stage].add(mesh);
    }
    // The east corner, the right of the picture from the start view, at the slab's mean base.
    labels.push({ group: stage, text: words[stage], point: { x: h2, y: h2, z: stats[stage].baseFt * scale }, side: 'left' });
  }

  return {
    root,
    groups,
    labels,
    summary: { ...stats, drawn, words },
    dispose() {
      root.removeFromParent();
      for (const thing of owned) thing.dispose?.();
    },
  };
}

/**
 * The altitude sheet (Dad, 7 Oct: like ForeFlight's cloud forecast at a chosen altitude): one flat see-through plane across the square at `sheet.heightFt` (feet above
 * sea level) times `scale`, its picture cloud-field.js `heightSheet`'s cover coloured and made see-through as one old per-level sheet was (`slabPixels` with one sheet:
 * clear at or below the threshold, white to grey and more solid as cover rises), times `fade` (an old 2.5 km picture). No noise: it is a reading at one height, so it is
 * drawn plain. Drawn without writing depth and from both sides, like the other sheets.
 *
 * Returns { root, drawn, dispose() }; `drawn` is false (and the plane left out) when no pixel has cloud over the threshold.
 */
export function buildHeightSheet(T, { sheet, scale, fade = 1 }) {
  const root = new T.Group();
  root.name = 'cloud-height-sheet';
  const owned = [];
  let drawn = false;
  if (sheet) {
    const { pixels, drawn: any } = slabPixels(sheet.cover, sheet.px, { sheets: 1, fade });
    drawn = any;
    if (any) {
      const texture = new T.DataTexture(pixels, sheet.px, sheet.px, T.RGBAFormat); // row 0 is the plane's south edge, as the fields are laid out
      texture.colorSpace = T.SRGBColorSpace;
      texture.magFilter = T.LinearFilter;
      texture.minFilter = T.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      const geometry = new T.PlaneGeometry(AREA_FT, AREA_FT);
      const material = new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: T.DoubleSide, fog: false });
      owned.push(texture, geometry, material);
      const mesh = new T.Mesh(geometry, material);
      mesh.position.set(0, 0, sheet.heightFt * scale);
      mesh.renderOrder = 1;
      mesh.name = `cloud-at-${Math.round(sheet.heightFt)}`;
      root.add(mesh);
    }
  }
  return {
    root,
    drawn,
    dispose() {
      root.removeFromParent();
      for (const thing of owned) thing.dispose?.();
    },
  };
}
