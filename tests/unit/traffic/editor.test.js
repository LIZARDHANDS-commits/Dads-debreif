// The route editor (src/modules/traffic/editor.js): new routes, names, links, adding and
// deleting points, and the boxes on the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakeDom } from './fake-dom-extras.js';
import {
  LABEL_MAX, MIN_POINTS, MOST_POINTS, MOST_ROUTES, NAME_MAX, NEW_POINT_LABEL, addPointProblem, checkName, createIdMaker, createRouteEditor, deletePoint, insertPoint, joinEnds, linkFields, makeRoute, newRouteName, setLink,
} from '../../../src/modules/traffic/editor.js';
import { createSim } from '../../../src/modules/traffic/sim.js';

installFakeDom();

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const fresh = () => structuredClone(MOOSE_JAW);
const byId = (routes, id) => routes.find((r) => r.id === id);

// ---- ids, names and new routes ------------------------------------------------------

test('ids carry on from the highest one in the setup and are never used twice', () => {
  const routes = fresh().routes;
  const next = createIdMaker(routes);
  assert.equal(next('pattern', routes), 'PAT2');
  assert.equal(next('entry', routes), 'ENT5');
  assert.equal(next('split', routes), 'SPL5');
  assert.equal(next('split', routes), 'SPL6'); // the same number is not handed out again, even though nothing was added
});

test('an id that a route already has is skipped', () => {
  const next = createIdMaker([]);
  assert.equal(next('entry', [{ id: 'ENT1' }, { id: 'ENT2' }]), 'ENT3');
});

test('a new route is named for its kind and the next number nobody has', () => {
  const routes = fresh().routes;
  assert.equal(newRouteName('pattern', routes), 'Pattern 2');
  assert.equal(newRouteName('entry', routes), 'Entry 5');
  assert.equal(newRouteName('split', routes), 'Split 5');
  assert.equal(newRouteName('entry', [{ name: 'Entry 1', kind: 'entry' }, { name: 'Entry 2', kind: 'pattern' }]), 'Entry 3');
});

test('a new pattern is V6\'s pattern in the next colour', () => {
  const routes = fresh().routes;
  const made = makeRoute('pattern', { routes, selectedId: null, nextId: createIdMaker(routes) });
  assert.equal(made.route.id, 'PAT2');
  assert.equal(made.route.name, 'Pattern 2');
  assert.equal(made.route.kind, 'pattern');
  assert.equal(made.route.points.length, 6);
  assert.equal(made.route.color, '#d8dee9'); // nine routes so far: the tenth colour of the palette
});

test('a new entry joins the selected pattern, or the first pattern when a different kind of route is selected', () => {
  const routes = fresh().routes;
  routes.push({ ...structuredClone(routes[0]), id: 'PAT2', name: 'Pattern 2' });
  const nextId = createIdMaker(routes);
  assert.equal(makeRoute('entry', { routes, selectedId: 'PAT2', nextId }).route.attachTo, 'PAT2');
  assert.equal(makeRoute('entry', { routes, selectedId: 'ENT1', nextId }).route.attachTo, 'PAT1');
  assert.equal(makeRoute('entry', { routes, selectedId: null, nextId }).route.attachTo, 'PAT1');
  const split = makeRoute('split', { routes, selectedId: 'PAT2', nextId }).route;
  assert.equal(split.attachTo, 'PAT2');
  assert.equal(split.sourceRoute, 'PAT2');
});

test('a new entry or split with no pattern to join says so in words', () => {
  const made = makeRoute('entry', { routes: [], selectedId: null, nextId: createIdMaker([]) });
  assert.match(made.problem, /pattern/);
  assert.equal(made.route, undefined);
  assert.match(makeRoute('pfl', { routes: [], nextId: createIdMaker([]) }).problem, /cannot be made yet/);
});

