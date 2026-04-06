"""AI natural language query router."""
import json
import logging
import re
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel

from models.mapping import MappingContent
from services.llm_service import generate_sparql, generate_corrected_sparql, generate_answer, build_sparql_prompt
from services.obda_parser import parse_obda
from config import ONTOP_ENDPOINT_URL
from services.active_endpoint_config import load_active_endpoint_config

router = APIRouter(prefix="/ai", tags=["ai"])

logger = logging.getLogger(__name__)

# ── Provider presets ──────────────────────────────
PROVIDER_PRESETS = {
    "openai": {
        "label": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    },
    "lm_studio": {
        "label": "LM Studio",
        "base_url": "http://localhost:1234/v1",
        "models": [],
    },
    "ollama": {
        "label": "Ollama",
        "base_url": "http://localhost:11434/v1",
        "models": [],
    },
    "deepseek": {
        "label": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "models": ["deepseek-chat", "deepseek-reasoner"],
    },
    "zhipu": {
        "label": "智谱 AI",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "models": ["glm-4-flash", "glm-4-plus", "glm-4-long"],
    },
    "azure_openai": {
        "label": "Azure OpenAI",
        "base_url": "https://{resource}.openai.azure.com/openai/deployments/{deployment}",
        "models": [],
    },
    "anthropic": {
        "label": "Anthropic Claude",
        "base_url": "https://api.anthropic.com",
        "models": ["claude-sonnet-4-20250514", "claude-haiku-4-20250514", "claude-3.5-sonnet-20241022"],
    },
    "custom": {
        "label": "自定义 (OpenAI 兼容)",
        "base_url": "",
        "models": [],
    },
}

# ── Default config values ──────────────────────────────
DEFAULT_CONFIG = {
    "llm_provider": "lm_studio",
    "llm_base_url": "http://localhost:1234/v1",
    "llm_api_key": "lm-studio",
    "llm_model": "zai-org/glm-4.7-flash",
    "llm_temperature": 0.1,
    "max_tokens": 1024,
}

DEFAULT_SYSTEM_PROMPT = """你是一个严格的 SPARQL 查询生成器。根据当前本体结构把用户问题翻译成一条可执行的 SPARQL。

声明的 Prefix:
{prefixes}

当前本体中每个类可用的属性如下，属性格式为 ClassName#attrName：
{class_properties}

规则:
1. 只返回一条 SPARQL，不要解释，不要 Markdown。
2. 类只能写成 cls:ClassName。
3. 属性不要写 cls:name 这类简写，必须写完整 URI：<{cls_base}ClassName#attrName>。
4. 只能使用上面列出的真实类和真实属性，禁止编造属性。
5. 如果本体没有对象属性，跨表查询必须通过共享标识字段连接，例如 code、country、province、name。
6. 除非问题明确要求，不要附加无关属性。
7. 如果用户是在“列出有哪些 X”，优先只返回名称、代码或主标识属性。
8. ORDER BY、LIMIT、OFFSET 必须写在最外层右花括号之后。

示例 1:
PREFIX cls: <{cls_base}>
SELECT ?name WHERE {{
  ?c a cls:country ;
     <{cls_base}country#name> ?name .
}}
LIMIT 20

示例 2:
PREFIX cls: <{cls_base}>
SELECT ?name ?length WHERE {{
  ?r a cls:river ;
     <{cls_base}river#name> ?name ;
     <{cls_base}river#length> ?length .
}}
ORDER BY DESC(?length)
LIMIT 5"""

DEFAULT_QUICK_QUESTIONS = [
    {"id": "1", "question": "有哪些物业项目？"},
    {"id": "2", "question": "望京花园有多少空间单元？"},
    {"id": "3", "question": "哪些账单是待缴状态？"},
    {"id": "4", "question": "每个项目的客户数量？"},
    {"id": "5", "question": "最近有哪些工单？"},
]

