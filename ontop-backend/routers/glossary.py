"""业务词汇表 REST API。

端点前缀：/api/v1/glossary

路由清单：
  GET    /glossary/{ds_id}              — 列出词汇（?q=&entity_kind=）
  GET    /glossary/{ds_id}/stats        — 统计
  POST   /glossary/{ds_id}              — 创建/更新词汇
  PUT    /glossary/{ds_id}/{term_id}    — 编辑词汇
  DELETE /glossary/{ds_id}/{term_id}    — 删除词汇
  POST   /glossary/{ds_id}/generate    — LLM 自动从注释层生成词汇
  GET    /glossary/{ds_id}/export       — 导出 JSON
  POST   /glossary/{ds_id}/import       — 导入 JSON
"""
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import JSONResponse

from models.glossary import GlossaryTermCreate, GlossaryImport
from repositories import glossary_repo

router = APIRouter(prefix="/glossary", tags=["glossary"])
logger = logging.getLogger(__name__)


# ── List & Stats ──────────────────────────────────────────

@router.get("/{ds_id}")
async def list_terms(
    ds_id: str,
    q: Optional[str] = Query(None, description="模糊搜索：term/aliases/entity_uri"),
    entity_kind: Optional[str] = Query(None, description="class | data_property | object_property"),
    include_global: bool = Query(True, description="是否合并全局词汇（ds_id=''）"),
):
    """列出指定数据源的词汇（默认合并全局词汇）。"""
    return glossary_repo.list_terms(
        ds_id=ds_id,
        q=q,
        entity_kind=entity_kind,
        include_global=include_global,
    )


@router.get("/{ds_id}/stats")
async def get_stats(ds_id: str):
    """各来源（human/llm）数量统计。"""
    return glossary_repo.get_stats(ds_id)


# ── Create ────────────────────────────────────────────────

@router.post("/{ds_id}", status_code=201)
async def create_term(ds_id: str, body: GlossaryTermCreate):
    """手动创建/覆盖一条词汇（source=human 时直接生效）。"""
    return glossary_repo.upsert_term(
        ds_id=ds_id,
        term=body.term,
        entity_uri=body.entity_uri,
        entity_kind=body.entity_kind,
        aliases=body.aliases,
        description=body.description,
        example_questions=body.example_questions,
        source=body.source,
        overwrite=True,
    )


# ── Update ────────────────────────────────────────────────

@router.put("/{ds_id}/{term_id}")
async def update_term(
    ds_id: str,
    term_id: str,
    body: GlossaryTermCreate,
):
    """编辑词汇（全字段更新）。"""
    existing = glossary_repo.get_term(term_id)
    if not existing or existing["ds_id"] != ds_id:
        raise HTTPException(status_code=404, detail="Term not found")
    result = glossary_repo.update_term(
        term_id=term_id,
        term=body.term,
        entity_uri=body.entity_uri,
        entity_kind=body.entity_kind,
        aliases=body.aliases,
        description=body.description,
        example_questions=body.example_questions,
    )
    return result


# ── Delete ────────────────────────────────────────────────

@router.delete("/{ds_id}/{term_id}")
async def delete_term(ds_id: str, term_id: str):
    """删除词汇。"""
    existing = glossary_repo.get_term(term_id)
    if not existing or existing["ds_id"] != ds_id:
        raise HTTPException(status_code=404, detail="Term not found")
    deleted = glossary_repo.delete_term(term_id)
    return {"deleted": deleted}


# ── LLM Auto-generate ─────────────────────────────────────

@router.post("/{ds_id}/generate")
async def generate_glossary(ds_id: str, background_tasks: BackgroundTasks):
    """后台触发：从该数据源的 accepted 注释层自动推导业务词汇。

    - 清除旧 LLM 词汇（保留人工词汇）
    - 调用 LLM 批量生成
    - 返回 accepted 注释数量（词汇生成是异步后台任务）
    """
    from repositories.annotation_repo import list_annotations
    accepted = list_annotations(ds_id, status="accepted")
    zh_count = sum(1 for a in accepted if a["lang"] == "zh")
    if zh_count == 0:
        raise HTTPException(
            status_code=422,
            detail="该数据源没有 accepted 状态的中文语义注释，请先完成注释审核。",
        )

    async def _run():
        from services.glossary_enrichment import generate_glossary_from_annotations
        try:
            count = await generate_glossary_from_annotations(ds_id)
            logger.info("glossary generate finished: ds_id=%s, count=%d", ds_id, count)
        except Exception as e:
            logger.error("glossary generate failed: ds_id=%s, error=%s", ds_id, e)

    background_tasks.add_task(_run)
    return {
        "message": "词汇生成任务已启动（后台运行）",
        "accepted_annotations": zh_count,
        "estimated_terms": zh_count,
    }


# ── Import / Export ───────────────────────────────────────

@router.get("/{ds_id}/export")
async def export_glossary(ds_id: str):
    """导出当前数据源的所有词汇为 JSON（可跨数据源复用）。"""
    terms = glossary_repo.list_terms(ds_id, include_global=False)
    return JSONResponse(
        content={"ds_id": ds_id, "terms": terms},
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="glossary_{ds_id}.json"'},
    )


@router.post("/{ds_id}/import")
async def import_glossary(ds_id: str, body: GlossaryImport):
    """批量导入词汇。overwrite=True 时覆盖同名已有词汇。"""
    dicts = [t.model_dump() for t in body.terms]
    count = glossary_repo.batch_upsert(ds_id, dicts, overwrite=body.overwrite)
    return {"imported": count, "overwrite": body.overwrite}
