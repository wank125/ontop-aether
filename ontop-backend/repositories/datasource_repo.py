"""Datasource repository — SQLite-backed CRUD with password encryption."""
import uuid
from datetime import datetime

from database import get_connection, encrypt_value, decrypt_value


def list_datasources() -> list[dict]:
    """Return all datasources (passwords decrypted)."""
    conn = get_connection()
    rows = conn.execute("SELECT * FROM datasources ORDER BY created_at").fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["password"] = decrypt_value(d.pop("password_encrypted"))
        result.append(d)
    return result


def get_datasource(ds_id: str) -> dict | None:
    """Get a single datasource by ID (password decrypted)."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM datasources WHERE id = ?", (ds_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["password"] = decrypt_value(d.pop("password_encrypted"))
    return d


def create_datasource(name: str, jdbc_url: str, user: str, password: str,
                      driver: str = "org.postgresql.Driver") -> dict:
    """Create a new datasource. Returns the created record."""
    ds_id = str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    conn = get_connection()
    conn.execute(
        """INSERT INTO datasources (id, name, jdbc_url, user, password_encrypted, driver, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (ds_id, name, jdbc_url, user, encrypt_value(password), driver, now),
    )
    conn.commit()
    return {
        "id": ds_id,
        "name": name,
        "jdbc_url": jdbc_url,
        "user": user,
        "password": password,
        "driver": driver,
        "created_at": now,
    }


def update_datasource(ds_id: str, updates: dict) -> dict | None:
    """Update a datasource. Encrypts password if present."""
    existing = get_datasource(ds_id)
    if not existing:
        return None

    # Remove 'password' from updates to handle separately
    password = updates.pop("password", None)

    fields = []
    values = []
    for k, v in updates.items():
        if k in ("id", "created_at"):
            continue
        fields.append(f"{k} = ?")
        values.append(v)

    if password is not None:
        fields.append("password_encrypted = ?")
        values.append(encrypt_value(password))

    if fields:
        fields.append("updated_at = ?")
        values.append(datetime.now().isoformat())
        values.append(ds_id)
        conn = get_connection()
        conn.execute(
            f"UPDATE datasources SET {', '.join(fields)} WHERE id = ?",
            values,
        )
        conn.commit()

    return get_datasource(ds_id)


def delete_datasource(ds_id: str) -> bool:
    """Delete a datasource. Returns True if deleted."""
    conn = get_connection()
    cursor = conn.execute("DELETE FROM datasources WHERE id = ?", (ds_id,))
    conn.commit()
    return cursor.rowcount > 0