PROFILE_PROMPT_HINTS = {
    "bootstrap_flat": """
当前本体是从关系表直接 bootstrap 得到的，几乎没有对象属性。
因此你必须优先把查询写成“同类实例 + 列属性过滤”，需要跨表时显式通过共享字段做连接。
不要假设 country 具有 gdp、language、continent 这类其他表的属性，除非当前类属性列表里明确存在。""".strip(),
    "relation_rich": """
当前本体存在对象属性。优先使用对象属性表达类之间关系，只有在对象属性不存在时才退回共享字段连接。""".strip(),
}


def _load_ai_config() -> dict:
    """Load AI config from SQLite, merging with defaults."""
    from repositories.ai_config_repo import load_config
    config = dict(DEFAULT_CONFIG)
    try:
        saved = load_config()
        config.update(saved)
    except Exception:
        pass
    return config


def _save_ai_config(config: dict):
    """Save AI config to SQLite."""
    from repositories.ai_config_repo import save_config
    save_config(config)


def _detect_ontology_profile(class_properties: dict[str, list[str]], object_properties: set[str]) -> str:
    if object_properties:
        return "relation_rich"
    return "bootstrap_flat"


def _build_default_prompt(profile: str) -> str:
    hint = PROFILE_PROMPT_HINTS.get(profile, "")
    if not hint:
        return DEFAULT_SYSTEM_PROMPT
    return DEFAULT_SYSTEM_PROMPT + "\n\n补充约束:\n" + hint


def _extract_property_name(prop_uri: str) -> str:
    if "#" in prop_uri:
        return prop_uri.split("#", 1)[-1]
    return prop_uri.rsplit("/", 1)[-1]


def _extract_class_name(prop_uri: str, cls_base: str) -> str | None:
    if not prop_uri.startswith(cls_base):
        return None
    suffix = prop_uri[len(cls_base):]
    if "#" not in suffix:
        return None
    return suffix.split("#", 1)[0]


def _normalize_generated_sparql(sparql: str, summary: dict[str, Any]) -> str:
    sparql = sparql.strip()
    if sparql.startswith("```"):
        sparql = "\n".join(sparql.split("\n")[1:-1]).strip()

    prefix_lines = []
    for prefix, uri in summary["prefixes"].items():
        if f"PREFIX {prefix}:" not in sparql:
            prefix_lines.append(f"PREFIX {prefix}: <{uri}>")
    if prefix_lines:
        sparql = "\n".join(prefix_lines) + "\n" + sparql

    cls_base = summary["prefixes"].get("cls", "")
    class_properties = summary.get("class_properties", {})
    known_classes = set(summary["classes"])

    if cls_base and class_properties:
        prop_to_classes: dict[str, list[str]] = {}
        for cls_name, prop_list in class_properties.items():
            for prop_uri in prop_list:
                prop_name = _extract_property_name(prop_uri)
                prop_to_classes.setdefault(prop_name, []).append(cls_name)

        query_classes = set(re.findall(r'a\s+cls:(\w+)', sparql))
        for token in sorted(set(re.findall(r'cls:(\w+)', sparql))):
            if token in known_classes:
                continue
            candidate_classes = prop_to_classes.get(token, [])
            if not candidate_classes:
                continue
            matched = [cls_name for cls_name in candidate_classes if cls_name in query_classes]
            class_name = matched[0] if matched else candidate_classes[0]
            sparql = re.sub(
                rf'(?<![#/\w])cls:{re.escape(token)}(?!\w)',
                f"<{cls_base}{class_name}#{token}>",
                sparql,
            )

    lines = sparql.splitlines()
    body_lines: list[str] = []
    moved_modifiers: list[str] = []
    brace_depth = 0
    top_level_started = False

    for line in lines:
        stripped = line.strip()
        is_modifier = stripped.startswith(("ORDER BY", "LIMIT", "OFFSET"))
        if is_modifier and top_level_started and brace_depth > 0:
            moved_modifiers.append(stripped)
            continue
        body_lines.append(line)
        brace_depth += line.count("{") - line.count("}")
        if "{" in line:
            top_level_started = True

    if moved_modifiers:
        body = "\n".join(body_lines).rstrip()
        body += "\n" + "\n".join(moved_modifiers)
        sparql = body
    else:
        sparql = "\n".join(body_lines)

    return sparql.strip()


