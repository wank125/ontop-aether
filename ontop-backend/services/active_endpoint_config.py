"""Persist the currently active Ontop endpoint file paths."""

import json
from pathlib import Path

from config import DATA_DIR, ONTOLOGY_FILE, MAPPING_FILE, PROPERTIES_FILE, ONTOP_ENDPOINT_PORT

ACTIVE_ENDPOINT_FILE = DATA_DIR / "active_endpoint.json"


def get_default_endpoint_config() -> dict:
    return {
        "ontology_path": str(ONTOLOGY_FILE),
        "mapping_path": str(MAPPING_FILE),
        "properties_path": str(PROPERTIES_FILE),
        "port": ONTOP_ENDPOINT_PORT,
    }


def load_active_endpoint_config() -> dict:
    if not ACTIVE_ENDPOINT_FILE.exists():
        config = get_default_endpoint_config()
        save_active_endpoint_config(config)
        return config

    try:
        data = json.loads(ACTIVE_ENDPOINT_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        data = {}

    config = get_default_endpoint_config()
    config.update({k: v for k, v in data.items() if v})
    return config


def save_active_endpoint_config(config: dict):
    merged = get_default_endpoint_config()
    merged.update(config)
    ACTIVE_ENDPOINT_FILE.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")

