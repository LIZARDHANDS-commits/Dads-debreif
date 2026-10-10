---
name: screen-layout-and-style
description: Patrick's house rules for laying out a module's screen in this repo (columns, collapsible boxes, cards, buttons, colours, wording, display defaults) and how a screen session runs with him. Use for any screen, layout, menu or wording work on a module (Traffic, Turn Sim, Turn Fight, SOF, Debrief, shell). Internal to this project.
---

# Screen layout and style

Internal project skill. These are Patrick's preferences, learned on the Traffic screen in Oct 2026 and approved by him; Traffic is the worked example (bottom of this file). The rule book (`AGENTS.md`) wins over anything here. Use alongside `frontend-ui-engineering` (its rules, not its React code).

## 1. Ground rules for a screen session

- **Screen changes only:** layout, menus, wording. Don't touch `src/core`.
- **Stop and ask first** if a change would alter a default, a range, or what a setting does to the flying. A "screen" ask often hides one (a new default, a range for a new box, an engine option to start somewhere new). Name it and ask.
- **Model:** Sonnet, medium thinking (rule book, agents and models).
- **One module at a time.** Put the screen items into the module's `plan.md` before building. Every new ask goes into the plan or `future.md` the same day.
- **Before removing a control,** list what it did and search the code for its label text and setting key. Other code may find it by its label.

## 2. Starting a module's screen

1. Read the module's README, `plan.md` and `spec.md`, then open the module from the default start in the preview (`.claude/launch.json`, Vite on port 5173).
2. **Catalogue what is on screen:** every button, box and setting, what each does, and whether anyone uses it. Show Patrick the catalogue with a picture, with a proposal beside each item (keep, move, hide behind More, remove).
3. Propose the layout (section 3) as a mock-up before building anything bigger than a tweak. Patrick changes mock-ups; that is the point of showing them.
4. Ask one question at a time, with options and a recommendation; his own idea is always an option.
5. Build in small steps. After each one, say what to look at and whether a hard refresh is needed. Bump the version label with each change he'll see.
6. Before calling a step done, check **both views (2D and 3D)** and **the default start**. When Patrick says something is still wrong, it is usually in the view or start you didn't check.
7. Each status says which new or changed tests have not been run. Don't run tests locally (CI is the check), and don't chase CI unless Patrick asks.

## 3. Layout

Patrick's picture: **a simple first screen. The left column holds the day's conditions and the scenario. The right column holds the aircraft: making them, the list, interacting with them. Advanced settings sit in hidden menus.**

