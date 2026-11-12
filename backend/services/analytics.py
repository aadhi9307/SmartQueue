"""Operational analytics in plain Python (no pandas: keeps the serverless bundle small)."""
from collections import defaultdict
from typing import Any, Dict

from sqlalchemy.orm import Session

from ..models import Counter, Service, Token, utcnow
from .queue import local_tz, start_of_today_utc

from datetime import timezone


def _wait_minutes(t: Token, now) -> float | None:
    """Real waiting time: arrival -> call (or -> now while still waiting). Cancelled tickets are excluded."""
    if t.called_at and t.created_at:
        return max(0.0, (t.called_at - t.created_at).total_seconds() / 60.0)
    if t.status == "WAITING" and t.created_at:
        return max(0.0, (now - t.created_at).total_seconds() / 60.0)
    return None


def _avg(values) -> float:
    values = list(values)
    return round(sum(values) / len(values), 1) if values else 0.0


def generate_analytics_summary(db: Session) -> Dict[str, Any]:
    now = utcnow()
    since = start_of_today_utc()
    tokens = db.query(Token).filter(Token.created_at >= since).all()
    services = {s.id: s for s in db.query(Service).all()}
    counters = db.query(Counter).all()

    status_counts: Dict[str, int] = defaultdict(int)
    for t in tokens:
        status_counts[t.status] += 1
    waiting_count = status_counts["WAITING"]

    waits = {t.id: _wait_minutes(t, now) for t in tokens}
    avg_wait = _avg(w for w in waits.values() if w is not None)

    by_priority: Dict[str, list] = defaultdict(list)
    for t in tokens:
        by_priority[t.priority_level].append(t)
    priority_breakdown = {p: {"count": len(ts), "avg_wait_mins": _avg(waits[t.id] for t in ts if waits[t.id] is not None)} for p, ts in by_priority.items()}

    by_service: Dict[int, list] = defaultdict(list)
    for t in tokens:
        by_service[t.service_id].append(t)
    bottlenecks = []
    for sid, ts in by_service.items():
        waiting = sum(1 for t in ts if t.status == "WAITING")
        bottlenecks.append({
            "service_id": sid, "service_name": services[sid].name if sid in services else "Unknown",
            "total_tokens": len(ts), "waiting": waiting, "served": sum(1 for t in ts if t.status == "SERVED"),
            "avg_wait_mins": _avg(waits[t.id] for t in ts if waits[t.id] is not None),
            "status": "CRITICAL" if waiting >= 8 else ("MODERATE" if waiting >= 4 else "OPTIMAL"),
        })

    counter_stats = []
    for c in counters:
        mine = [t for t in tokens if t.counter_id == c.id]
        active = c.active_token.token_number if c.active_token and c.active_token.status == "CALLED" else None
        counter_stats.append({
            "counter_id": c.id, "counter_number": c.counter_number, "name": c.name, "status": c.status,
            "operator_name": c.assigned_staff.username if c.assigned_staff else (c.operator_name or "Unassigned"),
            "active_token_number": active, "served_count": sum(1 for t in mine if t.status == "SERVED"),
        })

    tz = local_tz()
    hourly: Dict[str, Dict[str, int]] = defaultdict(lambda: {"created": 0, "served": 0})
    for t in tokens:
        label = t.created_at.replace(tzinfo=timezone.utc).astimezone(tz).strftime("%H:00")
        hourly[label]["created"] += 1
        hourly[label]["served"] += 1 if t.status == "SERVED" else 0

    penalty = min(50, waiting_count * 2.5) + min(30, max(0, avg_wait - 5) * 2)
    return {
        "scope": "today", "total_tokens": len(tokens), "waiting_count": waiting_count,
        "called_count": status_counts["CALLED"], "served_count": status_counts["SERVED"],
        "skipped_count": status_counts["SKIPPED"], "cancelled_count": status_counts["CANCELLED"],
        "avg_wait_mins": avg_wait, "priority_breakdown": priority_breakdown, "service_bottlenecks": bottlenecks,
        "counter_efficiency": counter_stats,
        "throughput_hourly": [{"hour": h, **v} for h, v in sorted(hourly.items())],
        "health_score": max(20, int(100 - penalty)) if tokens else 100,
    }
