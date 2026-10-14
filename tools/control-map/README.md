# Control map: the live wingman as a control system

The model of #2's controllers (plan T29m; `Pat's claude work/formation-review-12oct/control-systems-analysis-plan.md`). It describes the code as built and measures nothing in flight; nothing here changes how anything flies, and nothing here is a test.

| File | What it is |
|---|---|
| `signals.mjs` | The master list: blocks, signals, shared resources and their rules, cross-links, the history on its cells, the switching map, the tuning ledger, findings, questions. Edit this, never the drawn pages. |
| `tables.mjs` | Reads the wingman's four tuning tables (CLOSE_SEE, CLOSE_WING, FW_SEE, FW_WING) and the shared numbers straight from the code. `node tools/control-map/tables.mjs` prints them as JSON for `tools/flight-design/fw_loops.py`. |
| `model.template.md` | The words of `docs/modules/turn-sim/control-model.md`; `draw.mjs` fills its `{{...}}` markers. |
| `draw.mjs` | Writes `docs/modules/turn-sim/control-model.md` and `docs/modules/turn-sim/control-model/*.svg`. `--check` exits 1 if anything would change. |
| `check.mjs` | Compares the master list with a gauge run's trace columns and with the code's tuning tables. Exits 1 on any mismatch. |
| `ripple.mjs` | From a gauge run, the wobble of each switch's trigger near its line against its hysteresis band; writes `results/ripple.json` for the drawn page. |

Run from the repo root, in this order after a code change:

```bash
node tools/formation-gauge.mjs --only b5- --fw live --tag cm      # fighting wing traces
node tools/formation-gauge.mjs --only echelon-turns-60 --tag cm   # close formation traces
node tools/control-map/check.mjs --tag cm
node tools/control-map/ripple.mjs --tag cm
tools/flight-design/.venv/Scripts/python.exe tools/flight-design/fw_loops.py
node tools/control-map/draw.mjs
```

`check.mjs --drop-row <signal id>` and `--fake-column <name>` show it catching a missing row and an unknown column (the known-bad cases). Plain JavaScript (ES modules) and the pinned Python kit only; no new library.
