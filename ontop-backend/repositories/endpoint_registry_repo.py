"""端点注册表 CRUD — 操作 endpoint_registry 表。

核心规则：
  - 每个 ds_id 只有一条记录（UNIQUE）
  - is_current=1 的行唯一，切换时事务内先全部置 0 再置目标为 1
  - active_dir 指向该数据源的 Bootstrap 产物存放目录
"""
import logging
import uuid
from datetime import datetime
from typing import Optional

from database import get_connection

logger = logging.getLogger(__name__)


def _row_to_dict(row) -> dict:
    return dict(row)


# ── Read ─────────────────────────────────────────────────

def list_registrations(project_id: str | None = None) -> list[dict]:
    if project_id:
        rows = get_connection().execute(
            "SELECT * FROM endpoint_registry WHERE project_id = ? OR project_id = '' ORDER BY is_current DESC, last_bootstrap DESC",
            (project_id,),
        ).fetchall()
    else:
        rows = get_connection().execute(
            "SELECT * FROM endpoint_registry ORDER BY is_current DESC, last_bootstrap DESC"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_by_ds_id(ds_id: str) -> Optional[dict]:
    row = get_connection().execute(
        "SELECT * FROM endpoint_registry WHERE ds_id=?", (ds_id,)
    ).fetchone()
    return _row_to_dict(row) if row else None


def get_current() -> Optional[dict]:
    row = get_connection().execute(
        "SELECT * FROM endpoint_registry WHERE is_current=1 LIMIT 1"
    ).fetchone()
    return _row_to_dict(row) if row else None


# ── Write ────────────────────────────────────────────────

def register_datasource(
    ds_id: str,
    ds_name: str,
    active_dir: str,
    ontology_path: str = "",
    mapping_path: str = "",
    properties_path: str = "",
    endpoint_url: str = "",
    set_current: bool = False,
) -> dict:
    """注册或更新数据源的端点信息。

    - set_current=True 时，顺带将此数据源设为激活（并清除其他）
    """
    conn = get_connection()
    now = datetime.now().isoformat()
    existing = get_by_ds_id(ds_id)

    if existing:
        conn.execute(
            """UPDATE endpoint_registry
               SET ds_name=?, active_dir=?, ontology_path=?, mapping_path=?,
                   properties_path=?, endpoint_url=?, last_bootstrap=?, updated_at=?
               WHERE ds_id=?""",
            (ds_name, active_dir, ontology_path, mapping_path, properties_path,
             endpoint_url, now, now, ds_id),
        )
    else:
        reg_id = str(uuid.uuid4())[:12]
        conn.execute(
            """INSERT INTO endpoint_registry
               (id, ds_id, ds_name, active_dir, ontology_path, mapping_path,
                properties_path, endpoint_url, last_bootstrap, is_current, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (reg_id, ds_id, ds_name, active_dir, ontology_path, mapping_path,
             properties_path, endpoint_url, now, 0, now),
        )

    if set_current:
        _set_current_unsafe(conn, ds_id)

    conn.commit()
    return _row_to_dict(conn.execute(
        "SELECT * FROM endpoint_registry WHERE ds_id=?", (ds_id,)
    ).fetchone())


def activate(ds_id: str) -> Optional[dict]:
    """将 ds_id 设为当前激活数据源，返回激活后的记录。"""
    conn = get_connection()
    if not get_by_ds_id(ds_id):
        return None
    _set_current_unsafe(conn, ds_id)
    conn.commit()
    return get_by_ds_id(ds_id)


def _set_current_unsafe(conn, ds_id: str):
    """不 commit，仅在事务内更新 is_current 标记。"""
    conn.execute("UPDATE endpoint_registry SET is_current=0, updated_at=?",
                 (datetime.now().isoformat(),))
    conn.execute("UPDATE endpoint_registry SET is_current=1, updated_at=? WHERE ds_id=?",
                 (datetime.now().isoformat(), ds_id))
