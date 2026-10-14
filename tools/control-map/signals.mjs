// The control map's master list (plan T29m part 1; `Pat's claude work/formation-review-12oct/control-systems-analysis-plan.md`
// section 4.1): every block and signal of the live wingman, fighting wing (Live, as tidied: b2 482f0857, db651dec) and close
// formation, with who writes and reads each, its delay, smoothing, limits, the gauge column that shows it and its source.
// Everything else in tools/control-map/ is drawn from this file: `node tools/control-map/draw.mjs` writes
// docs/modules/turn-sim/control-model.md and its pictures, `node tools/control-map/check.mjs` compares it with a gauge run
// and with the code's tuning tables. Edit here, never the drawn pages.
//
// Plain data. Ids: fw.* fighting wing, cf.* close formation, ac.* the aircraft both share, lead the aircraft he flies off.
// Units: ft, s, ft/s, G, degrees, torque %, KIAS (indicated) or ft/s true, as named. Code concepts are function names in
// src/modules/turn-sim/live/ (wingman/*.js, fluid-lead.js), never line numbers, so the map survives the code moving.

export const META = Object.freeze({
  codeAt: 'formation-close-wingman-b2 at 8509fcff: the T29t tidy (482f0857) and the powerFor to powerAsk rename (db651dec)',
  written: '14 Oct 2026, plan T29m part 1 (Opus, high)',
  status: 'An estimate of the code as built, read by hand; the trace columns and the ledger are checked by check.mjs. Nothing here changes how anything flies.',
});

/** How late a signal is (spec 7b.3, 7e.7; finding R1). */
export const DELAYS = Object.freeze({
  none: 'Now: his own state, or worked out this step from things known now',
  leadDr: 'Lead 0.4 s late (FW_SEE.delaySec, Patrick 14 Oct 2026), then dead-reckoned 0.4 s round his seen turn (leadNowOf); his own state now',
  leadLate: 'Lead 0.4 s late, not dead-reckoned (seen.lead used as it was)',
  picture04: 'The whole relative picture 0.4 s late: Lead and himself as they were (seeFw buffers both)',
  picture03: 'The whole relative picture 0.3 s late (CLOSE_SEE.delaySec, TS-211): close formation',
  state: 'Internal memory or a switch state, carried from the last step',
});

/** The blocks. layer orders the level-1 pictures; kind: measure, loop, override, switch, guard, allocation, hand, aircraft. */
export const BLOCKS = Object.freeze([
  // ---- shared ----
  { id: 'lead', tech: 'shared', layer: 0, kind: 'aircraft', name: 'Lead', code: 'stepLead (his plan, TS-225)', does: 'Flies his programme; never reads #2 (TS-211)' },
  { id: 'ac.pointMass', tech: 'shared', layer: 6, kind: 'aircraft', name: '#2 point mass', code: 'fluid-lead.js stepLead', does: 'G eased at the T-6A onset (T6A_G_ONSET), roll at the asked rate (fighting wing 60°/s, estimate) within the T-6A\'s, lift held under the stick shaker (the one physical limit), point mass in two half steps' },
  { id: 'ac.speedHold', tech: 'fw', layer: 5, kind: 'loop', name: 'Speed hold (inner)', code: 'fluid-lead.js holdThrottle', does: 'Throttle for a wanted KIAS: 0.2 kt/s per kt off, at most 3 kt/s (LEAD.speedHold, estimates), plus the drag at his present G fed forward (dragPerWeight)' },
  { id: 'ac.engine', tech: 'shared', layer: 6, kind: 'aircraft', name: 'Engine', code: 'fluid-lead.js engineStep', does: 'Throttle travel in about 0.25 s; 3.5 s spool-up from idle (handling.js ENGINE, TS-218)' },
  // ---- fighting wing ----
  { id: 'fw.perception', tech: 'fw', layer: 1, kind: 'measure', name: 'Sight (seeFw)', code: 'perception.js seeFw', does: 'The picture 0.4 s late: slant, closure (1 s), line of sight rate (0.5 s), aspect, HCA, sweep, height against Lead, Lead\'s bank, G (0.1 s) and turn circle' },
  { id: 'fw.leadNow', tech: 'fw', layer: 1, kind: 'measure', name: 'Lead now', code: 'fighting-wing.js leadNowOf', does: 'Lead carried 0.4 s round his seen turn (Fable F5); his own position and velocity as they are now (R1)' },
  { id: 'fw.arc', tech: 'fw', layer: 1, kind: 'measure', name: 'Arc range (s, d)', code: 'fighting-wing.js arcRange', does: 'In a turn: arc s behind Lead round his circle, offset d inside it, and the arc closure from the velocities (Fable F10)' },
  { id: 'fw.guard', tech: 'fw', layer: 2, kind: 'guard', name: 'Guard (fwGuard)', code: 'separation.js fwGuard', does: 'Second predictor of the pass, from the seen (0.4 s old) picture: on under 600 ft predicted or 500 ft now, off over 700 ft for 3 s; sets pass-clear\'s depth, freezes the power integral, skips the aim blend, opens the G cap under 500 ft' },
  { id: 'fw.jobs', tech: 'fw', layer: 2, kind: 'switch', name: 'Jobs (fwJob)', code: 'supervisor.js fwJob', does: 'Turning or level from Lead\'s seen bank; the entry case (a label, R7); the swept side at the exit; S-turns; the quick fix; low inside; the eased height target' },
  { id: 'fw.aimTurn', tech: 'fw', layer: 3, kind: 'loop', name: 'Arc loop (aimInTurn)', code: 'fighting-wing.js aimInTurn', does: 'd = d_ss + c*/ω + kc(c* − c)/ω, c* = (s − 650)/10 s within ±25/±60 ft/s, d within ±400 ft slewed 60 ft/s; aim 3 s ahead on the circle d inside Lead\'s; power\'s P = arc error/15 s' },
  { id: 'fw.aimSwept', tech: 'fw', layer: 3, kind: 'loop', name: 'Swept aim (aimSwept)', code: 'fighting-wing.js aimSwept', does: 'Lead level: aim at the swept place (625 ft at 45°) carried 8 s ahead; power\'s P = how far behind his place/10 s within ±25 ft/s' },
  { id: 'fw.lagFirst', tech: 'fw', layer: 3, kind: 'override', name: 'Lag first', code: 'fighting-wing.js lagFirst', does: 'On Lead\'s bank passing 10° toward him: aim 20° outward of Lead\'s circle for 2.5 s, eased out over 1 s. Goes (ruling 14 Oct 2026)' },
  { id: 'fw.noseBehind', tech: 'fw', layer: 3, kind: 'override', name: 'Nose behind', code: 'fighting-wing.js noseBehind', does: 'While the filter finds the wing line out of reach: aim where Lead was 1 s ago and go 300 ft down' },
  { id: 'fw.steer', tech: 'fw', layer: 4, kind: 'loop', name: 'Steering (steerToAim)', code: 'fighting-wing.js steerToAim', does: 'Aim (against Lead) eased over 1.5 s every step; the aim line\'s turn (0.5 s) fed forward × V, capped at 1.5 ω_L + 3°/s; plus 0.05 G per degree to the aim line; in Lead\'s turn plane' },
  { id: 'fw.yoyo', tech: 'fw', layer: 3, kind: 'switch', name: 'High yo-yo', code: 'fighting-wing.js highYoYo', does: 'Inside Lead\'s turn, slow-to-hold > 10 kt, power back and gaining > 20 ft/s: climb h = (V² − (ωr)²)/2g, at least 100 ft, at most 200 ft; then down' },
  { id: 'fw.pitchOwner', tech: 'fw', layer: 4, kind: 'switch', name: 'Pitch owner', code: 'fighting-wing.js takePitch, nextOwner, heightTargetFt', does: 'One owner: pass-clear, in and down, yo-yo, else the stack family (stack, quick fix, low inside); a 2 s hold except pass-clear and in and down' },
  { id: 'fw.vertical', tech: 'fw', layer: 4, kind: 'loop', name: 'Vertical PD', code: 'fighting-wing.js verticalFor', does: '0.005 G/ft and 0.02 G per ft/s on height against Lead\'s target, square to Lead\'s turn plane, within ±1 G' },
  { id: 'fw.filter', tech: 'fw', layer: 5, kind: 'guard', name: 'Separation filter', code: 'separation.js separationFilter, passJudge, searchTurn, engagedNext', does: 'His aim\'s turn, unless its predicted pass is under 500 ft + 1.4 s × closure (at least 600 ft) or within 100 ft of Lead\'s wing line: then the nearest of 41 turns (bisected 6 times) that keeps both, lag side first' },
  { id: 'fw.gcap', tech: 'fw', layer: 5, kind: 'allocation', name: 'G cap', code: 'fighting-wing.js gCap', does: 'Lead\'s G + 1.5 (estimate) under the shaker; what the aircraft gives while the guard\'s pass is under 500 ft or the filter needs more (flagged)' },
  { id: 'fw.lift', tech: 'fw', layer: 5, kind: 'allocation', name: 'Lift (liftWithin)', code: 'fighting-wing.js liftWithin', does: '1 G hold + the vertical first, the turn gives way at the cap; unload, roll, pull past 20° off; never under 0.5 G' },
  { id: 'fw.power', tech: 'fw', layer: 5, kind: 'switch', name: 'Power (powerAsk)', code: 'fighting-wing.js powerAsk', does: 'Wanted KIAS = Lead\'s + P (aim residual) + I (level only, 15 s), within 15 KIAS; 20% torque while the filter held and closing; MAX low inside; 20% on the yo-yo\'s way down; idle over 40 ft/s, boards over 60 ft/s' },
  // ---- close formation ----
  { id: 'cf.perception', tech: 'cf', layer: 1, kind: 'measure', name: 'Sight (perceive)', code: 'perception.js perceive, seeWith', does: 'The whole picture 0.3 s late: deviation on plane, line, along; rates (0.1 s); Lead\'s bank, roll, G dead-reckoned 0.3 s; his place\'s motion as Lead rolls and turns' },
  { id: 'cf.supervisor', tech: 'cf', layer: 2, kind: 'switch', name: 'Supervisor', code: 'supervisor.js supervise, pick, masksFor', does: 'On station, small move, large move (plane, line, hinge masks eased at 0.5/s), out before up, off station; each with a dead band' },
  { id: 'cf.station', tech: 'cf', layer: 2, kind: 'guard', name: 'Station change and deconfliction', code: 'supervisor.js stationChange, progress, deconflict', does: 'B3: the places a change flies through; never within a wingspan, ahead of the 3/9 line or with wings overlapping' },
  { id: 'cf.holding', tech: 'cf', layer: 3, kind: 'loop', name: 'Holding power (feed-forward)', code: 'close-formation.js holdingTorque', does: 'powerFor at the briefed 200 KIAS + his place\'s speed, his G, Lead\'s climb, his place\'s climb and his own climb' },
  { id: 'cf.powerLead', tech: 'cf', layer: 3, kind: 'loop', name: 'Power lead (feed-forward)', code: 'close-formation.js powerLeadPct', does: 'Torque for his place\'s acceleration along Lead\'s nose as Lead\'s turn builds or eases' },
  { id: 'cf.law', tech: 'cf', layer: 3, kind: 'loop', name: 'Three axes (closeLaw)', code: 'close-formation.js closeLaw; core pilotAxis', does: 'Pace cascade (0.4 ft/s per ft, at most 8 ft/s, the braking taper), then P and D per axis: plane G 0.04/0.06, line bank 1.9° per ft/s, hinge torque 12% per ft/s; I 0' },
  { id: 'cf.shaper', tech: 'cf', layer: 4, kind: 'hand', name: 'Shaper (the hand)', code: 'shaper.js shape', does: 'Pressure sizes per job, eased between jobs; torque rate 10 or 20%/s, 20%/s × reach in a telegraph; the trims held at a limit' },
  { id: 'cf.lift', tech: 'cf', layer: 5, kind: 'allocation', name: 'Lift (liftFor)', code: 'close-formation.js liftFor', does: 'Lead\'s lift at his G and bank 0.3 s ahead + his place\'s motion + the corrections; roll catch-up 0.6 of the gap' },
]);

