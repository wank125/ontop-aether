"""API credential repository — CRUD for independent API keys."""
import uuid
from datetime import datetime, timezone

from database import get_connection


def list_credentials(tenant_id: str = "", project_id: str = "",
                     environment_id: str = "") -> list[dict]:
    conn = get_connection()
    clauses, params = [], []
    if tenant_id:
        clauses.append("tenant_id = ?")
        params.append(tenant_id)
    if project_id:
        clauses.append("project_id = ?")
        params.append(project_id)
    if environment_id:
        clauses.append("environment_id = ?")
        params.append(environment_id)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = conn.execute(
        f"SELECT id, tenant_id, project_id, environment_id, name, type, key_prefix, status, "
        f"expires_at, last_used_at, allowed_scopes_json, allowed_ips_json, created_at, updated_at "
        f"FROM api_credentials{where} ORDER BY created_at DESC",
        params,
    ).fetchall()
    return [dict(r) for r in rows]


def get_credential(cred_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT id, tenant_id, project_id, environment_id, name, type, key_prefix, status, "
        "expires_at, last_used_at, allowed_scopes_json, allowed_ips_json, created_at, updated_at "
        "FROM api_credentials WHERE id = ?",
        (cred_id,),
    ).fetchone()
    return dict(row) if row else None


def get_credential_by_prefix(key_prefix: str) -> dict | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM api_credentials WHERE key_prefix = ? AND status = 'active'",
        (key_prefix,),
    ).fetchone()
    return dict(row) if row else None


def create_credential(tenant_id: str, project_id: str, environment_id: str,
                      name: str, cred_type: str, key_prefix: str,
                      secret_hash: str, secret_encrypted: str,
                      created_by_user_id: str, expires_at: str | None = None,
                      allowed_scopes_json: str = "[]",
                      allowed_ips_json: str = "[]") -> dict:
    cid = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    conn.execute(
        """INSERT INTO api_credentials
           (id, tenant_id, project_id, environment_id, name, type, key_prefix,
            secret_hash, secret_encrypted, created_by_user_id, expires_at,
            allowed_scopes_json, allowed_ips_json, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (cid, tenant_id, project_id, environment_id, name, cred_type, key_prefix,
         secret_hash, secret_encrypted, created_by_user_id, expires_at,
         allowed_scopes_json, allowed_ips_json, "active", now),
    )
    conn.commit()
    return {
        "id": cid, "tenant_id": tenant_id, "project_id": project_id,
        "environment_id": environment_id, "name": name, "type": cred_type,
        "key_prefix": key_prefix, "status": "active", "expires_at": expires_at,
        "allowed_scopes_json": allowed_scopes_json, "allowed_ips_json": allowed_ips_json,
        "created_at": now,
    }


def revoke_credential(cred_id: str) -> dict | None:
    conn = get_connection()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE api_credentials SET status = 'revoked', updated_at = ? WHERE id = ?",
        (now, cred_id),
    )
    conn.commit()
    return get_credential(cred_id)


def update_credential(cred_id: str, updates: dict) -> dict | None:
    existing = get_credential(cred_id)
    if not existing:
        return None
    fields, values = [], []
    for k in ("name", "expires_at", "allowed_scopes_json", "allowed_ips_json"):
        if k in updates:
            fields.append(f"{k} = ?")
            values.append(updates[k])
    if fields:
        fields.append("updated_at = ?")
        values.append(datetime.now(timezone.utc).isoformat())
        values.append(cred_id)
        conn = get_connection()
        conn.execute(f"UPDATE api_credentials SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    return get_credential(cred_id)


def update_last_used(cred_id: str) -> None:
    conn = get_connection()
    conn.execute(
        "UPDATE api_credentials SET last_used_at = ? WHERE id = ?",
        (datetime.now(timezone.utc).isoformat(), cred_id),
    )
    conn.commit()
