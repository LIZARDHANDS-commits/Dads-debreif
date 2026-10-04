# Shared parts: future ideas

Ideas for the shared parts (flight core, app frame, weather, airfields, storage, screen kit) that are not being built. An idea moves into `plan.md` only with Patrick's yes (TQ-1), and a new idea goes on this list the same day it is asked for. "Feature Ideas" numbers are from the researched list of 54 ideas, kept at https://claude.ai/artifact/6PMvFiKigB29hBvVSoJ2op (`pf/reset/2-inventory/agents/sources/feature-ideas.md:9`). "FF" numbers are from the old plan's future-features list (`docs/records/future-ideas.md:5`).

## Approved for the future list by Patrick (30 Sep)

- **Runway and airfield data**: runway thresholds, headings and lengths bundled for Saskatchewan from a public-domain source, so pattern geometry, landing detection and crosswind use real runways; old FF20. It is needed for the Traffic Sim at an airfield other than Moose Jaw (TR-R26) and for the SOF's crosswind per runway (SOF-R27) (`docs/records/future-ideas.md:9`, `pf/reset/2-inventory/agents/sources/plan-doc-future-features.md:23`, `pf/reset/1-requirements/requirements.md:242`, `pf/reset/1-requirements/requirements.md:145`, `pf/reset/0-lessons/sources/thread-new-feature-ideas-research.md:69`) (Feature Ideas idea 7; value high, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:9`)

## Other Feature Ideas for the shared parts

- **Magnetic declination**: true and magnetic headings, runway headings and wind in degrees magnetic from the World Magnetic Model, working offline (Feature Ideas idea 21; value medium, effort small; flight math, so it needs a check first; `pf/reset/2-inventory/agents/sources/feature-ideas.md:23`)

## Ideas for the shared parts from the old lists

- The old promise "Share and export Traffic Sim patterns" was dropped long ago in favour of default patterns plus saves in the browser (old FF9), so it is not here (`pf/reset/2-inventory/agents/sources/plan-doc-future-features.md:12`).
- A guard against infinite input inside the flight core: the old plan's open question; the default is that only the screens guard typed numbers (`tasks/flight-math/plan.md:93`).
