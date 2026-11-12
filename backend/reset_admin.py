"""Create or reset the administrator account. Run from the project root:  python -m backend.reset_admin"""
from getpass import getpass

from sqlalchemy import or_

from .auth import hash_password
from .database import SessionLocal, ensure_schema
from .models import User


def main() -> None:
    ensure_schema()
    username = input("Admin username: ").strip()
    email = input("Admin email: ").strip().lower()
    password = getpass("New admin password (min 12 characters): ")
    if not username or not email or len(password) < 12:
        raise SystemExit("Username/email are required and the password must be at least 12 characters.")
    if password != getpass("Confirm password: "):
        raise SystemExit("Passwords do not match; no changes were made.")

    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.role == "ADMIN", or_(User.username == username, User.email == email)).first()
        if not admin:
            if db.query(User).filter(or_(User.username == username, User.email == email)).first():
                raise SystemExit("That username/email belongs to a non-admin account. Choose a unique admin identity.")
            admin = db.query(User).filter(User.role == "ADMIN").first()
        if admin:
            admin.username, admin.email = username, email
            admin.full_name = admin.full_name or username
            admin.password_hash = hash_password(password)
        else:
            db.add(User(username=username, email=email, full_name=username, password_hash=hash_password(password), role="ADMIN"))
        db.commit()
        print(f"Admin account ready: {username}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
