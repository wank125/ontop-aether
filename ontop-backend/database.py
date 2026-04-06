"""SQLite database management — connection pool, schema, encryption, JSON migration."""
import json
import logging
import os
import sqlite3
import threading
from pathlib import Path
from typing import Optional

from cryptography.fernet import Fernet

from config import DB_PATH, ENCRYPTION_KEY_PATH, DATA_DIR, AI_CONFIG_FILE

logger = logging.getLogger(__name__)

# ── Thread-local connection ──────────────────────────────
_local = threading.local()


def get_connection() -> sqlite3.Connection:
    """Return a thread-local SQLite connection with WAL mode."""
    conn = getattr(_local, "conn", None)
    if conn is not None:
        try:
            conn.execute("SELECT 1")
            return conn
        except sqlite3.Error:
            conn.close()

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    _local.conn = conn
    return conn


# ── Encryption helpers ────────────────────────────────────

def _get_or_create_key() -> bytes:
    """Load or auto-generate a Fernet encryption key."""
    # Check env var first (for Docker secrets)
    env_key = os.environ.get("ENCRYPTION_KEY")
    if env_key:
        return env_key.encode()

    if ENCRYPTION_KEY_PATH.exists():
        return ENCRYPTION_KEY_PATH.read_bytes().strip()

    key = Fernet.generate_key()
    ENCRYPTION_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    ENCRYPTION_KEY_PATH.write_bytes(key)
    # Restrict permissions
    try:
        ENCRYPTION_KEY_PATH.chmod(0o600)
    except OSError:
        pass
    logger.info("Generated new encryption key at %s", ENCRYPTION_KEY_PATH)
    return key


_fernet: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_get_or_create_key())
    return _fernet


