# Docker 镜像设计说明

本文说明 `ontop-aether` monorepo 中各镜像的职责、构建方式、运行关系。

## 1. 镜像总览

编排文件位于仓库根目录（retail 默认环境）。

| Service | 镜像来源 | 宿主端口 | 构建上下文 | 主要职责 |
|---|---|---:|---|---|
| `postgres` | 官方镜像 `postgres:16-alpine` | `5435` | — | 示例业务库 `retail_db` |
| `ontop-engine` | 自定义镜像 | `8081` | `./ontop-engine` | Ontop 建模：提取元数据、Bootstrap、Validate、Materialize |
| `ontop-endpoint` | 自定义镜像 | `18080` | `./ontop-endpoint` | Ontop 在线查询：SPARQL、SQL 改写、在线重启 |
| `backend` | 自定义镜像 | `8000` | `./ontop-backend` | FastAPI 业务编排层 |
| `frontend` | 自定义镜像 | `3000` | `./ontop-ui` | Next.js 前端 UI |

三套环境端口映射：

| 环境 | 前端 | 后端 | Ontop Engine | SPARQL 端点 | 数据库 |
|------|------|------|-------------|------------|--------|
| Retail | 3000 | 8000 | 8081 | 18080 | 5435 (PG) |
| LVFA | 3001 | 8001 | 8083 | 18081 | 5436 (PG) |
| MySQL | 3002 | 8002 | 8084 | 18082 | 3307 (MySQL) |

## 2. 设计目标

1. **建模期独立** — `extract-metadata`、`bootstrap`、`validate` 不再由 Python 子进程拉起 JVM
2. **在线查询独立** — SPARQL endpoint 以独立容器常驻运行
3. **Python 瘦身** — backend 只做业务编排、文件管理、状态切换，不承载 Java 运行时
4. **模块化构建** — 每个模块 Dockerfile 与源码同目录，独立构建、独立迭代

## 3. 各镜像说明

### 3.1 `postgres`

- 基于官方 `postgres:16-alpine`
- 初始化 SQL 位于 `ontop-db/postgres/`（retail 用 `init.sql`，LVFA 用 `init_lvfa.sql`）
- Mondial 数据集在 `ontop-db/postgres/mondial/`
- 它是示例数据库，不参与本体引擎逻辑

### 3.2 `ontop-engine`

- **Dockerfile**: `ontop-engine/Dockerfile`
- **构建**: 两阶段 — Maven 编译（`maven:3.9.9-eclipse-temurin-17`） → JRE 运行（`eclipse-temurin:17-jre`）
- **API 契约**:

| 端点 | 方法 | 说明 | 超时 |
|------|------|------|------|
| `/api/ontop/extract-metadata` | POST | 探测数据库结构元数据 | 60s |
| `/api/ontop/bootstrap` | POST | 从关系库生成本体+映射 | 120s |
| `/api/ontop/validate` | POST | 验证 OBDA 映射合规性 | 60s |
| `/api/ontop/materialize` | POST | 物化虚拟三元组 | 300s |
| `/health` | GET | 健康检查 | 5s |
| `/version` | GET | 版本信息 | 5s |

- 直接在 JVM 内调用 Ontop 5.5.0 原生 API
- 内置 PostgreSQL / MySQL JDBC 驱动
- Caffeine 缓存 Configuration 对象，避免重复 Guice 初始化

### 3.3 `ontop-endpoint`

- **Dockerfile**: `ontop-endpoint/Dockerfile`
- **构建**: 两阶段 — **第一阶段从 GitHub 下载 ontop-cli**，第二阶段运行

```dockerfile
# Stage 1: 下载 Ontop CLI（不存入仓库）
FROM eclipse-temurin:17-jre AS downloader
ARG ONTOP_VERSION=5.5.0
RUN curl -L -o /tmp/ontop-cli.zip \
    "https://github.com/ontop/ontop/releases/download/ontop-${ONTOP_VERSION}/ontop-cli-${ONTOP_VERSION}.zip" \
    && unzip /tmp/ontop-cli.zip -d /opt/ontop-cli

# Stage 2: 运行
FROM eclipse-temurin:17-jre
COPY --from=downloader /opt/ontop-cli /opt/ontop-cli
COPY entrypoint.sh seed/ /opt/ontop-endpoint/
```

