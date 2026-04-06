"""语义注释层 CRUD — 基于现有 SQLite 连接池，操作 semantic_annotations 表。

设计约束：
  - 同一数据源的同一实体同一语言只有一条记录（UNIQUE 约束）
  - upsert 时若已存在 status=accepted 的记录，LLM 来源（source='llm'）不覆盖
    （人工审核结果具有最高优先级，不被机器学习结果冲掉）
  - 人工来源（source='human'）的 upsert 始终覆盖
"""
import uuid
import logging
from datetime import datetime
from typing import Optional

from database import get_connection

logger = logging.getLogger(__name__)


# ── Read ─────────────────────────────────────────────────


def list_annotations(
    ds_id: str,
    status: Optional[str] = None,
    entity_kind: Optional[str] = None,
) -> list[dict]:
    """列出指定数据源的注释记录，可按 status / entity_kind 过滤。"""
    conn = get_connection()
    sql = "SELECT * FROM semantic_annotations WHERE ds_id = ?"
    params: list = [ds_id]
    if status:
        sql += " AND status = ?"
        params.append(status)
    if entity_kind:
        sql += " AND entity_kind = ?"
        params.append(entity_kind)
    sql += " ORDER BY entity_uri, lang"
    rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def get_annotation(
    ds_id: str,
    entity_uri: str,
    lang: Optional[str] = None,
) -> Optional[dict]:
    """获取指定实体的注释（可指定语言），不存在时返回 None。"""
    conn = get_connection()
    if lang:
        row = conn.execute(
            "SELECT * FROM semantic_annotations WHERE ds_id=? AND entity_uri=? AND lang=?",
            (ds_id, entity_uri, lang),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT * FROM semantic_annotations WHERE ds_id=? AND entity_uri=? LIMIT 1",
            (ds_id, entity_uri),
        ).fetchone()
    return dict(row) if row else None


def get_stats(ds_id: str) -> dict:
    """返回 {pending, accepted, rejected, total} 计数。"""
    conn = get_connection()
    rows = conn.execute(
        """SELECT status, COUNT(*) as cnt
           FROM semantic_annotations WHERE ds_id=?
           GROUP BY status""",
        (ds_id,),
    ).fetchall()
    stats = {"pending": 0, "accepted": 0, "rejected": 0}
    for row in rows:
        if row["status"] in stats:
            stats[row["status"]] = row["cnt"]
    stats["total"] = sum(stats.values())
    return stats


# ── Write ────────────────────────────────────────────────


def upsert_annotation(
    ds_id: str,
    entity_uri: str,
    entity_kind: str,
    lang: str,
    label: str = "",
    comment: str = "",
    source: str = "llm",
) -> dict:
    """插入或更新一条注释。

    关键规则：
      - source='llm' 时，若已存在 status='accepted' 的记录，跳过（不覆盖人工审核）
      - source='human' 时，始终覆盖（人工决策最高优先级）
    返回最终数据库中的记录。
    """
    conn = get_connection()
    now = datetime.now().isoformat()

    existing = conn.execute(
        "SELECT * FROM semantic_annotations WHERE ds_id=? AND entity_uri=? AND lang=?",
        (ds_id, entity_uri, lang),
    ).fetchone()

    if existing:
        # LLM 不覆盖已人工 accepted/rejected 的条目
        if source == "llm" and existing["status"] in ("accepted", "rejected"):
            logger.debug(
                "upsert_annotation: skipping llm update for accepted/rejected entity=%s lang=%s",
                entity_uri, lang,
            )
            return dict(existing)

        conn.execute(
            """UPDATE semantic_annotations
               SET label=?, comment=?, source=?, status=?, updated_at=?
               WHERE ds_id=? AND entity_uri=? AND lang=?""",
            (label, comment, source,
             "pending" if source == "llm" else "accepted",  # 人工操作直接 accepted
             now, ds_id, entity_uri, lang),
        )
        conn.commit()
        return dict(conn.execute(
            "SELECT * FROM semantic_annotations WHERE ds_id=? AND entity_uri=? AND lang=?",
            (ds_id, entity_uri, lang)
        ).fetchone())
    else:
        ann_id = str(uuid.uuid4())[:12]
        initial_status = "pending" if source == "llm" else "accepted"
        conn.execute(
            """INSERT INTO semantic_annotations
               (id, ds_id, entity_uri, entity_kind, lang, label, comment, source, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (ann_id, ds_id, entity_uri, entity_kind, lang, label, comment, source, initial_status, now),
        )
        conn.commit()
        return dict(conn.execute(
            "SELECT * FROM semantic_annotations WHERE id=?", (ann_id,)
        ).fetchone())


def update_annotation(
    ann_id: str,
    label: Optional[str] = None,
    comment: Optional[str] = None,
    status: Optional[str] = None,
) -> Optional[dict]:
    """更新指定注释的内容或状态。返回更新后的记录，不存在时返回 None。"""
    conn = get_connection()
    existing = conn.execute(
        "SELECT * FROM semantic_annotations WHERE id=?", (ann_id,)
    ).fetchone()
    if not existing:
        return None

    new_label   = label   if label   is not None else existing["label"]
    new_comment = comment if comment is not None else existing["comment"]
    new_status  = status  if status  is not None else existing["status"]

    conn.execute(
        """UPDATE semantic_annotations
           SET label=?, comment=?, status=?, updated_at=?
           WHERE id=?""",
        (new_label, new_comment, new_status, datetime.now().isoformat(), ann_id),
    )
    conn.commit()
    return dict(conn.execute(
        "SELECT * FROM semantic_annotations WHERE id=?", (ann_id,)
    ).fetchone())


def batch_update_status(ids: list[str], status: str) -> int:
    """批量更新状态，返回实际更新的行数。"""
    if not ids:
        return 0
    conn = get_connection()
    now = datetime.now().isoformat()
    placeholders = ",".join("?" * len(ids))
    cursor = conn.execute(
        f"UPDATE semantic_annotations SET status=?, updated_at=? WHERE id IN ({placeholders})",
        [status, now, *ids],
    )
    conn.commit()
    return cursor.rowcount


def delete_annotation(ann_id: str) -> bool:
    """删除单条注释，返回是否实际删除了记录。"""
    conn = get_connection()
    cursor = conn.execute("DELETE FROM semantic_annotations WHERE id=?", (ann_id,))
    conn.commit()
    return cursor.rowcount > 0


def delete_pending_for_datasource(ds_id: str) -> int:
    """删除某数据源所有 pending 状态的 LLM 注释（Bootstrap 重跑前清理旧 pending）。"""
    conn = get_connection()
    cursor = conn.execute(
        "DELETE FROM semantic_annotations WHERE ds_id=? AND status='pending' AND source='llm'",
        (ds_id,),
    )
    conn.commit()
    return cursor.rowcount
