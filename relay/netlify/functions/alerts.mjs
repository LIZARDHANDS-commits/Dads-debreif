// The SOF's /alerts answer on Netlify (decision SOF-40): wraps createWxHandler from ../../wx.js. See relay/README.md.

import { createWxHandler } from '../../wx.js';

const handler = createWxHandler();

export default async (request) => {
  const allowed = globalThis.Netlify?.env?.get('ALLOWED_ORIGINS');
  return handler(request, allowed ? { ALLOWED_ORIGINS: allowed } : {});
};

export const config = { path: '/alerts' };
