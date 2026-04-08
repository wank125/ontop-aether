"""Tool registry — single source of truth for all tool specs and render outputs.

Every tool is registered once with its ToolSpec and handler function.
Export renderers (OpenAI, Anthropic, OpenAPI, Generic JSON) all derive
from the same spec.  MCP wrappers delegate to the same handler.
"""

from typing import Callable

from models.tool_spec import ToolSpec

# Internal storage: name -> (ToolSpec, async handler)
_registry: dict[str, tuple[ToolSpec, Callable]] = {}
_registered: bool = False


def register_tool(spec: ToolSpec, handler: Callable):
    """Register a tool spec + its async handler function."""
    _registry[spec.name] = (spec, handler)


def get_all_specs() -> list[ToolSpec]:
    """Return all registered tool specs."""
    return [s for s, _ in _registry.values()]


def get_spec(name: str) -> ToolSpec | None:
    """Return a single spec by name."""
    pair = _registry.get(name)
    return pair[0] if pair else None


def get_handler(name: str) -> Callable | None:
    """Return the async handler for a tool."""
    pair = _registry.get(name)
    return pair[1] if pair else None


def filter_specs(selected: list[str]) -> list[ToolSpec]:
    """Return specs filtered by tool names.  Empty list = all."""
    all_specs = get_all_specs()
    if not selected:
        return all_specs
    return [s for s in all_specs if s.name in selected]


# ── Built-in tool registration ──────────────────────────────


def register_builtin_tools():
    """Register the 4 built-in ontology tools.  Idempotent."""
    global _registered
    if _registered:
        return
    _registered = True

    from services.tool_handlers import (
        sparql_query_handler,
        list_ontology_classes_handler,
        describe_class_handler,
        get_sample_data_handler,
    )

    register_tool(ToolSpec(
        name="sparql_query",
        description="Execute a SPARQL query against the Ontop virtual knowledge graph",
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "SPARQL query string"},
            },
            "required": ["query"],
        },
        read_only=True,
        data_source_permission="sparql_endpoint",
    ), sparql_query_handler)

    register_tool(ToolSpec(
        name="list_ontology_classes",
        description="List all classes in the ontology with their labels",
        parameters={"type": "object", "properties": {}},
        read_only=True,
    ), list_ontology_classes_handler)

    register_tool(ToolSpec(
        name="describe_class",
        description="Get properties and relationships of a specific class",
        parameters={
            "type": "object",
            "properties": {
                "class_name": {
                    "type": "string",
                    "description": "Name of the ontology class (e.g. PropertyProject)",
                },
            },
            "required": ["class_name"],
        },
        read_only=True,
    ), describe_class_handler)

    register_tool(ToolSpec(
        name="get_sample_data",
        description="Get sample instances of a class from the knowledge graph",
        parameters={
            "type": "object",
            "properties": {
                "class_name": {
                    "type": "string",
                    "description": "Name of the ontology class",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of results (default 10)",
                    "default": 10,
                },
            },
            "required": ["class_name"],
        },
        read_only=True,
        data_source_permission="sparql_endpoint",
    ), get_sample_data_handler)


# ── Format renderers ────────────────────────────────────────


def render_openai_function(selected: list[str] | None = None) -> list[dict]:
    """Render tools as OpenAI Function Calling schema."""
    specs = filter_specs(selected or [])
    return [
        {"type": "function", "function": {
            "name": s.name, "description": s.description, "parameters": s.parameters,
        }}
        for s in specs
    ]


def render_anthropic_tool(selected: list[str] | None = None) -> list[dict]:
    """Render tools as Anthropic Tool Use schema."""
    specs = filter_specs(selected or [])
    return [
        {"name": s.name, "description": s.description, "input_schema": s.parameters}
        for s in specs
    ]


def render_openapi(base_url: str, selected: list[str] | None = None) -> dict:
    """Render tools as OpenAPI 3.0 spec."""
    specs = filter_specs(selected or [])
    paths: dict = {}
    for s in specs:
        paths[f"/tools/{s.name}"] = {
            "post": {
                "summary": s.description,
                "requestBody": {
                    "content": {"application/json": {"schema": s.parameters}},
                },
                "responses": {"200": {"description": "Success"}},
            },
        }
    return {
        "openapi": "3.0.0",
        "info": {"title": "Ontop Semantic API", "version": "1.0.0"},
        "servers": [{"url": base_url}],
        "paths": paths,
    }


def render_generic_json(selected: list[str] | None = None) -> list[dict]:
    """Render tools as plain JSON Schema (pass-through)."""
    return [
        {
            "name": s.name,
            "description": s.description,
            "parameters": s.parameters,
        }
        for s in filter_specs(selected or [])
    ]
