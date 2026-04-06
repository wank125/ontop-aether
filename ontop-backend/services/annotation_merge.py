"""语义注释合并服务 — 将注释库中已 accepted 的标注写入 active_ontology.ttl。

调用时机：
  1. Bootstrap 完成后（自动，覆盖当前空的 active TTL）
  2. 用户在 UI 批量 accept 注释后（手动触发，更新 active TTL）
  3. API POST /annotations/{ds_id}/merge（手动触发）

合并策略：
  - raw TTL 内容原样保留（不修改任何原有三元组）
  - accepted 注释追加到文件末尾的独立块中
  - 已在 raw TTL 中存在 rdfs:label 的实体不重复写入
  - output_path 与 raw_ttl_path 可以相同（原地追加）或不同（新文件）
"""
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)


def _has_label_in_ttl(ttl_content: str, entity_uri: str) -> bool:
    """检查 TTL 中某个实体是否已经有 rdfs:label 三元组（避免重复标注）。"""
    # 匹配：:EntityName rdfs:label ... 或 <uri> rdfs:label ...
    pattern = re.compile(
        rf'(?::{re.escape(entity_uri)}|<[^>]*{re.escape(entity_uri)}[^>]*>)[^.]*rdfs:label',
        re.DOTALL
    )
    return bool(pattern.search(ttl_content))


def _detect_prefix(ttl_content: str) -> str:
    """从 TTL 中提取本体自定义前缀（非标准命名空间中的第一个）。"""
    m = re.search(r'@prefix\s+:\s*<[^>]+>', ttl_content)
    if m:
        return ":"
    for m in re.finditer(r'@prefix\s+(\w+):\s*<([^>]+)>', ttl_content):
        prefix, uri = m.group(1), m.group(2)
        if prefix not in {"owl", "rdf", "rdfs", "xsd", "sh", "skos", "dcterms", "dc"}:
            return prefix
    return ""


def _build_turtle_block(annotations: list[dict], prefix: str, existing_ttl: str) -> str:
    """把 accepted 注释列表转换为 Turtle 追加块文本。"""
    # 按实体分组：{entity_uri: {zh: {...}, en: {...}}}
    grouped: dict[str, dict[str, dict]] = {}
    for ann in annotations:
        uri = ann["entity_uri"]
        lang = ann["lang"]
        grouped.setdefault(uri, {})[lang] = ann

    lines: list[str] = [
        "\n# ── Semantic Annotation Layer (auto-merged, do not edit manually) ──\n"
    ]

    for entity_uri, lang_map in sorted(grouped.items()):
        # 跳过已在 raw TTL 里有 label 的实体
        if _has_label_in_ttl(existing_ttl, entity_uri):
            continue

        # 构建 subject 表达式
        subject = f"{prefix}:{entity_uri}" if prefix else f"<{entity_uri}>"

        triples: list[str] = []
        for lang in ("zh", "en"):
            if lang not in lang_map:
                continue
            ann = lang_map[lang]
            label = ann.get("label", "").replace('"', '\\"')
            comment = ann.get("comment", "").replace('"', '\\"')
            if label:
                triples.append(f'    rdfs:label "{label}"@{lang}')
            if comment:
                triples.append(f'    rdfs:comment "{comment}"@{lang}')

        if triples:
            lines.append(f"\n{subject}")
            lines.append(" ;\n".join(triples) + " .")

    return "\n".join(lines) + "\n"


def merge_annotations_to_ttl(
    raw_ttl_path: str,
    ds_id: str,
    output_ttl_path: str,
) -> int:
    """将注释库中 accepted 的条目合并到 TTL 文件。

    Args:
        raw_ttl_path:    Bootstrap 生成的原始 TTL 路径
        ds_id:           数据源 ID（用于查询注释库）
        output_ttl_path: 输出路径（可等于 raw_ttl_path 表示原地追加）

    Returns:
        实际写入的注释实体数量（每个实体计一次，无论语言数量）
    """
    from repositories import annotation_repo  # 懒加载避免循环依赖

    raw_path = Path(raw_ttl_path)
    out_path = Path(output_ttl_path)

    if not raw_path.exists():
        logger.warning("merge_annotations_to_ttl: raw TTL not found: %s", raw_ttl_path)
        return 0

    accepted = annotation_repo.list_annotations(ds_id, status="accepted")
    if not accepted:
        logger.info("merge_annotations_to_ttl: no accepted annotations for ds_id=%s, copying raw TTL", ds_id)
        # 如果 output 与 raw 不同路径，确保 output 目录存在并复制
        if raw_path != out_path:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(raw_path.read_text(encoding="utf-8"), encoding="utf-8")
        return 0

    raw_content = raw_path.read_text(encoding="utf-8")
    prefix = _detect_prefix(raw_content)
    turtle_block = _build_turtle_block(accepted, prefix, raw_content)

    # 统计实际写入的实体数（去重）
    entity_count = len({a["entity_uri"] for a in accepted
                        if not _has_label_in_ttl(raw_content, a["entity_uri"])})

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if raw_path == out_path:
        # 原地追加：检查是否已有合并块，避免重复
        if "Semantic Annotation Layer" in raw_content:
            # 替换旧的合并块
            clean = re.split(r'\n#\s*──\s*Semantic Annotation Layer', raw_content)[0]
            out_path.write_text(clean + turtle_block, encoding="utf-8")
        else:
            with out_path.open("a", encoding="utf-8") as f:
                f.write(turtle_block)
    else:
        # 写到新路径
        out_path.write_text(raw_content + turtle_block, encoding="utf-8")

    logger.info(
        "merge_annotations_to_ttl: merged %d entities into %s",
        entity_count, output_ttl_path
    )
    return entity_count
