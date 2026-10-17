#!/usr/bin/env bash
# Puts a built dist/ into the preview's Workers KV store, then deploys the Worker that serves it (README.md).
# Run from the repository root after `npx vite build --base=/`:
#   bash tools/cloudflare-preview/deploy.sh
# Needs CLOUDFLARE_ACCOUNT_ID, and an API token with Workers Scripts and Workers KV Storage edit rights (in a cloud session the
# network proxy adds it; on a computer, set CLOUDFLARE_API_TOKEN). The token is never written to a file.
set -euo pipefail
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
API="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/storage/kv/namespaces"
AUTH=()
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")
HERE="$(cd "$(dirname "$0")" && pwd)"
NS="$(grep -oE 'id = "[0-9a-f]{32}"' "$HERE/wrangler.toml" | grep -oE '[0-9a-f]{32}')"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# KV's bulk write takes up to 100 MB per request: files go in batches of about 40 MB of base64 text.
python3 -I - dist "$WORK" <<'EOF'
import base64, json, os, sys
root, out = sys.argv[1], sys.argv[2]
batch, size, n = [], 0, 0
def flush():
    global batch, size, n
    if batch:
        with open(os.path.join(out, f'batch{n:03}.json'), 'w') as f:
            json.dump(batch, f)
        n += 1
    batch, size = [], 0
for dirpath, _, files in os.walk(root):
    for name in sorted(files):
        path = os.path.join(dirpath, name)
        key = os.path.relpath(path, root).replace(os.sep, '/')
        with open(path, 'rb') as f:
            value = base64.b64encode(f.read()).decode()
        if size + len(value) > 40_000_000:
            flush()
        batch.append({'key': key, 'value': value, 'base64': True})
        size += len(value)
flush()
EOF

for f in "$WORK"/batch*.json; do
  echo "uploading $(basename "$f")"
  curl -sS --fail-with-body -X PUT "$API/$NS/bulk" "${AUTH[@]}" -H 'content-type: application/json' --data-binary @"$f" | grep -q '"success": *true'
done
(cd "$HERE" && npx -y wrangler@4.147.0 deploy)
