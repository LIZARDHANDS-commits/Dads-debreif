// The SOF's live-traffic relay on Netlify (decision SOF-40): the same handler as the Cloudflare
// Worker in ../../traffic.js, wrapped for Netlify Functions. The code is in ../../lib.js. See relay/README.md.

import { createHandler } from '../../lib.js';

const handler = createHandler();

export default async (request) => {
  // Netlify keeps site settings in its own environment; only ALLOWED_ORIGINS is read, as on Cloudflare.
  const allowed = globalThis.Netlify?.env?.get('ALLOWED_ORIGINS');
  return handler(request, allowed ? { ALLOWED_ORIGINS: allowed } : {});
};

// The address is <site>.netlify.app/traffic, so the SOF's "Traffic relay address" is just https://<site>.netlify.app
export const config = { path: '/traffic' };
