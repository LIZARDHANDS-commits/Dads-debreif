# Dad's Status and Plan (`docs/dad/status-and-plan.md`)

> **Single-Writer Rule:** Only Dad's Claude sessions edit this file and [waiting-on-patrick.md](waiting-on-patrick.md). For Patrick's messages and rulings to Dad, read **[../pat/bulletin-for-dad.md](../pat/bulletin-for-dad.md)** first.

## All of Dad's Work Incorporated on `main` (17 Oct 2026 — `V2.513`)

Every single one of Dad's 25 open pull requests (`#946` through `#1067`) has been deconflicted, merged into `main`, and published to the live site (`https://lizardhands-commits.github.io/Dads-debreif/`):

| Module / Area | Incorporated PRs on `main` | Current State & Folder |
| :--- | :--- | :--- |
| **Run-In Simulator / Advanced Mission Sets** | `#1059` (spec), `#1062` (`V2.502` orbit, run-in, release & escape in 3D, `RS-1` to `RS-9`), `#1064` (`V2.507` point-parallel air refuelling & live anthem flyover `RS-10` to `RS-27`), `#1067` (`V2.512` 60° bank anthem cut skipping the IP + infinity-sign figure 8 `RS-11`, `RS-26`) | Built and live on `main`. Folder: [../modules/run-in-sim/](../modules/run-in-sim/) |
| **Debrief** | `#1042` (`V2.511` airborne start altitude `DB-28`), `#1046` (`V2.508` 3D satellite ground tiles & Satellite detail setting `DB-34`), `#1052` (`V2.500` simulated CARP drop over a drop zone `DB-36`), `#1054` (`V2.501` large exercises up to 4 flights of 4 ships `DB-37`) | Built and live on `main`. Folder: [../modules/debrief/](../modules/debrief/) |
| **Shared 3D Aircraft Models** | `#1020` (CT-102B Astra II plan), `#1041` (`V2.497` T-38A Talon in Beale paint + rough cockpit `DB-32`/`DB-33`), `#1050` (`V2.499` C-130J-30 Hercules in USAF grey with Ramstein RS tail `DB-35`) | Built and live on `main`. Folder: [../modules/shared/](../modules/shared/) |
| **EP Tabletop** | `#946` (`V2.509` instructor's phone by QR, faults driving gauges/lights, cues & aircraft flying student's picks), `#1048` (`V2.510` Any setup, freeze at any point, attitude ball & spin) | Built and live on `main`. Folder: [../modules/ep-tabletop/](../modules/ep-tabletop/) |
| **SOF Weather Desk** | `#1039` (`V2.495` 3D MRMS radar heights), `#1045` (`V2.496` NOAA 3D lightning bolts), `#1063` (Cloudflare Worker weather/map relay) | Built and live on `main`. Folder: [../modules/sof/](../modules/sof/) |
| **Traffic Pattern Sim (CT-102B Astra II)** | `#1024`, `#1027`, `#1028`, `#1030`, `#1033`, `#1037`, `#1038` (`V2.491` Astra II performance, overhead & outer pattern, spawner, cross-type conflicts & 3D model) | Built and live on `main`. Folder: [../modules/traffic/](../modules/traffic/) |

## How Dad's Claude Saves Work (`/save`)

1. Start every new branch fresh from `origin/main` (`git fetch origin && git checkout -B main origin/main && git switch -c <branch>`).
2. Update the module's own files in `docs/modules/<module>/` (`README.md`, `plan.md`, `decisions.md`, `spec.md`, `requirements.md`, `future.md`) and update `docs/dad/status-and-plan.md` or `docs/dad/waiting-on-patrick.md`.
3. Do **not** edit `docs/PLAN.md`, `docs/pat/*`, `index.html`, or `src/modules/traffic/version.js` (`vite.config.js` stamps the `V2.xxx` version automatically from Git history).