/**
 * The signals. delay: a key of DELAYS. trace: the gauge's column for it (tools/formation-gauge.mjs), null when none yet
 * (part 2's T29r columns). ffKind for commands the plan's R3 asks about: 'physics' (from Lead or the aircraft only) or
 * 'hidden' (contains his own motion).
 */
export const SIGNALS = Object.freeze([
  // what he can see of the aircraft he flies off (TS-211: position, velocity and body up only)
  { id: 'leadSeen', name: 'Lead as seen (position, velocity, body up)', unit: 'ft, ft/s', frame: 'world', writers: ['lead'], readers: ['fw.perception', 'cf.perception'], delay: 'none', smoothing: 'none', limits: '', trace: null, traceNote: 'the gauge records Lead as an aircraft (generic columns)', source: 'TS-211' },
  // fighting wing: what he sees
  { id: 'slant', name: 'Slant range', unit: 'ft', frame: 'slant', writers: ['fw.perception'], readers: ['fw.guard', 'fw.jobs', 'fw.power'], delay: 'picture04', smoothing: 'none', limits: '', trace: 'slantFt', source: 'SMM 12.2 para 7; 500 ft is slant (Patrick 14 Oct 2026)' },
  { id: 'closureSlant', name: 'Slant closure', unit: 'ft/s, + closing', frame: 'slant', writers: ['fw.perception'], readers: ['fw.guard', 'fw.jobs', 'fw.filter', 'fw.power'], delay: 'picture04', smoothing: '1 s (FW_SEE.closureSec)', limits: '', trace: 'closureFtps', source: 'SMM 12.2 para 5 ("subtle"); R2' },
  { id: 'los', name: 'Line of sight rate', unit: '°/s', frame: 'his view', writers: ['fw.perception'], readers: [], delay: 'picture04', smoothing: '0.5 s (FW_SEE.losSec)', limits: '', trace: 'losDps', source: 'SMM 12.2 para 8; read by nothing since the tidy (the guard\'s reversal cue went)' },
  { id: 'aspect', name: 'Aspect angle', unit: '°', frame: 'Lead\'s tail 0°', writers: ['fw.perception'], readers: [], delay: 'picture04', smoothing: 'none', limits: '', trace: 'aspectDeg', source: 'SMM 12.2 para 6, 16.16 para 40b; trace only' },
  { id: 'hca', name: 'Heading crossing angle', unit: '°', frame: 'between paths', writers: ['fw.perception'], readers: [], delay: 'picture04', smoothing: 'none', limits: '', trace: 'hcaDeg', source: 'SMM 12.2 para 9; trace only' },
  { id: 'heightRel', name: 'Height against Lead', unit: 'ft, + above', frame: 'vertical', writers: ['fw.perception'], readers: ['fw.jobs', 'fw.pitchOwner', 'fw.yoyo'], delay: 'picture04', smoothing: 'none', limits: '', trace: 'heightFt', source: 'TS-80 band; stack 50 ft below (Patrick 14 Oct 2026)' },
  { id: 'leadBank', name: 'Lead\'s bank (seen)', unit: '°', frame: 'Lead', writers: ['fw.perception'], readers: ['fw.jobs', 'fw.lagFirst', 'fw.arc', 'fw.aimTurn'], delay: 'leadLate', smoothing: 'none', limits: '', trace: null, source: 'TS-211; spec 7e.7' },
  { id: 'leadG', name: 'Lead\'s G (seen)', unit: 'G', frame: 'Lead', writers: ['fw.perception'], readers: ['fw.gcap', 'fw.filter'], delay: 'leadLate', smoothing: '0.1 s (FW_SEE.gSec)', limits: '', trace: null, source: 'spec 7e.7' },
  { id: 'leadTurn', name: 'Lead\'s turn (ω, radius, centre)', unit: 'rad/s, ft', frame: 'Lead\'s lift plane', writers: ['fw.perception'], readers: ['fw.leadNow', 'fw.arc', 'fw.aimTurn', 'fw.steer', 'fw.yoyo', 'fw.filter', 'fw.guard'], delay: 'leadLate', smoothing: 'from G (0.1 s) and true speed', limits: 'ω ≥ 0.03 rad/s in d = c/ω', trace: null, source: 'Fable F4, F9' },
  { id: 'leadNow', name: 'Lead now (position, velocity)', unit: 'ft, ft/s', frame: 'world', writers: ['fw.leadNow'], readers: ['fw.arc', 'fw.aimTurn', 'fw.aimSwept', 'fw.noseBehind', 'fw.steer', 'fw.vertical', 'fw.filter'], delay: 'leadDr', smoothing: 'none', limits: '', trace: null, source: 'Fable F5 (second review); R1' },
  { id: 'ownNow', name: 'His own state', unit: 'ft, ft/s', frame: 'world', writers: ['ac.pointMass'], readers: ['fw.arc', 'fw.steer', 'fw.vertical', 'fw.filter', 'fw.lift', 'fw.power', 'fw.aimSwept'], delay: 'none', smoothing: 'none', limits: '', trace: null, source: 'leadNowOf: "his own state he knows" (R1)' },
  // fighting wing: derived
  { id: 's', name: 'Arc s behind Lead', unit: 'ft, + behind', frame: 'Lead\'s turn centre', writers: ['fw.arc'], readers: ['fw.aimTurn', 'fw.yoyo'], delay: 'leadDr', smoothing: 'none', limits: '', trace: 'sFt', source: 'Fable F10 (second review)' },
  { id: 'd', name: 'Offset d inside Lead\'s circle', unit: 'ft, + inside', frame: 'Lead\'s turn centre', writers: ['fw.arc'], readers: ['fw.yoyo'], delay: 'leadDr', smoothing: 'none', limits: '', trace: 'dFt', source: 'Fable F10 (second review)' },
  { id: 'closureArc', name: 'Arc closure', unit: 'ft/s, + closing', frame: 'round Lead\'s circle (level: along his path)', writers: ['fw.arc'], readers: ['fw.aimTurn', 'fw.yoyo', 'fw.power'], delay: 'leadDr', smoothing: 'none', limits: '', trace: 'cActualFtps', source: 'R2: in a turn; level, cActual is the closure on his swept place' },
  { id: 'shortKt', name: 'Short of Lead\'s speed', unit: 'KIAS', frame: '', writers: ['fw.perception'], readers: ['fw.jobs'], delay: 'leadLate', smoothing: 'none', limits: '', trace: null, source: 'TS-233 "Drop low inside, MAX"' },
  // fighting wing: commands and states
  { id: 'cWant', name: 'Wanted closure c*', unit: 'ft/s', frame: '', writers: ['fw.aimTurn', 'fw.aimSwept'], readers: ['fw.aimTurn', 'fw.power'], delay: 'none', smoothing: 'none', limits: '±25 ft/s within 300 ft, ±60 beyond (turn); ±25 (level)', trace: 'cWantFtps', source: 'Fable F1, F3' },
  { id: 'offset', name: 'Offset command d_cmd', unit: 'ft, + inside', frame: 'Lead\'s turn centre', writers: ['fw.aimTurn'], readers: ['fw.steer'], delay: 'none', smoothing: 'slew 60 ft/s', limits: '±400 ft', trace: 'offFt', source: 'Fable F1' },
  { id: 'residual', name: 'Closure the aim can\'t give', unit: 'ft/s of speed', frame: '', writers: ['fw.aimTurn', 'fw.aimSwept'], readers: ['fw.power'], delay: 'none', smoothing: 'none', limits: '±15 KIAS', trace: null, source: 'spec 7e.7 power row' },
  { id: 'aimPoint', name: 'Aim point', unit: 'ft', frame: 'world', writers: ['fw.aimTurn', 'fw.aimSwept', 'fw.lagFirst', 'fw.noseBehind'], readers: ['fw.steer'], delay: 'none', smoothing: 'eased 1.5 s against Lead, every step', limits: '', trace: 'aim', traceNote: 'the aim\'s kind (lead, pure, lag, lagFirst, behind, swept, sTurn), not the point', source: 'Patrick 14 Oct 2026 route positions; R11' },
  { id: 'aimTurnFf', name: 'Aim line turn fed forward', unit: 'G', frame: 'turn plane', writers: ['fw.steer'], readers: ['fw.filter'], delay: 'none', smoothing: '0.5 s', limits: '1.5 ω_L + 3°/s', ffKind: 'hidden', trace: null, source: 'Fable F10; R3' },
  { id: 'turnAsk', name: 'Turn ask (aim\'s)', unit: 'ft/s², rad/s', frame: 'turn plane', writers: ['fw.steer'], readers: ['fw.filter'], delay: 'none', smoothing: '', limits: '', trace: 'omNomDps', source: 'spec 7e.7 steering row' },
  { id: 'turnFlown', name: 'Turn flown', unit: 'ft/s², rad/s', frame: 'turn plane', writers: ['fw.filter'], readers: ['fw.lift'], delay: 'none', smoothing: '', limits: 'stick shaker (filter); the cap (lift)', trace: 'omPickDps', traceNote: 'the filter\'s turn while it acts, else null', source: 'TS-233 filter' },
  { id: 'predPass', name: 'Predicted pass (filter)', unit: 'ft slant', frame: '', writers: ['fw.filter'], readers: ['fw.filter'], delay: 'leadDr', smoothing: '', limits: '', trace: 'passFt', source: 'Squires et al. as mapped in formation-control-research-14oct.md §3.1' },
  { id: 'predGuard', name: 'Predicted pass (guard)', unit: 'ft slant', frame: '', writers: ['fw.guard'], readers: ['fw.gcap', 'fw.pitchOwner'], delay: 'picture04', smoothing: '', limits: '', trace: 'predFt', source: 'R8: a second predictor' },
  { id: 'lineShort', name: 'Wing line out of reach', unit: 'flag', frame: '', writers: ['fw.filter'], readers: ['fw.noseBehind'], delay: 'state', smoothing: '', limits: '', trace: 'lineShort', source: 'Fable F6; R9' },
  { id: 'filterHold', name: 'Filter hold (1 s)', unit: 's', frame: '', writers: ['fw.filter'], readers: ['fw.power', 'fw.pitchOwner'], delay: 'state', smoothing: '', limits: '', trace: null, source: 'R9' },
  { id: 'filterPull', name: 'Filter needs more G', unit: 'flag', frame: '', writers: ['fw.filter'], readers: ['fw.gcap'], delay: 'none', smoothing: '', limits: '', trace: null, source: 'Patrick 14 Oct 2026: references, not walls' },
  { id: 'guardOn', name: 'Guard on', unit: 'flag', frame: '', writers: ['fw.guard'], readers: ['fw.steer', 'fw.pitchOwner', 'fw.gcap', 'fw.power'], delay: 'state', smoothing: '', limits: '', trace: null, source: 'R8' },
  { id: 'job', name: 'Job label', unit: 'words', frame: '', writers: ['fw.jobs', 'fw.filter'], readers: [], delay: 'state', smoothing: '', limits: '', trace: 'job', source: 'History note: the filter\'s engagement changed only this label' },
  { id: 'turning', name: 'Lead turning (job)', unit: 'flag', frame: '', writers: ['fw.jobs'], readers: ['fw.arc', 'fw.aimTurn', 'fw.aimSwept', 'fw.noseBehind', 'fw.yoyo', 'fw.power', 'fw.filter'], delay: 'state', smoothing: '10° / 5° held 1 s', limits: '', trace: null, source: 'Fable F4' },
  { id: 'heightTarget', name: 'Height target', unit: 'ft against Lead', frame: 'turn-plane normal', writers: ['fw.jobs', 'fw.pitchOwner'], readers: ['fw.vertical'], delay: 'none', smoothing: 'jobs: eased 2 s or 15 s', limits: '±200 ft band for the stack family', trace: 'heightTargetFt', source: 'Fable F7, F9; TS-233' },
  { id: 'pitchOwnerName', name: 'Pitch owner', unit: 'name', frame: '', writers: ['fw.pitchOwner'], readers: [], delay: 'state', smoothing: '2 s hold', limits: '', trace: 'pitchOwner', source: 'Fable F9' },
  { id: 'yoyoH', name: 'Yo-yo height', unit: 'ft', frame: '', writers: ['fw.yoyo'], readers: ['fw.pitchOwner'], delay: 'none', smoothing: '', limits: '100-200 ft', trace: 'yoyoFt', source: 'TS-233 (no 400 ft cap)' },
  { id: 'lowInside', name: 'Low inside', unit: 'flag', frame: '', writers: ['fw.jobs'], readers: ['fw.power'], delay: 'state', smoothing: '', limits: '', trace: 'fwLow', source: 'TS-233' },
  { id: 'vertAsk', name: 'Vertical G ask', unit: 'G', frame: 'turn-plane normal', writers: ['fw.vertical'], readers: ['fw.filter', 'fw.lift'], delay: 'none', smoothing: '', limits: '±1 G', trace: null, source: 'spec 7e.7' },
  { id: 'gCapNow', name: 'G cap', unit: 'G', frame: '', writers: ['fw.gcap'], readers: ['fw.lift'], delay: 'none', smoothing: '', limits: 'Lead + 1.5 under the shaker, or the aircraft\'s', trace: null, source: 'spec 7e.7 (estimate); shaker physical' },
  { id: 'liftFw', name: 'Lift asked (fighting wing)', unit: 'G vector', frame: 'world', writers: ['fw.lift'], readers: ['ac.pointMass'], delay: 'none', smoothing: '', limits: '0.5 G to the cap', trace: null, traceNote: 'the gauge records his flown g and bank', source: '' },
  { id: 'wantKias', name: 'Wanted speed', unit: 'KIAS', frame: '', writers: ['fw.power'], readers: ['ac.speedHold'], delay: 'leadLate', smoothing: '', limits: 'Lead ± 15 KIAS', trace: null, source: 'Patrick 4 Oct 19:12Z band' },
  { id: 'powerBack', name: 'Power back (flag)', unit: 'flag', frame: '', writers: ['fw.power'], readers: ['fw.yoyo'], delay: 'state', smoothing: '', limits: '', trace: null, source: 'R9: power to yo-yo' },
  { id: 'throttle', name: 'Throttle', unit: 'share of full thrust', frame: '', writers: ['fw.power', 'ac.speedHold', 'cf.shaper'], readers: ['ac.engine'], delay: 'none', smoothing: '', limits: '0 to MAX', trace: 'fwTorquePct', traceNote: 'torque %, fighting wing; close formation: torquePct', source: '' },
  { id: 'brakes', name: 'Idle and boards', unit: 'flags', frame: '', writers: ['fw.power'], readers: ['ac.engine', 'ac.pointMass'], delay: 'none', smoothing: '', limits: '', trace: 'fwBrakes', source: 'TS-233' },
  // close formation
  { id: 'cfDev', name: 'Deviation (plane, line, along)', unit: 'ft', frame: 'Lead\'s wing plane', writers: ['cf.perception'], readers: ['cf.supervisor', 'cf.law'], delay: 'picture03', smoothing: 'none', limits: '', trace: 'planeFt', traceNote: 'planeFt, lineFt, alongFt (the gauge\'s own)', source: 'spec 7b.3 (plane, line, hinge)' },
  { id: 'cfRate', name: 'Deviation rates', unit: 'ft/s', frame: 'Lead\'s wing plane', writers: ['cf.perception'], readers: ['cf.supervisor', 'cf.law'], delay: 'picture03', smoothing: '0.1 s (CLOSE_SEE.filterSec)', limits: '', trace: null, source: 'spec 7b.6d item 7' },
  { id: 'cfLeadAhead', name: 'Lead\'s bank and G 0.3 s ahead', unit: '°, G', frame: 'Lead', writers: ['cf.perception'], readers: ['cf.lift'], delay: 'picture03', smoothing: '0.1 s, then dead-reckoned 0.3 s', limits: '', ffKind: 'physics', trace: null, source: 'spec 7b.6d item 5; TS-227' },
  { id: 'cfPlaceMotion', name: 'His place\'s motion', unit: 'G, ft/s', frame: 'Lead\'s frame', writers: ['cf.perception'], readers: ['cf.lift', 'cf.holding', 'cf.powerLead'], delay: 'picture03', smoothing: '0.1 s', limits: '', ffKind: 'physics', trace: null, source: 'spec 7b.6d item 4 (rigid body)' },
  { id: 'cfJob', name: 'Job and masks', unit: 'name, 0-1', frame: '', writers: ['cf.supervisor'], readers: ['cf.law', 'cf.shaper'], delay: 'state', smoothing: 'masks eased 0.5/s', limits: '', trace: 'job', source: 'spec 7b.6d item 12' },
  { id: 'cfHoldPct', name: 'Holding power', unit: 'torque %', frame: '', writers: ['cf.holding'], readers: ['cf.law', 'cf.shaper'], delay: 'picture03', smoothing: '', limits: '', ffKind: 'physics', trace: null, source: 'Patrick 13 Oct 2026; powerFor' },
  { id: 'cfLeadPct', name: 'Power lead', unit: 'torque %', frame: '', writers: ['cf.powerLead'], readers: ['cf.law'], delay: 'picture03', smoothing: '', limits: '', ffKind: 'physics', trace: null, source: 'spec 7b.5' },
  { id: 'cfWant', name: 'Corrections wanted', unit: 'G, G, torque %', frame: 'Lead\'s wing plane', writers: ['cf.law'], readers: ['cf.shaper'], delay: 'none', smoothing: '', limits: '', trace: null, source: 'spec 7b.6c' },
  { id: 'cfHand', name: 'Corrections given', unit: 'G, G, torque %', frame: 'Lead\'s wing plane', writers: ['cf.shaper'], readers: ['cf.lift', 'cf.law'], delay: 'none', smoothing: 'torque rate', limits: 'per job', trace: 'torquePct', traceNote: 'torque only', source: 'spec 7b.6d item 6' },
  { id: 'cfPlace', name: 'The place he aims at', unit: 'ft', frame: 'Lead\'s frame', writers: ['cf.station'], readers: ['cf.perception'], delay: 'none', smoothing: '', limits: 'deconfliction', trace: null, source: 'spec 7c.3' },
  { id: 'liftCf', name: 'Lift asked (close formation)', unit: 'G vector', frame: 'world', writers: ['cf.lift'], readers: ['ac.pointMass'], delay: 'none', smoothing: '', limits: '', trace: null, source: 'spec 7b.6d item 8' },
]);

