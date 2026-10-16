---
name: fable-review-brief
description: How to get a useful one-off review from Fable (Claude's Fable model) on Dad's debrief tool's Formation Sim design, flight physics or control system, without its safety filter stopping the run. Covers when Fable is worth it versus Opus, writing one self-contained renamed brief, scrubbing it with the bundled checker, sending it, and turning the report into Patrick's rulings. Use it whenever the thread is about to send formation, fighting wing, rejoin, wingman control-loop or systems-engineering work to Fable; when Opus has failed twice on the same flight problem; when Patrick asks for "a Fable review" or "a second opinion"; when a Fable run was stopped by its safety filter; or when a Fable report needs mapping back into the project's terms.
---

# Briefing Fable for a Formation or systems review

Internal project skill (Patrick, 14 Oct 2026). It holds what worked and what failed in the Fable reviews of 13-14 Oct 2026: the wingman audit, the fighting wing audit and the cone-turn review. The rule book (`AGENTS.md`) wins over anything here.

Written for **Fable 5.1**. If the Fable version has changed, re-read Anthropic's prompting guide for the new version and update section 5 before relying on it.

## 1. Is Fable the right tool?

The rule book allows Fable only **after Opus has failed twice on the same problem, or for a one-off architecture review, and the thread tells Patrick first** (Agents and models). Say which of the two it is, and why, before you write anything.

**Use Opus instead** when the job needs the repo, the code, the manuals or the measuring tools. That includes building, tidying, auditing a diff, or a review that has to read files. Opus did the 14 Oct architecture review and the control model with full access. Fable's value is an independent second look at a design or the physics, from a document, with one clear question.

**Check the budget.** Fable has its own weekly limit (the app's usage card, or the session's usage tool). One run per question; a run that is stopped still costs.

## 2. Write one self-contained brief

Fable is briefed from **one document that holds everything it needs**. It never opens the repo, the code or the manuals. Twice, a Fable run that was pointed at the repo was stopped by its safety filter at its first file read. The trigger was the training manual's wording ("offensive formation", "tactical fighter", pursuit curves), and leading the brief with the training purpose did not save it. A self-contained renamed brief got through every time.

Use the shape in `references/brief-template.md`. In short:
1. **Context and purpose first:** a flight-school training tool for student pilots; the absolute priority is that the simulated wingman never comes close to hitting the lead aircraft. Then the line "Everything you need is in this one document. Please do not open any other file."
2. **Terms,** renamed (section 3), each defined once.
3. **The simulator in numbers:** speeds (and which kind), the delay, the limits, the step, the units.
4. **What exists and how it measures:** the gauge's numbers per case, and what was tried and why it failed.
5. **The instructor's rulings as fixed givens,** renamed. Fable designs around them and does not argue with them. Published limits are references, not walls; only physical limits are hard (rule book).
6. **One main question,** and at most a few small ones.
7. **What to return** (the template's last section).

**Paraphrase the manuals and cite paragraph numbers;** never paste manual text into the brief. The CFAFM never goes anywhere, Fable included.

**Words and numbers only.** Never paste pictures, embedded data or base64 strings into a brief; base64 is one of the false-positive triggers in Anthropic's guide. Describe a diagram in words, or give its numbers as a table.

**Systems-engineering reviews: send the numbers.** Fable did its best work on numbers and structure: the rotating-frame fact behind "inside Lead's circle and gaining", the loop-speed table, the half-gain trap and the delay budget all came from it. Put in the brief, renamed, the parts of `docs/modules/turn-sim/control-model.md` the question needs: the loops (what each senses and commands, gains, crossover and margins), the N² chart's shared controls and who wins, the switching map, and the measured faults (`tools/control-map/results/faults.json`). Ask for findings in control terms that the design gates C1-C11 can judge (`Pat's claude work/formation-review-12oct/control-systems-analysis-plan.md` §7).

## 3. Rename and scrub

| Project term | In the brief |
|---|---|
| fighting wing | the trail cone |
| lead / pure / lag pursuit | steer-ahead / steer-on / steer-behind |
| make the miss | pass clear |
| the 500 ft bubble | the 500 ft ring |

The older engine review (`Pat's claude work/formation-review-package/`) used another set: cone position, lead point / nose on / lag point, pointing, follow, spread, wandering, alpha, and two-ship module for Turn Fight. The checker's back-mapping knows both sets.

Words to keep out of the brief: "offensive", "tactical", "fighter" and "pursuit" are proven triggers (they were in what Fable read when it was stopped), and so is "kisses the bubble ... correcting" in a follow-up. "Attack", "threat", "combat", "engage", "kill" and similar are guesses: avoid them anyway. Write "a sudden manoeuvre by Lead" for a threat, and "trainer aircraft" for the T-6.

**Run the checker** before sending, and fix every flag:

```
node .agent/skills/fable-review-brief/scripts/scrub.mjs check <brief.md>
```

It exits 1 and lists line, word, proven or guess, and a suggested rewording. `scrub.mjs rename <in> <out>` applies the renames to a draft written in project terms; read the result, because a blind rename can read oddly. The term list is `scripts/terms.json`: add a word there when a new one trips the filter.

## 4. Send it

- **File the brief first:** `Pat's claude work/<review folder>/fable-<topic>-brief-<ddmon>.md`, so the renaming is traceable.
- **Spawn one read-only agent** with model `fable`. Put the brief's whole text in the prompt, so Fable needs no file at all.
- **Effort `high`.** It is Anthropic's recommended starting point. Use `xhigh` or `max` only where a measured gain shows: at those levels Fable can draft a long report in its thinking and then write it out again, which is slower and costs more.
- **No messages while it runs.** A follow-up with the instructor's own phrase tripped the filter and ended the run (after it had delivered, luckily). Hold every addition until the report lands, and fold it into the thread's own check. If one truly can't wait, scrub it like the brief and run the checker on it.

## 5. From Anthropic's Fable 5.1 prompting guide

The parts of [Prompting Claude Fable 5.1](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1) that matter for a one-off review. Most of the page is about building on the API (progress updates, tool batching, file edits, vision) and doesn't apply here.
- **Finish the whole task.** Run on its own, Fable can stop early: it describes what it would do next, or asks whether to go on. The brief must tell it that nobody is watching or can answer mid-run, and that it ends only when the report is complete. If a question comes up, it does everything that doesn't depend on the answer, states its assumption, and puts the question at the end. The brief template's last paragraph does this.
- **For a review, the assessment is the deliverable:** it reports its findings and stops, and doesn't write code.
- **Keep to the question.** No narrowing or widening it. A real problem with the question gets a sentence or two, and then it carries on under stated assumptions. Anything else it notices goes in a short note at the end.
- **Plain prose.** Fable 5.1 can write dense, flowery text. The guide's fix is one line: "Please remove all mannered prose." It is in the template, and it suits Patrick.
- **False positives still happen,** and come back as a refusal. The guide's known triggers (compile-check wording, little-known programming languages, base64 in the context) are not ours. Ours (section 3) come from our own runs, so keep adding to `terms.json`.
- **Effort:** start at `high` (section 4).

## 6. If it is stopped

Don't resend the same brief. Find what it was reading or answering when it stopped: the stop names a category, and the input just before it is the suspect. Scrub that, add the word to `terms.json`, and tell Patrick what happened. After two stops on one review, do it with Opus instead.

## 7. From report to ruling

1. **File the report** beside the brief: `fable-<topic>-report-<ddmon>.md`.
2. **Map it back:** `node .agent/skills/fable-review-brief/scripts/scrub.mjs back <report.md> <mapped.md>` adds the project term in brackets after each renamed one. Keep the mapped copy beside it; `turn-sim-review/fable-findings-mapped.md` is the older example.
3. **Check every proposal** against the module's decisions file (TS-233 for fighting wing) and the header of every file it would touch, before it reaches Patrick (rule book). The 14 Oct review read SMM Fig 12.20's "turn slightly toward Lead" the wrong way, and listed two estimates as rulings. Correct such things and say so.
4. **Treat its fixes as hypotheses.** Its structure and physics were strong; its specific mechanisms still need the gauge. Its path caps flew worse twice and were removed. Test each fix on the gauge, against the gates, before calling it a fix.
5. **Bring Patrick its questions one at a time,** in plain words, with options, a recommendation, and his own idea as an option.
6. **Record what failed** under "tried and dropped" in the decisions file, with the gauge tag.

## Worked examples

- `Pat's claude work/formation-review-12oct/fable-fighting-wing-brief-14oct.md` and `fable-fighting-wing-report-14oct.md`: a design audit, with findings F1-F19.
- `Pat's claude work/formation-review-12oct/fable-cone-turn-brief-14oct.md` and `fable-cone-turn-report-14oct.md`: a focused follow-up, with the tried-and-failed section and "What we ask".
