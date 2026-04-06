# Docker 镜像设计说明

本文说明 `ontop-aether` 当前 Docker 镜像与容器编排的设计。重点覆盖：

- 默认 `retail` 环境的 5 个服务
- `LVFA / Mondial` 与 `MySQL` 演示环境的端口差异
- `ontop-engine`、`ontop-endpoint`、`ontop-backend`、`ontop-ui` 的职责边界
- 为什么采用“Builder API + Endpoint”双 Java 服务拆分

默认编排文件见 [docker-compose.yml](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether/docker-compose.yml)。

## 1. 当前镜像总览

### 1.1 默认 retail 环境

| Service | 构建/来源 | 宿主端口 | 主要职责 |
|---|---|---:|---|
| `postgres` | 官方镜像 `postgres:16-alpine` | `5435` | 示例业务库 `retail_db` |
| `ontop-engine` | 本仓库自定义镜像 | `8081` | Ontop 建模期能力：元数据提取、Bootstrap、Validate、Parse Mapping |
| `ontop-endpoint` | 本仓库自定义镜像 | `18080` | Ontop 在线查询服务：`/sparql`、`/ontop/reformulate`、`/ontop/restart` |
| `backend` | 本仓库自定义镜像 | `8000` | FastAPI 业务编排层 |
| `frontend` | 本仓库自定义镜像 | `3000` | Next.js 工作台前端 |

### 1.2 演示环境端口

仓库同时维护三套 compose：

- [docker-compose.yml](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether/docker-compose.yml)
- [docker-compose.lvfa.yml](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether/docker-compose.lvfa.yml)
- [docker-compose.mysql.yml](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether/docker-compose.mysql.yml)

| 环境 | Frontend | Backend | DB | Ontop Engine | Ontop Endpoint |
|---|---:|---:|---:|---:|---:|
| Retail | `3000` | `8000` | `5435` | `8081` | `18080` |
| LVFA / Mondial | `3001` | `8001` | `5436` | `8083` | `18081` |
| MySQL | `3002` | `8002` | `3307` | `8084` | `18082` |

## 2. 设计目标

这套 Docker 设计的目标不是简单把旧单体应用容器化，而是明确拆成 4 个职责层：

1. 建模期引擎独立
   `extract-metadata`、`bootstrap`、`validate`、`parse-mapping` 由 JVM 内的 `ontop-engine` 提供，不再由 Python `subprocess` 拉起 CLI。

2. 在线查询独立
   SPARQL endpoint 不由 backend 本地持有子进程，而是作为常驻 `ontop-endpoint` 容器运行。

3. 业务编排与 Java 解耦
   `ontop-backend` 只做 API、版本管理、active 文件切换、AI 流程、审计与发布能力，不再内嵌 JRE。

4. 前端只消费 backend
   `ontop-ui` 不直接连数据库，也不直接打 `ontop-engine` / `ontop-endpoint`。

## 3. 各镜像说明

### 3.1 `postgres`

默认环境使用官方镜像：

- `postgres:16-alpine`
- 暴露 `5435:5432`
- 启动 SQL 位于 [ontop-db/postgres/init.sql](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether/ontop-db/postgres/init.sql)

职责很单纯：

- 提供示例关系库
- 为 `ontop-engine` 和 `ontop-endpoint` 提供 JDBC / 查询源

### 3.2 `ontop-engine`

Dockerfile：
[ontop-engine/Dockerfile](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether/ontop-engine/Dockerfile)

构建方式：

1. 基于 `maven:3.9.9-eclipse-temurin-17` 多阶段构建
2. 在构建阶段执行 `mvn -q -DskipTests package`
3. 运行阶段基于 `eclipse-temurin:17-jre`
4. 仅复制 fat jar 到最终镜像

运行特点：

- 默认监听 `8081`
- 默认 `ENTRYPOINT` 使用 `-XX:MaxRAMPercentage=75.0`
- compose 里还可通过 `JAVA_TOOL_OPTIONS` 指定 `-Xms/-Xmx`

当前职责：

- `POST /api/ontop/extract-metadata`
- `POST /api/ontop/bootstrap`
- `POST /api/ontop/validate`
- `POST /api/ontop/parse-mapping`

边界：

- 不直接写 `.ttl/.obda/.properties` 文件
- 不负责 active 版本切换
- 不提供 `/sparql`

### 3.3 `ontop-endpoint`

Dockerfile：
[ontop-endpoint/Dockerfile](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether/ontop-endpoint/Dockerfile)

启动脚本：
[ontop-endpoint/entrypoint.sh](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether/ontop-endpoint/entrypoint.sh)

构建方式：

1. 下载官方发布的 `ontop-cli-5.5.0.zip`
2. 在运行镜像内保留 `/opt/ontop-cli`
3. 复制 [ontop-endpoint/seed](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether/ontop-endpoint/seed) 的种子文件
4. 启动时如 active 文件不存在，则从 seed 初始化

运行模式：

- 容器内端口固定 `8080`
- 宿主机端口按环境映射为 `18080 / 18081 / 18082`
- 通过 `--dev` 启动，支持 `/ontop/restart`
- 开启 `--enable-download-ontology`

固定读取的运行时文件：

- `active_ontology.ttl`
- `active_mapping.obda`
- `active.properties`

这些文件来自共享卷，由 backend 写入，endpoint 读取。

### 3.4 `backend`

Dockerfile：
[ontop-backend/Dockerfile](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether/ontop-backend/Dockerfile)

构建方式：

- 基于 `python:3.11-slim`
- 安装 [requirements.txt](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether/ontop-backend/requirements.txt)
- 启动 `uvicorn main:app`

职责：

