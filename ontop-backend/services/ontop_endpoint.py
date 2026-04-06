"""Manage the external Ontop SPARQL endpoint service."""
import asyncio
from pathlib import Path

import httpx

from config import (
    ONTOP_ENDPOINT_ACTIVE_MAPPING_FILE,
    ONTOP_ENDPOINT_ACTIVE_ONTOLOGY_FILE,
    ONTOP_ENDPOINT_ACTIVE_PROPERTIES_FILE,
    ONTOP_ENDPOINT_ADMIN_URL,
    ONTOP_ENDPOINT_PORT,
    ONTOP_ENDPOINT_URL,
)
from services.active_endpoint_config import load_active_endpoint_config, save_active_endpoint_config


def _copy_active_file(source: str, target: Path):
    src = Path(source)
    if not src.exists():
        raise FileNotFoundError(f"File not found: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")


async def _restart_remote_endpoint() -> tuple[bool, str]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(f"{ONTOP_ENDPOINT_ADMIN_URL}/ontop/restart")
            if resp.status_code not in {200, 204}:
                return False, resp.text[:500]
        except httpx.ConnectError:
            pass

    async with httpx.AsyncClient(timeout=3.0) as client:
        for _ in range(20):
            try:
                resp = await client.get(f"{ONTOP_ENDPOINT_URL}/sparql", params={"query": "ASK { ?s ?p ?o }"})
                if resp.status_code == 200:
                    return True, "Endpoint restarted"
            except Exception:
                pass
            await asyncio.sleep(1)
        return False, "Timeout waiting for endpoint restart"


async def start_endpoint(
    ontology_path: str = None,
    mapping_path: str = None,
    properties_path: str = None,
    port: int = ONTOP_ENDPOINT_PORT,
    dev: bool = True,
    enable_download_ontology: bool = True,
) -> tuple[bool, str]:
    del dev, enable_download_ontology

    if port != ONTOP_ENDPOINT_PORT:
        return False, f"Dedicated endpoint port is fixed at {ONTOP_ENDPOINT_PORT}"

    active_config = load_active_endpoint_config()
    ontology_path = ontology_path or active_config["ontology_path"]
    mapping_path = mapping_path or active_config["mapping_path"]
    properties_path = properties_path or active_config["properties_path"]

    try:
        _copy_active_file(ontology_path, ONTOP_ENDPOINT_ACTIVE_ONTOLOGY_FILE)
        _copy_active_file(mapping_path, ONTOP_ENDPOINT_ACTIVE_MAPPING_FILE)
        _copy_active_file(properties_path, ONTOP_ENDPOINT_ACTIVE_PROPERTIES_FILE)
    except Exception as exc:
        return False, str(exc)

    save_active_endpoint_config(
        {
            "ontology_path": ontology_path,
            "mapping_path": mapping_path,
            "properties_path": properties_path,
            "port": port,
        }
    )
    return await _restart_remote_endpoint()


async def stop_endpoint():
    """The endpoint now runs as an external service and is not stopped by the backend."""
    return None


async def get_endpoint_status() -> dict:
    """Check if the external Ontop endpoint is alive."""
    active_config = load_active_endpoint_config()
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{ONTOP_ENDPOINT_URL}/sparql", params={"query": "ASK { ?s ?p ?o }"})
            return {
                "running": resp.status_code == 200,
                "port": ONTOP_ENDPOINT_PORT,
                "ontology_path": active_config["ontology_path"],
                "mapping_path": active_config["mapping_path"],
                "properties_path": active_config["properties_path"],
            }
    except Exception:
        return {
            "running": False,
            "port": ONTOP_ENDPOINT_PORT,
            "ontology_path": active_config["ontology_path"],
            "mapping_path": active_config["mapping_path"],
            "properties_path": active_config["properties_path"],
        }


def get_endpoint_process():
    return None
