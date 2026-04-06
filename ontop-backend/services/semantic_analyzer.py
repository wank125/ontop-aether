"""Semantic analyzer — infers ontology candidates from database schema."""

import re
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Columns that are typically system-generated and should be downgraded
SYSTEM_COLUMNS = {
    "created_at", "updated_at", "deleted_at", "created_by", "updated_by",
    "create_time", "update_time", "delete_time",
    "id",  # usually PK, handled separately
}

# Columns that are good label candidates
LABEL_KEYWORDS = {"name", "title", "code", "label", "description", "caption", "short_name", "full_name"}

# SQL datatype → XSD mapping
DATATYPE_MAP = {
    "varchar": "xsd:string",
    "character varying": "xsd:string",
    "character": "xsd:string",
    "text": "xsd:string",
    "char": "xsd:string",
    "nvarchar2": "xsd:string",
    "text": "xsd:string",
    "tinytext": "xsd:string",
    "mediumtext": "xsd:string",
    "longtext": "xsd:string",
    "int": "xsd:integer",
    "integer": "xsd:integer",
    "bigint": "xsd:integer",
    "smallint": "xsd:integer",
    "tinyint": "xsd:integer",
    "serial": "xsd:integer",
    "bigserial": "xsd:integer",
    "numeric": "xsd:decimal",
    "decimal": "xsd:decimal",
    "real": "xsd:double",
    "double precision": "xsd:double",
    "float": "xsd:double",
    "boolean": "xsd:boolean",
    "bool": "xsd:boolean",
    "date": "xsd:date",
    "timestamp": "xsd:dateTime",
    "timestamp without time zone": "xsd:dateTime",
    "timestamp with time zone": "xsd:dateTime",
    "time": "xsd:time",
    "time without time zone": "xsd:time",
    "bytea": "xsd:hexBinary",
    "uuid": "xsd:string",
    "json": "xsd:string",
    "jsonb": "xsd:string",
    "xml": "xsd:string",
    "bit": "xsd:integer",
}


def _to_pascal_case(name: str) -> str:
    """Convert snake_case or lowercase to PascalCase."""
    # Remove common prefixes
    for prefix in ("tbl_", "tab_", "dim_", "fact_", "vw_", "v_"):
        if name.lower().startswith(prefix):
            name = name[len(prefix):]
            break
    parts = name.replace("-", "_").split("_")
    return "".join(p.capitalize() for p in parts if p)


def _to_camel_case(name: str) -> str:
    """Convert snake_case or lowercase to camelCase."""
    parts = name.replace("-", "_").split("_")
    return parts[0].lower() + "".join(p.capitalize() for p in parts[1:] if p)


def _get_xsd_type(sql_type: str) -> str:
    """Map SQL datatype to XSD datatype."""
    if not sql_type:
        return "xsd:string"
    normalized = sql_type.lower().strip()
    for sql_key, xsd_val in DATATYPE_MAP.items():
        if sql_key in normalized or normalized.startswith(sql_key):
            return xsd_val
    return "xsd:string"


def strip_quotes(value: str) -> str:
    if not value:
        return value
    return value.strip('"').strip("'").strip("`")


def _get_local_name(relation_name: list[str] | str) -> str:
    """Extract table name from qualified name array like ['public', 'account']."""
    if len(relation_name) > 1:
        return strip_quotes(relation_name[-1])
    return strip_quotes(relation_name[0]) if relation_name else "unknown"


