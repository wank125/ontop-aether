"""Role & permission repository — read-only for system roles/permissions."""
from database import get_connection


def list_roles() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM roles ORDER BY created_at").fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["is_system"] = bool(d.get("is_system", 0))
        # 附带权限列表
        perms = conn.execute(
            """SELECT p.* FROM permissions p
               JOIN role_permissions rp ON rp.permission_id = p.id
               WHERE rp.role_id = ?""",
            (d["id"],),
        ).fetchall()
        d["permissions"] = [dict(p) for p in perms]
        result.append(d)
    return result


def get_role(role_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM roles WHERE id = ?", (role_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["is_system"] = bool(d.get("is_system", 0))
    perms = conn.execute(
        """SELECT p.* FROM permissions p
           JOIN role_permissions rp ON rp.permission_id = p.id
           WHERE rp.role_id = ?""",
        (d["id"],),
    ).fetchall()
    d["permissions"] = [dict(p) for p in perms]
    return d


def get_role_by_code(code: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM roles WHERE code = ?", (code,)).fetchone()
    if not row:
        return None
    return get_role(row["id"])


def list_permissions() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM permissions ORDER BY resource_type, action").fetchall()
    return [dict(r) for r in rows]


def get_permission_by_code(code: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM permissions WHERE code = ?", (code,)).fetchone()
    return dict(row) if row else None


def get_role_permissions(role_id: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """SELECT p.* FROM permissions p
           JOIN role_permissions rp ON rp.permission_id = p.id
           WHERE rp.role_id = ?""",
        (role_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def assign_role_permissions(role_id: str, permission_ids: list[str]) -> None:
    conn = get_connection()
    conn.execute("DELETE FROM role_permissions WHERE role_id = ?", (role_id,))
    for pid in permission_ids:
        conn.execute(
            "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
            (role_id, pid),
        )
    conn.commit()
