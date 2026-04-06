"""用户认证 REST API。

端点前缀：/api/v1/auth

路由：
  POST /auth/login            — 登录（返回 token + user）
  GET  /auth/me               — 获取当前用户
  POST /auth/logout           — 退出登录
  POST /auth/change-password  — 修改密码
"""
import hashlib
import logging
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

TOKEN_EXPIRE_DAYS = 7


def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()


def _get_user_by_username(conn, username: str):
    return conn.execute(
        "SELECT id, username, password_hash, salt, display_name, email, role, tenant_id, status FROM users WHERE username = ?",
        (username,),
    ).fetchone()


def _get_user_by_id(conn, user_id: str):
    return conn.execute(
        "SELECT id, username, display_name, email, role, tenant_id, status FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()


def _create_session(conn, user_id: str) -> str:
    token = secrets.token_hex(32)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=TOKEN_EXPIRE_DAYS)
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, now.isoformat(), expires.isoformat()),
    )
    conn.commit()
    return token


def _validate_token(conn, token: str) -> dict | None:
    """Validate token, return user row or None."""
    row = conn.execute(
        """SELECT u.id, u.username, u.display_name, u.email, u.role, s.expires_at
           FROM sessions s JOIN users u ON s.user_id = u.id
           WHERE s.token = ?""",
        (token,),
    ).fetchone()
    if not row:
        return None
    # Check expiry
    try:
        expires = datetime.fromisoformat(row["expires_at"])
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
            return None
    except (ValueError, TypeError):
        return None
    return {
        "id": row["id"],
        "username": row["username"],
        "display_name": row["display_name"],
        "email": row["email"],
        "role": row["role"],
    }


def verify_request_token(request: Request) -> dict:
    """Extract and validate Bearer token from request. Returns user dict or raises 401."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未提供认证 token")
    token = auth_header[7:]
    from database import get_connection
    conn = get_connection()
    user = _validate_token(conn, token)
    if not user:
        raise HTTPException(status_code=401, detail="token 无效或已过期")
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"],
        "email": user["email"],
        "role": user["role"],
        "tenant_id": user.get("tenant_id", ""),
        "status": user.get("status", "active"),
    }


# ── Login ──


@router.post("/login")
async def login(body: dict):
    """登录：验证用户名密码，返回 token 和用户信息。"""
    username = body.get("username", "").strip()
    password = body.get("password", "")

    if not username or not password:
        raise HTTPException(status_code=400, detail="请输入用户名和密码")

    from database import get_connection
    conn = get_connection()
    user = _get_user_by_username(conn, username)
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    if user["password_hash"] != _hash_password(password, user["salt"]):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    token = _create_session(conn, user["id"])

    # Clean up expired sessions
    conn.execute("DELETE FROM sessions WHERE expires_at < ?", (datetime.now(timezone.utc).isoformat(),))
    conn.commit()

    logger.info("User '%s' logged in", username)

    # Update last_login_at
    conn.execute(
        "UPDATE users SET last_login_at = ? WHERE id = ?",
        (datetime.now(timezone.utc).isoformat(), user["id"]),
    )
    conn.commit()

    return {
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "display_name": user["display_name"],
            "email": user["email"],
            "role": user["role"],
            "tenant_id": user["tenant_id"] if "tenant_id" in user.keys() else "",
            "status": user["status"] if "status" in user.keys() else "active",
        },
    }


# ── Current User ─────────────────────────────────────────


@router.get("/me")
async def get_me(request: Request):
    """获取当前登录用户信息。"""
    user = verify_request_token(request)
    return user


# ── Logout ───────────────────────────────────────────────


@router.post("/logout")
async def logout(request: Request):
    """退出登录：删除当前 session。"""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        from database import get_connection
        conn = get_connection()
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
    return {"message": "已退出登录"}


# ── Change Password ──────────────────────────────────────


@router.post("/change-password")
async def change_password(request: Request, body: dict):
    """修改密码：需要旧密码验证。"""
    user = verify_request_token(request)

    old_password = body.get("old_password", "")
    new_password = body.get("new_password", "")

    if not old_password or not new_password:
        raise HTTPException(status_code=400, detail="请输入旧密码和新密码")

    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码至少 6 个字符")

    from database import get_connection
    conn = get_connection()
    full_user = _get_user_by_username(conn, user["username"])
    if not full_user:
        raise HTTPException(status_code=401, detail="用户不存在")

    if full_user["password_hash"] != _hash_password(old_password, full_user["salt"]):
        raise HTTPException(status_code=401, detail="旧密码错误")

    new_salt = secrets.token_hex(16)
    new_hash = _hash_password(new_password, new_salt)
    conn.execute(
        "UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?",
        (new_hash, new_salt, datetime.now(timezone.utc).isoformat(), user["id"]),
    )
    conn.commit()
    logger.info("User '%s' changed password", user["username"])
    return {"message": "密码修改成功"}
