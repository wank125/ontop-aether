"""Transparent reverse proxy for ontop-engine management APIs.

Routes sensitive management requests through backend auth middleware
before forwarding to ontop-engine. This ensures that datasources,
repositories, mappings, and endpoint-registry endpoints are protected
by the same auth chain as other backend APIs.

Read-only / query paths (ontology, sparql) remain proxied directly
by nginx to ontop-engine for performance.
"""
import logging

import httpx
from fastapi import APIRouter, Request, Response

router = APIRouter(tags=["engine-proxy"])
logger = logging.getLogger(__name__)

ENGINE_URL = "http://ontop-engine:8081"
# Headers that should not be forwarded to the upstream service
_HOP_HEADERS = frozenset(h.lower() for h in (
    "host", "transfer-encoding", "connection", "keep-alive",
    "proxy-authenticate", "proxy-authorization", "te", "trailers",
    "upgrade", "content-length",
))


async def _forward(request: Request, engine_path: str) -> Response:
    """Forward the request to ontop-engine and return its response."""
    # Build forwarded headers (skip hop-by-hop headers)
    fwd_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in _HOP_HEADERS
    }

    body = await request.body()

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.request(
            method=request.method,
            url=f"{ENGINE_URL}{engine_path}",
            headers=fwd_headers,
            content=body or None,
            params=dict(request.query_params),
        )

    # Build response headers, skip hop-by-hop
    resp_headers = {
        k: v for k, v in resp.headers.items()
        if k.lower() not in _HOP_HEADERS
    }

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=resp_headers,
    )


# ── Datasources (CRUD, contains decrypted passwords) ──────────

@router.api_route("/datasources", methods=["GET", "POST"])
async def proxy_datasources(request: Request):
    return await _forward(request, "/api/v1/datasources")


@router.api_route("/datasources/{path:path}", methods=["GET", "PUT", "DELETE", "POST"])
async def proxy_datasources_detail(request: Request, path: str):
    return await _forward(request, f"/api/v1/datasources/{path}")


# ── Repositories (register, activate, restart, health) ───────

@router.api_route("/repositories", methods=["GET", "POST"])
async def proxy_repositories(request: Request):
    return await _forward(request, "/api/v1/repositories")


@router.api_route("/repositories/{path:path}", methods=["GET", "PUT", "DELETE", "POST"])
async def proxy_repositories_detail(request: Request, path: str):
    return await _forward(request, f"/api/v1/repositories/{path}")


# ── Mappings (file ops, validate, restart-endpoint) ───────────

@router.api_route("/mappings", methods=["GET"])
async def proxy_mappings_list(request: Request):
    return await _forward(request, "/api/v1/mappings")


@router.api_route("/mappings/{path:path}", methods=["GET", "PUT", "POST"])
async def proxy_mappings_detail(request: Request, path: str):
    return await _forward(request, f"/api/v1/mappings/{path}")


# ── Endpoint Registry (activate, current, tasks) ──────────────

@router.api_route("/endpoint-registry", methods=["GET"])
async def proxy_endpoint_registry_list(request: Request):
    return await _forward(request, "/api/v1/endpoint-registry")


@router.api_route("/endpoint-registry/{path:path}", methods=["GET", "PUT", "POST"])
async def proxy_endpoint_registry_detail(request: Request, path: str):
    return await _forward(request, f"/api/v1/endpoint-registry/{path}")
