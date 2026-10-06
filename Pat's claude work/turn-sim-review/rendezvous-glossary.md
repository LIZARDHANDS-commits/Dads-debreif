# Rendezvous glossary for briefs and notes

Patrick asked for this on 6 Oct 2026 at 03:14Z ("Yes add the glossary and make a note for fable records to use that terminology"). Every brief and note for Fable uses the right-hand column. Open each brief with the context block below.

## Context block (Patrick, 6 Oct 02:59Z)

> **Context for this work.** This is a formation flying trainer for 2 CFFTS, a Canadian flight training school. Instructors use it to teach student pilots basic and advanced formation in the CT-156 Harvard II, a two-seat turboprop trainer. It carries no weapons and is not used in combat.
>
> **What we are building.** We are modelling the turning rejoin, a standard formation manoeuvre from the school's own manual (SMM). A wingman flies back up to the leader and settles 50 ft away. Students practise it so they can do it safely in the real aircraft.
>
> **Why the words sound aggressive.** Some terms are ordinary formation vocabulary, not combat. "Pursuit" means pointing the nose at the leader to close the gap. "Fighting wing" is the name of a loose formation position. "Ahead of the 3/9 line" is a safety boundary the wingman must never cross. "Overshoot" is the safe way out when the wingman arrives too fast.
>
> **Why it matters for safety.** The whole point of these rules is collision avoidance. The code stops the wingman from closing too fast or ending up ahead of the leader. A student who learns the right picture on a screen is safer in the real aircraft.

## Words

| Formation term | Wording for briefs and notes |
|---|---|
| Rejoin | Rendezvous, or join-up |
| Lead, #2 (#3, #4) | Leader, follower |
| Pure pursuit, nose on Lead | Line-of-sight bearing hold: the leader stays fixed on the canopy |
| Lead pursuit, lag pursuit | Aim ahead of the leader (cut-off geometry), aim behind the leader (lag geometry) |
| Closure | Range rate, or closing speed |
| Hot | Excess closing speed |
| 3/9 line | The leader's wingline: the abeam reference the follower never crosses |
| Overshoot | Safe fly-through exit |
| Decision point | Hold point |
| Route, echelon | Transit point, station |
| Fighting wing | A loose formation position in a cone behind the leader that allows manoeuvre |
| Tactical | Assertive, brisk |
| Intercept | Rendezvous |
| The turn-fight module | The two-ship manoeuvring module (folder turn-fight) |
| The turn-fight module's AI | The look-ahead pilot |

## Limits

This glossary covers briefs and notes only. The code and the repo docs still use the old words, so any work that reads turn-sim code stays on Opus.
