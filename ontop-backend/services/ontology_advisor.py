"""本体精化建议生成服务 — 调用 LLM 分析本体结构并输出结构化建议。

分析输入：
  - active TTL 中的类、属性声明
  - accepted 语义注释（中英文 label/comment）
  - OBDA 映射中的类与属性列表

输出格式（JSON 数组）：
  [
    {
      "type": "RENAME_CLASS",
      "current_val": "tbl_act_bill",
      "proposed_val": "Bill",
      "reason": "表名前缀 tbl_act_ 无语义价值，标准本体类名应为 PascalCase",
      "priority": "high",
      "auto_apply": true
    },
    ...
  ]

安全分级：
  - auto_apply=true：RENAME_CLASS / RENAME_PROPERTY / REFINE_TYPE / ADD_LABEL
  - auto_apply=false：ADD_SUBCLASS（需验证层次合理性）/ MERGE_CLASS（高风险）
"""
import json
import logging
import re
from datetime import datetime

logger = logging.getLogger(__name__)

# 不同建议类型的 auto_apply 默认值（保守策略）
AUTO_APPLY_MAP = {
    "RENAME_CLASS":      True,
    "RENAME_PROPERTY":   True,
    "REFINE_TYPE":       True,
    "ADD_LABEL":         True,
    "ADD_SUBCLASS":      False,   # 需要人工确认层次是否合理
    "MERGE_CLASS":       False,
}


async def analyze_ontology(ds_id: str) -> int:
    """LLM 分析本体结构，生成精化建议并写入 ontology_suggestions 表。

    Returns:
        写入的建议条数
    """
    from repositories import suggestion_repo
    from services import llm_service
    from services.active_endpoint_config import load_active_endpoint_config
    from repositories.annotation_repo import list_annotations

    # 清除旧的 pending/rejected 建议（保留 accepted/applied）
    deleted = suggestion_repo.delete_ds_suggestions(ds_id, status="pending")
    suggestion_repo.delete_ds_suggestions(ds_id, status="rejected")
    if deleted:
        logger.info("analyze_ontology: cleared %d old suggestions for ds_id=%s", deleted, ds_id)

    # 获取本体上下文：类、属性
    ontology_context = await _build_ontology_context(ds_id)
    if not ontology_context:
        logger.warning("analyze_ontology: no ontology context for ds_id=%s", ds_id)
        return 0

    # 获取已 accepted 注释作为语义上下文
    accepted = list_annotations(ds_id, status="accepted")
    annotation_context = _format_annotation_context(accepted)

    raw_suggestions = await _call_llm_for_suggestions(
        ontology_context=ontology_context,
        annotation_context=annotation_context,
        llm_client=llm_service._client,
        model=llm_service._model,
    )

    # 补充 auto_apply 默认值
    for s in raw_suggestions:
        if "auto_apply" not in s:
            s["auto_apply"] = AUTO_APPLY_MAP.get(s.get("type", ""), False)

    count = suggestion_repo.batch_create(ds_id, raw_suggestions)
    logger.info("analyze_ontology: generated %d suggestions for ds_id=%s", count, ds_id)
    return count


async def _build_ontology_context(ds_id: str) -> str:
    """从 active TTL 或 mapping 构建本体概要供 LLM 分析。"""
    try:
        # 优先从 ai_query.ontology_summary 复用已有的解析逻辑
        from routers.ai_query import ontology_summary
        summary = await ontology_summary()
        classes = summary.get("classes", [])
        data_props = summary.get("data_properties", [])
        obj_props = summary.get("object_properties", [])
        class_props = summary.get("class_properties", {})
        labels = summary.get("class_labels", {})

        lines = ["本体结构概要：\n"]
        lines.append("=== 类（OWL Class）===")
        for cls in classes:
            label = labels.get(cls, "")
            label_str = f"  [{label}]" if label else ""
            props = class_props.get(cls, [])
            lines.append(f"  {cls}{label_str}")
            if props:
                lines.append(f"    属性: {', '.join(props[:10])}")

        lines.append("\n=== 对象属性（ObjectProperty）===")
        for op in obj_props:
            lines.append(f"  {op}")

        return "\n".join(lines)
    except Exception as e:
        logger.warning("_build_ontology_context failed: %s", e)
        return ""


def _format_annotation_context(annotations: list[dict]) -> str:
    """将 accepted 注释格式化为 LLM 可读的摘要。"""
    if not annotations:
        return "（暂无语义注释）"
    lines = []
    seen = set()
    for a in annotations:
        uri = a.get("entity_uri", "")
        if uri in seen:
            continue
        seen.add(uri)
        label = a.get("label", "")
        comment = a.get("comment", "")
        lines.append(f"  {uri}: {label} — {comment}")
    return "已审核的语义注释：\n" + "\n".join(lines[:50])


