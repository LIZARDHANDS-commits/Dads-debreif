// Detail for one mid-move case: the from-here candidate's run (lane, legs) and a static comparison.
const W = '/home/user/Dads-debreif/src/modules/turn-sim/live';
const F = await import(W + '/formation.js');
const T = await import(W + '/tuning.js');
const R = await import(W + '/replan.js');
const M = await import(W + '/manoeuvres.js');
T.setRates('instructor');
const flyFor = (f, sec) => { for (let i = 0; i < Math.round(sec / 0.05); i++) f.step(); };
const flyOut = (f) => { const t0 = f.state.tSec; while (f.state.current && f.state.tSec - t0 < 300) f.step(); return (f.state.tSec - t0).toFixed(1); };
{ const f = F.createFormation({}); f.change('echelon'); flyOut(f); f.change('route'); console.log('static echelon->route', flyOut(f), 's', f.state.judged?.text); }
{ const f = F.createFormation({}); f.change('echelon'); flyOut(f); f.press('delayed90', 1); flyFor(f, 2);
  const [L, Wg] = f.state.aircraft; const near = R.nearestPlace(L, Wg, 6000, -1); console.log('case 4 near', near);
  const r = R.planFromHere(f.state.aircraft, 'route', { mid: { lead: { kind: 'carry', plan: { segments: f.state.plans[1].segments.map((x) => ({ ...x })) } } } }, f.state.tSec);
  console.log('case 4 from here', r.ok, r.reason ?? '', Math.round(r.endSec - f.state.tSec), 's lane', Math.round(r.laneFwdFt)); }
{ const f = F.createFormation({}); f.change('echelon'); flyOut(f); f.press('delayed90', 1); flyFor(f, 25); console.log('turn done?', f.state.current?.label, Math.round(f.state.aircraft[0].bankDeg));
  f.change('route'); console.log('route after turn (Lead level)', flyOut(f), 's', f.state.judged?.text); }
{ const f = F.createFormation({}); f.change('echelon'); flyOut(f); f.change('lab'); flyFor(f, 15);
  const [L, Wg] = f.state.aircraft; const near = R.nearestPlace(L, Wg, 6000, -1); console.log('case 7 near', near, 'Lead', Math.round(L.kias), '#2', Math.round(Wg.kias), 'hdg diff', Math.round((Wg.headingRad - L.headingRad) * 57.3));
  const r = R.planFromHere(f.state.aircraft, 'echelon', { mid: { lead: { kind: 'straight' } } }, f.state.tSec);
  console.log('case 7 from here', r.ok, r.reason ?? '', Math.round(r.endSec - f.state.tSec), 's lane', Math.round(r.laneFwdFt), r.judged?.text); }
