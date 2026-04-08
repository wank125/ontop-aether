"""MCP Server lifecycle management — mounted as ASGI sub-app."""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

_mcp_instance: Optional[object] = None  # FastMCP instance
_mcp_asgi_app: Optional[object] = None   # streamable_http_app (lazily creates session_manager)
_mcp_session_ctx: Optional[object] = None  # session_manager context


def create_mcp_server() -> "FastMCP":
    """Create and configure the MCP server with ontology-derived tools.

    Tool specs come from tool_registry (single source of truth).
    The @mcp.tool() wrappers are thin delegates — MCP SDK derives
    parameter schema from the Python function signature + docstring.
    """
    from mcp.server.fastmcp import FastMCP
    from services.tool_registry import register_builtin_tools, get_handler

    register_builtin_tools()

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
        """Execute a SPARQL query against the Ontop virtual knowledge graph."""
        return await get_handler("sparql_query")(query=query)

    @mcp.tool()
    async def list_ontology_classes() -> str:
        """List all classes defined in the ontology with their names and descriptions."""
        return await get_handler("list_ontology_classes")()

    @mcp.tool()
    async def describe_class(class_name: str) -> str:
        """Get properties and relationships of a specific ontology class."""
        return await get_handler("describe_class")(class_name=class_name)

    @mcp.tool()
    async def get_sample_data(class_name: str, limit: int = 10) -> str:
        """Get sample instances of an ontology class from the knowledge graph."""
        return await get_handler("get_sample_data")(class_name=class_name, limit=limit)

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
            from services.tool_registry import register_builtin_tools, get_all_specs
            register_builtin_tools()
            tools = [s.name for s in get_all_specs()]
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