def _build_fallback_sparql(question: str, summary: dict[str, Any]) -> str | None:
    """尝试通过规则快速修复失败的 SPARQL。

    当前策略：不做硬编码关键词匹配（会导致业务场景错误结果），
    返回 None 表示无法自动修复，由上层转为 LLM 自我纠正流程处理。
    """
    return None


# ── Config API ─────────────────────────────────────────


class AIConfigUpdate(BaseModel):
    llm_provider: Optional[str] = None
    llm_base_url: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_model: Optional[str] = None
    llm_temperature: Optional[float] = None
    max_tokens: Optional[int] = None


class ModelDiscoveryRequest(BaseModel):
    provider: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None


def _resolve_effective_ai_settings(data: ModelDiscoveryRequest) -> tuple[str, str, str]:
    config = _load_ai_config()
    provider = data.provider or config.get("llm_provider", DEFAULT_CONFIG["llm_provider"])
    base_url = data.base_url or config.get("llm_base_url", DEFAULT_CONFIG["llm_base_url"])
    api_key = data.api_key or config.get("llm_api_key", "")

    # The UI receives a masked key; fall back to saved config when unchanged.
    if "*" in api_key:
        api_key = config.get("llm_api_key", "")

    return provider, base_url, api_key


def _normalize_base_url(base_url: str) -> str:
    return base_url.rstrip("/")


async def _fetch_openai_compatible_models(base_url: str, api_key: str) -> list[str]:
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        response = await client.get(f"{_normalize_base_url(base_url)}/models", headers=headers)
        response.raise_for_status()
        payload = response.json()

    models = payload.get("data", [])
    names = [item.get("id", "") for item in models if isinstance(item, dict) and item.get("id")]
    return sorted(set(names))


async def _fetch_ollama_models(base_url: str) -> list[str]:
    normalized = _normalize_base_url(base_url)
    candidates = []

    if normalized.endswith("/v1"):
        candidates.append(f"{normalized[:-3]}/api/tags")
    candidates.append(f"{normalized}/api/tags")

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        last_error: Exception | None = None
        for candidate in candidates:
            try:
                response = await client.get(candidate)
                response.raise_for_status()
                payload = response.json()
                models = payload.get("models", [])
                names = [item.get("name", "") for item in models if isinstance(item, dict) and item.get("name")]
                cleaned = sorted(set(name.split(":", 1)[0] if ":" in name else name for name in names))
                if cleaned:
                    return cleaned
            except Exception as exc:  # pragma: no cover - network branch
                last_error = exc
        if last_error:
            raise last_error
    return []


@router.post("/models")
async def discover_models(data: ModelDiscoveryRequest):
    """Discover available models for the current provider."""
    provider, base_url, api_key = _resolve_effective_ai_settings(data)
    preset = PROVIDER_PRESETS.get(provider, {"models": []})
    fallback_models = list(preset.get("models", []))

    if not base_url:
        return {
            "provider": provider,
            "base_url": base_url,
            "models": fallback_models,
            "source": "preset",
            "warning": "未配置 Base URL，返回预设模型列表。",
        }

    try:
        if provider == "ollama":
            models = await _fetch_ollama_models(base_url)
        else:
            models = await _fetch_openai_compatible_models(base_url, api_key)

        if not models:
            raise HTTPException(status_code=404, detail="No models returned")

        return {
            "provider": provider,
            "base_url": base_url,
            "models": models,
            "source": "remote",
            "warning": None,
        }
    except Exception as exc:
        logger.warning("Failed to discover models for provider %s: %s", provider, exc)
        return {
            "provider": provider,
            "base_url": base_url,
            "models": fallback_models,
            "source": "preset" if fallback_models else "manual",
            "warning": "无法自动拉取模型列表，已切换到预设或手动输入。",
            "error": str(exc),
        }


@router.get("/providers")
async def list_providers():
    """List available LLM providers with presets."""
    return {k: {"label": v["label"], "base_url": v["base_url"], "models": v["models"]} for k, v in PROVIDER_PRESETS.items()}


class SystemPromptUpdate(BaseModel):
    system_prompt: str


