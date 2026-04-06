"""Ontology (TTL) viewer router."""
from pathlib import Path

from fastapi import APIRouter, HTTPException

from services.ttl_parser import parse_ttl
from config import DATA_DIR, ONTOP_OUTPUT

router = APIRouter(prefix="/ontology", tags=["ontology"])


def _iter_search_dirs() -> list[Path]:
    dirs: list[Path] = []
    for candidate in [ONTOP_OUTPUT, DATA_DIR]:
        if candidate not in dirs:
            dirs.append(candidate)
    return dirs


@router.get("")
async def list_ttl_files():
    """List available .ttl files in the default output and bootstrap data directories."""
    files = []
    seen_paths: set[str] = set()
    for d in _iter_search_dirs():
        if not d.exists():
            continue
        for f in d.glob("**/*.ttl"):
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


@router.get("/content")
async def get_ontology_content(path: str):
    """Read and parse a .ttl file."""
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(404, f"File not found: {path}")

    content = file_path.read_text(encoding="utf-8")
    parsed = parse_ttl(content)
    return parsed.model_dump()
