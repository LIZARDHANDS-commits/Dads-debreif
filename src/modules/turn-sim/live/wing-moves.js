// The live wingmen's numbers: the live fighting wing law (fw-live.js) and the live fluid law (fluid-wing-live.js). One of
// the tuning sheet's number files (TS-214): tuning.js re-exports it, and docs/modules/turn-sim/numbers.md lists every
// number with its source. Moved unchanged from the two laws (12.2b); the numbers both laws use are written once
// (WING_LIVE, and handling.js MIN_POSITIVE_G). Numbers with no manual page or ruling are estimates and say so.
//
// This file imports only core and the other number files, so any file can read it without an import loop.
import { G_RULE } from './rates.js';
import { IN_POSITION } from './bands.js';
import { HOLD, WING } from './moves.js';
import { FW_BAND, FW4 } from './slots.js';
import { MIN_POSITIVE_G } from './handling.js';

/**
 * What both live laws do the same way (they were copies): power flies his place, 1 kt per 12.5 ft behind it less 0.6 kt
 * per knot he is already closing, and he pulls no more than about 1.5 G over what Lead is pulling (a pilot matches Lead's
 * pull and adds what the picture needs). Estimates.
 */
export const WING_LIVE = Object.freeze({ placeKtPerFt: 0.08, closeKtPerKt: 0.6, overLeadG: 1.5 });

