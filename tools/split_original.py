"""Split the original single-file webtool into a text shell plus binary asset files.

GitHub rejects files over 100 MB, and the original is ~119 MB because it embeds
videos, images and KML tracks as base64. This moves each large base64 payload
into original/assets/ (decoded, named by content hash) and leaves a marker in
its place. rebuild_original.py reverses this byte-for-byte.
"""
import base64, hashlib, pathlib, re, sys

MIN_B64 = 20_000  # payloads shorter than this stay inline
MIME_EXT = {"video/mp4": "mp4", "image/png": "png", "image/jpeg": "jpg",
            "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg"}

src, out_dir = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
text = src.read_text(encoding="utf-8")
assert "@@ASSET:" not in text
assets = out_dir / "assets"; assets.mkdir(parents=True, exist_ok=True)

def stash(b64, ext):
    raw = base64.b64decode(b64, validate=True)
    assert base64.b64encode(raw).decode() == b64, "non-canonical base64"
    name = f"{hashlib.sha256(raw).hexdigest()[:16]}.{ext}"
    (assets / name).write_bytes(raw)
    return f"@@ASSET:{name}@@"

def data_uri(m):
    b64 = m.group(2)
    if len(b64) < MIN_B64: return m.group(0)
    return m.group(1) + stash(b64, MIME_EXT.get(m.group(1)[5:-8], "bin"))

def kml(m):
    b64 = m.group(2)
    if len(b64) < MIN_B64: return m.group(0)
    return m.group(1) + stash(b64, "kml") + '"'

text = re.sub(r'(data:[a-z]+/[a-z0-9.+-]+;base64,)([A-Za-z0-9+/]+=*)', data_uri, text)
text = re.sub(r'("b64":")([A-Za-z0-9+/]+=*)"', kml, text)
(out_dir / "shell.html").write_text(text, encoding="utf-8")
(out_dir / "original.sha256").write_text(hashlib.sha256(src.read_bytes()).hexdigest() + "\n")
