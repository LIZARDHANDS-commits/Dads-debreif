# Dad's Debrief Tool

T-6 flight training debrief and SOF suite, being refactored from a single HTML file into a modular web app.

- `original/` holds the original V6 file split into a text shell plus its embedded videos, images and KML tracks (GitHub caps files at 100 MB).
- Rebuild the exact original: `python3 tools/rebuild_original.py Dads_OODA_LOOP_Webtool_V6.html` (checks the SHA-256).

## V6 baseline (the answers the new version must match)

`tests/golden/v6-baseline.json` records what V6 displays for fixed inputs: the built-in example flight in the KML viewer at 41 points in time (spacing, closure, aspect, HCA, G, lead status), the default Turn Sim setup after 0–200 steps, and the default Turn Fight on a fake clock. It is repeatable: two runs produce identical files.

Re-record it with:

```
python3 tools/rebuild_original.py /tmp/v6.html
NODE_PATH=$(npm root -g) node tools/record_v6_baseline.js /tmp/v6.html tests/golden/v6-baseline.json
```
