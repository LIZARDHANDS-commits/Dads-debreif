// "Profiles and notes" (specs/SPEC-traffic.md: The screen, Profiles and notes; task 7, bug #48): a
// collapsed section at the foot of the left column, so the first look stays simple (R22). It holds the
// profile's name, the list of profiles (the built-in setups first, read-only, then the ones saved in
// this browser), Save, Load, Delete, and the notes box.
//
// It fixes V6's Profiles (#48): Load fills in the name (so the next Save doesn't overwrite another
// profile), Save over a name that exists, Load and Delete ask first, a browser that won't keep the
// profiles says so in plain words, and the built-in setups are always in the list and can't be replaced
// or deleted. Everything shows as text (h), never as HTML.
//
// It builds the section and calls back: `capture(name, notes)` gives the profile to save (the screen
// knows the routes, aircraft and settings), and `load(profile, entry)` puts a profile on the screen.
import { h, clear } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { createProfileStore } from './profile-store.js';
import { BUILT_IN, NAME_MAX, NOTES_MAX, cleanName, isBuiltInName, nextProfileName } from './profile.js';

export const TITLE = 'Profiles and notes';
export const NOT_KEPT = "Profiles won't be saved in this browser: they are kept only until this page is closed.";

const KEPT_FOR_NOW = "this browser wouldn't keep it (its storage is blocked or full), so it is held only until this page is closed";

let nextId = 1;

/**
 * store: the profile store (profile-store.js).
 * capture(name, notes): the profile to save now, not yet checked. load(profile, entry): put it on the screen;
 * entry is { kind: 'built-in', id } or { kind: 'saved', name }.
 * current: { name, notes } shown to begin with.
 * Returns { element, setCurrent({ name, notes }), refresh() }.
 * @param {{ store: ReturnType<typeof createProfileStore>, capture: (name: string, notes: string) => any, load: (profile: any, entry: { kind: string, id?: string, name?: string }) => void, current?: { name?: string, notes?: string } }} options
 */