test('names are trimmed, and an empty or used name is refused', () => {
  const routes = fresh().routes;
  assert.deepEqual(checkName(routes, routes[0], '  Home  '), { name: 'Home' });
  assert.match(checkName(routes, routes[0], '   ').problem, /needs a name/);
  assert.match(checkName(routes, routes[0], 'entry 1').problem, /already called entry 1/);
  assert.deepEqual(checkName(routes, routes[0], 'pattern 1'), { name: 'pattern 1' }); // a route's own name is fine
});

test('a name longer than the limit is refused in words', () => {
  const routes = fresh().routes;
  assert.match(checkName(routes, routes[0], 'x'.repeat(NAME_MAX + 1)).problem, /at most 40 characters/);
  assert.equal(checkName(routes, routes[0], 'x'.repeat(NAME_MAX)).name.length, NAME_MAX);
});

test('there is a most to the routes, and a new route past it is refused in words', () => {
  const routes = Array.from({ length: MOST_ROUTES }, (_, i) => ({ id: `PAT${i + 1}`, name: `Pattern ${i + 1}`, kind: 'pattern', points: [] }));
  const made = makeRoute('pattern', { routes, nextId: createIdMaker(routes) });
  assert.match(made.problem, /already 30 routes/);
});

test('there is a most to the points on a route', () => {
  const route = newPatternOf(MOST_POINTS);
  assert.match(addPointProblem(route), /already has 100 points/);
  assert.equal(addPointProblem(newPatternOf(MOST_POINTS - 1)), '');
});

// ---- + Point ------------------------------------------------------------------------------

test('+ Point puts a point halfway to the next one, with the average height, speed and G', () => {
  const routes = fresh().routes;
  const pattern = byId(routes, 'PAT1');
  const [a, b] = [pattern.points[2], pattern.points[3]];
  const at = insertPoint(routes, pattern, 2);
  assert.equal(at, 3);
  assert.equal(pattern.points.length, 14);
  assert.deepEqual(pattern.points[3], {
    label: NEW_POINT_LABEL, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, alt: (a.alt + b.alt) / 2, kt: (a.kt + b.kt) / 2, g: (a.g + b.g) / 2,
  });
  assert.equal(pattern.points[4], b);
});

test('+ Point after the last point of a pattern goes between the last and the first', () => {
  const routes = fresh().routes;
  const pattern = byId(routes, 'PAT1');
  const [last, first] = [pattern.points[12], pattern.points[0]];
  assert.equal(insertPoint(routes, pattern, 12), 13);
  assert.equal(pattern.points[13].x, (last.x + first.x) / 2);
});

test('+ Point after the last point of an entry goes just before it, so it still ends where it joins', () => {
  const routes = fresh().routes;
  const entry = byId(routes, 'ENT1');
  const [beforeLast, last] = entry.points.slice(-2);
  const at = insertPoint(routes, entry, entry.points.length - 1);
  assert.equal(at, 3);
  assert.equal(entry.points.at(-1), last);
  assert.equal(entry.points[at].x, (beforeLast.x + last.x) / 2);
});

test('+ Point moves the links of routes that join later points up by one, and leaves earlier ones', () => {
  const routes = fresh().routes;
  const pattern = byId(routes, 'PAT1');
  insertPoint(routes, pattern, 5); // new point is number 6 (index 6)
  assert.equal(byId(routes, 'ENT1').mergeIndex, 8); // was 7
  assert.equal(byId(routes, 'ENT2').mergeIndex, 0); // before the new point: unchanged
  assert.equal(byId(routes, 'SPL1').sourceIndex, 5); // leaves at index 5: unchanged
  assert.equal(byId(routes, 'SPL2').sourceIndex, 12); // was 11
  assert.equal(byId(routes, 'SPL2').mergeIndex, 8); // was 7
  assert.equal(byId(routes, 'SPL3').mergeIndex, 11); // was 10
  assert.equal(byId(routes, 'SPL3').sourceIndex, 1);
});

// ---- Delete point -------------------------------------------------------------------------

