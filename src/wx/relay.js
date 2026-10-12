// Our own Netlify relay (relay/README.md; SOF-40), shared so no module keeps its own copy of its address or of the address check
// (modules never import each other). Plain values, no page.
//
// The SOF's "Traffic relay address" setting still starts empty, so its traffic, NOTAM and alert layers stay hidden until someone types
// an address (SOF-7); it checks what is typed with relayOrigin below. The EP Tabletop's phone link starts from RELAY_ADDRESS (EP-8).

/** The relay's live address, deployed from Dad's computer (relay/README.md, "Live now", 7 Oct 2026). */
export const RELAY_ADDRESS = 'https://dads-sof-relay.netlify.app';

/** https only, or http for local development; an origin with nothing after it. Returns the origin or null. */
export function relayOrigin(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) return null;
  let url;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    return null;
  }
  const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !local) return null;
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
  return url.origin;
}
