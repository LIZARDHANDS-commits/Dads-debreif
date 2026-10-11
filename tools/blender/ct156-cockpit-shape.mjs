// Prints the numbers the Blender cockpit (build_ct156_cockpit.py) is built from, as JSON, worked out by the code
// cockpit's own helpers (src/ui-kit/ct156-model.js, ct156-cockpit.js), so the eye, bow, canopy and sill keep one
// source (ALL-32). Feet, the cockpit's frame: nose +X, left +Y, up +Z from the model's origin on the spinner's axis.
//
//   node tools/blender/ct156-cockpit-shape.mjs > ct156-cockpit-shape.json
import { CT156_FRAME_X, ct156CanopySection, ct156CanopyHalfWidth, ct156HoopPoints } from '../../src/ui-kit/ct156-model.js';
import { CT156_FT_PER_UNIT as F, EYES_FT, FORWARD_BOW_FT, SIDE_FRAME_FT } from '../../src/ui-kit/ct156-cockpit.js';

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const section = (x) => {
  const c = ct156CanopySection(x / F);
  return { x: r4(x), w: r4(c.w * F), base: r4(c.base * F), top: r4(c.top * F) };
};
// The glass's half-width at height z over station x (0 outside the canopy).
const glassY = (x, z) => r4(ct156CanopyHalfWidth(x / F, z / F) * F);

const bow = FORWARD_BOW_FT;
const hoop = ct156HoopPoints(bow.bandX / F, 96, 0, bow.lean).map(({ x, y, z }) => [r4(x * F), r4(y * F), r4(z * F)]);
const x0 = bow.bandX, x1 = CT156_FRAME_X[2] * F + 0.2, N = 60;
const rail = [];
for (let i = 0; i <= N; i++) {
  const x = x0 + ((x1 - x0) * i) / N;
  const s = section(x);
  rail.push({ ...s, yBase: glassY(x, s.base + 0.001), yTop: glassY(x, s.base + SIDE_FRAME_FT.height) });
}
const out = {
  eyes: EYES_FT,
  forwardBow: { ...bow, crestX: r4(bow.x), base: section(bow.bandX).base, hoop },
  sideFrame: { ...SIDE_FRAME_FT, x0: r4(x0), x1: r4(x1), rail },
  frameX: CT156_FRAME_X.map((x) => r4(x * F)),
};
process.stdout.write(`${JSON.stringify(out)}\n`);
