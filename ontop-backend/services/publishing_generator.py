"""Auto-generate MCP configs, tool definitions, and API specs from ontology schema."""

import json
import re
from services.active_endpoint_config import load_active_endpoint_config
from services.obda_parser import parse_obda


def get_ontology_tools() -> list[dict]:
    """Build the list of MCP tools derived from the current ontology."""
    tools = [
        {
            "name": "sparql_query",
            "description": "Execute a SPARQL query against the Ontop virtual knowledge graph",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "SPARQL query string",
                    }
                },
                "required": ["query"],
            },
        },
        {
            "name": "list_ontology_classes",
            "description": "List all classes in the ontology with their labels",
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "name": "describe_class",
            "description": "Get properties and relationships of a specific class",
            "parameters": {
                "type": "object",
                "properties": {
                    "class_name": {
                        "type": "string",
                        "description": "Name of the ontology class (e.g. PropertyProject)",
                    }
                },
                "required": ["class_name"],
            },
        },
        {
            "name": "get_sample_data",
            "description": "Get sample instances of a class from the knowledge graph",
            "parameters": {
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
        },
    ]
    return tools


def _load_parsed_obda() -> tuple[dict, list]:
    """Load OBDA mapping to extract class/property metadata."""
    active = load_active_endpoint_config()
    mapping_path = active.get("mapping_path", "")
    if not mapping_path:
        return {}, []
    try:
        content = open(mapping_path, "r", encoding="utf-8").read()
        parsed = parse_obda(content)
        return dict(parsed.prefixes), parsed.mappings
    except Exception:
        return {}, []


def get_ontology_classes_summary() -> list[dict]:
    """Extract class list from OBDA mappings.

    Each mapping rule belongs to exactly one class (identified by 'a <uri>').
    Properties are bound only to that class, not broadcast to all classes.
    """
    prefixes, mappings = _load_parsed_obda()
    classes = {}
    for m in mappings:
        target = m.target

        # Determine the single class this mapping rule belongs to
        class_matches = re.findall(r'a\s+<([^>]+)>', target)
        current_class_local: str | None = None
        for c in class_matches:
            local = c.rsplit("/", 1)[-1]
            if local not in classes:
                classes[local] = {"name": local, "uri": c, "properties": []}
            # Take the first class match as the owner of this mapping rule
            if current_class_local is None:
                current_class_local = local

        if current_class_local is None:
            # No class found in this mapping rule — skip property binding
            continue

        # Extract property URIs in the form <uri> {column}
        prop_matches = re.findall(r'<([^>]+)>\s*\{[^}]+\}', target)
        for uri in prop_matches:
            if uri.startswith("http://www.w3.org/"):
                continue
            # Support both /ClassName#propName and /propName URI styles
            local_prop = uri.rsplit("#", 1)[-1] if "#" in uri else uri.rsplit("/", 1)[-1]
            props = classes[current_class_local].setdefault("properties", [])
            if local_prop not in props:
                props.append(local_prop)

    return list(classes.values())


def describe_class_details(class_name: str) -> dict:
    """Get properties and relationships for a specific class."""
    classes = get_ontology_classes_summary()
    for cls in classes:
        if cls["name"] == class_name:
            return cls
    return {"name": class_name, "error": "Class not found"}


def generate_claude_desktop_config(sse_url: str) -> str:
    """Generate JSON config snippet for Claude Desktop."""
    config = {
        "mcpServers": {
            "ontop-semantic": {
                "url": sse_url
            }
        }
    }
    return json.dumps(config, indent=2, ensure_ascii=False)


def generate_cursor_config(sse_url: str) -> str:
    """Generate config snippet for Cursor/Windsurf."""
    config = {
        "mcpServers": {
            "ontop-semantic": {
                "url": sse_url,
                "transport": "sse",
            }
        }
    }
    return json.dumps(config, indent=2, ensure_ascii=False)


def generate_openai_function_tools(selected_tools: list[str]) -> list[dict]:
    """Generate OpenAI Function Calling schema for selected tools."""
    all_tools = get_ontology_tools()
    filtered = [t for t in all_tools if t["name"] in selected_tools] if selected_tools else all_tools
    return [
        {"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["parameters"]}}
        for t in filtered
    ]


def generate_anthropic_tool_definitions(selected_tools: list[str]) -> list[dict]:
    """Generate Anthropic Tool Use schema for selected tools."""
    all_tools = get_ontology_tools()
    filtered = [t for t in all_tools if t["name"] in selected_tools] if selected_tools else all_tools
    return [
        {"name": t["name"], "description": t["description"], "input_schema": t["parameters"]}
        for t in filtered
    ]


def generate_openapi_spec(base_url: str, selected_tools: list[str]) -> dict:
    """Generate OpenAPI 3.0 spec snippet for selected tools."""
    all_tools = get_ontology_tools()
    filtered = [t for t in all_tools if t["name"] in selected_tools] if selected_tools else all_tools
    paths = {}
    for t in filtered:
        paths[f"/tools/{t['name']}"] = {
            "post": {
                "summary": t["description"],
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": t["parameters"]
                        }
                    }
                },
                "responses": {"200": {"description": "Success"}},
            }
        }
    return {
        "openapi": "3.0.0",
        "info": {"title": "Ontop Semantic API", "version": "1.0.0"},
        "servers": [{"url": base_url}],
        "paths": paths,
    }


def generate_generic_json_schema(selected_tools: list[str]) -> list[dict]:
    """Generate generic JSON Schema tool definitions."""
    return get_ontology_tools() if not selected_tools else [
        t for t in get_ontology_tools() if t["name"] in selected_tools
    ]
