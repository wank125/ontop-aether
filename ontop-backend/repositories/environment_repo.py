"""Environment repository — CRUD for fixed environments."""
import uuid
from datetime import datetime, timezone

from database import get_connection


def list_environments(project_id: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM environments WHERE project_id = ? ORDER BY CASE name WHEN 'dev' THEN 1 WHEN 'test' THEN 2 WHEN 'prod' THEN 3 ELSE 4 END",
        (project_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_environment(env_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM environments WHERE id = ?", (env_id,)).fetchone()
    return dict(row) if row else None


def get_environment_by_name(project_id: str, name: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM environments WHERE project_id = ? AND name = ?",
                       (project_id, name)).fetchone()
    return dict(row) if row else None


def create_environment(project_id: str, name: str, display_name: str = "") -> dict:
    eid = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    conn.execute(
        "INSERT INTO environments (id, project_id, name, display_name, created_at) VALUES (?, ?, ?, ?, ?)",
        (eid, project_id, name, display_name, now),
    )
    conn.commit()
    return {"id": eid, "project_id": project_id, "name": name,
            "display_name": display_name, "created_at": now}


def update_environment(env_id: str, updates: dict) -> dict | None:
    existing = get_environment(env_id)
    if not existing:
        return None
    fields, values = [], []
    for k in ("display_name", "endpoint_url", "active_registry_id", "settings_json"):
        if k in updates:
            fields.append(f"{k} = ?")
            values.append(updates[k])
    if fields:
        fields.append("updated_at = ?")
        values.append(datetime.now(timezone.utc).isoformat())
        values.append(env_id)
        conn = get_connection()
        conn.execute(f"UPDATE environments SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    return get_environment(env_id)
