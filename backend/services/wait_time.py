"""Wait-time model.  W = (P * S_avg * U) / C.

The expression and its derivatives are built once with SymPy (so they can be shown to admins),
then compiled with lambdify so per-ticket evaluation is cheap on every queue refresh.
"""
from typing import Any, Dict

import sympy as sp

P = sp.Symbol("P", positive=True)
S_avg = sp.Symbol("S_avg", positive=True)
C_active = sp.Symbol("C_active", positive=True)
U_factor = sp.Symbol("U_factor", positive=True)

W_symbolic = (P * S_avg * U_factor) / C_active
dW_dC = sp.diff(W_symbolic, C_active)
dW_dS = sp.diff(W_symbolic, S_avg)

_W = sp.lambdify((P, S_avg, C_active, U_factor), W_symbolic, "math")
_dW_dC = sp.lambdify((P, S_avg, C_active, U_factor), dW_dC, "math")
_FORMULA_LATEX = sp.latex(W_symbolic)

PRIORITY_URGENCY_FACTORS = {"EMERGENCY": 0.4, "VIP": 0.7, "SENIOR_CITIZEN": 0.85, "NORMAL": 1.0}


def calculate_symbolic_wait_time(position_ahead: int, avg_service_time: float, active_counters: int, priority_level: str = "NORMAL") -> Dict[str, Any]:
    counters = max(1, int(active_counters))
    position = max(0, int(position_ahead))
    u_val = PRIORITY_URGENCY_FACTORS.get((priority_level or "NORMAL").upper(), 1.0)
    avg_time = max(1.0, float(avg_service_time or 1.0))

    base = {
        "position_ahead": position,
        "active_counters": counters,
        "urgency_factor": u_val,
        "formula_latex": _FORMULA_LATEX,
        "formula_readable": "W = (P * S_avg * U_factor) / C_active",
    }
    if position == 0:
        return {**base, "estimated_wait_mins": 0.0, "sensitivity_counter_delta": 0.0,
                "calculation_steps": "Next in line: 0 people ahead -> 0.0 mins."}

    wait = max(1.0, round(float(_W(position, avg_time, counters, u_val)), 1))
    return {
        **base,
        "estimated_wait_mins": wait,
        "sensitivity_counter_delta": round(float(_dW_dC(position, avg_time, counters, u_val)), 2),
        "calculation_steps": f"({position} ahead * {avg_time}m avg * {u_val} factor) / {counters} active counters = {wait} mins",
    }


def get_symbolic_meta() -> Dict[str, Any]:
    return {
        "formula_expression": str(W_symbolic),
        "latex": _FORMULA_LATEX,
        "derivative_active_counters_latex": sp.latex(dW_dC),
        "derivative_service_time_latex": sp.latex(dW_dS),
        "variables": {
            "P": "Effective queue position ahead in priority order",
            "S_avg": "Average service time (minutes)",
            "C_active": "Currently active counters able to serve this service",
            "U_factor": "Priority attenuation (0.4 Emergency, 0.7 VIP, 0.85 Senior, 1.0 Normal)",
        },
    }