/** The live fighting wing wingmen's numbers (TS-208; moved from fw-live.js, 12.2b). Estimates unless a source is given. */
export const FW_LIVE = Object.freeze({
  settleSec: 30, // his run goes on this long past Lead's plan, long enough to reset in position after a roll-out (estimate)
  maxSec: 300,
  arcFt: FW4.rangeFt, // in a turn he aims 650 ft of arc behind the one ahead (TS-208; Patrick 4 Oct 11:44Z, slots.js FW4)
  floorFt: FW_BAND.bubbleFt, // never closer than 500 ft to the one ahead (Patrick 12 Oct 2026 16:49Z; SMM 16.17 para 44c)
  floorMarginFt: 100, // he starts to give room 100 ft before the floor, at the range he will have in lookSec (estimate)
  lookSec: HOLD.lookSec, // ... in about 2 s at the closure he has (estimate, TS-74)
  floorGain: 2, // each foot short of the floor plus its margin counts as 2 ft too close (estimate)
  // The floor in a turn into him: he looks floorLookSec ahead with the one ahead holding his turn (fw-pursuit.js predict),
  // and if the heading he wants would bring him inside the floor plus its margin he takes the nearest heading on the lag
  // side that keeps him out (searched in floorStepDeg steps up to floorMaxDeg off it); with none, the best one and height
  // (estimates).
  floorLookSec: 6,
  floorStepDeg: 5,
  floorMaxDeg: 20, // ... and never more than 20° off Lead's circle (estimates; measured 12 Oct 2026: 90° stretched #3 to 2,500 ft, 45° to 1,900)
  stackFt: Object.freeze([-100, -50]), // 50 to 100 ft below the one ahead (Patrick 12 Oct 2026 17:16Z, 17:32Z "500 and stack is a technique that works")
  stackKeepFt: IN_POSITION.fwStackFt, // a deeper stack he has at the press is kept, up to the cone's 200 ft (TS-80), until Lead is level and he is clear (estimate)
  coneFt: 150, // height in the cone: no more than 150 ft from his stack to keep the floor (TS-96's cone height; estimate)
  // The pilot's hands (estimates): about 1 G of turn per 10° of heading error (a 4-6 s period, Fable's audit), his nose
  // put back onto the path over about 4 s of flight, at most 30° across it.
  gPer10Deg: 1,
  pathLookSec: 4,
  maxCutDeg: 30,
  rollDps: 60, // he rolls no faster than about 60°/s in fighting wing (estimate; the T-6A's own limit stays in stepLead) ...
  rollLeadDeg: 6, // ... his ask leading his wings by no more than 6° (estimate)
  lagTurnShare: 0.75, // lagging off the floor he turns at three quarters of Lead's turn ... (estimate; measured 12 Oct 2026: none overshot and stretched #3 and #4 to 1,400 ft, all of it passed closer) ...
  ffSec: 1, // ... eased over about a second (estimate)
  anticipateSec: 0.75, // he rolls with Lead's turn about 0.75 s of flight before he reaches where Lead rolled (estimate)
  // Lead, lag and pure: how far across Lead's circle he goes to close or open the arc (estimates). He wants the arc
  // error gone in about 6 s, at no more than 30 ft/s; the offset that gives is at most 500 ft, full in a turn of 1 G of
  // turning (about 45° of bank) and none straight.
  arcSec: 6,
  arcRateFtps: 30,
  acrossMaxFt: 500,
  turnFullG: 1,
  turnSec: 2, // his picture of the turn (lead, lag and pure against the cone) builds and fades over about 2 s (estimate)
  takeTurn: 0.25, // with Lead level and his own turn under a quarter of full, the cone place is taken (estimate)
  coneFtps: 40, // his place across the cone moves at no more than 40 ft/s (estimate)
  // Height: a gentle loop on his stack and the energy height, never from the pointing error (estimates).
  altFtps: 8, // moved up or down at no more than 8 ft/s (the live wingman's fighting wing rate, estimate)
  altSec: 4,
  climbSec: 1,
  maxClimbG: 0.25,
  floorFtps: 40, // the floor's height is flown at up to 40 ft/s (2,400 ft/min) ...
  floorClimbG: 0.5, // ... the climb or descent started at up to half a G ...
  floorSec: 1, // ... and closed on in about 1 s (estimates)
  energyFt: 100, // speed as height first, up to 100 ft (TS-96, TS-202; estimate)
  placeKtPerFt: WING_LIVE.placeKtPerFt, // power: 1 kt per 12.5 ft of arc behind his place (WING_LIVE) ...
  closeKtPerKt: WING_LIVE.closeKtPerKt, // ... less 0.6 kt per knot he is already closing (WING_LIVE) ...
  overtakeKias: HOLD.overtakeKias, // ... within 15 KIAS of Lead (EFIG p.374's 10-20 KIAS)
  overLeadG: WING_LIVE.overLeadG, // he pulls no more than about 1.5 G over Lead (WING_LIVE), the floor excepted ...
  normalG: G_RULE.normalG, // ... and 5 G, the normal ceiling (SMM 16.17 para 44a; Gen Book p.11), flagged, not a wall
  minG: MIN_POSITIVE_G, // no push below 0.5 G (as Lead, 2 CFFTS Orders B2 ch 8 para 1a; 0.5 an estimate; handling.js)
  // Lead's track, kept for the wingmen to fly: seeded this far behind Lead at the first press, at this spacing (estimates).
  seedFt: 8000,
  seedStepFt: 50,
});

