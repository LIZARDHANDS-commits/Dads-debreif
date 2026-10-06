# T-6 manuals: index

**How to use these references (Patrick, 4 Oct 2026).** Everything in this folder is a reference, not an absolute rule. Orders, SMM limits and safety limits show how the aircraft is normally flown, and the sims use them as a guide. The Turn Sim follows the SMM, but not as a hard rule every time. Treating "SMM safety limits" and "orders" as hard rules bogged down the fight sim, so we don't do that again.


Owner: the "T-6 manuals" thread. Started 2026-09-30.

## The manuals

| Short name | Title | Source (Patrick's Google Drive) | Local copy | How to cite |
|---|---|---|---|---|
| Gen Book | 2 CFFTS Harvard II Gen Book, Version 8.9 (issued Aug 2026), 41 pages. Aide-memoire only; says official orders win | "Harvard Gen Book V8.9.pdf", id 18FUeGlycAuoMoYU_qfelAmtL3kksGZZZ | pdf/Harvard Gen Book V8.9.pdf, text/genbook.txt | "Gen Book p.7" (PDF page = printed page) |
| EFIG | EFIG, 24 Jun 26: instructor guide slides (sequence briefs and block briefs), 464 pages | "EFIG - 24 Jun 26.pdf", id 1lVauxVCgDyOaJOpM8glkQzsrj-JL-_VX | pdf/EFIG - 24 Jun 26.pdf, text/efig.txt, text/efig-page-list.txt | "EFIG p.151" (PDF page; the slide's own footer can differ by 2 after p.380) |
| SMM | A-12-HVD-000/PT-D01, CT-156 Harvard II Standard Manoeuvre Manual, Change 3, 28 Aug 2024 | "SMM - Aug 2024.pdf", id 1CDFiZlby79UTwH3EAM1IU8ua5PaPsSxo (16 MB) | pdf/smm/SMM_-_Aug_2024-part-2..8.pdf (Patrick's split, uploaded in the thread 05:26Z; part 1 = front matter to 4.0 not uploaded, covered by text/smm-drive-text.txt), text/smm.txt (chapters 4-18, split by "===== SMM part n PDF page m =====") | "SMM 4.14 para 32" (section and paragraph) |
| NFM | A1-T6AAA-NFM-100, T-6A NATOPS Flight Manual (USN/USAF, not Moose Jaw orders) | Patrick's Scribd link (scribd.com/document/465024835), relayed by the coordinator 2026-09-30 | text/t6a-nfm-100-scribd.txt (Scribd text layer, 1.77 M chars). **Charts are images and are not in the text** (A9 turn charts, Fig 6-3 stall speeds, V-n) | "NFM Fig 3-4, p.3-12" (figure and printed page) |

**SMM coverage.** Chapters 1-4.17 from Drive's text (text/smm-drive-text.txt); chapters 4-18 from Patrick's split PDFs (text/smm.txt). Read closely so far: ch. 4 (patterns), 14.3-14.7 (energy management), 16 (advanced formation). Ch. 12 (basic formation), 17 (TAC NAV) and 18 (night) are extracted but only skimmed. Chapters starting in each part: part 2: 4, 5, 6, 7, part 3: 8, 9, 10, part 4: 11, 12, part 5: 13, part 6: 14, 15, 16, part 8: 17, 18.

## Orders and four-ship briefs (added 2026-10-04)

Uploaded by Patrick in the "manuals and orders" thread, 4 Oct 2026, to help the Traffic Sim and Turn Sim. The two orders came as text only (no PDF). The briefs' text was extracted with pdftotext; check the PDF for anything drawn.

| Short name | What it is | Date / version | Local copy | Helps | How to cite |
|---|---|---|---|---|---|
| AFM7 brief | "Four Plane Briefing AFM7", 26 pages. Four-ship mission brief: 2+2 and interval take-off, fighting wing, Spread 4 from FW and G-warm, fluid manoeuvring, finger, echelon, box, turning and straight-ahead rejoins, GULAP/initial recovery, contingencies, training rules | March 2025 | pdf/JS Four Plane Brief - AFM7 - March 2025.pdf, text/four-plane-brief-afm7.txt | Turn Sim (four-ship), Traffic Sim (four-ship take-off and recovery) | "AFM7 brief p.13" (PDF page) |
| AFM8 brief | "Four Plane Briefing AFM8", 30 pages. Same layout as AFM7, plus 3+1 take-off, altitude-stack SOP, Spread 4 manoeuvring (90, hook, 45), offset box via fluid 4 and offset box manoeuvring | March 2025 | pdf/JS Four Plane Brief - AFM8 - March 2025.pdf, text/four-plane-brief-afm8.txt | Turn Sim (four-ship), Traffic Sim (four-ship take-off and recovery) | "AFM8 brief p.14" (PDF page) |
| WFO | 15 Wing Flying Orders. Section 1: wing orders (application, general, air operations, flight safety). Section 2: CYMJ local flying orders (training areas, airfield operations, night patterns 309, VFR traffic patterns and circuits 401, closed patterns 402, IFR, formations, emergencies). Annexes include A (MTCA and CYAs), C (traffic patterns), F (traffic pattern conflict map) | AL 6.2, March 2025 edition | text/wfo-al6.2.txt | Traffic Sim (patterns, circuits, MTCA), Turn Sim (formations, training areas), SOF (airfield operations) | "WFO S2 art 401 para 3" (section, article, paragraph) |
| 2 CFFTS Orders | 2 CFFTS unit orders. Book 1 administration; Book 2 flying orders (weather and operations, VFR, IFR, night, formation, navigation, emergencies); Book 3 training orders; Annexes A-X | Amendment 011, 28 Jul 2026 | text/2cffts-orders-jul26.txt | Traffic Sim (VFR procedures), Turn Sim (formation flying, B2 ch 8), SOF (weather and operations, B2 ch 3) | "2 CFFTS Orders B2 ch 8 p.105" (book, chapter, printed page) |

## What's extracted

| File | What | Status |
|---|---|---|
| [traffic-pattern-numbers.md](traffic-pattern-numbers.md) | Moose Jaw pattern altitudes, speeds, banks, G, break, final turn, straight-in, closed pattern, joining; compared with SPEC-traffic (PR #96) and V6's built-in setup | Done from Gen Book, EFIG, SMM 4.1-4.17 |
| [weather-and-limits-numbers.md](weather-and-limits-numbers.md) | Alternate minima and when an alternate is needed, TEMPO/PROB/BECMG, GNSS, crosswind, training-rule weather limits; compared with src/wx and SPEC-sof/wx (D57-D81) | Done from Gen Book |
| [formation-and-turn-numbers.md](formation-and-turn-numbers.md) | Formation positions, rejoins, stream landing, G limits, max-performance turns; compared with V6_STANDARDS, SPEC-turn-sim, SPEC-turn-fight | Done, including SMM ch. 14 and 16 |
| [energy-model-check.md](energy-model-check.md) | Turn Fight Energy model audit items a-d vs SMM 14.14-14.17, EFIG p.428-438, NFM | Done 2026-09-30 |
| [questions-for-patrick.md](questions-for-patrick.md) | Every mismatch, as a question with a recommendation, and its answer once given. From 09:31Z (Patrick: run on the recommendation) new mismatches are **decided on recommendation, for review**, logged in /mnt/project-files/logs/decisions-for-review.md | Q1-Q9 answered; energy a-d in energy-model-check.md |

## Diagrams

`images/` holds the pages whose numbers are only in a picture (EFIG slides are mostly diagrams): the Moose Jaw traffic pattern and its ground references (efig-p211), rejoin lines (p209, p210), overhead break (p185, p186), overhead break and final turn for 29L and 11R (p151, p152), straight-in 29 and 11 (p131, p132, p201, p202), closed pattern (p135), uncontrolled circuit geometry (p399), PFL pattern (p409, p410), Gen Book alternate table (genbook-p7), RWYCC crosswind chart (genbook-p8), MTCA map (genbook-p12). These are the ground references Patrick and Dad can use for the Traffic Sim's route redraw (T8).

## SMM formation figures (images/smm-fig*.png)

Cropped from Patrick's split SMM PDFs at 200 dpi, for the Turn Sim and the verification thread (Patrick, 09:25Z: use the SMM pictures for formation geometry). Cite as "SMM Fig 16.19". Location = split PDF part and page. All LAB turn figures are marked "All turns 70/3, energy sustaining" (70° bank, 3 G).

| Figure | File | Part/page | What it shows |
|---|---|---|---|
| 12.1 | smm-fig12-1-aspect-angle.png | 5/1 | Aspect angle definition (12.2) |
| 12.2 | smm-fig12-2-heading-crossing-angle.png | 5/2 | Heading crossing angle |
| 12.15 | smm-fig12-15-turning-rejoin.png | 5/18 | Turning rejoin geometry (12.24) |
| 12.16 | smm-fig12-16-hot-line-and-cold-line-rejoins.png | 5/19 | Hot line vs cold line rejoins (12.25) |
| 12.17 | smm-fig12-17-straight-ahead-rejoin.png | 5/20 | Straight-ahead rejoin (12.26) |
| 12.19 | smm-fig12-19-fighting-wing-references.png | 5/22 | Fighting wing position/cone (12.29) |
| 12.24 | smm-fig12-24-lead-and-lag-pursuit-curves.png | 5/25 | Lead, pure and lag pursuit curves (12.30) |
| 16.9 | smm-fig16-9-aspect-angle-and-heading-crossing-angle.png | 7/3 | Aspect angle and HCA (16.16) |
| 16.10 | smm-fig16-10-maintaining-separation-in-a-turn.png | 7/4 | Separation in a turn: LOS rate 0, Vc 0, HCA ≈ 2 × aspect on the turn circle |
| 16.11 | smm-fig16-11-line-abreast.png | 7/6 | Line abreast: 4,000-6,000 ft spread, 10° sweep line (16.18) |
| 16.14 | smm-fig16-14-line-abreast-mutual-blind-area.png | 7/7 | LAB mutual blind area |
| 16.15 | smm-fig16-15-lab-delayed-90-turns.png | 7/9 | **Delayed 90**, away and towards, numbered positions 1-7. Away: lead turns into wingman first; wingman turns before lead passes through his tail and reaches about 7 or 5 o'clock. Towards: wingman turns first; lead turns before the wingman passes his tail (7/5 o'clock). Calls "VENOMS, 90 LEFT/RIGHT"; comm-out wing flash |
| 16.16 | smm-fig16-16-delayed-45-lab-turn.png | 7/10 | **Delayed 45**, away and towards: the second aircraft turns *after* the first passes through the tail and reaches about 7 or 5 o'clock; constant speed/power but slower |
| 16.17 | smm-fig16-17-45-degree-lab-with-check.png | 7/10 | **Delayed 45 with check turn**: after the first turns 45°, the other checks towards; needs a power/speed increase to hold sweep but is quicker |
| 16.18 | smm-fig16-18-check-and-in-place-turns.png | 7/11 | **Check turn** ≤ 30° (both together) and **in-place turn** > 30° to 90°, roll-out in trail at LAB spacing |
| 16.19 | smm-fig16-19-lab-hook-turn.png | 7/12 | **Hook**: both turn 180° the same way; outside aircraft adjusts G to align fuselages at the 90° point, then back to 70/3; inside holds 70/3 throughout; comm-out hooks always away from the wingman |
| 16.20 | smm-fig16-20-shackle.png | 7/12 | **Shackle**: both turn ~45° towards each other, wingman passes directly above/below lead with minimum 300 ft vertical, both turn 45° back to the original heading (an X) |
| 16.21 | smm-fig16-21-cross-turn.png | 7/14 | **Cross turn**: turn towards each other, first 90° at 60/2 (or as required to pass directly above/below), then 70/3; wingman passes with minimum 300 ft vertical; sides swap after 180° |
| 16.24 | smm-fig16-24-turning-rejoin-away.png | 7/15 | Turning rejoin (away) from LAB (16.20) |
| 16.25 | smm-fig16-25-hot-turning-rejoin-from-lab.png | 7/16 | Hot turning rejoin from LAB |
| 16.26 | smm-fig16-26-2-ship-g-awareness.png | 7/19 | **2-ship G-warm**: PCL max 220 kt; 3 G in-place 90 (into wingman); 5 s push to 0.5 G; 4 G 180° hook; 70/3 back to heading; radio calls |
| 16.27 | smm-fig16-27-basic-four-plane-formations.png | 7/20 | Basic four-ship formations |
| 16.28 | smm-fig16-28-four-plane-line-ups.png | 7/21 | Four-ship runway line-ups (500 ft between elements) |
| 16.29 | smm-fig16-29-four-plane-fighting-wing.png | 7/27 | Four-ship fighting wing |
| 16.30 | smm-fig16-30-offset-box-delayed-90-right.png | 7/29 | **Offset box** layout (West/left): elements in LAB 4,000-6,000 ft; note says second element 6,000-8,000 ft (1-1.2 NM) in trail with #3 offset between lead element, **but the diagram's arrow is labelled 8,000-12,000 ft** (see note below). Delayed 90 right: #3 delays 10-15 s, #4 turns at the standard LAB cue |
| 16.31 | smm-fig16-31-offset-box-delayed-45-right.png | 7/29 | Offset box delayed 45 right: #2 turns 45°, lead checks 10-15° into #2; second element delays 10-15 s then does the same |
| 16.32 | smm-fig16-32-offset-box-hook-turn.png | 8/1 | Offset box hook: second element delays 10-15 s; outside aircraft of each element aligns fuselages at 90° |
| 16.33 | smm-fig16-33-spread-4-lab.png | 8/1 | **Spread-4** East/West: #2-Lead 4,000-6,000, Lead-#3 8,000-12,000, #2-#4 12,000-18,000 (up to ~3 NM); altitude stack example Lead 8,000, #2 7,750, #3 8,250, #4 8,500; delayed 90 right: #2, Lead, #3, #4 in turn |
| 16.34 | smm-fig16-34-spread-4-delayed-turns.png | 8/3 | Spread-4 delayed 90 (order #4, #3, Lead, #2 for a left turn) and delayed 45 (#2 turns, others check 10-15°, then LAB 45°); altitude stack required |
| 16.35 | smm-fig16-35-spread-4-g-warm.png | 8/3 | Spread-4 G-warm, same as 2-ship with calls per aircraft |
| 16.36 | smm-fig16-36-spread-4-hook-turn.png | 8/4 | Spread-4 hook: all outside aircraft align fuselages at 90°, inside holds 70/3 through 180° |

Clock cues (5 and 7 o'clock) are on Figs 16.15-16.17. **Note on Fig 16.30:** the SMM's text (16.41 para 109) and the figure's own note say 6,000-8,000 ft trail; the diagram's arrow says 8,000-12,000 ft. Patrick's Q7 answer (7,000 ± 1,000) follows the text.

**Full-page renders by the Turn Sim** (images/smm-formation/, 0-based page numbers, so "p8" = split PDF page 9): part7-p8 Fig 16.15; p9 Figs 16.16-16.17; p10 Fig 16.18; p11 Figs 16.19-16.20; p13 Fig 16.21; p26 Fig 16.29; p28 Figs 16.30-16.31; part8-p0 Figs 16.32-16.33; p2 Figs 16.34-16.35; p3 Fig 16.36. They show the same figures as the per-figure crops above, with the surrounding page text.

## EFIG map (PDF pages)

- 2-17 contents; 18-100 block briefs (lessons); 101-270 clearhood sequence briefs; 271-360 instrument/navigation; 360-400 formation (362-369 leading, 370-376 rejoins, 377-384 station change and keeping, 385-386 interval take-off, 390-391 fighting wing, 392-393 stream landing, 394-395 destination); 396-412 uncontrolled ops and PFL; 413-433 aerobatics and max-performance turns; 434-464 PH3 block briefs.
- Pattern sequences: traffic pattern 207-212, overhead break 182-187, final turn 149-153, straight-in 129-132, flapless straight-in 199-202, closed pattern 133-135, destination procedures 144-146, go-around 156-157.
