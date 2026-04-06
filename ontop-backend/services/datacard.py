"""Data Card — auto-generated ontology metadata summary."""

import json
import logging
import os
from datetime import datetime, timezone

import httpx

from config import ONTOP_ENDPOINT_URL

logger = logging.getLogger(__name__)


def generate_datacard() -> dict:
    """Build an ontology metadata data card.

    Combines data from TTL/OBDA parsers and endpoint health check.
    """
    from services.active_endpoint_config import load_active_endpoint_config

    active = load_active_endpoint_config()
    ontology_path = active.get("ontology_path", "")
    mapping_path = active.get("mapping_path", "")

    card = {
        "schema_version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ontology": _get_ontology_info(ontology_path),
        "statistics": _get_statistics(ontology_path, mapping_path),
        "class_breakdown": _get_class_breakdown(mapping_path),
        "data_source": {
            "type": "obda_mapping",
            "mapping_path": mapping_path,
            "ontology_path": ontology_path,
        },
        "data_source_health": _check_endpoint_health(),
        "instance_estimates": {},
        "last_updated": _get_last_updated(ontology_path, mapping_path),
    }

    return card


def generate_datacard_turtle(card: dict) -> str:
    """Convert datacard dict to RDF/Turtle using DCAT vocabulary."""
    try:
        from rdflib import Graph, Literal, Namespace, URIRef
        from rdflib.namespace import DCTERMS, RDF, XSD

        DCAT = Namespace("http://www.w3.org/ns/dcat#")
        g = Graph()
        g.bind("dcat", DCAT)
        g.bind("dct", DCTERMS)

        ds = URIRef("http://example.com/ontop/datacard")
        g.add((ds, RDF.type, DCAT.Dataset))

        ont = card.get("ontology", {})
        if ont.get("title"):
            g.add((ds, DCTERMS.title, Literal(ont["title"])))
        if ont.get("version"):
            g.add((ds, DCTERMS.hasVersion, Literal(ont["version"])))

        stats = card.get("statistics", {})
        g.add((ds, DCTERMS.description, Literal(
            f"Classes: {stats.get('class_count', 0)}, "
            f"Data Properties: {stats.get('data_property_count', 0)}, "
            f"Object Properties: {stats.get('object_property_count', 0)}, "
            f"Mapping Rules: {stats.get('mapping_rule_count', 0)}"
        )))

        if card.get("generated_at"):
            g.add((ds, DCTERMS.modified, Literal(card["generated_at"])))

        return g.serialize(format="turtle")
    except Exception as e:
        logger.warning("Failed to generate Turtle datacard: %s", e)
        return f"# Failed to generate RDF: {e}"


def _get_ontology_info(ontology_path: str) -> dict:
    """Extract ontology metadata from TTL file."""
    if not ontology_path or not os.path.exists(ontology_path):
        return {"title": "", "version": "", "iri": ""}

    try:
        from services.ttl_parser import parse_ttl
        content = open(ontology_path, "r", encoding="utf-8").read()
        parsed = parse_ttl(content)
        meta = parsed.metadata if hasattr(parsed, "metadata") else {}
        labels = meta.labels if hasattr(meta, "labels") else {}
        return {
            "title": labels.get("zh") or labels.get("en") or "",
            "version": meta.get("version", "") if isinstance(meta, dict) else getattr(meta, "version", ""),
            "iri": meta.get("version_iri", "") if isinstance(meta, dict) else getattr(meta, "version_iri", ""),
        }
    except Exception:
        return {"title": "", "version": "", "iri": ""}


def _get_statistics(ontology_path: str, mapping_path: str) -> dict:
    """Count classes, properties, mapping rules."""
    stats = {
        "class_count": 0,
        "data_property_count": 0,
        "object_property_count": 0,
        "shacl_constraint_count": 0,
        "mapping_rule_count": 0,
    }

    # Parse TTL for class/property counts
    if ontology_path and os.path.exists(ontology_path):
        try:
            from services.ttl_parser import parse_ttl
            content = open(ontology_path, "r", encoding="utf-8").read()
            parsed = parse_ttl(content)
            stats["class_count"] = len(parsed.classes) if hasattr(parsed, "classes") else 0
            stats["data_property_count"] = len(parsed.data_properties) if hasattr(parsed, "data_properties") else 0
            stats["object_property_count"] = len(parsed.object_properties) if hasattr(parsed, "object_properties") else 0
            stats["shacl_constraint_count"] = len(parsed.shacl_constraints) if hasattr(parsed, "shacl_constraints") else 0
        except Exception:
            pass

    # Parse OBDA for mapping rule count
    if mapping_path and os.path.exists(mapping_path):
        try:
            from services.obda_parser import parse_obda
            content = open(mapping_path, "r", encoding="utf-8").read()
            parsed = parse_obda(content)
            stats["mapping_rule_count"] = len(parsed.mappings) if hasattr(parsed, "mappings") else 0
        except Exception:
            pass

    return stats


def _get_class_breakdown(mapping_path: str) -> list[dict]:
    """Get per-class property counts from OBDA mappings."""
    from services.publishing_generator import get_ontology_classes_summary
    try:
        return get_ontology_classes_summary()
    except Exception:
        return []


def _check_endpoint_health() -> dict:
    """Check if Ontop SPARQL endpoint is reachable."""
    try:
        import asyncio
        async def _check():
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{ONTOP_ENDPOINT_URL}/sparql",
                    params={"query": "ASK { ?s ?p ?o }"},
                )
                return resp.status_code == 200

        reachable = asyncio.get_event_loop().run_until_complete(_check())
        return {"endpoint_reachable": reachable, "endpoint_url": f"{ONTOP_ENDPOINT_URL}/sparql"}
    except Exception:
        return {"endpoint_reachable": False, "endpoint_url": f"{ONTOP_ENDPOINT_URL}/sparql"}


def _get_last_updated(ontology_path: str, mapping_path: str) -> str:
    """Get the most recent file modification time."""
    latest = 0.0
    for p in (ontology_path, mapping_path):
        if p and os.path.exists(p):
            latest = max(latest, os.path.getmtime(p))
    if latest > 0:
        return datetime.fromtimestamp(latest, tz=timezone.utc).isoformat()
    return ""
