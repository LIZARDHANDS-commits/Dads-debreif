// The SOF's live-traffic relay on Netlify (decision SOF-40): the same handler as the Cloudflare
// Worker in ../../traffic.js, wrapped for Netlify Functions. The code is in ../../lib.js. See relay/README.md.

import { createHandler } from '../../lib.js';

const handler = createHandler();

export default async (request) => {
  // Netlify keeps site settings in its own environment; only ALLOWED_ORIGINS is read, as on Cloudflare.
  const allowed = globalThis.Netlify?.env?.get('ALLOWED_ORIGINS');
  // On by default on Netlify (Dad, 7 Oct: low traffic near Regina missing); set SECOND_FEED=none on the site to turn it off.
  const set = globalThis.Netlify?.env?.get('SECOND_FEED');
  const second = set === 'none' ? null : set || 'adsb.fi';
  return handler(request, { ...(allowed ? { ALLOWED_ORIGINS: allowed } : {}), ...(second ? { SECOND_FEED: second } : {}) });
};

// The address is <site>.netlify.app/traffic, so the SOF's "Traffic relay address" is just https://<site>.netlify.app
export const config = { path: '/traffic' };
