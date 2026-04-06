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

-- 用户表：支持多用户登录
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt          TEXT NOT NULL,
    display_name  TEXT NOT NULL DEFAULT '',
    email         TEXT NOT NULL DEFAULT '',
    role          TEXT NOT NULL DEFAULT 'admin',
    created_at    TEXT NOT NULL,
    updated_at    TEXT
);

-- 会话表：token-based session
CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_user ON sessions(user_id);

-- ══════════════════════════════════════════════════════════
-- P1-A 治理基础表
-- ══════════════════════════════════════════════════════════

-- 租户：企业级隔离边界
CREATE TABLE IF NOT EXISTS tenants (
    id          TEXT PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    created_at  TEXT NOT NULL,
    updated_at  TEXT
);

-- 项目：语义资产管理边界
CREATE TABLE IF NOT EXISTS projects (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL,
    code          TEXT NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    owner_user_id TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TEXT NOT NULL,
    updated_at    TEXT,
    UNIQUE(tenant_id, code),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- 环境：固定 dev / test / prod
CREATE TABLE IF NOT EXISTS environments (
    id                  TEXT PRIMARY KEY,
    project_id          TEXT NOT NULL,
    name                TEXT NOT NULL,
    display_name        TEXT NOT NULL DEFAULT '',
    endpoint_url        TEXT NOT NULL DEFAULT '',
    active_registry_id  TEXT NOT NULL DEFAULT '',
    settings_json       TEXT NOT NULL DEFAULT '{}',
    created_at          TEXT NOT NULL,
    updated_at          TEXT,
    UNIQUE(project_id, name),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- 角色
CREATE TABLE IF NOT EXISTS roles (
    id          TEXT PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    scope_type  TEXT NOT NULL,
    is_system   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL
);

-- 权限
CREATE TABLE IF NOT EXISTS permissions (
    id            TEXT PRIMARY KEY,
    code          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    action        TEXT NOT NULL
);

-- 角色-权限关联
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id),
    FOREIGN KEY (permission_id) REFERENCES permissions(id)
);