test('Delete point takes the point out and moves later links down by one', () => {
  const routes = fresh().routes;
  const pattern = byId(routes, 'PAT1');
  assert.deepEqual(deletePoint(routes, pattern, 3), { ok: true });
  assert.equal(pattern.points.length, 12);
  assert.equal(byId(routes, 'ENT1').mergeIndex, 6);
  assert.equal(byId(routes, 'SPL1').sourceIndex, 4);
  assert.equal(byId(routes, 'SPL2').sourceIndex, 10);
  assert.equal(byId(routes, 'ENT2').mergeIndex, 0);
});

test('a route joined to the deleted point is moved to the point before it, and its end moves there', () => {
  const routes = fresh().routes;
  const pattern = byId(routes, 'PAT1');
  const before = pattern.points[6];
  deletePoint(routes, pattern, 7); // ENT1 joined index 7
  const entry = byId(routes, 'ENT1');
  assert.equal(entry.mergeIndex, 6);
  assert.equal(entry.points.at(-1).x, before.x);
  assert.equal(entry.points.at(-1).y, before.y);
  const split = byId(routes, 'SPL2'); // rejoined at 7 too, and leaves at 11 (now 10)
  assert.equal(split.mergeIndex, 6);
  assert.equal(split.sourceIndex, 10);
});

test('deleting the first point of a pattern keeps the links to point 1 on the new first point', () => {
  const routes = fresh().routes;
  const pattern = byId(routes, 'PAT1');
  const second = pattern.points[1];
  deletePoint(routes, pattern, 0);
  assert.equal(byId(routes, 'ENT2').mergeIndex, 0);
  assert.equal(byId(routes, 'ENT2').points.at(-1).x, second.x);
  assert.equal(byId(routes, 'SPL3').sourceIndex, 0); // left index 1, which is now 0
});

test('a route is never left with fewer points than its kind needs', () => {
  const routes = [newPatternOf(3), { id: 'E', name: 'E', kind: 'entry', attachTo: 'P', mergeIndex: 0, points: [pt(0, 0), pt(1, 1)] }];
  assert.match(deletePoint(routes, routes[0], 0).problem, /at least 3 points/);
  assert.match(deletePoint(routes, routes[1], 0).problem, /at least 2 points/);
  assert.equal(routes[0].points.length, 3);
  assert.equal(routes[1].points.length, 2);
  assert.equal(MIN_POINTS.pattern, 3);
});

test('deleting with no point picked says so, and changes nothing', () => {
  const routes = fresh().routes;
  assert.match(deletePoint(routes, routes[0], null).problem, /Pick the point/);
  assert.equal(routes[0].points.length, 13);
});

test('a link to the last point that is deleted lands on the new last point', () => {
  const routes = [
    { id: 'P', name: 'P', kind: 'pattern', points: [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)] },
    { id: 'E', name: 'E', kind: 'entry', attachTo: 'P', mergeIndex: 3, points: [pt(-5, 20), pt(0, 10)] },
  ];
  deletePoint(routes, routes[0], 3);
  assert.equal(routes[1].mergeIndex, 2);
  assert.deepEqual([routes[1].points[1].x, routes[1].points[1].y], [10, 10]);
});

test('the engine still flies after points are added and deleted', () => {
  const setup = fresh();
  const sim = createSim(setup, { seed: 3 });
  insertPoint(setup.routes, byId(setup.routes, 'PAT1'), 4);
  deletePoint(setup.routes, byId(setup.routes, 'PAT1'), 9);
  sim.stepTo(120);
  assert.equal(sim.state().aircraft.length, 7);
  assert.ok(sim.state().aircraft.every((a) => Number.isFinite(a.x) && Number.isFinite(a.y)));
});

// ---- links --------------------------------------------------------------------------------

test('links: an entry has one, a split has two, a pattern none', () => {
  const routes = fresh().routes;
  assert.deepEqual(linkFields(byId(routes, 'PAT1')), []);
  assert.deepEqual(linkFields(byId(routes, 'ENT1')).map((f) => f.text), ['Joins']);
  assert.deepEqual(linkFields(byId(routes, 'SPL1')).map((f) => f.text), ['Leaves', 'Rejoins']);
});

