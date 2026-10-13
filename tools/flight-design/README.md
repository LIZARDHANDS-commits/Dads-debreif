# Flight design kit (offline, Python)

Design and check flight profiles before they are coded: a loop's rate schedule (TS-213), rejoin paths, filter gains and settling times. The browser never runs Python: what this kit works out goes into the app as small committed tables or gains, each with a header naming the script that made it, its inputs and the date. Patrick's yes, 12 Oct 2026 (Formation plan Step 12.1d). `tools/trj-casadi/` is the older CasADi rejoin study, same idea.

## Set up (once per PC; the environment is not in git)

Python 3.10. From the repo root, in Git Bash:

```bash
python -m venv tools/flight-design/.venv
tools/flight-design/.venv/Scripts/python.exe -m pip install -r tools/flight-design/requirements.txt
```

`requirements.txt` pins every package to an exact version: the kit is CasADi (optimal control), SciPy (integration, solvers) and python-control (filters, frequency response); the rest is what they pull in. Change a version only on purpose, with the reason in the commit.

## Rules

- Inputs come from the repo's own numbers (core `t6-performance.js`, `docs/modules/turn-sim/numbers.md`) or Patrick's rulings; a design is checked against the sim's own point mass (core `point-mass.js`) before it is used.
- A generated table is an estimate with its source script until Patrick's ruling or a manual page backs the target it was designed to (rule book: every flying number has a source).
- Nothing here ships to the site, and nothing here is a test.
