"""
tools/trj-casadi/solve_rejoin.py
Collocation NLP solver for Formation Rejoin optimal control.
Uses CasADi + IPOPT to find time-optimal, aerodynamically valid T-6A trajectories.
Solves both 'unrestricted' and 'by_the_book' modes.
Extracts Lagrange multipliers (shadow prices in seconds) for flight rules.
"""

import json
import math
from pathlib import Path

import casadi as ca
import numpy as np

import model


def load_baselines(path="tools/trj-casadi/baseline_rejoins.json"):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_lead_interpolants(history):
    """
    Builds B-spline interpolants for Lead's states from recorded history.
    """
    times = np.array([pt["t"] for pt in history])
    lx = np.array([pt["lead"]["x"] for pt in history])
    ly = np.array([pt["lead"]["y"] for pt in history])
    lz = np.array([pt["lead"]["alt"] for pt in history])
    lpsi = np.array([pt["lead"]["headingRad"] for pt in history])
    lbank = np.array([pt["lead"]["bankDeg"] * model.DEG for pt in history])
    lkias = np.array([pt["lead"]["kias"] for pt in history])

    sigma = np.array([float(model.isa_density_ratio(8000.0 + z)) for z in lz])
    lktas = lkias / np.sqrt(sigma)
    lv = lktas * model.KT_TO_FTPS

    t_grid = times.tolist()

    interp_x = ca.interpolant("lx", "bspline", [t_grid], lx.tolist())
    interp_y = ca.interpolant("ly", "bspline", [t_grid], ly.tolist())
    interp_z = ca.interpolant("lz", "bspline", [t_grid], lz.tolist())
    interp_psi = ca.interpolant("lpsi", "bspline", [t_grid], lpsi.tolist())
    interp_bank = ca.interpolant("lbank", "bspline", [t_grid], lbank.tolist())
    interp_v = ca.interpolant("lv", "bspline", [t_grid], lv.tolist())

    return {
        "x": interp_x,
        "y": interp_y,
        "z": interp_z,
        "psi": interp_psi,
        "bank": interp_bank,
        "v": interp_v,
        "t_max": float(times[-1]),
    }