export function createProfilesPanel({ store, capture, load, current = {} }) {
  const uid = nextId++;
  const panel = createPanel({ title: TITLE, collapsed: true });

  const nameId = `traffic-profile-name-${uid}`;
  const listId = `traffic-profile-list-${uid}`;
  const notesId = `traffic-profile-notes-${uid}`;

  const nameInput = h('input', { type: 'text', id: nameId, autocomplete: 'off', maxlength: NAME_MAX, value: current.name ?? 'Setup 1' });
  const list = h('select', { id: listId, onchange: () => showSelection() });
  const notes = h('textarea', { id: notesId, rows: 4, maxlength: NOTES_MAX, value: current.notes ?? '' });
  const message = h('p', { class: 'profiles-message', role: 'status' });
  const kept = h('p', { class: 'profiles-note' }, NOT_KEPT);
  const skippedList = h('ul', { class: 'profiles-skipped' });
  // What this page can't read is kept as it is, and said so; Remove unreadable clears it, after asking.
  const unreadableText = h('span', { class: 'profiles-unreadable-text' });
  const unreadableBox = h('div', { class: 'profiles-unreadable', hidden: true }, unreadableText, h('button', { type: 'button', class: 'button', onclick: (e) => removeUnreadable(e.currentTarget) }, 'Remove unreadable'));
  let unreadableCount = 0;

  const say = (text) => {
    if (message.textContent !== text) message.textContent = text;
  };

  // ---- the list ---------------------------------------------------------------------
  const keyOf = (entry) => (entry.kind === 'built-in' ? `built-in:${entry.id}` : `saved:${entry.name}`);
  const entryOf = (key) => {
    const at = key.indexOf(':');
    const kind = key.slice(0, at), rest = key.slice(at + 1);
    return kind === 'built-in' ? { kind, id: rest } : { kind: 'saved', name: rest };
  };
  let saved = [];

  function fillList(select) {
    const { profiles, skipped, unreadable, foreign } = store.list();
    saved = profiles;
    clear(list);
    list.appendChild(h('optgroup', { label: 'Built-in (read-only)' }, BUILT_IN.map((b) => h('option', { value: keyOf({ kind: 'built-in', id: b.id }) }, b.name))));
    if (saved.length) {
      list.appendChild(h('optgroup', { label: 'Saved in this browser' }, saved.map((p) => h('option', { value: keyOf({ kind: 'saved', name: p.name }) }, `${p.name} (${p.airfield})`))));
    }
    const wanted = select ? keyOf(select) : list.value;
    const known = [...BUILT_IN.map((b) => keyOf({ kind: 'built-in', id: b.id })), ...saved.map((p) => keyOf({ kind: 'saved', name: p.name }))];
    list.value = known.includes(wanted) ? wanted : known[0];
    clear(skippedList);
    for (const sentence of skipped) skippedList.appendChild(h('li', {}, sentence));
    skippedList.hidden = skipped.length === 0;
    unreadableCount = unreadable;
    unreadableBox.hidden = unreadable === 0 && !foreign;
    unreadableText.textContent = foreign
      ? "The profiles saved in this browser are damaged or from a different version of this page and can't be read. They are kept as they are until you remove them."
      : `${unreadable} saved profile${unreadable === 1 ? '' : 's'} can't be read. ${unreadable === 1 ? 'It is' : 'They are'} kept as ${unreadable === 1 ? 'it is' : 'they are'} until you remove ${unreadable === 1 ? 'it' : 'them'}.`;
    kept.hidden = store.persistent;
    showSelection();
  }

  const selected = () => entryOf(list.value || `built-in:${BUILT_IN[0].id}`);
  const profileFor = (entry) => (entry.kind === 'built-in' ? BUILT_IN.find((b) => b.id === entry.id)?.profile : saved.find((p) => p.name === entry.name));
  const labelFor = (entry) => (entry.kind === 'built-in' ? BUILT_IN.find((b) => b.id === entry.id)?.name ?? '' : entry.name);

  // Delete is only for saved profiles: a built-in one is read-only.
  function showSelection() {
    const builtIn = selected().kind === 'built-in';
    deleteButton.disabled = builtIn;
    if (builtIn) deleteButton.setAttribute('title', 'Built-in setups are read-only.');
    else deleteButton.removeAttribute('title');
  }

  // ---- asking first -------------------------------------------------------------------
  let askedBy = null;
  const confirmText = h('span', { class: 'profiles-confirm-text' });
  let confirmed = null;
  const yes = h('button', { type: 'button', class: 'button primary', onclick: () => { const run = confirmed; close(true); run?.(); } }, 'OK');
  const no = h('button', { type: 'button', class: 'button', onclick: () => close(true) }, 'Cancel');
  const confirmBox = h('div', { class: 'profiles-confirm', role: 'alert', hidden: true }, confirmText, h('span', { class: 'profiles-confirm-buttons' }, yes, no));
  confirmBox.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault?.();
      close(true);
    }
  });

  function close(giveFocusBack) {
    confirmed = null;
    confirmBox.hidden = true;
    if (giveFocusBack) askedBy?.focus?.();
    askedBy = null;
  }

  /** Shows the question with the act's own word on its button, and does `run` only if it is pressed. */
  function ask(text, word, button, run) {
    askedBy = button;
    confirmed = run;
    confirmText.textContent = text;
    yes.textContent = word;
    confirmBox.hidden = false;
    no.focus(); // the safe answer is the one under the cursor
  }

  // ---- Save, Load, Delete -------------------------------------------------------------
  function doSave(name) {
    const result = store.save(capture(name, notes.value));
    if (!result.ok) return say(result.problem);
    store.setLast({ kind: 'saved', name: result.profile.name });
    nameInput.value = result.profile.name;
    fillList({ kind: 'saved', name: result.profile.name });
    say(result.persisted ? `Saved "${result.profile.name}".` : `Saved "${result.profile.name}", but ${KEPT_FOR_NOW}.`);
  }

  function save() {
    const name = cleanName(nameInput.value);
    if (!name) return say('Type a name for the profile first.');
    if (isBuiltInName(name)) return say(`"${name}" is a built-in setup and can't be replaced. Type another name.`);
    if (store.list().profiles.some((p) => p.name === name)) {
      return ask(`Replace the saved profile "${name}" with what is on the screen now?`, 'Replace', saveButton, () => doSave(name));
    }
    doSave(name);
  }

  function loadSelected() {
    const entry = selected();
    const profile = profileFor(entry);
    if (!profile) return say('That profile is not in the list any more.');
    const label = labelFor(entry);
    ask(`Load "${label}"? The routes and aircraft on the screen now are replaced.`, 'Load', loadButton, () => {
      load(profile, entry);
      store.setLast(entry);
      // The name box shows the profile just loaded, so the next Save can't overwrite another one (#48).
      // A built-in setup is read-only, so its box offers the next free name to save your own version under.
      nameInput.value = entry.kind === 'built-in' ? nextProfileName(saved.map((p) => p.name)) : profile.name;
      notes.value = profile.notes;
      say(entry.kind === 'built-in' ? `Loaded "${label}". Type a name and press Save to keep your own version.` : `Loaded "${label}".`);
    });
  }

  function removeUnreadable(button) {
    const many = unreadableCount !== 1;
    const what = unreadableCount ? `the ${unreadableCount} saved profile${many ? 's' : ''} that can't be read` : "the saved profiles that can't be read";
    ask(`Remove ${what}? This can't be undone.`, 'Remove', button, () => {
      const result = store.discardUnreadable();
      fillList();
      if (unreadableBox.hidden) list.focus(); // the button that asked has just gone
      say(result.removed ? `Removed ${result.removed} unreadable profile${result.removed === 1 ? '' : 's'}.` : 'Removed the profiles that could not be read.');
    });
  }

  function deleteSelected() {
    const entry = selected();
    if (entry.kind === 'built-in') return say("Built-in setups are read-only and can't be deleted.");
    ask(`Delete the saved profile "${entry.name}"? This can't be undone.`, 'Delete', deleteButton, () => {
      const result = store.remove(entry.name);
      fillList();
      if (deleteButton.disabled) list.focus(); // Delete has just been disabled under the focus: keep it in the section (PR-01)
      if (!result.ok) return say(result.problem);
      say(result.persisted ? `Deleted "${entry.name}".` : `Deleted "${entry.name}" for this visit, but ${KEPT_FOR_NOW}.`);
    });
  }

  const saveButton = h('button', { type: 'button', class: 'button primary', onclick: save }, 'Save');
  const loadButton = h('button', { type: 'button', class: 'button', onclick: loadSelected }, 'Load');
  const deleteButton = h('button', { type: 'button', class: 'button', onclick: deleteSelected }, 'Delete');

  panel.body.append(
    h('div', { class: 'profiles' },
      h('div', { class: 'profiles-field' }, h('label', { for: nameId }, 'Profile name'), nameInput),
      h('div', { class: 'profiles-field' }, h('label', { for: listId }, 'Profiles'), list),
      h('div', { class: 'profiles-buttons' }, saveButton, loadButton, deleteButton),
      confirmBox,
      message,
      kept,
      unreadableBox,
      skippedList,
      h('div', { class: 'profiles-field' }, h('label', { for: notesId }, 'Notes'), notes),
    ),
  );

  fillList(store.lastUsed() ?? undefined);

  return {
    element: panel.element,
    /** The screen loaded or started a setup: show its name and notes. */
    setCurrent({ name, notes: text }) {
      if (name !== undefined) nameInput.value = name;
      if (text !== undefined) notes.value = text;
    },
    /** The notes as typed, for the next Save. */
    getNotes: () => notes.value,
    /** The name box, so the screen can suggest the next free name. */
    savedNames: () => saved.map((p) => p.name),
    refresh: () => fillList(),
  };
}
