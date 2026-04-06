"""Mapping editor router."""
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException

from models.mapping import MappingContent, ValidateRequest, RestartEndpointRequest
from services.obda_parser import parse_obda, serialize_obda
from services.ontop_cli import validate as ontop_validate
from services.ontop_endpoint import start_endpoint, stop_endpoint
from config import DATA_DIR, ONTOP_OUTPUT, ONTOLOGY_FILE, MAPPING_FILE, PROPERTIES_FILE, ONTOP_ENDPOINT_PORT

router = APIRouter(prefix="/mappings", tags=["mappings"])


def _iter_search_dirs() -> list[Path]:
    dirs: list[Path] = []
    for candidate in [ONTOP_OUTPUT, DATA_DIR]:
        if candidate not in dirs:
            dirs.append(candidate)
    return dirs


@router.get("")
async def list_mappings():
    """List available .obda files in the default output and bootstrap data directories."""
    files = []
    seen_paths: set[str] = set()
    for d in _iter_search_dirs():
        if not d.exists():
            continue
        for f in d.glob("**/*.obda"):
            resolved = str(f.resolve())
            if resolved in seen_paths:
                continue
            seen_paths.add(resolved)
            stat = f.stat()
            files.append({
                "path": str(f),
                "filename": f.name,
                "modified_at": stat.st_mtime,
            })
    files.sort(key=lambda item: item["modified_at"], reverse=True)
    return files


@router.get("/{path:path}/content")
async def get_mapping_content(path: str):
    """Read and parse an .obda file."""
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(404, f"File not found: {path}")

    content = file_path.read_text(encoding="utf-8")
    parsed = parse_obda(content)
    return parsed.model_dump()


@router.get("/content")
async def get_mapping_content_by_query(path: str):
    """Read and parse an .obda file via query parameter (avoids URL normalization issues)."""
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(404, f"File not found: {path}")

    content = file_path.read_text(encoding="utf-8")
    parsed = parse_obda(content)
    return parsed.model_dump()


@router.put("/{path:path}/content")
async def save_mapping_content(path: str, content: MappingContent):
    """Save modified .obda file."""
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(404, f"File not found: {path}")

    serialized = serialize_obda(content)
    file_path.write_text(serialized, encoding="utf-8")
    return {"success": True}


@router.put("/content")
async def save_mapping_content_by_query(path: str, content: MappingContent):
    """Save modified .obda file via query parameter."""
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(404, f"File not found: {path}")

    serialized = serialize_obda(content)
    file_path.write_text(serialized, encoding="utf-8")
    return {"success": True}


@router.post("/{path:path}/validate")
async def validate_mapping(path: str, req: ValidateRequest):
    """Validate a mapping file."""
    ontology_path = req.ontology_path or str(ONTOLOGY_FILE)
    properties_path = req.properties_path or str(PROPERTIES_FILE)

    success, output = await ontop_validate(
        mapping_path=path,
        ontology_path=ontology_path,
        properties_path=properties_path,
    )
    return {"valid": success, "errors": [] if success else [output[:500]]}


@router.post("/validate")
async def validate_mapping_by_query(path: str, req: ValidateRequest):
    """Validate a mapping file via query parameter."""
    ontology_path = req.ontology_path or str(ONTOLOGY_FILE)
    properties_path = req.properties_path or str(PROPERTIES_FILE)

    success, output = await ontop_validate(
        mapping_path=path,
        ontology_path=ontology_path,
        properties_path=properties_path,
    )
    return {"valid": success, "errors": [] if success else [output[:500]]}


@router.post("/restart-endpoint")
async def restart_endpoint(req: RestartEndpointRequest):
    """Restart the Ontop endpoint with specified config."""
    success, msg = await start_endpoint(
        ontology_path=req.ontology_path,
        mapping_path=req.mapping_path,
        properties_path=req.properties_path,
        port=req.port if req.port != 8080 else ONTOP_ENDPOINT_PORT,
    )
    if not success:
        raise HTTPException(500, f"Failed to start endpoint: {msg[:500]}")
    return {"success": True, "message": "Endpoint restarted"}
