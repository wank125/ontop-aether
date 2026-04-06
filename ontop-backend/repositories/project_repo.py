"""Project repository — CRUD for projects."""
import uuid
from datetime import datetime, timezone

from database import get_connection


def list_projects(tenant_id: str | None = None) -> list[dict]:
    conn = get_connection()
    if tenant_id:
        rows = conn.execute("SELECT * FROM projects WHERE tenant_id = ? ORDER BY created_at", (tenant_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM projects ORDER BY created_at").fetchall()
    return [dict(r) for r in rows]


def get_project(project_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    return dict(row) if row else None


def create_project(tenant_id: str, code: str, name: str, description: str = "",
                   owner_user_id: str = "") -> dict:
    pid = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    conn.execute(
        "INSERT INTO projects (id, tenant_id, code, name, description, owner_user_id, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (pid, tenant_id, code, name, description, owner_user_id, "active", now),
    )
    conn.commit()
    return {"id": pid, "tenant_id": tenant_id, "code": code, "name": name,
            "description": description, "owner_user_id": owner_user_id,
            "status": "active", "created_at": now}


def update_project(project_id: str, updates: dict) -> dict | None:
    existing = get_project(project_id)
    if not existing:
        return None
    fields, values = [], []
    for k in ("name", "description", "status", "owner_user_id"):
        if k in updates:
            fields.append(f"{k} = ?")
            values.append(updates[k])
    if fields:
        fields.append("updated_at = ?")
        values.append(datetime.now(timezone.utc).isoformat())
        values.append(project_id)
        conn = get_connection()
        conn.execute(f"UPDATE projects SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    return get_project(project_id)


def archive_project(project_id: str) -> dict | None:
    return update_project(project_id, {"status": "archived"})
