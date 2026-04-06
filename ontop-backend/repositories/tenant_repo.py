"""Tenant repository — CRUD for tenants."""
import uuid
from datetime import datetime, timezone

from database import get_connection


def list_tenants() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM tenants ORDER BY created_at").fetchall()
    return [dict(r) for r in rows]


def get_tenant(tenant_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,)).fetchone()
    return dict(row) if row else None


def get_tenant_by_code(code: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM tenants WHERE code = ?", (code,)).fetchone()
    return dict(row) if row else None


def create_tenant(code: str, name: str) -> dict:
    tid = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    conn.execute(
        "INSERT INTO tenants (id, code, name, status, created_at) VALUES (?, ?, ?, ?, ?)",
        (tid, code, name, "active", now),
    )
    conn.commit()
    return {"id": tid, "code": code, "name": name, "status": "active", "created_at": now}


def update_tenant(tenant_id: str, updates: dict) -> dict | None:
    existing = get_tenant(tenant_id)
    if not existing:
        return None
    fields, values = [], []
    for k in ("name", "status"):
        if k in updates:
            fields.append(f"{k} = ?")
            values.append(updates[k])
    if fields:
        fields.append("updated_at = ?")
        values.append(datetime.now(timezone.utc).isoformat())
        values.append(tenant_id)
        conn = get_connection()
        conn.execute(f"UPDATE tenants SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    return get_tenant(tenant_id)