/** The live fluid wingman's numbers (moved from fluid-wing-live.js, 12.2b). Estimates unless a source is given. */
export const LIVE = Object.freeze({
  sideDeg: WING.latDeg, // the side offset: 15° off Lead's tail (Patrick 4 Oct 22:28Z, "hold 15"; 12 Oct 02:45Z "that part is good")
  turnInFt: 50, // in a manoeuvre he holds about 50 ft inside the set distance (600 by default, so about 550: Patrick 12 Oct 2026 01:53Z, "maintain 500 in the turn and roll out slightly over 500"; 50 an estimate)
  capShare: 0.5, // lead or lag moves the aim off Lead, toward the inside of his turn or the outside, by up to half the range (about 27° of nose; estimate)
  biasLag: -0.3, // Lead's cue word sets the default: lag puts the aim 30% of the cap outside his turn ... (estimate)
  biasLead: 0.3, // ... and lead 30% inside (estimate); pure is on him
  loopWords: Object.freeze({ pureDeg: 110, leadDeg: 160, pullOutDeg: 330 }), // the loop, by Lead's angle round it: lag, pure from 110° (near the vertical), lead from 160° (over the top: Patrick 12 Oct 2026 03:40Z "around this position we should be transitioning to lead pursuit"), pure from the pull-out (330°, fluid-lead.js). Estimates; the planned wingman keeps his own breaks (155°, 205°)
  overWords: Object.freeze({ pure: 0.3, lead: 0.45, pullOut: 0.9 }), // a wingover or a barrel roll, by how far through it Lead is: the same shape (planned: 0.4, 0.6, 0.9); estimates
  sideSwapDeg: 5, // with Lead level again, #2 takes the side of Lead's tail he is on once more than 5° past it (estimate), and keeps it
  sideFreeTurn: 0.25, // ... only with Lead's turn eased off (below a quarter of the full slide), upright and his nose near the horizon (estimates)
  biasPerSec: 0.15, // a change of cue word slides the default over about 2 s, lead to pure (4 s lag to lead), never in a step (estimate)
  kR: 1, // the range error, as a share of the range wanted, moves the aim ahead (stretched) or behind (tight) one for one (estimate)
  kC: 1, // the closure over lookSec, as a share of the range wanted, moves it behind (closing) or ahead (opening) one for one (estimate)
  lookSec: HOLD.lookSec, // he sets his lag or lead for the gap he will have in about 2 s at the closure he has (estimate, TS-74)
  severityG: 2, // the slide is full with Lead turning at 2 G of acceleration (a 3.5 G loop, a 70° turn), none straight (estimate) ...
  severitySec: 2, // ... and follows his turn over about 2 s, none to full, so a quick roll-in of Lead's moves #2's picture smoothly, never in a step (estimate; smooth hands)
  turnSenseSec: 0.5, // #2's sense of Lead's turn (its direction and size) follows Lead's turning acceleration with about half a second of lag (estimate) ...
  turnHeldG: 0.1, // ... and below 0.1 G of it the last turn's direction and plane are held, so a straight Lead never leaves him a direction from noise (estimate)
  circleSec: 4, // in a turn the side offset in Lead's plane eases away over about 4 s, so #2 settles onto Lead's circle (estimate; Patrick 12 Oct 2026 01:39Z: "maintain 500 feet in the turn then accept getting a bit further away as we seep out to our 'offset' position"); turning into him it is circleInsideSec
  swapLookSec: 0.25, // his drift across Lead's tail is read over about a quarter second (estimate; the planned cue read it over 0.25 s too)
  circleBackSec: 12, // in Terminate the offset comes back as Lead rolls out over about 12 s, the slot slide's own pace (estimate), so the roll-out never jumps the aim across
  circleInsideSec: 8, // ... but with the offset on the inside of Lead's turn (Lead turning into him) over about 8 s, so Lead's turn brings the circle to him and he rolls in later and shallower instead of rolling away first (estimate; Patrick 12 Oct 2026 03:10Z: he turns away only when the turn would bring him inside 500 ft)
  bubbleShare: -1, // inside the 500 ft bubble the aim goes to full lag (spec section 9; SMM 16.17 para 44c)
  handsFadeSec: 3, // ... and fades out over the first 3 s after the Terminate press (estimate), so it is for the press only
  handsSec: 1, // in Terminate the lift wanted is eased over about a second (estimate; spec section 10.11, "eased over about a second")
  heightShare: 0.8, // how much of the offset eased off Lead's plane comes back as height above him in a turn (estimate; measured about 100 ft at 15° and 650 ft)
  l1Sec: 2.5, // the pursuit gain is 2V over the distance to the aim, or over about 2.5 s of flight if the aim is nearer (estimate): standard L1 guidance, soft enough that a roll-in of Lead's is followed, not snatched at
  overLeadG: WING_LIVE.overLeadG, // he pulls no more than about 1.5 G over what Lead is pulling (estimate: a pilot matches Lead's pull and adds what the picture needs), the bubble excepted
  relevelPerSec: 0.5, // the side frame along Lead's path eases back to level at about 0.5 per second with Lead upright and his nose near the horizon, none inverted or near the vertical (estimate), so his side holds through a loop
  minG: MIN_POSITIVE_G, // never below 0.5 G on the lift he has (as Lead's push, 2 CFFTS Orders B2 ch 8 para 1a; 0.5 an estimate; handling.js)
  normalG: G_RULE.normalG, // SMM 16.17 para 44a; Gen Book p.11 (flagged, the normal ceiling)
  acrossDps: 3, // how fast his place moves across the tail (the entry): 3°/s, 30° in about 10 s (estimate)
  openDeg: 25, // tight with Lead straight his place opens across toward the edge of the fluid cone, 30° off the tail (SMM 16.17 para 42) less the shared 5° margin, so he is judged in position all the way; measured on V2.380 from 500 ft at 55° off the tail: opening to 45° (the middle of the fighting wing cone) keeps him 485 ft at the closest but parks him at 32°, out of the fluid cone; 25° goes through 429 ft (flagged TIGHT) and settles 519 ft at 24°, in position, with the fewest bank reversals (estimate) ...
  topSwapUpZ: 0.7, // the inverted top of a roll: Lead's canopy more than about 135° from upright (estimate) ...
  topSwapRollDps: 20, // ... and still rolling through it, faster than 20°/s (estimate), so a held inverted pass is not a roll ...
  topSwapTurn: 0.5, // ... with Lead pulling at least half the severity, about 1 G of turn (estimate)
  openUpFt: 100, // ... and up to about 100 ft above Lead (estimate: "use the cone as required", Patrick 5 Oct 2026 23:02Z), a longer path with power at MAX
  slotSideDeg: 2, // near Lead's tail Terminate takes the side he is heading for once more than 2° past it (estimate) ...
  slotAcrossDps: 1.5, // in Terminate his place flows across to the fighting wing slot at 1.5°/s (estimate), a gentle slide out while Lead flies straight
  rangeFtps: 60, // how fast his place moves in or out (a new distance, the entry, Terminate): estimate
  altFtps: 20, // how fast his place moves up or down (Terminate's slot height): estimate
  placeKtPerFt: WING_LIVE.placeKtPerFt, // with Lead holding a speed, power flies his place: 1 kt faster per 12.5 ft behind it (WING_LIVE) ...
  closeKtPerKt: WING_LIVE.closeKtPerKt, // ... less 0.6 kt per knot he is already closing on it (WING_LIVE) ...
  overtakeKias: HOLD.overtakeKias, // ... within 15 KIAS of Lead (EFIG p.374's 10-20 KIAS)
  wordShare: Object.freeze({ on: 0.35, off: 0.15 }), // LAG or LEAD shows past 35% of the cap and goes under 15%, so the word doesn't flicker (estimate)
  settleKt: 2, // Terminate ends with him in the fighting wing band and within 2 kt of Lead (spec section 9)
  fwAltFtps: 8, // ... and moved up or down at no more than 8 ft/s, so a change of height is a gentle climb or descent, not a bob (estimate)
  // In fighting wing his aim moves round Lead (in Lead's own frame) no faster than this and builds to it at fwAimAccel, so a
  // press of Lead's never asks him for a snap: from the 4-ship's place (543 ft, 45° off the tail) the aim swept about 400 ft
  // across in 3.6 s at a level turn's press and rolled him to 85° in 2 s (Patrick 12 Oct 2026 10:02Z: "There should be roll
  // rates and roll acceleration build ups built in"; his card 10:08Z "Ease the aim"). Estimates.
  fwAimFtps: 100,
  fwAimAccelFtps2: 60,
  fwHeightFt: 100, // in fighting wing (TS-202) his spacing is flown with height first: up to the cone's 150 ft above or below Lead less the 50 ft margin (TS-96, FW_ENERGY; estimates)
});
