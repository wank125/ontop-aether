"""语义注释层 REST API — 管理 Bootstrap 后的业务标注（LLM 生成 + 人工审核）。"""
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException

from models.annotation import AnnotationUpsert, AnnotationStatusUpdate, BatchStatusUpdate
from repositories import annotation_repo
from services.active_endpoint_config import load_active_endpoint_config
from config import DATA_DIR

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/annotations", tags=["annotations"])


def _get_active_ds_id() -> str | None:
    """从激活的 endpoint 配置中推断当前 ds_id（路径格式 DATA_DIR/{ds_id}/...）。"""
    cfg = load_active_endpoint_config()
    mapping_path = cfg.get("mapping_path", "")
    if not mapping_path:
        return None
    try:
        rel = Path(mapping_path).relative_to(DATA_DIR)
        return rel.parts[0]  # DATA_DIR/{ds_id}/...
    except Exception:
        return None


# ── Read ─────────────────────────────────────────────────


@router.get("/{ds_id}")
async def list_annotations(
    ds_id: str,
    status: str | None = None,
    entity_kind: str | None = None,
):
    """列出指定数据源的所有语义注释。

    Query params:
      - status: pending | accepted | rejected（不传则返回全部）
      - entity_kind: class | data_property | object_property
    """
    return annotation_repo.list_annotations(ds_id, status=status, entity_kind=entity_kind)


@router.get("/{ds_id}/stats")
async def get_annotation_stats(ds_id: str):
    """返回 pending/accepted/rejected/total 各状态的注释数量。"""
    return annotation_repo.get_stats(ds_id)


# ── Write ────────────────────────────────────────────────


@router.post("/{ds_id}", status_code=201)
async def create_annotation(ds_id: str, body: AnnotationUpsert):
    """手动新增或覆盖一条注释（人工来源，直接 accepted）。

    对于同一 (ds_id, entity_uri, lang) 已有记录的情况会覆盖。
    """
    return annotation_repo.upsert_annotation(
        ds_id=ds_id,
        entity_uri=body.entity_uri,
        entity_kind=body.entity_kind,
        lang=body.lang,
        label=body.label,
        comment=body.comment,
        source=body.source,
    )


@router.put("/{ds_id}/{ann_id}")
async def update_annotation(ds_id: str, ann_id: str, body: AnnotationStatusUpdate):
    """更新单条注释的状态（pending → accepted / rejected）。"""
    result = annotation_repo.update_annotation(ann_id, status=body.status)
    if result is None:
        raise HTTPException(404, f"Annotation {ann_id} not found")
    return result


@router.delete("/{ds_id}/{ann_id}", status_code=204)
async def delete_annotation(ds_id: str, ann_id: str):
    """删除单条注释。"""
    deleted = annotation_repo.delete_annotation(ann_id)
    if not deleted:
        raise HTTPException(404, f"Annotation {ann_id} not found")


# ── Batch ────────────────────────────────────────────────


@router.post("/{ds_id}/batch-status")
async def batch_update_status(ds_id: str, body: BatchStatusUpdate):
    """批量更新注释状态（常用于"全部接受"操作）。

    Request body: {"ids": ["id1", "id2", ...], "status": "accepted"}
    """
    count = annotation_repo.batch_update_status(body.ids, body.status)
    return {"updated": count, "status": body.status}


# ── Merge ────────────────────────────────────────────────


@router.post("/{ds_id}/merge")
async def trigger_merge(ds_id: str):
    """手动触发将 accepted 注释合并到 active TTL。

    合并策略：
    - raw TTL（Bootstrap 产物）原样保留
    - active TTL = raw TTL + accepted 注释追加块
    - 路径: DATA_DIR/{ds_id}/active/merged_ontology.ttl
    """
    from services.annotation_merge import merge_annotations_to_ttl

    # 查找该 ds_id 最新的 raw ontology 路径
    # 约定：从 active_endpoint_config 读取（Bootstrap 激活时写入）
    cfg = load_active_endpoint_config()
    raw_ttl = cfg.get("ontology_path", "")
    if not raw_ttl or not Path(raw_ttl).exists():
        raise HTTPException(400, "No active ontology TTL found. Run Bootstrap first.")

    active_dir = Path(DATA_DIR) / ds_id / "active"
    active_dir.mkdir(parents=True, exist_ok=True)
    output_path = str(active_dir / "merged_ontology.ttl")

    count = merge_annotations_to_ttl(
        raw_ttl_path=raw_ttl,
        ds_id=ds_id,
        output_ttl_path=output_path,
    )
    return {
        "merged_entities": count,
        "output_path": output_path,
        "message": f"Merged {count} annotated entities into active TTL",
    }