/** Gauge columns every aircraft has, not wingman signals (the check accepts them). */
export const GENERIC_COLUMNS = Object.freeze(['t', 'g', 'gRate', 'bank', 'roll', 'drawnDps', 'climbDeg', 'kias', 'rangeFt', 'lineFt', 'alongFt']);

/**
 * The shared resources: the controls (what several blocks write) and the shared signals (what several read). rule.type is
 * one of sum, priority, switch (on/off with thresholds, hysteresis, hold) or phased (authority growing smoothly with a
 * measure). writers: [block, how]. A resource with two writers and no rule would be a fight (C1).
 */
export const RULE_TYPES = Object.freeze(['sum', 'priority', 'switch', 'phased', 'single']);
export const RESOURCES = Object.freeze([
  { id: 'turnG', name: 'Turn G (in Lead\'s turn plane)', kind: 'control', tech: 'fw',
    writers: [['fw.steer', 'aim line turn fed forward + 0.05 G/deg'], ['fw.filter', 'replaces it when the predicted pass fails'], ['fw.lift', 'cuts it at the cap; unload-roll-pull'], ['fw.gcap', 'sets the cap']],
    rule: { type: 'priority', detail: 'Filter replaces steering (a switch, no hysteresis on failing); then the cap cuts the turn, never the hold and the vertical (R6)' } },
  { id: 'vertG', name: 'Up-down G (square to the turn plane)', kind: 'control', tech: 'fw',
    writers: [['fw.vertical', 'PD on the height target'], ['fw.lift', 'the 1 G hold, kept first at the cap']],
    rule: { type: 'sum', detail: 'The 1 G hold square to his path + the PD\'s ask; both kept first at the cap. The PD\'s target is the pitch owner\'s' } },
  { id: 'pitchOwner', name: 'Pitch owner (height target)', kind: 'control', tech: 'fw',
    writers: [['fw.pitchOwner', 'pass-clear (guard on and filter held)'], ['fw.noseBehind', 'in and down 300 ft'], ['fw.yoyo', 'climb 100-200 ft'], ['fw.jobs', 'stack −50, quick fix ±150, low inside −300 (eased)']],
    rule: { type: 'priority', detail: 'pass-clear > in and down > yo-yo > stack family; a 2 s hold except pass-clear and in and down (Fable F7, F9)' } },
  { id: 'bankRoll', name: 'Bank and roll', kind: 'control', tech: 'fw',
    writers: [['fw.lift', 'from the lift vector (gAndBankForLift); the point mass rolls there at 60°/s within the T-6A']],
    rule: { type: 'single', detail: 'Bank follows the lift vector; no controller asks bank directly' } },
  { id: 'throttle', name: 'Throttle', kind: 'control', tech: 'fw',
    writers: [['fw.power', 'wanted KIAS through the speed hold'], ['fw.power', '20% while the filter held and closing'], ['fw.power', 'MAX low inside'], ['fw.power', '20% on the yo-yo\'s way down'], ['ac.speedHold', '0.2 kt/s per kt + G drag']],
    rule: { type: 'switch', detail: 'An if-chain of relays over the speed hold: filter cut / yo-yo down, then low inside MAX, else the hold (F5 of the review: four owners)' } },
  { id: 'idle', name: 'Idle', kind: 'control', tech: 'fw', writers: [['fw.power', 'arc or slant closure > 40 ft/s, off < 25']], rule: { type: 'switch', detail: 'Hysteresis 40/25 ft/s; overrides the throttle' } },
  { id: 'boards', name: 'Boards', kind: 'control', tech: 'fw', writers: [['fw.power', 'closure > 60 ft/s, off < 35']], rule: { type: 'switch', detail: 'Hysteresis 60/35 ft/s' } },
  { id: 'aimPointR', name: 'Aim point', kind: 'control', tech: 'fw',
    writers: [['fw.aimTurn', 'turning'], ['fw.aimSwept', 'level'], ['fw.lagFirst', 'blended in 3.5 s'], ['fw.noseBehind', 'replaces'], ['fw.steer', 'eases it 1.5 s; at once with the guard or nose behind']],
    rule: { type: 'priority', detail: 'Call order: turn or swept, then lag first (blend), then nose behind (replace); eased 1.5 s every step' } },
  { id: 'closureArcR', name: 'Arc closure (read)', kind: 'signal', tech: 'fw',
    writers: [['fw.arc', 'from velocities, now']], readers: ['fw.aimTurn', 'fw.yoyo', 'fw.power'],
    rule: { type: 'single', detail: 'One signal, three readers: the arc loop\'s D, the yo-yo\'s gaining test, the filter cut\'s "closing" and the brakes in a turn' } },
  { id: 'closureSlantR', name: 'Slant closure (read)', kind: 'signal', tech: 'fw',
    writers: [['fw.perception', '1 s smoothed, 0.4 s late']], readers: ['fw.filter', 'fw.guard', 'fw.jobs', 'fw.power'],
    rule: { type: 'single', detail: 'Pass line, S-turns, quick fix, exit side, entry case, brakes level and their "where" (R2)' } },
  { id: 'rangeR', name: 'Range (slant)', kind: 'signal', tech: 'fw', writers: [['fw.perception', '0.4 s late']], readers: ['fw.guard', 'fw.jobs', 'fw.power'], rule: { type: 'single', detail: 'Jobs\' thresholds and the brakes\' "where"; in a turn the loops use s instead' } },
  { id: 'aspectR', name: 'Aspect', kind: 'signal', tech: 'fw', writers: [['fw.perception', '0.4 s late']], readers: [], rule: { type: 'single', detail: 'Read by nothing (spec 7e.7 meant it for the supervisor)' } },
  { id: 'sR', name: 'Arc s', kind: 'signal', tech: 'fw', writers: [['fw.arc', '']], readers: ['fw.aimTurn', 'fw.yoyo', 'fw.power'], rule: { type: 'single', detail: 'Arc loop (10 s) and power (15 s) both act on its error (R5)' } },
  { id: 'dR', name: 'Offset d', kind: 'signal', tech: 'fw', writers: [['fw.arc', '']], readers: ['fw.yoyo'], rule: { type: 'single', detail: 'Only the yo-yo reads the measured d; the arc loop works on closure, not d' } },
  // close formation
  { id: 'cfTorque', name: 'Torque (close)', kind: 'control', tech: 'cf',
    writers: [['cf.holding', 'feed-forward'], ['cf.powerLead', 'feed-forward'], ['cf.law', 'P and D on the hinge pace'], ['cf.shaper', 'sizes and rate']],
    rule: { type: 'sum', detail: 'holding + lead + correction, the correction sized around holding + lead (the working cross-feed pattern, R10)' } },
  { id: 'cfLift', name: 'Lift (close)', kind: 'control', tech: 'cf',
    writers: [['cf.lift', 'Lead\'s lift 0.3 s ahead + place motion'], ['cf.law', 'plane and line corrections'], ['cf.shaper', 'pressure sizes']],
    rule: { type: 'sum', detail: 'One lift vector: feed-forward + corrections (spec 7b.6d item 8)' } },
  { id: 'cfMasks', name: 'Plane, line, hinge shares', kind: 'control', tech: 'cf', writers: [['cf.supervisor', 'masks eased 0.5 per second']], rule: { type: 'phased', detail: 'A large move shows the line\'s error once on the plane, the along error once on the line, each eased in: authority grows smoothly' } },
  { id: 'cfCaps', name: 'Pressure sizes', kind: 'control', tech: 'cf', writers: [['cf.shaper', 'eased at capsPerSec between jobs']], rule: { type: 'phased', detail: 'A change of job never steps the sizes (bumpless)' } },
]);