class QuickQuestionsUpdate(BaseModel):
    questions: list[dict]


@router.get("/config")
async def get_ai_config():
    """Get current AI configuration (API key masked)."""
    config = _load_ai_config()
    # Mask API key
    api_key = config.get("llm_api_key", "")
    if api_key and len(api_key) > 4:
        config["llm_api_key"] = api_key[:2] + "*" * (len(api_key) - 4) + api_key[-2:]
    return config


@router.put("/config")
async def update_ai_config(data: AIConfigUpdate):
    """Update AI configuration."""
    config = _load_ai_config()
    updates = data.model_dump(exclude_none=True)
    config.update(updates)
    _save_ai_config(config)

    # Reload LLM client
    from services.llm_service import reload_client
    reload_client(
        base_url=config["llm_base_url"],
        api_key=config.get("llm_api_key", ""),
        model=config["llm_model"],
        temperature=config.get("llm_temperature", 0.1),
        max_tokens=config.get("max_tokens", 1024),
    )
    return {"success": True, "message": "Configuration updated"}


@router.get("/system-prompt")
async def get_system_prompt():
    """Get current system prompt template."""
    config = _load_ai_config()
    return {"system_prompt": config.get("system_prompt", DEFAULT_SYSTEM_PROMPT)}


@router.put("/system-prompt")
async def update_system_prompt(data: SystemPromptUpdate):
    """Update system prompt template."""
    config = _load_ai_config()
    config["system_prompt"] = data.system_prompt
    _save_ai_config(config)
    return {"success": True, "message": "System prompt updated"}


@router.get("/quick-questions")
async def get_quick_questions():
    """Get quick questions list."""
    config = _load_ai_config()
    return {"questions": config.get("quick_questions", DEFAULT_QUICK_QUESTIONS)}


@router.put("/quick-questions")
async def update_quick_questions(data: QuickQuestionsUpdate):
    """Update quick questions list."""
    config = _load_ai_config()
    config["quick_questions"] = data.questions
    _save_ai_config(config)
    return {"success": True, "message": "Quick questions updated"}


# ── Ontology Summary ──────────────────────────────────


