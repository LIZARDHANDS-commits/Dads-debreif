// Pan and zoom for the 2D views, drawn only when something changes (#43).
// World units are the module's (the debrief uses feet): x east, y north.
// Screen units are CSS pixels, y down. See specs/SPEC-ui-kit.md.

// view: { cx, cy, scale } — the world point at the centre and CSS px per world unit.
// size: { width, height } in CSS px. limits: { minSpan, maxSpan } visible width in world units.

export function toScreen(view, size, x, y) {
  return [size.width / 2 + (x - view.cx) * view.scale, size.height / 2 - (y - view.cy) * view.scale];
}

export function toWorld(view, size, sx, sy) {
  return [view.cx + (sx - size.width / 2) / view.scale, view.cy - (sy - size.height / 2) / view.scale];
}

// The scale, kept so the visible width stays within the limits.
export function clampScale(scale, width, { minSpan = 0, maxSpan = Infinity } = {}) {
  if (!(width > 0) || !(scale > 0)) return scale;
  const span = Math.min(Math.max(width / scale, minSpan), maxSpan);
  return width / span;
}

// Zooms by `factor` (> 1 zooms in) keeping the world point under (sx, sy) still.
export function zoomAbout(view, size, factor, sx, sy, limits) {
  const scale = clampScale(view.scale * factor, size.width, limits);
  const [wx, wy] = toWorld(view, size, sx, sy);
  return { cx: wx - (sx - size.width / 2) / scale, cy: wy + (sy - size.height / 2) / scale, scale };
}

// The view that shows the whole box with `padding` CSS px to spare on each side.
export function fitBounds({ minX, minY, maxX, maxY }, size, padding, limits) {
  const w = Math.max(size.width - 2 * padding, 1);
  const h = Math.max(size.height - 2 * padding, 1);
  const bw = maxX - minX;
  const bh = maxY - minY;
  const candidates = [bw > 0 ? w / bw : Infinity, bh > 0 ? h / bh : Infinity];
  let scale = Math.min(...candidates);
  if (!Number.isFinite(scale)) scale = size.width / (limits?.minSpan || 1); // a single point
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, scale: clampScale(scale, size.width, limits) };
}

const KEY_PAN = 0.1; // of the view's size per arrow press
const KEY_ZOOM = 1.25;
const WHEEL_ZOOM = 0.0015; // per wheel pixel

// canvas: a <canvas> sized by CSS. timers: a scheduler scope (frame).
// draw(ctx, view): paints everything; ctx is in CSS px, scaled for the screen.
export function createCanvasView(canvas, { timers, draw, minSpan = 0, maxSpan = Infinity, label, onUserMove = () => {}, win = globalThis }) {
  const limits = { minSpan, maxSpan };
  const size = { width: 0, height: 0 };
  let view = { cx: 0, cy: 0, scale: 1 };
  let pendingFrame = null;
  let drag = null;
  let disposed = false;

  canvas.classList.add('canvas-view');
  canvas.tabIndex = 0;
  if (label) {
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label);
  }

  const ctx = canvas.getContext('2d');

  function measure() {
    const ratio = win.devicePixelRatio || 1;
    size.width = canvas.clientWidth;
    size.height = canvas.clientHeight;
    const width = Math.max(1, Math.round(size.width * ratio));
    const height = Math.max(1, Math.round(size.height * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }

  function paint() {
    const ratio = canvas.width / Math.max(size.width, 1);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    draw(ctx, api);
  }

  function requestDraw() {
    if (disposed || pendingFrame) return;
    pendingFrame = timers.frame(() => {
      pendingFrame();
      pendingFrame = null;
      paint();
    });
  }

  function setView(next, byUser) {
    view = { ...next, scale: clampScale(next.scale, size.width, limits) };
    requestDraw();
    if (byUser) onUserMove();
  }

  const panPixels = (dx, dy, byUser) =>
    setView({ cx: view.cx - dx / view.scale, cy: view.cy + dy / view.scale, scale: view.scale }, byUser);

  const zoomAt = (factor, sx, sy, byUser) => setView(zoomAbout(view, size, factor, sx, sy, limits), byUser);

  const local = (event) => {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };

  const listeners = [
    ['pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture?.(e.pointerId);
      canvas.classList.add('is-dragging');
    }],
    ['pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (dx || dy) panPixels(dx, dy, true);
    }],
    ['pointerup', (e) => endDrag(e)],
    ['pointercancel', (e) => endDrag(e)],
    ['wheel', (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? size.height : 1;
      const [sx, sy] = local(e);
      zoomAt(Math.exp(-e.deltaY * unit * WHEEL_ZOOM), sx, sy, true);
    }],
    ['keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const step = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (step) panPixels(step[0] * size.width * KEY_PAN, step[1] * size.height * KEY_PAN, true);
      else if (e.key === '+' || e.key === '=') zoomAt(KEY_ZOOM, size.width / 2, size.height / 2, true);
      else if (e.key === '-' || e.key === '_') zoomAt(1 / KEY_ZOOM, size.width / 2, size.height / 2, true);
      else return;
      e.preventDefault();
    }],
  ];

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    canvas.classList.remove('is-dragging');
  }

  for (const [type, fn] of listeners) canvas.addEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined);

  const resizer = win.ResizeObserver
    ? new win.ResizeObserver(() => {
        measure();
        requestDraw();
      })
    : null;
  resizer?.observe(canvas);
  measure();

  const api = {
    canvas,
    get size() {
      return { ...size };
    },
    get view() {
      return { ...view };
    },
    worldToScreen: (x, y) => toScreen(view, size, x, y),
    screenToWorld: (sx, sy) => toWorld(view, size, sx, sy),
    setView: (next) => setView({ ...view, ...next }, false),
    setCenter: (x, y) => setView({ ...view, cx: x, cy: y }, false),
    zoomBy: (factor) => zoomAt(factor, size.width / 2, size.height / 2, false),
    fit(bounds, padding = 24) {
      measure();
      setView(fitBounds(bounds, size, padding, limits), false);
    },
    requestDraw,
    dispose() {
      disposed = true;
      pendingFrame?.();
      pendingFrame = null;
      resizer?.disconnect();
      for (const [type, fn] of listeners) canvas.removeEventListener(type, fn);
      canvas.classList.remove('is-dragging');
    },
  };
  requestDraw();
  return api;
}
