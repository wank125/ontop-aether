"""端点注册表 REST API。

端点前缀：/api/v1/endpoint-registry

路由：
  GET  /endpoint-registry              — 列出所有注册数据源
  GET  /endpoint-registry/current      — 当前激活数据源
  PUT  /endpoint-registry/{ds_id}/activate — 切换激活数据源
"""
import logging

from fastapi import APIRouter, HTTPException, BackgroundTasks

router = APIRouter(prefix="/endpoint-registry", tags=["endpoint-registry"])
logger = logging.getLogger(__name__)


@router.get("")
async def list_registrations():
    """列出所有已注册数据源的端点信息。"""
    from repositories.endpoint_registry_repo import list_registrations
    return list_registrations()


@router.get("/current")
async def get_current():
    """获取当前激活的数据源端点信息。"""
    from repositories.endpoint_registry_repo import get_current
    current = get_current()
    if not current:
        return {"message": "暂无激活的数据源端点", "current": None}
    return current


@router.put("/{ds_id}/activate")
async def activate_datasource(ds_id: str, background_tasks: BackgroundTasks):
    """切换激活数据源（将文件同步到共享端点目录并触发 reload）。

    切换期间约 5-10 秒端点重启，重启期间的 SPARQL 请求会收到 503。
    """
    from repositories.endpoint_registry_repo import get_by_ds_id
    from services.endpoint_switcher import switch_to_datasource

    reg = get_by_ds_id(ds_id)
    if not reg:
        raise HTTPException(
            status_code=404,
            detail=f"数据源 {ds_id} 未在端点注册表中，请先执行 Bootstrap。"
        )

    # 后台执行切换（switch 包含文件 IO 和 HTTP 调用，不阻塞主线程）
    async def _switch():
        ok, msg = await switch_to_datasource(ds_id)
        if not ok:
            logger.warning("Switch to %s failed: %s", ds_id, msg)

    background_tasks.add_task(_switch)

    return {
        "message": f"切换任务已提交，目标数据源：{reg.get('ds_name', ds_id)}",
        "ds_id": ds_id,
        "note": "端点重启约需 5-10 秒，期间 SPARQL 查询将返回 503",
    }