- **启动**: `entrypoint.sh` 管理 active 文件初始化 + `ontop endpoint` 启动
- **seed 数据**: `ontop-endpoint/seed/` 提供初始本体/映射/属性
- **active 文件**: 运行时由 backend 写入共享目录，endpoint 读取

设计要点：

- **ontop-cli 不存入仓库**，构建时从 GitHub Release 下载，通过 `--build-arg ONTOP_VERSION=5.5.0` 控制版本
- active 文件通过 volume 挂载（`./ontop-endpoint/active:/opt/ontop-endpoint/active`）
- 切换映射不需要重建镜像，只需写入新 active 文件 + 调用 restart

### 3.4 `backend`

- **Dockerfile**: `ontop-backend/Dockerfile`
- **构建**: 基于 `python:3.11-slim`，安装 `requirements.txt`，启动 `uvicorn`
- **职责**: 数据源 CRUD、Bootstrap 编排、映射管理、端点切换、SPARQL 代理、AI/MCP/发布

通过环境变量感知 Java 服务：
- `ONTOP_ENGINE_URL=http://ontop-engine:8081`
- `ONTOP_ENDPOINT_URL=http://ontop-endpoint:8080`

挂载目录：
- `./ontop-backend/data:/app/data` — SQLite、bootstrap 版本、配置
- `./ontop-output:/opt/ontop-output` — 生成的本体/映射/属性文件
- `./ontop-endpoint/active:/opt/ontop-endpoint/active` — 共享 active 目录
- `./ontop-db/properties/retail.properties:/opt/ontop-output/retail.properties:ro` — JDBC 属性

### 3.5 `frontend`

- **Dockerfile**: `ontop-ui/Dockerfile`
- **构建**: 两阶段 — `node:20-slim` + pnpm build → runtime 仅复制产物
- **职责**: UI 展示 + 后端 API 调用，不直接与 Java 服务通信
- `BACKEND_URL=http://backend:8000`

## 4. 运行关系

### 4.1 建模链路

```text
Frontend → Backend → ontop-engine → 返回 metadata / ontology / mapping
                                       → Backend 落盘到 ontop-output/
```

### 4.2 在线查询链路

```text
Frontend → Backend → ontop-endpoint → 返回 SPARQL 结果 / SQL reformulation
```

### 4.3 切换在线映射链路

```text
Frontend → Backend (/mappings/restart-endpoint)
         → Backend 写入 ontop-endpoint/active/
         → Backend 调用 ontop-endpoint /ontop/restart
         → Endpoint 重新加载 active 文件
```

## 5. 为什么拆两个 Java 容器

- 建模任务（bootstrap/validate）与在线查询（SPARQL）生命周期不同
- Bootstrap 失败不应影响在线查询
- builder 适合 API 化，endpoint 适合常驻服务化
- 便于分别替换实现和独立扩缩容

## 6. 与旧架构的对比

| 对比项 | 旧架构（ontop-ui 独立仓库） | 新架构（ontop-aether monorepo） |
|--------|--------------------------|-------------------------------|
| 构建上下文 | 跨仓库引用 `context: ../ontop-engine` | 仓库内引用 `context: ./ontop-engine` |
| ontop-cli | 仓库内 `docker/ontop-cli/`（~200MB） | 构建时从 GitHub 下载，不存仓库 |
| Dockerfile 位置 | 集中在 `docker/` 子目录 | 各模块自包含 `ontop-*/Dockerfile` |
| DB 初始化 | 散落在 `docker/postgres/` | 独立模块 `ontop-db/` |
| JDBC 属性 | 在 `docker/backend/ontop*.properties` | `ontop-db/properties/` |
| 构建 | 手动 docker compose | `make build` / `make up` |

## 7. 常用命令

```bash
# 构建全部
make build

# 启动 LVFA 环境
make up-lvfa

# 查看服务状态
docker compose -f docker-compose.lvfa.yml ps

# 单独重建 engine
docker build -t ontop-aether/engine ./ontop-engine

# 单独重启 endpoint
curl -X POST http://localhost:8001/api/v1/mappings/restart-endpoint \
  -H 'Content-Type: application/json' -d '{}'

# 清理构建产物
make clean
```
