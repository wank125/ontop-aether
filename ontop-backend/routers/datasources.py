"""Data source bootstrap router (CRUD migrated to ontop-engine Java).

Only bootstrap-related endpoints remain here because they need LLM integration.
CRUD (list/get/create/update/delete/test/schemas/schema) is handled by ontop-engine.
"""
import json
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException

from models.datasource import BootstrapRequest
from services.ontop_cli import extract_db_metadata, bootstrap as ontop_bootstrap
from services.bootstrap_service import (
    build_preview,
    generate_partial_bootstrap,
    get_version_dir,
    load_schema_metadata,
    resolve_requested_tables,
    write_manifest,
)
from services.ontology_format import normalize_ontology_to_turtle
from services.ontology_enrichment import enrich_ontology_labels
from services.annotation_merge import merge_annotations_to_ttl
from config import DATA_DIR
from repositories.datasource_repo import get_datasource as repo_get
from repositories.endpoint_registry_repo import register_datasource as register_endpoint

router = APIRouter(prefix="/datasources", tags=["datasources"])


@router.post("/{ds_id}/bootstrap")
async def run_bootstrap(ds_id: str, req: BootstrapRequest):
    ds = _get_ds(ds_id)
    base_name = ds["name"].replace(" ", "_")
    root_output_dir = Path(req.output_dir) if req.output_dir else Path(DATA_DIR) / ds["id"]
    root_output_dir.mkdir(parents=True, exist_ok=True)

    schema = None
    effective_mode = "partial" if req.mode == "partial" or req.tables else "full"
    requested_tables = [table for table in req.tables if table.strip()]
    resolved_tables: list[str] = []
    added_dependencies: list[str] = []

    if effective_mode == "partial":
        if not requested_tables:
            raise HTTPException(400, "Partial bootstrap requires at least one selected table.")
        schema = await _get_schema_metadata(ds)
        requested_tables, resolved_tables, added_dependencies = resolve_requested_tables(
            schema,
            requested_tables,
            req.include_dependencies,
        )
    elif _is_mysql_datasource(ds):
        schema = await _get_schema_metadata(ds)
        requested_tables = [
            ".".join(_normalize_identifier(part) for part in relation.get("name", [])).split(".")[-1]
            for relation in schema.get("relations", [])
        ]
        resolved_tables = list(requested_tables)
        effective_mode = "full"

    version, version_dir = get_version_dir(root_output_dir, effective_mode)
    props_path = version_dir / f"{base_name}.properties"
    _write_properties(ds, str(props_path))

    if req.mode == "partial" or (_is_mysql_datasource(ds) and schema is not None and resolved_tables):
        onto_path, mapping_path, output = await generate_partial_bootstrap(
            base_iri=req.base_iri,
            version_dir=version_dir,
            base_name=base_name,
            properties_path=str(props_path),
            requested_tables=requested_tables,
            resolved_tables=resolved_tables,
        )
    else:
        onto_path = str(version_dir / f"{base_name}_ontology.ttl")
        mapping_path = str(version_dir / f"{base_name}_mapping.obda")
        success, output = await ontop_bootstrap(
            base_iri=req.base_iri,
            ontology_path=onto_path,
            mapping_path=mapping_path,
            properties_path=str(props_path),
        )
        if not success:
            raise HTTPException(400, f"Bootstrap failed: {output[:500]}")

    raw_ontology_path = onto_path
    onto_path = normalize_ontology_to_turtle(onto_path)

    manifest = {
        "version": version,
        "mode": effective_mode,
        "requested_tables": requested_tables,
        "resolved_tables": resolved_tables,
        "added_dependencies": added_dependencies,
        "include_dependencies": req.include_dependencies,
        "base_iri": req.base_iri,
        "created_at": datetime.now().isoformat(),
        "raw_ontology_path": raw_ontology_path,
        "ontology_path": onto_path,
        "mapping_path": mapping_path,
        "properties_path": str(props_path),
    }
    manifest_path, selected_tables_path = write_manifest(version_dir, manifest)

    active_dir = Path(DATA_DIR) / ds_id / "active"
    active_dir.mkdir(parents=True, exist_ok=True)
    active_ttl_path = str(active_dir / "merged_ontology.ttl")

    import asyncio

    async def _enrich_then_merge():
        """LLM 标注（→注释库 pending）完成后，立即合并 accepted 注释到 active TTL。"""
        await enrich_ontology_labels(onto_path, ds_id=ds_id)
        merge_annotations_to_ttl(
            raw_ttl_path=onto_path,
            ds_id=ds_id,
            output_ttl_path=active_ttl_path,
        )

    asyncio.create_task(_enrich_then_merge())

    ds_record = repo_get(ds_id)
    register_endpoint(
        ds_id=ds_id,
        ds_name=ds_record["name"] if ds_record else ds_id,
        active_dir=str(active_dir),
        ontology_path=onto_path,
        mapping_path=mapping_path,
        properties_path=str(props_path),
        set_current=False,
    )

    return {
        "version": version,
        "mode": effective_mode,
        "requested_tables": requested_tables,
        "resolved_tables": resolved_tables,
        "added_dependencies": added_dependencies,
        "ontology_path": onto_path,
        "active_ttl_path": active_ttl_path,
        "mapping_path": mapping_path,
        "properties_path": str(props_path),
        "manifest_path": str(manifest_path),
        "selected_tables_path": str(selected_tables_path),
        "output": output[:1000],
    }


