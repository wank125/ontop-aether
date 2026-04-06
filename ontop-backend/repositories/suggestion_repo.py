"""本体精化建议 CRUD — 操作 ontology_suggestions 表。"""
import logging
import uuid
from datetime import datetime
from typing import Optional

from database import get_connection

logger = logging.getLogger(__name__)


def _row_to_dict(row) -> dict:
    d = dict(row)
    d["auto_apply"] = bool(d.get("auto_apply", 0))
    return d


# ── Read ─────────────────────────────────────────────────

def list_suggestions(
    ds_id: str,
    status: Optional[str] = None,
    sug_type: Optional[str] = None,
    priority: Optional[str] = None,
) -> list[dict]:
    sql  = "SELECT * FROM ontology_suggestions WHERE ds_id=?"
    params: list = [ds_id]
    if status:
        sql += " AND status=?"
        params.append(status)
    if sug_type:
        sql += " AND type=?"
        params.append(sug_type)
    if priority:
        sql += " AND priority=?"
        params.append(priority)
    sql += " ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at"
    return [_row_to_dict(r) for r in get_connection().execute(sql, params).fetchall()]


def get_suggestion(sug_id: str) -> Optional[dict]:
    row = get_connection().execute(
        "SELECT * FROM ontology_suggestions WHERE id=?", (sug_id,)
    ).fetchone()
    return _row_to_dict(row) if row else None


def get_stats(ds_id: str) -> dict:
    rows = get_connection().execute(
        "SELECT status, COUNT(*) as cnt FROM ontology_suggestions WHERE ds_id=? GROUP BY status",
        (ds_id,),
    ).fetchall()
    stats = {"pending": 0, "accepted": 0, "rejected": 0, "applied": 0, "total": 0}
    for r in rows:
        s = r["status"]
        if s in stats:
            stats[s] += r["cnt"]
        stats["total"] += r["cnt"]
    return stats


# ── Write ────────────────────────────────────────────────

def create_suggestion(
    ds_id: str,
    sug_type: str,
    current_val: str,
    proposed_val: str,
    reason: str = "",
    priority: str = "medium",
    auto_apply: bool = False,
) -> dict:
    conn = get_connection()
    sug_id = str(uuid.uuid4())[:12]
    now = datetime.now().isoformat()
    conn.execute(
        """INSERT INTO ontology_suggestions
           (id, ds_id, type, current_val, proposed_val, reason, priority, auto_apply, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)""",
        (sug_id, ds_id, sug_type, current_val, proposed_val, reason, priority, int(auto_apply), now),
    )
    conn.commit()
    return _row_to_dict(conn.execute(
        "SELECT * FROM ontology_suggestions WHERE id=?", (sug_id,)
    ).fetchone())


def update_status(sug_id: str, status: str) -> Optional[dict]:
    conn = get_connection()
    conn.execute(
        "UPDATE ontology_suggestions SET status=?, updated_at=? WHERE id=?",
        (status, datetime.now().isoformat(), sug_id),
    )
    conn.commit()
    return get_suggestion(sug_id)


def delete_ds_suggestions(ds_id: str, status: Optional[str] = None) -> int:
    """删除数据源的建议（可按状态过滤）。重新分析前调用。"""
    conn = get_connection()
    if status:
        cursor = conn.execute(
            "DELETE FROM ontology_suggestions WHERE ds_id=? AND status=?", (ds_id, status)
        )
    else:
        cursor = conn.execute("DELETE FROM ontology_suggestions WHERE ds_id=?", (ds_id,))
    conn.commit()
    return cursor.rowcount


def batch_create(ds_id: str, suggestions: list[dict]) -> int:
    """批量写入建议，返回写入数量。"""
    count = 0
    for s in suggestions:
        create_suggestion(
            ds_id=ds_id,
            sug_type=s.get("type", ""),
            current_val=s.get("current_val", ""),
            proposed_val=s.get("proposed_val", ""),
            reason=s.get("reason", ""),
            priority=s.get("priority", "medium"),
            auto_apply=s.get("auto_apply", False),
        )
        count += 1
    return count
