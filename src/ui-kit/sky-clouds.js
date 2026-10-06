// A light blue sky and a layer of soft clouds for the 3D views (Patrick, 6 Oct: "make the sky like light blue ... maybe some
// basic clouds", best for quality and performance). Shared by the simulators that use it; each passes its own three.js.
//
// The sky is a vertical gradient painted once into a tiny texture behind everything: no cost per frame. The clouds are a
// few dozen flat sprites (always facing the camera) sharing one soft texture, laid out in square tiles that follow the
// camera's centre so the layer looks endless; moving them is the only work per frame. No volumetric clouds.

/** The sky, deeper blue overhead to a pale haze at the horizon, so lines and tags still read where the aircraft fly. */
export const SKY_COLOURS = Object.freeze({ top: '#2f6aa8', middle: '#6f9fd2', horizon: '#c9dcec' });
/** The cloud layer: how far above the centre it sits (Patrick, 6 Oct: clouds above, ground below), the size of a tile and
 * how many clouds each holds (estimates). */
export const CLOUD_LAYER = Object.freeze({ aboveFt: 2500, tileFt: 40_000, perTile: 7, sizeFt: [3000, 7000] });

/** A small repeatable random number generator, so the clouds sit in the same places every time. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function gradientTexture(THREE, doc) {
  const canvas = doc.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, SKY_COLOURS.top);
  grad.addColorStop(0.55, SKY_COLOURS.middle);
  grad.addColorStop(1, SKY_COLOURS.horizon);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** One soft cloud: a few overlapping white puffs with feathered edges. */
function cloudTexture(THREE, doc) {
  const canvas = doc.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const puff = (x, y, r, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.6, `rgba(255,255,255,${a * 0.6})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  puff(128, 70, 58, 0.9);
  puff(82, 78, 44, 0.8);
  puff(176, 78, 46, 0.8);
  puff(110, 52, 40, 0.7);
  puff(152, 54, 38, 0.7);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Adds the sky (as the scene's background) and the cloud layer. Returns { update(centre, show), setVisible(on), dispose() }:
 * update({ x, y, z }, show) moves the layer with the camera's centre (z is the height it is measured from, in the scene's
 * units) and fades it by `show` (0 to 1; a view looking straight down passes 0 so the clouds don't cover the aircraft),
 * setVisible hides the clouds, dispose removes both and frees them.
 */
export function addSkyAndClouds(THREE, scene, { doc = globalThis.document, seed = 7 } = {}) {
  const sky = gradientTexture(THREE, doc);
  const before = scene.background;
  scene.background = sky;
  const puff = cloudTexture(THREE, doc);
  const material = new THREE.SpriteMaterial({ map: puff, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
  const rand = seeded(seed);
  const layout = []; // { dx, dy, w } inside one tile
  for (let i = 0; i < CLOUD_LAYER.perTile; i++) {
    const w = CLOUD_LAYER.sizeFt[0] + rand() * (CLOUD_LAYER.sizeFt[1] - CLOUD_LAYER.sizeFt[0]);
    layout.push({ dx: rand() * CLOUD_LAYER.tileFt, dy: rand() * CLOUD_LAYER.tileFt, w });
  }
  const group = new THREE.Group();
  const sprites = [];
  for (let t = 0; t < 9; t++) {
    for (const c of layout) {
      const s = new THREE.Sprite(material);
      s.scale.set(c.w, c.w / 2, 1);
      s.frustumCulled = false;
      group.add(s);
      sprites.push({ s, c, t });
    }
  }
  scene.add(group);
  return {
    update(centre, show = 1) {
      material.opacity = 0.85 * Math.max(0, Math.min(1, show));
      group.visible = material.opacity > 0.02;
      const T = CLOUD_LAYER.tileFt;
      const ox = Math.floor(centre.x / T) * T;
      const oy = Math.floor(centre.y / T) * T;
      for (const { s, c, t } of sprites) {
        const tx = (t % 3) - 1;
        const ty = Math.floor(t / 3) - 1;
        s.position.set(ox + tx * T + c.dx, oy + ty * T + c.dy, centre.z + CLOUD_LAYER.aboveFt);
      }
    },
    setVisible(on) {
      group.visible = Boolean(on);
    },
    dispose() {
      scene.remove(group);
      material.dispose();
      puff.dispose();
      sky.dispose();
      if (scene.background === sky) scene.background = before ?? null;
    },
  };
}