def encrypt_value(plaintext: str) -> str:
    """Encrypt a string value, return base64-encoded token."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(token: str) -> str:
    """Decrypt a base64-encoded Fernet token back to plaintext."""
    return _get_fernet().decrypt(token.encode()).decode()


# ── Schema initialization ────────────────────────────────

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS datasources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    jdbc_url TEXT NOT NULL,
    user TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,
    driver TEXT NOT NULL DEFAULT 'org.postgresql.Driver',
    created_at TEXT NOT NULL,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    is_encrypted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS query_history (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    result_count INTEGER
);

CREATE INDEX IF NOT EXISTS idx_history_ts ON query_history(timestamp DESC);

CREATE TABLE IF NOT EXISTS publishing_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    api_enabled INTEGER NOT NULL DEFAULT 1,
    api_key TEXT NOT NULL DEFAULT '',
    api_key_encrypted INTEGER NOT NULL DEFAULT 0,
    cors_origins TEXT NOT NULL DEFAULT '*',
    mcp_enabled INTEGER NOT NULL DEFAULT 0,
    mcp_port INTEGER NOT NULL DEFAULT 9000,
    mcp_selected_tools TEXT NOT NULL DEFAULT '[]',
    skills_enabled INTEGER NOT NULL DEFAULT 1,
    skills_selected_formats TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT
);

-- 语义注释层：与 TTL 文件解耦的独立标注存储
-- LLM 自动生成（status=pending）+ 人工审核（accepted/rejected）
-- Bootstrap 重跑时 pending 的被替换，accepted/rejected 的永久保留
CREATE TABLE IF NOT EXISTS semantic_annotations (
    id          TEXT PRIMARY KEY,
    ds_id       TEXT NOT NULL,
    entity_uri  TEXT NOT NULL,
    entity_kind TEXT NOT NULL,        -- 'class' | 'data_property' | 'object_property'
    lang        TEXT NOT NULL DEFAULT 'zh',
    label       TEXT NOT NULL DEFAULT '',
    comment     TEXT NOT NULL DEFAULT '',
    source      TEXT NOT NULL DEFAULT 'llm',     -- 'llm' | 'human'
    status      TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'rejected'
    created_at  TEXT NOT NULL,
    updated_at  TEXT,
    UNIQUE(ds_id, entity_uri, lang)
);

CREATE INDEX IF NOT EXISTS idx_ann_ds     ON semantic_annotations(ds_id, status);
CREATE INDEX IF NOT EXISTS idx_ann_entity ON semantic_annotations(ds_id, entity_uri);

-- 业务词汇表：显式的业务词 → 本体属性/类 映射，注入 SPARQL 生成 Prompt
-- ds_id='' 表示全局词汇，查询时合并当前数据源词汇 + 全局词汇
CREATE TABLE IF NOT EXISTS business_glossary (
    id                  TEXT PRIMARY KEY,
    ds_id               TEXT NOT NULL DEFAULT '',   -- '' = 全局
    term                TEXT NOT NULL,              -- 主业务词汇（如"欠款"）
    aliases             TEXT NOT NULL DEFAULT '[]', -- JSON 数组，别名
    entity_uri          TEXT NOT NULL,              -- 本体 local name（如 "bill#balance_overdue"）
    entity_kind         TEXT NOT NULL DEFAULT 'data_property',
    description         TEXT NOT NULL DEFAULT '',
    example_questions   TEXT NOT NULL DEFAULT '[]', -- JSON 数组，示例问法
    source              TEXT NOT NULL DEFAULT 'human', -- 'human' | 'llm'
    created_at          TEXT NOT NULL,
    updated_at          TEXT,
    UNIQUE(ds_id, term)
);

CREATE INDEX IF NOT EXISTS idx_glossary_ds   ON business_glossary(ds_id);
CREATE INDEX IF NOT EXISTS idx_glossary_term ON business_glossary(term);

-- 端点注册表：记录每个数据源 Bootstrap 产物的存储位置和激活状态
-- is_current=1 表示当前激活（唯一），切换时更新
CREATE TABLE IF NOT EXISTS endpoint_registry (
    id              TEXT PRIMARY KEY,
    ds_id           TEXT NOT NULL UNIQUE,
    ds_name         TEXT NOT NULL,
    active_dir      TEXT NOT NULL,        -- 该数据源的 active 文件目录（绝对路径）
    ontology_path   TEXT NOT NULL DEFAULT '',
    mapping_path    TEXT NOT NULL DEFAULT '',
    properties_path TEXT NOT NULL DEFAULT '',
    endpoint_url    TEXT NOT NULL DEFAULT '',   -- 空表示使用系统默认端点
    last_bootstrap  TEXT,                 -- 最近一次 Bootstrap 时间戳
    is_current      INTEGER NOT NULL DEFAULT 0, -- 只有一行为 1
    created_at      TEXT NOT NULL,
    updated_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_endpoint_current ON endpoint_registry(is_current);

-- 本体精化建议：LLM 分析本体结构后给出的命名/类型/层次改进建议
CREATE TABLE IF NOT EXISTS ontology_suggestions (
    id            TEXT PRIMARY KEY,
    ds_id         TEXT NOT NULL,
    type          TEXT NOT NULL,               -- RENAME_CLASS / RENAME_PROPERTY / ADD_SUBCLASS / REFINE_TYPE / ADD_LABEL
    current_val   TEXT NOT NULL,               -- 当前值（类名 / 属性名 / XSD 类型）
    proposed_val  TEXT NOT NULL,               -- 建议值
    reason        TEXT NOT NULL DEFAULT '',    -- LLM 给出的理由
    priority      TEXT NOT NULL DEFAULT 'medium',   -- high / medium / low
    auto_apply    INTEGER NOT NULL DEFAULT 0,  -- 1=可自动应用到 TTL
    status        TEXT NOT NULL DEFAULT 'pending',  -- pending / accepted / rejected / applied
    created_at    TEXT NOT NULL,
    updated_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_sug_ds     ON ontology_suggestions(ds_id, status);
CREATE INDEX IF NOT EXISTS idx_sug_type   ON ontology_suggestions(ds_id, type);

"""


