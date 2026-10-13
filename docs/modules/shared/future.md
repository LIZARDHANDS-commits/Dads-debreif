# Shared parts: future ideas

Ideas for the shared parts (flight core, app frame, weather, airfields, storage, screen kit) that are not being built. An idea moves into `plan.md` only with Patrick's yes (TQ-1), and a new idea goes on this list the same day it is asked for. "Feature Ideas" numbers are from the researched list of 54 ideas, kept at https://claude.ai/artifact/6PMvFiKigB29hBvVSoJ2op (`pf/reset/2-inventory/agents/sources/feature-ideas.md:9`). "FF" numbers are from the old plan's future-features list (`archive/docs/records/future-ideas.md:5`).

## Approved for the future list by Patrick (30 Sep)

- **Runway and airfield data**: runway thresholds, headings and lengths bundled for Saskatchewan from a public-domain source, so pattern geometry, landing detection and crosswind use real runways; old FF20. It is needed for the Traffic Sim at an airfield other than Moose Jaw (TR-R26) and for the SOF's crosswind per runway (SOF-R27) (`archive/docs/records/future-ideas.md:9`, `pf/reset/2-inventory/agents/sources/plan-doc-future-features.md:23`, `pf/reset/1-requirements/requirements.md:242`, `pf/reset/1-requirements/requirements.md:145`, `pf/reset/0-lessons/sources/thread-new-feature-ideas-research.md:69`) (Feature Ideas idea 7; value high, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:9`)

## Other Feature Ideas for the shared parts

- **Magnetic declination**: true and magnetic headings, runway headings and wind in degrees magnetic from the World Magnetic Model, working offline (Feature Ideas idea 21; value medium, effort small; flight math, so it needs a check first; `pf/reset/2-inventory/agents/sources/feature-ideas.md:23`)

## Ideas for the shared parts from the old lists

- The old promise "Share and export Traffic Sim patterns" was dropped long ago in favour of default patterns plus saves in the browser (old FF9), so it is not here (`pf/reset/2-inventory/agents/sources/plan-doc-future-features.md:12`).
- A guard against infinite input inside the flight core: the old plan's open question; the default is that only the screens guard typed numbers (`archive/tasks/flight-math/plan.md:93`).

## Tooling

- Update Playwright (the browser-test tool) past 1.56; 1.63 fails the two offline tests in tests/e2e/offline.spec.js (page doesn't load from its offline copy), so find what changed first (PR #162, closed 4 Oct). Done 12 Oct (#956, 1.64.0): the test server's "Vary: Origin" header kept the main script out of the offline copy; it is off now.

## Cockpit (shared 3D)

- **Live sun shadows in the cockpit** (Patrick, 11 Oct 2026 10:33Z, "Future the dynamic shadows"): shadows of the bows, glareshield and canopy frame that move across the cockpit as the aircraft turns, behind a switch because they cost frame rate. The baked soft shadows from the Blender cockpit file (V2.306) stay as they are and don't move.
- **Open from the V2.388 cockpit and canopy fixes** (Patrick, 12 Oct 2026, "make sure we have everything recorded and handed over"):
  - Not yet seen in the app in a browser after deploy, in flight or on a phone. The cockpit model file is about 4 MB to load.
  - Sizes of the lamps, the bow's T section and bolt holes, the bow mirrors and the compass bracket are estimates off Patrick's cockpit photos. Refine them if a measured photo turns up.
  - The left-side walls and canopy rail look near-black whenever the sun is on the right (Patrick, 12 Oct 2026, "it doesn't though?"). Found 12 Oct: the 3D views' sky light (three.js HemisphereLight) shines along +Y, three.js's default up, but these scenes are Z-up, so the "sky" lights faces turned to +Y (north in Traffic) and the "ground" colour lights the rest, whatever way they face up or down. One line per scene (`hemisphere.position.set(0, 0, 1)`) points it up; a render with it lifts the shaded left wall but it stays dark. It changes every module's look, so it waits for Patrick's yes, and each scene's owner makes it.
  - The pilots are drawn in code and are not in the Blender cockpit file, so they have no rounded edges or baked shadows yet.
  - Rear seat raised 0.5 in (Patrick's pick, 12 Oct 2026): check the rear seat's 220 KIAS view in flight.

## Aircraft models

- **CT-102 Astra model** (Dad, 13 Oct 2026: "Can you start the same process and plan for the CT-102 Astra"). The CT-156's process (ALL-38: Blender master in `3d-work`, sources table, size checks, full renders and a fix list, High and Performance delivery), applied to the Astra. Which Astra (CT-102A piston or CT-102B Astra II turboprop), where it's used first, and who builds it wait on Patrick. The proposed plan, public sizes with their sources, and what Dad can gather meanwhile: [ct102-astra-plan.md](ct102-astra-plan.md).
