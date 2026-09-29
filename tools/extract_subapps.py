#!/usr/bin/env python3
"""Decode the SOF Dashboard and Traffic Pattern Sim pages that V6 embeds as base64.

V6 ships both sub-apps as base64 strings inside the main page (shell.html line 4309,
window.__SOF_DOC__, and line 3323, TRAFFIC_SRCDOC). This writes them out as readable
HTML so audits and specs can cite their line numbers.

Usage: python3 tools/extract_subapps.py OUT_DIR
Writes OUT_DIR/sof.html and OUT_DIR/traffic.html.
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHELL = ROOT / "original" / "shell.html"
SUBAPPS = {
    "sof.html": r'window\.__SOF_DOC__=new TextDecoder\("utf-8"\)\.decode\(Uint8Array\.from\(atob\("([A-Za-z0-9+/=]+)"',
    "traffic.html": r"const TRAFFIC_SRCDOC=new TextDecoder\(\)\.decode\(Uint8Array\.from\(atob\('([A-Za-z0-9+/=]+)'",
}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = pathlib.Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    text = SHELL.read_text(encoding="utf-8")
    for name, pattern in SUBAPPS.items():
        match = re.search(pattern, text)
        if not match:
            sys.exit(f"could not find the embedded {name} in {SHELL}")
        html = base64.b64decode(match.group(1)).decode("utf-8")
        (out / name).write_text(html, encoding="utf-8")
        print(f"{name}: {html.count(chr(10)) + 1} lines")


if __name__ == "__main__":
    main()
