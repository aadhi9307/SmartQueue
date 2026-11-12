# SmartQueue

Full-stack queue management: visitors take tickets at a kiosk or via a customer account, staff call them from counters, a lobby board shows live status, and admins manage services, counters, staff and analytics. Wait times come from a SymPy model; ordering uses priority tiers with aging so nobody starves.

**Stack:** FastAPI · SQLAlchemy (SQLite or Postgres) · JWT auth with roles (ADMIN / STAFF / CUSTOMER) · React 19 + Vite + Tailwind · WebSocket push with polling fallback · optional Twilio SMS.

## Layout

```
backend/
  main.py            app factory, CORS, SPA serving, error shape
  config.py          validated env settings (refuses weak JWT secret in production)
  database.py        engine, sessions, additive schema upgrade for older DBs
  models.py          User, Service, Counter, Token, QueueLog
  schemas.py         request validation (enums, phone/email, lengths)
  auth.py            password hashing, JWT, role guards, login throttling
  routers/           auth · customer · public · staff · admin
  services/          queue (priority, numbering, privacy) · wait_time (SymPy) · analytics · sms · realtime
  seed.py            default services/counters + first admin from env
  reset_admin.py     create/reset the admin interactively
frontend/            React SPA (Vite dev server proxies /api and /ws to the backend)
tests/               pytest suite (19 tests)
api/index.py         Vercel serverless entrypoint
Dockerfile, docker-compose.yml, .env.example
```

## Run locally

Requires Python 3.10+ and Node 18+.

```bash
python -m pip install -r requirements-dev.txt
cp .env.example .env        # Windows: copy .env.example .env   (then fill in values)
```

Set at least the admin password (12+ chars). In a shell (Windows CMD uses `set`, not `export`):

```bash
export SMARTQUEUE_ADMIN_USERNAME=admin
export SMARTQUEUE_ADMIN_EMAIL=admin@example.com
export SMARTQUEUE_ADMIN_PASSWORD='choose-a-long-passphrase'
python -m uvicorn backend.main:app --reload --port 8000     # API docs: http://127.0.0.1:8000/docs
```

Second terminal:

```bash
cd frontend && npm install && npm run dev                   # http://localhost:5173
```

Forgot the admin password: `python -m backend.reset_admin` (does not touch queue data).

## Tests

```bash
python -m pytest -q tests
cd frontend && npm run build && npm run lint
```

## Deploy

**Docker (recommended: real Postgres + WebSockets):**
```bash
cp .env.example .env   # set JWT_SECRET, POSTGRES_PASSWORD, SMARTQUEUE_ADMIN_*
docker compose up --build        # http://localhost:8000
```

**Vercel:** works, with two limits you must know about:
1. Set `DATABASE_URL` to a hosted Postgres (Neon, Supabase, etc.). Without it the app falls back to SQLite in `/tmp`, which is **erased** on cold starts/redeploys.
2. Serverless has no persistent WebSockets, so the UI updates by polling (every 5 s). Everything still works; it is just not instant.
Also set `JWT_SECRET` (32+ chars), `SMARTQUEUE_ADMIN_*`, `APP_ENV=production`.

## Behaviour worth knowing

- **Priority:** anonymous kiosk users get Normal tickets. Senior / VIP / Emergency tickets are issued by signed-in staff. Registered customers get Senior automatically from their date of birth; they may self-select VIP unless you set `ALLOW_CUSTOMER_VIP=false`.
- **Privacy:** public pages (lobby board, ticket tracker) show masked names ("Priya S.") and masked phones. Signed-in staff see full details.
- **Counters:** a staff member can operate unassigned counters and their own; admins can operate any. A counter only calls tickets from its own service.
- **Login throttling** is in-memory per server process. Behind several instances, add a shared store.
- **"Today" statistics** use `QUEUE_TIMEZONE` (default UTC; e.g. `Asia/Kolkata`).
