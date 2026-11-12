from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import hash_password, require_role, verify_password
from ..config import settings
from ..database import get_db
from ..models import Counter, Service, Token, User, utcnow
from ..schemas import (AccountDeleteRequest, CustomerPriorityRequest, CustomerProfileUpdateRequest,
                       CustomerQueueJoinRequest, PasswordChangeRequest)
from ..services import realtime
from ..services.queue import (add_log, age_from_dob, create_token, derived_priority, get_ordered_waiting_queue, iso,
                              refresh_queue_estimates)
from .auth import user_out

router = APIRouter(prefix="/api/customer", tags=["customer"])
customer_only = require_role(["CUSTOMER"])
ACTIVE = ("WAITING", "CALLED")


def _own_ticket(db: Session, user: User, token_id: int) -> Token:
    ticket = db.query(Token).filter(Token.id == token_id, Token.customer_user_id == user.id).first()
    if not ticket:
        raise HTTPException(404, "Queue ticket not found.")
    return ticket


@router.put("/profile")
def update_profile(req: CustomerProfileUpdateRequest, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    if req.date_of_birth > date.today() or age_from_dob(req.date_of_birth.isoformat()) > 120:
        raise HTTPException(400, "Please enter a valid date of birth.")
    if db.query(User).filter(User.phone == req.phone, User.id != user.id).first():
        raise HTTPException(409, "That phone number is already linked to another account.")
    user.full_name, user.phone, user.date_of_birth = req.full_name.strip(), req.phone, req.date_of_birth.isoformat()
    senior = derived_priority(user.date_of_birth) == "SENIOR_CITIZEN"
    for t in db.query(Token).filter(Token.customer_user_id == user.id, Token.status.in_(ACTIVE)).all():
        t.customer_name, t.phone = user.full_name, user.phone
        if t.status == "WAITING":
            if senior and t.priority_level in ("NORMAL", "VIP"):
                t.priority_level = "SENIOR_CITIZEN"
            elif not senior and t.priority_level == "SENIOR_CITIZEN":
                t.priority_level = "NORMAL"
    db.commit()
    refresh_queue_estimates(db)
    return {"success": True, "user": user_out(user)}


@router.post("/password")
def change_password(req: PasswordChangeRequest, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    if not verify_password(req.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect.")
    user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"success": True, "message": "Password updated."}


@router.delete("/account")
def delete_account(req: AccountDeleteRequest, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    if not verify_password(req.password, user.password_hash):
        raise HTTPException(400, "Password is incorrect. Account was not deleted.")
    for t in db.query(Token).filter(Token.customer_user_id == user.id).all():
        if t.status in ACTIVE:
            t.status = "CANCELLED"
            for c in db.query(Counter).filter(Counter.active_token_id == t.id).all():
                c.active_token_id = None
            add_log(db, "CANCELLED", t, details="Customer account deleted")
        t.customer_user_id = None
        t.customer_name = "Deleted customer"
        t.phone = ""
    db.delete(user)
    db.commit()
    refresh_queue_estimates(db)
    realtime.publish("QUEUE_CHANGED")
    return {"success": True, "message": "Account deleted."}


@router.get("/queue")
def my_queue(user: User = Depends(customer_only), db: Session = Depends(get_db)):
    tickets = db.query(Token).filter(Token.customer_user_id == user.id).order_by(Token.created_at.desc()).limit(30).all()
    orders = {}
    out = []
    for t in tickets:
        if t.status == "WAITING" and t.service_id not in orders:
            orders[t.service_id] = [x.id for x in get_ordered_waiting_queue(db, t.service_id)]
        pos = orders.get(t.service_id, []).index(t.id) + 1 if t.status == "WAITING" and t.id in orders.get(t.service_id, []) else None
        out.append({
            "id": t.id, "token_number": t.token_number, "service_id": t.service_id,
            "service_name": t.service.name if t.service else "Service", "priority_level": t.priority_level, "status": t.status,
            "estimated_wait_mins": t.estimated_wait_mins if t.status == "WAITING" else 0, "position": pos,
            "counter_number": t.counter.counter_number if t.counter else None,
            "created_at": iso(t.created_at), "called_at": iso(t.called_at),
        })
    return out


@router.post("/queue/join", status_code=201)
def join_queue(req: CustomerQueueJoinRequest, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    service = db.get(Service, req.service_id)
    if not service:
        raise HTTPException(404, "Service not found.")
    active = db.query(Token).filter(Token.customer_user_id == user.id, Token.status.in_(ACTIVE)).first()
    if active:
        raise HTTPException(409, f"You already have an active token: {active.token_number}.")
    priority = derived_priority(user.date_of_birth)
    token = create_token(db, service, customer_name=user.full_name or user.username, phone=user.phone, priority=priority,
                         customer_user_id=user.id, log_detail="Customer account joined the queue")
    refresh_queue_estimates(db, service.id)
    realtime.publish("TOKEN_GENERATED", token_number=token.token_number, service_name=service.name)
    return {"success": True, "token_number": token.token_number, "priority_level": priority, "senior_citizen": priority == "SENIOR_CITIZEN"}


@router.post("/queue/{token_id}/priority")
def set_priority(token_id: int, req: CustomerPriorityRequest, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    ticket = _own_ticket(db, user, token_id)
    if ticket.status != "WAITING":
        raise HTTPException(400, "Priority can only be changed while waiting.")
    if req.priority_level not in ("NORMAL", "VIP") or (req.priority_level == "VIP" and not settings.allow_customer_vip):
        raise HTTPException(400, "You can choose Normal priority" + (" or VIP" if settings.allow_customer_vip else "") +
                            ". Senior status comes from your date of birth and Emergency is assigned by staff.")
    ticket.priority_level = "SENIOR_CITIZEN" if derived_priority(user.date_of_birth) == "SENIOR_CITIZEN" else req.priority_level
    add_log(db, "PRIORITY_CHANGED", ticket, details=f"Customer priority set to {ticket.priority_level}")
    db.commit()
    refresh_queue_estimates(db, ticket.service_id)
    realtime.publish("QUEUE_CHANGED")
    return {"success": True, "priority_level": ticket.priority_level}


@router.post("/queue/{token_id}/exit")
def exit_queue(token_id: int, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    ticket = _own_ticket(db, user, token_id)
    if ticket.status != "WAITING":
        raise HTTPException(400, "Only a waiting ticket can be exited.")
    ticket.status = "CANCELLED"
    add_log(db, "CANCELLED", ticket, details="Customer exited queue")
    db.commit()
    refresh_queue_estimates(db, ticket.service_id)
    realtime.publish("QUEUE_CHANGED")
    return {"success": True, "message": "You have left the queue."}


@router.post("/queue/{token_id}/move-back")
def move_back(token_id: int, user: User = Depends(customer_only), db: Session = Depends(get_db)):
    ticket = _own_ticket(db, user, token_id)
    if ticket.status != "WAITING":
        raise HTTPException(400, "Only a waiting ticket can be moved back.")
    ticket.created_at = utcnow()
    if derived_priority(user.date_of_birth) == "SENIOR_CITIZEN":
        ticket.priority_level = "SENIOR_CITIZEN"
    elif ticket.priority_level == "SENIOR_CITIZEN":
        ticket.priority_level = "NORMAL"
    add_log(db, "MOVED_BACK", ticket, details=f"Customer moved to back of queue; priority {ticket.priority_level}")
    db.commit()
    refresh_queue_estimates(db, ticket.service_id)
    realtime.publish("QUEUE_CHANGED")
    return {"success": True, "message": "You have been moved back in the queue. Your priority is now " + ticket.priority_level.replace("_", " ").title() + "."}
