"""Governance context resolver — resolve tenant/project/environment from request."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from fastapi import Request

logger = logging.getLogger(__name__)


@dataclass
class GovernanceContext:
    tenant_id: str = ""
    tenant_code: str = ""
    project_id: str = ""
    project_code: str = ""
    environment_id: str = ""
    env_name: str = ""


# Module-level cache for default IDs (populated once)
_default_ids: dict = {}


def _load_defaults() -> dict:
    """Load default tenant/project/dev environment IDs from DB."""
    global _default_ids
    if _default_ids:
        return _default_ids
    try:
        from database import get_connection
        conn = get_connection()
        tenant = conn.execute("SELECT id, code FROM tenants WHERE code = 'default'").fetchone()
        if not tenant:
            return {}
        project = conn.execute("SELECT id, code FROM projects WHERE tenant_id = ? AND code = 'default'", (tenant[0],)).fetchone()
        dev_env = None
        if project:
            dev_env = conn.execute("SELECT id, name FROM environments WHERE project_id = ? AND name = 'dev'", (project[0],)).fetchone()
        _default_ids = {
            "tenant_id": tenant[0], "tenant_code": tenant[1],
            "project_id": project[0] if project else "", "project_code": project[1] if project else "",
            "environment_id": dev_env[0] if dev_env else "", "env_name": dev_env[1] if dev_env else "dev",
        }
    except Exception:
        logger.warning("Could not load default governance context", exc_info=True)
    return _default_ids


def resolve_context(request: Request) -> GovernanceContext:
    """Resolve governance context from request headers or API credential.

    Sets ``request.state.governance_context`` with a GovernanceContext dict.
    """
    # Check for API credential context first (set by auth.py)
    api_ctx = getattr(request.state, "api_credential", None)
    if api_ctx and isinstance(api_ctx, dict):
        ctx = GovernanceContext(
            tenant_id=api_ctx.get("tenant_id", ""),
            project_id=api_ctx.get("project_id", ""),
            environment_id=api_ctx.get("environment_id", ""),
        )
        # Enrich codes
        _enrich_codes(ctx)
        request.state.governance_context = ctx.__dict__
        return ctx

    # Check headers
    h_tid = request.headers.get("X-Tenant-Id", "")
    h_pid = request.headers.get("X-Project-Id", "")
    h_eid = request.headers.get("X-Environment-Id", "")

    if h_tid or h_pid or h_eid:
        ctx = GovernanceContext(tenant_id=h_tid, project_id=h_pid, environment_id=h_eid)
        _enrich_codes(ctx)
        request.state.governance_context = ctx.__dict__
        return ctx

    # Default fallback
    defaults = _load_defaults()
    ctx = GovernanceContext(
        tenant_id=defaults.get("tenant_id", ""),
        tenant_code=defaults.get("tenant_code", ""),
        project_id=defaults.get("project_id", ""),
        project_code=defaults.get("project_code", ""),
        environment_id=defaults.get("environment_id", ""),
        env_name=defaults.get("env_name", "dev"),
    )
    request.state.governance_context = ctx.__dict__
    return ctx


def _enrich_codes(ctx: GovernanceContext) -> None:
    """Fill in code/name fields from IDs using DB lookups."""
    try:
        from database import get_connection
        conn = get_connection()
        if ctx.tenant_id and not ctx.tenant_code:
            row = conn.execute("SELECT code FROM tenants WHERE id = ?", (ctx.tenant_id,)).fetchone()
            if row:
                ctx.tenant_code = row[0]
        if ctx.project_id and not ctx.project_code:
            row = conn.execute("SELECT code FROM projects WHERE id = ?", (ctx.project_id,)).fetchone()
            if row:
                ctx.project_code = row[0]
        if ctx.environment_id and not ctx.env_name:
            row = conn.execute("SELECT name FROM environments WHERE id = ?", (ctx.environment_id,)).fetchone()
            if row:
                ctx.env_name = row[0]
    except Exception:
        pass


def get_context(request: Request) -> GovernanceContext:
    """FastAPI dependency: return the governance context for the current request."""
    raw = getattr(request.state, "governance_context", None)
    if raw and isinstance(raw, dict):
        return GovernanceContext(**raw)
    return GovernanceContext()
