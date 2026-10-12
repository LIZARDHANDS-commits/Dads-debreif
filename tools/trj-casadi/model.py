"""
tools/trj-casadi/model.py
Continuous T-6A point-mass aerodynamic and propulsion model for CasADi.
Matches src/core/t6-performance.js and src/modules/turn-sim/live/flight.js.
"""

import casadi as ca

# Standard Units & Constants
G_FTPS2 = 32.17405
KT_TO_FTPS = 1.68781
FTPS_TO_KT = 1.0 / KT_TO_FTPS
DEG = 3.141592653589793 / 180.0

# T-6A performance inputs (copied from src/core/t6-performance.js: T6A_AIRFRAME, T6A_ENGINE, T6A_PROP, T6A_DRAG and
# the 6,400 lb sortie weight in T6A_LIMITS; each input's source is written there). Clean configuration only.
RHO0_SLUG_FT3 = 0.0023769
WING_AREA_SQFT = 175.3
ASPECT_RATIO = 6.29
WEIGHT_LB = 6400.0
SHAFT_HP = 1100.0
PROP_ND_FTPS = 2000.0 / 60.0 * (97.0 / 12.0)
FLAT_RATED_SIGMA = 0.6090  # standard day's density ratio at 16,000 ft (T6A_ENGINE.flatRatedToFt)
LAPSE_EXP = 0.85
EXHAUST_THRUST_LB = 160.0
EXHAUST_ZERO_KTAS = 400.0
PROP_PEAK_EFF = 0.812
PROP_PEAK_J = 1.8
PROP_STATIC_LB = 3100.0
PROP_FALL_WIDTH = 1.1
ZERO_LIFT_CD = 0.027
SPAN_EFFICIENCY = 0.8
FULL_POWER = SHAFT_HP * 550.0
PROP_RISE_EXP = PROP_STATIC_LB * PROP_ND_FTPS * PROP_PEAK_J / (FULL_POWER * PROP_PEAK_EFF)
INDUCED_K = 1.0 / (3.141592653589793 * ASPECT_RATIO * SPAN_EFFICIENCY)

# SMM / Flight Limits (from src/core/t6-performance.js)
T6A_LIMITS = {
    'stallKias': 86.0,
    'maxG': 7.0,
    'minG': -3.5,
    'rollingMaxG': 4.7,
    'maxRateDps': 120.0,
    'rollPerKtasDps': 0.45,
}

# Speed Brake and Idle Prop Drag (from src/modules/turn-sim/live/slow-down.js)
BOARDS_DRAG_PER_W = 0.095
IDLE_PROP_DRAG_PER_W = 0.16
REF_KIAS = 200.0


def isa_density_ratio(alt_ft):
    """Density ratio sigma = rho / rho0 up to 11 km on a standard day."""
    h_m = alt_ft * 0.3048
    h_clamped = ca.fmin(11000.0, ca.fmax(0.0, h_m))
    theta = (288.15 - 0.0065 * h_clamped) / 288.15
    return theta ** 4.25588


def kias_to_ktas(kias, alt_ft):
    """Converts Indicated Airspeed (kt) to True Airspeed (kt)."""
    sigma = isa_density_ratio(alt_ft)
    return kias / ca.sqrt(sigma)


def ktas_to_kias(ktas, alt_ft):
    """Converts True Airspeed (kt) to Indicated Airspeed (kt)."""
    sigma = isa_density_ratio(alt_ft)
    return ktas * ca.sqrt(sigma)


def thrust_per_weight_max(kias, alt_ft):
    """Maximum power thrust / weight: propeller efficiency x flat-rated shaft power / true airspeed, plus the exhaust."""
    sigma = isa_density_ratio(alt_ft)
    lapse = ca.fmin(1.0, (sigma / FLAT_RATED_SIGMA) ** LAPSE_EXP)
    ktas = kias_to_ktas(kias, alt_ft)
    v = ktas * KT_TO_FTPS
    j = v / PROP_ND_FTPS
    rising = PROP_PEAK_EFF * (1.0 - ca.fmax(0.0, 1.0 - j / PROP_PEAK_J) ** PROP_RISE_EXP)
    falling = PROP_PEAK_EFF * ca.exp(-((j - PROP_PEAK_J) / PROP_FALL_WIDTH) ** 2)
    eta = ca.if_else(j <= PROP_PEAK_J, rising, falling)
    exhaust = EXHAUST_THRUST_LB * lapse * ca.fmax(0.0, 1.0 - ktas / EXHAUST_ZERO_KTAS)
    return (eta * FULL_POWER * lapse / v + exhaust) / WEIGHT_LB


