from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_optional_user
from ..config import settings
from ..database import get_db
from ..models import Counter, Service, Token, User, utcnow
from ..schemas import TokenGenerateRequest
from ..services import realtime
from ..services.queue import (count_today, create_token, estimate_for_position, get_ordered_waiting_queue, iso, mask_name,
                              mask_phone, position_of, refresh_queue_estimates)
from ..services.sms import send_sms_notification

router = APIRouter(tags=["public"])


def is_staff(user: Optional[User]) -> bool:
    return bool(user and user.role in ("STAFF", "ADMIN"))


@router.websocket("/ws/queue")
async def websocket_queue(ws: WebSocket):
    await realtime.manager.connect(ws)
    try:
        while True:
            if (await ws.receive_text()) == "ping":
                await ws.send_text("pong")
    except (WebSocketDisconnect, Exception):
        realtime.manager.disconnect(ws)


@router.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.query(func.count(Service.id)).scalar()
    return {"status": "ok"}


@router.get("/api/services")
def list_services(db: Session = Depends(get_db)):
    waiting = dict(db.query(Token.service_id, func.count(Token.id)).filter(Token.status == "WAITING").group_by(Token.service_id).all())
    return [{"id": s.id, "name": s.name, "prefix": s.prefix, "avg_service_time_mins": s.avg_service_time_mins,
             "description": s.description, "icon": s.icon, "waiting_count": waiting.get(s.id, 0)}
            for s in db.query(Service).order_by(Service.id).all()]


