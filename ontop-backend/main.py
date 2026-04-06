"""Ontop UI - FastAPI Backend."""
import sys
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse

# Add backend dir to Python path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import FASTAPI_PORT
from database import init_db, migrate_json_to_sqlite

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

log_format = "%(asctime)s |%(levelname)-6s| %(name)s - %(message)s"
logging.basicConfig(
    level=logging.INFO,
    format=log_format,
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_DIR / "backend.log", encoding="utf-8"),
    ],
    force=True,
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and migrate JSON data on startup."""
    logger.info("Initializing database...")
    init_db()
    migrate_json_to_sqlite()
    logger.info("Database ready.")

    # Auto-start MCP server if enabled
    try:
        from repositories.publishing_repo import load_publishing_config
        from services.mcp_server import start_mcp_server, mount_mcp_app
        cfg = load_publishing_config()
        if cfg.get("mcp_enabled"):
            logger.info("MCP server auto-start enabled, launching...")
            ok = await start_mcp_server()
            if ok:
                mount_mcp_app(app)
                logger.info("MCP server mounted at /mcp")
    except Exception as e:
        logger.warning("Failed to auto-start MCP server: %s", e)

    yield

    # Shutdown MCP server
    try:
        from services.mcp_server import stop_mcp_server
        await stop_mcp_server()
    except Exception:
        pass


app = FastAPI(title="Ontop UI", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routers import (
    datasources, mappings, sparql, ai_query, ontology,
    workbench, publishing, annotations, glossary,
    endpoint_registry, suggestions, auth,
)

app.include_router(auth.router,              prefix="/api/v1")
app.include_router(datasources.router,       prefix="/api/v1")
app.include_router(mappings.router,          prefix="/api/v1")
app.include_router(sparql.router,            prefix="/api/v1")
app.include_router(ai_query.router,          prefix="/api/v1")
app.include_router(ontology.router,          prefix="/api/v1")
app.include_router(workbench.router,         prefix="/api/v1")
app.include_router(publishing.router,        prefix="/api/v1")
app.include_router(annotations.router,       prefix="/api/v1")
app.include_router(glossary.router,          prefix="/api/v1")
app.include_router(endpoint_registry.router, prefix="/api/v1")
app.include_router(suggestions.router,       prefix="/api/v1")


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next) -> Response:
    # Auth check for external-facing routes (/mcp and /api/v1)
    _auth_paths = ("/mcp", "/api/v1")
    _skip_paths = ("/api/v1/docs", "/api/v1/openapi.json", "/api/v1/redoc")
    path = request.url.path
    if path.startswith(_auth_paths) and not path.startswith(_skip_paths):
        try:
            from dependencies.auth import verify_api_key
            await verify_api_key(request)
        except Exception as e:
            if hasattr(e, "status_code"):
                return JSONResponse(status_code=e.status_code, content={"detail": str(e.detail) if hasattr(e, "detail") else str(e)})

    started = time.perf_counter()
    client_host = request.client.host if request.client else "-"
    logger.info("REQ  %s %s from=%s", request.method, request.url.path, client_host)

    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.exception(
            "ERR  %s %s from=%s duration=%.2fms",
            request.method,
            request.url.path,
            client_host,
            elapsed_ms,
        )
        raise

    elapsed_ms = (time.perf_counter() - started) * 1000
    logger.info(
        "RESP %s %s status=%s duration=%.2fms",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


@app.get("/api/v1/health")
async def health():
    return {"status": "ok"}


@app.get("/api/v1/config")
async def get_config():
    from config import ONTOP_ENGINE_URL, ONTOP_ENDPOINT_URL, LLM_BASE_URL, LLM_MODEL
    return {
        "ontop_cli": "managed-by-services",
        "ontop_engine_url": ONTOP_ENGINE_URL,
        "ontop_endpoint_url": ONTOP_ENDPOINT_URL,
        "llm_base_url": LLM_BASE_URL,
        "llm_model": LLM_MODEL,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=FASTAPI_PORT, reload=True)
