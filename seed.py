import os
from sqlalchemy.orm import Session

from .auth import hash_password
from .models import Counter, Service, User
from .services.queue import refresh_queue_estimates


def seed_services_and_counters(db: Session) -> None:
    """Default configuration only - no fake customers, tickets or staff."""
    if db.query(Service).count():
        return
    s = [Service(name="General Inquiry", prefix="A", avg_service_time_mins=4.0, description="General queries, forms, and general ticketing", icon="HelpCircle"),
         Service(name="Financial Desk", prefix="B", avg_service_time_mins=6.5, description="Tuition, cashier, payroll, and student billing", icon="DollarSign"),
         Service(name="Academic Affairs", prefix="U", avg_service_time_mins=8.0, description="Transcripts, registration, and expedited advising", icon="AlertTriangle"),
         Service(name="VIP Services", prefix="V", avg_service_time_mins=5.0, description="Executive visitors, international delegates, and priority relations", icon="Crown")]
    db.add_all(s)
    db.flush()
    db.add_all([Counter(counter_number=1, name="General Inquiry 01", service_id=s[0].id, operator_name="Unassigned"),
                Counter(counter_number=2, name="Financial Desk 01", service_id=s[1].id, operator_name="Unassigned"),
                Counter(counter_number=3, name="Financial Desk 02", service_id=s[1].id, operator_name="Unassigned"),
                Counter(counter_number=4, name="Academic Affairs 01", service_id=s[2].id, operator_name="Unassigned"),
                Counter(counter_number=5, name="VIP Services 01", service_id=s[3].id, operator_name="Unassigned")])
    db.commit()


def bootstrap_admin(db: Session) -> None:
    """Create the first administrator from environment variables (only if no admin exists)."""
    username, email, password = (os.getenv("SMARTQUEUE_ADMIN_USERNAME", "").strip(), os.getenv("SMARTQUEUE_ADMIN_EMAIL", "").strip().lower(),
                                 os.getenv("SMARTQUEUE_ADMIN_PASSWORD", ""))
    if not (username and email and password) or db.query(User).filter(User.role == "ADMIN").first():
        return
    if len(password) < 12:
        raise RuntimeError("SMARTQUEUE_ADMIN_PASSWORD must be at least 12 characters.")
    db.add(User(username=username, email=email, full_name=username, password_hash=hash_password(password), role="ADMIN"))
    db.commit()


def run_startup_seed(db: Session) -> None:
    seed_services_and_counters(db)
    bootstrap_admin(db)
    refresh_queue_estimates(db)
