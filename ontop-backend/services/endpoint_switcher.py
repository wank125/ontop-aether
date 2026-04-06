"""端点切换服务 — 将目标数据源的 active 文件同步到共享端点目录并触发 restart。

部署假设（Docker 模式）：
  - backend 容器和 ontop-endpoint 容器共享同一个卷挂载到 ONTOP_ENDPOINT_ACTIVE_DIR
  - 切换逻辑：把 {ds_active_dir}/* 复制到 {ONTOP_ENDPOINT_ACTIVE_DIR}/
  - 触发 restart：调用 native Spring Boot 端点的 POST /ontop/restart
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
      3. 调用 /ontop/restart 让 Java 端重新加载（约 5-10s）
      4. 更新 active_endpoint.json（backend 内部路由使用）
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
            return False, f"文件同步失败：{e}"

    # 步骤 3：触发端点 restart（从同一路径重新读取文件）
    ok, msg = await _trigger_restart()
    if not ok:
        logger.warning("Endpoint restart failed: %s", msg)
        return False, f"文件已切换，但端点 restart 失败：{msg}"

    # 步骤 4：restart 成功后，更新 active_endpoint.json 和注册表
    save_active_endpoint_config({
        "ontology_path": ontology_path,
        "mapping_path":  mapping_path,
        "properties_path": properties_path,
    })
    activate(ds_id)

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


async def _trigger_restart() -> tuple[bool, str]:
    """调用 native Spring Boot 端点的 POST /ontop/restart。

    Java 端 OntopRepositoryConfig.restart() 会从构造时确定的文件路径
    重新读取 mapping/ontology/properties，无需传参。
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{ONTOP_ENDPOINT_URL}/ontop/restart")
            if resp.status_code in (200, 204):
                logger.info("Endpoint restart succeeded")
                return True, "restart OK"
            return False, f"HTTP {resp.status_code}: {resp.text}"
    except Exception as e:
        return False, str(e)
