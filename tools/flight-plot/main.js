// The Formation flight-data plot page (Formation plan Step 12.1c; Patrick's yes, 12 Oct 2026): plots the smoothness
// gauge's traces (tools/formation-gauge.mjs, tmp/gauge/) against time, one chart per quantity with every aircraft on it,
// so a kink shows as a kink and two runs can be compared by eye. Development only: the dev server serves it at
// /tools/flight-plot/; the built site never includes it. uPlot is the app's own (Turn Fight's energy graph).

const CHARTS = [
  { key: 'g', title: 'G', unit: 'G' },
  { key: 'gRate', title: 'G rate (how fast the G changes)', unit: 'G/s' },
  { key: 'roll', title: 'Roll rate', unit: '°/s' },
  { key: 'bank', title: 'Bank (wings)', unit: '°' },
  { key: 'drawnDps', title: "Drawn aircraft's turn rate (3D view, per step)", unit: '°/s' },
  { key: 'climbDeg', title: 'Flight path angle', unit: '°' },
  { key: 'kias', title: 'Airspeed', unit: 'KIAS' },
  { key: 'rangeFt', title: 'Range to the aircraft he flies off', unit: 'ft' },
  // The close wingman's own (B1, B2; only in the close-formation scenarios): how far off his place on each of Patrick's
  // axes (plane + above Lead's wing plane, line + ahead of the spinner-to-wingtip line, along + out), and his torque.
  { key: 'planeFt', title: 'Close wingman: off the plane (+ above)', unit: 'ft' },
  { key: 'lineFt', title: 'Close wingman: off the line (+ ahead)', unit: 'ft' },
  { key: 'alongFt', title: 'Close wingman: along the line (+ out)', unit: 'ft' },
  { key: 'torquePct', title: 'Torque', unit: '%' },
];
const COLOURS = ['#4fc3f7', '#ffb74d', '#81c784', '#e57373'];

const runSelect = document.getElementById('run');
const fileInput = document.getElementById('file');
const chartsEl = document.getElementById('charts');
const note = document.getElementById('note');

const uPlot = (await import('uplot')).default;
let plots = [];

/** Dashed vertical lines at each press, drawn on every chart. */
function pressMarks(presses) {
  return {
    hooks: {
      draw: [(u) => {
        const { ctx } = u;
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#8b98a5';
        ctx.fillStyle = '#8b98a5';
        ctx.font = `${11 * devicePixelRatio}px system-ui`;
        for (const p of presses) {
          const x = u.valToPos(p.t, 'x', true);
          ctx.beginPath();
          ctx.moveTo(x, u.bbox.top);
          ctx.lineTo(x, u.bbox.top + u.bbox.height);
          ctx.stroke();
          ctx.fillText(p.label, x + 4, u.bbox.top + 12 * devicePixelRatio);
        }
        ctx.restore();
      }],
    },
  };
}

function show(trace) {
  for (const p of plots) p.destroy();
  plots = [];
  chartsEl.textContent = '';
  const names = Object.keys(trace.aircraft);
  if (!names.length) {
    note.textContent = 'This trace has no aircraft data.';
    return;
  }
  // Every aircraft shares the step times; take the first one's.
  const t = trace.aircraft[names[0]].t;
  const width = Math.max(320, chartsEl.clientWidth - 16);
  for (const c of CHARTS) {
    if (!names.some((n) => trace.aircraft[n][c.key])) continue; // a chart this scenario has no data for
    const box = document.createElement('section');
    box.className = 'chart';
    const h = document.createElement('h2');
    h.textContent = `${c.title} (${c.unit})`;
    box.append(h);
    chartsEl.append(box);
    const data = [t, ...names.map((n) => trace.aircraft[n][c.key] ?? t.map(() => null))];
    const series = [{ label: 's' }, ...names.map((n, i) => ({ label: n, stroke: COLOURS[i % COLOURS.length], width: 1.5, spanGaps: false }))];
    plots.push(new uPlot({
      width,
      height: 180,
      series,
      axes: [{ stroke: '#8b98a5', grid: { stroke: '#2a3642' } }, { stroke: '#8b98a5', grid: { stroke: '#2a3642' } }],
      cursor: { sync: { key: 'flight' } },
      scales: { x: { time: false } },
      plugins: [pressMarks(trace.presses ?? [])],
    }, data, box));
  }
  note.textContent = `${trace.name}: ${(trace.presses ?? []).map((p) => `${p.label} at ${p.t.toFixed(1)} s`).join(' · ')}. Drag to zoom, double-click to zoom out.`;
}

async function loadRun(file) {
  const res = await fetch(`../../tmp/gauge/${file}`);
  if (!res.ok) throw new Error(`No trace ${file} (run the gauge first)`);
  show(await res.json());
}

try {
  const res = await fetch('../../tmp/gauge/index.json');
  if (!res.ok) throw new Error('no index');
  const index = await res.json();
  for (const r of index) runSelect.append(new Option(r.name, r.file));
  runSelect.addEventListener('change', () => loadRun(runSelect.value).catch((e) => { note.textContent = e.message; }));
  if (index.length) await loadRun(index[0].file);
} catch {
  note.textContent = 'No gauge traces found in tmp/gauge/. Run node tools/formation-gauge.mjs, then reload, or pick a trace file above.';
}

fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  try {
    show(JSON.parse(await f.text()));
  } catch (e) {
    note.textContent = `That file is not a gauge trace: ${e.message}`;
  }
});