@router.get("/{ds_id}/bootstrap/latest")
async def get_latest_bootstrap(ds_id: str):
    root_output_dir = Path(DATA_DIR) / ds_id
    if not root_output_dir.exists():
        return None

    dirs = [d for d in root_output_dir.iterdir() if d.is_dir() and d.name.startswith("bootstrap-")]
    if not dirs:
        return None

    dirs.sort(key=lambda x: x.name, reverse=True)
    latest_dir = dirs[0]

    manifest_path = latest_dir / "manifest.json"
    if not manifest_path.exists():
        return None

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    return {
        "version": manifest.get("version"),
        "mode": manifest.get("mode"),
        "requested_tables": manifest.get("requested_tables", []),
        "resolved_tables": manifest.get("resolved_tables", []),
        "added_dependencies": manifest.get("added_dependencies", []),
        "ontology_path": manifest.get("ontology_path"),
        "mapping_path": manifest.get("mapping_path"),
        "properties_path": manifest.get("properties_path"),
        "manifest_path": str(manifest_path),
        "selected_tables_path": str(latest_dir / "selected_tables.json"),
        "output": "从历史记录加载",
    }


@router.post("/{ds_id}/bootstrap-preview")
async def preview_bootstrap(ds_id: str, req: BootstrapRequest):
    ds = _get_ds(ds_id)
    if req.mode != "partial" and not req.tables:
        schema = await _get_schema_metadata(ds)
        all_tables = [
            ".".join(_normalize_identifier(part) for part in relation.get("name", [])).split(".")[-1]
            for relation in schema.get("relations", [])
        ]
        return build_preview(schema, all_tables, all_tables, [])

    if not req.tables:
        raise HTTPException(400, "Bootstrap preview requires at least one selected table.")

    schema = await _get_schema_metadata(ds)
    requested_tables, resolved_tables, added_dependencies = resolve_requested_tables(
        schema,
        req.tables,
        req.include_dependencies,
    )
    return build_preview(schema, requested_tables, resolved_tables, added_dependencies)


# ── Internal helpers ──

def _get_ds(ds_id: str) -> dict:
    ds = repo_get(ds_id)
    if not ds:
        raise HTTPException(404, "Data source not found")
    return ds


def _write_properties(ds: dict, path: str):
    with open(path, "w") as f:
        f.write(f"jdbc.url={ds['jdbc_url']}\n")
        f.write(f"jdbc.user={ds['user']}\n")
        f.write(f"jdbc.password={ds['password']}\n")
        f.write(f"jdbc.driver={ds['driver']}\n")


def _write_temp_properties(ds: dict) -> str:
    tmp = tempfile.NamedTemporaryFile(suffix=".properties", delete=False, mode="w")
    _write_properties(ds, tmp.name)
    tmp.close()
    return tmp.name


async def _get_schema_metadata(ds: dict) -> dict:
    props_path = _write_temp_properties(ds)
    try:
        success, output = await extract_db_metadata(props_path)
        if not success:
            raise HTTPException(400, f"Failed to extract metadata: {output[:500]}")
        schema_data = load_schema_metadata(output)
        return _filter_schema_metadata(ds, schema_data)
    finally:
        Path(props_path).unlink(missing_ok=True)


def _normalize_identifier(value: str) -> str:
    return value.strip().strip('"').strip("'").strip("`")


def _relation_schema_name(relation: dict) -> str:
    name_parts = relation.get("name", [])
    if len(name_parts) >= 2:
        return _normalize_identifier(name_parts[-2])
    return "(default)"


def _is_mysql_datasource(ds: dict) -> bool:
    driver = ds.get("driver", "").lower()
    jdbc_url = ds.get("jdbc_url", "").lower()
    return "mysql" in driver or jdbc_url.startswith("jdbc:mysql:")


def _default_mysql_schema(ds: dict) -> str | None:
    jdbc_url = ds.get("jdbc_url", "")
    if not jdbc_url.startswith("jdbc:mysql:"):
        return None
    without_prefix = jdbc_url[len("jdbc:mysql:"):]
    base = without_prefix.split("?", 1)[0]
    parsed = urlparse(base if base.startswith("//") else f"//{base}")
    path = parsed.path.lstrip("/")
    return path or None


def _filter_schema_metadata(ds: dict, schema_data: dict) -> dict:
    relations = schema_data.get("relations", [])
    if not _is_mysql_datasource(ds):
        return schema_data

    default_schema = _default_mysql_schema(ds)
    system_schemas = {"sys", "mysql", "information_schema", "performance_schema"}

    filtered_relations = []
    for relation in relations:
        schema_name = _relation_schema_name(relation)
        if schema_name in system_schemas:
            continue
        if default_schema and schema_name not in {"(default)", default_schema}:
            continue
        filtered_relations.append(relation)

    schema_data["relations"] = filtered_relations
    return schema_data
