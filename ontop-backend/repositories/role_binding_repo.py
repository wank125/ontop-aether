"""Role binding repository — user role assignments with scope."""
import uuid
from datetime import datetime, timezone

from database import get_connection


def list_bindings(user_id: str | None = None, role_id: str | None = None,
                  tenant_id: str | None = None, project_id: str | None = None) -> list[dict]:
    conn = get_connection()
    clauses, params = [], []
    if user_id:
        clauses.append("rb.user_id = ?")
        params.append(user_id)
    if role_id:
        clauses.append("rb.role_id = ?")
        params.append(role_id)
    if tenant_id:
        clauses.append("rb.tenant_id = ?")
        params.append(tenant_id)
    if project_id:
        clauses.append("rb.project_id = ?")
        params.append(project_id)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = conn.execute(
        f"""SELECT rb.*, r.code as role_code, r.name as role_name, u.username, u.display_name
            FROM role_bindings rb
            JOIN roles r ON r.id = rb.role_id
            JOIN users u ON u.id = rb.user_id
            {where}
            ORDER BY rb.created_at DESC""",
        params,
    ).fetchall()
    return [dict(r) for r in rows]


def get_binding(binding_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute(
        """SELECT rb.*, r.code as role_code, r.name as role_name, u.username, u.display_name
           FROM role_bindings rb
           JOIN roles r ON r.id = rb.role_id
           JOIN users u ON u.id = rb.user_id
           WHERE rb.id = ?""",
        (binding_id,),
    ).fetchone()
    return dict(row) if row else None


def create_binding(user_id: str, role_id: str, tenant_id: str = "",
                   project_id: str = "", environment_id: str = "",
                   created_by: str = "") -> dict:
    bid = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    conn.execute(
        "INSERT INTO role_bindings (id, user_id, role_id, tenant_id, project_id, environment_id, created_at, created_by) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (bid, user_id, role_id, tenant_id, project_id, environment_id, now, created_by),
    )
    conn.commit()
    return get_binding(bid)


def delete_binding(binding_id: str) -> bool:
    conn = get_connection()
    cursor = conn.execute("DELETE FROM role_bindings WHERE id = ?", (binding_id,))
    conn.commit()
    return cursor.rowcount > 0


def get_user_permissions(user_id: str, tenant_id: str = "",
                         project_id: str = "") -> list[dict]:
    """Return effective permission set for a user at a given scope."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT DISTINCT p.* FROM permissions p
           JOIN role_permissions rp ON rp.permission_id = p.id
           JOIN role_bindings rb ON rb.role_id = rp.role_id
           WHERE rb.user_id = ?
             AND (rb.tenant_id = '' OR rb.tenant_id = ?)
             AND (rb.project_id = '' OR rb.project_id = ?)""",
        (user_id, tenant_id, project_id),
    ).fetchall()
    return [dict(r) for r in rows]


def get_user_roles(user_id: str) -> list[dict]:
    """Return all role bindings for a user."""
    return list_bindings(user_id=user_id)
