"""Workbench API — semantic analysis and ontology generation."""

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.semantic_analyzer import analyze_schema

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workbench")


class AnalyzeRequest(BaseModel):
    datasource_id: str
    tables: list[str]
    base_iri: str = "http://example.com/ontop/"


class GenerateRequest(BaseModel):
    datasource_id: str
    base_iri: str = "http://example.com/ontop/"
    tables: list[str] = []
    ignored_columns: list[str] = []
    renamed_properties: list[dict[str, str]] = []


def _get_ds(ds_id: str) -> dict:
    from repositories.datasource_repo import get_datasource as repo_get
    ds = repo_get(ds_id)
    if not ds:
        raise HTTPException(404, "Data source not found")
    return ds


async def _get_schema(ds: dict) -> dict:
    import tempfile
    from services.ontop_cli import extract_db_metadata
    from services.bootstrap_service import load_schema_metadata

    tmp = tempfile.NamedTemporaryFile(suffix=".properties", delete=False, mode="w")
    tmp.write(f"jdbc.url={ds['jdbc_url']}\n")
    tmp.write(f"jdbc.user={ds['user']}\n")
    tmp.write(f"jdbc.password={ds['password']}\n")
    tmp.write(f"jdbc.driver={ds['driver']}\n")
    tmp.close()
    try:
        success, output = await extract_db_metadata(tmp.name)
        if not success:
            raise HTTPException(400, f"Failed to extract schema: {output[:500]}")
        return load_schema_metadata(output)
    finally:
        Path(tmp.name).unlink(missing_ok=True)


@router.post("/analyze")
async def analyze(request: AnalyzeRequest):
    """Analyze database schema and return semantic candidates."""
    if not request.tables:
        raise HTTPException(400, "No tables selected")

    ds = _get_ds(request.datasource_id)
    schema = await _get_schema(ds)
    result = analyze_schema(schema, request.tables, request.base_iri)

    logger.info(
        "Analyzed %d tables → %d classes, %d data props, %d object props",
        len(request.tables),
        len(result["candidates"]["classes"]),
        len(result["candidates"]["data_properties"]),
        len(result["candidates"]["object_properties"]),
    )
    return result


@router.post("/generate")
async def generate(request: GenerateRequest):
    """Generate ontology + mapping from confirmed semantic candidates."""
    if not request.tables:
        raise HTTPException(400, "No tables selected")

    # Delegate to existing bootstrap endpoint logic
    from routers.datasources import run_bootstrap
    from models.datasource import BootstrapRequest

    result = await run_bootstrap(
        request.datasource_id,
        BootstrapRequest(
            base_iri=request.base_iri,
            mode="partial",
            tables=request.tables,
            include_dependencies=True,
        ),
    )
    logger.info("Generated ontology for tables %s", request.tables)
    return result
