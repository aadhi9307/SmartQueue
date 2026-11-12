import os
import sys
import tempfile

import pytest

_tmp = tempfile.mkdtemp()
os.environ.update({
    "APP_ENV": "development", "DATABASE_URL": f"sqlite:///{_tmp}/test.db", "JWT_SECRET": "x" * 48,
    "SMARTQUEUE_ADMIN_USERNAME": "admin", "SMARTQUEUE_ADMIN_EMAIL": "admin@example.com",
    "SMARTQUEUE_ADMIN_PASSWORD": "correct-horse-battery", "LOGIN_MAX_FAILURES": "5",
})
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi.testclient import TestClient  # noqa: E402
from backend.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def admin_h(client):
    t = client.post("/api/auth/login", json={"username": "admin", "password": "correct-horse-battery"}).json()["access_token"]
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="session")
def staff_h(client, admin_h):
    client.post("/api/admin/staff", headers=admin_h, json={"username": "desk1", "email": "desk1@example.com", "password": "staff-password-1", "role": "STAFF"})
    t = client.post("/api/auth/login", json={"username": "desk1", "password": "staff-password-1"}).json()["access_token"]
    return {"Authorization": f"Bearer {t}"}
