"""业务词汇表自动生成服务 — 从已 accepted 的语义注释层推导业务词汇。

核心逻辑：
  1. 读取该数据源所有 accepted 的语义注释（zh/en 配对）
  2. 调用 LLM，为每个注释生成业务口语词汇和别名
  3. 将结果批量写入 business_glossary 表（source='llm', overwrite=False 不覆盖人工词汇）

调用方式：
    count = await generate_glossary_from_annotations(ds_id)
    # 或通过 API POST /glossary/{ds_id}/generate 触发
"""
import asyncio
import json
import logging

logger = logging.getLogger(__name__)


async def generate_glossary_from_annotations(ds_id: str, batch_size: int = 15) -> int:
    """从语义注释层推导业务词汇，写入 business_glossary 表。

    Args:
        ds_id:      数据源 ID
        batch_size: 每批发送给 LLM 的注释数量

    Returns:
        新写入的词汇条数（不含跳过的重复项）
    """
    from repositories import annotation_repo, glossary_repo, task_progress_repo
    from services import llm_service

    # 获取已 accepted 的 zh 注释（zh 包含 comment，信息最丰富）
    accepted_zh = [
        a for a in annotation_repo.list_annotations(ds_id, status="accepted")
        if a["lang"] == "zh"
    ]
    if not accepted_zh:
        logger.info("generate_glossary: no accepted zh annotations for ds_id=%s", ds_id)
        return 0

    # 清除旧的 LLM 词汇（保留人工词汇）
    deleted = glossary_repo.delete_llm_terms(ds_id)
    if deleted:
        logger.info("generate_glossary: cleared %d old llm terms for ds_id=%s", deleted, ds_id)

    total_written = 0

    # ── 进度追踪 ──
    task_id = task_progress_repo.create_task("glossary", ds_id, total=len(accepted_zh))

    try:
        for i in range(0, len(accepted_zh), batch_size):
            batch = accepted_zh[i: i + batch_size]
            new_terms = await _call_llm_for_glossary(batch, llm_service._client, llm_service._model)

            for t in new_terms:
                if not t.get("term") or not t.get("entity_uri"):
                    continue
                glossary_repo.upsert_term(
                    ds_id=ds_id,
                    term=t["term"],
                    entity_uri=t["entity_uri"],
                    entity_kind=t.get("entity_kind", "data_property"),
                    aliases=t.get("aliases", []),
                    description=t.get("description", ""),
                    example_questions=t.get("example_questions", []),
                    source="llm",
                    overwrite=False,
                )
                total_written += 1

            processed = min(i + batch_size, len(accepted_zh))
            task_progress_repo.update_progress(
                task_id, current=processed,
                message=f"正在生成词汇 {processed}/{len(accepted_zh)}...",
            )

            if i + batch_size < len(accepted_zh):
                await asyncio.sleep(0.5)

        task_progress_repo.complete_task(
            task_id,
            result=f'{{"total_written": {total_written}}}',
        )
        logger.info("generate_glossary: wrote %d terms for ds_id=%s", total_written, ds_id)
        return total_written
    except Exception as e:
        task_progress_repo.fail_task(task_id, str(e))
        raise


async def _call_llm_for_glossary(
    annotations: list[dict],
    llm_client,
    model: str,
) -> list[dict]:
    """调用 LLM，为注释列表生成业务口语词汇。"""
    items = [
        {
            "entity_uri": a["entity_uri"],
            "entity_kind": a["entity_kind"],
            "label_zh": a.get("label", ""),
            "comment_zh": a.get("comment", ""),
        }
        for a in annotations
    ]
    items_json = json.dumps(items, ensure_ascii=False)

    system_prompt = (
        "你是一名业务分析师，负责构建知识图谱的业务词汇表。\n"
        "用户会给你一组本体实体（类或属性）及其语义标注，\n"
        "请为每个实体生成用户在对话中可能使用的业务口语词汇：\n"
        "  - term: 最核心的中文业务词（2-4字，如\"欠款\"\"物业费\"\"缴费状态\"）\n"
        "  - aliases: 3-5个别名或口语表达（JSON 数组）\n"
        "  - description: 一句话业务解释（15-40字）\n"
        "  - example_questions: 2-3个用户可能问的问题（JSON 数组）\n\n"
        "直接输出 JSON 数组，格式：\n"
        '[{"entity_uri":"...","entity_kind":"...","term":"...","aliases":[...],'
        '"description":"...","example_questions":[...]}]'
    )
    user_msg = f"请为以下本体实体生成业务词汇表条目：\n{items_json}"

    try:
        response = await llm_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            max_tokens=4096,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:-1]).strip()
        # Extract JSON array from response (LLM may add extra text)
        start = raw.find("[")
        end = raw.rfind("]")
        if start >= 0 and end > start:
            raw = raw[start:end + 1]
        # Fix common LLM JSON issues: trailing commas before } or ]
        import re
        raw = re.sub(r",\s*([}\]])", r"\1", raw)
        return json.loads(raw)
    except Exception as e:
        logger.warning("_call_llm_for_glossary failed: %s (raw=%s...)", e, raw[:200] if 'raw' in dir() else 'N/A')
        return []
