// The EP Tabletop's phone link mailbox on Netlify (EP-8 to EP-10): wraps createEpLinkHandler from ../../ep-link.js with a Netlify Blobs
// store (strong consistency, so the student's screen reads the phone's latest PUT). See relay/README.md, "/ep-link".

// @ts-ignore -- installed only in relay/ (`npm ci` there before deploying), not in the tool's own packages
import { getStore } from '@netlify/blobs';
import { createEpLinkHandler } from '../../ep-link.js';

function openStore() {
  const blobs = getStore({ name: 'ep-link', consistency: 'strong' });
  return {
    get: (id) => blobs.get(id, { type: 'json' }),
    create: async (id, entry) => (await blobs.setJSON(id, entry, { onlyIfNew: true })).modified,
    put: (id, entry) => blobs.setJSON(id, entry),
    delete: (id) => blobs.delete(id),
    keys: async () => (await blobs.list()).blobs.map((b) => b.key),
  };
}

const handler = createEpLinkHandler({ openStore });

export default async (request) => {
  const allowed = globalThis.Netlify?.env?.get('ALLOWED_ORIGINS');
  return handler(request, allowed ? { ALLOWED_ORIGINS: allowed } : {});
};

export const config = { path: '/ep-link' };
