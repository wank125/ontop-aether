"""Standalone async handlers for built-in tools.

Extracted from mcp_server.py so that both MCP and future consumers
share the same handler logic via tool_registry.
"""

import json

import httpx

from config import ONTOP_ENDPOINT_URL


async def sparql_query_handler(query: str) -> str:
    """Execute a SPARQL query against the Ontop endpoint."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{ONTOP_ENDPOINT_URL}/sparql",
            data=query,
            headers={
                "Content-Type": "application/sparql-query",
                "Accept": "application/sparql-results+json",
            },
        )
    if resp.status_code != 200:
        return json.dumps({"error": f"HTTP {resp.status_code}", "detail": resp.text[:500]})
    return resp.text


async def list_ontology_classes_handler() -> str:
    """List all ontology classes from the current OBDA mapping."""
    from services.publishing_generator import get_ontology_classes_summary

    classes = get_ontology_classes_summary()
    return json.dumps(classes, ensure_ascii=False, indent=2)


async def describe_class_handler(class_name: str) -> str:
    """Get properties and relationships for a specific class."""
    from services.publishing_generator import describe_class_details

    details = describe_class_details(class_name)
    return json.dumps(details, ensure_ascii=False, indent=2)


async def get_sample_data_handler(class_name: str, limit: int = 10) -> str:
    """Get sample instances of an ontology class from the knowledge graph."""
    limit = min(limit, 50)
    from services.active_endpoint_config import load_active_endpoint_config
    from services.obda_parser import parse_obda

    active = load_active_endpoint_config()
    mapping_path = active.get("mapping_path", "")
    class_uri = class_name
    if mapping_path:
        try:
            content = open(mapping_path, "r", encoding="utf-8").read()
            parsed = parse_obda(content)
            for prefix, uri in parsed.prefixes.items():
                if "ontology" in uri or "example" in uri:
                    class_uri = f"{prefix}:{class_name}"
                    break
        except Exception:
            pass

    sparql = (
        f"SELECT ?s ?p ?o WHERE {{ ?s a <{class_uri if ':' not in class_name else class_uri.replace(':', '', 1)}> ; "
        f"?p ?o . }} LIMIT {limit}"
    )
    sparql_fallback = f"SELECT * WHERE {{ ?s a {class_uri} . ?s ?p ?o . }} LIMIT {limit}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        for q in [sparql, sparql_fallback]:
            resp = await client.post(
                f"{ONTOP_ENDPOINT_URL}/sparql",
                data=q,
                headers={
                    "Content-Type": "application/sparql-query",
                    "Accept": "application/sparql-results+json",
                },
            )
            if resp.status_code == 200:
                return resp.text
    return json.dumps({"error": "Query failed", "class_name": class_name})