def solve_scenario(
    case_name,
    case_data,
    mode="by_the_book",
    n_nodes=50,
    target_fwd=-25.0,
    target_left=-45.0,
    target_up=-9.5,
    max_iter=500,
):
    """
    mode: 'by_the_book' (G <= 3.0, bank <= 60 deg, strict rules)
          'unrestricted' (G <= 7.0, bank unconstrained)
    """
    print(f"\n=======================================================")
    print(f"Solving OCP: {case_name} | Mode: {mode.upper()}")
    print(f"Baseline Time: {case_data['totalTimeSec']}s | Nodes: {n_nodes}")
    print(f"=======================================================")

    history = case_data["history"]
    lead = build_lead_interpolants(history)

    w0 = history[0]["wing"]
    w0_z = w0["alt"]
    w0_ktas = float(model.kias_to_ktas(w0["kias"], 8000.0 + w0_z))
    w0_v = w0_ktas * model.KT_TO_FTPS

    x0_val = [
        w0["x"],
        w0["y"],
        w0["alt"],
        w0_v,
        w0["headingRad"],
        0.0,
        w0["bankDeg"] * model.DEG,
        w0["g"],
        w0.get("throttle", 0.5),
        0.0,
    ]

    opti = ca.Opti()

    # Time variable
    t_base = case_data["totalTimeSec"]
    T = opti.variable()
    opti.set_initial(T, min(t_base * 0.9, lead["t_max"] * 0.9))
    opti.subject_to(T >= 5.0)
    opti.subject_to(T <= lead["t_max"] * 0.999)

    dt = T / n_nodes

    nx = 10
    nu = 4
    X = opti.variable(nx, n_nodes + 1)
    U = opti.variable(nu, n_nodes)

    opti.subject_to(X[:, 0] == x0_val)

    sym_s = ca.MX.sym("s", nx)
    sym_u = ca.MX.sym("u", nu)
    f_dyn = ca.Function(
        "f_dyn",
        [sym_s, sym_u],
        [model.equations_of_motion_3d(ca.vertsplit(sym_s), ca.vertsplit(sym_u))],
    )

    # Constraint collectors for dual extraction
    expr_g_max = []
    expr_bank_max = []
    expr_39_line = []
    expr_below_lead = []

    # Rule limits based on mode
    g_limit = 3.0 if mode == "by_the_book" else 7.0
    bank_limit_deg = 60.0 if mode == "by_the_book" else 150.0

    for k in range(n_nodes):
        tk = (k / n_nodes) * T
        xk = X[:, k]
        xk_next = X[:, k + 1]
        uk = U[:, k]

        # Trapezoidal defect
        fk = f_dyn(xk, uk)
        fk_next = f_dyn(xk_next, uk)
        opti.subject_to(xk_next - xk - 0.5 * dt * (fk + fk_next) == 0)

        vk = xk[3]
        gammak = xk[5]
        bankk = xk[6]
        gk = xk[7]
        throtk = xk[8]
        boardsk = xk[9]

        zk = xk[2]
        altk = 8000.0 + zk
        ktask = vk * model.FTPS_TO_KT
        kiask = model.ktas_to_kias(ktask, altk)

        # Speed bounds
        min_kias = 180.0 if mode == "by_the_book" else 95.0
        opti.subject_to(kiask >= min_kias)
        opti.subject_to(kiask <= 310.0)

        # Climb / dive bounds
        opti.subject_to(gammak >= -60.0 * model.DEG)
        opti.subject_to(gammak <= 60.0 * model.DEG)

        # G limits
        cg = (gk <= g_limit)
        opti.subject_to(cg)
        expr_g_max.append(cg)
        opti.subject_to(gk >= -1.0)
        opti.subject_to(gk <= (kiask / 86.0) ** 2)

        # Bank limit
        cbank_pos = (bankk <= bank_limit_deg * model.DEG)
        cbank_neg = (bankk >= -bank_limit_deg * model.DEG)
        opti.subject_to(cbank_pos)
        opti.subject_to(cbank_neg)
        expr_bank_max.append((cbank_pos, cbank_neg))

        # Actuators
        opti.subject_to(throtk >= 0.0)
        opti.subject_to(throtk <= 1.0)
        opti.subject_to(boardsk >= 0.0)
        opti.subject_to(boardsk <= 1.0)

        # Control rates
        opti.subject_to(uk[0] >= -120.0 * model.DEG)
        opti.subject_to(uk[0] <= 120.0 * model.DEG)
        opti.subject_to(uk[1] >= -3.0)
        opti.subject_to(uk[1] <= 3.0)
        opti.subject_to(uk[2] >= -1.0)
        opti.subject_to(uk[2] <= 1.0)
        opti.subject_to(uk[3] >= -1.0)
        opti.subject_to(uk[3] <= 1.0)

        # Lead relative frame
        lead_xk = lead["x"](tk)
        lead_yk = lead["y"](tk)
        lead_zk = lead["z"](tk)
        lead_psik = lead["psi"](tk)

        dxk = xk[0] - lead_xk
        dyk = xk[1] - lead_yk
        dzk = xk[2] - lead_zk

        cos_lpsi = ca.cos(lead_psik)
        sin_lpsi = ca.sin(lead_psik)

        fwd_k = dxk * cos_lpsi + dyk * sin_lpsi
        left_k = -dxk * sin_lpsi + dyk * cos_lpsi
        up_k = dzk

        # 3/9 Line & Below Lead in final approach
        if mode == "by_the_book" and k >= int(n_nodes * 0.6):
            c_39 = (fwd_k <= 10.0)
            opti.subject_to(c_39)
            expr_39_line.append(c_39)

            c_below = (up_k <= 5.0)
            opti.subject_to(c_below)
            expr_below_lead.append(c_below)

    # Terminal Conditions at t = T
    xN = X[:, n_nodes]
    lead_xT = lead["x"](T)
    lead_yT = lead["y"](T)
    lead_zT = lead["z"](T)
    lead_psiT = lead["psi"](T)
    lead_vT = lead["v"](T)

    dxT = xN[0] - lead_xT
    dyT = xN[1] - lead_yT
    dzT = xN[2] - lead_zT

    cos_lpsiT = ca.cos(lead_psiT)
    sin_lpsiT = ca.sin(lead_psiT)

    fwd_T = dxT * cos_lpsiT + dyT * sin_lpsiT
    left_T = -dxT * sin_lpsiT + dyT * cos_lpsiT
    up_T = dzT

    # Echelon slot arrival window
    opti.subject_to(fwd_T >= target_fwd - 8.0)
    opti.subject_to(fwd_T <= target_fwd + 8.0)
    opti.subject_to(left_T >= target_left - 8.0)
    opti.subject_to(left_T <= target_left + 8.0)
    opti.subject_to(up_T >= target_up - 4.0)
    opti.subject_to(up_T <= target_up + 4.0)

    # Terminal velocity & attitude matching
    opti.subject_to(xN[3] >= lead_vT - 5.0)
    opti.subject_to(xN[3] <= lead_vT + 5.0)
    opti.subject_to(xN[5] >= -2.0 * model.DEG)
    opti.subject_to(xN[5] <= 2.0 * model.DEG)
    opti.subject_to(ca.sin(xN[4] - lead_psiT) >= -0.05)
    opti.subject_to(ca.sin(xN[4] - lead_psiT) <= 0.05)

    # Initial guess
    sample_indices = np.linspace(0, len(history) - 1, n_nodes + 1).astype(int)
    guess_X = np.zeros((nx, n_nodes + 1))
    for i, idx in enumerate(sample_indices):
        pt = history[idx]["wing"]
        zk = pt["alt"]
        ktask = float(model.kias_to_ktas(pt["kias"], 8000.0 + zk))
        guess_X[0, i] = pt["x"]
        guess_X[1, i] = pt["y"]
        guess_X[2, i] = pt["alt"]
        guess_X[3, i] = ktask * model.KT_TO_FTPS
        guess_X[4, i] = pt["headingRad"]
        guess_X[5, i] = 0.0
        guess_X[6, i] = pt["bankDeg"] * model.DEG
        guess_X[7, i] = pt["g"]
        guess_X[8, i] = pt.get("throttle", 0.5)
        guess_X[9, i] = 0.0

    opti.set_initial(X, guess_X)

    # Objective: Minimize Time + smooth controls + slot centering
    control_reg = dt * ca.sum2(
        0.05 * (U[0, :] ** 2)
        + 0.05 * (U[1, :] ** 2)
        + 0.02 * (U[2, :] ** 2)
        + 0.02 * (U[3, :] ** 2)
    )
    terminal_reg = 0.01 * ((fwd_T - target_fwd) ** 2 + (left_T - target_left) ** 2 + (up_T - target_up) ** 2)

    opti.minimize(T + control_reg + terminal_reg)

    p_opts = {"expand": True, "print_time": False}
    s_opts = {
        "max_iter": max_iter,
        "tol": 1e-4,
        "constr_viol_tol": 1e-3,
        "print_level": 3,
    }
    opti.solver("ipopt", p_opts, s_opts)

    try:
        sol = opti.solve()
        opt_T = float(sol.value(T))
        opt_X = sol.value(X)
        opt_U = sol.value(U)

        time_saved = t_base - opt_T
        pct_gain = (time_saved / t_base) * 100.0

        # Extract Lagrange multipliers (price tags in seconds)
        # sum(lambda * dt) gives the total marginal sensitivity in seconds
        dt_val = opt_T / n_nodes
        g_shadow_price_s_per_g = float(sum(abs(sol.value(opti.dual(c))) for c in expr_g_max) * dt_val)
        
        bank_duals = []
        for cpos, cneg in expr_bank_max:
            bank_duals.append(abs(sol.value(opti.dual(cpos))) + abs(sol.value(opti.dual(cneg))))
        bank_shadow_price_s_per_rad = float(sum(bank_duals) * dt_val)
        bank_shadow_price_s_per_deg = bank_shadow_price_s_per_rad * model.DEG

        line_39_shadow_s_per_ft = 0.0
        if expr_39_line:
            line_39_shadow_s_per_ft = float(sum(abs(sol.value(opti.dual(c))) for c in expr_39_line) * dt_val)

        print(f"\n>>> IPOPT Converged Successfully ({mode.upper()})! <<<")
        print(f"Optimal Time: {opt_T:.2f} s | Baseline: {t_base:.2f} s | Saved: {time_saved:.2f} s ({pct_gain:.1f}%)")
        print(f"10% Gate Status: {'PASSED (>= 10%)' if pct_gain >= 10.0 else 'FAILED (< 10%)'}")
        print(f"--- Rule Shadow Prices (Lagrange Multipliers) ---")
        print(f"  G-limit Shadow Price:    {g_shadow_price_s_per_g:.3f} s / G")
        print(f"  Bank-limit Shadow Price: {bank_shadow_price_s_per_deg:.3f} s / deg")
        if expr_39_line:
            print(f"  3/9 Line Shadow Price:   {line_39_shadow_s_per_ft:.3f} s / ft")

        # Compile trajectory
        t_nodes = np.linspace(0, opt_T, n_nodes + 1).tolist()
        trajectory = []
        for i in range(n_nodes + 1):
            ti = t_nodes[i]
            kias_i = float(model.ktas_to_kias(opt_X[3, i] * model.FTPS_TO_KT, 8000.0 + opt_X[2, i]))
            trajectory.append({
                "t": round(ti, 3),
                "x": round(float(opt_X[0, i]), 2),
                "y": round(float(opt_X[1, i]), 2),
                "z": round(float(opt_X[2, i]), 2),
                "v_ftps": round(float(opt_X[3, i]), 2),
                "kias": round(kias_i, 1),
                "headingRad": round(float(opt_X[4, i]), 4),
                "gammaRad": round(float(opt_X[5, i]), 4),
                "bankDeg": round(float(opt_X[6, i] / model.DEG), 2),
                "g": round(float(opt_X[7, i]), 3),
                "throttle": round(float(opt_X[8, i]), 3),
                "boards": round(float(opt_X[9, i]), 3),
                "rollRateDps": round(float(opt_U[0, min(i, n_nodes - 1)] / model.DEG), 2),
            })

        max_g_found = float(np.max(opt_X[7, :]))
        max_bank_deg = float(np.max(np.abs(opt_X[6, :])) / model.DEG)

        return {
            "status": "converged",
            "mode": mode,
            "optimalTimeSec": round(opt_T, 2),
            "baselineTimeSec": round(t_base, 2),
            "timeSavedSec": round(time_saved, 2),
            "pctGain": round(pct_gain, 2),
            "passed10PctGate": bool(pct_gain >= 10.0),
            "maxG": round(max_g_found, 2),
            "maxBankDeg": round(max_bank_deg, 1),
            "shadowPrices": {
                "gLimit_s_per_g": round(g_shadow_price_s_per_g, 4),
                "bankLimit_s_per_deg": round(bank_shadow_price_s_per_deg, 4),
                "line39_s_per_ft": round(line_39_shadow_s_per_ft, 4),
            },
            "trajectory": trajectory,
        }

    except Exception as e:
        print(f"Optimization failed for {case_name} ({mode}): {e}")
        return {"status": "failed", "mode": mode, "error": str(e)}


