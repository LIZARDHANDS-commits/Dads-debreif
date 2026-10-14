"""The live wingman's loops, linearised: a first-cut bandwidth and delay table (plan T29m part 1; the control-systems
analysis plan, section 4.4 and method M1).

Every gain is read from the code's own tuning tables through `node tools/control-map/tables.mjs` (never copied by hand);
the trim points (T1 straight and level, T2 Lead's 60°/2 G turn, T4 Lead at 4 G) come from the same script. Each loop is a
hand linearisation of the tidied code (tools/control-map/signals.mjs names the blocks), broken at the point named, under two
delay models (control-model.md, finding R1):
  - D-Lead: as built in fighting wing. Lead is 0.4 s late but dead-reckoned and #2 knows his own state now, so the only
    delay inside the loop is the one-step lag of the 0.05 s step.
  - D-Picture: the whole relative picture late (0.4 s fighting wing; close formation's built 0.3 s), McRuer's pilot.
Results are ESTIMATES until part 2's rig checks each loop's step response against the sim (plan C11). Nothing here is a
test or ships. Run from the repo root with the pinned kit:
  tools/flight-design/.venv/Scripts/python.exe tools/flight-design/fw_loops.py
It writes tools/flight-design/results/fw-loop-table.json and .md.
"""
import json
import math
import subprocess
import sys
from datetime import date
from pathlib import Path

import numpy as np
import control as ct

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools' / 'flight-design' / 'results'

# Lags the code has no single number for (estimates, each named in the table's notes):
G_ONSET_TAU = 0.05   # s: stepLead eases G at 4 G/s and 16 G/s² (core T6A_G_ONSET, easeValue): a rate and acceleration limit, nearly transparent to small corrections (about 0.05-0.1 s for 0.05 G); a 0.15 s row shows the sensitivity
ROLL_TAU = 0.05      # s: a small bank change at 60°/s (FW_WING.rollDps): a rate limit, nearly transparent when small
PADE_ORDER = 6


