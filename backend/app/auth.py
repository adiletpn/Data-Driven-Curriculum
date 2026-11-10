"""Authentication and role-based access.

Roles:
  admin          — everything, including data upload/reset
  methodologist  — all analytics for the region
  director       — only their own school (school_id); no cross-school rankings

Passwords are hashed with scrypt (stdlib). Tokens are HMAC-signed, expiring, stateless.
Demo accounts are created on first start; set DDC_SECRET in production.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path

from fastapi import Depends, Header, HTTPException, Query

ROOT = Path(__file__).resolve().parents[1]
USERS_FILE = ROOT / "data" / "users.json"
TOKEN_TTL = 12 * 3600
SECRET = (os.environ.get("DDC_SECRET") or "ddc-dev-secret-change-me").encode()

DEMO_USERS = [
    dict(username="admin", password="admin2026", role="admin", name="Администратор", name_kz="Әкімші", school_id=None),
    dict(username="metodist", password="demo2026", role="methodologist", name="Методист облоно", name_kz="Облыстық әдіскер", school_id=None),
    dict(username="director", password="demo2026", role="director", name="Директор школы №72", name_kz="№72 мектеп директоры", school_id="S072"),
]


def _hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    h = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return base64.b64encode(salt).decode() + "$" + base64.b64encode(h).decode()


def _verify(password: str, stored: str) -> bool:
    try:
        salt_b64, _ = stored.split("$", 1)
        return hmac.compare_digest(_hash(password, base64.b64decode(salt_b64)), stored)
    except ValueError:
        return False


def _load() -> dict:
    if not USERS_FILE.exists():
        USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
        users = {u["username"]: {**{k: v for k, v in u.items() if k != "password"}, "password_hash": _hash(u["password"])}
                 for u in DEMO_USERS}
        USERS_FILE.write_text(json.dumps(users, ensure_ascii=False, indent=2))
    return json.loads(USERS_FILE.read_text())


def public(user: dict) -> dict:
    return {k: v for k, v in user.items() if k != "password_hash"}


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def issue_token(username: str) -> str:
    payload = _b64(json.dumps({"u": username, "exp": int(time.time()) + TOKEN_TTL}).encode())
    sig = _b64(hmac.new(SECRET, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def login(username: str, password: str) -> dict | None:
    user = _load().get((username or "").strip().lower())
    if not user or not _verify(password or "", user["password_hash"]):
        return None
    return {"token": issue_token(user["username"]), "user": public(user)}


def current_user(authorization: str | None = Header(default=None),
                 token: str | None = Query(default=None, include_in_schema=False)) -> dict:
    """Bearer header, or ?token= for plain file downloads (Excel, template)."""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
    if not token:
        raise HTTPException(401, "Требуется вход в систему")
    try:
        payload, sig = token.split(".")
        good = _b64(hmac.new(SECRET, payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good):
            raise ValueError
        data = json.loads(_unb64(payload))
        if data["exp"] < time.time():
            raise HTTPException(401, "Сессия истекла, войдите снова")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Недействительный токен")
    user = _load().get(data["u"])
    if not user:
        raise HTTPException(401, "Пользователь не найден")
    return public(user)


def require(*roles: str):
    def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "Недостаточно прав для этого раздела")
        return user
    return dep


REGION = ("admin", "methodologist")       # region-wide analytics
ANY = ("admin", "methodologist", "director")
