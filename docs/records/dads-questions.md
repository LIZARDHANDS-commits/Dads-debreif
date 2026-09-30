# Dad's check list: pilot-judgement questions

Questions only a T-6 pilot can settle. Each one comes from a check of the new tool against the manuals. Every question already has a working answer in the tool, and that answer stays until Dad replies. Nothing here has been sent. Patrick decides when and how to ask.

Each item names the thread that raised it and where the detail is.

## Turn Fight

**1. Split S below 120 KIAS, or a slice? (Turn Fight P1) — RESOLVED BY PATRICK (D381)**
- **Answered 2026-09-30 (D381):** At 140 KIAS or below, aircraft must NOT fly an Immelmann and must choose either a Split S (if deck height allows) or a slice turn. *Patrick's rule:* A slice turn is descending (although losing less altitude than a Split S). Never go below the hard deck: if altitude margin does not permit a slice turn without breaching the deck, transition to level MPT.

**2. Lowest Immelmann top speed: 120, or about 140? (Turn Fight N3) — RESOLVED BY PATRICK (D381)**
- **Answered 2026-09-30 (D381):** Immelmann depletes energy. Below 140 KIAS, an Immelmann is strictly forbidden (must fly Split S or slice turn). The minimum top speed threshold is codified in D381.

## Turn Sim

**3. The 5 o'clock cue on a Delayed 45 (Turn Sim C3)**
- **Question:** Do you roll the second aircraft in later than the 5 (or 7) o'clock cue, so the roll-out lands inside 4,000 to 6,000 ft? Or do you roll in on the cue and "fix spacing and sweep on the roll-out"?
- **Why we ask:** Flown exactly on the SMM's cue, the default 4-ship and box Delayed 45 end about 3,700 to 3,900 ft apart. That shows red TIGHT flags on every wingman.
- **Now:** the tool keeps the SMM cue and adds a "fix spacing and sweep on the roll-out" line.
- Detail: verification/turn-sim-recheck-223.md, C3 / PJ-1.

**4. Rear element delay in a box Delayed 45 with a check turn (Turn Sim, D281)**
- **Question:** The SMM gives the rear element a 10 to 15 s delay. Is that what you fly?
- **Why we ask:** In the sim, a fixed 12.5 s collapses the box. The tool works out the delay that keeps the box's shape instead: 36.7 s in a right turn and 1.0 s in a left turn. The screen flags when this happens.
- **Now:** the delay is solved rather than taken from the SMM, logged as D281.
- Detail: verification/turn-sim-recheck-223.md, section 5.

## SOF dashboard

**5. Keeping a lightning caution through a feed outage (SOF PJ1)**
- **Question:** If the last good lightning picture showed a strike inside the radius and the feed then fails or goes old, should the banner keep the caution until a good picture says clear?
- **Now:** yes. The caution stays, marked "can't tell now, last seen N min ago", with a plain amber "Lightning: can't tell" line once the gap passes 40 min (D352, D353).
- Detail: verification/sof-recheck-207.md, PJ1.

**6. How old can the cloud picture be? (SOF PJ2)**
- **Question:** Is a satellite cloud picture up to an hour old still useful at a SOF desk?
- **Why we ask:** ECCC's GOES picture normally arrives about 31 min late. With a 30 min limit it read STALE most of the time.
- **Now:** cloud 60 min, lightning 40 min, radar 20 min (D354).
- Detail: verification/sof-recheck-207.md, PJ2.

**7. Lightning caution radius: 20 NM? (SOF PJ3)**
- **Question:** Is 20 NM right for the SOF's lightning caution? Should the tool allow more?
- **Why we ask:** 20 NM (settable from 5 to 50) is V6's number, and no manual gives an NM radius. The NFM (Section VII, p. 7-4) notes lightning can travel up to 50 miles from a storm. A cell also counts as "within 20 NM" when its centre is up to about 1 NM beyond that, because the tool measures to the cell's edge.
- **Now:** 20 NM, as in V6.
- Detail: verification/sof-recheck-207.md, PJ3.

## Traffic Sim

**8. What counts as a conflict? (Traffic T4)**
- **Question:** What lateral and vertical distances should the Moose Jaw pattern use for a conflict and a caution?
- **Why we ask:** V6's built-in setup uses 200 / 200 ft (conflict) and 500 / 500 ft (caution), which is nearly touching; its general defaults are 1,500 / 500 ft and 2,500 / 1,000 ft.
- **Now:** the built-in setup's V6 numbers.

## Turn Sim

**9. The 4312 picture (plan doc Q31)**
- Still open from Dad's first email reply. Ask Patrick what it refers to before sending.
