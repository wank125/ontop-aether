"""Governance REST API — tenants, projects, environments, roles, bindings, api-keys, audit.

Prefix: /api/v1/governance
"""
from __future__ import annotations

import hashlib
import json
import logging
import secrets as _sec
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter(prefix="/governance", tags=["governance"])
logger = logging.getLogger(__name__)


# ── Helpers ──────────────────────────────────────────────

def _get_conn():
    from database import get_connection
    return get_connection()


def _current_user(request: Request) -> dict:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(401, "未认证")
    return user if isinstance(user, dict) else {}


def _governance_ctx(request: Request) -> dict:
    return getattr(request.state, "governance_context", {}) or {}


# ══════════════════════════════════════════════════════════
# Tenants
# ══════════════════════════════════════════════════════════

@router.get("/tenants")
async def list_tenants():
    from repositories.tenant_repo import list_tenants as _list
    return _list()


@router.get("/tenants/{tenant_id}")
async def get_tenant(tenant_id: str):
    from repositories.tenant_repo import get_tenant as _get
    t = _get(tenant_id)
    if not t:
        raise HTTPException(404, "租户不存在")
    return t


# ══════════════════════════════════════════════════════════
# Projects
# ══════════════════════════════════════════════════════════

@router.get("/projects")
async def list_projects(tenant_id: Optional[str] = Query(None)):
    from repositories.project_repo import list_projects as _list
    return _list(tenant_id=tenant_id)


@router.post("/projects", status_code=201)
async def create_project(body: dict, request: Request):
    user = _current_user(request)
    ctx = _governance_ctx(request)
    tenant_id = body.get("tenant_id") or ctx.get("tenant_id", "")
    code = body.get("code", "").strip()
    name = body.get("name", "").strip()
    if not code or not name:
        raise HTTPException(400, "code 和 name 不能为空")

    from repositories.project_repo import create_project
    project = create_project(
        tenant_id=tenant_id, code=code, name=name,
        description=body.get("description", ""),
        owner_user_id=user.get("id", ""),
    )
    # Auto-create dev/test/prod environments
    from repositories.environment_repo import create_environment
    for env_name, display in [("dev", "开发"), ("test", "测试"), ("prod", "生产")]:
        create_environment(project["id"], env_name, display)

    return project


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    from repositories.project_repo import get_project as _get
    p = _get(project_id)
    if not p:
        raise HTTPException(404, "项目不存在")
    return p


@router.put("/projects/{project_id}")
async def update_project(project_id: str, body: dict):
    from repositories.project_repo import update_project as _update
    p = _update(project_id, body)
    if not p:
        raise HTTPException(404, "项目不存在")
    return p


@router.get("/projects/{project_id}/environments")
async def list_environments(project_id: str):
    from repositories.environment_repo import list_environments as _list
    return _list(project_id)


@router.get("/projects/{project_id}/members")
async def list_project_members(project_id: str):
    from repositories.role_binding_repo import list_bindings
    return list_bindings(project_id=project_id)


# ══════════════════════════════════════════════════════════
# Roles & Permissions
# ══════════════════════════════════════════════════════════

@router.get("/roles")
async def list_roles():
    from repositories.role_repo import list_roles as _list
    return _list()


@router.get("/permissions")
async def list_permissions():
    from repositories.role_repo import list_permissions as _list
    return _list()


@router.get("/roles/{role_id}")
async def get_role(role_id: str):
    from repositories.role_repo import get_role as _get
    r = _get(role_id)
    if not r:
        raise HTTPException(404, "角色不存在")
    return r


@router.put("/roles/{role_id}/permissions")
async def update_role_permissions(role_id: str, body: dict, request: Request):
    user = _current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(403, "仅管理员可修改角色权限")
    from repositories.role_repo import assign_role_permissions
    assign_role_permissions(role_id, body.get("permission_ids", []))
    from repositories.role_repo import get_role as _get
    return _get(role_id)


# ══════════════════════════════════════════════════════════
# Role Bindings
# ══════════════════════════════════════════════════════════

@router.get("/bindings")
async def list_bindings(
    user_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None),
):
    from repositories.role_binding_repo import list_bindings as _list
    return _list(user_id=user_id, project_id=project_id, tenant_id=tenant_id)


@router.post("/bindings", status_code=201)
async def create_binding(body: dict, request: Request):
    user = _current_user(request)
    role_code = body.get("role_code", "")
    if not role_code:
        raise HTTPException(400, "role_code 不能为空")

    from repositories.role_repo import get_role_by_code
    role = get_role_by_code(role_code)
    if not role:
        raise HTTPException(400, f"角色 {role_code} 不存在")

    ctx = _governance_ctx(request)
    from repositories.role_binding_repo import create_binding
    return create_binding(
        user_id=body.get("user_id", ""),
        role_id=role["id"],
        tenant_id=body.get("tenant_id") or ctx.get("tenant_id", ""),
        project_id=body.get("project_id") or ctx.get("project_id", ""),
        environment_id=body.get("environment_id", ""),
        created_by=user.get("id", ""),
    )


