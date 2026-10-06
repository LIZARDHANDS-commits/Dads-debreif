# Fight Sim keep-list (TF-57, plan Step 1b)

Everything the Energy fight does today, read from `src/modules/turn-fight/energy-sim.js` on main `0054b2c` (4 Oct 2026). Each refactor PR checks itself against this list. A line changes only in the PR named beside it; nothing is dropped without Patrick's yes.

**Before record:** 19 fights flown in Node and stored step by step (`before/`, made by `fingerprint.mjs record`). PR 1 must give every one of them back bit for bit (`fingerprint.mjs check`).

| Fight | Setup change | Result today |
|---|---|---|
| default | none | Blue gun kill, 55.7 s |
| auto | both Auto | collision, 66.3 s |
| m140 / m180 | 140 / 180 KIAS | no nose-on in 240 s |
| m260 | 260 KIAS | Red gun kill, 39.6 s |
| m300 | 300 KIAS | mutual chase, no kill in 240 s |
| auto300 / auto140 | Auto, 300 / 140 KIAS | collision, 32.9 s / 34.2 s |
| unequal | Blue 250, Red 180 | no kill in 240 s |
| low | start 7,000 ft | no kill in 240 s |
| heights | Red 2,000 ft higher | Red gun kill, 38.3 s |
| forcedImm | Blue Immelmann, Red MPT | no kill in 240 s |
| forcedSplitS / forcedSlice / forcedPitchBack | both forced, 120 / 150 / 200 KIAS | no kill / collision 128.8 s / collision 162.5 s |
| leadPursuit / lagPursuit | lead / lag pursuit | Blue / Red chases, no kill in 240 s |
| tacticalPursuit | tactical pursuit, 260 KIAS | Blue chases, no kill in 240 s |
| avoidanceOff | Auto, avoidance off | collision, 66.3 s: the same as with it on, because avoidance only works in pursuit |

## 1. The aircraft (kept as is in every PR)

1. One integrator: core's point-mass step (`stepPointMass`), thrust and drag from core, part throttle scales thrust only.
2. Speed never drops below 15 KTAS, so the path always has a direction.
3. Stall line, +7 G and +4.7 G rolling limits from core.
4. Shaker at 94 % of the stall-line G (a setting); the split S uses core's shaker (stall + 7 kt, 5 G cap). Two rules on purpose until Patrick picks one.
5. STALL: the pull needs more than the stall line, or the speed is under the stall speed. It lasts `stallSec` (1 s) and while slow; the jet flies at most 1 G; roll authority drops to 30 %; a forced G ends. With its reason in words.
6. OVER G: above +7 G, or above +4.7 G while rolling, judged on the G pulled. With its reason in words.
7. Bank moves at the roll rate (90°/s), short way round, with a preferred side when 180° off. **Changes in PR 2:** roll and G build smoothly.
8. A forced G (`blueForceG`, `redForceG`, test only) is pulled as set, even past the stall line.
9. Carried bank through the vertical; the readout bank is from the real horizon.

## 2. The moves (each kept; PR 1 gives each its own file)

| Move | What it flies |
|---|---|
| Pitch back | Entry bank 60° at 160 to 30° at 220 KIAS (settings), the set G (5) or the shaker, hands to the MPT when the speed 3 to 3.7 s ahead reaches it, or after 170° of turn |
| Slice | Entry bank 90° at the MPT speed to 135° at 100 KIAS, otherwise as the pitch back |
| Immelmann | Wings level, up and over at the set G, rolls upright 25° above level on the way down, levels off; a stall on the way up recovers wings level |
| Split S | Core's law: nose up to 20° in the shaker, roll inverted at 0.5 G, pull through in the shaker up to 5 G, level off |
| Low yo-yo | Dive 15° nose low at 1.5 G toward the other, cut at 2 G, pull at 4 G; ends nose within 30° or at 8 s or near the deck |
| High yo-yo | Climb 25° at 3.5 G, roll toward the other at 2.5 G, dive at 1.5 G; ends nose within 30° or at 10 s or near the deck |
| MPT | Speed-hold bank 60 to 85° (settles 72 to 73° at 160), PCL mid-range until the shaker when entered fast, roll-in pulls as the bank builds, capture mode after a hand-over (any bank to 135°) |
| Level MPT | At the hard deck: bank holds the height, up to 88° |
| Pursuit | Pure, lead, lag (curved control zone 1,500 ft behind) or tactical blend; deck guard with pull-out look-ahead; top-speed guard 40 kt under VMO / Mach 0.67; zoom-climb governor under 140 KIAS; collision avoidance (85 ft offset) |
| Tumble | After a collision: ballistic tumble, rates by closing speed, impact at 0 ft. **Changes in PR 2:** onto the one integrator |

## 3. Who decides (kept in PR 1; PR 3 makes one pilot)

1. Auto's pick: SMM Table 14.1 split points (settings), deck margin, split S height check, and above 220 KIAS the Immelmann / pitch back race (60 s look-ahead), SMM bands as tie-break, lowest Immelmann top speed.
2. The first moves planned once at T+0, with Blue and Red answering each other's pick once.
3. Tactical pick: 7 dry runs of 20 s, ranked by win time, advantage, energy height; MPT penalised after 360° of circling.
4. Tactical re-pick in the MPT every 3.5 s with a 4 s lock-out. **Changes in PR 3:** Auto re-decides too.
5. Hand-overs: a move that ends goes to the MPT; a bank move over 60 s is picked again.
6. Pursuit starts on nose-on from behind (AA 150° or less), or any nose-on with "chase from head-on", or on tactical advantage, or on the 60° canopy rule when the heights differ. **Changes in PR 3:** pursuit can end; avoidance in every move.

## 4. The judge (kept)

First nose-on (5°, or azimuth 5° and elevation 10°), recorded once, "both" in one step; chase and who started it; even fight; gun kill (2 s inside 2,500 ft, ATA 15°, AA 60°, from 1 s after the pass); mid-air collision at 35 ft with impact numbers; the 10-minute stop.

## 5. Start (kept)

Start geometry from range, ATA, AA and sides, slid so the pass is at the origin; turns at the pass or now; the setup check with its plain-words refusals (heights, top speed by height, ranges).

## 6. Settings and readouts

- **Settings:** all 64 controls are in `settings-catalogue.md` with the cut list Patrick approved (10:41Z). PR 1 changes none.
- **Readouts kept:** Result (kill or collision line, KIAS, altitude, G, move, to the MPT, flags with alert colour, range, first nose-on, chase, winner); flag notes and the screen-reader flag line; More detail (TAS, climb, bank, Ps, energy height, ATA, AA, HCA, time since the pass); the move's why text; the aim point; the altitude graph and table; the 2D and 3D views and tags. **Changes later:** the layout per `display-proposal.md`.

## Goes

Climb and dive (TF-R22, already ruled); duplicate maths copies (PR 1: `rollToward` and four copies of the flight-path lift formula now come from core, same numbers).
