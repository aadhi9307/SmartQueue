import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import SessionLocal, ensure_schema
from .routers import admin, auth, customer, public, staff
from .seed import run_startup_seed

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("smartqueue")


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_schema()
    db = SessionLocal()
    try:
        run_startup_seed(db)
    finally:
        db.close()
    if settings.on_vercel and settings.database_url.startswith("sqlite"):
        log.warning("Running on Vercel with SQLite in /tmp: data is EPHEMERAL. Set DATABASE_URL to a hosted Postgres database.")
    yield


app = FastAPI(title="SmartQueue API", version="3.0.0", lifespan=lifespan,
              description="Role-based queue management with priority aging and SymPy-based wait-time prediction.")

app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False,
                   allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type"])

for r in (auth.router, customer.router, public.router, staff.router, admin.router):
    app.include_router(r)


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    """Return one readable sentence in `detail` (the UI shows this string) plus the structured errors."""
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    msg = str(first.get("msg", "Invalid request")).replace("Value error, ", "")
    return JSONResponse(status_code=422, content={"detail": f"{field}: {msg}" if field else msg, "errors": jsonable(exc)})


def jsonable(exc: RequestValidationError):
    return [{"loc": list(e.get("loc", [])), "msg": str(e.get("msg", ""))} for e in exc.errors()]


# Serve the built SPA when present (single-container deployments). Unknown non-API paths fall back to index.html.
_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.isdir(_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith(("api/", "ws/")):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        candidate = os.path.join(_dist, path)
        return FileResponse(candidate if path and os.path.isfile(candidate) else os.path.join(_dist, "index.html"))
