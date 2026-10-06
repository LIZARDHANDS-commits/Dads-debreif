# Setup panel: lines that need your yes

The left panel is now called "Setup", and the scenarios and wind sit at the top of it, so these test lines and checklist lines no longer match the screen. This is the exact new wording.

## Test lines

`tests/unit/traffic/layout.test.js`

- line 55, was `...three columns: Routes, the map...`, becomes:
  `test('the screen is three columns: Setup, the map with its bar above it, and Aircraft', () => {`
- line 60, was `'Routes'`, becomes:
  `assert.equal(routes.getAttribute('aria-label'), 'Setup');`
- line 163, was `'Routes'`, becomes:
  `assert.equal(words(withClass(routes, 'panel-toggle')[0]), 'Setup');`
- line 190, was `childNodes[0] ... 'first in the left column'`, becomes:
  `assert.equal(routesBody.childNodes[1], ui.slots.profiles, 'next after the scenarios and wind, still in the first screen');`
- line 191, the list of slots gains `'setup'` at the front:
  `assert.deepEqual(Object.keys(ui.slots), ['setup', 'pointTable', 'leftExtras', 'profiles', 'spawner', 'aircraft', 'conflicts', 'settings']);`

`tests/e2e/traffic.spec.js`

- line 321, was `'Routes'`, becomes:
  `const inOrder = ['Setup', 'Pattern 1', 'Entry 1', 'Play', 'Reset', 'Fit', 'Layers', 'Aircraft'];`

## Sign-off checklist lines (`docs/modules/traffic/testing.md`)

- line 106, the start changes from "**Routes & Patterns** panel on the left (showing" to:
  "**Setup** panel on the left (scenario buttons and the wind dial on top, then the routes:"
  The rest of the line stays as it is.
- line 109, the end changes from ", and Wind controls (**Wind from: °T** and **Wind speed: kt**)." to:
  ". The wind is set in the Setup panel."
- line 128 becomes:
  "- [ ] In the **Setup** panel on the left, find the **Wind** dial and the **Wind strength** bar."
- line 129 becomes:
  "- [ ] Drag the dial round to `210` and slide **Wind strength** to `25 kt` (crosswind from the left on RWY 29L). The line under the bar reads "29L: 1 kt head, 25 kt cross from the left"."
- New line after line 109:
  "- [ ] Press each **Scenarios** button: the aircraft change to that scenario, paused at 0:00. **Random** gives five aircraft spread round the routes, and pressing it again gives a new picture."
