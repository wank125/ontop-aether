"""异步任务进度查询 API。

端点前缀：/api/v1/tasks

路由清单：
  GET /tasks/{ds_id}              — 列出该数据源所有任务
  GET /tasks/{ds_id}/{task_type}  — 获取指定类型最新任务
"""
from fastapi import APIRouter

from repositories import task_progress_repo

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/{ds_id}")
async def list_ds_tasks(ds_id: str):
    """列出指定数据源的所有任务（最近的在前）。"""
    return task_progress_repo.list_tasks(ds_id)


@router.get("/{ds_id}/{task_type}")
async def get_latest_task(ds_id: str, task_type: str):
    """获取指定数据源 + 类型的最新任务进度。"""
    task = task_progress_repo.get_latest_task(task_type, ds_id)
    return task or {"status": "none", "task_type": task_type, "ds_id": ds_id}
