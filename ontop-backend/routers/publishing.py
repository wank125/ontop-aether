"""Publishing configuration and MCP/Skills management router."""

import json
import secrets

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from models.publishing import PublishingConfigUpdate
from repositories.publishing_repo import load_publishing_config, update_publishing_config
from services.publishing_generator import (
    get_ontology_tools,
    get_ontology_classes_summary,
    generate_claude_desktop_config,
    generate_cursor_config,
    generate_openai_function_tools,
    generate_anthropic_tool_definitions,
    generate_openapi_spec,
    generate_generic_json_schema,
)
from services.mcp_server import start_mcp_server, stop_mcp_server, get_mcp_status, mount_mcp_app

router = APIRouter(prefix="/publishing", tags=["publishing"])


# ── Config ─────────────────────────────────────────────────

@router.get("/config")
async def get_config():
    """Get publishing config (api_key masked)."""
    cfg = load_publishing_config()
    # Mask api_key for display
    if cfg.get("api_key"):
        cfg["api_key"] = cfg["api_key"][:4] + "****" + cfg["api_key"][-4:] if len(cfg["api_key"]) > 8 else "****"
    return cfg


@router.put("/config")
async def put_config(body: PublishingConfigUpdate):
    """Update publishing config."""
    updates = body.model_dump(exclude_none=True)
    cfg = update_publishing_config(updates)
    if cfg.get("api_key"):
        cfg["api_key"] = cfg["api_key"][:4] + "****" + cfg["api_key"][-4:] if len(cfg["api_key"]) > 8 else "****"
    return cfg


# ── API ────────────────────────────────────────────────────

@router.get("/api/status")
async def api_status():
    """Check SPARQL endpoint health."""
    import httpx
    from config import ONTOP_ENDPOINT_URL
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{ONTOP_ENDPOINT_URL}/sparql", params={"query": "ASK { ?s ?p ?o } LIMIT 1"})
            return {"status": "ok" if resp.status_code == 200 else "error", "url": f"{ONTOP_ENDPOINT_URL}/sparql"}
    except Exception as e:
        return {"status": "unreachable", "url": f"{ONTOP_ENDPOINT_URL}/sparql", "error": str(e)}


@router.post("/api/generate-key")
async def generate_api_key():
    """Generate a new random API key."""
    key = secrets.token_urlsafe(32)
    cfg = update_publishing_config({"api_key": key})
    return {"api_key": key}


# ── MCP ────────────────────────────────────────────────────

@router.get("/mcp/status")
async def mcp_status():
    """Get MCP server status."""
    return get_mcp_status()


@router.post("/mcp/start")
async def mcp_start():
    """Start the MCP server."""
    ok = await start_mcp_server()
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to start MCP server")
    # Dynamically mount MCP ASGI app
    try:
        from main import app
        mount_mcp_app(app)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Failed to mount MCP app: %s", e)
    return get_mcp_status()


@router.post("/mcp/stop")
async def mcp_stop():
    """Stop the MCP server."""
    await stop_mcp_server()
    return get_mcp_status()


@router.get("/mcp/tools")
async def mcp_tools():
    """List available MCP tools derived from ontology."""
    return get_ontology_tools()


@router.get("/classes")
async def publishing_classes():
    """Return ontology classes with their bound properties for MCP verification."""
    return get_ontology_classes_summary()


@router.get("/mcp/config-snippet")
async def mcp_config_snippet(target: str = "claude_desktop"):
    """Generate MCP config snippet for a target platform."""
    from config import FASTAPI_PORT
    base_url = f"http://localhost:{FASTAPI_PORT}"
    sse_url = f"{base_url}/mcp/mcp/"

    if target == "claude_desktop":
        return {"target": target, "config": json.loads(generate_claude_desktop_config(sse_url))}
    elif target in ("cursor", "windsurf"):
        return {"target": target, "config": json.loads(generate_cursor_config(sse_url))}
    else:
        return {"target": target, "config": {"url": sse_url}}


# ── Skills / Plugin definitions ────────────────────────────

@router.get("/skills/generate")
async def skills_generate(format: str = "openai_function", tools: str = ""):
    """Generate tool definitions in the specified format."""
    selected = [t.strip() for t in tools.split(",") if t.strip()] if tools else []

    if format == "openai_function":
        return generate_openai_function_tools(selected)
    elif format == "anthropic_tool":
        return generate_anthropic_tool_definitions(selected)
    elif format == "openapi":
        from config import FASTAPI_PORT
        return generate_openapi_spec(f"http://localhost:{FASTAPI_PORT}", selected)
    elif format == "generic_json":
        return generate_generic_json_schema(selected)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown format: {format}")


# ── Audit ──────────────────────────────────────────────────

@router.get("/audit/logs")
async def get_audit_logs(
    page: int = 1,
    page_size: int = 20,
    caller: str | None = None,
    status: str | None = None,
):
    """Paginated audit log retrieval with optional filters."""
    from repositories.query_history_repo import list_audit_logs
    return list_audit_logs(page, page_size, caller, status)


@router.get("/audit/stats")
async def get_audit_stats():
    """Audit summary statistics."""
    from repositories.query_history_repo import get_audit_stats
    return get_audit_stats()


# ── Data Card ──────────────────────────────────────────────

@router.get("/datacard")
async def get_datacard():
    """Get ontology metadata data card as JSON."""
    from services.datacard import generate_datacard
    return generate_datacard()


@router.get("/datacard.ttl")
async def get_datacard_turtle():
    """Get ontology metadata data card as RDF/Turtle."""
    from services.datacard import generate_datacard, generate_datacard_turtle
    card = generate_datacard()
    ttl = generate_datacard_turtle(card)
    return Response(content=ttl, media_type="text/turtle")
