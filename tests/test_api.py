import pytest


def gen(client, **kw):
    body = {"service_id": 1, "customer_name": "Test User", "phone": "", "priority_level": "NORMAL", "send_sms": False, **kw}
    return client.post("/api/tokens/generate", json=body)


# ----------------------------------------------------------------- access control
def test_analytics_and_sms_logs_require_auth(client, admin_h):
    assert client.get("/api/analytics/summary").status_code == 401
    assert client.get("/api/notifications/logs").status_code == 401
    assert client.get("/api/analytics/summary", headers=admin_h).status_code == 200


def test_staff_cannot_use_admin_endpoints(client, staff_h):
    assert client.get("/api/admin/staff", headers=staff_h).status_code == 403
    assert client.get("/api/notifications/logs", headers=staff_h).status_code == 403
    assert client.get("/api/analytics/summary", headers=staff_h).status_code == 200


def test_anonymous_cannot_self_assign_priority(client, staff_h):
    for p in ("EMERGENCY", "VIP", "SENIOR_CITIZEN"):
        assert client.post("/api/tokens/generate", json={"service_id": 1, "customer_name": "x", "priority_level": p, "send_sms": False}).status_code == 403
    r = client.post("/api/tokens/generate", headers=staff_h, json={"service_id": 1, "customer_name": "Assisted", "priority_level": "SENIOR_CITIZEN", "send_sms": False})
    assert r.status_code == 201 and r.json()["token"]["priority_level"] == "SENIOR_CITIZEN"


# --------------------------------------------------------------------- validation
@pytest.mark.parametrize("payload", [
    {"service_id": 1, "customer_name": "   ", "priority_level": "NORMAL"},
    {"service_id": 1, "customer_name": "ok", "priority_level": "BOGUS"},
    {"service_id": 1, "customer_name": "ok", "phone": "abc"},
])
def test_token_validation(client, payload):
    r = client.post("/api/tokens/generate", json={**payload, "send_sms": False})
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)


def test_unknown_service_is_404(client):
    assert client.post("/api/tokens/generate", json={"service_id": 9999, "customer_name": "x", "send_sms": False}).status_code == 404


def test_admin_validation_and_conflicts(client, admin_h):
    assert client.post("/api/admin/counters", headers=admin_h, json={"counter_number": 2, "name": "dup"}).status_code == 409
    assert client.post("/api/admin/staff", headers=admin_h, json={"username": "s2", "email": "s2@example.com", "password": "longenough1", "role": "ROOT"}).status_code == 422
    assert client.post("/api/admin/services", headers=admin_h, json={"name": "Dup", "prefix": "a"}).status_code == 409
    assert client.delete("/api/admin/services/1", headers=admin_h).status_code in (409,)  # has counters/history


def test_counter_status_enum(client, staff_h):
    assert client.post("/api/counters/2/status", headers=staff_h, json={"status": "LOL"}).status_code == 422


# ---------------------------------------------------------------- queue behaviour
def test_unique_sequential_token_numbers(client):
    nums = [gen(client, service_id=2).json()["token"]["token_number"] for _ in range(4)]
    assert len(set(nums)) == 4 and all(n.startswith("B-") for n in nums)
    assert [int(n.split("-")[1]) for n in nums] == sorted(int(n.split("-")[1]) for n in nums)


def test_call_flow_respects_service_and_priority(client, staff_h):
    normal = client.post("/api/tokens/generate", json={"service_id": 3, "customer_name": "Normal Person", "send_sms": False}).json()["token"]
    urgent = client.post("/api/tokens/generate", headers=staff_h, json={"service_id": 3, "customer_name": "Urgent Person", "priority_level": "EMERGENCY", "send_sms": False}).json()["token"]
    # counter 4 serves service 3: emergency first
    called = client.post("/api/counter/call-next", headers=staff_h, json={"counter_id": 4}).json()["token"]
    assert called["token_number"] == urgent["token_number"]
    # a counter for another service must never pull service-3 tickets
    empty = client.post("/api/counter/call-next", headers=staff_h, json={"counter_id": 5}).json()
    assert empty["token"] is None
    # complete, then the next call is the normal ticket
    assert client.post("/api/counter/action", headers=staff_h, json={"counter_id": 4, "action": "COMPLETE"}).status_code == 200
    assert client.post("/api/counter/call-next", headers=staff_h, json={"counter_id": 4}).json()["token"]["token_number"] == normal["token_number"]


