"""Permission dependency — require_permission(code) for FastAPI routes."""
from __future__ import annotations

from fastapi import HTTPException, Request


def require_permission(permission_code: str):
    """FastAPI dependency factory: check if current user has a specific permission.

    - Admin users (users.role == 'admin') bypass all checks.
    - Other users: query role_bindings → role_permissions for effective permissions.
    """
    async def _check(request: Request):
        user = getattr(request.state, "user", None)
        if not user:
            raise HTTPException(status_code=401, detail="未认证")

        # Admin superuser bypass
        if isinstance(user, dict) and user.get("role") == "admin":
            return

        user_id = user.get("id", "") if isinstance(user, dict) else getattr(user, "id", "")
        if not user_id:
            raise HTTPException(status_code=401, detail="未认证")

        # Resolve governance context for scoped permission check
        gov = getattr(request.state, "governance_context", {}) or {}
        tenant_id = gov.get("tenant_id", "") if isinstance(gov, dict) else ""
        project_id = gov.get("project_id", "") if isinstance(gov, dict) else ""

        from repositories.role_binding_repo import get_user_permissions
        perms = get_user_permissions(user_id, tenant_id=tenant_id, project_id=project_id)
        perm_codes = {p["code"] for p in perms}

        if permission_code not in perm_codes:
            raise HTTPException(
                status_code=403,
                detail=f"权限不足: 需要 {permission_code}",
            )

    return _check
