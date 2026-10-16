# B5 T29a: the thread's tuning of fighting wing in turns (14 Oct 2026)

Work in progress on `formation-fighting-wing-b5` (b60a4a2b), not merged, not for flying. The B5 agent stopped twice (T29 06196de8, T29a d4ae55f9); the thread took over at Patrick's word ("If the agent struggles do some troubleshooting and tuning yourself and reference fables review"). Gauge: `node tools/formation-gauge.mjs --only b5- --fw live --tag <name>`; traces open side by side on `/tools/flight-plot/`.

## What was found, in order

1. **The guard's miss aimed at where Lead was 1 s ago** (T28, T29a). At a turn's start that point is still on Lead's old straight track, about 80° off #2's nose, so he pulled 3.5 G at 90° bank across: HCA 66-70°, then opening at more than 200 ft/s to 1,500-3,800 ft. The manual says to turn *slightly* toward Lead (SMM 12.29 Fig 12.20).
   - **Fix f1, the separation filter:** fly the aim's own turn unless the pass it predicts comes inside 600 ft. If it does, take the turn nearest to it that keeps the pass outside 600 ft (Lead as is and 1.3 times tighter, over 5.4 s; a search over turn rate, then refined). There are no miss or reverse phases, so nothing to cycle.
   - **Result:** from tight, never inside 500 ft for the first time (520 ft, against 472 for T28 and 455 for T29a). Into from in position ends the turn at 603 ft (T29a 1,525).
2. **In a turn, the range loop worked on slant range.** Slant can't tell behind from ahead. On a circle inside Lead's (closing at ω × d) the loop kept him inside past Lead's 3/9 line (aspect up to 127°), and the slant then grew again.
   - **Fix f4:** in the turn the range is his signed arc behind Lead round Lead's circle.
3. **Aiming at Lead + d inside his circle cuts across** when #2 starts inside the circle (every turn into him).
   - **Tried f2-f5:** follow the circle d inside Lead's, aiming at the point on it 3 s or 6 s of flight ahead. Separation is excellent: 3 s gives least slant 601 ft or more in every case except tight (520); 6 s gives 784 ft or more. **But** on turns into him #2 ends ahead of Lead's 3/9 line (aspect 140-167°).
4. **The cause that's left, a design question.** Starting inside Lead's circle at Lead's speed, #2 gains angle round it, about 1.7°/s at 430 ft inside in a 60° turn (F11: holding the place inside needs about 86% of Lead's speed). Nothing tried so far stops that gain without either a big crossing turn (HCA, opening) or ending ahead of Lead. T28's pure pursuit never gets ahead (aspect at most 66°) but ends the turn 1,040-2,050 ft back. The manual's tools are the vertical ("a climbing turn above lead or a descending turn below", Fig 12.22; Patrick: "vertical when I need to fix my spacing quickly or bleed energy quickly") and power. A climb inside the turn (a high yo-yo) cuts horizontal closure and bleeds speed; below gains speed, which is the wrong way for this problem. That needs Patrick's ruling (his "below by default" is for the miss).

## The numbers (first press, a 30 s level turn at 60°/2 G, then wings level 30 s)

Each line gives:
- **least:** the least slant in the turn;
- **end turn:** the slant and KIAS against Lead's at the end of the turn;
- **after WL:** the same after wings level;
- **jobsw:** job switches in the turn.