/** The cross-links that bypass the aircraft (R9), drawn as their own edges. */
export const CROSSLINKS = Object.freeze([
  { from: 'fw.power', to: 'fw.yoyo', signal: 'powerBack', note: 'power\'s relay state is a yo-yo trigger' },
  { from: 'fw.filter', to: 'fw.noseBehind', signal: 'lineShort', note: 'the filter\'s search result turns on the nose behind' },
  { from: 'fw.filter', to: 'fw.power', signal: 'filterHold', note: 'the filter cuts power for 1 s while closing' },
  { from: 'fw.filter', to: 'fw.pitchOwner', signal: 'filterHold', note: 'with the guard on, the filter\'s hold gives pass-clear pitch' },
  { from: 'fw.guard', to: 'fw.pitchOwner', signal: 'guardOn', note: 'a second predictor\'s switch decides pass-clear' },
  { from: 'fw.guard', to: 'fw.steer', signal: 'guardOn', note: 'skips the aim blend' },
  { from: 'fw.guard', to: 'fw.power', signal: 'guardOn', note: 'freezes the power integral' },
  { from: 'fw.vertical', to: 'fw.filter', signal: 'vertAsk', note: 'the filter counts the vertical asked (Fable F3): physics, a good link' },
]);

/**
 * The history note (`Pat's claude work/formation-review-12oct/fighting-wing-code-history.md`) on its cells: from, to are
 * block ids (the N² cell); res the resource column it acted on; status kept, folded (always on, its off branch gone),
 * removed (flew worse) or label (changed a label only).
 */
export const HISTORY = Object.freeze([
  { item: 'T28 guard (miss, reversal phases)', commit: '9ab5a0e4', from: 'fw.guard', to: 'fw.steer', res: 'aimPointR', status: 'folded' },
  { item: 'T29 aim loop, quick fix, power PI (three closures to 47 ft/s)', commit: '06196de8', from: 'fw.aimTurn', to: 'fw.power', res: 'sR', status: 'kept' },
  { item: 'T29a unload, roll, pull', commit: 'd4ae55f9', from: 'fw.lift', to: 'ac.pointMass', res: 'turnG', status: 'kept' },
  { item: 'T29a one owner for closure in a turn (no power I)', commit: 'd4ae55f9', from: 'fw.aimTurn', to: 'fw.power', res: 'sR', status: 'kept' },
  { item: 'T29a low inside at MAX', commit: 'd4ae55f9', from: 'fw.jobs', to: 'fw.power', res: 'throttle', status: 'kept' },
  { item: 'guard.filter: the miss becomes the filter', commit: 'b60a4a2b', from: 'fw.filter', to: 'fw.lift', res: 'turnG', status: 'folded' },
  { item: 'followCircle: follow Lead\'s circle 3 s ahead', commit: 'b60a4a2b', from: 'fw.aimTurn', to: 'fw.steer', res: 'aimPointR', status: 'folded' },
  { item: 'deadReckon (F5)', commit: '04ce6768', from: 'fw.leadNow', to: 'fw.steer', res: 'aimPointR', status: 'folded' },
  { item: 'guard.shakerBound (F2)', commit: '31d304e6', from: 'fw.filter', to: 'fw.gcap', res: 'turnG', status: 'folded' },
  { item: 'guard.sharedLift (F3)', commit: 'd5bef644', from: 'fw.vertical', to: 'fw.filter', res: 'turnG', status: 'folded' },
  { item: 'guard.passLine (F4)', commit: '26461ad3', from: 'fw.perception', to: 'fw.filter', res: 'closureSlantR', status: 'folded' },
  { item: 'arcFrame (F10)', commit: '0a48470d', from: 'fw.arc', to: 'fw.aimTurn', res: 'sR', status: 'folded' },
  { item: 'arcLoop (F1)', commit: '17f32caa', from: 'fw.arc', to: 'fw.aimTurn', res: 'sR', status: 'folded' },
  { item: 'pathCaps (F7), built off, retried, removed', commit: '2380ce07, 75f3163f, 1b395b73', from: 'fw.aimTurn', to: 'fw.steer', res: 'aimPointR', status: 'removed' },
  { item: 'guard.wingLine (F6)', commit: '4251723f', from: 'fw.filter', to: 'fw.lift', res: 'turnG', status: 'folded' },
  { item: 'yoyo.on and the pitch owners (F8, F9)', commit: 'f0cfac10', from: 'fw.yoyo', to: 'fw.pitchOwner', res: 'pitchOwner', status: 'folded' },
  { item: 'guard.offClosingOnly: power off only while closing', commit: '1268e5f9', from: 'fw.filter', to: 'fw.power', res: 'throttle', status: 'folded' },
  { item: 'guard.tighterAtMin, built off then on', commit: '050968a8, fed616aa', from: 'fw.perception', to: 'fw.filter', res: 'turnG', status: 'folded' },
  { item: 'guard.capture: candidates held 3 s then Lead\'s turn', commit: 'c67dc04e', from: 'fw.filter', to: 'fw.lift', res: 'turnG', status: 'folded' },
  { item: 'behind.on: nose behind, in and down', commit: '4db3ca78', from: 'fw.filter', to: 'fw.noseBehind', res: 'aimPointR', status: 'folded' },
  { item: 'behind.onCircle: aim on Lead\'s circle, removed', commit: '4db3ca78, 1b395b73', from: 'fw.noseBehind', to: 'fw.steer', res: 'aimPointR', status: 'removed' },
  { item: 'arcFeedForward: the half-gain fix', commit: 'f379224d', from: 'fw.arc', to: 'fw.aimTurn', res: 'sR', status: 'folded' },
  { item: 'lagFirst.on and guard.lineShortAll', commit: '32359104', from: 'fw.lagFirst', to: 'fw.steer', res: 'aimPointR', status: 'folded' },
  { item: 'aimTurnCap', commit: 'b1261ec6', from: 'fw.steer', to: 'fw.filter', res: 'turnG', status: 'folded' },
  { item: 'guard.engage: filter hysteresis (label only)', commit: 'fe258241', from: 'fw.filter', to: 'fw.filter', res: 'turnG', status: 'label' },
  { item: 'guard.engage.holdsPower, removed', commit: 'fe258241, 1b395b73', from: 'fw.filter', to: 'fw.power', res: 'throttle', status: 'removed' },
  { item: 'yoyo.excessFtps and yoyo.maxFt', commit: '794e5a7e', from: 'fw.arc', to: 'fw.yoyo', res: 'closureArcR', status: 'folded' },
  { item: 'speedFf: V_L(1 − d/R) to power, removed', commit: '2f96613f, 1b395b73', from: 'fw.arc', to: 'fw.power', res: 'throttle', status: 'removed' },
  { item: 'brakes: idle and boards, thresholds raised', commit: '2423fc47', from: 'fw.arc', to: 'fw.power', res: 'idle', status: 'folded' },
  { item: 'guard.lagSide: lag side first and rescue', commit: '9e5c860f', from: 'fw.filter', to: 'fw.lift', res: 'turnG', status: 'folded' },
]);