def test_action_without_active_ticket_is_rejected(client, staff_h):
    assert client.post("/api/counter/action", headers=staff_h, json={"counter_id": 1, "action": "SKIPPED"}).status_code == 400
    assert client.post("/api/counter/action", headers=staff_h, json={"counter_id": 1, "action": "NOPE"}).status_code == 422


# ----------------------------------------------------------------------- privacy
def test_public_views_mask_personal_data(client, staff_h):
    t = client.post("/api/tokens/generate", json={"service_id": 1, "customer_name": "Priya Sharma", "phone": "+919876543210", "send_sms": False}).json()["token"]
    live = client.get("/api/queue/live").json()
    row = next(r for r in live["waiting_list"] if r["token_number"] == t["token_number"])
    assert row["customer_name"] == "Priya S."
    pub = client.get(f"/api/tokens/ticket/{t['token_number']}").json()
    assert pub["customer_name"] == "Priya S." and pub["phone"].endswith("10") and "98765" not in pub["phone"]
    full = client.get(f"/api/tokens/ticket/{t['token_number']}", headers=staff_h).json()
    assert full["customer_name"] == "Priya Sharma" and full["phone"] == "+919876543210"
    assert row["token_number"] == t["token_number"] and live["timestamp"].endswith("Z")


# ------------------------------------------------------------------ customer flow
def test_customer_flow_and_senior_priority(client):
    reg = client.post("/api/auth/customer/register", json={"full_name": "Old Timer", "email": "old@example.com", "phone": "+91 98000 11111",
                                                            "date_of_birth": "1950-01-01", "password": "password123"})
    assert reg.status_code == 201
    h = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    assert client.post("/api/auth/customer/register", json={"full_name": "Dup", "email": "OLD@example.com", "phone": "+919800011111",
                                                             "date_of_birth": "1990-01-01", "password": "password123"}).status_code == 409
    j = client.post("/api/customer/queue/join", headers=h, json={"service_id": 1})
    assert j.status_code == 201 and j.json()["priority_level"] == "SENIOR_CITIZEN"
    assert client.post("/api/customer/queue/join", headers=h, json={"service_id": 1}).status_code == 409
    q = client.get("/api/customer/queue", headers=h).json()
    assert q[0]["position"] >= 1 and q[0]["created_at"].endswith("Z")
    assert client.post(f"/api/customer/queue/{q[0]['id']}/priority", headers=h, json={"priority_level": "EMERGENCY"}).status_code == 400
    assert client.post(f"/api/customer/queue/{q[0]['id']}/exit", headers=h).status_code == 200
    assert client.get("/api/admin/staff", headers=h).status_code == 403


def test_customer_cannot_touch_another_customers_ticket(client):
    def mk(email, phone):
        r = client.post("/api/auth/customer/register", json={"full_name": "Cust Omer", "email": email, "phone": phone, "date_of_birth": "1995-05-05", "password": "password123"})
        return {"Authorization": f"Bearer {r.json()['access_token']}"}
    a, b = mk("a@example.com", "+14155550101"), mk("b@example.com", "+14155550102")
    client.post("/api/customer/queue/join", headers=a, json={"service_id": 1})
    tid = client.get("/api/customer/queue", headers=a).json()[0]["id"]
    assert client.post(f"/api/customer/queue/{tid}/exit", headers=b).status_code == 404