def _repair_and_parse_json(raw: str) -> list[dict]:
    """Attempt to repair common LLM JSON issues and parse.

    Handles: unclosed string quotes, Chinese punctuation in values.
    Strategy: extract individual {…} blocks via brace matching and parse each.
    """
    import pathlib
    pathlib.Path("/tmp/llm_raw_debug.json").write_text(raw, encoding="utf-8")
    logger.warning("Attempting JSON repair on raw output (length=%d)", len(raw))

    results = []
    # Find all { ... } blocks by tracking brace depth
    i = 0
    while i < len(raw):
        if raw[i] == '{':
            depth = 0
            start = i
            while i < len(raw):
                if raw[i] == '{':
                    depth += 1
                elif raw[i] == '}':
                    depth -= 1
                    if depth == 0:
                        block = raw[start:i + 1]
                        # Try to parse this block
                        try:
                            obj = json.loads(block)
                            if obj.get("type") and obj.get("current_val"):
                                results.append(obj)
                        except json.JSONDecodeError:
                            # Try fixing: ensure all string values are properly closed
                            fixed = _fix_json_object(block)
                            try:
                                obj = json.loads(fixed)
                                if obj.get("type") and obj.get("current_val"):
                                    results.append(obj)
                            except json.JSONDecodeError:
                                pass
                        break
                i += 1
        i += 1

    logger.info("JSON repair extracted %d valid objects from raw output", len(results))
    return results


def _fix_json_object(block: str) -> str:
    """Fix a single JSON object block by repairing unclosed strings."""
    # Strategy: find "key": patterns and ensure the value string is closed
    # Replace any \n inside strings with space
    result = []
    in_string = False
    i = 0
    while i < len(block):
        ch = block[i]
        if ch == '"' and (i == 0 or block[i - 1] != '\\'):
            in_string = not in_string
            result.append(ch)
        elif in_string and ch == '\n':
            # Unclosed string - close it and start next token
            result.append('"')
            in_string = False
            result.append(ch)
        else:
            result.append(ch)
        i += 1
    # If still in string at end, close it
    if in_string:
        result.append('"')
    return ''.join(result)


async def _call_llm_for_suggestions(
    ontology_context: str,
    annotation_context: str,
    llm_client,
    model: str,
) -> list[dict]:
    """调用 LLM 返回结构化建议列表。"""
    system_prompt = (
        "你是一名本体工程师，负责审查自动生成的 OWL 本体并给出改进建议。\n"
        "根据用户提供的本体结构和已有语义注释，生成精化建议。\n\n"
        "建议类型说明：\n"
        "  RENAME_CLASS：类名不符合 PascalCase 或有冗余前缀时建议重命名\n"
        "  RENAME_PROPERTY：属性命名冗余（如 bill_amount / bill#bill_amount）\n"
        "  ADD_SUBCLASS：当类有明显父子关系时建议添加 rdfs:subClassOf\n"
        "  REFINE_TYPE：数据属性的 XSD 类型可以更精确（如 string→decimal/date）\n"
        "    current_val 填属性 URI（如 'Account#balance'），proposed_val 填目标 XSD 类型（如 'decimal'）\n"
        "  ADD_LABEL：实体缺少中文标注时建议补充\n"
        "    current_val 填实体 URI（如 ':meter'），proposed_val 填中文标签\n\n"
        "输出要求：\n"
        "  - 只返回 JSON 数组，不要任何说明文字\n"
        "  - 每个建议 5-10 条，优先给出高确定性的改进\n"
        "  - priority 只能是 high/medium/low\n"
        "  - 格式：[{\"type\":\"...\",\"current_val\":\"...\",\"proposed_val\":\"...\","
        "\"reason\":\"...\",\"priority\":\"high\"}]"
    )
    user_msg = f"{ontology_context}\n\n{annotation_context}\n\n请给出本体精化建议："

    try:
        response = await llm_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_msg},
            ],
            temperature=0.2,
            max_tokens=4096,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:-1]).strip()
        # Extract JSON array from response
        start = raw.find("[")
        end = raw.rfind("]")
        if start >= 0 and end > start:
            raw = raw[start:end + 1]
        # Fix common LLM JSON issues: trailing commas before } or ]
        raw = re.sub(r",\s*([}\]])", r"\1", raw)
        # Remove control characters but keep \n \t for readability
        raw = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", raw)

        # Try direct parse first
        try:
            suggestions = json.loads(raw)
        except json.JSONDecodeError:
            # Fallback: fix unclosed quotes in JSON strings
            # The LLM sometimes outputs "key": "value_without_closing_quote
            suggestions = _repair_and_parse_json(raw)
        # 过滤无效条目
        valid = [
            s for s in suggestions
            if s.get("type") and s.get("current_val") and s.get("proposed_val")
        ]
        return valid
    except Exception as e:
        logger.warning("_call_llm_for_suggestions failed: %s (raw length=%d)", e, len(raw) if 'raw' in dir() else 0)
        # Dump raw output for debugging
        if 'raw' in dir() and raw:
            import pathlib
            pathlib.Path("/tmp/llm_raw_debug.json").write_text(raw, encoding="utf-8")
            logger.info("Raw LLM output dumped to /tmp/llm_raw_debug.json")
        return []
