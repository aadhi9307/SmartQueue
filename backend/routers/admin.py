from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import hash_password, require_role
from ..database import get_db
from ..models import Counter, QueueLog, Service, Token, User
from ..schemas import AssignStaffRequest, CounterRequest, ServiceRequest, StaffCreateRequest
from ..services import realtime
from ..services.analytics import generate_analytics_summary
from ..services.queue import iso
from ..services.sms import get_notification_logs
from ..services.wait_time import get_symbolic_meta

router = APIRouter(tags=["admin"])
admin_only = require_role(["ADMIN"])
staff_or_admin = require_role(["STAFF", "ADMIN"])


def svc_out(s: Service) -> dict:
    return {"id": s.id, "name": s.name, "prefix": s.prefix, "avg_service_time_mins": s.avg_service_time_mins, "description": s.description, "icon": s.icon}


def counter_out(c: Counter) -> dict:
    return {"id": c.id, "counter_number": c.counter_number, "name": c.name, "service_id": c.service_id,
            "service_name": c.service.name if c.service else "Unassigned", "status": c.status,
            "assigned_staff_id": c.assigned_staff_id, "assigned_staff_name": c.assigned_staff.username if c.assigned_staff else None}


def _check_prefix_free(db: Session, prefix: str, exclude_id: int | None = None) -> None:
    q = db.query(Service).filter(func.upper(Service.prefix) == prefix.upper())
    if exclude_id:
        q = q.filter(Service.id != exclude_id)
    if q.first():
        raise HTTPException(409, f"Prefix '{prefix.upper()}' is already used by another service.")


