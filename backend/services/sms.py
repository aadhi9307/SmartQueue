import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import os

log = logging.getLogger("smartqueue.sms")
_logs: List[Dict[str, Any]] = []  # in-memory, per process; last 100 dispatches


def send_sms_notification(to_phone: str, message: str, token_number: Optional[str] = None, event_type: str = "TOKEN_UPDATE") -> Dict[str, Any]:
    sid, auth, sender = os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"), os.getenv("TWILIO_PHONE_NUMBER")
    phone = (to_phone or "").strip()
    entry: Dict[str, Any] = {
        "id": f"LOCAL_{uuid.uuid4().hex[:12]}", "recipient": phone, "token_number": token_number,
        "event_type": event_type, "message": message, "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "status": "NOT_CONFIGURED", "provider": "NONE", "error": None,
    }
    if sid and auth and sender and phone:
        try:
            from twilio.rest import Client
            res = Client(sid, auth, timeout=8).messages.create(body=message, from_=sender, to=phone) if _supports_timeout() else Client(sid, auth).messages.create(body=message, from_=sender, to=phone)
            entry.update(id=res.sid, status=str(res.status or "queued").upper(), provider="TWILIO")
        except Exception as exc:
            log.warning("SMS send failed: %s", exc)
            entry.update(status="FAILED", provider="TWILIO", error=str(exc)[:200])
    _logs.insert(0, entry)
    del _logs[100:]
    return entry


def _supports_timeout() -> bool:
    try:
        import inspect
        from twilio.rest import Client
        return "timeout" in inspect.signature(Client.__init__).parameters
    except Exception:
        return False


def get_notification_logs(limit: int = 30) -> List[Dict[str, Any]]:
    return _logs[:limit]
