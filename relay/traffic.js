// The SOF's live-traffic relay: a Cloudflare Worker. This file is only the entry point,
// with the one default export a Worker expects; the code is in lib.js, so the extra
// exports the tests use are never taken for Worker entry points. See relay/README.md.

import { createHandler } from './lib.js';

const handler = createHandler();

export default {
  async fetch(request, env, ctx) {
    return handler(request, env, ctx);
  },
};
