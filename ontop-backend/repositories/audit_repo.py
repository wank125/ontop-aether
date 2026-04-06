"""Audit event repository — fire-and-forget writes with auto-prune."""
import json
import uuid
from datetime import datetime, timezone

from database import get_connection

_MAX_AUDIT_ROWS = 10000


def save_audit_event(event: dict) -> None:
    """Insert an audit event. Never raises — failures are logged only."""
    try:
        if "id" not in event or not event["id"]:
            event["id"] = str(uuid.uuid4())[:12]
        if "created_at" not in event or not event["created_at"]:
            event["created_at"] = datetime.now(timezone.utc).isoformat()

        conn = get_connection()
        conn.execute(
            """INSERT INTO audit_events
               (id, tenant_id, project_id, environment_id, event_type, event_category,
                actor_type, actor_user_id, actor_api_credential_id, actor_display,
                request_id, session_id, source_ip, user_agent,
                resource_type, resource_id, resource_name, action,
                status, duration_ms, error_code, error_message, metadata_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                event.get("id", ""),
                event.get("tenant_id", ""),
                event.get("project_id", ""),
                event.get("environment_id", ""),
                event.get("event_type", ""),
                event.get("event_category", ""),
                event.get("actor_type", "system"),
                event.get("actor_user_id", ""),
                event.get("actor_api_credential_id", ""),
                event.get("actor_display", ""),
                event.get("request_id", ""),
                event.get("session_id", ""),
                event.get("source_ip", ""),
                event.get("user_agent", ""),
                event.get("resource_type", ""),
                event.get("resource_id", ""),
                event.get("resource_name", ""),
                event.get("action", ""),
                event.get("status", "success"),
                event.get("duration_ms"),
                event.get("error_code", ""),
                event.get("error_message", ""),
                event.get("metadata_json", "{}"),
                event["created_at"],
            ),
        )
        conn.commit()
        _auto_prune(conn)
    except Exception:
        # Audit failures must never break the request
        import logging
        logging.getLogger(__name__).warning("Failed to save audit event", exc_info=True)


def _auto_prune(conn) -> None:
    """Keep audit_events under the row limit."""
    try:
        count = conn.execute("SELECT COUNT(*) FROM audit_events").fetchone()[0]
        if count > _MAX_AUDIT_ROWS:
            conn.execute(
                """DELETE FROM audit_events WHERE id IN (
                   SELECT id FROM audit_events ORDER BY created_at ASC LIMIT ?)""",
                (count - _MAX_AUDIT_ROWS,),
            )
            conn.commit()
    except Exception:
        pass


def list_audit_events(page: int = 1, page_size: int = 20,
                      event_type: str | None = None,
                      event_category: str | None = None,
                      actor: str | None = None,
                      resource_type: str | None = None,
                      status: str | None = None,
                      date_from: str | None = None,
                      date_to: str | None = None,
                      tenant_id: str | None = None,
                      project_id: str | None = None) -> dict:
    """Return paginated audit events with filters."""
    conn = get_connection()
    clauses, params = [], []
    if event_type:
        clauses.append("event_type = ?")
        params.append(event_type)
    if event_category:
        clauses.append("event_category = ?")
        params.append(event_category)
    if actor:
        clauses.append("(actor_user_id = ? OR actor_display LIKE ?)")
        params.extend([actor, f"%{actor}%"])
    if resource_type:
        clauses.append("resource_type = ?")
        params.append(resource_type)
    if status:
        clauses.append("status = ?")
        params.append(status)
    if date_from:
        clauses.append("created_at >= ?")
        params.append(date_from)
    if date_to:
        clauses.append("created_at <= ?")
        params.append(date_to)
    if tenant_id:
        clauses.append("tenant_id = ?")
        params.append(tenant_id)
    if project_id:
        clauses.append("project_id = ?")
        params.append(project_id)

    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    total = conn.execute(f"SELECT COUNT(*) FROM audit_events{where}", params).fetchone()[0]

    offset = (page - 1) * page_size
    rows = conn.execute(
        f"SELECT * FROM audit_events{where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        params + [page_size, offset],
    ).fetchall()

    return {
        "items": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def get_audit_stats(tenant_id: str = "", project_id: str = "") -> dict:
    conn = get_connection()
    clauses, params = [], []
    if tenant_id:
        clauses.append("tenant_id = ?")
        params.append(tenant_id)
    if project_id:
        clauses.append("project_id = ?")
        params.append(project_id)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""

    total = conn.execute(f"SELECT COUNT(*) FROM audit_events{where}", params).fetchone()[0]
    success = conn.execute(
        f"SELECT COUNT(*) FROM audit_events{where}{' AND ' if clauses else ' WHERE '}status = 'success'",
        params + ["success"],
    ).fetchone()[0]
    failure = conn.execute(
        f"SELECT COUNT(*) FROM audit_events{where}{' AND ' if clauses else ' WHERE '}status != 'success'",
        params + ["failure"],
    ).fetchone()[0]

    avg_duration = conn.execute(
        f"SELECT AVG(duration_ms) FROM audit_events{where}", params
    ).fetchone()[0] or 0

    return {
        "total": total,
        "success_count": success,
        "failure_count": failure,
        "success_rate": round(success / total, 4) if total > 0 else 1.0,
        "avg_duration_ms": round(avg_duration, 2),
    }
