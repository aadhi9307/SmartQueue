"""WebSocket fan-out. Works on a long-running server; on serverless hosts there are no
persistent sockets, so clients transparently fall back to polling."""
import logging
from typing import List

import anyio
from fastapi import WebSocket

log = logging.getLogger("smartqueue.realtime")


class ConnectionManager:
    def __init__(self) -> None:
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, message: dict) -> None:
        dead = []
        for ws in list(self.active):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


def publish(event: str, **payload) -> None:
    """Fire-and-forget broadcast callable from sync endpoints (they run in a worker thread).
    Payloads must never contain personal data: sockets are unauthenticated."""
    if not manager.active:
        return
    try:
        anyio.from_thread.run(manager.broadcast, {"event": event, **payload})
    except Exception as exc:  # no event loop (tests/scripts) - safe to ignore
        log.debug("broadcast skipped: %s", exc)