@router.delete("/bindings/{binding_id}")
async def delete_binding(binding_id: str):
    from repositories.role_binding_repo import delete_binding as _del
    ok = _del(binding_id)
    if not ok:
        raise HTTPException(404, "绑定不存在")
    return {"deleted": True}


# ══════════════════════════════════════════════════════════
# API Keys
# ══════════════════════════════════════════════════════════

@router.get("/api-keys")
async def list_api_keys(
    project_id: Optional[str] = Query(None),
    environment_id: Optional[str] = Query(None),
):
    from repositories.api_credential_repo import list_credentials
    return list_credentials(project_id=project_id or "", environment_id=environment_id or "")


@router.post("/api-keys", status_code=201)
async def create_api_key(body: dict, request: Request):
    user = _current_user(request)
    ctx = _governance_ctx(request)

    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(400, "name 不能为空")

    project_id = body.get("project_id") or ctx.get("project_id", "")
    environment_id = body.get("environment_id") or ctx.get("environment_id", "")
    tenant_id = ctx.get("tenant_id", "")
    cred_type = body.get("type", "human")

    # Determine env short name for key prefix
    env_name = "dev"
    if environment_id:
        conn = _get_conn()
        env_row = conn.execute("SELECT name FROM environments WHERE id = ?", (environment_id,)).fetchone()
        if env_row:
            env_name = env_row[0]

    # Generate key: oak_{env}_{public8}.{secret32}
    public_part = _sec.token_hex(4)
    secret_part = _sec.token_hex(16)
    full_key = f"oak_{env_name}_{public_part}.{secret_part}"
    key_prefix = f"oak_{env_name}_{public_part}"
    secret_hash = hashlib.sha256(secret_part.encode()).hexdigest()

    from database import encrypt_value
    secret_encrypted = encrypt_value(secret_part)

    from repositories.api_credential_repo import create_credential
    result = create_credential(
        tenant_id=tenant_id,
        project_id=project_id,
        environment_id=environment_id,
        name=name,
        cred_type=cred_type,
        key_prefix=key_prefix,
        secret_hash=secret_hash,
        secret_encrypted=secret_encrypted,
        created_by_user_id=user.get("id", ""),
        expires_at=body.get("expires_at"),
        allowed_scopes_json=json.dumps(body.get("allowed_scopes", [])),
        allowed_ips_json=json.dumps(body.get("allowed_ips", [])),
    )
    # Attach the full secret (shown only once)
    result["secret"] = full_key
    return result


@router.get("/api-keys/{cred_id}")
async def get_api_key(cred_id: str):
    from repositories.api_credential_repo import get_credential
    c = get_credential(cred_id)
    if not c:
        raise HTTPException(404, "凭据不存在")
    return c


@router.put("/api-keys/{cred_id}")
async def update_api_key(cred_id: str, body: dict):
    from repositories.api_credential_repo import update_credential
    updates = {}
    if "name" in body:
        updates["name"] = body["name"]
    if "expires_at" in body:
        updates["expires_at"] = body["expires_at"]
    if "allowed_scopes" in body:
        updates["allowed_scopes_json"] = json.dumps(body["allowed_scopes"])
    if "allowed_ips" in body:
        updates["allowed_ips_json"] = json.dumps(body["allowed_ips"])
    c = update_credential(cred_id, updates)
    if not c:
        raise HTTPException(404, "凭据不存在")
    return c


@router.post("/api-keys/{cred_id}/revoke")
async def revoke_api_key(cred_id: str):
    from repositories.api_credential_repo import revoke_credential
    c = revoke_credential(cred_id)
    if not c:
        raise HTTPException(404, "凭据不存在")
    return c


# ══════════════════════════════════════════════════════════
# Audit
# ══════════════════════════════════════════════════════════

@router.get("/audit")
async def list_audit_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    event_type: Optional[str] = Query(None),
    event_category: Optional[str] = Query(None),
    actor: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
):
    from repositories.audit_repo import list_audit_events
    return list_audit_events(
        page=page, page_size=page_size,
        event_type=event_type, event_category=event_category,
        actor=actor, resource_type=resource_type,
        status=status, date_from=date_from, date_to=date_to,
        tenant_id=tenant_id, project_id=project_id,
    )


@router.get("/audit/stats")
async def get_audit_stats(
    tenant_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
):
    from repositories.audit_repo import get_audit_stats
    return get_audit_stats(tenant_id=tenant_id or "", project_id=project_id or "")