@router.get("/api/counters")
def list_counters(db: Session = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    staff = is_staff(user)
    out = []
    for c in db.query(Counter).order_by(Counter.counter_number).all():
        t = c.active_token
        active = None
        if t and t.status == "CALLED":
            active = {"id": t.id, "token_number": t.token_number, "customer_name": t.customer_name if staff else mask_name(t.customer_name),
                      "phone": t.phone if staff else None, "priority_level": t.priority_level, "called_at": iso(t.called_at),
                      "notes": t.notes if staff else None}
        out.append({"id": c.id, "counter_number": c.counter_number, "name": c.name, "service_id": c.service_id,
                    "service_name": c.service.name if c.service else "Multi-Service Desk", "status": c.status,
                    "assigned_staff_id": c.assigned_staff_id,
                    "operator_name": c.assigned_staff.username if c.assigned_staff else (c.operator_name or "Unassigned"),
                    "active_token": active})
    return out


@router.post("/api/tokens/generate", status_code=201)
def generate_token(req: TokenGenerateRequest, db: Session = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    # Priority tiers are an entitlement: anonymous kiosk visitors get a standard ticket;
    # only signed-in staff can issue Senior / VIP / Emergency tickets on someone's behalf.
    if req.priority_level != "NORMAL" and not is_staff(user):
        raise HTTPException(403, "Priority tickets must be issued by staff. Please ask the front desk, or sign in as staff.")
    service = db.get(Service, req.service_id)
    if not service:
        raise HTTPException(404, "Selected service does not exist.")

    token = create_token(db, service, customer_name=req.customer_name, phone=req.phone, priority=req.priority_level,
                         log_detail=f"Token generated for {mask_name(req.customer_name)} ({req.priority_level})")
    refresh_queue_estimates(db, service.id)
    db.refresh(token)
    pos = position_of(db, token) or 0
    calc = estimate_for_position(db, service, pos, token.priority_level)

    sms = None
    if req.send_sms and req.phone:
        link = f" Track: {settings.public_app_url}/?token={token.token_number}" if settings.public_app_url else f" Track your ticket with code {token.token_number}."
        sms = send_sms_notification(req.phone, f"SmartQueue: your token is {token.token_number} for {service.name}. Estimated wait ~{calc['estimated_wait_mins']} min.{link}",
                                    token.token_number, "TOKEN_ISSUED")
    realtime.publish("TOKEN_GENERATED", token_number=token.token_number, service_name=service.name)
    return {"success": True, "token": {
        "id": token.id, "token_number": token.token_number, "service_id": service.id, "service_name": service.name,
        "customer_name": token.customer_name, "phone": token.phone, "priority_level": token.priority_level, "status": token.status,
        "estimated_wait_mins": token.estimated_wait_mins, "position_ahead": pos, "created_at": iso(token.created_at),
        "calculation_steps": calc["calculation_steps"], "formula_latex": calc["formula_latex"]},
        "sms_notification": sms}


@router.get("/api/queue/live")
def live_queue(db: Session = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    staff = is_staff(user)
    now = utcnow()
    name = (lambda n: n) if staff else mask_name
    services = {s.id: s for s in db.query(Service).all()}
    counters = db.query(Counter).order_by(Counter.counter_number).all()

    serving = []
    for c in counters:
        t = c.active_token
        if t and t.status == "CALLED":
            serving.append({
                "counter_id": c.id, "counter_number": c.counter_number, "counter_name": c.name, "token_id": t.id,
                "token_number": t.token_number, "customer_name": name(t.customer_name),
                "service_name": services[t.service_id].name if t.service_id in services else "General Desk",
                "priority_level": t.priority_level, "status": "In Service", "called_at": iso(t.called_at),
                "elapsed_service_mins": round((now - (t.called_at or now)).total_seconds() / 60.0, 1),
                "operator_name": c.assigned_staff.username if c.assigned_staff else (c.operator_name or "Staff")})

    # Per-service ordering and live estimates (computed on read so they never go stale).
    waiting = []
    for sid, svc in services.items():
        for idx, t in enumerate(get_ordered_waiting_queue(db, sid)):
            est = estimate_for_position(db, svc, idx, t.priority_level)["estimated_wait_mins"]
            waiting.append((t, svc, idx, est))
    waiting.sort(key=lambda r: (r[2], r[0].created_at or now))
    waiting_list = [{
        "id": t.id, "token_number": t.token_number, "customer_name": name(t.customer_name), "service_id": t.service_id,
        "service_name": svc.name, "priority_level": t.priority_level, "status": t.status, "estimated_wait_mins": est,
        "elapsed_wait_mins": round(((now - t.created_at).total_seconds() / 60.0) if t.created_at else 0.0, 1),
        "queue_position": i + 1, "position_in_service": idx + 1} for i, (t, svc, idx, est) in enumerate(waiting)]

    n = len(waiting_list)
    avg_times = [s.avg_service_time_mins for s in services.values()]
    return {
        "timestamp": iso(now), "now_serving": serving, "waiting_list": waiting_list, "total_waiting": n,
        "total_served_today": count_today(db, "SERVED"), "active_counters_count": sum(1 for c in counters if c.status == "ACTIVE"),
        "total_counters": len(counters), "avg_service_time_mins": round(sum(avg_times) / len(avg_times), 1) if avg_times else 5.0,
        "queue_density": "OPTIMAL" if n < 5 else ("MODERATE" if n < 12 else "CONGESTED"),
    }


@router.get("/api/tokens/ticket/{token_number}")
def track_ticket(token_number: str, db: Session = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    token = db.query(Token).filter(Token.token_number == token_number.strip().upper()).first()
    if not token:
        raise HTTPException(404, "Token ticket not found")
    full = is_staff(user) or (user is not None and token.customer_user_id == user.id)
    service = token.service
    pos = (position_of(db, token) or 0) if token.status == "WAITING" else 0
    calc = estimate_for_position(db, service, pos, token.priority_level)
    return {
        "id": token.id, "token_number": token.token_number, "service_name": service.name if service else "General Desk",
        "customer_name": token.customer_name if full else mask_name(token.customer_name),
        "phone": token.phone if full else mask_phone(token.phone), "priority_level": token.priority_level, "status": token.status,
        "counter_number": token.counter.counter_number if token.counter else None,
        "counter_name": token.counter.name if token.counter else "Assigned when called",
        "estimated_wait_mins": calc["estimated_wait_mins"] if token.status == "WAITING" else 0.0, "position_ahead": pos,
        "created_at": iso(token.created_at), "called_at": iso(token.called_at),
        "calculation_steps": calc["calculation_steps"], "formula_latex": calc["formula_latex"],
    }
