#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  Ontop Aether — Demo 数据一键导入脚本
#  用法:  ./setup-demo.sh [lvfa|mondial|all]   (默认 all)
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_DIR="$(dirname "$SCRIPT_DIR")"

# ── 配置 ──────────────────────────────────────────────────────────────
DB_CONTAINER="ontop-lvfa-db"
BACKEND_URL="http://localhost:8001"
INTERNAL_HEADER="X-Internal-Request: true"
WAIT_TIMEOUT=120          # 等待后端就绪的最长秒数

# ── 颜色 ──────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
fail()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ── 参数 ──────────────────────────────────────────────────────────────
TARGET="${1:-all}"
[[ "$TARGET" != "lvfa" && "$TARGET" != "mondial" && "$TARGET" != "all" ]] && {
    echo "用法: $0 [lvfa|mondial|all]"
    exit 1
}

# ── 工具函数 ──────────────────────────────────────────────────────────
wait_for_backend() {
    echo -n "等待后端就绪 "
    local elapsed=0
    while ! curl -sf -o /dev/null "$BACKEND_URL/api/v1/datasources" -H "$INTERNAL_HEADER" 2>/dev/null; do
        sleep 2; elapsed=$((elapsed + 2))
        echo -n "."
        [[ $elapsed -ge $WAIT_TIMEOUT ]] && fail "后端 ${WAIT_TIMEOUT}s 内未就绪"
    done
    echo " OK"
}

api_post() {
    local endpoint="$1" body="$2"
    curl -sf -X POST "$BACKEND_URL$endpoint" \
        -H "Content-Type: application/json" -H "$INTERNAL_HEADER" \
        -d "$body" || fail "POST $endpoint 失败"
}

api_put() {
    local endpoint="$1"
    curl -sf -X PUT "$BACKEND_URL$endpoint" \
        -H "Content-Type: application/json" -H "$INTERNAL_HEADER" || fail "PUT $endpoint 失败"
}