@router.get("/ontology-summary")
async def ontology_summary():
    """Get ontology schema summary for SPARQL prompt context.

    数据源优先级：
      1. 激活的 TTL 本体文件（包含 rdfs:label/comment 等语义信息）——主要来源
      2. 激活的 OBDA 映射文件——用于提取精确的类-属性归属关系和 SPARQL 前缀

    两者合并后构建更丰富的 LLM 上下文，显著提升 SPARQL 生成质量。
    """
    import re as re_mod
    from services.ttl_parser import parse_ttl

    active_config = load_active_endpoint_config()
    ontology_path = active_config.get("ontology_path", "")
    mapping_path = active_config.get("mapping_path", "")

    # ── Step 1: 优先从注释库读取 accepted 标注，TTL 作为降级备选 ─────
    # 注释库是语义标注层的权威来源（Bootstrap 重跑不会丢失人工审核结果）
    # TTL parser 在注释库无数据时（如首次运行）降级使用
    from repositories import annotation_repo as ann_repo
    from services.ttl_parser import parse_ttl

    # 推断 ds_id（从 mapping_path 路径中提取 DATA_DIR/{ds_id}/...）
    ds_id: str | None = None
    if mapping_path:
        try:
            from config import DATA_DIR as _DATA_DIR
            rel = Path(mapping_path).relative_to(_DATA_DIR)
            ds_id = rel.parts[0]
        except Exception:
            pass

    ttl_classes: dict[str, dict] = {}
    ttl_data_props: dict[str, dict] = {}
    ttl_obj_props: dict[str, dict] = {}

    if ds_id:
        # 优先：从注释库的 accepted 条目构建语义上下文
        accepted_annotations = ann_repo.list_annotations(ds_id, status="accepted")
        for ann in accepted_annotations:
            uri   = ann["entity_uri"]
            lang  = ann["lang"]
            kind  = ann["entity_kind"]
            label = ann.get("label", "")
            comment = ann.get("comment", "")

            if kind == "class":
                entry = ttl_classes.setdefault(uri, {})
            elif kind == "data_property":
                entry = ttl_data_props.setdefault(uri, {})
            else:
                entry = ttl_obj_props.setdefault(uri, {})

            if lang == "zh":
                entry["label_zh"] = label
                entry["comment_zh"] = comment
            elif lang == "en":
                entry["label_en"] = label

    # 降级：如果注释库为空，解析 TTL 文件（向前兼容旧数据）
    if not ttl_classes and not ttl_data_props and ontology_path and Path(ontology_path).exists():
        try:
            ttl_content = Path(ontology_path).read_text(encoding="utf-8")
            parsed_ttl  = parse_ttl(ttl_content)
            for cls in parsed_ttl.classes:
                ttl_classes[cls.local_name] = {
                    "label_zh": cls.labels.zh,
                    "label_en": cls.labels.en,
                    "comment_zh": cls.comments.zh,
                }
            for dp in parsed_ttl.data_properties:
                ttl_data_props[dp.local_name] = {
                    "label_zh": dp.labels.zh,
                    "label_en": dp.labels.en,
                    "comment_zh": dp.comments.zh,
                }
            for op in parsed_ttl.object_properties:
                ttl_obj_props[op.local_name] = {
                    "label_zh": op.labels.zh,
                    "label_en": op.labels.en,
                }
        except Exception as e:
            logger.warning("ontology_summary: TTL fallback parse failed %s: %s", ontology_path, e)


    # ── Step 2: 解析 OBDA，提取类-属性归属关系和前缀 ─────────────────
    classes: set[str] = set(ttl_classes.keys())
    data_properties: set[str] = set(ttl_data_props.keys())
    object_properties: set[str] = set(ttl_obj_props.keys())
    all_uris: set[str] = set()
    class_properties: dict[str, list[str]] = {}   # class_name -> [property URI strings]

    if mapping_path and Path(mapping_path).exists():
        mapping_content = Path(mapping_path).read_text(encoding="utf-8")
        parsed_obda = parse_obda(mapping_content)
        namespaces: dict[str, str] = dict(parsed_obda.prefixes)

        for m in parsed_obda.mappings:
            target = m.target
            class_matches = re_mod.findall(r'a\s+<([^>]+)>', target)
            for c in class_matches:
                local = c.split("/")[-1]
                classes.add(local)
                all_uris.add(c)
            current_class = class_matches[0].split("/")[-1] if class_matches else None

            prop_matches = re_mod.findall(r'<([^>]+)>\s*\{[^}]+\}', target)
            for p in prop_matches:
                if p.startswith("http://www.w3.org/") or p.startswith("https://www.w3.org/"):
                    continue
                all_uris.add(p)
                local_name = p.rsplit("/", 1)[-1].rsplit("#", 1)[-1]
                if local_name.startswith("ref-"):
                    object_properties.add(local_name)
                else:
                    data_properties.add(local_name)
                if current_class:
                    class_properties.setdefault(current_class, set()).add(p)  # type: ignore[arg-type]

            relation_matches = re_mod.findall(r'<([^>]+)>\s+<([^>]+)>\s+<([^>]+)>', target)
            for _, pred_uri, obj_uri in relation_matches:
                if pred_uri.startswith("http://www.w3.org/") or obj_uri.startswith("http://www.w3.org/"):
                    continue
                all_uris.add(pred_uri)
                local_name = pred_uri.rsplit("/", 1)[-1].rsplit("#", 1)[-1]
                object_properties.add(local_name)
                if current_class:
                    class_properties.setdefault(current_class, set()).add(pred_uri)  # type: ignore[arg-type]
    else:
        # 仅有 TTL 时，构建空前缀和基础归属
        namespaces = {}

    # ── Step 3: 自动推断 cls namespace ────────────────────────────
    if "cls" not in namespaces:
        for uri in all_uris:
            base = uri.rsplit("/", 1)[0] + "/"
            if not any(base.startswith(std) for std in ["http://www.w3.org/", "http://purl.org/"]):
                namespaces["cls"] = base
                break

    cls_base = namespaces.get("cls", "")

    # ── Step 4: 构建 class_property_summary（含语义标注） ──────────
    class_property_summary: dict[str, list[str]] = {}
    for cls_name, prop_uris in sorted(class_properties.items()):
        short_props = []
        for puri in sorted(prop_uris):
            short = puri[len(cls_base):] if puri.startswith(cls_base) else puri.rsplit("/", 1)[-1]
            short_props.append(short)
        class_property_summary[cls_name] = short_props

    # ── Step 5: 构建带语义标注的类描述（用于 prompt 增强） ──────────
    class_labels: dict[str, str] = {}
    for cls_name, info in ttl_classes.items():
        parts = []
        if info.get("label_zh"):
            parts.append(info["label_zh"])
        if info.get("label_en"):
            parts.append(info["label_en"])
        if info.get("comment_zh"):
            parts.append(f"({info['comment_zh']})")
        if parts:
            class_labels[cls_name] = " / ".join(parts)

    profile = _detect_ontology_profile(class_property_summary, object_properties)

    # ── Step 6: 加载业务词汇表（注入 SPARQL Prompt）────────────────
    glossary_terms: list[dict] = []
    try:
        from repositories.glossary_repo import list_terms as _list_glossary
        # Reuse ds_id from Step 1 (already resolved), fallback to first datasource
        _gid = ds_id
        if not _gid:
            from database import get_connection
            _row = get_connection().execute("SELECT id FROM datasources LIMIT 1").fetchone()
            if _row:
                _gid = _row["id"]
        if _gid:
            glossary_terms = _list_glossary(_gid, include_global=True)
    except Exception as _ge:
        logger.warning("Failed to load glossary: %s", _ge)

    return {
        "classes": sorted(classes),
        "data_properties": sorted(data_properties),
        "object_properties": sorted(object_properties),
        "prefixes": namespaces,
        "class_properties": class_property_summary,
        "class_labels": class_labels,
        "glossary_terms": glossary_terms,
        "ontology_profile": profile,
    }



