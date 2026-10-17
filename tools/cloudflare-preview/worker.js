// Serves a built copy of the tool (dist/) from Workers KV, as a test preview on Cloudflare's free plan. deploy.sh puts each file in
// KV under its path; this answers GET and HEAD with it. Cloudflare Pages would be simpler, but its file upload cannot pass the cloud
// session's network proxy (see README.md). Nothing here is the tool itself; the live site stays on GitHub Pages.

const TYPES = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
  glb: 'model/gltf-binary',
  gz: 'application/gzip',
  mp4: 'video/mp4',
  webm: 'video/webm',
  txt: 'text/plain; charset=utf-8',
  wasm: 'application/wasm',
};

// The page, the service worker and the manifest are checked every load, so a redeploy shows at once; the rest keep an hour
// (assets/ names carry a content hash, so they never change).
function cacheFor(key) {
  if (key.startsWith('assets/')) return 'public, max-age=31536000, immutable';
  if (key.endsWith('.html') || key === 'sw.js' || key.endsWith('.webmanifest')) return 'no-cache';
  return 'public, max-age=3600';
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('GET only', { status: 405, headers: { allow: 'GET, HEAD' } });
    let key = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
    if (key === '' || key.endsWith('/')) key += 'index.html';
    if (key.split('/').includes('..')) return new Response('not found', { status: 404 });
    const body = await env.FILES.get(key, { type: 'stream' });
    if (body === null) return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    const ext = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1).toLowerCase() : '';
    const headers = {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'cache-control': cacheFor(key),
      'x-content-type-options': 'nosniff',
    };
    return new Response(request.method === 'HEAD' ? null : body, { headers });
  },
};
