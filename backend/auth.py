import hashlib
import hmac
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import User

ALGORITHM = "HS256"
_ITERATIONS = 310_000
security = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------- passwords
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return f"pbkdf2_sha256${_ITERATIONS}${salt.hex()}${digest.hex()}"


_LEGACY_SALT = "smartqueue-salt-auth"


def needs_rehash(hashed_password: str) -> bool:
    return not hashed_password.startswith("pbkdf2_sha256$")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if needs_rehash(hashed_password):
        # Databases from early versions used an unsalted-per-user SHA-256. Still accepted, and upgraded on next login.
        legacy = hashlib.sha256((_LEGACY_SALT + plain_password).encode("utf-8")).hexdigest()
        return hmac.compare_digest(legacy, hashed_password)
    try:
        scheme, iterations, salt_hex, digest_hex = hashed_password.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)).hex()
        return hmac.compare_digest(candidate, digest_hex)
    except (ValueError, TypeError):
        return False


# --------------------------------------------------------------------- JWT
def create_access_token(user: User, expires_delta: Optional[timedelta] = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "iat": now,
        "exp": now + (expires_delta or timedelta(minutes=settings.access_token_minutes)),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def _user_from_credentials(credentials: Optional[HTTPAuthorizationCredentials], db: Session) -> Optional[User]:
    if not credentials or not credentials.credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, ValueError, KeyError):
        return None
    user = db.get(User, user_id)
    # Role is always taken from the database, never trusted from the token.
    return user


def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security), db: Session = Depends(get_db)) -> User:
    user = _user_from_credentials(credentials, db)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required or session expired. Please sign in again.", headers={"WWW-Authenticate": "Bearer"})
    return user


def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security), db: Session = Depends(get_db)) -> Optional[User]:
    return _user_from_credentials(credentials, db)


def require_role(allowed_roles: List[str]):
    def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission to perform this action.")
        return current_user
    return checker


# ------------------------------------------------------ login throttling
# In-memory, per process: slows online guessing. Use a shared store (e.g. Redis) when running multiple instances.
_failures: dict = defaultdict(list)


def _key(request: Request, identity: str) -> str:
    ip = request.client.host if request.client else "unknown"
    return f"{ip}|{identity.lower()}"


def check_login_allowed(request: Request, identity: str) -> None:
    key, now = _key(request, identity), time.time()
    _failures[key] = [t for t in _failures[key] if now - t < settings.login_lock_seconds]
    if len(_failures[key]) >= settings.login_max_failures:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many failed sign-in attempts. Try again in a few minutes.")


def record_login_failure(request: Request, identity: str) -> None:
    _failures[_key(request, identity)].append(time.time())


def clear_login_failures(request: Request, identity: str) -> None:
    _failures.pop(_key(request, identity), None)
