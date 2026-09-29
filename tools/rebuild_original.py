"""Rebuild the original single-file webtool from original/shell.html + original/assets/.

Usage: python3 tools/rebuild_original.py [output.html]
Checks the result against original/original.sha256.
"""
import base64, hashlib, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent / "original"
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "Dads_OODA_LOOP_Webtool_V6.html")
shell = (root / "shell.html").read_text(encoding="utf-8")
text = re.sub(r"@@ASSET:([\w.]+)@@",
              lambda m: base64.b64encode((root / "assets" / m.group(1)).read_bytes()).decode(),
              shell)
data = text.encode("utf-8")
out.write_bytes(data)
want = (root / "original.sha256").read_text().strip()
got = hashlib.sha256(data).hexdigest()
print(f"wrote {out} ({len(data):,} bytes)")
sys.exit(0 if got == want else f"checksum mismatch: {got} != {want}")