def init_db():
    """Create tables if they don't exist."""
    conn = get_connection()
    conn.executescript(_SCHEMA_SQL)
    conn.commit()

    # ── Schema migrations (idempotent) ───────────────────
    _migrations = [
        "ALTER TABLE query_history ADD COLUMN source_ip TEXT DEFAULT ''",
        "ALTER TABLE query_history ADD COLUMN caller TEXT DEFAULT 'web'",
        "ALTER TABLE query_history ADD COLUMN duration_ms REAL",
        "ALTER TABLE query_history ADD COLUMN status TEXT DEFAULT 'ok'",
        "ALTER TABLE query_history ADD COLUMN error_message TEXT DEFAULT ''",
    ]
    for sql in _migrations:
        try:
            conn.execute(sql)
        except sqlite3.OperationalError:
            pass  # column already exists
    conn.execute("CREATE INDEX IF NOT EXISTS idx_history_caller ON query_history(caller)")
    conn.commit()

    logger.info("Database initialized at %s", DB_PATH)


# ── JSON → SQLite migration ──────────────────────────────

def migrate_json_to_sqlite():
    """One-time migration from JSON files to SQLite.

    Detects existing JSON files and imports them if the corresponding
    DB tables are empty.  On success the JSON file is renamed to *.migrated.
    """
    conn = get_connection()

    # ── Datasources ──
    ds_file = DATA_DIR / "datasources.json"
    if ds_file.exists():
        count = conn.execute("SELECT COUNT(*) FROM datasources").fetchone()[0]
        if count == 0:
            try:
                sources = json.loads(ds_file.read_text(encoding="utf-8"))
                for s in sources:
                    conn.execute(
                        """INSERT OR IGNORE INTO datasources
                           (id, name, jdbc_url, user, password_encrypted, driver, created_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        (
                            s["id"],
                            s["name"],
                            s["jdbc_url"],
                            s["user"],
                            encrypt_value(s["password"]),
                            s.get("driver", "org.postgresql.Driver"),
                            s.get("created_at", ""),
                        ),
                    )
                conn.commit()
                ds_file.rename(ds_file.with_suffix(".json.migrated"))
                logger.info("Migrated %d datasources from JSON → SQLite", len(sources))
            except Exception as e:
                logger.warning("Failed to migrate datasources.json: %s", e)

    # ── AI Config ──
    ai_file = AI_CONFIG_FILE
    if ai_file.exists():
        count = conn.execute("SELECT COUNT(*) FROM ai_config").fetchone()[0]
        if count == 0:
            try:
                config = json.loads(ai_file.read_text(encoding="utf-8"))
                sensitive_keys = {"llm_api_key"}
                for k, v in config.items():
                    if isinstance(v, (dict, list)):
                        v = json.dumps(v, ensure_ascii=False)
                    else:
                        v = str(v)
                    is_enc = 1 if k in sensitive_keys else 0
                    if is_enc:
                        v = encrypt_value(v)
                    conn.execute(
                        "INSERT OR IGNORE INTO ai_config (key, value, is_encrypted) VALUES (?, ?, ?)",
                        (k, v, is_enc),
                    )
                conn.commit()
                ai_file.rename(ai_file.with_suffix(".json.migrated"))
                logger.info("Migrated AI config from JSON → SQLite")
            except Exception as e:
                logger.warning("Failed to migrate ai_config.json: %s", e)

    # ── Query History ──
    hist_file = DATA_DIR / "query_history.json"
    if hist_file.exists():
        count = conn.execute("SELECT COUNT(*) FROM query_history").fetchone()[0]
        if count == 0:
            try:
                history = json.loads(hist_file.read_text(encoding="utf-8"))
                for h in history:
                    conn.execute(
                        "INSERT OR IGNORE INTO query_history (id, query, timestamp, result_count) VALUES (?, ?, ?, ?)",
                        (
                            h.get("id", ""),
                            h.get("query", ""),
                            h.get("timestamp", ""),
                            h.get("result_count"),
                        ),
                    )
                conn.commit()
                hist_file.rename(hist_file.with_suffix(".json.migrated"))
                logger.info("Migrated %d query history entries from JSON → SQLite", len(history))
            except Exception as e:
                logger.warning("Failed to migrate query_history.json: %s", e)
