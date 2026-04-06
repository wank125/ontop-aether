"""API Key + Bearer token authentication dependency for FastAPI."""

import logging

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

# Header used by frontend to mark internal requests
INTERNAL_HEADER = "X-Internal-Request"

# Paths that never require authentication
PUBLIC_PATHS = ("/api/v1/auth/login", "/api/v1/health", "/api/v1/docs", "/api/v1/openapi.json", "/api/v1/redoc")


async def verify_api_key(request: Request):
    """FastAPI dependency that enforces authentication.

    Auth chain (first match wins):
    1. PUBLIC_PATHS — skip auth
    2. Bearer token — validate against sessions table
    3. X-Internal-Request header — frontend internal bypass
    4. Localhost — local access bypass
    5. X-API-Key / ?api_key= — legacy API key auth

    Otherwise raises 401.
    """
    path = request.url.path

    # Public paths
    if path in PUBLIC_PATHS:
        return

    # Bearer token
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        from routers.auth import _validate_token
        from database import get_connection
        token = auth_header[7:]
        conn = get_connection()
        user = _validate_token(conn, token)
        if user:
            request.state.user = user
            return
        raise HTTPException(status_code=401, detail="token 无效或已过期")

    # API key enforcement check
    from repositories.publishing_repo import load_publishing_config
    from database import decrypt_value

    config = load_publishing_config()

    # Not enforced
    if not config.get("api_enabled"):
        return

    # Internal frontend request
    if request.headers.get(INTERNAL_HEADER):
        return

    # Localhost bypass
    client_host = request.client.host if request.client else ""
    if client_host in ("127.0.0.1", "::1", "localhost"):
        return

    # Extract API key
    api_key = request.headers.get("X-API-Key") or request.query_params.get("api_key")

    if not api_key:
        raise HTTPException(status_code=401, detail="API key required. Use X-API-Key header or ?api_key= parameter.")

    # Compare with stored key
    stored_key = config.get("api_key", "")
    if config.get("api_key_encrypted") and stored_key:
        try:
            stored_key = decrypt_value(stored_key)
        except Exception:
            pass

    if api_key != stored_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
