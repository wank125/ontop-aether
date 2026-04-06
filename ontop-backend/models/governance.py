"""P1-A governance Pydantic models."""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


# ── Tenant ──────────────────────────────────────────────

class Tenant(BaseModel):
    id: str
    code: str
    name: str
    status: str = "active"
    created_at: str
    updated_at: Optional[str] = None

    model_config = {"from_attributes": True}


class TenantCreate(BaseModel):
    code: str
    name: str


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[Literal["active", "disabled"]] = None


# ── Project ─────────────────────────────────────────────

class Project(BaseModel):
    id: str
    tenant_id: str
    code: str
    name: str
    description: str = ""
    owner_user_id: str = ""
    status: str = "active"
    created_at: str
    updated_at: Optional[str] = None

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    tenant_id: Optional[str] = None
    code: str
    name: str
    description: str = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[Literal["active", "archived"]] = None


# ── Environment ─────────────────────────────────────────

class Environment(BaseModel):
    id: str
    project_id: str
    name: str
    display_name: str = ""
    endpoint_url: str = ""
    active_registry_id: str = ""
    settings_json: str = "{}"
    created_at: str
    updated_at: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Role & Permission ───────────────────────────────────

class Role(BaseModel):
    id: str
    code: str
    name: str
    scope_type: str
    is_system: bool = True
    created_at: str
    permissions: list["Permission"] = []

    model_config = {"from_attributes": True}


class Permission(BaseModel):
    id: str
    code: str
    name: str
    resource_type: str
    action: str

    model_config = {"from_attributes": True}


class RolePermissionsUpdate(BaseModel):
    permission_ids: list[str]


# ── RoleBinding ─────────────────────────────────────────

class RoleBinding(BaseModel):
    id: str
    user_id: str
    role_id: str
    tenant_id: str = ""
    project_id: str = ""
    environment_id: str = ""
    created_at: str
    created_by: str = ""

    model_config = {"from_attributes": True}


class RoleBindingCreate(BaseModel):
    user_id: str
    role_code: str
    tenant_id: Optional[str] = None
    project_id: Optional[str] = None
    environment_id: Optional[str] = None


# ── ApiCredential ───────────────────────────────────────

class ApiCredential(BaseModel):
    id: str
    tenant_id: str = ""
    project_id: str = ""
    environment_id: str = ""
    name: str
    type: str = "human"
    key_prefix: str = ""
    status: str = "active"
    expires_at: Optional[str] = None
    last_used_at: Optional[str] = None
    allowed_scopes_json: str = "[]"
    allowed_ips_json: str = "[]"
    created_at: str
    updated_at: Optional[str] = None

    model_config = {"from_attributes": True}


class ApiCredentialCreateResult(ApiCredential):
    """Returned once on creation — includes the full secret key."""
    secret: str


class ApiCredentialCreate(BaseModel):
    project_id: Optional[str] = None
    environment_id: Optional[str] = None
    name: str
    type: Literal["system", "human", "agent", "integration"] = "human"
    expires_at: Optional[str] = None
    allowed_scopes: list[str] = []
    allowed_ips: list[str] = []


class ApiCredentialUpdate(BaseModel):
    name: Optional[str] = None
    expires_at: Optional[str] = None
    allowed_scopes: Optional[list[str]] = None
    allowed_ips: Optional[list[str]] = None


# ── AuditEvent ──────────────────────────────────────────

class AuditEvent(BaseModel):
    id: str
    tenant_id: str = ""
    project_id: str = ""
    environment_id: str = ""
    event_type: str = ""
    event_category: str = ""
    actor_type: str = "system"
    actor_user_id: str = ""
    actor_api_credential_id: str = ""
    actor_display: str = ""
    request_id: str = ""
    session_id: str = ""
    source_ip: str = ""
    user_agent: str = ""
    resource_type: str = ""
    resource_id: str = ""
    resource_name: str = ""
    action: str = ""
    status: str = "success"
    duration_ms: Optional[float] = None
    error_code: str = ""
    error_message: str = ""
    metadata_json: str = "{}"
    created_at: str

    model_config = {"from_attributes": True}


class AuditEventFilter(BaseModel):
    page: int = 1
    page_size: int = 20
    event_type: Optional[str] = None
    event_category: Optional[str] = None
    actor: Optional[str] = None
    resource_type: Optional[str] = None
    status: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    tenant_id: Optional[str] = None
    project_id: Optional[str] = None