- 数据源管理
- Bootstrap 编排
- 版本目录与 manifest 管理
- active 映射切换
- SPARQL 代理与审计
- AI 查询、语义标注、词汇表、精化建议、发布能力

backend 通过环境变量连接两个 Java 服务：

- `ONTOP_ENGINE_URL=http://ontop-engine:8081`
- `ONTOP_ENDPOINT_URL=http://ontop-endpoint:8080`

默认挂载的关键目录：

1. `./ontop-output:/opt/ontop-output`
   保存当前默认输出文件。

2. `./ontop-backend/data:/app/data`
   保存 SQLite、bootstrap 历史版本、审计与发布状态。

3. `./ontop-endpoint/active:/opt/ontop-endpoint/active`
   backend 把选中的 ontology / mapping / properties 复制到这里，供 `ontop-endpoint` 读取。

### 3.5 `frontend`

Dockerfile：
[ontop-ui/Dockerfile](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether/ontop-ui/Dockerfile)

构建方式：

1. builder 阶段基于 `node:20-slim`
2. 通过 `pnpm next build` 构建前端
3. 使用 `tsup` 打包 `src/server.ts`
4. 运行阶段保留 `.next`、`dist` 与生产依赖

运行特点：

- 容器内端口 `5000`
- 宿主机端口按环境映射为 `3000 / 3001 / 3002`
- 通过 `BACKEND_URL=http://backend:8000` 访问 backend

职责：

- 页面渲染
- 统一从 Node 侧代理 `/api/*`
- 不直接调用 `ontop-engine` 或 `ontop-endpoint`

## 4. 运行关系

### 4.1 建模链路

```text
Frontend
  -> Backend
  -> ontop-engine
  -> 返回 metadata / ontology / mapping / parse result
  -> Backend 落盘到 ontop-output 或 data 版本目录
```

### 4.2 在线查询链路

```text
Frontend
  -> Backend
  -> ontop-endpoint
  -> 返回 SPARQL 查询结果 / SQL reformulation
```

### 4.3 切换在线映射链路

```text
Frontend
  -> Backend (/api/v1/mappings/restart-endpoint)
  -> Backend 将指定 ontology / mapping / properties 复制到 active 目录
  -> Backend 调用 ontop-endpoint /ontop/restart
  -> ontop-endpoint 重新加载 active 文件
```

## 5. 为什么不是一个 Java 容器

理论上可以把 Builder API 和 SPARQL Endpoint 合成一个 Java 容器，但当前不这样做，原因是：

1. 生命周期不同
   Bootstrap / validate 属于构建期任务，SPARQL 属于在线常驻任务。

2. 故障域不同
   建模任务失败不应拖垮在线查询端点。

3. 资源模式不同
   Builder 更偏短时重负载；Endpoint 更偏长驻稳定吞吐。

4. 演进方向不同
   `ontop-engine` 未来可能继续增加解析、校验、物化等 API；`ontop-endpoint` 则更适合继续保持查询服务形态。

因此当前采用：

- `ontop-engine`：建模期 Java Builder API
- `ontop-endpoint`：在线查询 Java Endpoint

## 6. 当前镜像与官方 Ontop 镜像的关系

`ontop-endpoint` 是自定义镜像，但它并不是简单复制旧仓库中的 CLI 目录，而是：

1. 构建时直接下载官方发布的 `ontop-cli`
2. 运行时用自定义 `entrypoint.sh` 管理 seed / active 文件
3. 通过环境变量约束文件路径与端口

这和直接使用官方 `ontop/ontop` 镜像的差别主要在于：

- 当前镜像保留了对 active 切换流程的完全控制
- 当前镜像更容易与 backend 的“复制文件 + 远程重启”模式对接
- 代价是 Dockerfile 和 entrypoint 需要自行维护

## 7. 当前已知约束

1. active 切换仍采用“复制文件 + 远程 restart”模式
   这不是配置中心推送，也不是真正意义上的热更新。

2. backend 仍然以文件作为 Ontop 运行时真源
   Bootstrap 结果会落地为 `.ttl/.obda/.properties`，而不是只存在数据库里。

3. `ontop-endpoint` 依赖 `--dev`
   这是为了启用 `/ontop/restart`，便于工作台做运行时切换。

4. 三套环境共享同一架构，不共享同一 active 目录
   `retail`、`lvfa`、`mysql` 都有自己独立的数据目录和 endpoint active 目录。

## 8. 推荐后续演进

建议下一步继续做三件事：

1. 把 `ontop-endpoint` 的版本与 `ontop-engine` 文档化绑定
   明确 Ontop CLI 与 Ontop API 的版本矩阵，避免 builder / endpoint 漂移。

2. 给三套 compose 补统一的资源限制
   尤其是 `ontop-engine` 与 `ontop-endpoint` 的内存和 CPU 约束。

3. 在 `k8s/` 目录补齐等价部署说明
   当前镜像拆分已经稳定，适合映射成 Deployment + Service + PVC 结构。

## 9. 常用命令

构建默认环境：

```bash
cd /Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether
docker compose build
```

启动默认环境：

```bash
cd /Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether
docker compose up -d
```

启动 LVFA / Mondial 环境：

```bash
cd /Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether
docker compose -f docker-compose.lvfa.yml up -d --build
```

启动 MySQL 环境：

```bash
cd /Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether
docker compose -f docker-compose.mysql.yml up -d --build
```

查看服务状态：

```bash
cd /Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether
docker compose ps
```

单独重建 builder 服务：

```bash
cd /Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-aether
docker compose build ontop-engine
docker compose up -d --force-recreate ontop-engine
```

单独重启 endpoint：

```bash
curl -X POST http://localhost:8000/api/v1/mappings/restart-endpoint \
  -H 'Content-Type: application/json' \
  -d '{}'
```