/**
 * The switching map for today's code. flies: 'yes' changes the flying, 'label' only the trace, 'partly'. ripple: the
 * trigger signal's column for tools/control-map/ripple.mjs, with the on line and the band, or null (part 2).
 */
export const SWITCHES = Object.freeze([
  { id: 'turning', block: 'fw.jobs', trigger: 'Lead\'s seen bank', on: '|bank| > 10° held 1 s', off: '|bank| < 5° held 1 s', hold: '1 s each way', changes: 'circle or swept aim; arc frame; power\'s I; quick fix and low inside allowed', flies: 'yes', note: 'Starts 1 s after the 10°: 1.4 s after Lead\'s roll is seen' },
  { id: 'entryCase', block: 'fw.jobs', trigger: 'slant, slant closure', on: 'tight < 560 ft or closure > 20 ft/s; stretched > 700 ft', off: 'at each turn start or reversal', hold: 'the turn', changes: 'the job label only', flies: 'label', note: 'R7; the gauge\'s "in position" 780 ft start reads stretched' },
  { id: 'exitSide', block: 'fw.jobs', trigger: 'slant, slant closure at the turn end', on: 'tight: slant < 600 or closure > 15 → outside; stretched: > 700 or opening > 10 → inside', off: '-', hold: 'until the next turn', changes: 'the swept side', flies: 'yes', note: 'SMM Fig 12.23' },
  { id: 'sTurn', block: 'fw.jobs', trigger: 'slant, slant closure', on: 'slant < 550 or (closure > 15 and slant < 650)', off: 'slant ≥ 600 and closure < 10', hold: 'side swapped at half the swept lateral', changes: 'the swept side, back and forth', flies: 'yes', note: 'Patrick 14 Oct 2026', ripple: { col: 'slantFt', line: 550, band: 50 } },
  { id: 'quickFix', block: 'fw.jobs', trigger: 'slant error from 625, slant closure', on: 'error > 150 ft and closure < 10 (down); closure > 20 and error < 75 (up)', off: '|error| < 75 and |closure| < 10', hold: 'target eased 2 s, back over 15 s', changes: 'height target ±150 ft (level only)', flies: 'yes', note: 'Fable F7', ripple: { col: 'closureFtps', line: 20, band: 10 } },
  { id: 'lowInside', block: 'fw.jobs', trigger: 'short of Lead\'s KIAS', on: '> 5 kt', off: '< 1 kt', hold: '-', changes: 'height −300 ft, power MAX (stack family has pitch)', flies: 'yes', note: 'TS-233 "Drop low inside, MAX"' },
  { id: 'lagFirst', block: 'fw.lagFirst', trigger: 'Lead\'s seen bank toward his side', on: 'crossing 10°', off: 'timer 2.5 s + 1 s ease', hold: 'the timer', changes: 'aim 20° outward of Lead\'s circle', flies: 'yes', note: 'Goes: ruling 14 Oct 2026 ("fly straight ahead until I\'m on the turn circle I want")' },
  { id: 'noseBehind', block: 'fw.noseBehind', trigger: 'the filter\'s lineShort (last step)', on: 'lineShort', off: 'lineShort false and 200 ft behind the wing line', hold: '-', changes: 'aim where Lead was 1 s ago; pitch in and down 300 ft', flies: 'yes', note: 'A switch driven by a switch (R9)' },
  { id: 'yoyo', block: 'fw.yoyo', trigger: 'slow-to-hold, powerBack, arc closure excess', on: '> 10 kt and power back and > 20 ft/s over the arc loop\'s want', off: 'on circle (arc error and d < 150 ft), well behind, opening, or Lead\'s turn over; down ends within 50 ft of the stack', hold: '-', changes: 'height target +100 to +200 ft, then down with power back', flies: 'yes', note: 'Three inputs from three blocks' },
  { id: 'ownerHold', block: 'fw.pitchOwner', trigger: 'the owner wanted', on: 'a new owner', off: '-', hold: '2 s, except pass-clear and in and down at once', changes: 'which height target the PD flies', flies: 'yes', note: 'Fable F9' },
  { id: 'guard', block: 'fw.guard', trigger: 'the guard\'s own predicted pass (0.4 s old picture), slant', on: '< 600 ft predicted or < 500 ft now', off: '> 700 ft for 3 s', hold: '3 s', changes: 'pass-clear wanted (with the filter\'s hold); power I frozen; aim not blended; G cap opened under 500 ft', flies: 'yes', note: 'Replaced by the taper ruling (14 Oct 2026)', ripple: { col: 'predFt', line: 600, band: 100 } },
  { id: 'filterFailing', block: 'fw.filter', trigger: 'his aim\'s predicted pass and wing-line distance', on: 'pass < 500 + 1.4 s × closure (≥ 600 ft) or < 100 ft behind the wing line', off: 'the same line, no hysteresis', hold: 'none', changes: 'replaces his turn with the nearest clearing one', flies: 'yes', note: 'The working switch: no band at all (F3 of the review)', ripple: { col: 'passFt', line: 600, band: 0 } },
  { id: 'filterEngaged', block: 'fw.filter', trigger: 'the same', on: 'failing', off: 'clear by 50 ft for 1 s', hold: '1 s', changes: 'the job label "guard-filter" only', flies: 'label', note: 'History: fe258241 moved job counts, not the flying' },
  { id: 'filterSide', block: 'fw.filter', trigger: 'the cost of each candidate', on: 'the other side clears and costs less by more than one full turn range', off: '-', hold: 'cost penalty, no time dwell', changes: 'which way the filter turns him', flies: 'yes', note: 'The either-or that breaks at +0.2 s (review F8)' },
  { id: 'filterHold', block: 'fw.filter', trigger: 'the filter acted', on: 'it changed his turn', off: '1 s after', hold: '1 s', changes: 'power to 20% while closing; pass-clear wanted with the guard on', flies: 'yes', note: 'R9' },
  { id: 'powerCut', block: 'fw.power', trigger: 'filter hold and arc closure sign', on: 'held and closing > 0', off: 'closure ≤ 0 or hold over', hold: 'none on the closure sign', changes: 'throttle to 20% torque', flies: 'yes', note: 'Toggled 30 times in the turn away from in position (review F3)', ripple: { col: 'cActualFtps', line: 0, band: 0 } },
  { id: 'downPower', block: 'fw.power', trigger: 'yo-yo down and faster than Lead', on: 'both', off: 'either', hold: '-', changes: 'throttle to 20%', flies: 'yes', note: '' },
  { id: 'lowMax', block: 'fw.power', trigger: 'low inside with the stack family on pitch', on: 'both', off: 'either', hold: '-', changes: 'MAX', flies: 'yes', note: '' },
  { id: 'idle', block: 'fw.power', trigger: 'closure (arc in a turn, else slant), where, not slow', on: '> 40 ft/s and (slant < 650 or closing on the pass line)', off: '< 25 ft/s', hold: 'band 15 ft/s', changes: 'throttle 0 (3.5 s spool-up)', flies: 'yes', note: 'brakes.slowKt 0 acts as a relay on speed (review F12)', ripple: { col: 'cActualFtps', line: 40, band: 15 } },
  { id: 'boards', block: 'fw.power', trigger: 'as idle', on: '> 60 ft/s', off: '< 35 ft/s', hold: 'band 25 ft/s', changes: 'boards out', flies: 'yes', note: '', ripple: { col: 'cActualFtps', line: 60, band: 25 } },
  { id: 'capOpen', block: 'fw.gcap', trigger: 'guard pass < 500 ft, or the filter needs more', on: 'either', off: 'neither', hold: 'none', changes: 'G cap from Lead + 1.5 to the aircraft\'s', flies: 'yes', note: 'A step in the cap' },
  { id: 'unloadRollPull', block: 'fw.lift', trigger: 'wings off the wanted lift', on: '> 20°', off: '≤ 20°', hold: 'none', changes: 'pulls only the share along the wings', flies: 'yes', note: 'A kink, continuous in value' },
  { id: 'turnPlane', block: 'fw.steer', trigger: 'Lead\'s seen turn rate', on: '> 1°/s', off: '≤ 1°/s', hold: 'none', changes: 'steering and the vertical in Lead\'s turn plane or the level plane', flies: 'yes', note: '' },
  { id: 'arcLimit', block: 'fw.aimTurn', trigger: 'arc error', on: '|error| ≥ 300 ft: ±60 ft/s', off: '< 300 ft: ±25 ft/s', hold: 'none', changes: 'the wanted closure\'s limit jumps 25 ↔ 60 ft/s', flies: 'yes', note: 'A step in a saturation; a phased blend fits' },
  { id: 'aimKind', block: 'fw.aimTurn', trigger: 'offset against a quarter route position (30 ft)', on: '-', off: '-', hold: '-', changes: 'the trace\'s lead/pure/lag', flies: 'label', note: 'routeFt is read only here' },
  // close formation
  { id: 'cfJobs', block: 'cf.supervisor', trigger: 'distance off and rate', on: 'small > 1.5 ft; large > 10 ft or > 2 ft/s', off: 'station < 1 ft; small < 8 ft and < 1.5 ft/s', hold: 'dead bands', changes: 'pressure sizes (eased) and the plane, line, hinge masks (eased)', flies: 'yes', note: 'Each change phased in by the shaper and masks: the working pattern' },
  { id: 'cfUnder', block: 'cf.supervisor', trigger: 'under Lead', on: 'below his plane inside his wingtip', off: '2 ft clear', hold: 'band 2 ft', changes: 'no upward correction', flies: 'yes', note: 'Patrick 13 Oct 2026' },
  { id: 'cfTelegraph', block: 'cf.shaper', trigger: 'Lead\'s seen roll rate', on: '> 1°/s', off: '≤ 1°/s', hold: 'none', changes: 'torque rate 20%/s × reach', flies: 'yes', note: 'A step in a rate limit' },
  { id: 'cfDeconflict', block: 'cf.station', trigger: 'his place against Lead', on: 'wings overlap, within a span + 2 ft, ahead of 5 ft behind the 3/9 line', off: 'dead bands 1-5 ft', hold: 'dead bands', changes: 'the place he aims at', flies: 'yes', note: 'spec 7c.3' },
]);

/**
 * The tuning ledger: every leaf of the four tables (values read from the code, sources from numbers.md). Keys are exact
 * paths or prefixes ending '.'. role: ruling (Patrick or a manual), geometry (standard physics or the aircraft), search
 * (search effort), tuning (a gain, time, threshold or limit to tune), sweep (an analysis knob), label (names a trace only),
 * unused. rec: what the recommended structure (review 2.7 with the 14 Oct rulings) does: keeps, changes, removes.
 */
