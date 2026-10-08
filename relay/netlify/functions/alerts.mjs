// The SOF's /alerts answer on Netlify (decision SOF-40): wraps createWxHandler from ../../wx.js. See relay/README.md.
// Canadian sites' SIGMETs, AIRMETs and PIREPs come from NAV CANADA and K sites' from aviationweather.gov (no key needed for either).

import { createWxHandler } from '../../wx.js';

const handler = createWxHandler();

export default async (request) => {
  const allowed = globalThis.Netlify?.env?.get('ALLOWED_ORIGINS');
  return handler(request, allowed ? { ALLOWED_ORIGINS: allowed } : {});
};

export const config = { path: '/alerts' };
