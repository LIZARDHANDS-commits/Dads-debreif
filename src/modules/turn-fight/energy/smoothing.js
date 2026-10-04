// The smoothing layer between the pilot and the aircraft: every move's G and bank go through here before the
// limits. Switched off for now (TF-57, plan Step 1b, PR 1 moves code only): it hands the command on unchanged.
// PR 2 switches it on: G builds at a set rate and the roll eases in and out (core's easeRoll), for every move.

/** The command a move asked for ({ g, bankRad, prefer, throttle }), as the aircraft will fly it. Off: unchanged. */
export function smoothInputs(ac, cmd, d, p) {
  return cmd;
}