test('linking an entry to another point puts its end there', () => {
  const routes = fresh().routes;
  const entry = byId(routes, 'ENT1');
  setLink(routes, entry, { mergeIndex: 4 });
  assert.equal(entry.mergeIndex, 4);
  const target = byId(routes, 'PAT1').points[4];
  assert.deepEqual([entry.points.at(-1).x, entry.points.at(-1).y], [target.x, target.y]);
});

test('linking a split puts its start on the point it leaves and its end on the point it rejoins', () => {
  const routes = fresh().routes;
  const split = byId(routes, 'SPL1');
  setLink(routes, split, { sourceIndex: 2, mergeIndex: 9 });
  const pattern = byId(routes, 'PAT1');
  assert.deepEqual([split.points[0].x, split.points[0].y], [pattern.points[2].x, pattern.points[2].y]);
  assert.deepEqual([split.points.at(-1).x, split.points.at(-1).y], [pattern.points[9].x, pattern.points[9].y]);
});

test('a link to a point past the end of the route it joins is held to its last point', () => {
  const routes = fresh().routes;
  setLink(routes, byId(routes, 'ENT1'), { mergeIndex: 99 });
  assert.equal(byId(routes, 'ENT1').mergeIndex, 12);
});

test('joinEnds leaves a route with no target where it is', () => {
  const route = { id: 'E', name: 'E', kind: 'entry', attachTo: '', mergeIndex: 0, points: [pt(1, 1), pt(2, 2)] };
  joinEnds([route], route);
  assert.deepEqual([route.points[1].x, route.points[1].y], [2, 2]);
});

// ---- the boxes on the page ----------------------------------------------------------------

const all = (root, match) => [root, ...root.childNodes.flatMap((child) => (child.childNodes ? all(child, match) : []))].filter(match);
const tagged = (root, tag) => all(root, (n) => n.tagName === tag);
const withClass = (root, name) => all(root, (n) => n.getAttribute?.('class')?.split(' ').includes(name));
const words = (node) => node.textContent.replace(/\s+/g, ' ').trim();
const buttonNamed = (root, name) => tagged(root, 'BUTTON').find((b) => words(b) === name);
const type = (input, text) => {
  input.value = text;
  input.dispatch('input');
  input.dispatch('change');
};
const rowsOf = (editor) => withClass(editor.element, 'point-row');
const boxFor = (row, label) => {
  const l = tagged(row, 'LABEL').find((n) => words(n) === label);
  assert.ok(l, `a "${label}" label`);
  return all(row, (n) => n.getAttribute?.('id') === l.getAttribute('for'))[0];
};

function screen() {
  const setup = fresh();
  const changes = [];
  const editor = createRouteEditor({ setup, onChange: (what) => changes.push(what) });
  return { setup, editor, changes };
}

test('nothing shows until a route is shown', () => {
  const { editor } = screen();
  assert.equal(rowsOf(editor).length, 0);
  editor.show('PAT1');
  assert.equal(rowsOf(editor).length, 13);
  editor.show(null);
  assert.equal(rowsOf(editor).length, 0);
});

test('every point has a row with its number, label and boxes filled in with its values', () => {
  const { editor, setup } = screen();
  editor.show('PAT1');
  const first = rowsOf(editor)[0];
  const p = setup.routes[0].points[0];
  assert.equal(words(withClass(first, 'point-number')[0]), '1');
  assert.equal(tagged(first, 'INPUT').find((i) => i.getAttribute('aria-label') === 'Point 1 label').value, p.label);
  assert.equal(boxFor(first, 'Alt ft').value, String(p.alt));
  assert.equal(boxFor(first, 'KT').value, String(p.kt));
  assert.equal(boxFor(first, 'G').value, String(p.g));
  assert.match(words(withClass(first, 'point-data')[0]), new RegExp(`${Math.round(p.alt)}ft/${Math.round(p.kt)}kt`));
});

