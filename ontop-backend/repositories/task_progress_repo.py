"""异步任务进度追踪 — 操作 task_progress 表。"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from database import get_connection

logger = logging.getLogger(__name__)

# 30 分钟以上的 running 任务视为过期
_STALE_SECONDS = 30 * 60


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_dict(row) -> dict:
    return dict(row)


# ── Create ────────────────────────────────────────────────

def create_task(task_type: str, ds_id: str, total: int = 0) -> str:
    """创建一条 running 任务记录，返回 task_id。"""
    cleanup_stale_tasks()
    task_id = uuid.uuid4().hex[:12]
    now = _now()
    conn = get_connection()
    conn.execute(
        """INSERT INTO task_progress
           (id, task_type, ds_id, status, progress, current, total, message, created_at, updated_at)
           VALUES (?, ?, ?, 'running', 0.0, 0, ?, '准备中...', ?, ?)""",
        (task_id, task_type, ds_id, total, now, now),
    )
    conn.commit()
    logger.info("task_progress: created %s task_id=%s ds_id=%s total=%d",
                task_type, task_id, ds_id, total)
    return task_id


# ── Update ────────────────────────────────────────────────

def update_progress(task_id: str, current: int, total: Optional[int] = None,
                    message: Optional[str] = None) -> None:
    conn = get_connection()
    row = conn.execute("SELECT total FROM task_progress WHERE id=?", (task_id,)).fetchone()
    if not row:
        return
    effective_total = total if total is not None else row["total"]
    progress = current / effective_total if effective_total > 0 else 0.0
    now = _now()
    conn.execute(
        """UPDATE task_progress
           SET current=?, total=?, progress=?, message=?, updated_at=?
           WHERE id=?""",
        (current, effective_total, round(progress, 3), message or f"正在处理 {current}/{effective_total}...", now, task_id),
    )
    conn.commit()


def complete_task(task_id: str, result: Optional[str] = None) -> None:
    conn = get_connection()
    now = _now()
    conn.execute(
        """UPDATE task_progress
           SET status='completed', progress=1.0, current=total, message='已完成',
              result=?, updated_at=?
           WHERE id=?""",
        (result or "", now, task_id),
    )
    conn.commit()
    logger.info("task_progress: completed task_id=%s", task_id)


def fail_task(task_id: str, error: str) -> None:
    conn = get_connection()
    now = _now()
    conn.execute(
        """UPDATE task_progress
           SET status='failed', message='任务失败', error=?, updated_at=?
           WHERE id=?""",
        (error[:500], now, task_id),
    )
    conn.commit()
    logger.error("task_progress: failed task_id=%s error=%s", task_id, error[:200])


# ── Read ──────────────────────────────────────────────────

def get_latest_task(task_type: str, ds_id: str) -> Optional[dict]:
    """获取指定类型和 ds_id 的最新一条任务（无论状态）。"""
    conn = get_connection()
    row = conn.execute(
        """SELECT * FROM task_progress
           WHERE task_type=? AND ds_id=?
           ORDER BY created_at DESC LIMIT 1""",
        (task_type, ds_id),
    ).fetchone()
    return _row_to_dict(row) if row else None


def get_active_tasks(ds_id: str) -> list[dict]:
    """返回指定 ds_id 所有 running 的任务。"""
    conn = get_connection()
    rows = conn.execute(
        """SELECT * FROM task_progress
           WHERE ds_id=? AND status='running'
           ORDER BY created_at DESC""",
        (ds_id,),
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def list_tasks(ds_id: str) -> list[dict]:
    """返回指定 ds_id 所有任务（最近的在前）。"""
    conn = get_connection()
    rows = conn.execute(
        """SELECT * FROM task_progress WHERE ds_id=?
           ORDER BY created_at DESC LIMIT 50""",
        (ds_id,),
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


# ── Cleanup ───────────────────────────────────────────────

def cleanup_stale_tasks() -> int:
    """将超过 30 分钟的 running 任务标记为 failed。"""
    conn = get_connection()
    cutoff = datetime.now(timezone.utc).timestamp() - _STALE_SECONDS
    cutoff_iso = datetime.fromtimestamp(cutoff, tz=timezone.utc).isoformat()
    cur = conn.execute(
        """UPDATE task_progress
           SET status='failed', message='任务超时（可能因服务重启中断）', updated_at=?
           WHERE status='running' AND created_at < ?""",
        (_now(), cutoff_iso),
    )
    conn.commit()
    if cur.rowcount > 0:
        logger.warning("task_progress: cleaned up %d stale tasks", cur.rowcount)
    return cur.rowcount
