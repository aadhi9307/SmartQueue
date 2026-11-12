from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_role
from ..database import get_db
from ..models import Counter, Service, Token, User, utcnow
from ..schemas import CounterActionRequest, CounterCallNextRequest, CounterStatusRequest
from ..services import realtime
from ..services.queue import add_log, get_ordered_waiting_queue, iso, refresh_queue_estimates
from ..services.sms import send_sms_notification

router = APIRouter(tags=["staff"])
staff_or_admin = require_role(["STAFF", "ADMIN"])


def get_operable_counter(db: Session, counter_id: int, user: User) -> Counter:
    counter = db.get(Counter, counter_id)
    if not counter:
        raise HTTPException(404, "Counter not found")
    # Staff may run unassigned counters or their own; admins may run any.
    if user.role != "ADMIN" and counter.assigned_staff_id not in (None, user.id):
        raise HTTPException(403, "This counter is assigned to another staff member.")
    return counter


@router.post("/api/counter/call-next")
def call_next(req: CounterCallNextRequest, user: User = Depends(staff_or_admin), db: Session = Depends(get_db)):
    counter = get_operable_counter(db, req.counter_id, user)
    if counter.status != "ACTIVE":
        raise HTTPException(400, "Cannot call the next ticket while the counter is paused or offline.")

    if counter.active_token_id:
        prev = db.get(Token, counter.active_token_id)
        if prev and prev.status == "CALLED":
            prev.status, prev.served_at, prev.completed_at = "SERVED", utcnow(), utcnow()
            add_log(db, "COMPLETED", prev, counter, f"Served by {user.username}")
        counter.active_token_id = None

    # Only this counter's own service queue (or everything for a multi-service desk).
    chosen = None
    for cand in get_ordered_waiting_queue(db, counter.service_id):
        # Atomic claim: if another counter took it a millisecond ago, rowcount is 0 and we try the next one.
        claimed = db.query(Token).filter(Token.id == cand.id, Token.status == "WAITING").update(
            {"status": "CALLED", "called_at": utcnow(), "counter_id": counter.id}, synchronize_session=False)
        if claimed:
            chosen = cand
            break

    if not chosen:
        db.commit()
        realtime.publish("QUEUE_EMPTY", counter_id=counter.id)
        return {"success": True, "message": "No waiting tokens in line", "token": None}

    db.refresh(chosen)
    counter.active_token_id = chosen.id
    add_log(db, "CALLED", chosen, counter, f"Counter {counter.counter_number:02d} called {chosen.token_number} ({user.username})")
    db.commit()
    refresh_queue_estimates(db)

    sms = None
    if chosen.phone:
        sms = send_sms_notification(chosen.phone, f"SmartQueue: token {chosen.token_number}, please go to Counter {counter.counter_number:02d} ({counter.name}).",
                                    chosen.token_number, "TOKEN_CALLED")
    realtime.publish("TOKEN_CALLED", counter_number=counter.counter_number, token_number=chosen.token_number,
                     service_name=chosen.service.name if chosen.service else "Desk")
    return {"success": True, "counter_id": counter.id, "counter_number": counter.counter_number,
            "token": {"id": chosen.id, "token_number": chosen.token_number, "customer_name": chosen.customer_name, "phone": chosen.phone,
                      "priority_level": chosen.priority_level, "status": chosen.status, "called_at": iso(chosen.called_at)},
            "sms_notification": sms}


@router.post("/api/counter/action")
def counter_action(req: CounterActionRequest, user: User = Depends(staff_or_admin), db: Session = Depends(get_db)):
    counter = get_operable_counter(db, req.counter_id, user)
    token = db.get(Token, counter.active_token_id) if counter.active_token_id else None
    if not token or token.status != "CALLED":
        raise HTTPException(400, "There is no active ticket at this counter.")
    now = utcnow()

    if req.action == "COMPLETED":
        token.status, token.served_at, token.completed_at = "SERVED", now, now
        if req.notes:
            token.notes = req.notes
        add_log(db, "COMPLETED", token, counter, req.notes or f"Completed by {user.username}")
    elif req.action == "SKIPPED":
        token.status, token.completed_at = "SKIPPED", now
        add_log(db, "SKIPPED", token, counter, req.notes or f"No-show / skipped by {user.username}")
    elif req.action == "HOLD":
        # Put back in line behind others of the same tier so the same desk doesn't instantly re-call it.
        token.status, token.counter_id, token.called_at, token.created_at = "WAITING", None, None, now
        add_log(db, "HOLD", token, counter, f"Held by {user.username}")
    elif req.action == "TRANSFERRED":
        if not req.transfer_service_id:
            raise HTTPException(400, "A target service is required to transfer a ticket.")
        target = db.get(Service, req.transfer_service_id)
        if not target:
            raise HTTPException(404, "Target service not found.")
        if target.id == token.service_id:
            raise HTTPException(400, "The ticket is already in that service.")
        token.service_id, token.status, token.counter_id, token.called_at = target.id, "WAITING", None, None
        add_log(db, "TRANSFERRED", token, counter, f"Transferred from counter {counter.counter_number:02d} to {target.name} by {user.username}")

    counter.active_token_id = None
    db.commit()
    refresh_queue_estimates(db)
    realtime.publish("COUNTER_ACTION", counter_id=counter.id, action=req.action)
    return {"success": True, "counter_id": counter.id, "action": req.action}


@router.post("/api/counters/{counter_id}/status")
def set_counter_status(counter_id: int, req: CounterStatusRequest, user: User = Depends(staff_or_admin), db: Session = Depends(get_db)):
    counter = get_operable_counter(db, counter_id, user)
    counter.status = req.status
    db.commit()
    refresh_queue_estimates(db)
    realtime.publish("COUNTER_STATUS_CHANGED", counter_id=counter.id, status=counter.status)
    return {"success": True, "counter_id": counter.id, "status": counter.status}
