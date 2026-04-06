import os
from pathlib import Path

# Project paths
PROJECT_ROOT = Path(__file__).resolve().parent
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

AI_CONFIG_FILE = DATA_DIR / "ai_config.json"  # kept for migration
DB_PATH = DATA_DIR / "ontop_ui.db"
ENCRYPTION_KEY_PATH = DATA_DIR / ".encryption_key"

# Ontop paths — support env override for Docker
# Monorepo layout: sibling dirs are ontop-output/, ontop-endpoint/, etc.
ONTOP_BASE = Path(os.environ.get("ONTOP_BASE", str(PROJECT_ROOT.parent / "ontop-output")))
ONTOP_CLI = Path(os.environ.get("ONTOP_CLI", str(PROJECT_ROOT.parent / "ontop-endpoint" / "ontop-cli" / "ontop")))
ONTOP_OUTPUT = Path(os.environ.get("ONTOP_OUTPUT", str(ONTOP_BASE)))

# Default Ontop endpoint config
ONTOLOGY_FILE = Path(os.environ.get("ONTOLOGY_FILE", str(ONTOP_OUTPUT / "retail_ontology.ttl")))
MAPPING_FILE = Path(os.environ.get("MAPPING_FILE", str(ONTOP_OUTPUT / "retail_mapping.obda")))
PROPERTIES_FILE = Path(os.environ.get("PROPERTIES_FILE", str(ONTOP_OUTPUT / "retail.properties")))

# Ontop endpoint
ONTOP_ENDPOINT_URL = os.environ.get("ONTOP_ENDPOINT_URL", "http://localhost:8080")
ONTOP_ENDPOINT_PORT = int(os.environ.get("ONTOP_ENDPOINT_PORT", "8080"))
ONTOP_ENDPOINT_ADMIN_URL = os.environ.get("ONTOP_ENDPOINT_ADMIN_URL", ONTOP_ENDPOINT_URL)
ONTOP_ENDPOINT_ACTIVE_DIR = Path(os.environ.get("ONTOP_ENDPOINT_ACTIVE_DIR", "/opt/ontop-endpoint/active"))
ONTOP_ENDPOINT_ACTIVE_ONTOLOGY_FILE = Path(
    os.environ.get("ONTOP_ENDPOINT_ACTIVE_ONTOLOGY_FILE", str(ONTOP_ENDPOINT_ACTIVE_DIR / "active_ontology.ttl"))
)
ONTOP_ENDPOINT_ACTIVE_MAPPING_FILE = Path(
    os.environ.get("ONTOP_ENDPOINT_ACTIVE_MAPPING_FILE", str(ONTOP_ENDPOINT_ACTIVE_DIR / "active_mapping.obda"))
)
ONTOP_ENDPOINT_ACTIVE_PROPERTIES_FILE = Path(
    os.environ.get("ONTOP_ENDPOINT_ACTIVE_PROPERTIES_FILE", str(ONTOP_ENDPOINT_ACTIVE_DIR / "active.properties"))
)
ONTOP_ENGINE_URL = os.environ.get("ONTOP_ENGINE_URL", "http://localhost:8081")

# FastAPI
FASTAPI_PORT = int(os.environ.get("FASTAPI_PORT", "8000"))

# LLM
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://localhost:1234/v1")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "lm-studio")
LLM_MODEL = os.environ.get("LLM_MODEL", "zai-org/glm-4.7-flash")