| Place | What goes there |
|---|---|
| Left column, top ("Setup") | Conditions and scenario: wind, runway, the scenario or exercise drop-down |
| Left, closed boxes inside Setup | Rarely touched things: a "Display" box (what's drawn, layers) and the module's settings |
| Right column, top | Making aircraft, in a collapsible box that starts closed |
| Right column, below | The aircraft as cards, one per aircraft |
| Bar under the map | Playback, view presets, a Fit menu, and More for the rest |

- **Start closed and show only the essentials.** A box opens when it's needed. Advanced options go under "Advanced settings" or "More".
- **One drop-down beats a panel.** A picker of ready-made scenarios is one "Scenario:" drop-down. Saving and loading scenarios is a future feature unless Patrick says otherwise.
- **Settings live where they're used,** not in a separate settings island.
- **Remove what nobody uses** (after the check in section 1). Mark 3D-only items "(3D)" and 2D-only items "(2D)".
- **Never move the camera on a click.** Selecting something doesn't fly the view to it.

## 4. The look

The approved standard:

- **Three button ranks:** main (the one big action), normal, and small in-row (inside cards and lists).
- **One "on" look:** accent border plus a light accent tint (`--accent` in `src/ui-kit/tokens.css`). Toggle buttons use `aria-pressed`. A preset lights only when the current settings actually match it.
- **One menu marker:** ▸ closed, ▾ open, on the right. Collapsible boxes use `createPanel` (`src/ui-kit/panel.js`), not hand-built ones.
- **Colour carries meaning, never decoration:**
  - Red is danger only, for example a "make a conflict" button.
  - Yellow means a forced landing (PFL): its card and tag. PFL buttons themselves are not red.
  - Text on a coloured background must pass WCAG AA (4.5:1). For white text on blue use **#1b77a8** (about 5:1); white on the light accent is only about 2:1.
  - Colour is never the only signal; a tag or word goes with it.
- **Cards, "punched out":** each item is its own box with a gap between boxes. The selected card gets a 2 px accent border and tint, and **only the selected card shows its controls**. A small ✕ removes the item (with an `aria-label`).
- **Related controls join into one.** For example a button and its option become one split control, and a card's menu is its own box with an arrow segment.
- Use the shared controls in `src/ui-kit/controls.js` and `settings-menu.js`, so ranges and validation behave the same everywhere.

## 5. Wording and information

- **Declutter hard.** Show only what a pilot needs at a glance:
  - A card shows its callsign and tag. Type and route go in the tooltip.
  - Heights are rounded to 10 ft. Show the one speed that matters, and drop extras such as ground speed, crab, and "Flying" for the normal case.
  - Nothing is said twice. No second label repeats the first.
- **Pilot words and pilot abbreviations,** the ones used at 15 Wing. Tags go in square brackets, for example [OHB], [T+GO].
- **Every distance names its reference:** "Miles back from the Merge", not "Miles". Patrick will ask "miles from what?".
- **Headings and wind in magnetic** (9° East variation, Patrick's ruling, TR-65), wind in 5° steps. If a box still reads true, flag it to Patrick rather than changing it silently.
- **Show a control only when it can be used,** rather than greying it out. A control that must stay visible but isn't ready says why on hover, for example "Select a pattern and aircraft".
- **Number boxes beat long drop-downs** for distances and amounts: a sensible step (0.1 NM) with the range stated.
- Confirm the exact wording with Patrick before writing anything he has to approve.

## 6. Display defaults

- **Open on a clean picture:** the fewest layers that still show the essentials. Patrick picks which stay on.
- **Overlays belong to the selected aircraft.** Rings, glide or reach circles and locator markers show round the selected aircraft only, in both 2D and 3D. This took three rounds in Traffic because 3D was missed.
- Lines a user may want to tune (routes, tracks) get their own settings behind a ▸: thickness (default ×1), opacity (default 70%), and a "Draw on the ground (3D)" tick.

## 7. Working with Patrick

- He tests live in the preview and sends screenshots. Keep the dev server running.
- His corrections are short ("Drop it", "it's more like 9 east"). Take them literally, apply them, and don't re-argue.
- He often picks an option and adds a twist. Do exactly the twist.
- Explain a software term the first time it comes up, and lead with the answer.
- Anything waiting on him goes on the waiting list in `docs/PLAN.md`.

## 8. Technical gotchas

- **A removed control broke another:** other code found it by its label text. Before removing or renaming a control, search the code for its visible label text and its id, not just its setting key. After removing it, press every other control that sets the same thing in the running app.
- **Keep each file's line endings** (some files are CRLF, some LF). Flipping them makes the whole file look changed.
- **`[hidden]` loses to `display: flex`.** Add `.container [hidden] { display: none; }`.
- **Dev hot-reload glitches,** such as garbled ▾ markers, clear with a full reload. Reload before calling something a bug.
- **Source rules** (`tests/unit/source-rules.test.js`): no `!important`, no `innerHTML`, no `setInterval`, and no `requestAnimationFrame` outside `src/ui-kit/scheduler.js`.
- The 3D view is a bonus: keep it working, but no new 3D polish in a module still being built, unless Patrick asks.

## 9. Worked example: Traffic (merged 4 Oct 2026, `4024fcc`, DADS v2.10.67)

What each rule above became on the Traffic screen. Open Traffic from the default start to see it.

- **Left, Setup:** "Scenario:" drop-down (default Busy circuit), the wind dial in °M that turns with the 3D view and stays round, and the runway list. Closed boxes below it:
  - "Display": routes on the map, each a show/hide toggle with ▸ line settings; Layers.
  - "Traffic settings".
- **Right:** a closed "Spawn aircraft" box. Pick Type and Route, then one button per spot:
  - Overhead break: Initial, In the break, Downwind, Perch.
  - SI pattern: Downwind, Base, Miles on final.
  - Rejoins: a miles-back number box in 0.1 NM steps.
  - PFL from area, with an On profile button.

  "Advanced settings" holds delay, pair and pair gap. Under that is the red "Spawn a conflict" button, then the aircraft cards.
- **Route names:** Overhead break, OHB Rejoin, SI Rejoin, SI pattern, plus a PFL circle row. Tags round the lap read [OHB] or [SI]; past the Window they read [T+GO], [STOP] or [GO AROUND].
- **Cards:** the callsign and tag, then height to 10 ft and airspeed. The ✕ removes the aircraft. Only the selected card shows its controls: the menu (Pattern / Landing behaviour / Manoeuvres, white on #1b77a8), Breakout, Closed Pattern with its bank as one control, High Key and PFL. Go-around shows only in the window.
- **Display default:** "Clean Operational" with caution rings, engine-out reach and height drop lines on. Only the Overhead break and OHB Rejoin lines show.
- **Removed:** "Scenarios and notes", the 3D camera buttons, Graphics in Traffic settings, the Profiles panel, and Base as an Overhead break spawn spot (moved to `future.md`).
- **Decisions behind screen asks:** TR-65 (magnetic wind) and TR-66 (spawning a whole number of miles back).
- **Since then (other sessions):** Moose Jaw rebuilt in true feet with the photo at true scale and the "Wind from" box in °M (TR-67), and the landmarks traced on the true photo (TR-68).
- **Left open:**
  - The one-look button standard is applied only in parts (Traffic plan Step 5b).
  - The PFL-from-area radial box reads °T.
  - `tests/e2e/traffic.spec.js` still describes the old spawner and saved scenarios.

  Check `docs/modules/traffic/plan.md` and the waiting list in `docs/PLAN.md` for whether these are still open.
