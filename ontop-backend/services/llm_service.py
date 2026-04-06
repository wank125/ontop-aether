"""LLM service for natural language to SPARQL translation."""
import logging
from typing import Optional

from openai import AsyncOpenAI

from config import LLM_BASE_URL, LLM_API_KEY, LLM_MODEL

logger = logging.getLogger(__name__)

# Mutable module-level state
_client: AsyncOpenAI = AsyncOpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)
_model: str = LLM_MODEL
_temperature: float = 0.1
_max_tokens: int = 1024

DEFAULT_ANSWER_PROMPT = """根据以下 SPARQL 查询结果，用中文简洁回答用户问题。

用户问题: {question}
SPARQL 查询结果: {result}

简洁回答:"""


def reload_client(
    base_url: str,
    api_key: str,
    model: str,
    temperature: float = 0.1,
    max_tokens: int = 1024,
):
    """Reload LLM client with new config."""
    global _client, _model, _temperature, _max_tokens
    _client = AsyncOpenAI(base_url=base_url, api_key=api_key)
    _model = model
    _temperature = temperature
    _max_tokens = max_tokens
    logger.info(f"LLM client reloaded: model={model}, base_url={base_url}")


def build_sparql_prompt(
    classes: list[str],
    properties: list[str],
    relationships: list[str],
    prefixes: dict[str, str],
    template: Optional[str] = None,
    class_properties: Optional[dict[str, list[str]]] = None,
    class_labels: Optional[dict[str, str]] = None,
    glossary: Optional[list[dict]] = None,
    question: Optional[str] = None,
) -> str:
    """Build the SPARQL generation system prompt.

    Args:
        glossary:  业务词汇表条目列表，每条含 term/aliases/entity_uri/entity_kind
        question:  当前用户问题，用于关键词匹配，只注入相关词汇（Top-K）
    """
    if template is None:
        template = DEFAULT_SPARQL_TEMPLATE

    prefix_str = "\n".join(f"PREFIX {k}: <{v}>" for k, v in prefixes.items())

    # Build per-class property description
    class_prop_str = ""
    if class_properties:
        lines = []
        for cls_name, props in sorted(class_properties.items()):
            # 如果有语义标注，追加在类名后面的括号里
            label_hint = f"  # {class_labels[cls_name]}" if class_labels and cls_name in class_labels else ""
            lines.append(f"  {cls_name}:{label_hint} {', '.join(props)}")
        class_prop_str = "\n".join(lines)

    cls_base = prefixes.get("cls", "")

    # Build glossary injection string
    glossary_str = ""
    if glossary:
        matched = _match_glossary(question or "", glossary)
        if matched:
            lines = []
            for t in matched:
                all_terms = [t["term"]] + (t.get("aliases") or [])
                terms_str = " / ".join(all_terms)
                lines.append(f"- {terms_str}  →  {t['entity_uri']}")
            glossary_str = "\n".join(lines)

    # Use format with safe fallback for missing placeholders
    fmt_args = {
        "classes": ", ".join(classes),
        "properties": ", ".join(properties),
        "relationships": ", ".join(relationships),
        "prefixes": prefix_str,
        "class_properties": class_prop_str,
        "cls_base": cls_base,
        "glossary": glossary_str,
    }
    try:
        return template.format(**fmt_args)
    except KeyError:
        # Custom template may use different placeholders; use safe partial formatting
        import string
        class SafeDict(dict):
            def __missing__(self, key):
                return "{" + key + "}"
        return string.Formatter().vformat(template, (), SafeDict(fmt_args))


def _match_glossary(question: str, glossary: list[dict], top_k: int = 12) -> list[dict]:
    """根据问题关键词过滤词汇表，返回最相关的 top_k 条。

    若 question 为空（如 Prompt 预构建场景），返回前 top_k 条。
    """
    if not glossary:
        return []
    if not question.strip():
        return glossary[:top_k]

    q_lower = question.lower()
    scored: list[tuple[int, dict]] = []
    for t in glossary:
        score = 0
        if t["term"] in question:
            score += 3
        for alias in (t.get("aliases") or []):
            if alias in question:
                score += 2
        if t["entity_uri"].lower() in q_lower:
            score += 1
        if score > 0:
            scored.append((score, t))

    if scored:
        scored.sort(key=lambda x: -x[0])
        return [t for _, t in scored[:top_k]]

    # 没有命中则返回全量前 top_k（兜底）
    return glossary[:top_k]




DEFAULT_SPARQL_TEMPLATE = """你是一个 SPARQL 查询生成器。根据本体结构将用户问题翻译为 SPARQL 查询。

声明的 Prefix:
{prefixes}

本体类及其属性（属性格式为 ClassName#attrName，使用时必须加尖括号变为 <{cls_base}ClassName#attrName>）:
{class_properties}

规则:
1. 只返回一条 SPARQL 查询，不要任何解释文字
2. 变量使用问号前缀（如 ?name）
3. 使用 PREFIX 声明命名空间
4. 中文值直接用引号匹配
5. 类 URI: 直接用 cls:ClassName（如 cls:river）
6. 属性 URI: 必须用尖括号包裹完整路径，格式为 <{cls_base}ClassName#attrName>。例如查 river 的 name 属性，必须写 <{cls_base}river#name>，绝对不能写 cls:name
7. ORDER BY、LIMIT、OFFSET 必须放在最外层花括号 }} 之后
8. 当下方业务词汇表不为空时，遇到用户提到的业务词汇，必须使用对应的属性 URI，不得自行猜测

业务词汇对照表（优先使用）：
{glossary}

正确示例（查询所有国家名称和人口，按人口降序取前5）:
PREFIX cls: <{cls_base}>
SELECT ?name ?pop WHERE {{
  ?c a cls:country ;
     <{cls_base}country#name> ?name ;
     <{cls_base}country#population> ?pop .
}}
ORDER BY DESC(?pop)
LIMIT 5"""


async def generate_sparql(system_prompt: str, question: str) -> str:
    """Generate SPARQL query from natural language question."""
    response = await _client.chat.completions.create(
        model=_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ],
        temperature=_temperature,
        max_tokens=_max_tokens,
    )
    return response.choices[0].message.content.strip()


async def generate_corrected_sparql(
    system_prompt: str,
    question: str,
    failed_sparql: str,
    error_message: str,
) -> str:
    """让 LLM 根据错误信息自我修正上一次失败的 SPARQL。

    把失败的 SPARQL 和 Ontop 返回的错误一起塞进对话上下文，
    让 LLM 有机会识别并修正属性名错误、绑定变量遗漏等常见问题。
    """
    correction_prompt = (
        f"以下 SPARQL 执行时报错，请修复后重新输出一条正确的 SPARQL，不要任何解释。\n\n"
        f"失败的 SPARQL:\n```sparql\n{failed_sparql}\n```\n\n"
        f"错误信息:\n{error_message[:500]}"
    )
    response = await _client.chat.completions.create(
        model=_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
            {"role": "assistant", "content": failed_sparql},
            {"role": "user", "content": correction_prompt},
        ],
        temperature=_temperature,
        max_tokens=_max_tokens,
    )
    return response.choices[0].message.content.strip()


async def generate_answer(question: str, result: str) -> str:
    """Generate natural language answer from query results."""
    prompt = DEFAULT_ANSWER_PROMPT.format(question=question, result=result)
    response = await _client.chat.completions.create(
        model=_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=512,
    )
    return response.choices[0].message.content.strip()

