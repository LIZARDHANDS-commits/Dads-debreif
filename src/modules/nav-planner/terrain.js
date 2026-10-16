// The ground under the route, for the terrain clearance (docs/modules/nav-planner/spec.md, "Terrain clearance"; NP-6). The shared Terrarium
// tiles at zoom 12 (about 80 ft a pixel at Moose Jaw; the data under them about 30 m, so every clearance is an estimate), loaded by the
// Debrief's terrain-heights.js as it is: one loader per tile, so a tile is fetched once however often the route changes, and kept until the
// planner closes. Each leg is sampled every SAMPLE_FT along its centreline.
// When data fails: a tile that never comes (or isn't a terrain tile) leaves its samples NaN, and the leg's status is 'unknown', never clear.
import { lonLatToTile } from '../../core/geo.js';
import { createTerrainHeights, TERRAIN_ZOOM } from '../debrief/terrain-heights.js';
import { legGeometry, pointAlong } from './legs.js';

/** Samples along a leg's centreline, ft apart (estimate: about four to a tile pixel). */
export const SAMPLE_FT = 300;
/** The most tiles asked for in all (estimate: a 150 NM route needs about 60 to 90; a cap for speed and courtesy to the host). */
export const MAX_TILES = 160;

/** The samples along a leg from a to b: [{ lat, lon, f }], the ends included. */
export function legSamples(a, b, stepFt = SAMPLE_FT) {
  const { distFt } = legGeometry(a, b);
  const n = Math.max(1, Math.ceil(distFt / stepFt));
  const out = [];
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    out.push({ ...pointAlong(a, b, f), f });
  }
  return out;
}

/**
 * Summarizes the ground along one leg from its samples' heights (ft, NaN unknown) and whether any tile is still loading:
 * { status: 'ready' | 'loading' | 'unknown', highestFt, highestAt, meanFt, highestKnownFt }. 'ready' only when every sample is known.
 */
export function summarizeLeg(samples, heights, loading) {
  let highest = -Infinity;
  let highestAt = null;
  let sum = 0;
  let known = 0;
  heights.forEach((h, k) => {
    if (!Number.isFinite(h)) return;
    known += 1;
    sum += h;
    if (h > highest) {
      highest = h;
      highestAt = { lat: samples[k].lat, lon: samples[k].lon };
    }
  });
  const complete = known === heights.length && known > 0;
  return {
    status: complete ? 'ready' : loading ? 'loading' : 'unknown',
    highestFt: complete ? highest : NaN,
    highestAt: complete ? highestAt : null,
    meanFt: complete ? sum / known : NaN,
    highestKnownFt: known ? highest : NaN,
  };
}

/**
 * The tile loaders. timers: the module's scheduler scope; doc: the page's document; onChange() when a tile lands or is given up on.
 * Returns { want(points), heightAt(lat, lon) (ft, NaN unknown), loading(lat, lon), summarize(a, b), stats(), dispose() }.
 * want() asks for every tile under the route's samples (up to MAX_TILES in all); tiles already asked for are kept.
 */
export function createRouteTerrain({ timers, doc, onChange = () => {}, makeImage }) {
  const loaders = new Map(); // "x/y" -> createTerrainHeights
  let capped = false;
  const keyOf = (lat, lon) => {
    const t = lonLatToTile(lon, lat, TERRAIN_ZOOM);
    return `${t.x}/${t.y}`;
  };
  function ensure(lat, lon) {
    const key = keyOf(lat, lon);
    if (loaders.has(key)) return;
    if (loaders.size >= MAX_TILES) {
      capped = true;
      return;
    }
    loaders.set(key, createTerrainHeights({ points: [{ lat, lon }], timers, doc, onChange, ...(makeImage ? { makeImage } : {}) }));
  }
  const loaderAt = (lat, lon) => loaders.get(keyOf(lat, lon)) ?? null;
  return {
    want(points) {
      for (let i = 0; i + 1 < points.length; i++) for (const s of legSamples(points[i], points[i + 1])) ensure(s.lat, s.lon);
    },
    heightAt(lat, lon) {
      const l = loaderAt(lat, lon);
      return l ? l.refAt(lat, lon) : NaN;
    },
    loading(lat, lon) {
      return loaderAt(lat, lon)?.state() === 'loading';
    },
    summarize(a, b) {
      const samples = legSamples(a, b);
      let loading = false;
      const heights = samples.map((s) => {
        const l = loaderAt(s.lat, s.lon);
        if (l?.state() === 'loading') loading = true;
        return l ? l.refAt(s.lat, s.lon) : NaN;
      });
      return summarizeLeg(samples, heights, loading);
    },
    /** How many tiles: { tiles, loading, failed, capped }. */
    stats() {
      let loading = 0;
      let failed = 0;
      for (const l of loaders.values()) {
        const s = l.state();
        if (s === 'loading') loading += 1;
        else if (s === 'failed') failed += 1;
      }
      return { tiles: loaders.size, loading, failed, capped };
    },
    dispose() {
      for (const l of loaders.values()) l.dispose();
      loaders.clear();
    },
  };
}
