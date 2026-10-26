"""Request validation models. Enumerated values are enforced here, not trusted from clients."""
import re
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

Priority = Literal["NORMAL", "VIP", "SENIOR_CITIZEN", "EMERGENCY"]
CounterStatus = Literal["ACTIVE", "PAUSED", "OFFLINE"]
Role = Literal["STAFF", "ADMIN"]
CounterActionName = Literal["COMPLETED", "SKIPPED", "HOLD", "TRANSFERRED"]

_ACTION_ALIASES = {"COMPLETE": "COMPLETED", "SERVED": "COMPLETED", "SKIP": "SKIPPED", "TRANSFER": "TRANSFERRED"}
_PHONE_RE = re.compile(r"^\+?\d{8,15}$")


def normalize_phone(value: str) -> str:
    """Strip formatting characters; require 8-15 digits with an optional leading '+'."""
    cleaned = re.sub(r"[\s().-]", "", value or "")
    if not _PHONE_RE.match(cleaned):
        raise ValueError("Enter a valid phone number (8-15 digits, optional leading +).")
    return cleaned


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=128)
    role: Optional[str] = None


class CustomerRegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str
    date_of_birth: date
    password: str = Field(min_length=8, max_length=128)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalize_phone(v)


class CustomerProfileUpdateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    phone: str
    date_of_birth: date

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalize_phone(v)


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class AccountDeleteRequest(BaseModel):
    password: str


class CustomerQueueJoinRequest(BaseModel):
    service_id: int


class CustomerPriorityRequest(BaseModel):
    priority_level: Priority


class TokenGenerateRequest(BaseModel):
    service_id: int
    customer_name: str = Field(min_length=1, max_length=120)
    phone: Optional[str] = ""
    priority_level: Priority = "NORMAL"
    send_sms: bool = True

    @field_validator("customer_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 1:
            raise ValueError("Name is required.")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: Optional[str]) -> str:
        return normalize_phone(v) if v and v.strip() else ""


class CounterCallNextRequest(BaseModel):
    counter_id: int


class CounterActionRequest(BaseModel):
    counter_id: int
    action: CounterActionName
    transfer_service_id: Optional[int] = None
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("action", mode="before")
    @classmethod
    def _alias(cls, v):
        v = str(v).strip().upper()
        return _ACTION_ALIASES.get(v, v)


class CounterStatusRequest(BaseModel):
    status: CounterStatus

    @field_validator("status", mode="before")
    @classmethod
    def _upper(cls, v):
        return str(v).strip().upper()


class ServiceRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    prefix: str = Field(min_length=1, max_length=5, pattern=r"^[A-Za-z0-9]+$")
    avg_service_time_mins: float = Field(default=5.0, gt=0, le=240)
    description: Optional[str] = Field(default="", max_length=255)
    icon: Optional[str] = Field(default="HelpCircle", max_length=50)


class CounterRequest(BaseModel):
    counter_number: int = Field(gt=0, le=9999)
    name: str = Field(min_length=1, max_length=100)
    service_id: Optional[int] = None
    assigned_staff_id: Optional[int] = None


class AssignStaffRequest(BaseModel):
    staff_id: int


class StaffCreateRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=30)
    password: str = Field(min_length=8, max_length=128)
    # The admin staff-creation workflow must never mint another administrator account.
    role: Role = "STAFF"
    department_id: Optional[int] = None

    @field_validator("full_name")
    @classmethod
    def _name(cls, value: Optional[str]) -> Optional[str]:
        if value is None or not value.strip():
            return None
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Enter the staff member's full name.")
        return value

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: Optional[str]) -> Optional[str]:
        if value is None or not value.strip():
            return None
        return normalize_phone(value)

    @field_validator("role", mode="before")
    @classmethod
    def _upper(cls, value):
        return str(value).strip().upper()