def drag_per_weight(kias, alt_ft, g, boards=0.0):
    """
    Drag / weight including clean induced+parasitic drag and speedbrake contribution.
    boards: 0.0 (retracted) to 1.0 (fully deployed).
    """
    q = 0.5 * RHO0_SLUG_FT3 * (kias * KT_TO_FTPS) ** 2 + 1e-9
    cl = g * WEIGHT_LB / (q * WING_AREA_SQFT)
    clean_drag = q * WING_AREA_SQFT * (ZERO_LIFT_CD + INDUCED_K * cl ** 2) / WEIGHT_LB
    boards_drag = boards * BOARDS_DRAG_PER_W * ((kias / REF_KIAS) ** 2)
    return clean_drag + boards_drag


def available_g(kias):
    """Maximum available aerodynamic normal load factor before wing stall."""
    stall_g = (kias / T6A_LIMITS['stallKias']) ** 2
    return ca.fmin(stall_g, T6A_LIMITS['maxG'])


def max_roll_rate_rad(ktas):
    """Maximum roll rate (rad/s) at given true airspeed."""
    dps = ca.fmin(T6A_LIMITS['maxRateDps'], T6A_LIMITS['rollPerKtasDps'] * ktas)
    return dps * DEG


def equations_of_motion_3d(state, control, alt_ref_ft=8000.0):
    """
    3D point-mass equations of motion in North-East-Down (or x-east, y-north, z-up) frame.
    
    State vector:
      x: East (ft)
      y: North (ft)
      z: Up / Alt above datum (ft)
      v: Ground / true speed (ft/s)
      psi: Math heading angle (rad, counter-clockwise from East: 0 = East, pi/2 = North)
      gamma: Flight path climb angle (rad)
      bank: Roll angle (rad, right wing down positive)
      g: Load factor (n)
      throttle: Throttle setting (0 to 1)
      boards: Speedbrake deployment (0 to 1)
      
    Control vector:
      p: Roll rate (rad/s)
      g_rate: Rate of load factor change dn/dt (1/s)
      throttle_rate: d(throttle)/dt (1/s)
      boards_rate: d(boards)/dt (1/s)
    """
    x, y, z, v, psi, gamma, bank, g, throttle, boards = state
    p, g_rate, throttle_rate, boards_rate = control

    alt_ft = alt_ref_ft + z
    ktas = v * FTPS_TO_KT
    kias = ktas_to_kias(ktas, alt_ft)

    # Aerodynamic forces per weight
    t_over_w_max = thrust_per_weight_max(kias, alt_ft)
    t_over_w = throttle * t_over_w_max
    d_over_w = drag_per_weight(kias, alt_ft, g, boards)

    # Longitudinal acceleration (dV/dt)
    # dv_dt = g_accel * ((T - D)/W - sin(gamma))
    dv_dt = G_FTPS2 * (t_over_w - d_over_w - ca.sin(gamma))

    # Turn rate (heading in math radians)
    # dpsi/dt = (G_FTPS2 / (V * cos(gamma))) * (g * sin(bank))
    cos_gamma = ca.cos(gamma) + 1e-6
    dpsi_dt = (G_FTPS2 / (v * cos_gamma)) * (g * ca.sin(bank))

    # Flight path angle rate
    # dgamma/dt = (G_FTPS2 / V) * (g * cos(bank) - cos(gamma))
    dgamma_dt = (G_FTPS2 / v) * (g * ca.cos(bank) - ca.cos(gamma))

    # Kinematics
    dx_dt = v * ca.cos(gamma) * ca.cos(psi)
    dy_dt = v * ca.cos(gamma) * ca.sin(psi)
    dz_dt = v * ca.sin(gamma)

    # Rates
    dbank_dt = p
    dg_dt = g_rate
    dthrottle_dt = throttle_rate
    dboards_dt = boards_rate

    derivs = ca.vertcat(
        dx_dt,
        dy_dt,
        dz_dt,
        dv_dt,
        dpsi_dt,
        dgamma_dt,
        dbank_dt,
        dg_dt,
        dthrottle_dt,
        dboards_dt
    )
    return derivs
