// Fighting wing technique registry and runner (B06, Spec 7e §7.9, §7.10; TS-233, TS-234; Fable D1, D4, D5, D6).
// Where it fits: called by B04 (supervisor.js stepFwPicker) to assess cues (S24) and step the single active technique (S26).
// Exports: FW_TECHNIQUES, findFwTechnique.
// Does not: write stick, throttle, speed-brake, or loop commands directly — every technique writes only S24 and S26 (C1).
import { FW_MISS_TECHNIQUE } from './miss.js';
import { FW_BEHIND39_TECHNIQUE } from './behind-39.js';
import { FW_LAG_ABEAM_TECHNIQUE } from './lag-abeam.js';
import { FW_YOYO_TECHNIQUE } from './yo-yo.js';
import { FW_CUT_ACROSS_TECHNIQUE } from './cut-across.js';
import { FW_EXIT_VERTICAL_TECHNIQUE } from './exit-vertical.js';
import { FW_STURN_TECHNIQUE } from './s-turns.js';

/** Ordered list of registered B06 techniques in strict TS-233 priority order (T1-T7 in S3b/S5/S6/S7; T8 added at T30). */
export const FW_TECHNIQUES = Object.freeze([
  FW_MISS_TECHNIQUE,
  FW_BEHIND39_TECHNIQUE,
  FW_LAG_ABEAM_TECHNIQUE,
  FW_YOYO_TECHNIQUE,
  FW_CUT_ACROSS_TECHNIQUE,
  FW_EXIT_VERTICAL_TECHNIQUE,
  FW_STURN_TECHNIQUE,
]);

/** Look up a registered technique card by id. */
export function findFwTechnique(id, list = FW_TECHNIQUES) {
  return list.find((t) => t.id === id) ?? null;
}
