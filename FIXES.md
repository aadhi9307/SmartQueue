# What was fixed in this version

## Security
| Issue in v2 | Now |
|---|---|
| `/api/analytics/summary` and `/api/notifications/logs` (customer names, phones, SMS bodies) were public | Staff/Admin only (SMS log: Admin only) |
| Anyone could create an **EMERGENCY** or VIP ticket from the public kiosk endpoint | Only signed-in staff can issue non-Normal priority; server enforces it |
| Public board / ticket lookup exposed full names and phone numbers (token numbers are guessable) | Names and phones masked unless staff (or ticket owner) |
| Default JWT secret shipped in code | Production refuses to start without a 32+ char secret; dev uses a random per-process secret |
| JWT `sub` was the username and trusted the role claim | Subject is the user ID; role is always read from the database |
| No brute-force protection, user-enumeration by timing | Failed-login throttling + constant-time dummy hash check |
| CORS `*` with credentials | Explicit origin list |
| Any signed-in user (including customers) could open the Staff screen | Role-checked on both client and server |
| Staff could operate any other staff member's counter | Assigned counters restricted to the assignee/admins |
| Counter-action endpoint accepted any string and silently did nothing | Strict enums; clear 400 if no active ticket |

## Correctness bugs
- **Duplicate token numbers** after cancellations/transfers (numbers were `count + 101`) → numbering from the highest existing number with retry on conflict.
- **500 errors**: deleting a service with history, creating a duplicate counter number → proper 409s with messages; service/counter/staff delete guards added.
- A counter could pull tickets from **other services** when its own queue was empty → removed.
- Two counters pressing "call next" together could take the **same ticket** → atomic claim.
- Timestamps were sent without a timezone, so browsers misread them as local time (wrong elapsed/wait times) → ISO-8601 with `Z`.
- "Served today" counted all-time → real day boundary in `QUEUE_TIMEZONE`; analytics are scoped to today and exclude cancelled tickets from average wait.
- Wait estimate returned at ticket creation ignored priority ordering → computed from the real queue position.
- HOLD left the ticket attached to the counter and let the same desk re-call it instantly → returned to the back of its tier.
- SMS service crashed on an unbound variable when Twilio failed; SMS links pointed at a route that did not exist → fixed, configurable `PUBLIC_APP_URL`, opening `/?token=A-101` now opens the tracker.
- Ticket tracker re-queried on every keystroke → only on submit; polling pauses in background tabs.
- Expired sessions left the UI "signed in" showing failing screens → 401 clears the session and returns to sign-in.
- Validation errors showed raw arrays → one readable sentence.
- Admin screens for Analytics/SMS log and "Add service" errors existed as dead code or `alert()` → wired into an Admin tabs page / inline errors.

## Architecture / engineering
- Monolithic 1,000-line `main.py` split into routers + services; validated settings; typed request schemas.
- SQLite foreign keys enforced; generic additive schema upgrade for older databases (tested); legacy password hashes still accepted and upgraded on login.
- `pandas` removed (huge for serverless); SymPy formula compiled once so refreshes are fast.
- Vite dev proxy + relative URLs (no hard-coded `127.0.0.1:8000`); WebSocket reconnect with backoff; polling fallback.
- Added: tests (19), Dockerfile + compose with Postgres, `.env.example`, health endpoint, SPA fallback routing.
- Removed dead code (`CounterOperatorView`, unused assets, destructive reseed endpoint); lint warnings 73 → 12.
