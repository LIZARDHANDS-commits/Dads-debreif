// The saved radar and lightning pictures on the 2D map (SPEC-debrief: Saved
// radar and lightning). Each is a transparent picture that covers a box in
// degrees, drawn as one rectangle between the box's corners: the map's feet are
// flat latitude and longitude, and the pictures were asked for in the same
// (EPSG:4326), so the corners are all it takes. A picture goes in as an image
// from a data address of its own type and bytes (the file's block was checked
// before it got here), never as a link or as markup. A few decoded pictures
// are kept, so playing back and forth doesn't decode them again.
import { ALLOWED_MIMES, LIMITS } from '../weather/saved-radar.js';

/** How many decoded pictures stay in memory (a 1,024 px picture is 4 MB decoded). */
export const IMAGES_KEPT = 8;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** The data address for a frame's { mime, data }. Throws for anything but a listed picture type and base64. */
export function imageAddress({ mime, data }) {
  if (!ALLOWED_MIMES.includes(mime) || typeof data !== 'string' || !BASE64.test(data)) throw new TypeError('imageAddress: a listed picture type and base64');
  return `data:${mime};base64,${data}`;
}

/**
 * onChange(): asks for a redraw when a picture has loaded. makeImage: for
 * tests. A picture that fails to decode or is too large asks for a redraw too, so the
 * words under the map can stop naming it. Returns { draw(ctx, { items, toScreen }), state(), dispose() }.
 * items: [{ key, mime, data, box, alpha }] bottom first; key names the frame
 * (layer and time); box is { minLat, maxLat, minLon, maxLon }; toScreen(lat, lon)
 * gives [x, y] in CSS pixels.
 */
export function createSavedWeatherLayer({ onChange, makeImage = () => new Image() }) {
  const images = new Map(); // key → { image, data, ready, failed }
  let last = { wanted: 0, ready: 0, failed: 0, failedKeys: [] };

  function entryFor(item) {
    let entry = images.get(item.key);
    // The same key for other bytes (another debrief's picture for the same layer and time) is another picture.
    if (entry && entry.data !== item.data) {
      entry.image.onload = entry.image.onerror = null;
      images.delete(item.key);
      entry = undefined;
    }
    if (entry) {
      images.delete(item.key); // back to the newest end
    } else {
      entry = { image: makeImage(), data: item.data, ready: false, failed: false };
      const { image } = entry;
      image.onload = () => {
        // A small file can decode to a huge picture: whatever the file said, nothing bigger than we asked for is drawn.
        if (image.naturalWidth > LIMITS.maxPixels || image.naturalHeight > LIMITS.maxPixels) {
          entry.failed = true;
          onChange();
          return;
        }
        entry.ready = true;
        onChange();
      };
      image.onerror = () => {
        entry.failed = true;
        onChange();
      };
      image.src = imageAddress(item);
    }
    images.set(item.key, entry);
    while (images.size > IMAGES_KEPT) {
      const [oldest, gone] = images.entries().next().value;
      gone.image.onload = gone.image.onerror = null;
      images.delete(oldest);
    }
    return entry;
  }

  return {
    draw(ctx, { items, toScreen }) {
      let ready = 0;
      const failedKeys = [];
      for (const item of items) {
        const entry = entryFor(item);
        if (entry.failed) failedKeys.push(item.key);
        if (!entry.ready) continue;
        ready += 1;
        const [x1, y1] = toScreen(item.box.maxLat, item.box.minLon); // north-west
        const [x2, y2] = toScreen(item.box.minLat, item.box.maxLon); // south-east
        ctx.save();
        ctx.globalAlpha = item.alpha;
        ctx.drawImage(entry.image, Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        ctx.restore();
      }
      last = { wanted: items.length, ready, failed: failedKeys.length, failedKeys };
    },
    /** What the last draw found: { wanted, ready, failed } pictures, and the keys of those that failed. */
    state: () => last,
    dispose() {
      for (const { image } of images.values()) image.onload = image.onerror = null;
      images.clear();
    },
  };
}
