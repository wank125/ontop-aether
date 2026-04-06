"""AI config repository — key-value store with encryption for sensitive fields."""

import json
from database import get_connection, encrypt_value, decrypt_value

# Keys whose values should be encrypted in the database
SENSITIVE_KEYS = {"llm_api_key"}


def load_config() -> dict:
    """Load all AI config as a flat dict. Decrypts sensitive values."""
    conn = get_connection()
    rows = conn.execute("SELECT key, value, is_encrypted FROM ai_config").fetchall()
    config = {}
    for r in rows:
        val = r["value"]
        if r["is_encrypted"]:
            try:
                val = decrypt_value(val)
            except Exception:
                pass  # return raw value if decryption fails
        config[r["key"]] = val
    return config


def save_config(config: dict):
    """Save (upsert) config dict. Encrypts sensitive keys."""
    conn = get_connection()
    for k, v in config.items():
        if isinstance(v, (dict, list)):
            v = __import__("json").dumps(v, ensure_ascii=False)
        else:
            v = str(v)
        is_enc = 1 if k in SENSITIVE_KEYS else 0
        if is_enc:
            v = encrypt_value(v)
        conn.execute(
            """INSERT INTO ai_config (key, value, is_encrypted)
               VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value=excluded.value, is_encrypted=excluded.is_encrypted""",
            (k, v, is_enc),
        )
    conn.commit()


def get_value(key: str) -> str | None:
    """Get a single config value (decrypted if sensitive)."""
    conn = get_connection()
    row = conn.execute("SELECT value, is_encrypted FROM ai_config WHERE key = ?", (key,)).fetchone()
    if not row:
        return None
    val = row["value"]
    if row["is_encrypted"]:
        try:
            val = decrypt_value(val)
        except Exception:
            pass
    return val


def set_value(key: str, value: str):
    """Set a single config value."""
    is_enc = 1 if key in SENSITIVE_KEYS else 0
    if is_enc:
        value = encrypt_value(value)
    conn = get_connection()
    conn.execute(
        """INSERT INTO ai_config (key, value, is_encrypted)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value, is_encrypted=excluded.is_encrypted""",
        (key, value, is_enc),
    )
    conn.commit()