def analyze_schema(
    schema: dict[str, Any],
    selected_tables: list[str],
    base_iri: str = "http://example.com/ontop/",
) -> dict[str, Any]:
    """
    Analyze database schema and infer semantic candidates.

    Returns dict with classes, data_properties, and object_properties.
    """
    relations = schema.get("relations", [])
    relations_by_name: dict[str, dict] = {}

    for rel in relations:
        local_name = _get_local_name(rel.get("name", []))
        relations_by_name[local_name] = rel

    # Filter to selected tables
    selected_set = set()
    for t in selected_tables:
        selected_set.add(strip_quotes(t))
        # Also match qualified names
        for rel in relations:
            rn = _get_local_name(rel.get("name", []))
            if rn == strip_quotes(t) or t.endswith(f".{rn}"):
                selected_set.add(rn)

    class_candidates = []
    data_property_candidates = []
    object_property_candidates = []
    pk_columns_by_table: dict[str, list[str]] = {}
    fk_columns_by_table: dict[str, set[str]] = {}

    # First pass: collect PK and FK columns per table
    for table_name in sorted(selected_set):
        rel = relations_by_name.get(table_name)
        if not rel:
            continue

        # Primary keys
        pks = []
        for uc in rel.get("uniqueConstraints", []):
            if uc.get("isPrimaryKey"):
                pks = [strip_quotes(c) for c in uc.get("determinants", [])]
        pk_columns_by_table[table_name] = pks

        # FK columns
        fk_cols = set()
        for fk in rel.get("foreignKeys", []):
            for c in fk.get("from", {}).get("columns", []):
                fk_cols.add(strip_quotes(c))
        fk_columns_by_table[table_name] = fk_cols

    # Second pass: generate candidates
    for table_name in sorted(selected_set):
        rel = relations_by_name.get(table_name)
        if not rel:
            continue

        # --- Class candidate ---
        class_name = _to_pascal_case(table_name)
        class_candidates.append({
            "table_name": table_name,
            "class_name": class_name,
            "class_iri": f"{base_iri}{class_name}",
            "label": table_name,
            "status": "accepted",
        })

        # --- Data property candidates ---
        columns = rel.get("columns", [])
        for col in columns:
            col_name = strip_quotes(col.get("name", ""))
            col_lower = col_name.lower()

            # Skip system columns (but keep them as "system" status)
            if col_lower in SYSTEM_COLUMNS:
                # Mark PK id columns
                if col_name in pk_columns_by_table.get(table_name, []):
                    data_property_candidates.append({
                        "table_name": table_name,
                        "column_name": col_name,
                        "property_name": "identifier",
                        "property_iri": f"{base_iri}{class_name}/identifier",
                        "datatype": _get_xsd_type(col.get("datatype", "")),
                        "is_nullable": col.get("isNullable", True),
                        "is_pk": True,
                        "is_fk": False,
                        "status": "accepted",
                    })
                else:
                    data_property_candidates.append({
                        "table_name": table_name,
                        "column_name": col_name,
                        "property_name": _to_camel_case(col_name),
                        "property_iri": f"{base_iri}{class_name}/{_to_camel_case(col_name)}",
                        "datatype": _get_xsd_type(col.get("datatype", "")),
                        "is_nullable": col.get("isNullable", True),
                        "is_pk": False,
                        "is_fk": False,
                        "status": "system",
                    })
                continue

            # Skip FK columns here — they become object properties
            if col_name in fk_columns_by_table.get(table_name, set()):
                continue

            # Skip PK columns — they become identifier
            if col_name in pk_columns_by_table.get(table_name, []):
                data_property_candidates.append({
                    "table_name": table_name,
                    "column_name": col_name,
                    "property_name": "identifier",
                    "property_iri": f"{base_iri}{class_name}/identifier",
                    "datatype": _get_xsd_type(col.get("datatype", "")),
                    "is_nullable": False,
                    "is_pk": True,
                    "is_fk": False,
                    "status": "accepted",
                })
                continue

            prop_name = _to_camel_case(col_name)
            is_label = any(kw in col_lower for kw in LABEL_KEYWORDS)

            data_property_candidates.append({
                "table_name": table_name,
                "column_name": col_name,
                "property_name": prop_name,
                "property_iri": f"{base_iri}{class_name}/{prop_name}",
                "datatype": _get_xsd_type(col.get("datatype", "")),
                "is_nullable": col.get("isNullable", True),
                "is_pk": False,
                "is_fk": False,
                "status": "accepted",
                "is_label": is_label,
            })

        # --- Object property candidates (from foreign keys) ---
        for fk in rel.get("foreignKeys", []):
            from_cols = [strip_quotes(c) for c in fk.get("from", {}).get("columns", [])]
            to_relation = fk.get("to", {}).get("relation", [])
            to_table = _get_local_name(to_relation) if to_relation else "unknown"
            to_cols = [strip_quotes(c) for c in fk.get("to", {}).get("columns", [])]

            # Only generate if target table is also selected
            if to_table not in selected_set:
                object_property_candidates.append({
                    "from_table": table_name,
                    "to_table": to_table,
                    "property_name": f"ref{_to_pascal_case(to_table)}",
                    "property_iri": f"{base_iri}ref{_to_pascal_case(to_table)}",
                    "fk_columns": from_cols,
                    "target_columns": to_cols,
                    "status": "external",
                })
                continue

            prop_name = f"has{_to_pascal_case(to_table)}"
            object_property_candidates.append({
                "from_table": table_name,
                "to_table": to_table,
                "property_name": prop_name,
                "property_iri": f"{base_iri}{prop_name}",
                "fk_columns": from_cols,
                "target_columns": to_cols,
                "status": "accepted",
            })

    return {
        "candidates": {
            "classes": class_candidates,
            "data_properties": data_property_candidates,
            "object_properties": object_property_candidates,
        }
    }
