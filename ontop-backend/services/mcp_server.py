"""MCP Server lifecycle management — mounted as ASGI sub-app."""

import json
import logging
from typing import Optional

import httpx

from config import ONTOP_ENDPOINT_URL

logger = logging.getLogger(__name__)

_mcp_instance: Optional[object] = None  # FastMCP instance
_mcp_asgi_app: Optional[object] = None   # streamable_http_app (lazily creates session_manager)
_mcp_session_ctx: Optional[object] = None  # session_manager context


def create_mcp_server() -> "FastMCP":
    """Create and configure the MCP server with ontology-derived tools."""
    from mcp.server.fastmcp import FastMCP

    mcp = FastMCP(
        "ontop-semantic",
        stateless_http=True,
        json_response=True,
        instructions=(
            "Ontop Semantic Platform MCP Server. "
            "Provides SPARQL query, ontology exploration, and sample data retrieval "
            "over the Ontop virtual knowledge graph."
        ),
    )

    @mcp.tool()
    async def sparql_query(query: str) -> str:
        """Execute a SPARQL query against the Ontop virtual knowledge graph.

        Args:
            query: A valid SPARQL query string (SELECT, ASK, CONSTRUCT, etc.)
        """
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

    @mcp.tool()
    async def list_ontology_classes() -> str:
        """List all classes defined in the ontology with their names and descriptions."""
        from services.publishing_generator import get_ontology_classes_summary
        classes = get_ontology_classes_summary()
        return json.dumps(classes, ensure_ascii=False, indent=2)

    @mcp.tool()
    async def describe_class(class_name: str) -> str:
        """Get properties and relationships of a specific ontology class.

        Args:
            class_name: The local name of the class (e.g. PropertyProject, SpaceUnit)
        """
        from services.publishing_generator import describe_class_details
        details = describe_class_details(class_name)
        return json.dumps(details, ensure_ascii=False, indent=2)

    @mcp.tool()
    async def get_sample_data(class_name: str, limit: int = 10) -> str:
        """Get sample instances of an ontology class from the knowledge graph.

        Args:
            class_name: The local name of the class to query
            limit: Maximum number of results (default 10, max 50)
        """
        limit = min(limit, 50)
        # Read active ontology config to get namespace prefix
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
        # Fallback: try with prefix notation
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

    return mcp


def get_or_create_mcp() -> "FastMCP":
    """Get existing MCP instance or create one."""
    global _mcp_instance
    if _mcp_instance is None:
        _mcp_instance = create_mcp_server()
    return _mcp_instance


def _ensure_asgi_initialized():
    """Ensure streamable_http_app() has been called (lazily creates session_manager)."""
    global _mcp_asgi_app
    mcp = get_or_create_mcp()
    if _mcp_asgi_app is None:
        _mcp_asgi_app = mcp.streamable_http_app()
    return _mcp_asgi_app


def get_mcp_asgi_app():
    """Get the ASGI app for mounting into FastAPI."""
    return _ensure_asgi_initialized()


def get_session_manager():
    """Get the MCP session manager for lifespan control."""
    _ensure_asgi_initialized()
    return get_or_create_mcp().session_manager


async def start_mcp_server() -> bool:
    """Start the MCP server session manager. Returns True if successful."""
    global _mcp_session_ctx
    try:
        _ensure_asgi_initialized()
        mcp = get_or_create_mcp()
        sm = mcp.session_manager
        _mcp_session_ctx = sm.run()
        await _mcp_session_ctx.__aenter__()
        logger.info("MCP server session manager started")
        return True
    except Exception as e:
        logger.error("Failed to start MCP server: %s", e)
        return False


async def stop_mcp_server():
    """Stop the MCP server session manager."""
    global _mcp_instance, _mcp_session_ctx, _mcp_asgi_app
    if _mcp_session_ctx is not None:
        try:
            await _mcp_session_ctx.__aexit__(None, None, None)
        except Exception:
            pass
    _mcp_session_ctx = None
    _mcp_instance = None
    _mcp_asgi_app = None
    logger.info("MCP server stopped")


def get_mcp_status() -> dict:
    """Check MCP server status."""
    running = _mcp_instance is not None and _mcp_session_ctx is not None
    tools = []
    if _mcp_instance is not None:
        try:
            from services.publishing_generator import get_ontology_tools
            tools = [t["name"] for t in get_ontology_tools()]
        except Exception:
            pass
    return {
        "running": running,
        "tools": tools,
        "transport": "streamable-http",
    }


def mount_mcp_app(app):
    """Mount the MCP ASGI sub-app onto the given FastAPI app."""
    asgi = _ensure_asgi_initialized()
    # Remove existing /mcp mount if any
    for route in list(app.routes):
        if hasattr(route, "path") and route.path == "/mcp":
            app.routes.remove(route)
    app.mount("/mcp", asgi)
