"""端点切换服务 — 将目标数据源的 active 文件同步到共享端点目录并触发 reload。

部署假设（Docker 模式）：
  - backend 容器和 ontop-endpoint 容器共享同一个卷挂载到 ONTOP_ENDPOINT_ACTIVE_DIR
  - 切换逻辑：把 {ds_active_dir}/* 复制到 {ONTOP_ENDPOINT_ACTIVE_DIR}/
  - 触发 reload：调用 Ontop Admin API 的 /ontop/reload（如不支持则重启容器 HTTP API）

本地开发模式（非 Docker）：
  - 直接 start_endpoint（已有逻辑），不需要文件同步
"""
import logging
import shutil
from pathlib import Path

import httpx

from config import ONTOP_ENDPOINT_URL
from services.active_endpoint_config import save_active_endpoint_config

logger = logging.getLogger(__name__)

# 共享 active 目录（backend 容器内路径）
import os
ENDPOINT_ACTIVE_DIR = os.environ.get(
    "ONTOP_ENDPOINT_ACTIVE_DIR", ""
)


async def switch_to_datasource(ds_id: str) -> tuple[bool, str]:
    """将端点切换到指定数据源。

    Steps:
      1. 从 endpoint_registry 读取 ds_id 的文件路径
      2. 将文件复制到共享 active 目录
      3. 更新 active_endpoint.json（backend 内部路由使用）
      4. 调用 Ontop reload（约 5-10s）
      5. 更新注册表 is_current 标记

    Returns:
        (success: bool, message: str)
    """
    from repositories.endpoint_registry_repo import get_by_ds_id, activate

    reg = get_by_ds_id(ds_id)
    if not reg:
        return False, f"数据源 {ds_id} 未在端点注册表中，请先执行 Bootstrap"

    ontology_path   = reg.get("ontology_path", "")
    mapping_path    = reg.get("mapping_path", "")
    properties_path = reg.get("properties_path", "")

    if not all([ontology_path, mapping_path, properties_path]):
        return False, "该数据源的端点文件路径不完整，请重新 Bootstrap"

    # 步骤 2：将文件同步到共享 active 目录（仅 Docker 模式下有意义）
    if ENDPOINT_ACTIVE_DIR:
        active_path = Path(ENDPOINT_ACTIVE_DIR)
        active_path.mkdir(parents=True, exist_ok=True)
        try:
            _sync_files_to_active(
                ontology_path=ontology_path,
                mapping_path=mapping_path,
                properties_path=properties_path,
                active_dir=active_path,
            )
        except Exception as e:
            logger.warning("File sync failed: %s", e)

    # 步骤 3：更新 active_endpoint.json
    save_active_endpoint_config({
        "ontology_path": ontology_path,
        "mapping_path":  mapping_path,
        "properties_path": properties_path,
    })

    # 步骤 4：触发端点 reload
    ok, msg = await _trigger_reload(ontology_path, mapping_path, properties_path)

    # 步骤 5：更新注册表标记（无论 reload 是否成功，都记录激活意图）
    activate(ds_id)

    if not ok:
        logger.warning("Endpoint reload failed but registry updated: %s", msg)
        return False, f"文件已切换，但端点 reload 失败：{msg}。请手动重启 ontop-endpoint 容器。"

    return True, f"已切换到数据源 {reg.get('ds_name', ds_id)}"


def _sync_files_to_active(
    ontology_path: str,
    mapping_path: str,
    properties_path: str,
    active_dir: Path,
):
    """将三个文件复制为标准文件名到 active_dir。"""
    for src, dst_name in [
        (ontology_path,   "active_ontology.ttl"),
        (mapping_path,    "active_mapping.obda"),
        (properties_path, "active.properties"),
    ]:
        src_path = Path(src)
        if src_path.exists():
            shutil.copy2(src_path, active_dir / dst_name)
            logger.debug("Synced %s -> %s/%s", src, active_dir, dst_name)
        else:
            logger.warning("Source file not found: %s", src)


async def _trigger_reload(
    ontology_path: str,
    mapping_path: str,
    properties_path: str,
) -> tuple[bool, str]:
    """触发 Ontop endpoint 重新加载文件。

    优先尝试 Ontop Admin API，失败则 fallback 到 start_endpoint。
    """
    # 方案 A：Ontop Admin API（Ontop 5.x 支持 POST /ontop/reload）
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{ONTOP_ENDPOINT_URL}/ontop/reload",
                json={},
            )
            if resp.status_code in (200, 204):
                logger.info("Ontop reload via Admin API succeeded")
                return True, "reload OK"
    except Exception as e:
        logger.debug("Admin API reload failed, falling back: %s", e)

    # 方案 B：fallback — start_endpoint（已有逻辑，会重启 Ontop 进程）
    try:
        from services.ontop_endpoint import start_endpoint
        ok, msg = await start_endpoint(
            ontology_path=ontology_path,
            mapping_path=mapping_path,
            properties_path=properties_path,
        )
        return ok, msg
    except Exception as e:
        return False, str(e)
