// Fighting wing technique registry and runner (B06, Spec 7e §7.9, §7.10; TS-233, TS-234; Fable D1, D4, D5, D6).
// Where it fits: called by B04 (supervisor.js stepFwPicker) to assess cues (S24) and step the single active technique (S26).
// Exports: FW_TECHNIQUES, findFwTechnique.
// Does not: write stick, throttle, speed-brake, or loop commands directly — every technique writes only S24 and S26 (C1).
import { FW_MISS_TECHNIQUE } from './miss.js';

/** Ordered list of registered B06 techniques in strict TS-233 priority order (T1 in S3b; T2-T8 added in S5-S7 and T30). */
export const FW_TECHNIQUES = Object.freeze([
  FW_MISS_TECHNIQUE,
]);

/** Look up a registered technique card by id. */
export function findFwTechnique(id) {
  return FW_TECHNIQUES.find((t) => t.id === id) ?? null;
}
