"""
Spider 数据库批量导入脚本
========================
将转换后的 PostgreSQL SQL 导入到 ontop-aether 系统。

用法:
  python benchmark/spider/scripts/import_spider_databases.py [--dbs car_1 world_1]

前置条件:
  - Docker Compose 已启动
  - prepare_spider_data.py 已执行（sql/ 目录存在）
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import httpx

_TRANSPORT = httpx.HTTPTransport(retries=2)

DEFAULT_BACKEND_URL = "http://localhost:8001"
DEFAULT_DB_CONTAINER = "ontop-lvfa-db"
DEFAULT_PG_HOST_DOCKER = "postgres-lvfa"
DEFAULT_PG_PORT_DOCKER = 5432
DEFAULT_PG_USER = "admin"
DEFAULT_PG_PASSWORD = "test123"
WAIT_TIMEOUT = 120
INTERNAL_HEADER = {"X-Internal-Request": "true"}


def load_config() -> dict:
    config_path = Path(__file__).resolve().parent.parent / "config" / "test_settings.json"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def run_cmd(cmd: str, check: bool = True) -> tuple[int, str]:
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
    output = result.stdout.strip() or result.stderr.strip()
    if check and result.returncode != 0:
        raise RuntimeError(f"Command failed: {cmd}\n{output}")
    return result.returncode, output


def _client(**kwargs):
    return httpx.Client(**kwargs)


def wait_for_backend(backend_url: str, timeout: int = WAIT_TIMEOUT) -> bool:
    print("  Waiting for backend", "")
    elapsed = 0
    while elapsed < timeout:
        try:
            with _client(timeout=5) as c:
                resp = c.get(f"{backend_url}/api/v1/datasources", headers=INTERNAL_HEADER)
                if resp.status_code == 200:
                    print(" OK")
                    return True
        except Exception:
            pass
        time.sleep(2)
        elapsed += 2
        print(".", "", True, flush=True)  # type: ignore[call-arg]
    print(" TIMEOUT")
    return False


def create_database(db_container: str, db_name: str, pg_user: str) -> bool:
    run_cmd(
        f"docker exec {db_container} psql -U {pg_user} -d postgres -c \"DROP DATABASE IF EXISTS {db_name};\"",
        check=False,
    )
    rc, _ = run_cmd(
        f"docker exec {db_container} psql -U {pg_user} -d postgres -c \"CREATE DATABASE {db_name};\""
    )
    return rc == 0


def import_sql_file(db_container: str, db_name: str, pg_user: str, sql_file: Path) -> bool:
    container_path = f"/tmp/{sql_file.name}"
    rc1, _ = run_cmd(
        f"docker cp {sql_file} {db_container}:{container_path}", check=False
    )
    if rc1 != 0:
        return False
    rc2, _ = run_cmd(
        f"docker exec {db_container} psql -U {pg_user} -d {db_name}"
        f" -v ON_ERROR_STOP=0 -f {container_path}",
        check=False,
    )
    return rc2 == 0


def register_datasource(
    backend_url: str, db_id: str, jdbc_url: str, pg_user: str, pg_password: str
) -> str | None:
    """Register a data source and return its ID."""
    try:
        with _client(timeout=10) as c:
            resp = c.post(
                f"{backend_url}/api/v1/datasources",
                json={
                    "name": f"Spider - {db_id}",
                    "jdbc_url": jdbc_url,
                    "user": pg_user,
                    "password": pg_password,
                    "driver": "org.postgresql.Driver",
                },
                headers={
                    **INTERNAL_HEADER,
                    "Content-Type": "application/json",
                },
            )
        if resp.status_code in (200, 201):
            data = resp.json()
            return data.get("id") if isinstance(data, dict) else None
        else:
            print(f"    ERROR registering datasource: status={resp.status_code} body={resp.text[:200]}")
            return None
    except Exception as e:
        print(f"    ERROR: {e}")
        return None


def run_bootstrap(backend_url: str, ds_id: str, base_iri: str) -> bool:
    try:
        with _client(timeout=120) as c:
            resp = c.post(
                f"{backend_url}/api/v1/datasources/{ds_id}/bootstrap",
                json={
                    "mode": "full",
                    "base_iri": base_iri,
                    "tables": [],
                    "include_dependencies": True,
                },
                headers={
                    **INTERNAL_HEADER,
                    "Content-Type": "application/json",
                },
            )
        return resp.status_code == 200
    except Exception as e:
        print(f"    Bootstrap error: {e}")
        return False


def activate_endpoint(backend_url: str, ds_id: str) -> bool:
    try:
        with _client(timeout=30) as c:
            resp = c.put(
                f"{backend_url}/api/v1/endpoint-registry/{ds_id}/activate",
                headers=INTERNAL_HEADER,
            )
        return resp.status_code == 200
    except Exception:
        return False


def import_single_db(
    db_id: str,
    backend_url: str,
    db_container: str,
    pg_host_docker: str,
    pg_port_docker: int,
    pg_user: str,
    pg_password: str,
    sql_dir: Path,
) -> dict:
    result: dict = {"db_id": db_id, "steps": {}, "success": False}

    db_name = f"spider_{db_id}"
    jdbc_url = f"jdbc:postgresql://{pg_host_docker}:{pg_port_docker}/{db_name}"
    base_iri = f"http://example.com/spider/{db_id}/"

    # Step 1: Create database and import SQL
    print(f"  [{db_id}] Step 1/5: Creating database {db_name}...")
    db_sql_dir = sql_dir / db_id
    schema_file = db_sql_dir / "schema.sql"
    data_file = db_sql_dir / "data.sql"

    if not schema_file.exists():
        print(f"    SKIP: {schema_file} not found")
        return result

    ok = create_database(db_container, db_name, pg_user)
    result["steps"]["create_db"] = ok
    if not ok:
        print("    FAIL: Could not create database")
        return result

    # FIX P1-1: Check import_sql_file return value before continuing
    ok = import_sql_file(db_container, db_name, pg_user, schema_file)
    result["steps"]["import_schema"] = ok
    if not ok:
        print(f"    FAIL: Could not import schema for {db_id}")
        return result

    if data_file.exists():
        ok = import_sql_file(db_container, db_name, pg_user, data_file)
        result["steps"]["import_data"] = ok
        if not ok:
            print(f"    WARN: Could not import data for {db_id}, continuing with schema only")

    # Count tables
    rc, output = run_cmd(
        f"docker exec {db_container} psql -U {pg_user} -d {db_name}"
        " -tAc \"SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';\"",
        check=False,
    )
    table_count = int(output.strip()) if rc == 0 else 0
    result["table_count"] = table_count
    print(f"    Tables imported: {table_count}")

    # Step 2: Register data source
    print(f"  [{db_id}] Step 2/5: Registering data source...")
    ds_id = register_datasource(backend_url, db_id, jdbc_url, pg_user, pg_password)
    result["steps"]["register"] = ds_id is not None
    result["datasource_id"] = ds_id
    if not ds_id:
        print("    FAIL: Could not register data source")
        return result
    print(f"    Data source ID: {ds_id}")

    # Step 3: Bootstrap
    print(f"  [{db_id}] Step 3/5: Running bootstrap...")
    ok = run_bootstrap(backend_url, ds_id, base_iri)
    result["steps"]["bootstrap"] = ok
    if not ok:
        print("    FAIL: Bootstrap failed")
        return result
    print("    Bootstrap complete")

    # Step 4: Activate endpoint
    print(f"  [{db_id}] Step 4/5: Activating endpoint...")
    ok = activate_endpoint(backend_url, ds_id)
    result["steps"]["activate"] = ok
    if ok:
        print("    Endpoint activated")
        time.sleep(8)
    else:
        print("    WARN: Activation failed")

    # Step 5: Determine success
    result["success"] = all(result["steps"].get(k, False) for k in ("create_db", "register", "bootstrap"))

    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Import Spider databases into ontop-aether")
    parser.add_argument("--dbs", nargs="*", default=None)
    parser.add_argument("--backend-url", default=None)
    parser.add_argument("--db-container", default=None)
    parser.add_argument("--sql-dir", default=None)
    args = parser.parse_args()

    config = load_config()

    backend_url = args.backend_url or config.get("backend_url", DEFAULT_BACKEND_URL)
    db_container = args.db_container or config.get("db_container", DEFAULT_DB_CONTAINER)
    pg_host_docker = config.get("pg_jdbc_host", DEFAULT_PG_HOST_DOCKER)
    pg_port_docker = config.get("pg_jdbc_port", DEFAULT_PG_PORT_DOCKER)
    pg_user = config.get("pg_user", DEFAULT_PG_USER)
    pg_password = config.get("pg_password", DEFAULT_PG_PASSWORD)

    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent.parent
    sql_dir = Path(args.sql_dir) if args.sql_dir else project_root / "benchmark" / "spider" / "sql"

    # Determine which databases to import
    if args.dbs:
        db_list = args.dbs
    else:
        db_config_path = project_root / "benchmark" / "spider" / "config" / "spider_databases.json"
        if db_config_path.exists():
            with open(db_config_path) as f:
                db_config = json.load(f)
            db_list = [d["db_id"] for d in db_config["selected_dbs"]]
        else:
            print("ERROR: No databases specified and config not found")
            return 1

    # Filter to databases that have SQL files
    available = [d for d in db_list if (sql_dir / d / "schema.sql").exists()]
    if not available:
        print(f"ERROR: No SQL files found in {sql_dir}")
        print(f"  Expected dirs: {[str(sql_dir / d) for d in db_list[:3]]}")
        return 1

    print("============================================================")
    print("  Spider Database Import for ontop-aether")
    print("============================================================")
    print(f"  Databases: {available}")
    print(f"  Backend: {backend_url}")
    print(f"  Container: {db_container}")
    print(f"  SQL dir: {sql_dir}")

    # Check container is running
    rc, _ = run_cmd(f"docker ps --format '{{.Names}}' | grep -q {db_container}", check=False)
    if rc != 0:
        print(f"ERROR: Docker container '{db_container}' is not running.")
        return 1

    # Wait for backend
    if not wait_for_backend(backend_url):
        print("ERROR: Backend not ready")
        return 1

    print()
    results = []
    for i, db_id in enumerate(available, 1):
        print(f"{'─' * 50}")
        print(f"  Importing {db_id} ({i}/{len(available)})")
        result = import_single_db(
            db_id, backend_url, db_container,
            pg_host_docker, pg_port_docker, pg_user, pg_password, sql_dir,
        )
        results.append(result)

    # Save results
    results_path = project_root / "benchmark" / "spider" / "results" / "import_results.json"
    results_path.parent.mkdir(parents=True, exist_ok=True)
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    # Summary
    print("═" * 60)
    print("  Import Summary")
    successful = sum(1 for r in results if r["success"])
    print(f"  Total: {len(results)}, Success: {successful}, Failed: {len(results) - successful}")
    for r in results:
        status = "OK" if r["success"] else "FAIL"
        tables = r.get("table_count", "?")
        ds_id = r.get("datasource_id", "N/A")
        print(f"  [{status}] {r['db_id']:20s} tables={tables:>3} ds_id={ds_id}")

    if results_path.exists():
        print(f"\n  Results saved to: {results_path}")

    return 0 if successful == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