import_annotations() {
    local ds_id="$1" json_file="$2"
    [[ ! -f "$json_file" ]] && { warn "注释文件 $json_file 不存在，跳过"; return; }
    local annotations
    annotations=$(cat "$json_file")
    local count
    count=$(echo "$annotations" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
    echo "  导入注释: $count 条"
    echo "$annotations" | python3 -c "
import sys, json, urllib.request
anns = json.load(sys.stdin)
ds_id = '$ds_id'
url = '${BACKEND_URL}/api/v1/annotations/' + ds_id
ok = 0
for a in anns:
    body = json.dumps({
        'entity_uri': a['entity_uri'],
        'entity_kind': a['entity_kind'],
        'lang': a['lang'],
        'label': a['label'],
        'comment': a['comment'],
        'source': a.get('source', 'llm'),
    }).encode()
    req = urllib.request.Request(url, data=body, headers={
        'Content-Type': 'application/json',
        'X-Internal-Request': 'true',
    })
    try:
        urllib.request.urlopen(req)
        ok += 1
    except Exception as e:
        pass
print(f'  注释导入完成: {ok}/{len(anns)}')
"
}

import_glossary() {
    local ds_id="$1" json_file="$2"
    [[ ! -f "$json_file" ]] && { warn "词汇表文件 $json_file 不存在，跳过"; return; }
    local terms
    terms=$(cat "$json_file")
    local count
    count=$(echo "$terms" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
    echo "  导入词汇表: $count 条"
    # 使用 batch import API
    local body
    body=$(echo "$terms" | python3 -c "
import sys, json
terms = json.load(sys.stdin)
print(json.dumps({'terms': terms, 'overwrite': True}))
")
    curl -sf -X POST "$BACKEND_URL/api/v1/glossary/$ds_id/import" \
        -H "Content-Type: application/json" -H "$INTERNAL_HEADER" \
        -d "$body" || warn "词汇表导入失败"
}

trigger_merge() {
    local ds_id="$1"
    echo "  合并注释到本体..."
    curl -sf -X POST "$BACKEND_URL/api/v1/annotations/$ds_id/merge" \
        -H "$INTERNAL_HEADER" || warn "注释合并失败"
}

activate_endpoint() {
    local ds_id="$1"
    echo "  激活端点..."
    api_put "/api/v1/endpoint-registry/$ds_id/activate"
    echo "  等待端点重启 (10s)..."
    sleep 10
}

restart_endpoint() {
    local port="${1:-18081}"
    echo "  重启端点 (port=$port)..."
    curl -sf -X POST "http://localhost:$port/ontop/restart" || warn "端点重启失败"
    sleep 5
}

# ══════════════════════════════════════════════════════════════════════
#  LVFA 物业管理演示
# ══════════════════════════════════════════════════════════════════════
setup_lvfa() {
    echo ""
    echo "═══════════════════════════════════════════════"
    echo "  LVFA 物业管理演示"
    echo "═══════════════════════════════════════════════"

    # 1. 数据库
    echo "[1/5] 创建数据库 & 导入数据..."
    docker exec "$DB_CONTAINER" psql -U admin -d postgres -c "DROP DATABASE IF EXISTS lvfa_db;" 2>/dev/null || true
    docker exec "$DB_CONTAINER" psql -U admin -d postgres -c "CREATE DATABASE lvfa_db;"
    docker cp "$SCRIPT_DIR/lvfa/sql/schema.sql" "$DB_CONTAINER:/tmp/lvfa_schema.sql"
    docker exec "$DB_CONTAINER" psql -U admin -d lvfa_db -f /tmp/lvfa_schema.sql
    local tbl_count
    tbl_count=$(docker exec "$DB_CONTAINER" psql -U admin -d lvfa_db -tAc "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';")
    info "LVFA: $tbl_count 张表已导入"

    # 2. 数据源
    echo "[2/5] 注册数据源..."
    local ds_resp
    ds_resp=$(api_post "/api/v1/datasources" '{
        "name": "lvfa-property",
        "jdbc_url": "jdbc:postgresql://postgres-lvfa:5432/lvfa_db",
        "user": "admin",
        "password": "test123",
        "driver": "org.postgresql.Driver"
    }')
    local ds_id
    ds_id=$(echo "$ds_resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
    info "数据源 ID: $ds_id"

    # 测试连接
    api_post "/api/v1/datasources/$ds_id/test" '{}' > /dev/null
    info "连接测试通过"

    # 3. Bootstrap
    echo "[3/5] 执行 Bootstrap..."
    api_post "/api/v1/datasources/$ds_id/bootstrap" '{
        "mode": "full",
        "base_iri": "http://example.com/lvfa/",
        "tables": [],
        "include_dependencies": false
    }' > /dev/null
    info "Bootstrap 完成"

    # 4. 语义标注 + 词汇表
    echo "[4/5] 导入语义标注 & 词汇表..."
    import_annotations "$ds_id" "$SCRIPT_DIR/lvfa/annotations.json"
    import_glossary "$ds_id" "$SCRIPT_DIR/lvfa/glossary.json"

    # 5. 合并 + 激活
    echo "[5/5] 合并到本体 & 激活端点..."
    trigger_merge "$ds_id"
    # LVFA 通常不是默认激活的，但如果只有 LVFA 就激活它
    if [[ "$TARGET" == "lvfa" ]]; then
        activate_endpoint "$ds_id"
    fi

    info "LVFA 演示数据导入完成!"
}

# ══════════════════════════════════════════════════════════════════════
#  Mondial 全球地理演示
# ══════════════════════════════════════════════════════════════════════
setup_mondial() {
    echo ""
    echo "═══════════════════════════════════════════════"
    echo "  Mondial 全球地理演示"
    echo "═══════════════════════════════════════════════"

    # 1. 数据库
    echo "[1/5] 创建数据库 & 导入数据..."
    docker exec "$DB_CONTAINER" psql -U admin -d postgres -c "DROP DATABASE IF EXISTS mondial_db;" 2>/dev/null || true
    docker exec "$DB_CONTAINER" psql -U admin -d postgres -c "CREATE DATABASE mondial_db;"
    docker cp "$SCRIPT_DIR/mondial/sql/schema.sql" "$DB_CONTAINER:/tmp/mondial_schema.sql"
    docker cp "$SCRIPT_DIR/mondial/sql/data.sql" "$DB_CONTAINER:/tmp/mondial_data.sql"
    docker exec "$DB_CONTAINER" psql -U admin -d mondial_db -f /tmp/mondial_schema.sql
    docker exec "$DB_CONTAINER" psql -U admin -d mondial_db -f /tmp/mondial_data.sql
    local country_count
    country_count=$(docker exec "$DB_CONTAINER" psql -U admin -d mondial_db -tAc "SELECT COUNT(*) FROM country;")
    info "Mondial: $country_count 个国家已导入"

    # 2. 数据源
    echo "[2/5] 注册数据源..."
    local ds_resp
    ds_resp=$(api_post "/api/v1/datasources" '{
        "name": "Mondial PostgreSQL",
        "jdbc_url": "jdbc:postgresql://postgres-lvfa:5432/mondial_db",
        "user": "admin",
        "password": "test123",
        "driver": "org.postgresql.Driver"
    }')
    local ds_id
    ds_id=$(echo "$ds_resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
    info "数据源 ID: $ds_id"

    # 测试连接
    api_post "/api/v1/datasources/$ds_id/test" '{}' > /dev/null
    info "连接测试通过"

    # 3. Bootstrap
    echo "[3/5] 执行 Bootstrap..."
    api_post "/api/v1/datasources/$ds_id/bootstrap" '{
        "mode": "full",
        "base_iri": "http://example.com/mondial/",
        "tables": [],
        "include_dependencies": false
    }' > /dev/null
    info "Bootstrap 完成"

    # 4. 语义标注 + 词汇表
    echo "[4/5] 导入语义标注 & 词汇表..."
    import_annotations "$ds_id" "$SCRIPT_DIR/mondial/annotations.json"
    import_glossary "$ds_id" "$SCRIPT_DIR/mondial/glossary.json"

    # 5. 合并 + 激活
    echo "[5/5] 合并到本体 & 激活端点..."
    trigger_merge "$ds_id"
    activate_endpoint "$ds_id"

    info "Mondial 演示数据导入完成!"
}

# ══════════════════════════════════════════════════════════════════════
#  Main
# ══════════════════════════════════════════════════════════════════════
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Ontop Aether — Demo 数据导入                    ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "目标: $TARGET"
echo ""

# 检查 docker 容器
docker ps --format '{{.Names}}' | grep -q "$DB_CONTAINER" || fail "数据库容器 $DB_CONTAINER 未运行，请先 docker compose up"

# 等待后端
wait_for_backend

case "$TARGET" in
    lvfa)    setup_lvfa ;;
    mondial) setup_mondial ;;
    all)     setup_lvfa; setup_mondial ;;
esac

echo ""
info "════════ 全部完成! ════════"
echo ""
echo "  前端:    http://localhost:3001"
echo "  后端:    http://localhost:8001"
echo "  SPARQL:  http://localhost:18081/sparql"
echo ""
echo "  SPARQL 测试查询 (Mondial):"
echo "    SELECT ?name ?pop WHERE {"
echo "      ?c <http://example.com/mondial/country#name> ?name ."
echo "      ?c <http://example.com/mondial/country#population> ?pop ."
echo "    } LIMIT 5"
echo ""
