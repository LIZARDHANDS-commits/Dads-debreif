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

# KV's free plan allows 1,000 writes a day, so only files that changed since the last deploy are written: the store keeps
# a list of every file's SHA-256 under the key __manifest (read once, written once). A bulk write takes up to 100 MB per
# request, so changed files go in batches of about 40 MB of base64 text.
curl -sS "$API/$NS/values/__manifest" "${AUTH[@]}" -o "$WORK/old.json" || true
python3 -I - dist "$WORK" <<'EOF'
import base64, hashlib, json, os, sys
root, out = sys.argv[1], sys.argv[2]
try:
    with open(os.path.join(out, 'old.json')) as f:
        old = json.load(f)
    if not isinstance(old, dict) or 'success' in old:
        old = {}
except Exception:
    old = {}
new, batch, size, n, sent = {}, [], 0, 0, 0
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
            data = f.read()
        new[key] = hashlib.sha256(data).hexdigest()
        if old.get(key) == new[key]:
            continue
        value = base64.b64encode(data).decode()
        if size + len(value) > 40_000_000:
            flush()
        batch.append({'key': key, 'value': value, 'base64': True})
        size += len(value)
        sent += 1
batch.append({'key': '__manifest', 'value': json.dumps(new)})
flush()
print(f'{sent} of {len(new)} files changed')
EOF

for f in "$WORK"/batch*.json; do
  echo "uploading $(basename "$f")"
  curl -sS --fail-with-body -X PUT "$API/$NS/bulk" "${AUTH[@]}" -H 'content-type: application/json' --data-binary @"$f" | grep -q '"success": *true'
done
(cd "$HERE" && npx -y wrangler@4.147.0 deploy)