export const LEDGER = Object.freeze({
  'CLOSE_SEE.delaySec': { role: 'ruling', block: 'cf.perception', rec: 'keeps' },
  'CLOSE_SEE.filterSec': { role: 'tuning', block: 'cf.perception', rec: 'keeps' },
  'CLOSE_SEE.aheadSec': { role: 'tuning', block: 'cf.perception', rec: 'keeps' },
  'CLOSE_WING.plane.': { role: 'tuning', block: 'cf.law', rec: 'keeps' },
  'CLOSE_WING.kPosPerSec': { role: 'tuning', block: 'cf.law', rec: 'keeps' },
  'CLOSE_WING.side.': { role: 'tuning', block: 'cf.law', rec: 'keeps' },
  'CLOSE_WING.fore.': { role: 'tuning', block: 'cf.law', rec: 'keeps' },
  'CLOSE_WING.deadFt': { role: 'ruling', block: 'cf.law', rec: 'keeps' },
  'CLOSE_WING.deadFtps': { role: 'ruling', block: 'cf.law', rec: 'keeps' },
  'CLOSE_WING.paceFtps': { role: 'ruling', block: 'cf.law', rec: 'keeps' },
  'CLOSE_WING.brakeTorquePct': { role: 'tuning', block: 'cf.law', rec: 'keeps' },
  'CLOSE_WING.boardsBelowPct': { role: 'ruling', block: 'cf.shaper', rec: 'keeps' },
  'CLOSE_WING.rollCatchUp': { role: 'tuning', block: 'cf.lift', rec: 'keeps' },
  'CLOSE_WING.telegraphTorquePctps': { role: 'tuning', block: 'cf.shaper', rec: 'keeps' },
  'CLOSE_WING.handOverBrakeKtps': { role: 'geometry', block: 'cf.supervisor', rec: 'keeps' },
  'CLOSE_WING.handOverReactSec': { role: 'ruling', block: 'cf.supervisor', rec: 'keeps' },
  'CLOSE_WING.jobs.': { role: 'tuning', block: 'cf.shaper', rec: 'keeps' },
  'CLOSE_WING.offStation.paceFtps': { role: 'ruling', block: 'cf.station', rec: 'keeps' },
  'CLOSE_WING.offStation.flowKt': { role: 'ruling', block: 'cf.station', rec: 'keeps' },
  'CLOSE_WING.offStation.': { role: 'tuning', block: 'cf.station', rec: 'keeps' },
  'CLOSE_WING.deconflict.': { role: 'tuning', block: 'cf.station', rec: 'keeps' },
  'CLOSE_WING.capsPerSec.': { role: 'tuning', block: 'cf.shaper', rec: 'keeps' },
  'CLOSE_WING.smallFromFt': { role: 'tuning', block: 'cf.supervisor', rec: 'keeps' },
  'CLOSE_WING.stationFromFt': { role: 'tuning', block: 'cf.supervisor', rec: 'keeps' },
  'CLOSE_WING.largeFromFt': { role: 'ruling', block: 'cf.supervisor', rec: 'keeps' },
  'CLOSE_WING.smallBackFt': { role: 'tuning', block: 'cf.supervisor', rec: 'keeps' },
  'CLOSE_WING.driftFtps': { role: 'tuning', block: 'cf.supervisor', rec: 'keeps' },
  'CLOSE_WING.driftBackFtps': { role: 'tuning', block: 'cf.supervisor', rec: 'keeps' },
  'CLOSE_WING.underClearFt': { role: 'tuning', block: 'cf.supervisor', rec: 'keeps' },
  'CLOSE_WING.plhBandFt': { role: 'tuning', block: 'cf.supervisor', rec: 'keeps' },
  'CLOSE_WING.plhPerSec': { role: 'tuning', block: 'cf.supervisor', rec: 'keeps' },
  'FW_SEE.delaySec': { role: 'ruling', block: 'fw.perception', rec: 'keeps' },
  'FW_SEE.extraDelaySec': { role: 'sweep', block: 'fw.perception', rec: 'keeps', why: 'analysis knob; part 2 adds the whole-picture delay beside it' },
  'FW_SEE.closureSec': { role: 'tuning', block: 'fw.perception', rec: 'keeps' },
  'FW_SEE.losSec': { role: 'tuning', block: 'fw.perception', rec: 'keeps' },
  'FW_SEE.gSec': { role: 'tuning', block: 'fw.perception', rec: 'keeps' },
  'FW_SEE.historySec': { role: 'unused', block: 'fw.perception', rec: 'removes', why: 'no caller since the tidy' },
  'FW_WING.gPerDeg': { role: 'tuning', block: 'fw.steer', rec: 'changes', why: 'the approach-angle law\'s gain' },
  'FW_WING.aimTurnSec': { role: 'tuning', block: 'fw.steer', rec: 'removes', why: 'the aim line\'s smoothing goes with the moving aim point (review 3)' },
  'FW_WING.aimTurnCap.': { role: 'tuning', block: 'fw.steer', rec: 'removes', why: 'no aim point to jump (review 3)' },
  'FW_WING.overLeadG': { role: 'tuning', block: 'fw.gcap', rec: 'keeps', why: 'an estimate (spec 7e.7), not a ruling' },
  'FW_WING.minG': { role: 'tuning', block: 'fw.lift', rec: 'keeps' },
  'FW_WING.rollDps': { role: 'tuning', block: 'ac.pointMass', rec: 'keeps', why: 'an estimate (spec 7e.7)' },
  'FW_WING.pullWithinDeg': { role: 'tuning', block: 'fw.lift', rec: 'keeps' },
  'FW_WING.turnPlaneRadps': { role: 'tuning', block: 'fw.steer', rec: 'keeps' },
  'FW_WING.blendSec': { role: 'tuning', block: 'fw.steer', rec: 'changes', why: 'phase blends of the path, not an every-step lag on the aim point (R11)' },
  'FW_WING.turnStartDeg': { role: 'tuning', block: 'fw.jobs', rec: 'changes', why: 'the phase starts at the roll seen, no 1 s hold (review 2.1)' },
  'FW_WING.turnEndDeg': { role: 'tuning', block: 'fw.jobs', rec: 'keeps' },
  'FW_WING.turnHoldSec': { role: 'tuning', block: 'fw.jobs', rec: 'changes', why: 'no hold at the entry (review 2.1)' },
  'FW_WING.happyFt.': { role: 'ruling', block: 'fw.jobs', rec: 'keeps' },
  'FW_WING.stretchedFt': { role: 'ruling', block: 'fw.jobs', rec: 'keeps' },
  'FW_WING.tightFt': { role: 'tuning', block: 'fw.jobs', rec: 'keeps' },
  'FW_WING.turnFrameDeg': { role: 'tuning', block: 'fw.arc', rec: 'keeps' },
  'FW_WING.arcTargetFt': { role: 'ruling', block: 'fw.aimTurn', rec: 'keeps' },
  'FW_WING.aimSec': { role: 'tuning', block: 'fw.aimTurn', rec: 'keeps' },
  'FW_WING.arcNearFt': { role: 'tuning', block: 'fw.aimTurn', rec: 'changes', why: 'a phased limit instead of a jump (switch arcLimit)' },
  'FW_WING.arcNearFtps': { role: 'tuning', block: 'fw.aimTurn', rec: 'keeps' },
  'FW_WING.arcFarFtps': { role: 'tuning', block: 'fw.aimTurn', rec: 'keeps' },
  'FW_WING.arcKc': { role: 'tuning', block: 'fw.aimTurn', rec: 'keeps' },
  'FW_WING.arcOffsetMaxFt': { role: 'tuning', block: 'fw.aimTurn', rec: 'keeps' },
  'FW_WING.arcSlewFtps': { role: 'tuning', block: 'fw.aimTurn', rec: 'keeps' },
  'FW_WING.minTurnRadps': { role: 'tuning', block: 'fw.aimTurn', rec: 'keeps' },
  'FW_WING.circleLookSec': { role: 'tuning', block: 'fw.aimTurn', rec: 'removes', why: 'the look-ahead point goes (review 3)' },
  'FW_WING.circleLeastFt': { role: 'tuning', block: 'fw.aimTurn', rec: 'removes', why: 'with the look-ahead point' },
  'FW_WING.routeFt': { role: 'label', block: 'fw.aimTurn', rec: 'removes', why: 'names the aim in the trace only' },
  'FW_WING.lagFirst.': { role: 'tuning', block: 'fw.lagFirst', rec: 'removes', why: 'ruled out 14 Oct 2026' },
  'FW_WING.behind.': { role: 'tuning', block: 'fw.noseBehind', rec: 'removes', why: 'the follower never puts him there (review 3)' },
  'FW_WING.sweptFt': { role: 'ruling', block: 'fw.aimSwept', rec: 'keeps' },
  'FW_WING.sweptDeg': { role: 'ruling', block: 'fw.aimSwept', rec: 'keeps' },
  'FW_WING.sweptLookSec': { role: 'tuning', block: 'fw.aimSwept', rec: 'removes', why: 'the line follower replaces the look-ahead (review 3)' },
  'FW_WING.aimMaxFtps': { role: 'tuning', block: 'fw.aimSwept', rec: 'keeps' },
  'FW_WING.aimSlewFtps': { role: 'tuning', block: 'fw.aimSwept', rec: 'keeps' },
  'FW_WING.sTurnFt': { role: 'tuning', block: 'fw.jobs', rec: 'keeps' },
  'FW_WING.sTurnClosureFtps': { role: 'tuning', block: 'fw.jobs', rec: 'keeps' },
  'FW_WING.sTurnDoneFt': { role: 'tuning', block: 'fw.jobs', rec: 'keeps' },
  'FW_WING.stackFt': { role: 'ruling', block: 'fw.jobs', rec: 'keeps' },
  'FW_WING.heightBandFt': { role: 'ruling', block: 'fw.jobs', rec: 'changes', why: 'where he settles, not a limit on the exit vertical (ruling 14 Oct 2026)' },
  'FW_WING.vertGPerFt': { role: 'tuning', block: 'fw.vertical', rec: 'keeps' },
  'FW_WING.vertGPerFtps': { role: 'tuning', block: 'fw.vertical', rec: 'keeps' },
  'FW_WING.vertMaxG': { role: 'tuning', block: 'fw.vertical', rec: 'keeps' },
  'FW_WING.quickFixFt': { role: 'tuning', block: 'fw.jobs', rec: 'removes', why: 'folds into the exit vertical (review 3)' },
  'FW_WING.quickFixFtps': { role: 'tuning', block: 'fw.jobs', rec: 'removes', why: 'folds into the exit vertical' },
  'FW_WING.quickFixHeightFt': { role: 'tuning', block: 'fw.jobs', rec: 'removes', why: 'folds into the exit vertical' },
  'FW_WING.quickReleaseFt': { role: 'tuning', block: 'fw.jobs', rec: 'removes', why: 'folds into the exit vertical' },
  'FW_WING.quickReleaseFtps': { role: 'tuning', block: 'fw.jobs', rec: 'removes', why: 'folds into the exit vertical; also read by S-turns and the exit side' },
  'FW_WING.quickSec': { role: 'tuning', block: 'fw.jobs', rec: 'removes', why: 'folds into the exit vertical\'s blend' },
  'FW_WING.stackReturnSec': { role: 'tuning', block: 'fw.jobs', rec: 'keeps' },
  'FW_WING.lowFt': { role: 'tuning', block: 'fw.jobs', rec: 'removes', why: 'low inside folds into the energy intent (review 3)' },
  'FW_WING.lowStartKt': { role: 'tuning', block: 'fw.jobs', rec: 'removes', why: 'into the intent' },
  'FW_WING.lowEndKt': { role: 'tuning', block: 'fw.jobs', rec: 'removes', why: 'into the intent' },
  'FW_WING.yoyo.slowKt': { role: 'tuning', block: 'fw.yoyo', rec: 'removes', why: 'the yo-yo\'s speed trigger (review 3)' },
  'FW_WING.yoyo.powerBackKt': { role: 'tuning', block: 'fw.yoyo', rec: 'removes', why: 'a power-to-yo-yo link (R9)' },
  'FW_WING.yoyo.excessFtps': { role: 'tuning', block: 'fw.yoyo', rec: 'removes', why: 'the speed trigger' },
  'FW_WING.yoyo.highFt': { role: 'ruling', block: 'fw.pitchOwner', rec: 'keeps' },
  'FW_WING.yoyo.': { role: 'tuning', block: 'fw.yoyo', rec: 'keeps' },
  'FW_WING.powerBandKias': { role: 'ruling', block: 'fw.power', rec: 'keeps' },
  'FW_WING.powerSec': { role: 'tuning', block: 'fw.power', rec: 'keeps' },
  'FW_WING.powerArcSec': { role: 'tuning', block: 'fw.power', rec: 'changes', why: 'power serves the intent and pays G\'s drag; the arc error belongs to the arc loop (R5)' },
  'FW_WING.brakes.slowKt': { role: 'tuning', block: 'fw.power', rec: 'changes', why: 'a relay on speed; the intent replaces it (review F12)' },
  'FW_WING.brakes.': { role: 'tuning', block: 'fw.power', rec: 'keeps' },
  'FW_WING.guard.minFt': { role: 'ruling', block: 'fw.filter', rec: 'keeps' },
  'FW_WING.guard.engageFt': { role: 'tuning', block: 'fw.guard', rec: 'removes', why: 'the taper from 600 to 500 ft replaces the 600 ft floor and the 600/700 engage and release (ruling 14 Oct 2026); 600 stays as the taper\'s top' },
  'FW_WING.guard.releaseFt': { role: 'tuning', block: 'fw.guard', rec: 'removes', why: 'the taper (ruling)' },
  'FW_WING.guard.releaseSec': { role: 'tuning', block: 'fw.guard', rec: 'removes', why: 'the taper (ruling)' },
  'FW_WING.guard.lookSec': { role: 'tuning', block: 'fw.filter', rec: 'changes', why: 'the whole closing part of the relative motion, about 10 s at most (review 2.5)' },
  'FW_WING.guard.lookStepSec': { role: 'search', block: 'fw.filter', rec: 'keeps' },
  'FW_WING.guard.tighter': { role: 'tuning', block: 'fw.filter', rec: 'keeps' },
  'FW_WING.guard.missFt.': { role: 'tuning', block: 'fw.guard', rec: 'changes', why: 'pass-clear\'s depth becomes a vertical candidate of the one predictor' },
  'FW_WING.guard.missSlantFt': { role: 'tuning', block: 'fw.guard', rec: 'removes', why: 'the guard\'s own predictor goes (R8)' },
  'FW_WING.guard.torquePct': { role: 'tuning', block: 'fw.power', rec: 'removes', why: 'no power cut; a request to bleed (review 2.5)' },
  'FW_WING.guard.passLineSec': { role: 'tuning', block: 'fw.filter', rec: 'changes', why: 'the closure allowance becomes the taper\'s allowed closing speed' },
  'FW_WING.guard.wingLineFt': { role: 'ruling', block: 'fw.filter', rec: 'keeps' },
  'FW_WING.guard.filterSteps': { role: 'search', block: 'fw.filter', rec: 'keeps' },
  'FW_WING.guard.filterRefine': { role: 'search', block: 'fw.filter', rec: 'keeps' },
  'FW_WING.guard.filterHoldSec': { role: 'tuning', block: 'fw.filter', rec: 'removes', why: 'with the power cut' },
  'FW_WING.guard.engage.': { role: 'tuning', block: 'fw.filter', rec: 'removes', why: 'label-only hysteresis; the taper has no on/off line' },
  'FW_WING.guard.lagSec': { role: 'tuning', block: 'fw.noseBehind', rec: 'removes', why: 'with the nose behind' },
});