# ── AI Query Pipeline ──────────────────────────────────


@router.get("/query")
async def ai_query(question: str):
    """Full NL -> SPARQL -> results -> answer pipeline with SSE streaming."""
    import asyncio

    async def event_generator():
        summary = await ontology_summary()
        yield {"event": "step", "data": json.dumps({"step": "analyzing", "message": "Analyzing ontology..."})}

        # Use custom system prompt if configured
        config = _load_ai_config()
        custom_prompt = config.get("system_prompt") or _build_default_prompt(summary.get("ontology_profile", "bootstrap_flat"))

        prompt = build_sparql_prompt(
            classes=summary["classes"],
            properties=summary["data_properties"],
            relationships=summary["object_properties"],
            prefixes=summary["prefixes"],
            template=custom_prompt,
            class_properties=summary.get("class_properties"),
            class_labels=summary.get("class_labels"),
            glossary=summary.get("glossary_terms"),   # 业务词汇表
            question=question,                         # 用于关键词匹配过滤
        )

        sparql = await generate_sparql(prompt, question)
        sparql = _normalize_generated_sparql(sparql, summary)

        yield {"event": "sparql", "data": json.dumps({"step": "sparql_generated", "sparql": sparql})}

        yield {"event": "step", "data": json.dumps({"step": "executing", "message": "Executing query..."})}

        sql = ""
        result_text = ""
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.get(
                    f"{ONTOP_ENDPOINT_URL}/ontop/reformulate",
                    params={"query": sparql},
                )
                if resp.status_code == 200:
                    sql = resp.text
            except Exception:
                pass

            try:
                resp = await client.post(
                    f"{ONTOP_ENDPOINT_URL}/sparql",
                    data=sparql,
                    headers={
                        "Content-Type": "application/sparql-query",
                        "Accept": "application/sparql-results+json",
                    },
                )
                if resp.status_code == 200:
                    result_text = resp.text
                else:
                    result_text = f"Error: {resp.text[:200]}"
            except httpx.ConnectError:
                result_text = "Error: Ontop endpoint not running"

        # Smart truncation: parse JSON to preserve structure and count,
        # only truncate individual cell values if total size exceeds limit.
        MAX_RESULT_CHARS = 8000
        result_for_llm = result_text
        total_count = None
        try:
            parsed = json.loads(result_text)
            bindings = parsed.get("results", {}).get("bindings", [])
            total_count = len(bindings)
            if len(result_text) > MAX_RESULT_CHARS:
                # Truncate long cell values but keep all rows
                for row in bindings:
                    for cell in row.values():
                        val = cell.get("value", "")
                        if len(val) > 80:
                            cell["value"] = val[:80] + "..."
                result_for_llm = json.dumps(parsed, ensure_ascii=False)
        except (json.JSONDecodeError, AttributeError):
            if len(result_for_llm) > MAX_RESULT_CHARS:
                result_for_llm = result_for_llm[:MAX_RESULT_CHARS]

        event_data = {"step": "executed", "sql": sql, "results": result_text[:3000]}
        if total_count is not None:
            event_data["total_count"] = total_count
        yield {"event": "executed", "data": json.dumps(event_data)}

        # 当 SPARQL 执行失败或空结果时，触发 LLM 自我纠正（Self-Correction）
        # 把失败的 SPARQL + Ontop 错误信息带入下一轮 LLM 对话，让模型自行修正
        should_retry = "Error:" in result_text or total_count == 0

        if should_retry:
            error_hint = result_text if result_text.startswith("Error:") else f"查询返回了 0 条结果。原 SPARQL:\n{sparql}"
            yield {"event": "step", "data": json.dumps({"step": "correcting", "message": "SPARQL 生成失败，正在尝试自动修正..."})}

            corrected_sparql = await generate_corrected_sparql(
                system_prompt=prompt,
                question=question,
                failed_sparql=sparql,
                error_message=error_hint,
            )
            corrected_sparql = _normalize_generated_sparql(corrected_sparql, summary)

            if corrected_sparql.strip() != sparql.strip():
                yield {"event": "sparql", "data": json.dumps({"step": "sparql_corrected", "sparql": corrected_sparql})}

                async with httpx.AsyncClient(timeout=30.0) as client:
                    try:
                        resp = await client.get(
                            f"{ONTOP_ENDPOINT_URL}/ontop/reformulate",
                            params={"query": corrected_sparql},
                        )
                        if resp.status_code == 200:
                            sql = resp.text
                    except Exception:
                        pass

                    try:
                        resp = await client.post(
                            f"{ONTOP_ENDPOINT_URL}/sparql",
                            data=corrected_sparql,
                            headers={
                                "Content-Type": "application/sparql-query",
                                "Accept": "application/sparql-results+json",
                            },
                        )
                        if resp.status_code == 200:
                            result_text = resp.text
                        else:
                            result_text = f"Error: {resp.text[:200]}"
                    except httpx.ConnectError:
                        result_text = "Error: Ontop endpoint not running"

                total_count = None
                result_for_llm = result_text
                try:
                    parsed_result = json.loads(result_text)
                    bindings = parsed_result.get("results", {}).get("bindings", [])
                    total_count = len(bindings)
                    if len(result_text) > MAX_RESULT_CHARS:
                        for row in bindings:
                            for cell in row.values():
                                val = cell.get("value", "")
                                if len(val) > 80:
                                    cell["value"] = val[:80] + "..."
                        result_for_llm = json.dumps(parsed_result, ensure_ascii=False)
                except (json.JSONDecodeError, AttributeError):
                    if len(result_for_llm) > MAX_RESULT_CHARS:
                        result_for_llm = result_for_llm[:MAX_RESULT_CHARS]

                corrected_event = {"step": "executed_corrected", "sql": sql, "results": result_text[:3000]}
                if total_count is not None:
                    corrected_event["total_count"] = total_count
                yield {"event": "executed", "data": json.dumps(corrected_event)}

        answer = await generate_answer(question, result_for_llm)
        yield {"event": "answer", "data": json.dumps({"step": "answer", "answer": answer})}

    return EventSourceResponse(event_generator())
