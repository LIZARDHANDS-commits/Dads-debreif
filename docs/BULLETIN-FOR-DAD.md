# Bulletin from Patrick for Dad (17 Oct 2026)

> **Instruction for Dad's Claude Code:** Whenever you start a session, run `/sync`, or pull/merge `main`, **show Dad the message below at the very top of your reply** before doing any work.

---

## Message from Patrick to Dad

1. **Check out the new Model Showcase!**
   - Open the live site (`https://lizardhands-commits.github.io/Dads-debreif/#/showcase`, or click **Model Showcase** on the Home screen after a hard refresh `Ctrl+Shift+R` on `V2.512`) or in your local browser (`http://localhost:5173/#/showcase`).
   - It lets you inspect the CT-156 Harvard II 3D model on its own—on its gear or flying, in **High** or **Performance** detail, with **wear and grime sliders**, movable stick/rudder/flaps/gear/canopy/speedbrake/lights, and camera views from outside or either cockpit seat.

2. **All 25 of your open PRs are now merged and live on `main` (`V2.512`)!**
   - Everything is in `main` and published to GitHub Pages:
     - **Advanced Mission Sets / Run-In Simulator:** `#1067` (live anthem cut at 60° bank skipping the IP + infinity-sign figure 8), `#1064` (point-parallel air refuelling & live anthem flyover), `#1062` & `#1059` (Run-In Simulator `RS-1` to `RS-9`).
     - **Debrief & Shared 3D Aircraft:** `#1054` (16-ship exercises `DB-37`), `#1052` (simulated CARP drop `DB-36`), `#1050` (C-130J-30 Hercules `DB-35`), `#1041` (T-38A Talon + rough cockpit `DB-32`/`DB-33`), `#1046` (3D satellite ground tiles `DB-34`), `#1042` (airborne start altitude `DB-28`).
     - **EP Tabletop:** `#946` (instructor's phone QR, faults & gauges) and `#1048` (Any setup, freeze & attitude ball).
     - **SOF 3D Weather:** `#1039` (3D MRMS radar heights) and `#1045` (NOAA 3D lightning bolts).
     - **Traffic CT-102B Astra II:** `#1020`, `#1024`, `#1027`, `#1028`, `#1030`, `#1033`, `#1037`, `#1038` (Astra II performance, overhead/outer pattern, cross-type conflicts & 3D model).
     - **Cloudflare Relay:** `#1063`.

---

## Conflict-Free Repo Rules for Dad's Claude (Effective `V2.512`)

To stop our pull requests from colliding with each other on `main`:

1. **Always start a new branch fresh from `origin/main`:**
   - All previous PR stacks (`#946` through `#1067`) are merged into `main`. Before starting any new piece of work, run `git fetch origin && git checkout -B main origin/main && git switch -c <new-branch-name>`. Do not stack new branches on top of old feature branches.
2. **Do not edit `src/modules/traffic/version.js` or `index.html` on feature branches:**
   - `vite.config.js` now computes and stamps the next `V2.xxx` version number automatically from Git history on every build and merge. Leaving `version.js` and `index.html` untouched on feature branches means two open PRs will never conflict on the version line again.
3. **Keep documentation edits inside your module's own folder (`docs/modules/<module>/*`):**
   - Do not edit `docs/PLAN.md` on feature branches. Put any "waiting on Patrick" notes or task ticks in your module's own `docs/modules/<module>/README.md` or `plan.md` so parallel PRs never collide on `docs/PLAN.md`.
