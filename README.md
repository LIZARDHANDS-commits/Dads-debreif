# Dad's Debrief Tool

T-6 flight training debrief and SOF suite, being refactored from a single HTML file into a modular web app.

- `original/` holds the original V6 file split into a text shell plus its embedded videos, images and KML tracks (GitHub caps files at 100 MB).
- Rebuild the exact original: `python3 tools/rebuild_original.py Dads_OODA_LOOP_Webtool_V6.html` (checks the SHA-256).
