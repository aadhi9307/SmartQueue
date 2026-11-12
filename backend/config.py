"""Central, validated application settings (all values come from environment variables)."""
import os
import secrets
from dataclasses import dataclass, field
from typing import List

_INSECURE_DEFAULT_SECRETS = {"", "change-me", "local-development-only-change-this-secret"}


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    return default if raw is None else raw.strip().lower() in {"1", "true", "yes", "on"}


def _normalize_db_url(url: str) -> str:
    # Hosted Postgres providers often hand out the legacy "postgres://" scheme.
    if url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://"):]
    return url


@dataclass(frozen=True)
class Settings:
    env: str = field(default_factory=lambda: os.getenv("APP_ENV", "production" if os.getenv("VERCEL") else "development").lower())
    on_vercel: bool = field(default_factory=lambda: bool(os.getenv("VERCEL")))
    database_url: str = ""
    jwt_secret: str = ""
    access_token_minutes: int = field(default_factory=lambda: int(os.getenv("ACCESS_TOKEN_MINUTES", "720")))
    cors_origins: List[str] = field(default_factory=lambda: [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()])
    timezone: str = field(default_factory=lambda: os.getenv("QUEUE_TIMEZONE", "UTC"))
    public_app_url: str = field(default_factory=lambda: os.getenv("PUBLIC_APP_URL", "").rstrip("/"))
    allow_customer_vip: bool = field(default_factory=lambda: _bool("ALLOW_CUSTOMER_VIP", True))
    login_max_failures: int = field(default_factory=lambda: int(os.getenv("LOGIN_MAX_FAILURES", "5")))
    login_lock_seconds: int = field(default_factory=lambda: int(os.getenv("LOGIN_LOCK_SECONDS", "300")))

    @property
    def is_production(self) -> bool:
        return self.env == "production"


def load_settings() -> Settings:
    base = Settings()
    on_vercel = base.on_vercel
    default_db = "sqlite:////tmp/smartqueue.db" if on_vercel else "sqlite:///./smartqueue.db"
    database_url = _normalize_db_url(os.getenv("DATABASE_URL", default_db))

    secret = os.getenv("JWT_SECRET", "")
    if secret in _INSECURE_DEFAULT_SECRETS or len(secret) < 32:
        if base.is_production:
            raise RuntimeError(
                "JWT_SECRET must be set to a random string of at least 32 characters in production. "
                "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        # Development: a random per-process secret is safer than a published default
        # (sessions simply reset when the dev server restarts).
        secret = secrets.token_urlsafe(48)

    return Settings(database_url=database_url, jwt_secret=secret)


settings = load_settings()