if __name__ == "__main__":
    baselines = load_baselines()
    results = {}

    for name in ["nominalPlain", "hotRoll", "nominalRoll"]:
        results[name] = {}
        # Solve By-the-Book
        res_btb = solve_scenario(name, baselines["cases"][name], mode="by_the_book", n_nodes=50)
        results[name]["by_the_book"] = res_btb

        # Solve Unrestricted
        res_unr = solve_scenario(name, baselines["cases"][name], mode="unrestricted", n_nodes=50)
        results[name]["unrestricted"] = res_unr

        # Print trade summary
        if res_btb.get("status") == "converged" and res_unr.get("status") == "converged":
            trade_s = res_btb["optimalTimeSec"] - res_unr["optimalTimeSec"]
            print(f"\n>>> DOCTRINE TRADE FOR {name}:")
            print(f"    By-the-Book Optimal:  {res_btb['optimalTimeSec']} s (Baseline: {res_btb['baselineTimeSec']} s)")
            print(f"    Unrestricted Optimal: {res_unr['optimalTimeSec']} s (Airframe Limit)")
            print(f"    Rules Price Tag:      {trade_s:.2f} s traded away for safety & doctrine!")

    out_path = Path("tools/trj-casadi/optimal_rejoins.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\n=> Written optimal rejoins and shadow prices to {out_path}")
