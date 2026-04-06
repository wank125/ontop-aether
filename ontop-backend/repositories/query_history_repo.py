"""Query history repository — SQLite-backed with auto-prune and audit support."""
import uuid
from datetime import datetime

from database import get_connection

MAX_HISTORY = 500


def list_history(project_id: str | None = None) -> list[dict]:
    """Return query history, most recent first. Optionally filter by project_id."""
    conn = get_connection()
    if project_id:
        rows = conn.execute(
            "SELECT id, query, timestamp, result_count, source_ip, caller, duration_ms, status, error_message "
            "FROM query_history WHERE project_id = ? OR project_id = '' ORDER BY timestamp DESC",
            (project_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, query, timestamp, result_count, source_ip, caller, duration_ms, status, error_message FROM query_history ORDER BY timestamp DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def save_to_history(
    query: str,
    result_count: int | None = None,
    source_ip: str = "",
    caller: str = "web",
    duration_ms: float | None = None,
    status: str = "ok",
    error_message: str = "",
) -> dict:
    """Save a query to history with audit fields. Auto-prunes to MAX_HISTORY entries."""
    entry_id = str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()

    conn = get_connection()
    conn.execute(
        """INSERT INTO query_history
           (id, query, timestamp, result_count, source_ip, caller, duration_ms, status, error_message)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (entry_id, query, now, result_count, source_ip, caller, duration_ms, status, error_message),
    )
    # Auto-prune: keep only the latest MAX_HISTORY
    conn.execute(
        """DELETE FROM query_history WHERE id NOT IN (
            SELECT id FROM query_history ORDER BY timestamp DESC LIMIT ?
        )""",
        (MAX_HISTORY,),
    )
    conn.commit()

    return {"id": entry_id, "query": query, "timestamp": now, "result_count": result_count}


def delete_history_entry(entry_id: str) -> bool:
    """Delete a single history entry. Returns True if deleted."""
    conn = get_connection()
    cursor = conn.execute("DELETE FROM query_history WHERE id = ?", (entry_id,))
    conn.commit()
    return cursor.rowcount > 0


def clear_history():
    """Delete all history entries."""
    conn = get_connection()
    conn.execute("DELETE FROM query_history")
    conn.commit()


# ── Audit helpers ─────────────────────────────────────────

def list_audit_logs(
    page: int = 1,
    page_size: int = 20,
    caller: str | None = None,
    status: str | None = None,
) -> dict:
    """Paginated audit log retrieval with optional filters."""
    conn = get_connection()
    where_parts = []
    params = []
    if caller:
        where_parts.append("caller = ?")
        params.append(caller)
    if status:
        where_parts.append("status = ?")
        params.append(status)
    where_sql = (" WHERE " + " AND ".join(where_parts)) if where_parts else ""

    total = conn.execute(f"SELECT COUNT(*) FROM query_history{where_sql}", params).fetchone()[0]

    offset = (page - 1) * page_size
    rows = conn.execute(
        f"""SELECT id, query, timestamp, result_count, source_ip, caller, duration_ms, status, error_message
            FROM query_history{where_sql}
            ORDER BY timestamp DESC LIMIT ? OFFSET ?""",
        params + [page_size, offset],
    ).fetchall()

    return {
        "items": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def get_audit_stats() -> dict:
    """Aggregate audit statistics."""
    conn = get_connection()

    total = conn.execute("SELECT COUNT(*) FROM query_history").fetchone()[0]
    ok_count = conn.execute("SELECT COUNT(*) FROM query_history WHERE status = 'ok'").fetchone()[0]
    error_count = conn.execute("SELECT COUNT(*) FROM query_history WHERE status = 'error'").fetchone()[0]

    avg_duration = conn.execute(
        "SELECT AVG(duration_ms) FROM query_history WHERE duration_ms IS NOT NULL"
    ).fetchone()[0] or 0.0

    # Breakdown by caller
    caller_rows = conn.execute(
        "SELECT caller, COUNT(*) as cnt FROM query_history GROUP BY caller"
    ).fetchall()
    by_caller = {r["caller"]: r["cnt"] for r in caller_rows}

    # Recent errors (last 5)
    error_rows = conn.execute(
        """SELECT id, query, timestamp, source_ip, caller, duration_ms, status, error_message
           FROM query_history WHERE status = 'error'
           ORDER BY timestamp DESC LIMIT 5"""
    ).fetchall()

    return {
        "total_queries": total,
        "ok_count": ok_count,
        "error_count": error_count,
        "success_rate": round(ok_count / total * 100, 1) if total > 0 else 0,
        "avg_duration_ms": round(avg_duration, 1),
        "by_caller": by_caller,
        "recent_errors": [dict(r) for r in error_rows],
    }
