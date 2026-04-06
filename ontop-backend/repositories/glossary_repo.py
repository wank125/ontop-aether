"""业务词汇表 CRUD — 操作 business_glossary 表。

查询逻辑：
  - ds_id='' 为全局词汇，查询时合并当前数据源 + 全局词汇
  - UNIQUE(ds_id, term)：同一数据源同一主词汇只有一条记录
  - aliases 以 JSON 数组存储于 TEXT 列
"""
import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from database import get_connection

logger = logging.getLogger(__name__)


# ── 内部 helpers ─────────────────────────────────────────


def _row_to_dict(row) -> dict:
    d = dict(row)
    d["aliases"]           = json.loads(d.get("aliases") or "[]")
    d["example_questions"] = json.loads(d.get("example_questions") or "[]")
    return d


# ── Read ─────────────────────────────────────────────────


def list_terms(
    ds_id: str,
    q: Optional[str] = None,
    entity_kind: Optional[str] = None,
    include_global: bool = True,
) -> list[dict]:
    """列出词汇。

    - 返回 ds_id 数据源的词汇 + 全局词汇（ds_id=''），合并后按 term 排序。
    - q：模糊搜索（term / aliases / entity_uri 任意命中即可）
    - include_global：是否合并全局词汇（默认 True）
    """
    conn = get_connection()
    if include_global and ds_id:
        ds_filter = "ds_id IN (?, '')"
        params: list = [ds_id]
    else:
        ds_filter = "ds_id = ?"
        params = [ds_id]

    sql = f"SELECT * FROM business_glossary WHERE {ds_filter}"

    if entity_kind:
        sql += " AND entity_kind = ?"
        params.append(entity_kind)

    sql += " ORDER BY term"
    rows = conn.execute(sql, params).fetchall()
    result = [_row_to_dict(r) for r in rows]

    if q:
        q_lower = q.lower()
        result = [
            r for r in result
            if (q_lower in r["term"].lower()
                or q_lower in r["entity_uri"].lower()
                or q_lower in r.get("description", "").lower()
                or any(q_lower in a.lower() for a in r.get("aliases", [])))
        ]
    return result


def get_term(term_id: str) -> Optional[dict]:
    row = get_connection().execute(
        "SELECT * FROM business_glossary WHERE id=?", (term_id,)
    ).fetchone()
    return _row_to_dict(row) if row else None


def get_term_by_name(ds_id: str, term: str) -> Optional[dict]:
    row = get_connection().execute(
        "SELECT * FROM business_glossary WHERE ds_id=? AND term=?",
        (ds_id, term),
    ).fetchone()
    return _row_to_dict(row) if row else None


def get_stats(ds_id: str) -> dict:
    conn = get_connection()
    rows = conn.execute(
        """SELECT source, COUNT(*) as cnt FROM business_glossary
           WHERE ds_id IN (?, '') GROUP BY source""",
        (ds_id,),
    ).fetchall()
    stats = {"human": 0, "llm": 0, "total": 0}
    for r in rows:
        if r["source"] in stats:
            stats[r["source"]] += r["cnt"]
        stats["total"] += r["cnt"]
    return stats


# ── Write ────────────────────────────────────────────────


def upsert_term(
    ds_id: str,
    term: str,
    entity_uri: str,
    entity_kind: str = "data_property",
    aliases: list[str] | None = None,
    description: str = "",
    example_questions: list[str] | None = None,
    source: str = "human",
    overwrite: bool = True,
) -> dict:
    """插入或更新词汇。

    - overwrite=True（默认）时，term 已存在则更新
    - overwrite=False 时，term 已存在则跳过（用于 LLM 批量导入，不覆盖人工词汇）
    """
    conn = get_connection()
    now = datetime.now().isoformat()
    aliases_json = json.dumps(aliases or [], ensure_ascii=False)
    eq_json = json.dumps(example_questions or [], ensure_ascii=False)

    existing = get_term_by_name(ds_id, term)
    if existing:
        if not overwrite:
            return existing
        conn.execute(
            """UPDATE business_glossary
               SET entity_uri=?, entity_kind=?, aliases=?, description=?,
                   example_questions=?, source=?, updated_at=?
               WHERE ds_id=? AND term=?""",
            (entity_uri, entity_kind, aliases_json, description, eq_json,
             source, now, ds_id, term),
        )
        conn.commit()
        return _row_to_dict(conn.execute(
            "SELECT * FROM business_glossary WHERE ds_id=? AND term=?",
            (ds_id, term),
        ).fetchone())

    term_id = str(uuid.uuid4())[:12]
    conn.execute(
        """INSERT INTO business_glossary
           (id, ds_id, term, entity_uri, entity_kind, aliases, description,
            example_questions, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (term_id, ds_id, term, entity_uri, entity_kind, aliases_json,
         description, eq_json, source, now),
    )
    conn.commit()
    return _row_to_dict(conn.execute(
        "SELECT * FROM business_glossary WHERE id=?", (term_id,)
    ).fetchone())


def update_term(
    term_id: str,
    term: Optional[str] = None,
    entity_uri: Optional[str] = None,
    entity_kind: Optional[str] = None,
    aliases: Optional[list[str]] = None,
    description: Optional[str] = None,
    example_questions: Optional[list[str]] = None,
) -> Optional[dict]:
    conn = get_connection()
    existing = get_term(term_id)
    if not existing:
        return None

    conn.execute(
        """UPDATE business_glossary
           SET term=?, entity_uri=?, entity_kind=?, aliases=?, description=?,
               example_questions=?, updated_at=?
           WHERE id=?""",
        (
            term         if term         is not None else existing["term"],
            entity_uri   if entity_uri   is not None else existing["entity_uri"],
            entity_kind  if entity_kind  is not None else existing["entity_kind"],
            json.dumps(aliases           if aliases           is not None else existing["aliases"], ensure_ascii=False),
            description  if description  is not None else existing["description"],
            json.dumps(example_questions if example_questions is not None else existing["example_questions"], ensure_ascii=False),
            datetime.now().isoformat(),
            term_id,
        ),
    )
    conn.commit()
    return _row_to_dict(conn.execute(
        "SELECT * FROM business_glossary WHERE id=?", (term_id,)
    ).fetchone())


def delete_term(term_id: str) -> bool:
    conn = get_connection()
    cursor = conn.execute("DELETE FROM business_glossary WHERE id=?", (term_id,))
    conn.commit()
    return cursor.rowcount > 0


def delete_llm_terms(ds_id: str) -> int:
    """删除某数据源所有 LLM 生成的词汇（重新生成前清理）。"""
    conn = get_connection()
    cursor = conn.execute(
        "DELETE FROM business_glossary WHERE ds_id=? AND source='llm'", (ds_id,)
    )
    conn.commit()
    return cursor.rowcount


def batch_upsert(ds_id: str, terms: list[dict], overwrite: bool = False) -> int:
    """批量导入词汇，返回实际写入条数。"""
    count = 0
    for t in terms:
        upsert_term(
            ds_id=ds_id,
            term=t["term"],
            entity_uri=t.get("entity_uri", ""),
            entity_kind=t.get("entity_kind", "data_property"),
            aliases=t.get("aliases", []),
            description=t.get("description", ""),
            example_questions=t.get("example_questions", []),
            source=t.get("source", "llm"),
            overwrite=overwrite,
        )
        count += 1
    return count
