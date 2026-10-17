# Bulletin from Patrick for Dad (17 Oct 2026 — `V2.514`)

> **Instruction for Dad's Claude Code:** Whenever you start a session, run `/sync`, or pull/merge `main`, **show Dad the message below at the very top of your reply** before doing any work.

---

## Message from Patrick to Dad

1. **All of your work is now incorporated and live on `main`!**
   - Every single one of your 25 pull requests (`#946` through `#1067`) has been deconflicted, merged into `main`, and published to the live site (`https://lizardhands-commits.github.io/Dads-debreif/` — do a hard refresh `Ctrl+Shift+R`):
     - **Advanced Mission Sets / Run-In Simulator:** `#1067` (live anthem cut at 60° bank skipping the IP + infinity-sign figure 8), `#1064` (point-parallel air refuelling & live anthem flyover), `#1062` & `#1059` (Run-In Simulator `RS-1` to `RS-9`).
     - **Debrief & Shared 3D Aircraft:** `#1054` (16-ship exercises `DB-37`), `#1052` (simulated CARP drop `DB-36`), `#1050` (C-130J-30 Hercules `DB-35`), `#1041` (T-38A Talon + rough cockpit `DB-32`/`DB-33`), `#1046` (3D satellite ground tiles `DB-34`), `#1042` (airborne start altitude `DB-28`).
     - **EP Tabletop:** `#946` (instructor's phone QR, faults & gauges) and `#1048` (Any setup, freeze & attitude ball).
     - **SOF 3D Weather:** `#1039` (3D MRMS radar heights) and `#1045` (NOAA 3D lightning bolts).
     - **Traffic CT-102B Astra II:** `#1020`, `#1024`, `#1027`, `#1028`, `#1030`, `#1033`, `#1037`, `#1038` (Astra II performance, overhead/outer pattern, cross-type conflicts & 3D model).
     - **Cloudflare Relay:** `#1063`.

2. **Check out the new Model Showcase (`#/showcase`)!**
   - Open the live site (`https://lizardhands-commits.github.io/Dads-debreif/#/showcase`, or click **Model Showcase** on the Home screen after a hard refresh `Ctrl+Shift+R`) or in your local browser (`http://localhost:5173/#/showcase`).
   - It lets you inspect the CT-156 Harvard II 3D model on its own—on its gear or flying, in **High** or **Performance** detail, with **wear and grime sliders**, movable stick/rudder/flaps/gear/canopy/speedbrake/lights, and camera views from outside or either cockpit seat.

3. **We split the project tracking docs into `docs/dad/` and `docs/pat/` so our PRs never collide:**
   - **Your own tracking folder is now [`docs/dad/`](../dad/README.md):**
     - [`docs/dad/status-and-plan.md`](../dad/status-and-plan.md) — your status log and module plan overview.
     - [`docs/dad/waiting-on-patrick.md`](../dad/waiting-on-patrick.md) — your list of items and questions waiting for Patrick.
   - **Patrick's tracking folder is [`docs/pat/`](README.md)** (including this [`bulletin-for-dad.md`](bulletin-for-dad.md)).
   - **How it works (Read-Both, Write-Own):**
     - Both sides can read everything, but **Dad's Claude only edits `docs/dad/*` and `docs/modules/<module>/*`**, and **Patrick's sessions only edit `docs/pat/*` and `docs/modules/<module>/*`**.
     - Do **not** edit `docs/PLAN.md`, `index.html`, or `src/modules/traffic/version.js` on feature branches (`vite.config.js` now computes and stamps the next `V2.xxx` version automatically from Git history on every build and merge).
     - Always start new work from a fresh branch off `origin/main` (`git fetch origin && git checkout -B main origin/main && git switch -c <new-branch-name>`).
