"""Helpers for full and partial bootstrap generation."""
import json
import re
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlparse

from fastapi import HTTPException

from models.mapping import MappingContent, MappingRule
from services.obda_parser import parse_obda, serialize_obda
from services.ontop_cli import bootstrap as ontop_bootstrap


def normalize_table_name(name: str) -> str:
    return name.replace('"', '').replace("`", "").strip()


def get_version_dir(base_dir: Path, mode: str) -> tuple[str, Path]:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    version = f"bootstrap-{mode}-{timestamp}"
    version_dir = base_dir / version
    version_dir.mkdir(parents=True, exist_ok=True)
    return version, version_dir


def load_schema_metadata(raw_output: str) -> dict:
    try:
        return json.loads(raw_output)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, f"Failed to parse schema metadata: {exc}")


def resolve_requested_tables(schema: dict, requested_tables: list[str], include_dependencies: bool) -> tuple[list[str], list[str], list[str]]:
    relations = schema.get("relations", [])
    relation_lookup: dict[str, dict] = {}
    local_name_counts: dict[str, int] = {}

    for relation in relations:
        full_name = ".".join(normalize_table_name(part) for part in relation.get("name", []))
        local_name = full_name.split(".")[-1]
        relation_lookup[full_name] = relation
        relation_lookup.setdefault(local_name, relation)
        local_name_counts[local_name] = local_name_counts.get(local_name, 0) + 1

    unresolved: list[str] = []
    ambiguous: list[str] = []
    resolved_full_names: list[str] = []

    for requested in requested_tables:
        normalized = normalize_table_name(requested)
        if normalized in relation_lookup:
            if "." not in normalized and local_name_counts.get(normalized, 0) > 1:
                ambiguous.append(normalized)
                continue
            relation = relation_lookup[normalized]
            full_name = ".".join(normalize_table_name(part) for part in relation.get("name", []))
            if full_name not in resolved_full_names:
                resolved_full_names.append(full_name)
        else:
            unresolved.append(normalized)

    if ambiguous:
        raise HTTPException(400, f"Ambiguous table names: {', '.join(ambiguous)}. Use schema-qualified names.")
    if unresolved:
        raise HTTPException(400, f"Unknown tables: {', '.join(unresolved)}")

    added_dependencies: list[str] = []
    if include_dependencies:
        queue = list(resolved_full_names)
        while queue:
            current_name = queue.pop(0)
            relation = relation_lookup[current_name]
            for foreign_key in relation.get("foreignKeys", []):
                target_name = ".".join(normalize_table_name(part) for part in foreign_key.get("to", {}).get("relation", []))
                if target_name and target_name not in resolved_full_names:
                    resolved_full_names.append(target_name)
                    queue.append(target_name)
                    added_dependencies.append(target_name)

    requested_local = [name.split(".")[-1] for name in resolved_full_names if name.split(".")[-1] in [normalize_table_name(item).split(".")[-1] for item in requested_tables]]
    resolved_local = [name.split(".")[-1] for name in resolved_full_names]
    dependency_local = [name.split(".")[-1] for name in added_dependencies]
    return requested_local, resolved_local, dependency_local


def build_preview(schema: dict, requested_tables: list[str], resolved_tables: list[str], added_dependencies: list[str]) -> dict:
    relations = schema.get("relations", [])
    relation_lookup = {
        ".".join(normalize_table_name(part) for part in relation.get("name", [])): relation
        for relation in relations
    }

    estimated_object_properties = []
    warnings = []
    resolved_set = set(resolved_tables)

    for full_name, relation in relation_lookup.items():
        local_name = full_name.split(".")[-1]
        if local_name not in resolved_set:
            continue
        for foreign_key in relation.get("foreignKeys", []):
            target_full = ".".join(normalize_table_name(part) for part in foreign_key.get("to", {}).get("relation", []))
            target_local = target_full.split(".")[-1] if target_full else ""
            if target_local in resolved_set:
                from_columns = [normalize_table_name(column) for column in foreign_key.get("from", {}).get("columns", [])]
                estimated_object_properties.append({
                    "from": local_name,
                    "name": f"ref-{from_columns[0] if from_columns else 'id'}",
                    "to": target_local,
                })
            else:
                warnings.append(f"外键 {local_name} -> {target_local} 未被纳入本次 Bootstrap。")

    return {
        "requested_tables": requested_tables,
        "resolved_tables": resolved_tables,
        "added_dependencies": added_dependencies,
        "warnings": warnings,
        "estimated_classes": resolved_tables,
        "estimated_object_properties": estimated_object_properties,
    }


def _table_from_uri(uri: str) -> str | None:
    parsed = urlparse(uri)
    path_parts = [part for part in parsed.path.split("/") if part]
    if parsed.fragment:
        return path_parts[-1] if path_parts else None
    if not path_parts:
        return None
    if "=" in path_parts[-1]:
        return path_parts[-2] if len(path_parts) >= 2 else path_parts[-1]
    return path_parts[-1]