test('typing a good height changes the point and says the picture changed', () => {
  const { editor, setup, changes } = screen();
  editor.show('PAT1');
  const row = rowsOf(editor)[2];
  type(boxFor(row, 'Alt ft'), '3100');
  assert.equal(setup.routes[0].points[2].alt, 3100);
  assert.match(words(withClass(row, 'point-data')[0]), /^3100ft/);
  assert.deepEqual(changes.at(-1), { structure: false });
});

test('a height outside the range is refused and the last good value stays', () => {
  const { editor, setup } = screen();
  editor.show('PAT1');
  const row = rowsOf(editor)[2];
  const before = setup.routes[0].points[2].alt;
  type(boxFor(row, 'Alt ft'), '99999');
  assert.equal(setup.routes[0].points[2].alt, before);
  assert.match(words(withClass(row, 'control-message')[0]), /from -1,000 to 20,000/);
});

test('the point itself refuses a value that is not a number in range, even if the box let it through', () => {
  const { editor, setup } = screen();
  editor.show('PAT1');
  const row = rowsOf(editor)[2];
  const before = { ...setup.routes[0].points[2] };
  for (const bad of ['-5', '401', '1e9', 'abc', '']) type(boxFor(row, 'KT'), bad);
  type(boxFor(row, 'G'), '0.5');
  type(boxFor(row, 'G'), '10');
  assert.deepEqual(setup.routes[0].points[2], before);
});

test('a label is held to its length limit', () => {
  const { editor, setup } = screen();
  editor.show('PAT1');
  const label = tagged(rowsOf(editor)[1], 'INPUT').find((i) => i.getAttribute('aria-label') === 'Point 2 label');
  assert.equal(label.getAttribute('maxlength'), String(LABEL_MAX));
  type(label, 'y'.repeat(LABEL_MAX + 30));
  assert.equal(setup.routes[0].points[1].label.length, LABEL_MAX);
});

test('+ Point past the most points says so and adds nothing', () => {
  const { editor, setup } = screen();
  const pattern = setup.routes[0];
  while (pattern.points.length < MOST_POINTS) pattern.points.push({ label: '', x: pattern.points.length, y: 0, alt: 2500, kt: 120, g: 2 });
  editor.show('PAT1');
  buttonNamed(editor.element, '+ Point').dispatch('click');
  assert.equal(pattern.points.length, MOST_POINTS);
  assert.match(words(editor.message), /already has 100 points/);
});

test('changing the label and the speed changes the point', () => {
  const { editor, setup } = screen();
  editor.show('PAT1');
  const row = rowsOf(editor)[1];
  type(tagged(row, 'INPUT').find((i) => i.getAttribute('aria-label') === 'Point 2 label'), 'Departure Turn');
  type(boxFor(row, 'KT'), '150');
  type(boxFor(row, 'G'), '3');
  assert.deepEqual([setup.routes[0].points[1].label, setup.routes[0].points[1].kt, setup.routes[0].points[1].g], ['Departure Turn', 150, 3]);
});

test('+ Point adds a row after the picked point and says so', () => {
  const { editor, setup, changes } = screen();
  editor.show('PAT1');
  rowsOf(editor)[4].dispatch('focusin');
  buttonNamed(editor.element, '+ Point').dispatch('click');
  assert.equal(setup.routes[0].points.length, 14);
  assert.equal(setup.routes[0].points[5].label, NEW_POINT_LABEL);
  assert.equal(rowsOf(editor).length, 14);
  assert.deepEqual(changes.at(-1), { structure: true });
  assert.match(words(editor.message), /Added point 6/);
  assert.equal(rowsOf(editor)[5].getAttribute('aria-current'), 'true');
});

test('Delete point removes the picked point, and asks for one first when none is picked', () => {
  const { editor, setup } = screen();
  editor.show('PAT1');
  buttonNamed(editor.element, 'Delete point').dispatch('click');
  assert.match(words(editor.message), /Pick the point/);
  assert.equal(setup.routes[0].points.length, 13);
  rowsOf(editor)[3].dispatch('focusin');
  buttonNamed(editor.element, 'Delete point').dispatch('click');
  assert.equal(setup.routes[0].points.length, 12);
  assert.equal(rowsOf(editor).length, 12);
  assert.match(words(editor.message), /Deleted point 4/);
});

