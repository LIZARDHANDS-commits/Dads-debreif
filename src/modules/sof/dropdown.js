// Drop-downs for the one-screen SOF (SOF-38): a panel that opens over the screen from a button and never pushes
// the page down. One shared place for the rules every one of them follows, so they behave alike:
// only one is open at a time, Escape closes it and puts focus back on its button, and a press outside it
// closes it. Each drop-down says how its panel is shown (`onToggle`), so a panel can be hidden, or shown by
// a class (the world clocks, which sit in the bar when the window is wide). The words on a button end in its
// marker; each button's own two labels are given to create().
//
// A drop-down whose scope sits inside another's (the waves' boxes inside the timeline's Expand panel) is its child: opening it leaves its parent
// open, and closing the parent closes it too.

/**
 * `listen`: the module's app.listen (so the document listeners go when the module closes).
 * Returns { create(options), note(details) }. create({ scope, button, labels, onToggle, focusTarget }) gives { open, close, toggle, isOpen }:
 * - `scope`: the element holding the button and the panel; a press outside it closes the drop-down.
 * - `button` (optional) and `labels` ([closed words, open words]): the button's aria-expanded and words follow the state.
 * - `onToggle(open)`: show or hide the panel.
 * - `focusTarget()`: where focus goes when Escape closes it (default the button).
 */
export function createDropdowns({ listen }) {
  const all = new Set();
  const notes = new Set(); // <details> notes that open over the screen (the keys, Sources)

  listen(document, 'pointerdown', (event) => {
    for (const d of [...all]) if (d.isOpen && !d.scope.contains(/** @type {Node} */ (event.target))) d.close();
    for (const n of notes) if (n.open && !n.contains(/** @type {Node} */ (event.target))) n.open = false;
  });

  function create({ scope, button = null, labels = null, onToggle, focusTarget = null }) {
    let isOpen = false;
    let words = labels;
    const paint = () => {
      if (!button) return;
      button.setAttribute('aria-expanded', String(isOpen));
      if (words && button.textContent !== words[isOpen ? 1 : 0]) button.textContent = words[isOpen ? 1 : 0];
    };
    const show = (open) => {
      isOpen = open;
      paint();
      onToggle(open);
    };
    const drop = {
      scope,
      get isOpen() {
        return isOpen;
      },
      open() {
        if (isOpen) return;
        for (const other of all) if (other !== drop && other.isOpen && !other.scope.contains(drop.scope)) other.close(); // a parent stays open
        show(true);
      },
      /** `focus`: put focus back where the person opened it (Escape, or pressing the button again). */
      close({ focus = false } = {}) {
        if (!isOpen) return;
        show(false);
        for (const other of all) if (other !== drop && other.isOpen && drop.scope.contains(other.scope)) other.close(); // its children go with it
        if (focus) (focusTarget?.() ?? button)?.focus({ preventScroll: true });
      },
      /** The button's two labels, when they change with what the panel holds. */
      setLabels(next) {
        words = next;
        paint();
      },
      toggle() {
        if (isOpen) drop.close({ focus: true });
        else drop.open();
      },
    };
    scope.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !isOpen) return;
      event.preventDefault();
      event.stopPropagation(); // the map's own Escape (its Layers menu) is not this
      drop.close({ focus: true });
    });
    paint(); // closed to begin with; the caller's panel starts hidden
    all.add(drop);
    return drop;
  }

  /** A <details> that opens over the screen (CSS draws its body): a press outside, or Escape, closes it. */
  function note(details) {
    if (!details) return;
    notes.add(details);
    // One at a time: opening a note closes the others.
    details.addEventListener('toggle', () => {
      if (details.open) for (const other of notes) if (other !== details) other.open = false;
    });
    details.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !details.open) return;
      event.preventDefault();
      event.stopPropagation();
      details.open = false;
      details.querySelector('summary')?.focus({ preventScroll: true });
    });
  }

  return { create, note };
}