/** Numbers the recommended structure adds (not in the code yet). */
export const ADDS = Object.freeze([
  { name: 'approach angle out (lag)', value: '20°', role: 'ruling', source: 'TS-233 (steer-behind 20°)' },
  { name: 'approach angle in (lead)', value: '12°', role: 'ruling', source: 'TS-233 (steer-ahead 12°)' },
  { name: 'approach law k', value: 'about 1 per 150 ft', role: 'tuning', source: 'review 2.2 (guess)' },
  { name: 'course gain', value: 'about today\'s 0.05 G/deg', role: 'tuning', source: 'review 2.2' },
  { name: 'phase thresholds (roll seen, captured)', value: '2', role: 'tuning', source: 'review 2.1' },
  { name: 'energy intent (gain, bleed thresholds, trim)', value: '3', role: 'tuning', source: 'review 2.3' },
  { name: 'exit vertical (gain, blend)', value: '2', role: 'tuning', source: 'review 2.3; ruling 14 Oct 2026 (any height in the cone\'s range)' },
  { name: 'guard taper (shape, time)', value: '1-2', role: 'tuning', source: 'ruling 14 Oct 2026: straight-line or square-root, an estimate for the guard-rail slice' },
]);

/** R1-R10 (plan section 2.2) against the tidied code. status: confirmed, corrected, new. */
export const FINDINGS = Object.freeze([
  { id: 'R1', status: 'confirmed', text: 'Fighting wing delays Lead only (dead-reckoned 0.4 s; leadNowOf); close formation the whole picture 0.3 s. Corrected in detail: three more delay kinds sit inside fighting wing. The slant, slant closure, aspect, HCA, height and the guard read the whole picture 0.4 s late (seeFw buffers both aircraft); the wanted speed and the swept place\'s closure read Lead 0.4 s late without the dead-reckoning (seen.lead.v). So one technique mixes three delays (DELAYS: leadDr, leadLate, picture04).' },
  { id: 'R2', status: 'confirmed', text: 'Two closures. Arc closure (velocities, now; level, the closure on the swept place) feeds the arc loop, the yo-yo, the power cut and the brakes in a turn; slant closure (1 s, 0.4 s late) feeds the pass line, S-turns, the quick fix, the exit side, the entry case, the brakes level and their "where". The power cut trips on the arc closure while the filter\'s line moves with the slant closure.' },
  { id: 'R3', status: 'confirmed', text: 'The aim line\'s turn fed forward is hidden feedback: the line turns with his own motion. Linearised (fw_loops.py), it adds a rate term V/L ≈ 0.33 /s on his heading: it acts like damping, not like feed-forward.' },
  { id: 'R4', status: 'confirmed', text: 'Power is three in series: powerAsk\'s wanted KIAS, holdThrottle (0.2 kt/s per kt, ≤ 3 kt/s, G drag fed forward), the engine. The inner hold\'s numbers are LEAD.speedHold, shared with Lead.' },
  { id: 'R5', status: 'corrected', text: 'Two owners of the arc error, but they don\'t add. The arc loop\'s d_ss = R(1 − V2/V_L) moves the offset outward by ΔV/ω for every ft/s power adds, so in a steady turn the closure is the arc loop\'s alone: power\'s arc term only chooses how much of it is speed and how much is offset (faster sits further outside). The plan\'s 0.15 rad/s "together" was wrong; fw_loops.py gives power almost no loop gain on closure.' },
  { id: 'R6', status: 'confirmed', text: 'liftWithin keeps the 1 G hold and the vertical, and cuts the turn at the cap. The filter replaces the steering\'s turn while failing, so the steering loop is open then. In the cm gauge run the job label reads "guard-filter" for 14-97% of the steady part of each academic turn (a scratch count; engaged is a label, so the share of steps it actually changes the turn is part 2\'s T29r column).' },
  { id: 'R7', status: 'confirmed', text: 'fwJob\'s entry case flies nothing; the jobs label it only.' },
  { id: 'R8', status: 'confirmed', text: 'fwGuard predicts from the 0.4 s old picture holding his own present turn, no vertical; the filter from now with the capture and the vertical. The guard decides pass-clear, the power integral, the aim blend and the cap; the filter the turn and the power cut.' },
  { id: 'R9', status: 'confirmed', text: 'Switch-to-switch links: power back → yo-yo; filter lineShort → nose behind; filter hold → power cut and pass-clear; guard on → pass-clear, aim blend, power I. One good link: the vertical ask → the filter\'s prediction (physics).' },
  { id: 'R10', status: 'confirmed', text: 'Close formation: holdingTorque and powerLeadPct fed forward into torque, Lead\'s lift and his place\'s motion into the one lift vector, three pilotAxis loops on what is left; job changes eased (masks, caps). The cross-feed pattern working.' },
  { id: 'R11', status: 'new', text: 'The aim is eased every step, not only at a change of aim. steerToAim eases his aim\'s offset against Lead (world axes) over 1.5 s every step, so in a steady turn the aim point lags Lead\'s rotation by atan(ω × 1.5 s): about 12° at 60°/2 G, 26° at 4 G. In the cm run the commanded and flown offset differ by a median 90-400 ft in the steady part of the turns away, outside the filter. A likely contributor; part 2\'s rig confirms or clears it.' },
  { id: 'R12', status: 'new', text: 'Three signals the spec meant for the supervisor are read by nothing: line of sight (the guard\'s reversal cue went with the tidy), aspect and HCA. Trace only.' },
]);

/** Questions for Patrick raised in part 1 (each with options and a recommendation; the thread relays one at a time). */
export const QUESTIONS = Object.freeze([
  {
    q: 'Where does #2\'s 0.4 s sit in fighting wing? Today it is on Lead only (he knows his own motion now); close formation delays the whole picture.',
    options: ['(a) Lead only, as now: matches "0.4 s after he sees Lead\'s bank and nose start"', '(b) the whole picture, as close formation: the textbook pilot; less margin', '(c) split: Lead 0.4 s, his own motion felt sooner (0.1-0.2 s, an estimate)', '(d) your own picture'],
    rec: '(a) as the working answer, with (b) measured beside it in each slice (the table already has both); decide once a slice shows a difference.',
  },
  {
    q: 'At the G cap, which gives way first: the turn (today) or the vertical? Your tool order is geometry first, then the vertical.',
    options: ['(a) the turn gives way (today): height held, geometry suffers', '(b) the vertical gives way: geometry first, as your order', '(c) shared in proportion', '(d) your own'],
    rec: '(b) in the turn and at the entry, except while the guard asks for pass-clear (then the vertical first); for the path-follower slice to measure.',
  },
]);