-- 角色绑定：用户在特定范围内被授予的角色
CREATE TABLE IF NOT EXISTS role_bindings (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    role_id        TEXT NOT NULL,
    tenant_id      TEXT NOT NULL DEFAULT '',
    project_id     TEXT NOT NULL DEFAULT '',
    environment_id TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL,
    created_by     TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE INDEX IF NOT EXISTS idx_rb_user ON role_bindings(user_id);

-- API 凭据：独立机器身份
CREATE TABLE IF NOT EXISTS api_credentials (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL DEFAULT '',
    project_id          TEXT NOT NULL DEFAULT '',
    environment_id      TEXT NOT NULL DEFAULT '',
    name                TEXT NOT NULL,
    type                TEXT NOT NULL DEFAULT 'human',
    key_prefix          TEXT NOT NULL DEFAULT '',
    secret_hash         TEXT NOT NULL,
    secret_encrypted    TEXT NOT NULL DEFAULT '',
    created_by_user_id  TEXT NOT NULL DEFAULT '',
    expires_at          TEXT,
    last_used_at        TEXT,
    status              TEXT NOT NULL DEFAULT 'active',
    allowed_scopes_json TEXT NOT NULL DEFAULT '[]',
    allowed_ips_json    TEXT NOT NULL DEFAULT '[]',
    created_at          TEXT NOT NULL,
    updated_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_cred_prefix ON api_credentials(key_prefix, status);

-- 统一审计事件
CREATE TABLE IF NOT EXISTS audit_events (
    id                      TEXT PRIMARY KEY,
    tenant_id               TEXT NOT NULL DEFAULT '',
    project_id              TEXT NOT NULL DEFAULT '',
    environment_id          TEXT NOT NULL DEFAULT '',
    event_type              TEXT NOT NULL DEFAULT '',
    event_category          TEXT NOT NULL DEFAULT '',
    actor_type              TEXT NOT NULL DEFAULT 'system',
    actor_user_id           TEXT NOT NULL DEFAULT '',
    actor_api_credential_id TEXT NOT NULL DEFAULT '',
    actor_display           TEXT NOT NULL DEFAULT '',
    request_id              TEXT NOT NULL DEFAULT '',
    session_id              TEXT NOT NULL DEFAULT '',
    source_ip               TEXT NOT NULL DEFAULT '',
    user_agent              TEXT NOT NULL DEFAULT '',
    resource_type           TEXT NOT NULL DEFAULT '',
    resource_id             TEXT NOT NULL DEFAULT '',
    resource_name           TEXT NOT NULL DEFAULT '',
    action                  TEXT NOT NULL DEFAULT '',
    status                  TEXT NOT NULL DEFAULT 'success',
    duration_ms             REAL,
    error_code              TEXT NOT NULL DEFAULT '',
    error_message           TEXT NOT NULL DEFAULT '',
    metadata_json           TEXT NOT NULL DEFAULT '{}',
    created_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant  ON audit_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_type    ON audit_events(event_type, created_at DESC);

-- LLM 异步任务进度追踪
CREATE TABLE IF NOT EXISTS task_progress (
    id          TEXT PRIMARY KEY,
    task_type   TEXT NOT NULL,
    ds_id       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'running',
    progress    REAL NOT NULL DEFAULT 0.0,
    current     INTEGER NOT NULL DEFAULT 0,
    total       INTEGER NOT NULL DEFAULT 0,
    message     TEXT NOT NULL DEFAULT '',
    result      TEXT NOT NULL DEFAULT '',
    error       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_type_ds  ON task_progress(task_type, ds_id);
CREATE INDEX IF NOT EXISTS idx_task_status   ON task_progress(status);

"""


def _hash_password(password: str, salt: str) -> str:
    """SHA-256 password hashing with salt."""
    import hashlib
    return hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()


def _seed_admin_user(conn):
    """Create default admin user if no users exist."""
    count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if count > 0:
        return
    import secrets
    from datetime import datetime, timezone
    salt = secrets.token_hex(16)
    conn.execute(
        """INSERT INTO users (id, username, password_hash, salt, display_name, email, role, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            secrets.token_hex(8),
            "admin",
            _hash_password("admin123", salt),
            salt,
            "管理员",
            "admin@tianzhi.local",
            "admin",
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    conn.commit()
    logger.info("Seeded default admin user (admin/admin123)")


# ── P1-A 治理种子数据 ──────────────────────────────────────

def _seed_governance_defaults(conn):
    """Seed default tenant, project, environments, roles, permissions."""
    import secrets as _sec
    from datetime import datetime as _dt, timezone as _tz
    now = _dt.now(_tz.utc).isoformat()

    # ── 默认租户 ──
    if conn.execute("SELECT COUNT(*) FROM tenants").fetchone()[0] == 0:
        tenant_id = _sec.token_hex(8)
        conn.execute(
            "INSERT INTO tenants (id, code, name, status, created_at) VALUES (?, ?, ?, ?, ?)",
            (tenant_id, "default", "默认租户", "active", now),
        )
        logger.info("Seeded default tenant: %s", tenant_id)
    else:
        tenant_id = conn.execute("SELECT id FROM tenants WHERE code = 'default'").fetchone()[0]

    # ── 默认项目 ──
    admin_row = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()
    admin_id = admin_row[0] if admin_row else ""

    if conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0] == 0:
        project_id = _sec.token_hex(8)
        conn.execute(
            "INSERT INTO projects (id, tenant_id, code, name, description, owner_user_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (project_id, tenant_id, "default", "默认项目", "系统自动创建的默认项目", admin_id, "active", now),
        )
        logger.info("Seeded default project: %s", project_id)
    else:
        project_id = conn.execute("SELECT id FROM projects WHERE code = 'default'").fetchone()[0]

    # ── 固定三环境 ──
    for env_name, display in [("dev", "开发"), ("test", "测试"), ("prod", "生产")]:
        if conn.execute("SELECT COUNT(*) FROM environments WHERE project_id = ? AND name = ?", (project_id, env_name)).fetchone()[0] == 0:
            env_id = _sec.token_hex(8)
            conn.execute(
                "INSERT INTO environments (id, project_id, name, display_name, created_at) VALUES (?, ?, ?, ?, ?)",
                (env_id, project_id, env_name, display, now),
            )
    logger.info("Seeded default environments for project %s", project_id)

    # ── 内置角色 ──
    _BUILTIN_ROLES = [
        ("platform_admin",  "平台管理员", "platform"),
        ("security_admin",  "安全管理员", "platform"),
        ("project_owner",   "项目负责人", "project"),
        ("editor",          "编辑者",     "project"),
        ("reviewer",        "审核者",     "project"),
        ("publisher",       "发布者",     "project"),
        ("viewer",          "查看者",     "project"),
        ("api_client",      "API 客户端", "environment"),
    ]
    role_ids = {}
    for code, name, scope in _BUILTIN_ROLES:
        existing = conn.execute("SELECT id FROM roles WHERE code = ?", (code,)).fetchone()
        if existing:
            role_ids[code] = existing[0]
        else:
            rid = _sec.token_hex(8)
            conn.execute(
                "INSERT INTO roles (id, code, name, scope_type, is_system, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                (rid, code, name, scope, now),
            )
            role_ids[code] = rid
    logger.info("Seeded %d built-in roles", len(role_ids))

    # ── 权限 ──
    _BUILTIN_PERMISSIONS = [
        ("datasource.read",      "查看数据源",   "datasource", "read"),
        ("datasource.write",     "管理数据源",   "datasource", "write"),
        ("ontology.read",        "查看本体",     "ontology",   "read"),
        ("ontology.write",       "编辑本体",     "ontology",   "write"),
        ("mapping.read",         "查看映射",     "mapping",    "read"),
        ("mapping.write",        "编辑映射",     "mapping",    "write"),
        ("glossary.read",        "查看词汇表",   "glossary",   "read"),
        ("glossary.write",       "编辑词汇表",   "glossary",   "write"),
        ("publishing.read",      "查看发布配置", "publishing",  "read"),
        ("publishing.write",     "编辑发布配置", "publishing",  "write"),
        ("release.create",       "创建发布",     "release",    "create"),
        ("release.approve",      "审批发布",     "release",    "approve"),
        ("release.execute",      "执行发布",     "release",    "execute"),
        ("audit.read",           "查看审计",     "audit",      "read"),
        ("apikey.read",          "查看 API Key", "apikey",     "read"),
        ("apikey.write",         "管理 API Key", "apikey",     "write"),
        ("member.manage",        "管理成员",     "member",     "manage"),
    ]
    perm_ids = {}
    for code, name, res_type, action in _BUILTIN_PERMISSIONS:
        existing = conn.execute("SELECT id FROM permissions WHERE code = ?", (code,)).fetchone()
        if existing:
            perm_ids[code] = existing[0]
        else:
            pid = _sec.token_hex(8)
            conn.execute(
                "INSERT INTO permissions (id, code, name, resource_type, action) VALUES (?, ?, ?, ?, ?)",
                (pid, code, name, res_type, action),
            )
            perm_ids[code] = pid
    logger.info("Seeded %d built-in permissions", len(perm_ids))

    # ── 角色-权限映射 ──
    _ROLE_PERMISSIONS = {
        "platform_admin":  [c for c, *_ in _BUILTIN_PERMISSIONS],
        "security_admin":  ["audit.read", "apikey.read", "apikey.write", "member.manage"],
        "project_owner":   ["datasource.read", "datasource.write", "ontology.read", "ontology.write",
                            "mapping.read", "mapping.write", "glossary.read", "glossary.write",
                            "publishing.read", "publishing.write", "release.create", "release.approve",
                            "release.execute", "apikey.read", "apikey.write", "member.manage"],
        "editor":          ["datasource.read", "ontology.read", "ontology.write",
                            "mapping.read", "mapping.write", "glossary.read", "glossary.write",
                            "publishing.read", "release.create"],
        "reviewer":        ["datasource.read", "ontology.read", "mapping.read", "glossary.read",
                            "publishing.read", "release.approve"],
        "publisher":       ["publishing.read", "release.create", "release.execute"],
        "viewer":          ["datasource.read", "ontology.read", "mapping.read", "glossary.read",
                            "publishing.read", "audit.read"],
        "api_client":      ["datasource.read", "ontology.read", "mapping.read", "glossary.read",
                            "publishing.read"],
    }
    for role_code, perm_codes in _ROLE_PERMISSIONS.items():
        rid = role_ids.get(role_code)
        if not rid:
            continue
        for perm_code in perm_codes:
            pid = perm_ids.get(perm_code)
            if not pid:
                continue
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
                    (rid, pid),
                )
            except sqlite3.IntegrityError:
                pass

    # ── admin 用户绑定 platform_admin 角色 ──
    if admin_id and "platform_admin" in role_ids:
        existing_binding = conn.execute(
            "SELECT id FROM role_bindings WHERE user_id = ? AND role_id = ?",
            (admin_id, role_ids["platform_admin"]),
        ).fetchone()
        if not existing_binding:
            conn.execute(
                "INSERT INTO role_bindings (id, user_id, role_id, tenant_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
                (_sec.token_hex(8), admin_id, role_ids["platform_admin"], tenant_id, now, admin_id),
            )

    conn.commit()
    logger.info("Governance seed data committed")


def _backfill_governance_context(conn):
    """Backfill existing rows with default project_id and dev environment_id."""
    try:
        project = conn.execute("SELECT id FROM projects WHERE code = 'default'").fetchone()
        dev_env = conn.execute(
            "SELECT id FROM environments WHERE project_id = ? AND name = 'dev'",
            (project[0],) if project else ("",),
        ).fetchone()
        if not project or not dev_env:
            return
        pid, eid = project[0], dev_env[0]
        for table in ("publishing_config", "endpoint_registry", "query_history", "datasources"):
            conn.execute(
                f"UPDATE {table} SET project_id = ?, environment_id = ? WHERE project_id = '' OR project_id IS NULL",
                (pid, eid),
            )
        conn.commit()
        logger.info("Backfilled governance context (project=%s, env=%s)", pid, eid)
    except Exception as e:
        logger.warning("Governance context backfill skipped: %s", e)


def _backfill_admin_tenant(conn):
    """Set admin user's tenant_id to default tenant."""
    admin = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()
    tenant = conn.execute("SELECT id FROM tenants WHERE code = 'default'").fetchone()
    if admin and tenant:
        conn.execute("UPDATE users SET tenant_id = ? WHERE username = 'admin'", (tenant[0],))
        conn.commit()


def init_db():
    """Create tables if they don't exist."""
    conn = get_connection()
    conn.executescript(_SCHEMA_SQL)
    conn.commit()
    _seed_admin_user(conn)
    _seed_governance_defaults(conn)

    # ── Schema migrations (idempotent) ───────────────────
    _migrations = [
        "ALTER TABLE query_history ADD COLUMN source_ip TEXT DEFAULT ''",
        "ALTER TABLE query_history ADD COLUMN caller TEXT DEFAULT 'web'",
        "ALTER TABLE query_history ADD COLUMN duration_ms REAL",
        "ALTER TABLE query_history ADD COLUMN status TEXT DEFAULT 'ok'",
        "ALTER TABLE query_history ADD COLUMN error_message TEXT DEFAULT ''",
        # P1-A: users 表补列
        "ALTER TABLE users ADD COLUMN tenant_id TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'",
        "ALTER TABLE users ADD COLUMN auth_source TEXT DEFAULT 'local'",
        "ALTER TABLE users ADD COLUMN last_login_at TEXT DEFAULT ''",
        # P1-A: 现有业务表补列
        "ALTER TABLE publishing_config ADD COLUMN project_id TEXT DEFAULT ''",
        "ALTER TABLE publishing_config ADD COLUMN environment_id TEXT DEFAULT ''",
        "ALTER TABLE endpoint_registry ADD COLUMN project_id TEXT DEFAULT ''",
        "ALTER TABLE endpoint_registry ADD COLUMN environment_id TEXT DEFAULT ''",
        "ALTER TABLE query_history ADD COLUMN project_id TEXT DEFAULT ''",
        "ALTER TABLE query_history ADD COLUMN environment_id TEXT DEFAULT ''",
        "ALTER TABLE datasources ADD COLUMN project_id TEXT DEFAULT ''",
        "ALTER TABLE datasources ADD COLUMN environment_id TEXT DEFAULT ''",
    ]
    for sql in _migrations:
        try:
            conn.execute(sql)
        except sqlite3.OperationalError:
            pass  # column already exists
    conn.execute("CREATE INDEX IF NOT EXISTS idx_history_caller ON query_history(caller)")
    conn.commit()

    # 回填 admin 用户的 tenant_id
    _backfill_admin_tenant(conn)

    # 回填现有数据的 project_id / environment_id
    _backfill_governance_context(conn)

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
