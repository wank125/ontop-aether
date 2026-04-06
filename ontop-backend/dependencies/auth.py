"""API Key authentication dependency for FastAPI."""

import logging

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

# Header used by frontend to mark internal requests
INTERNAL_HEADER = "X-Internal-Request"


async def verify_api_key(request: Request):
    """FastAPI dependency that enforces API key when enabled.

    Skip conditions (no key required):
    1. api_enabled is false in publishing_config
    2. Request has X-Internal-Request header (frontend)
    3. Source IP is localhost (127.0.0.1 / ::1)

    Otherwise requires X-API-Key header or ?api_key= query param.
    """
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
