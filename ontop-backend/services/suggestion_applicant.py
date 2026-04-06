"""本体精化建议自动应用服务 — 将 accepted 建议写入 TTL 文件。

支持的自动应用类型：
  RENAME_CLASS:    在 TTL 中替换 ClassName（URI + rdfs:label）
  RENAME_PROPERTY: 同上，替换属性 local name
  REFINE_TYPE:     替换 rdfs:range 的 XSD 类型
  ADD_LABEL:       追加 rdfs:label 三元组（写入注释层，不改 TTL）

不自动应用（返回人工指引）：
  ADD_SUBCLASS:    给出需要追加的 Turtle 片段供人工核实
  MERGE_CLASS:     给出合并建议文本
"""
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)


def apply_suggestion(suggestion: dict, ttl_path: str) -> tuple[bool, str]:
    """将单条建议应用到 TTL 文件。

    Returns:
        (success, message)
    """
    sug_type    = suggestion.get("type", "")
    current_val = suggestion.get("current_val", "")
    proposed_val = suggestion.get("proposed_val", "")

    if sug_type == "RENAME_CLASS":
        return _rename_in_ttl(ttl_path, current_val, proposed_val, "class")

    if sug_type == "RENAME_PROPERTY":
        return _rename_in_ttl(ttl_path, current_val, proposed_val, "property")

    if sug_type == "REFINE_TYPE":
        return _refine_xsd_type(ttl_path, current_val, proposed_val)

    if sug_type == "ADD_LABEL":
        # 写入语义注释层，不改 TTL
        return _add_label_to_annotation_layer(suggestion)

    if sug_type == "ADD_SUBCLASS":
        return False, (
            f"请手动在本体文件中追加：\n"
            f"  :{current_val} rdfs:subClassOf :{proposed_val} .\n"
            f"建议位置：{ttl_path} 中 :{current_val} 的类声明块之后"
        )

    return False, f"不支持自动应用的建议类型：{sug_type}"


# ── 内部实现 ─────────────────────────────────────────────


def _rename_in_ttl(ttl_path: str, current: str, proposed: str, kind: str) -> tuple[bool, str]:
    """在 TTL 文件中做安全的文本替换。

    替换逻辑（保守策略）：
      - 只替换 URI local name 部分（cls:ClassName 或 #propertyName）
      - 使用词边界避免误替换子字符串
    """
    path = Path(ttl_path)
    if not path.exists():
        return False, f"TTL 文件不存在：{ttl_path}"

    content = path.read_text(encoding="utf-8")
    original = content

    # 替换 URI 写法：:/ClassName 或 #ClassName
    pattern = re.compile(r'(?<=[:/])' + re.escape(current) + r'(?=[\s>.,;)])')
    new_content = pattern.sub(proposed, content)

    if new_content == original:
        return False, f"未找到 '{current}'，无需修改（可能已被重命名）"

    # 写入前备份
    backup_path = path.with_suffix(".ttl.bak")
    backup_path.write_text(original, encoding="utf-8")

    path.write_text(new_content, encoding="utf-8")
    count = len(pattern.findall(original))
    logger.info("Renamed %s '%s' → '%s' (%d occurrences) in %s",
                kind, current, proposed, count, ttl_path)
    return True, f"已将 '{current}' 重命名为 '{proposed}'（{count} 处），备份：{backup_path}"


def _refine_xsd_type(ttl_path: str, property_uri: str, proposed_type: str) -> tuple[bool, str]:
    """替换或追加指定属性的 rdfs:range XSD 类型。

    TTL 中属性声明可能有两种形式：
      1) 已有 range: <…#balance> rdfs:range xsd:string ;  → 替换
      2) 无 range:   <…#account_id> rdf:type owl:DatatypeProperty . → 追加 rdfs:range

    Args:
        property_uri:  属性 URI（如 ':account#balance' 或 'account#balance'）
        proposed_type: 目标 XSD 类型（如 'decimal', 'date', 'integer'）
    """
    path = Path(ttl_path)
    if not path.exists():
        return False, f"TTL 文件不存在：{ttl_path}"

    content = path.read_text(encoding="utf-8")
    original = content

    # 提取 local name 用于匹配（支持 ':account#balance' 和 'account#balance'）
    local = property_uri.lstrip(":")
    escaped = re.escape(local)

    # ── 检查是否已有该属性的 rdfs:range（去重）──
    range_check = re.compile(
        r'(?m)^.*' + escaped + r'.*rdfs:range\s+xsd:' + re.escape(proposed_type) + r'\b',
    )
    if range_check.search(original):
        return False, f"'{property_uri}' 已有 rdfs:range xsd:{proposed_type}，无需修改"

    # ── 策略 1: 替换已有的 rdfs:range xsd:xxx（不同类型）──
    replace_pattern = re.compile(
        r'(?m)^(.*' + escaped + r'.*rdfs:range\s+)xsd:\w+(.*)$',
    )
    matches = list(replace_pattern.finditer(original))
    if matches:
        def _replacer(m):
            return f"{m.group(1)}xsd:{proposed_type}{m.group(2)}"
        content = replace_pattern.sub(_replacer, content)
        backup = path.with_suffix(".ttl.bak")
        backup.write_text(original, encoding="utf-8")
        path.write_text(content, encoding="utf-8")
        logger.info("Replaced rdfs:range for '%s' → xsd:%s (%d occurrences) in %s",
                    property_uri, proposed_type, len(matches), ttl_path)
        return True, f"已将 '{property_uri}' 的 rdfs:range 替换为 xsd:{proposed_type}（{len(matches)} 处），备份：{backup}"

    # ── 策略 2: 属性声明无 rdfs:range，追加新行 ──
    decl_pattern = re.compile(
        r'(<[^>]*' + escaped + r'[^>]*>\s+rdf:type\s+owl:(?:Datatype|Object)Property\s*\.)',
    )
    decl_match = decl_pattern.search(content)
    if decl_match:
        insert_point = decl_match.end()
        new_range_line = f"\n<http://example.com/ontop/{local}> rdfs:range xsd:{proposed_type} ."
        content = content[:insert_point] + new_range_line + content[insert_point:]

        backup = path.with_suffix(".ttl.bak")
        backup.write_text(original, encoding="utf-8")
        path.write_text(content, encoding="utf-8")
        logger.info("Added rdfs:range xsd:%s for '%s' in %s", proposed_type, property_uri, ttl_path)
        return True, f"已为 '{property_uri}' 追加 rdfs:range xsd:{proposed_type}，备份：{backup}"

    # ── 策略 3: 完全匹配不到属性声明 ──
    return False, f"未在 TTL 中找到属性 '{property_uri}' 的声明"


def _add_label_to_annotation_layer(suggestion: dict) -> tuple[bool, str]:
    """ADD_LABEL 类型：将建议的 label 写入语义注释层（pending 状态）。"""
    try:
        from repositories.annotation_repo import upsert_annotation  # type: ignore
        entity_uri = suggestion.get("current_val", "")
        label_zh   = suggestion.get("proposed_val", "")
        ds_id      = suggestion.get("ds_id", "")
        if not entity_uri or not label_zh:
            return False, "entity_uri 或 label 为空"
        upsert_annotation(
            ds_id=ds_id,
            entity_uri=entity_uri,
            entity_kind="class",
            lang="zh",
            label=label_zh,
            comment="",
            source="llm",
        )
        return True, f"已将 '{label_zh}' 写入语义注释层（status=pending，请前往注释页审核）"
    except Exception as e:
        return False, f"写入注释层失败：{e}"