def extract_tables_from_target(target: str) -> set[str]:
    tables = set()
    for uri in re.findall(r"<([^>]+)>", target):
        table_name = _table_from_uri(uri)
        if table_name:
            tables.add(table_name)
    return tables


def filter_mapping_content(content: MappingContent, resolved_tables: list[str]) -> MappingContent:
    allowed_tables = set(resolved_tables)
    filtered_mappings: list[MappingRule] = []
    for mapping in content.mappings:
        mapping_tables = extract_tables_from_target(mapping.target)
        if mapping_tables and mapping_tables.issubset(allowed_tables):
            filtered_mappings.append(mapping)
    return MappingContent(prefixes=content.prefixes, mappings=filtered_mappings)


def build_filtered_ontology(mapping_content: MappingContent, base_iri: str) -> str:
    classes: set[str] = set()
    data_properties: set[str] = set()
    object_properties: set[str] = set()

    for mapping in mapping_content.mappings:
        for class_uri in re.findall(r"a\s+<([^>]+)>", mapping.target):
            classes.add(class_uri)

        for property_uri in re.findall(r"<([^>]+#[^>]+)>\s+\{", mapping.target):
            if "#ref-" in property_uri:
                object_properties.add(property_uri)
            else:
                data_properties.add(property_uri)

        for object_property_uri in re.findall(r"<([^>]+#ref-[^>]+)>", mapping.target):
            object_properties.add(object_property_uri)

    normalized_base = base_iri.rstrip("/") + "/"
    lines = [
        '<?xml version="1.0"?>',
        f'<rdf:RDF xmlns="{normalized_base}"',
        f'     xml:base="{normalized_base}"',
        '     xmlns:owl="http://www.w3.org/2002/07/owl#"',
        '     xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"',
        '     xmlns:xml="http://www.w3.org/XML/1998/namespace"',
        '     xmlns:xsd="http://www.w3.org/2001/XMLSchema#"',
        '     xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">',
        f'    <owl:Ontology rdf:about="{normalized_base}"/>',
        "",
        "    <!-- Object Properties -->",
        "",
    ]

    for uri in sorted(object_properties):
        lines.extend([
            f'    <owl:ObjectProperty rdf:about="{uri}"/>',
            "",
        ])

    lines.extend([
        "    <!-- Data properties -->",
        "",
    ])

    for uri in sorted(data_properties):
        lines.extend([
            f'    <owl:DatatypeProperty rdf:about="{uri}"/>',
            "",
        ])

    lines.extend([
        "    <!-- Classes -->",
        "",
    ])

    for uri in sorted(classes):
        lines.extend([
            f'    <owl:Class rdf:about="{uri}"/>',
            "",
        ])

    lines.append("</rdf:RDF>")
    return "\n".join(lines)


def write_manifest(version_dir: Path, manifest: dict):
    manifest_path = version_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    selected_tables_path = version_dir / "selected_tables.json"
    selected_tables_path.write_text(
        json.dumps(
            {
                "requested_tables": manifest.get("requested_tables", []),
                "resolved_tables": manifest.get("resolved_tables", []),
                "added_dependencies": manifest.get("added_dependencies", []),
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return manifest_path, selected_tables_path


async def generate_partial_bootstrap(
    *,
    base_iri: str,
    version_dir: Path,
    base_name: str,
    properties_path: str,
    requested_tables: list[str],
    resolved_tables: list[str],
) -> tuple[str, str, str]:
    with TemporaryDirectory(prefix="ontop-bootstrap-") as temp_dir:
        temp_path = Path(temp_dir)
        temp_ontology = temp_path / f"{base_name}_full_ontology.ttl"
        temp_mapping = temp_path / f"{base_name}_full_mapping.obda"

        success, output = await ontop_bootstrap(
            base_iri=base_iri,
            ontology_path=str(temp_ontology),
            mapping_path=str(temp_mapping),
            properties_path=properties_path,
        )
        if not success:
            raise HTTPException(400, f"Bootstrap failed: {output[:500]}")

        raw_mapping = temp_mapping.read_text(encoding="utf-8")
        parsed_mapping = parse_obda(raw_mapping)
        filtered_mapping = filter_mapping_content(parsed_mapping, resolved_tables)
        if not filtered_mapping.mappings:
            raise HTTPException(400, "Partial bootstrap produced no mappings. Check selected tables and dependencies.")

        mapping_path = version_dir / f"{base_name}_mapping.obda"
        ontology_path = version_dir / f"{base_name}_ontology.ttl"
        mapping_path.write_text(serialize_obda(filtered_mapping), encoding="utf-8")
        ontology_path.write_text(build_filtered_ontology(filtered_mapping, base_iri), encoding="utf-8")
        return str(ontology_path), str(mapping_path), output[:1000]
