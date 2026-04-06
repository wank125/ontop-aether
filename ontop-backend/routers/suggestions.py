"""本体精化建议 REST API。

端点前缀：/api/v1/suggestions

路由：
  POST /suggestions/{ds_id}/analyze      — LLM 分析生成建议（后台任务）
  GET  /suggestions/{ds_id}             — 列出建议
  GET  /suggestions/{ds_id}/stats       — 统计
  PUT  /suggestions/{ds_id}/{id}/status — 接受/拒绝
  POST /suggestions/{ds_id}/{id}/apply  — 自动应用单条
  POST /suggestions/{ds_id}/batch-apply — 批量应用所有 accepted 建议
"""
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from models.suggestion import SuggestionStatusUpdate

router = APIRouter(prefix="/suggestions", tags=["suggestions"])
logger = logging.getLogger(__name__)


# ── Analyze ───────────────────────────────────────────────

@router.post("/{ds_id}/analyze")
async def analyze(ds_id: str, background_tasks: BackgroundTasks):
    """触发 LLM 分析（后台任务），生成本体精化建议。"""
    async def _run():
        from services.ontology_advisor import analyze_ontology
        try:
            count = await analyze_ontology(ds_id)
            logger.info("Ontology analysis done: ds_id=%s, suggestions=%d", ds_id, count)
        except Exception as e:
            logger.error("Ontology analysis failed: ds_id=%s, error=%s", ds_id, e)

    background_tasks.add_task(_run)
    return {"message": "本体分析任务已启动（后台运行）", "ds_id": ds_id}


# ── List & Stats ──────────────────────────────────────────

@router.get("/{ds_id}/stats")
async def get_stats(ds_id: str):
    from repositories.suggestion_repo import get_stats
    return get_stats(ds_id)


@router.get("/{ds_id}")
async def list_suggestions(
    ds_id: str,
    status: Optional[str] = Query(None, description="pending|accepted|rejected|applied"),
    type:   Optional[str] = Query(None, description="RENAME_CLASS|RENAME_PROPERTY|ADD_SUBCLASS|..."),
    priority: Optional[str] = Query(None, description="high|medium|low"),
):
    from repositories.suggestion_repo import list_suggestions
    return list_suggestions(ds_id, status=status, sug_type=type, priority=priority)


# ── Status Update ─────────────────────────────────────────

@router.put("/{ds_id}/{sug_id}/status")
async def update_status(ds_id: str, sug_id: str, body: SuggestionStatusUpdate):
    from repositories.suggestion_repo import get_suggestion, update_status
    existing = get_suggestion(sug_id)
    if not existing or existing["ds_id"] != ds_id:
        raise HTTPException(status_code=404, detail="建议不存在")
    return update_status(sug_id, body.status)


# ── Apply ─────────────────────────────────────────────────

@router.post("/{ds_id}/{sug_id}/apply")
async def apply_single(ds_id: str, sug_id: str):
    """自动应用单条建议到 TTL 文件。"""
    from repositories.suggestion_repo import get_suggestion, update_status
    from services.suggestion_applicant import apply_suggestion
    from repositories.endpoint_registry_repo import get_by_ds_id

    sug = get_suggestion(sug_id)
    if not sug or sug["ds_id"] != ds_id:
        raise HTTPException(status_code=404, detail="建议不存在")
    if sug["status"] not in ("pending", "accepted"):
        raise HTTPException(status_code=422, detail=f"当前状态 [{sug['status']}] 不可应用")
    if not sug["auto_apply"]:
        raise HTTPException(
            status_code=422,
            detail=f"该建议类型 [{sug['type']}] 不支持自动应用，请人工处理",
        )

    # 获取 active TTL 路径（优先 active_dir/merged_ontology.ttl，fallback ontology_path）
    reg = get_by_ds_id(ds_id)
    ttl_path = _resolve_active_ttl(reg) if reg else ""
    if not ttl_path:
        raise HTTPException(status_code=422, detail="未找到该数据源的本体文件路径，请先 Bootstrap")

    sug["ds_id"] = ds_id
    ok, msg = apply_suggestion(sug, ttl_path)
    if ok:
        update_status(sug_id, "applied")
    return {"success": ok, "message": msg}


@router.post("/{ds_id}/batch-apply")
async def batch_apply(ds_id: str):
    """批量应用所有 accepted + auto_apply=true 的建议。"""
    from repositories.suggestion_repo import list_suggestions, update_status
    from services.suggestion_applicant import apply_suggestion
    from repositories.endpoint_registry_repo import get_by_ds_id

    reg = get_by_ds_id(ds_id)
    ttl_path = _resolve_active_ttl(reg) if reg else ""
    if not ttl_path:
        raise HTTPException(status_code=422, detail="未找到该数据源的本体文件路径")

    candidates = [
        s for s in list_suggestions(ds_id, status="accepted")
        if s.get("auto_apply")
    ]
    results = []
    for sug in candidates:
        sug["ds_id"] = ds_id
        ok, msg = apply_suggestion(sug, ttl_path)
        if ok:
            update_status(sug["id"], "applied")
        results.append({"id": sug["id"], "type": sug["type"], "success": ok, "message": msg})

    applied   = sum(1 for r in results if r["success"])
    skipped   = len(results) - applied
    return {"applied": applied, "skipped": skipped, "results": results}


def _resolve_active_ttl(reg: dict) -> str:
    """优先使用 active_dir/merged_ontology.ttl，否则 fallback 到 ontology_path。"""
    from pathlib import Path
    active_dir = reg.get("active_dir", "")
    if active_dir:
        merged = Path(active_dir) / "merged_ontology.ttl"
        if merged.exists():
            return str(merged)
    return reg.get("ontology_path", "")