/**
 * The recommended structure (the T29t review's section 2.7 with Patrick's rulings of 14 Oct 2026: the guard tapers from
 * 600 ft to 500 ft; into him from in position he flies straight ahead until on the circle he wants, lag first goes; the exit
 * vertical may use any height while the slant stays 500-1,000 ft behind the wing line; model now, analysis per slice).
 * PROPOSED, NOT BUILT.
 */
export const PROPOSED = Object.freeze([
  { id: 'lead', layer: 0, name: 'Lead', does: 'His programme; never reads #2' },
  { id: 'p.sight', layer: 1, name: 'Sight (seeFw)', does: 'As today: the picture 0.4 s late; Lead carried across the delay (D-Lead, question 1)' },
  { id: 'p.phase', layer: 2, name: 'Phase', does: 'Level, Entry, Turning, Exit from Lead\'s roll as seen (no 1 s hold); the case read at each start; a reversal is an exit then an entry (review 2.1)' },
  { id: 'p.path', layer: 3, name: 'Reference path', does: 'Lead\'s circle d inside or out (Turning: the arc loop), or the swept line; into him from in position: straight ahead until on the circle he wants (ruling); limits 20° out, 12° in (TS-233)' },
  { id: 'p.arc', layer: 3, name: 'Arc loop', does: 'Today\'s form: d = d_ss + c*/ω + kc(c* − c)/ω; owns closure in a turn (R5)' },
  { id: 'p.intent', layer: 3, name: 'Energy intent', does: 'Keep, gain or bleed from the phase and case, and the guard\'s graded bleed request' },
  { id: 'p.steer', layer: 4, name: 'Path follower', does: 'Wanted course = tangent + (2/π)χmax atan(k × distance off); the path\'s turn fed forward (physics); course gain (review 2.2)' },
  { id: 'p.vertical', layer: 4, name: 'Vertical (one owner)', does: 'PD on the target of one owner: stack, exit vertical (any height, slant 500-1,000 ft, behind the wing line: ruling), yo-yo (Turning), pass-clear; changes blended' },
  { id: 'p.power', layer: 4, name: 'Power (one owner)', does: 'Drag of the G asked and the climb fed forward + the intent + a slow trim on speed; idle and the boards by intent' },
  { id: 'p.guard', layer: 5, name: 'Guard rail (taper)', does: 'One predictor; does nothing at or over 600 ft; 600-500 ft the allowed closing speed shrinks to none at 500 ft (phased); the least change to turn or height; under 500 ft firm, G past the estimate flagged (ruling); asks bleed, never sets power' },
  { id: 'p.lift', layer: 6, name: 'Lift', does: 'Within the cap in Patrick\'s order (question 2): geometry first; unload, roll, pull' },
  { id: 'p.aircraft', layer: 7, name: '#2 point mass and engine', does: 'As today (stepLead)' },
]);

/** The pictures: rows of block ids, and edges { from, to, label, kind: signal | delay | ff | hidden | cross | feedback }. */
export const DIAGRAMS = Object.freeze({
  fw: {
    title: 'Fighting wing today (Live, after the tidy): level 1',
    rows: [['lead'], ['fw.perception', 'fw.leadNow', 'fw.arc'], ['fw.guard', 'fw.jobs'], ['fw.aimTurn', 'fw.aimSwept', 'fw.lagFirst', 'fw.noseBehind', 'fw.yoyo'], ['fw.steer', 'fw.pitchOwner', 'fw.vertical'], ['fw.filter', 'fw.gcap', 'fw.lift', 'fw.power', 'ac.speedHold'], ['ac.engine', 'ac.pointMass']],
    edges: [
      { from: 'lead', to: 'fw.perception', label: 'Lead, 0.4 s late', kind: 'delay' },
      { from: 'fw.perception', to: 'fw.leadNow', label: 'Lead seen', kind: 'signal' },
      { from: 'fw.leadNow', to: 'fw.arc', label: 'Lead now', kind: 'signal' },
      { from: 'fw.perception', to: 'fw.guard', label: 'picture 0.4 s', kind: 'delay' },
      { from: 'fw.perception', to: 'fw.jobs', label: 'bank, slant, closure', kind: 'signal' },
      { from: 'fw.arc', to: 'fw.aimTurn', label: 's, arc closure', kind: 'signal' },
      { from: 'fw.jobs', to: 'fw.aimTurn', label: 'turning', kind: 'signal' },
      { from: 'fw.jobs', to: 'fw.aimSwept', label: 'level, side', kind: 'signal' },
      { from: 'fw.aimTurn', to: 'fw.steer', label: 'aim point', kind: 'signal' },
      { from: 'fw.aimSwept', to: 'fw.steer', label: 'aim point', kind: 'signal' },
      { from: 'fw.lagFirst', to: 'fw.steer', label: 'aim blended', kind: 'signal' },
      { from: 'fw.noseBehind', to: 'fw.steer', label: 'aim replaced', kind: 'signal' },
      { from: 'fw.jobs', to: 'fw.pitchOwner', label: 'stack, quick fix, low', kind: 'signal' },
      { from: 'fw.yoyo', to: 'fw.pitchOwner', label: 'climb', kind: 'signal' },
      { from: 'fw.pitchOwner', to: 'fw.vertical', label: 'height target', kind: 'signal' },
      { from: 'fw.steer', to: 'fw.filter', label: 'turn ask (hidden feedback)', kind: 'hidden' },
      { from: 'fw.vertical', to: 'fw.filter', label: 'vertical ask (physics)', kind: 'ff' },
      { from: 'fw.vertical', to: 'fw.lift', label: 'vertical G', kind: 'signal' },
      { from: 'fw.filter', to: 'fw.lift', label: 'turn flown', kind: 'signal' },
      { from: 'fw.gcap', to: 'fw.lift', label: 'cap', kind: 'signal' },
      { from: 'fw.aimTurn', to: 'fw.power', label: 'residual', kind: 'signal' },
      { from: 'fw.jobs', to: 'fw.power', label: 'low inside: MAX', kind: 'cross' },
      { from: 'fw.power', to: 'ac.speedHold', label: 'wanted KIAS', kind: 'signal' },
      { from: 'ac.speedHold', to: 'ac.engine', label: 'throttle (+ G drag)', kind: 'ff' },
      { from: 'fw.power', to: 'ac.engine', label: '20%, MAX, idle', kind: 'cross' },
      { from: 'fw.lift', to: 'ac.pointMass', label: 'lift', kind: 'signal' },
      { from: 'ac.engine', to: 'ac.pointMass', label: 'thrust', kind: 'signal' },
      { from: 'ac.pointMass', to: 'fw.perception', label: 'his picture, 0.4 s', kind: 'feedback' },
      { from: 'ac.pointMass', to: 'fw.leadNow', label: 'his own state, now', kind: 'feedback' },
      ...CROSSLINKS.filter((x) => x.from !== 'fw.vertical').map((x) => ({ from: x.from, to: x.to, label: x.signal, kind: 'cross' })),
    ],
  },
  cf: {
    title: 'Close formation (Live, flown and approved): level 1',
    rows: [['lead'], ['cf.perception'], ['cf.supervisor', 'cf.station'], ['cf.holding', 'cf.powerLead', 'cf.law'], ['cf.shaper'], ['cf.lift'], ['ac.engine', 'ac.pointMass']],
    edges: [
      { from: 'lead', to: 'cf.perception', label: 'Lead, 0.3 s late', kind: 'delay' },
      { from: 'cf.perception', to: 'cf.supervisor', label: 'deviation, rates', kind: 'signal' },
      { from: 'cf.station', to: 'cf.perception', label: 'the place', kind: 'signal' },
      { from: 'cf.supervisor', to: 'cf.law', label: 'job, masks (eased)', kind: 'signal' },
      { from: 'cf.perception', to: 'cf.holding', label: 'his G, climbs, place speed', kind: 'ff' },
      { from: 'cf.perception', to: 'cf.powerLead', label: 'place acceleration', kind: 'ff' },
      { from: 'cf.perception', to: 'cf.law', label: 'deviation, rates', kind: 'signal' },
      { from: 'cf.holding', to: 'cf.shaper', label: 'holding torque', kind: 'ff' },
      { from: 'cf.powerLead', to: 'cf.law', label: 'power lead', kind: 'ff' },
      { from: 'cf.law', to: 'cf.shaper', label: 'corrections', kind: 'signal' },
      { from: 'cf.shaper', to: 'cf.lift', label: 'G, bank-off', kind: 'signal' },
      { from: 'cf.perception', to: 'cf.lift', label: 'Lead\'s lift ahead, place motion', kind: 'ff' },
      { from: 'cf.shaper', to: 'ac.engine', label: 'torque', kind: 'signal' },
      { from: 'cf.lift', to: 'ac.pointMass', label: 'lift', kind: 'signal' },
      { from: 'ac.engine', to: 'ac.pointMass', label: 'thrust', kind: 'signal' },
      { from: 'ac.pointMass', to: 'cf.perception', label: 'his picture, 0.3 s', kind: 'feedback' },
    ],
  },
  proposed: {
    title: 'Fighting wing, the recommended structure (PROPOSED, NOT BUILT): level 1',
    rows: [['lead'], ['p.sight'], ['p.phase'], ['p.path', 'p.arc', 'p.intent'], ['p.steer', 'p.vertical', 'p.power'], ['p.guard'], ['p.lift'], ['p.aircraft']],
    edges: [
      { from: 'lead', to: 'p.sight', label: 'Lead, 0.4 s late', kind: 'delay' },
      { from: 'p.sight', to: 'p.phase', label: 'Lead\'s roll, range, closure', kind: 'signal' },
      { from: 'p.phase', to: 'p.path', label: 'circle or line, case', kind: 'signal' },
      { from: 'p.phase', to: 'p.intent', label: 'keep, gain, bleed', kind: 'signal' },
      { from: 'p.phase', to: 'p.vertical', label: 'owner, target', kind: 'signal' },
      { from: 'p.arc', to: 'p.path', label: 'd', kind: 'signal' },
      { from: 'p.path', to: 'p.steer', label: 'path, its turn', kind: 'ff' },
      { from: 'p.intent', to: 'p.power', label: 'intent', kind: 'signal' },
      { from: 'p.intent', to: 'p.vertical', label: 'exit vertical', kind: 'signal' },
      { from: 'p.steer', to: 'p.power', label: 'G asked: its drag', kind: 'ff' },
      { from: 'p.vertical', to: 'p.power', label: 'climb: its power', kind: 'ff' },
      { from: 'p.steer', to: 'p.guard', label: 'turn ask', kind: 'signal' },
      { from: 'p.vertical', to: 'p.guard', label: 'vertical ask', kind: 'ff' },
      { from: 'p.guard', to: 'p.intent', label: 'graded bleed request', kind: 'ff' },
      { from: 'p.guard', to: 'p.lift', label: 'least-change turn, height', kind: 'signal' },
      { from: 'p.power', to: 'p.aircraft', label: 'throttle', kind: 'signal' },
      { from: 'p.lift', to: 'p.aircraft', label: 'lift', kind: 'signal' },
      { from: 'p.aircraft', to: 'p.sight', label: 'his picture', kind: 'feedback' },
    ],
  },
});
