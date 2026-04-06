"""Publishing config repository — singleton config with encryption."""

import json
import logging
from datetime import datetime, timezone

from database import get_connection, encrypt_value, decrypt_value

logger = logging.getLogger(__name__)

# Keys stored as encrypted in the api_key column
_SENSITIVE_KEY = "api_key"


def _row_to_config(row) -> dict:
    """Convert a DB row to a config dict, decrypting api_key."""
    d = dict(row)
    if d.get("api_key") and d.get("api_key_encrypted"):
        try:
            d["api_key"] = decrypt_value(d["api_key"])
        except Exception:
            pass
    # Parse JSON fields
    for field in ("mcp_selected_tools", "skills_selected_formats"):
        raw = d.get(field, "[]")
        if isinstance(raw, str):
            try:
                d[field] = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                d[field] = []
    # Convert sqlite integers to booleans
    for field in ("api_enabled", "mcp_enabled", "skills_enabled", "api_key_encrypted"):
        if field in d:
            d[field] = bool(d[field])
    return d


def load_publishing_config() -> dict:
    """Load the singleton publishing config, creating defaults if needed."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM publishing_config WHERE id = 'default'").fetchone()
    if not row:
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO publishing_config (id, created_at) VALUES ('default', ?)",
            (now,),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM publishing_config WHERE id = 'default'").fetchone()
    return _row_to_config(row)


def update_publishing_config(updates: dict) -> dict:
    """Update the singleton config. Encrypts api_key if changed."""
    # Ensure row exists
    load_publishing_config()

    fields = []
    values = []
    for k, v in updates.items():
        if k in ("id", "created_at", "api_key_encrypted"):
            continue
        if v is None:
            continue
        if k == "api_key":
            fields.append("api_key = ?")
            values.append(encrypt_value(v))
            fields.append("api_key_encrypted = ?")
            values.append(1)
        elif k in ("mcp_selected_tools", "skills_selected_formats"):
            fields.append(f"{k} = ?")
            values.append(json.dumps(v, ensure_ascii=False))
        elif isinstance(v, bool):
            fields.append(f"{k} = ?")
            values.append(int(v))
        else:
            fields.append(f"{k} = ?")
            values.append(v)

    if fields:
        fields.append("updated_at = ?")
        values.append(datetime.now(timezone.utc).isoformat())
        values.append("default")
        conn = get_connection()
        conn.execute(
            f"UPDATE publishing_config SET {', '.join(fields)} WHERE id = ?",
            values,
        )
        conn.commit()
    return load_publishing_config()