```
into-in-position
   t28: least 652 | end turn 1040ft -0kt | after WL 979ft 0kt | jobsw 3
   t29a: least 547 | end turn 1525ft 2kt | after WL 859ft 13kt | jobsw 3
   f1: least 599 | end turn 603ft 1kt | after WL 691ft 9kt | jobsw 7
   f4: least 784 | end turn 1137ft 5kt | after WL 651ft -15kt | jobsw 6
   f5: least 658 | end turn 746ft -39kt | after WL 957ft 6kt | jobsw 7
away-in-position
   t28: least 642 | end turn 781ft -16kt | after WL 846ft 0kt | jobsw 2
   t29a: least 689 | end turn 805ft 0kt | after WL 1010ft 6kt | jobsw 4
   f1: least 656 | end turn 705ft -16kt | after WL 783ft 13kt | jobsw 1
   f4: least 784 | end turn 1014ft -4kt | after WL 657ft -19kt | jobsw 3
   f5: least 736 | end turn 755ft -15kt | after WL 636ft 4kt | jobsw 4
into-stretched
   t28: least 661 | end turn 849ft 0kt | after WL 818ft 0kt | jobsw 3
   t29a: least 651 | end turn 1142ft 2kt | after WL 581ft 7kt | jobsw 3
   f1: least 611 | end turn 1507ft 1kt | after WL 867ft 13kt | jobsw 6
   f4: least 881 | end turn 1141ft 4kt | after WL 654ft -15kt | jobsw 4
   f5: least 601 | end turn 2596ft -4kt | after WL 2047ft 13kt | jobsw 6
away-stretched
   t28: least 672 | end turn 672ft 0kt | after WL 661ft 0kt | jobsw 0
   t29a: least 675 | end turn 726ft -1kt | after WL 602ft 6kt | jobsw 3
   f1: least 653 | end turn 672ft -9kt | after WL 746ft 13kt | jobsw 1
   f4: least 867 | end turn 1001ft -3kt | after WL 657ft -19kt | jobsw 3
   f5: least 731 | end turn 746ft -13kt | after WL 638ft 4kt | jobsw 2
into-tight
   t28: least 472 | end turn 2050ft -1kt | after WL 1412ft 0kt | jobsw 2
   t29a: least 455 | end turn 2827ft 4kt | after WL 1295ft 13kt | jobsw 2
   f1: least 520 | end turn 658ft -0kt | after WL 628ft 4kt | jobsw 1
   f4: least 520 | end turn 1559ft 2kt | after WL 818ft -13kt | jobsw 1
   f5: least 520 | end turn 646ft -14kt | after WL 688ft 1kt | jobsw 2
away-tight
   t28: least 513 | end turn 653ft -1kt | after WL 651ft 0kt | jobsw 2
   t29a: least 513 | end turn 3785ft -4kt | after WL 2622ft 12kt | jobsw 6
   f1: least 520 | end turn 1627ft -0kt | after WL 920ft 13kt | jobsw 1
   f4: least 520 | end turn 1614ft -1kt | after WL 796ft 13kt | jobsw 1
   f5: least 520 | end turn 1820ft 0kt | after WL 1238ft 13kt | jobsw 1
reversal
   t28: least 781 | end turn 786ft -0kt | after WL 764ft 0kt | jobsw 0
   t29a: least 784 | end turn 942ft 4kt | after WL 627ft 5kt | jobsw 1
   f1: least 784 | end turn 942ft 4kt | after WL 1031ft 11kt | jobsw 1
   f4: least 784 | end turn 944ft 2kt | after WL 657ft -15kt | jobsw 1
   f5: least 784 | end turn 944ft 2kt | after WL 1028ft 5kt | jobsw 1
outside-cone
   t28: least 706 | end turn 736ft 0kt | after WL 720ft 0kt | jobsw 3
   t29a: least 733 | end turn 733ft 3kt | after WL 544ft 4kt | jobsw 3
   f1: least 623 | end turn 623ft -2kt | after WL 639ft 6kt | jobsw 3
   f4: least 702 | end turn 1196ft 6kt | after WL 693ft -13kt | jobsw 3
   f5: least 608 | end turn 610ft -7kt | after WL 626ft 3kt | jobsw 13
```

Most aspect (deg) in the turn and after wings level (over 90 = ahead of Lead's 3/9 line):

```
b5-away-in-position.t28 turn 37 after 16
b5-away-stretched.t28 turn 37 after 16
b5-away-tight.t28 turn 57 after 15
b5-into-in-position.t28 turn 42 after 25
b5-into-stretched.t28 turn 43 after 20
b5-into-tight.t28 turn 66 after 65
b5-outside-cone.t28 turn 46 after 17
b5-reversal-mid-entry.t28 turn 37 after 21
b5-away-in-position.t29a turn 37 after 47
b5-away-stretched.t29a turn 37 after 39
b5-away-tight.t29a turn 54 after 48
b5-into-in-position.t29a turn 55 after 41
b5-into-stretched.t29a turn 56 after 36
b5-into-tight.t29a turn 77 after 77
b5-outside-cone.t29a turn 57 after 34
b5-reversal-mid-entry.t29a turn 37 after 47
b5-away-in-position.f1 turn 37 after 35
b5-away-stretched.f1 turn 37 after 37
b5-away-tight.f1 turn 52 after 49
b5-into-in-position.f1 turn 150 after 56
b5-into-stretched.f1 turn 60 after 41
b5-into-tight.f1 turn 150 after 45
b5-outside-cone.f1 turn 58 after 42
b5-reversal-mid-entry.f1 turn 37 after 47
b5-away-in-position.f4 turn 138 after 139
b5-away-stretched.f4 turn 137 after 139
b5-away-tight.f4 turn 51 after 51
b5-into-in-position.f4 turn 167 after 167
b5-into-stretched.f4 turn 167 after 167
b5-into-tight.f4 turn 164 after 164
b5-outside-cone.f4 turn 166 after 166
b5-reversal-mid-entry.f4 turn 37 after 164
b5-away-in-position.f5 turn 89 after 91
b5-away-stretched.f5 turn 83 after 85
b5-away-tight.f5 turn 44 after 39
b5-into-in-position.f5 turn 142 after 124
b5-into-stretched.f5 turn 60 after 48
b5-into-tight.f5 turn 160 after 109
b5-outside-cone.f5 turn 58 after 45
b5-reversal-mid-entry.f5 turn 37 after 122
```

**Switches in `FW_WING`:**
- `guard.filter`: true is the separation filter; false is T29a's miss and reverse.
- `followCircle`: true follows Lead's circle; false aims at Lead + d.
- `circleLookSec`: 3 as committed.

**Keep unchanged:** not re-run by the thread after these changes. All the changes are inside the Live fighting wing path (Old is the default), but the byte-identical checks must be re-run before any merge.
