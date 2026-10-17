// The whole relay as one Cloudflare Worker (wrangler.toml): every route the Netlify site answers, sent by path to the same handlers
// (lib.js for /traffic, wx.js for /notam, /alerts and /fronts). Nothing here changes what they do. traffic.js stays the /traffic-only
// Worker. See relay/README.md.

import { createHandler } from './lib.js';
import { createWxHandler } from './wx.js';

const traffic = createHandler();
const wx = createWxHandler();
const WX_PATHS = new Set(['/notam', '/alerts', '/fronts']);

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    // Worker variables: ALLOWED_ORIGINS, SECOND_FEED (wrangler.toml); FAA_CLIENT_ID and FAA_CLIENT_SECRET as secrets, never in the repository.
    if (WX_PATHS.has(pathname)) return wx(request, env);
    return traffic(request, env, ctx); // /traffic, and the same 403/404 answers as before for anything else
  },
};