def tables():
    out = subprocess.run(['node', 'tools/control-map/tables.mjs'], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def lag(tau):
    return ct.tf([1], [tau, 1]) if tau > 0 else ct.tf([1], [1])


def delay(tau):
    if tau <= 0:
        return ct.tf([1], [1])
    n, d = ct.pade(tau, PADE_ORDER)
    return ct.tf(n, d)


def margins(L):
    gm, pm, wg, wc = ct.margin(L)
    if not (np.isfinite(wc) and wc > 0):
        return dict(wc=None, pm=None, gm_db=None, dm=None)
    gm_db = 20 * math.log10(gm) if np.isfinite(gm) and gm > 0 else None
    dm = (pm * math.pi / 180) / wc if pm is not None and pm > 0 else 0.0
    return dict(wc=float(wc), pm=float(pm), gm_db=gm_db, dm=float(dm))


def steady_gain(T):
    return float(np.real(ct.evalfr(T, 1e-6j)))


def main():
    t = tables()
    tb = t['tables']
    sh = t['shared']
    tr = t['trims']
    FW = tb['FW_WING']
    FS = tb['FW_SEE']
    CW = tb['CLOSE_WING']
    CS = tb['CLOSE_SEE']
    V = tr['tasFtps']
    g = tr['g']
    step = sh['stepSec']
    D_LEAD = step                     # one step: the command flies next step
    D_FW = FS['delaySec'] + step      # whole picture 0.4 s + the step
    D_CF = CS['delaySec'] + step      # close formation's built 0.3 s + the step
    rows = []

    def add(tech, loop, trim, model, L, note, steady=None):
        m = margins(L)
        rows.append(dict(tech=tech, loop=loop, trim=trim, delay=model, steady=steady, note=note, **m))

    # ---- fighting wing: steering (steerToAim) ----
    # Cross-track y off the path his aim point sits on, heading psi off its tangent. P: gPerDeg on the angle to the aim
    # point (about y / look distance + psi); the aim line's turn fed forward, smoothed aimTurnSec: it holds his own motion
    # (R3), d/dt(y/look) = V psi / look. Broken at his turn rate.
    K = FW['gPerDeg'] * g * (180 / math.pi) / V  # 1/s of turn per rad of angle
    tf_ = FW['aimTurnSec']
    act = lag(G_ONSET_TAU + ROLL_TAU)
    for trim, look in (('T2', FW['circleLookSec']), ('T1', FW['sweptLookSec'])):
        Lk = V * look
        s = ct.tf('s')
        C = K * V / Lk / s**2 + K / s + (V / Lk) / (s * (tf_ * s + 1))
        for model, dly in (('D-Lead', D_LEAD), ('D-Picture', D_FW)):
            add('fighting wing', 'steering', trim, model, ct.minreal(C * act, verbose=False) * delay(dly),
                f'look {look} s ({Lk:.0f} ft); P {K:.3f}/s; aim-line turn {tf_} s (hidden feedback, R3); lag {G_ONSET_TAU + ROLL_TAU} s (estimate)')
        # without the hidden feedback, for comparison
        C0 = K * V / Lk / s**2 + K / s
        add('fighting wing', 'steering without the aim-line term', trim, 'D-Lead', ct.minreal(C0 * act, verbose=False) * delay(D_LEAD),
            'what the aim-line "feed-forward" adds: compare with the row above')

    # The steering's closed loop from the path's offset to his offset (used by the arc loop), D-Lead and D-Picture
    def t_steer(dly, look):
        s = ct.tf('s')
        Lk = V * look
        P = V * act * delay(dly) / s**2
        Cref = K / Lk + s / (Lk * (tf_ * s + 1))
        return ct.minreal(P * Cref / (1 + P * (Cref + K * s / V)), verbose=False)

    # ---- fighting wing: the arc loop and power in Lead's turn (aimInTurn, powerAsk) ----
    # c = dV + omega d (on the circle); omega d_cmd = -dV_m + (1 + kc) c* - kc c_m (d_ss = R(1 - V2/V_L) is -dV/omega);
    # c* = e_m / aimSec; e = -c / s; the offset reaches the steering through the 1.5 s aim blend (R11) and the steering's
    # closed loop; power's P = e_m / powerArcSec through the speed hold (perSec) and the engine (quickSec). Loop at a time.
    kc = FW['arcKc']
    Ta = FW['aimSec']
    Tp = FW['powerArcSec']
    blend = lag(FW['blendSec'])
    Hv = ct.tf([sh['leadSpeedHoldPerSec']], [1, sh['leadSpeedHoldPerSec']]) * lag(sh['engineQuickSec'])
    s = ct.tf('s')
    for trim in ('T2', 'T4'):
        for model, dly in (('D-Lead', D_LEAD), ('D-Picture', D_FW)):
            D = delay(dly - step) if dly > step else ct.tf([1], [1])  # the step is already in the steering
            Td = ct.minreal(t_steer(dly, FW['circleLookSec']) * blend, verbose=False)
            br = 1 + kc * D * Td
            L_arc = ct.minreal(D * Td * (1 + kc) / (Ta * s * (br + Hv * D * (1 - D * Td) / (Tp * s))), verbose=False)
            add('fighting wing', 'arc loop (power closed)', trim, model, L_arc,
                f'kc {kc}, aimSec {Ta} s, blend {FW["blendSec"]} s, limits and slew left out; same at T2 and T4: no gain here depends on Lead\'s turn rate',
                steady=steady_gain(ct.minreal(Td * (1 + kc) / (1 + kc * Td), verbose=False)))
            L_pow = ct.minreal(D * Hv * (1 - D * Td) / (Tp * s * (br + (1 + kc) * D * Td / (Ta * s))), verbose=False)
            add('fighting wing', 'power on the arc error (arc closed)', trim, model, L_pow,
                'R5 corrected: d_ss hands the speed back as offset, so power has little loop gain on closure')
            L_kc = ct.minreal(kc * D * Td, verbose=False)
            add('fighting wing', 'arc loop inner shortfall term (kc)', trim, model, L_kc, 'kc on the closure it has')
        # the half-gain trap check: kc 0, no feed-forward: steady closure share
        Td0 = t_steer(D_LEAD, FW['circleLookSec']) * blend
        T_half = ct.minreal(Td0 / (1 + Td0), verbose=False)
        rows.append(dict(tech='fighting wing', loop='arc loop without the feed-forward (half-gain trap)', trim=trim, delay='D-Lead',
                         steady=steady_gain(T_half), note='steady closure delivered against the wanted: about half', wc=None, pm=None, gm_db=None, dm=None))

    # ---- fighting wing: the vertical PD (verticalFor) ----
    kp_v = FW['vertGPerFt'] * g
    kd_v = FW['vertGPerFtps'] * g
    for trim in ('T1', 'T2'):
        for model, dly in (('D-Lead', D_LEAD), ('D-Picture', D_FW)):
            L = ct.tf([kd_v, kp_v], [1, 0, 0]) * lag(G_ONSET_TAU) * delay(dly)
            add('fighting wing', 'vertical PD', trim, model, L, f'{FW["vertGPerFt"]} G/ft, {FW["vertGPerFtps"]} G per ft/s; G onset {G_ONSET_TAU} s (estimate)')

    # ---- fighting wing: power on the swept place, level (aimSwept, powerAsk PI) ----
    Tps = FW['powerSec']
    for model, dly in (('D-Lead', D_LEAD), ('D-Picture', D_FW)):
        L = Hv * (1 / (Ta * s) + 1 / (Ta * Tps * s**2) + 1 / (Tps * s)) * delay(dly)
        add('fighting wing', 'power on the swept place (PI)', 'T1', model, ct.minreal(L, verbose=False),
            f'P behind/{Ta} s, I {Tps} s, speed hold {sh["leadSpeedHoldPerSec"]}/s, engine {sh["engineQuickSec"]} s')

    # ---- close formation (closeLaw): the check of the method, then line and hinge ----
    fs = CS['filterSec']
    rate_f = lag(fs)
    pl = CW['plane']
    L0 = ct.tf([pl['kd'] * g, pl['kp'] * g], [1, 0, 0]) * delay(CS['delaySec'])
    add('close formation', 'plane axis, as spec 7b.6c (no filter, no onset)', 'T1', 'built 0.3 s', L0, 'the check of the method: spec 7b.6c gives about 2 rad/s and 37°')
    L1 = ct.tf([pl['kp'] * g], [1, 0, 0]) * delay(D_CF) * lag(G_ONSET_TAU) + ct.tf([pl['kd'] * g, 0], [1, 0, 0]) * rate_f * delay(D_CF) * lag(G_ONSET_TAU)
    add('close formation', 'plane axis with the 0.1 s rate filter, G onset and the step', 'T1', 'built 0.3 s', ct.minreal(L1, verbose=False),
        f'Fable 13 Oct: 25.9° with the filter, about 17° with the onset (its estimate); onset lag {G_ONSET_TAU} s here')
    L1s = ct.tf([pl['kp'] * g], [1, 0, 0]) * delay(D_CF) * lag(0.15) + ct.tf([pl['kd'] * g, 0], [1, 0, 0]) * rate_f * delay(D_CF) * lag(0.15)
    add('close formation', 'plane axis, as above with a 0.15 s onset lag (sensitivity)', 'T1', 'built 0.3 s', ct.minreal(L1s, verbose=False),
        'how much the onset lag guess matters; the flown axis settles in about 2 s without hunting (spec 7b status), so the true lag is small')
    kpos = CW['kPosPerSec']
    for trim, gref in (('T1', 1.0), ('T2', 2.0)):
        roll_kd = CW['side']['kdDegPerFtps'] * math.pi / 180 * gref * g  # ft/s² per ft/s of pace error
        L = roll_kd * (ct.tf([1, 0], [1]) * rate_f + kpos) / s**2 * lag(ROLL_TAU) * delay(D_CF)
        add('close formation', 'line axis (bank on the pace)', trim, 'built 0.3 s', ct.minreal(L, verbose=False),
            f'{CW["side"]["kdDegPerFtps"]}° per ft/s at Lead\'s G {gref:.0f}; pace {kpos}/s per ft')
    a_pct = tr['ktpsPerPctG1'] * tr['ktsToFtps'] * (tr['tasFtps'] / tr['ktsToFtps'] / tr['kias'])  # ft/s² true per %
    L = CW['fore']['kdPctPerFtps'] * a_pct * (ct.tf([1, 0], [1]) * rate_f + kpos) / s**2 * lag(sh['engineQuickSec']) * delay(D_CF)
    add('close formation', 'hinge axis (torque on the pace)', 'T1', 'built 0.3 s', ct.minreal(L, verbose=False),
        f'{CW["fore"]["kdPctPerFtps"]}% per ft/s, {tr["ktpsPerPctG1"]:.3f} kt/s per % (power.js); torque rate limit left out')

    OUT.mkdir(parents=True, exist_ok=True)
    header = dict(script='tools/flight-design/fw_loops.py', date=str(date.today()), code=t.get('codeAt'),
                  inputs='FW_WING, FW_SEE, CLOSE_WING, CLOSE_SEE (wing-moves.js), LEAD.speedHold, ENGINE, STEP_SEC, power.js, through tools/control-map/tables.mjs',
                  estimates=f'G onset lag {G_ONSET_TAU} s, roll lag {ROLL_TAU} s, Padé order {PADE_ORDER}; every row an estimate until part 2\'s rig checks it',
                  trims={k: tr[k]['name'] for k in ('T1', 'T2', 'T4')}, tasFtps=V)
    (OUT / 'fw-loop-table.json').write_text(json.dumps(dict(header=header, rows=rows), indent=1), encoding='utf-8')
    f = lambda x, d=2: '-' if x is None else f'{x:.{d}f}'
    md = [f'<!-- made by {header["script"]} on {header["date"]}; inputs: {header["inputs"]}; {header["estimates"]} -->', '',
          '| Technique | Loop | Trim | Delay model | Crossover (rad/s) | Phase margin (°) | Gain margin (dB) | Extra-delay margin (s) | Steady share | Note |',
          '|---|---|---|---|---|---|---|---|---|---|']
    for r in rows:
        md.append(f'| {r["tech"]} | {r["loop"]} | {r["trim"]} | {r["delay"]} | {f(r["wc"], 3)} | {f(r["pm"], 1)} | {f(r["gm_db"], 1)} | {f(r["dm"], 2)} | {f(r["steady"], 2)} | {r["note"]} |')
    (OUT / 'fw-loop-table.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
    print('\n'.join(md))


if __name__ == '__main__':
    sys.exit(main())
