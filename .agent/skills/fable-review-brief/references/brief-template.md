# Fable brief template

Fill every section in the brief's renamed terms (SKILL.md section 3). Keep it to what this one question needs. A long brief is fine; a brief that sends Fable to another file is not. Delete the guidance in italics.

---

# Design review brief: <the subject, in renamed terms>

## Context and purpose (please read first)

This is a design document for a **flight-school training tool**. A flight instructor at a basic pilot-training school is building a formation simulator for student pilots on a single-engine turboprop basic trainer, so they can practise the formation picture before they fly it.

**The absolute priority is that the simulated wingman never comes close to hitting the lead aircraft and always stays in a safe position behind it.** Smoothness and realism come after that.

Everything you need is in this one document. Please do not open any other file.

*If it follows an earlier Fable review, add: "You reviewed an earlier draft (your findings F1-Fn are referred to by number; you do not need them in front of you)."*

## Terms

*Each term defined once, in plain words, with its number where it has one. For example:*
- **Lead**: the lead aircraft. **#2**: the simulated wingman.
- **The trail cone**: the school's loose formation, #2 500-1,000 ft from Lead and 30-60° back from Lead's wing line. Never closer than 500 ft slant range (the instructor's one hard rule; a brief entry while correcting firmly is accepted).
- **Steer-ahead / steer-on / steer-behind**: #2's flight path points ahead of Lead (inside Lead's turn circle), at Lead, or behind Lead (outside the circle).
- **Pass clear**: when the geometry would bring #2 too close, he moves out of Lead's way first, below by default.
- *Aspect, HCA, sweep, the 3/9 line (Lead's wing line), Lead's turn circle, as the question needs.*

## The simulator

*Numbers, with the kind of each speed (indicated, true) and its source. For example: the point mass and what it models; the step (0.05 s); the formation's speed and height (200 KIAS at 8,000 ft, about 380 ft/s true); Lead's turn (60° bank, 2 G, about 8.4°/s, radius about 2,590 ft); #2's reaction delay (0.4 s on Lead, dead-reckoned; his own state at once); his limits (roll rate, G cap and onset). Estimates marked as estimates.*

## The instructor's rulings (fixed: design around them)

*Each ruling in one line, renamed, from the module's decisions file. For example: the guard tapers from 600 ft down to 500 ft; turning into him from in position, he flies straight ahead to the circle he wants and then captures; at the G cap, airspeed gives way first, then the vertical, then the turn; G onset scaled by urgency, about 1 G/s usually and up to 4 G/s to avoid hitting. Then: published limits are references, flagged when passed, never walls; only physical limits are hard.*

## What exists and how it measures

*The structure as built (for a systems review: each loop, what it senses and commands, its gain, crossover and margin; the shared controls and who wins; the switches; from the control model, renamed). The measuring tool's numbers per case: what passes and what doesn't. Real recorded flying, if it is relevant, marked as a reference only.*

### What was tried and why it failed

*Numbered. One line for what it was, one for what the measuring tool showed.*

## What we ask

1. *The one main question, specific enough to answer with a structure and starting numbers.*
2. *At most a few smaller ones.*
3. Anything else that is unsafe or will not converge.

Please give:
- a verdict;
- numbered findings, each marked "fix before building", "can wait" or "note", with its evidence and your confidence;
- a recommended structure with starting numbers, each marked a guess;
- for each change: what it costs in tuning values and delay margin, and the measuring-tool case that would show it working;
- the questions that need the instructor's ruling.

State any assumption you make.