test('Delete point says why when the route is already as short as it can be', () => {
  const { editor, setup } = screen();
  editor.show('SPL3'); // three points
  setup.routes.find((r) => r.id === 'SPL3').points.pop();
  editor.show('SPL3');
  rowsOf(editor)[0].dispatch('focusin');
  buttonNamed(editor.element, 'Delete point').dispatch('click');
  assert.match(words(editor.message), /needs at least 2 points/);
  assert.equal(rowsOf(editor).length, 2);
});

test('renaming changes the route and says the routes changed; an empty name is refused in words', () => {
  const { editor, setup, changes } = screen();
  editor.show('ENT1');
  const box = all(editor.element, (n) => n.getAttribute?.('id') === 'traffic-route-name')[0];
  assert.equal(box.value, 'Entry 1');
  type(box, 'Straight-in');
  assert.equal(setup.routes[1].name, 'Straight-in');
  assert.deepEqual(changes.at(-1), { structure: true });
  type(box, '   ');
  assert.match(words(editor.message), /needs a name/);
  assert.equal(setup.routes[1].name, 'Straight-in');
  assert.equal(box.value, 'Straight-in'); // leaving the box puts the name back
});

test('an entry shows where it joins, and changing it moves the entry\'s end', () => {
  const { editor, setup, changes } = screen();
  editor.show('ENT1');
  const selects = tagged(editor.element, 'SELECT');
  assert.equal(selects.length, 2);
  assert.equal(selects[0].value, 'PAT1');
  assert.equal(selects[1].value, '7');
  selects[1].value = '3';
  selects[1].dispatch('change');
  assert.equal(setup.routes[1].mergeIndex, 3);
  assert.deepEqual(changes.at(-1), { structure: true });
  assert.equal(tagged(editor.element, 'SELECT')[1].value, '3');
});

test('a split shows both its links', () => {
  const { editor } = screen();
  editor.show('SPL1');
  assert.equal(tagged(editor.element, 'SELECT').length, 4);
  assert.deepEqual(tagged(editor.element, 'LABEL').filter((l) => ['Leaves', 'Rejoins'].includes(words(l))).map(words), ['Leaves', 'Rejoins']);
});

test('the leg distances list the legs of the route, closed until asked for', () => {
  const { editor } = screen();
  editor.show('ENT1');
  const legs = withClass(editor.element, 'leg-row');
  assert.equal(legs.length, 3);
  assert.match(words(legs[0]), /^1→2 [\d,]+ ft, \d+\.\d\d NM$/);
  const panel = withClass(editor.element, 'panel-body')[0];
  assert.equal(panel.hidden, true);
});

test('names and labels with markup are shown as text', () => {
  const { editor, setup } = screen();
  setup.routes[0].points[0].label = '<img src=x onerror=alert(1)>';
  editor.show('PAT1');
  assert.equal(tagged(editor.element, 'IMG').length, 0);
});

test('refresh writes the turn data again after the route options change', () => {
  const { editor, setup } = screen();
  editor.show('PAT1');
  const row = rowsOf(editor)[3];
  const before = words(withClass(row, 'point-data')[0]);
  setup.routeOptions = { flyRoundedTurns: true, radiusFromG: false, manualRadiusFt: 4321 };
  editor.refresh();
  const after = words(withClass(row, 'point-data')[0]);
  assert.notEqual(after, before);
  assert.match(after, /R 4321ft/);
});

// ---- helpers ----------------------------------------------------------------------------

function pt(x, y) {
  return { label: '', x, y, alt: 2500, kt: 120, g: 2 };
}
function newPatternOf(n) {
  return { id: 'P', name: 'P', kind: 'pattern', points: Array.from({ length: n }, (_, i) => pt(i * 100, i * 50)) };
}
