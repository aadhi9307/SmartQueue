"""Queue domain logic: priority ordering, wait estimates, token numbering, privacy helpers."""
import re
from datetime import date, datetime, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Counter, QueueLog, Service, Token, utcnow
from .wait_time import calculate_symbolic_wait_time

BASE_PRIORITY_SCORES = {"EMERGENCY": 1000.0, "VIP": 400.0, "SENIOR_CITIZEN": 300.0, "NORMAL": 100.0}
AGING_RATE_PER_MIN = 6.0          # points/minute so low tiers are never starved
MAX_WAIT_THRESHOLD_MINS = 15.0
STARVATION_ESCALATION_BONUS = 80.0
SENIOR_AGE = 60


# ------------------------------------------------------------ formatting
def iso(dt: Optional[datetime]) -> Optional[str]:
    """Timestamps are stored as naive UTC; emit an explicit 'Z' so browsers don't read them as local time."""
    return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z") if dt else None


def mask_name(name: Optional[str]) -> str:
    parts = (name or "").split()
    if not parts:
        return "Guest"
    return parts[0] if len(parts) == 1 else f"{parts[0]} {parts[-1][0]}."


def mask_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return phone
    return "•" * max(0, len(phone) - 2) + phone[-2:]


def local_tz() -> ZoneInfo:
    try:
        return ZoneInfo(settings.timezone)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def start_of_today_utc() -> datetime:
    tz = local_tz()
    start_local = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    return start_local.astimezone(timezone.utc).replace(tzinfo=None)


# ------------------------------------------------------------------ age
def age_from_dob(dob: Optional[str]) -> int:
    try:
        d = date.fromisoformat(dob) if dob else None
    except ValueError:
        d = None
    if not d:
        return 0
    today = date.today()
    return today.year - d.year - ((today.month, today.day) < (d.month, d.day))


def derived_priority(dob: Optional[str]) -> str:
    return "SENIOR_CITIZEN" if age_from_dob(dob) >= SENIOR_AGE else "NORMAL"


# ------------------------------------------------------------- priority
def compute_effective_priority(token: Token, now: Optional[datetime] = None) -> float:
    now = now or utcnow()
    base = BASE_PRIORITY_SCORES.get((token.priority_level or "NORMAL").upper(), 100.0)
    elapsed = max(0.0, (now - token.created_at).total_seconds() / 60.0) if token.created_at else 0.0
    return base + elapsed * AGING_RATE_PER_MIN + (STARVATION_ESCALATION_BONUS if elapsed >= MAX_WAIT_THRESHOLD_MINS else 0.0)


def get_ordered_waiting_queue(db: Session, service_id: Optional[int] = None) -> List[Token]:
    q = db.query(Token).filter(Token.status == "WAITING")
    if service_id is not None:
        q = q.filter(Token.service_id == service_id)
    now = utcnow()
    return sorted(q.all(), key=lambda t: (-compute_effective_priority(t, now), t.created_at or now, t.id))


def active_counter_count(db: Session, service_id: int) -> int:
    n = db.query(Counter).filter(Counter.status == "ACTIVE", or_(Counter.service_id == service_id, Counter.service_id.is_(None))).count()
    return max(1, n)


def estimate_for_position(db: Session, service: Service, position_ahead: int, priority: str) -> dict:
    return calculate_symbolic_wait_time(position_ahead, service.avg_service_time_mins, active_counter_count(db, service.id), priority)


def refresh_queue_estimates(db: Session, service_id: Optional[int] = None) -> None:
    """Persist fresh estimates for waiting tokens (single commit)."""
    services = db.query(Service)
    if service_id is not None:
        services = services.filter(Service.id == service_id)
    for svc in services.all():
        counters = active_counter_count(db, svc.id)
        for idx, tok in enumerate(get_ordered_waiting_queue(db, svc.id)):
            tok.estimated_wait_mins = calculate_symbolic_wait_time(idx, svc.avg_service_time_mins, counters, tok.priority_level)["estimated_wait_mins"]
    db.commit()


# ------------------------------------------------------------ numbering
def _next_number(db: Session, service: Service, skip: int = 0) -> str:
    prefix = service.prefix.upper()
    best = 100
    for (num,) in db.query(Token.token_number).filter(Token.token_number.like(f"{prefix}-%")).all():
        m = re.fullmatch(rf"{re.escape(prefix)}-(\d+)", num)
        if m:
            best = max(best, int(m.group(1)))
    return f"{prefix}-{best + 1 + skip}"


def create_token(db: Session, service: Service, *, customer_name: str, phone: Optional[str], priority: str,
                 customer_user_id: Optional[int] = None, log_detail: str = "") -> Token:
    """Insert a token with a unique number. The UNIQUE constraint is the source of truth, so a
    concurrent request that grabbed the same number simply makes us retry with the next one."""
    for attempt in range(8):
        token = Token(token_number=_next_number(db, service, skip=attempt), service_id=service.id, customer_user_id=customer_user_id,
                      customer_name=customer_name, phone=phone or "", priority_level=priority, status="WAITING", created_at=utcnow())
        db.add(token)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            continue
        db.add(QueueLog(token_id=token.id, action="GENERATED", details=(log_detail or f"Token {token.token_number} generated")[:255]))
        db.commit()
        db.refresh(token)
        return token
    raise RuntimeError("Could not allocate a unique token number")


def add_log(db: Session, action: str, token: Optional[Token] = None, counter: Optional[Counter] = None, details: str = "") -> None:
    db.add(QueueLog(token_id=token.id if token else None, counter_id=counter.id if counter else None, action=action, details=details[:255]))


def position_of(db: Session, token: Token) -> Optional[int]:
    for i, t in enumerate(get_ordered_waiting_queue(db, token.service_id)):
        if t.id == token.id:
            return i
    return None


def count_today(db: Session, status: str) -> int:
    return db.query(func.count(Token.id)).filter(Token.status == status, Token.created_at >= start_of_today_utc()).scalar() or 0
