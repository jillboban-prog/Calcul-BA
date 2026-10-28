"""Mots de passe, sessions, limitation des tentatives de connexion."""
from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request, Response

from . import settings
from .db import Database, get_db, ts, ts_in

# ---------------------------------------------------------------- mots de passe

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, settings.PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${settings.PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Accepte le nouveau format et l'ancien « sel:empreinte » de la version 3."""
    try:
        if stored.startswith("pbkdf2_sha256$"):
            _, iterations, salt_hex, digest_hex = stored.split("$", 3)
            n = int(iterations)
        else:
            salt_hex, digest_hex = stored.split(":", 1)
            n = settings.LEGACY_PBKDF2_ITERATIONS
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), n)
        return hmac.compare_digest(candidate.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def needs_rehash(stored: str) -> bool:
    return not stored.startswith(f"pbkdf2_sha256${settings.PBKDF2_ITERATIONS}$")


# Empreinte factice : vérifier un compte inexistant prend le même temps
# qu'un compte réel, ce qui empêche de deviner les adresses inscrites.
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))

# --------------------------------------------------------------------- sessions

def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def open_session(conn: Database, response: Response, user_id: int) -> None:
    token = secrets.token_urlsafe(32)
    conn.execute("DELETE FROM user_sessions WHERE expires_at <= ?", (ts(),))
    conn.execute(
        "INSERT INTO user_sessions (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (user_id, token_digest(token), ts(), ts_in(settings.SESSION_DAYS)),
    )
    conn.commit()
    response.set_cookie(
        settings.COOKIE_NAME,
        token,
        max_age=settings.SESSION_DAYS * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.SECURE_COOKIES,
        path="/",
    )


def close_session(conn: Database, request: Request, response: Response) -> None:
    token = request.cookies.get(settings.COOKIE_NAME)
    if token:
        conn.execute("DELETE FROM user_sessions WHERE token_hash = ?", (token_digest(token),))
        conn.commit()
    response.delete_cookie(settings.COOKIE_NAME, path="/", samesite="lax", secure=settings.SECURE_COOKIES, httponly=True)


def public_user(row) -> dict:
    """Seules les informations utiles à l'interface quittent le serveur."""
    return {"id": row["id"], "full_name": row["full_name"], "email": row["email"]}


def current_user(request: Request, conn: Database = Depends(get_db)) -> dict:
    token = request.cookies.get(settings.COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Connectez-vous pour accéder à calculBA.")
    row = conn.execute(
        """SELECT u.id, u.full_name, u.email FROM user_sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ? AND s.expires_at > ?""",
        (token_digest(token), ts()),
    ).fetchone()
    if not row:
        raise HTTPException(401, "Votre session a expiré. Reconnectez-vous.")
    return public_user(row)


# ------------------------------------------------- limitation des tentatives

class LoginThrottle:
    """Compteur en mémoire des échecs de connexion (suffisant pour un seul processus)."""

    def __init__(self, max_failures: int, window: int):
        self.max_failures = max_failures
        self.window = window
        self._failures: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque:
        q = self._failures[key]
        while q and now - q[0] > self.window:
            q.popleft()
        return q

    def check(self, key: str) -> None:
        with self._lock:
            now = time.monotonic()
            q = self._prune(key, now)
            if len(q) >= self.max_failures:
                wait = int(self.window - (now - q[0])) // 60 + 1
                raise HTTPException(429, f"Trop de tentatives de connexion. Réessayez dans {wait} min.")

    def fail(self, key: str) -> None:
        with self._lock:
            self._failures[key].append(time.monotonic())

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)


login_throttle = LoginThrottle(settings.LOGIN_MAX_FAILURES, settings.LOGIN_WINDOW_SECONDS)
# Même mécanisme pour limiter les créations de compte par adresse IP.
register_throttle = LoginThrottle(settings.REGISTER_MAX_PER_IP, settings.REGISTER_WINDOW_SECONDS)
