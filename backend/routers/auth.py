from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..auth import (check_login_allowed, clear_login_failures, create_access_token, get_current_user, hash_password,
                    needs_rehash, record_login_failure, verify_password)
from ..database import get_db
from ..models import User
from ..schemas import CustomerRegisterRequest, LoginRequest, normalize_phone
from ..services.queue import age_from_dob  # noqa: F401  (re-exported for convenience)
from datetime import date

router = APIRouter(prefix="/api/auth", tags=["auth"])

# A valid hash used to equalise timing when the account does not exist (prevents user enumeration by timing).
_DUMMY_HASH = hash_password("not-a-real-password")


def user_out(u: User) -> dict:
    return {
        "id": u.id, "username": u.username, "email": u.email, "full_name": u.full_name or u.username,
        "phone": u.phone, "date_of_birth": u.date_of_birth, "role": u.role,
        "department_id": u.department_id, "department_name": u.department.name if u.department else None,
    }


@router.post("/login")
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    identity = req.username.strip()
    check_login_allowed(request, identity)

    phone_identity = None
    try:
        phone_identity = normalize_phone(identity)
    except ValueError:
        pass
    conditions = [User.username == identity, User.email == identity.lower()]
    if phone_identity:
        conditions.append(User.phone == phone_identity)
    user = db.query(User).filter(or_(*conditions)).first()

    ok = verify_password(req.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok:
        record_login_failure(request, identity)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password.")

    requested = (req.role or "").strip().upper()
    if requested in {"STAFF", "ADMIN", "CUSTOMER"} and user.role != requested and not (requested == "STAFF" and user.role == "ADMIN"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"This account is a {user.role.lower()} account. Choose the matching sign-in option.")

    clear_login_failures(request, identity)
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(req.password)
        db.commit()
    return {"access_token": create_access_token(user), "token_type": "bearer", "user": user_out(user)}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return user_out(current_user)


@router.post("/customer/register", status_code=201)
def register_customer(req: CustomerRegisterRequest, db: Session = Depends(get_db)):
    if req.date_of_birth > date.today():
        raise HTTPException(400, "Date of birth cannot be in the future.")
    if age_from_dob(req.date_of_birth.isoformat()) > 120:
        raise HTTPException(400, "Please enter a valid date of birth.")
    email = req.email.strip().lower()
    if db.query(User).filter(or_(User.email == email, User.username == email, User.phone == req.phone)).first():
        raise HTTPException(409, "An account with this email or phone number already exists.")
    user = User(username=email, email=email, full_name=req.full_name.strip(), phone=req.phone,
                date_of_birth=req.date_of_birth.isoformat(), password_hash=hash_password(req.password), role="CUSTOMER")
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": create_access_token(user), "token_type": "bearer", "user": user_out(user)}
