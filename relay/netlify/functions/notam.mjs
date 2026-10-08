// The SOF's /notam answer on Netlify (decision SOF-40): wraps createWxHandler from ../../wx.js. See relay/README.md.
// K sites' NOTAMs need the FAA NOTAM API key, read here from the site's environment variables FAA_CLIENT_ID and FAA_CLIENT_SECRET (set in
// Netlify under Site configuration → Environment variables, never in the repository). Without them the K sites read "FAA NOTAM key not set".

import { createWxHandler } from '../../wx.js';

const handler = createWxHandler();

export default async (request) => {
  const get = (name) => globalThis.Netlify?.env?.get(name);
  const allowed = get('ALLOWED_ORIGINS');
  const faaId = get('FAA_CLIENT_ID');
  const faaSecret = get('FAA_CLIENT_SECRET');
  return handler(request, {
    ...(allowed ? { ALLOWED_ORIGINS: allowed } : {}),
    ...(faaId && faaSecret ? { FAA_CLIENT_ID: faaId, FAA_CLIENT_SECRET: faaSecret } : {}),
  });
};

export const config = { path: '/notam' };