# ------------------------------------------------------------------------- auth
def test_login_throttling_and_generic_error(client):
    for _ in range(5):
        assert client.post("/api/auth/login", json={"username": "nobody@example.com", "password": "wrong"}).status_code == 401
    assert client.post("/api/auth/login", json={"username": "nobody@example.com", "password": "wrong"}).status_code == 429


def test_invalid_and_missing_tokens(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_wait_time_formula():
    from backend.services.wait_time import calculate_symbolic_wait_time as calc
    assert calc(0, 5, 2, "NORMAL")["estimated_wait_mins"] == 0.0
    assert calc(4, 5, 2, "NORMAL")["estimated_wait_mins"] == 10.0
    assert calc(4, 5, 2, "EMERGENCY")["estimated_wait_mins"] == 4.0


def test_legacy_hash_login_upgrades(client, admin_h):
    import hashlib
    from backend.database import SessionLocal
    from backend.models import User
    db = SessionLocal()
    try:
        db.add(User(username="oldstaff", email="old@staff.example", role="STAFF",
                    password_hash=hashlib.sha256(("smartqueue-salt-auth" + "legacy-pass-1").encode()).hexdigest()))
        db.commit()
    finally:
        db.close()
    assert client.post("/api/auth/login", json={"username": "oldstaff", "password": "legacy-pass-1"}).status_code == 200
    db = SessionLocal()
    try:
        assert db.query(User).filter_by(username="oldstaff").one().password_hash.startswith("pbkdf2_sha256$")
    finally:
        db.close()


def test_admin_can_create_staff_account_and_staff_has_limited_access(client, admin_h):
    created = client.post('/api/admin/staff', headers=admin_h, json={
        'full_name': 'Asha Rao',
        'username': 'asha.rao',
        'email': 'asha.rao@example.com',
        'phone': '+919876543210',
        'password': 'initial-password-123',
        'role': 'STAFF',
        'department_id': 1,
    })
    assert created.status_code == 201, created.text
    assert created.json()['role'] == 'STAFF'
    assert created.json()['full_name'] == 'Asha Rao'

    login = client.post('/api/auth/login', json={'username': 'asha.rao', 'password': 'initial-password-123'})
    assert login.status_code == 200, login.text
    staff_headers = {'Authorization': f"Bearer {login.json()['access_token']}"}
    assert login.json()['user']['role'] == 'STAFF'
    assert client.get('/api/admin/staff', headers=staff_headers).status_code == 403
    assert client.get('/api/analytics/summary', headers=staff_headers).status_code == 200


def test_staff_creation_endpoint_cannot_create_admin(client, admin_h):
    response = client.post('/api/admin/staff', headers=admin_h, json={
        'full_name': 'Would Be Admin',
        'username': 'not-admin',
        'email': 'not-admin@example.com',
        'password': 'initial-password-123',
        'role': 'ADMIN',
    })
    assert response.status_code == 403


def test_reassigning_staff_moves_them_and_releases_previous_counter(client, admin_h, staff_h):
    # Assign one operator, then move them. The first counter must become free.
    first = client.post("/api/admin/counters/1/assign-staff", headers=admin_h, json={"staff_id": 2})
    assert first.status_code == 200
    second = client.post("/api/admin/counters/2/assign-staff", headers=admin_h, json={"staff_id": 2})
    assert second.status_code == 200
    assert second.json()["released_counter_ids"] == [1]

    rows = {c["id"]: c for c in client.get("/api/admin/counters", headers=admin_h).json()}
    assert rows[1]["assigned_staff_id"] is None
    assert rows[2]["assigned_staff_id"] == 2

    # The counter-edit endpoint must obey the same single-counter rule.
    updated = client.put("/api/admin/counters/3", headers=admin_h, json={
        "counter_number": 3, "name": "Financial Desk 02", "service_id": 2, "assigned_staff_id": 2,
    })
    assert updated.status_code == 200
    rows = {c["id"]: c for c in client.get("/api/admin/counters", headers=admin_h).json()}
    assert rows[2]["assigned_staff_id"] is None
    assert rows[3]["assigned_staff_id"] == 2