# ---------------------------------------------------------------- services
@router.get("/api/admin/services")
def list_services(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    return [svc_out(s) for s in db.query(Service).order_by(Service.id).all()]


@router.post("/api/admin/services", status_code=201)
def create_service(req: ServiceRequest, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    _check_prefix_free(db, req.prefix)
    svc = Service(name=req.name.strip(), prefix=req.prefix.upper(), avg_service_time_mins=req.avg_service_time_mins,
                  description=req.description, icon=req.icon or "HelpCircle")
    db.add(svc)
    db.commit()
    db.refresh(svc)
    realtime.publish("QUEUE_CHANGED")
    return svc_out(svc)


@router.put("/api/admin/services/{service_id}")
def update_service(service_id: int, req: ServiceRequest, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    svc = db.get(Service, service_id)
    if not svc:
        raise HTTPException(404, "Service not found")
    _check_prefix_free(db, req.prefix, service_id)
    svc.name, svc.prefix, svc.avg_service_time_mins = req.name.strip(), req.prefix.upper(), req.avg_service_time_mins
    svc.description, svc.icon = req.description, req.icon or svc.icon
    db.commit()
    realtime.publish("QUEUE_CHANGED")
    return svc_out(svc)


@router.delete("/api/admin/services/{service_id}")
def delete_service(service_id: int, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    svc = db.get(Service, service_id)
    if not svc:
        raise HTTPException(404, "Service not found")
    if db.query(Token).filter(Token.service_id == service_id).first():
        raise HTTPException(409, "This service has ticket history and cannot be deleted.")
    if db.query(Counter).filter(Counter.service_id == service_id).first() or db.query(User).filter(User.department_id == service_id).first():
        raise HTTPException(409, "Reassign this service's counters and staff before deleting it.")
    db.delete(svc)
    db.commit()
    return {"success": True, "message": "Service deleted"}


# ---------------------------------------------------------------- counters
@router.get("/api/admin/counters")
def list_counters(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    return [counter_out(c) for c in db.query(Counter).order_by(Counter.counter_number).all()]


def _validate_counter_refs(db: Session, req: CounterRequest) -> None:
    if req.service_id is not None and not db.get(Service, req.service_id):
        raise HTTPException(404, "Service not found")
    if req.assigned_staff_id is not None and not db.query(User).filter(User.id == req.assigned_staff_id, User.role.in_(["STAFF", "ADMIN"])).first():
        raise HTTPException(404, "Staff account not found")


@router.post("/api/admin/counters", status_code=201)
def create_counter(req: CounterRequest, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    _validate_counter_refs(db, req)
    if db.query(Counter).filter(Counter.counter_number == req.counter_number).first():
        raise HTTPException(409, f"Counter {req.counter_number} already exists.")
    c = Counter(counter_number=req.counter_number, name=req.name.strip(), service_id=req.service_id,
                assigned_staff_id=req.assigned_staff_id, status="ACTIVE", operator_name="Unassigned")
    db.add(c)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"Counter {req.counter_number} already exists.")
    db.refresh(c)
    realtime.publish("QUEUE_CHANGED")
    return counter_out(c)


@router.put("/api/admin/counters/{counter_id}")
def update_counter(counter_id: int, req: CounterRequest, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    c = db.get(Counter, counter_id)
    if not c:
        raise HTTPException(404, "Counter not found")
    _validate_counter_refs(db, req)
    if db.query(Counter).filter(Counter.counter_number == req.counter_number, Counter.id != counter_id).first():
        raise HTTPException(409, f"Counter {req.counter_number} already exists.")

    # A staff member may be assigned to only one counter at a time. If the
    # edited counter takes a staff member from elsewhere, release the old
    # counter first so it is immediately available for another operator.
    if req.assigned_staff_id is not None:
        db.query(Counter).filter(
            Counter.assigned_staff_id == req.assigned_staff_id,
            Counter.id != counter_id,
        ).update({"assigned_staff_id": None, "operator_name": "Unassigned"}, synchronize_session=False)

    c.counter_number, c.name, c.service_id, c.assigned_staff_id = req.counter_number, req.name.strip(), req.service_id, req.assigned_staff_id
    assigned = db.get(User, req.assigned_staff_id) if req.assigned_staff_id is not None else None
    c.operator_name = assigned.username if assigned else "Unassigned"
    db.commit()
    db.refresh(c)
    realtime.publish("QUEUE_CHANGED")
    return counter_out(c)


@router.delete("/api/admin/counters/{counter_id}")
def delete_counter(counter_id: int, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    c = db.get(Counter, counter_id)
    if not c:
        raise HTTPException(404, "Counter not found")
    if c.active_token and c.active_token.status == "CALLED":
        raise HTTPException(409, "Finish or release the ticket currently at this counter first.")
    # Keep history, drop the reference.
    db.query(Token).filter(Token.counter_id == c.id).update({"counter_id": None})
    db.query(QueueLog).filter(QueueLog.counter_id == c.id).update({"counter_id": None})
    c.active_token_id = None
    db.flush()
    db.delete(c)
    db.commit()
    realtime.publish("QUEUE_CHANGED")
    return {"success": True}


@router.post("/api/admin/counters/{counter_id}/assign-staff")
def assign_staff(counter_id: int, req: AssignStaffRequest, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    c = db.get(Counter, counter_id)
    if not c:
        raise HTTPException(404, "Counter not found")
    staff = db.query(User).filter(User.id == req.staff_id, User.role == "STAFF").first()
    if not staff:
        raise HTTPException(404, "Staff account not found")
    # Enforce one active counter per staff member. Reassigning the same
    # person moves them atomically: the previous counter becomes unassigned.
    previous_counter_ids = [row.id for row in db.query(Counter.id).filter(
        Counter.assigned_staff_id == staff.id,
        Counter.id != c.id,
    ).all()]
    db.query(Counter).filter(
        Counter.assigned_staff_id == staff.id,
        Counter.id != c.id,
    ).update({"assigned_staff_id": None, "operator_name": "Unassigned"}, synchronize_session=False)
    c.assigned_staff_id, c.operator_name = staff.id, staff.username
    db.commit()
    db.refresh(c)
    realtime.publish("QUEUE_CHANGED")
    return {"success": True, "counter_id": c.id, "assigned_staff": staff.username,
            "released_counter_ids": previous_counter_ids}


# ------------------------------------------------------------------- staff
def staff_out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "email": u.email, "full_name": u.full_name or u.username, "phone": u.phone, "role": u.role, "department_id": u.department_id,
            "department_name": u.department.name if u.department else "Unassigned"}


@router.get("/api/admin/staff")
def list_staff(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    return [staff_out(u) for u in db.query(User).filter(User.role == "STAFF").order_by(User.id).all()]


@router.post("/api/admin/staff", status_code=201)
def create_staff(req: StaffCreateRequest, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    username, email = req.username.strip(), req.email.strip().lower()
    if req.role != "STAFF":
        raise HTTPException(403, "This form can create staff accounts only.")
    if db.query(User).filter((User.username == username) | (User.email == email)).first():
        raise HTTPException(409, "Username or email already registered")
    if req.department_id is not None and not db.get(Service, req.department_id):
        raise HTTPException(404, "Department not found")
    u = User(username=username, email=email, full_name=(req.full_name or username).strip(), phone=req.phone,
             password_hash=hash_password(req.password), role="STAFF", department_id=req.department_id)
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"success": True, "id": u.id, "username": u.username, "full_name": u.full_name, "role": "STAFF"}


@router.delete("/api/admin/staff/{user_id}")
def delete_staff(user_id: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id, User.role.in_(["STAFF", "ADMIN"])).first()
    if not u:
        raise HTTPException(404, "Staff account not found")
    if u.id == me.id:
        raise HTTPException(400, "You cannot delete your own account.")
    if u.role == "ADMIN" and db.query(User).filter(User.role == "ADMIN").count() <= 1:
        raise HTTPException(400, "You cannot delete the last administrator.")
    db.query(Counter).filter(Counter.assigned_staff_id == u.id).update({"assigned_staff_id": None, "operator_name": "Unassigned"})
    db.delete(u)
    db.commit()
    return {"success": True}


# --------------------------------------------------------- audit & analytics
@router.get("/api/admin/audit-logs")
def audit_logs(limit: int = 50, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    limit = max(1, min(limit, 500))
    logs = db.query(QueueLog).order_by(QueueLog.timestamp.desc(), QueueLog.id.desc()).limit(limit).all()
    return [{"id": l.id, "token_id": l.token_id, "token_number": l.token.token_number if l.token else None, "counter_id": l.counter_id,
             "counter_number": l.counter.counter_number if l.counter else None, "action": l.action, "timestamp": iso(l.timestamp),
             "details": l.details} for l in logs]


@router.get("/api/analytics/summary")
def analytics(_: User = Depends(staff_or_admin), db: Session = Depends(get_db)):
    return generate_analytics_summary(db)


@router.get("/api/analytics/sympy-formula")
def sympy_formula(_: User = Depends(staff_or_admin)):
    return get_symbolic_meta()


@router.get("/api/notifications/logs")
def notification_logs(_: User = Depends(admin_only)):
    return get_notification_logs()
