"""HTTP client for the native Java Ontop builder service.

All calls go through the unified ApiEnvelope:
  { "success": bool, "message": str, "requestId": str, "durationMs": int, "data": ... }
"""
import logging
from pathlib import Path

import httpx

from config import ONTOP_ENGINE_URL

logger = logging.getLogger(__name__)


def _read_properties(properties_path: str) -> dict[str, str]:
    props: dict[str, str] = {}
    for line in Path(properties_path).read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        props[key.strip()] = value.strip()
    return props


def _jdbc_payload(properties_path: str) -> dict[str, str]:
    props = _read_properties(properties_path)
    return {
        "jdbcUrl": props.get("jdbc.url", ""),
        "user": props.get("jdbc.user", ""),
        "password": props.get("jdbc.password", ""),
        "driver": props.get("jdbc.driver", ""),
    }


def _parse_envelope(resp: httpx.Response) -> dict:
    """Parse the unified ApiEnvelope and log requestId."""
    body = resp.json()
    rid = body.get("requestId", "?")
    if not body.get("success", False):
        msg = body.get("message", "Unknown error")
        logger.warning("[%s] Ontop engine error: %s", rid, msg)
    return body


# ── Health / Version ────────────────────────────────────


async def health() -> dict:
    """GET /health — check engine liveness."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{ONTOP_ENGINE_URL}/health")
        resp.raise_for_status()
        return resp.json()


async def version() -> dict:
    """GET /version — engine version info."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{ONTOP_ENGINE_URL}/version")
        resp.raise_for_status()
        return resp.json()


# ── Core APIs ───────────────────────────────────────────


async def extract_db_metadata(properties_path: str) -> tuple[bool, str]:
    payload = {"jdbc": _jdbc_payload(properties_path)}
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(f"{ONTOP_ENGINE_URL}/api/ontop/extract-metadata", json=payload)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            err_body = exc.response.json() if exc.response.text else {}
            return False, err_body.get("message", str(exc))
        except Exception as exc:
            return False, str(exc)

    body = _parse_envelope(resp)
    data = body.get("data", body)
    return body.get("success", False), data.get("metadataJson") or data.get("message", "")


async def bootstrap(
    base_iri: str,
    ontology_path: str,
    mapping_path: str,
    properties_path: str,
) -> tuple[bool, str]:
    payload = {
        "baseIri": base_iri,
        "jdbc": _jdbc_payload(properties_path),
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(f"{ONTOP_ENGINE_URL}/api/ontop/bootstrap", json=payload)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            err_body = exc.response.json() if exc.response.text else {}
            return False, err_body.get("message", str(exc))
        except Exception as exc:
            return False, str(exc)

    body = _parse_envelope(resp)
    data = body.get("data", body)
    if not body.get("success", False):
        return False, body.get("message", "Bootstrap failed")

    Path(ontology_path).write_text(data.get("ontology", ""), encoding="utf-8")
    Path(mapping_path).write_text(data.get("mapping", ""), encoding="utf-8")
    return True, body.get("message", "Bootstrap completed")


async def validate(
    mapping_path: str,
    ontology_path: str | None = None,
    properties_path: str | None = None,
) -> tuple[bool, str]:
    if not ontology_path:
        return False, "Validation requires an ontology file"
    if not properties_path:
        return False, "Validation requires a properties file"

    payload = {
        "mappingContent": Path(mapping_path).read_text(encoding="utf-8"),
        "ontologyContent": Path(ontology_path).read_text(encoding="utf-8"),
        "jdbc": _jdbc_payload(properties_path),
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(f"{ONTOP_ENGINE_URL}/api/ontop/validate", json=payload)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            err_body = exc.response.json() if exc.response.text else {}
            return False, err_body.get("message", str(exc))
        except Exception as exc:
            return False, str(exc)

    body = _parse_envelope(resp)
    return body.get("success", False), body.get("message", "")


async def materialize(
    mapping_path: str,
    output_path: str,
    ontology_path: str | None = None,
    properties_path: str | None = None,
    fmt: str = "turtle",
    sparql_query: str | None = None,
) -> tuple[bool, str]:
    """Materialize virtual triples from OBDA mappings.

    Args:
        mapping_path:  Path to .obda mapping file.
        output_path:   Path to write the RDF output.
        ontology_path: Path to .ttl ontology file.
        properties_path: Path to JDBC .properties file.
        fmt:           Output format ("turtle" or "ntriples").
        sparql_query:  Optional SPARQL CONSTRUCT query for scoped materialization.

    Returns:
        (success, message)
    """
    if not mapping_path or not ontology_path or not properties_path:
        return False, "Materialize requires mapping, ontology, and properties files"

    payload = {
        "mappingContent": Path(mapping_path).read_text(encoding="utf-8"),
        "ontologyContent": Path(ontology_path).read_text(encoding="utf-8"),
        "jdbc": _jdbc_payload(properties_path),
        "format": fmt,
    }
    if sparql_query:
        payload["sparqlQuery"] = sparql_query

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            resp = await client.post(f"{ONTOP_ENGINE_URL}/api/ontop/materialize", json=payload)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            err_body = exc.response.json() if exc.response.text else {}
            return False, err_body.get("message", str(exc))
        except Exception as exc:
            return False, str(exc)

    body = _parse_envelope(resp)
    if not body.get("success", False):
        return False, body.get("message", "Materialize failed")

    data = body.get("data", {})
    rdf_output = data.get("output", "")
    if rdf_output:
        Path(output_path).write_text(rdf_output, encoding="utf-8")

    triple_count = data.get("tripleCount", 0)
    msg = f"Materialize completed: {triple_count} triple maps, written to {output_path}"
    return True, msg
