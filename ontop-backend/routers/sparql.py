"""SPARQL query center router."""
import json
import logging
import time

import httpx
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import Response

from models.query import SparqlQueryRequest, ReformulateRequest, QueryHistoryEntry
from services.ontop_endpoint import get_endpoint_status, ONTOP_ENDPOINT_URL
from dependencies.auth import verify_api_key
from repositories.query_history_repo import (
    list_history as repo_list_history,
    save_to_history as repo_save_history,
    delete_history_entry as repo_delete_history,
)

router = APIRouter(prefix="/sparql", tags=["sparql"])

logger = logging.getLogger(__name__)

FORMAT_MAP = {
    "json": "application/sparql-results+json",
    "xml": "application/sparql-results+xml",
    "csv": "text/csv",
    "turtle": "text/turtle",
}


@router.post("/query")
async def execute_query(req: SparqlQueryRequest, request: Request, _auth=Depends(verify_api_key)):
    """Proxy SPARQL query to Ontop endpoint."""
    source_ip = request.client.host if request.client else ""
    accept = FORMAT_MAP.get(req.format, "application/sparql-results+json")

    t0 = time.perf_counter()
    status = "ok"
    error_message = ""

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(
                f"{ONTOP_ENDPOINT_URL}/sparql",
                data=req.query,
                headers={
                    "Content-Type": "application/sparql-query",
                    "Accept": accept,
                },
            )
        except httpx.ConnectError:
            status = "error"
            error_message = "Ontop endpoint is not running"
            repo_save_history(
                req.query, source_ip=source_ip, caller="web",
                duration_ms=(time.perf_counter() - t0) * 1000,
                status=status, error_message=error_message,
            )
            raise HTTPException(503, error_message)

    duration_ms = (time.perf_counter() - t0) * 1000

    if resp.status_code != 200:
        status = "error"
        error_message = resp.text[:500]
        repo_save_history(
            req.query, source_ip=source_ip, caller="web",
            duration_ms=duration_ms, status=status, error_message=error_message,
        )
        raise HTTPException(resp.status_code, error_message)

    # Count results
    result_count = None
    try:
        data = json.loads(resp.text)
        bindings = data.get("results", {}).get("bindings", [])
        result_count = len(bindings)
    except Exception:
        pass

    repo_save_history(
        req.query, result_count=result_count, source_ip=source_ip,
        caller="web", duration_ms=round(duration_ms, 1),
    )

    return Response(
        content=resp.content,
        media_type=resp.headers.get("content-type", accept),
    )


@router.post("/reformulate")
async def reformulate_query(req: ReformulateRequest):
    """Get the SQL reformulation of a SPARQL query."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(
                f"{ONTOP_ENDPOINT_URL}/ontop/reformulate",
                params={"query": req.query},
            )
        except httpx.ConnectError:
            raise HTTPException(503, "Ontop endpoint is not running")

    if resp.status_code != 200:
        return {"sql": f"Error: {resp.text[:200]}"}

    return {"sql": resp.text}


@router.get("/history")
async def get_history():
    """Get query history."""
    return repo_list_history()


@router.delete("/history/{entry_id}", status_code=204)
async def delete_history(entry_id: str):
    """Delete a history entry."""
    repo_delete_history(entry_id)


@router.get("/endpoint-status")
async def endpoint_status():
    """Check Ontop endpoint status."""
    return await get_endpoint_status()
