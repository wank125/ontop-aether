"""Bootstrap 后本体语义增强服务 — 用 LLM 为每个类/属性生成中英文标注并存入注释库。

与旧版的核心差异：
  - 不再直接写 TTL 文件（避免 Bootstrap 重跑时覆盖标注）
  - 结果写入 SQLite semantic_annotations 表（status=pending）
  - 已存在 accepted/rejected 的实体跳过（不覆盖人工审核）
  - 新增 ds_id 参数（由 datasources.py Bootstrap 流程传入）

调用方式：
    asyncio.create_task(enrich_ontology_labels(ttl_path, ds_id=ds_id))
"""
import asyncio
import json
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)


# ── Entity extraction ────────────────────────────────────


def _extract_entities_from_ttl(ttl_content: str) -> dict[str, list[str]]:
    """从 TTL 中提取 owl:Class / DatatypeProperty / ObjectProperty 的局部名。

    返回：
        {"classes": [...], "data_properties": [...], "object_properties": [...]}
    """
    classes: list[str] = []
    data_props: list[str] = []
    obj_props: list[str] = []

    block_pattern = re.compile(
        r'((?:[\w:]+|<[^>]+>)\s+(?:a|rdf:type)\s+(?:owl:Class|owl:DatatypeProperty|owl:ObjectProperty)[^.]+\.)',
        re.DOTALL
    )
    for block in block_pattern.finditer(ttl_content):
        text = block.group(1)
        subj_match = re.match(r'([\w:]+|<[^>]+>)', text.strip())
        if not subj_match:
            continue
        subject = subj_match.group(1).strip("<>")
        local = subject.rsplit("/", 1)[-1].rsplit("#", 1)[-1].rstrip(">")
        if not local or local.startswith("_"):
            continue

        if "owl:Class" in text:
            classes.append(local)
        elif "owl:ObjectProperty" in text:
            obj_props.append(local)
        elif "owl:DatatypeProperty" in text:
            data_props.append(local)

    return {
        "classes":           list(dict.fromkeys(classes)),
        "data_properties":   list(dict.fromkeys(data_props)),
        "object_properties": list(dict.fromkeys(obj_props)),
    }


# ── LLM call ─────────────────────────────────────────────


async def _call_llm_for_labels(
    entity_list: list[dict],
    llm_client,
    model: str,
) -> list[dict]:
    """批量调用 LLM 生成 (zh, en) 的 label + comment。

    entity_list: [{"name": "OrderItem", "kind": "class"}, ...]
    返回: [{"name":"OrderItem","label_zh":"...","label_en":"...","comment_zh":"...","comment_en":"..."}, ...]
    """
    if not entity_list:
        return []

    names_json = json.dumps([e["name"] for e in entity_list], ensure_ascii=False)
    system_prompt = (
        "你是一名数据治理专家，负责为从关系数据库自动生成的知识图谱本体提供语义标注。\n"
        "用户会给你一个本体实体名称列表（camelCase 或 PascalCase 的类/属性名），\n"
        "你需要为每个名称生成：\n"
        "  - label_zh: 简洁准确的中文名称（2-6字）\n"
        "  - label_en: 规范的英文名称（1-4 words, Title Case）\n"
        "  - comment_zh: 一句话业务描述（15-50字）\n"
        "  - comment_en: One sentence business description in English\n\n"
        "直接以 JSON 数组格式输出，不要任何额外说明。格式：\n"
        '[{"name":"XX","label_zh":"...","label_en":"...","comment_zh":"...","comment_en":"..."}]'
    )
    user_msg = f"请为以下本体实体生成语义标注（来自关系数据库自动 bootstrap）：\n{names_json}"

    try:
        response = await llm_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.2,
            max_tokens=2048,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:-1]).strip()
        return json.loads(raw)
    except Exception as e:
        logger.warning("_call_llm_for_labels failed: %s", e)
        return []


# ── Main entry ───────────────────────────────────────────


KIND_MAP = {
    "classes":           "class",
    "data_properties":   "data_property",
    "object_properties": "object_property",
}


async def enrich_ontology_labels(
    ttl_path: str,
    ds_id: str,
    batch_size: int = 30,
) -> int:
    """读取 TTL，将未标注的实体发给 LLM，把结果存入注释库（status=pending）。

    与旧版相比，不再写 TTL 文件；改为写入 semantic_annotations 表。
    已存在 accepted/rejected 记录的实体由 upsert_annotation 的保护规则自动跳过。

    Args:
        ttl_path:   Bootstrap 产出的 TTL 文件路径
        ds_id:      数据源 ID（注释库隔离 key）
        batch_size: 每批发送给 LLM 的实体数量

    Returns:
        写入注释库的新增条目数（zh + en 各算一条）
    """
    from repositories import annotation_repo  # 懒加载，避免启动时循环依赖
    from services import llm_service

    path = Path(ttl_path)
    if not path.exists():
        logger.warning("enrich_ontology_labels: TTL not found: %s", ttl_path)
        return 0

    ttl_content = path.read_text(encoding="utf-8")
    entities_by_kind = _extract_entities_from_ttl(ttl_content)

    # 清理该数据源旧的 pending LLM 注释（Bootstrap 重跑时替换旧的未审核标注）
    deleted = annotation_repo.delete_pending_for_datasource(ds_id)
    if deleted:
        logger.info("enrich_ontology_labels: cleared %d old pending annotations for ds_id=%s", deleted, ds_id)

    # 构建实体列表（扁平化，带 kind）
    all_entities: list[dict] = []
    for kind_key, local_names in entities_by_kind.items():
        kind = KIND_MAP[kind_key]
        for name in local_names:
            all_entities.append({"name": name, "kind": kind})

    if not all_entities:
        logger.info("enrich_ontology_labels: no entities found in %s", ttl_path)
        return 0

    logger.info("enrich_ontology_labels: enriching %d entities for ds_id=%s", len(all_entities), ds_id)

    client = llm_service._client
    model  = llm_service._model
    total_written = 0

    for i in range(0, len(all_entities), batch_size):
        batch  = all_entities[i: i + batch_size]
        labels = await _call_llm_for_labels(batch, client, model)

        for item in labels:
            name = item.get("name", "")
            if not name:
                continue
            # 找到该实体的 kind
            kind = next((e["kind"] for e in batch if e["name"] == name), "class")

            for lang, label_key, comment_key in [
                ("zh", "label_zh", "comment_zh"),
                ("en", "label_en", "comment_en"),
            ]:
                label   = item.get(label_key, "")
                comment = item.get(comment_key, "")
                if label or comment:
                    annotation_repo.upsert_annotation(
                        ds_id=ds_id,
                        entity_uri=name,
                        entity_kind=kind,
                        lang=lang,
                        label=label,
                        comment=comment,
                        source="llm",
                    )
                    total_written += 1

        if i + batch_size < len(all_entities):
            await asyncio.sleep(0.5)  # 避免 LLM 限速

    logger.info(
        "enrich_ontology_labels: wrote %d annotation records for ds_id=%s",
        total_written, ds_id
    )
    return total_written
