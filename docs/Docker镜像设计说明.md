# Docker 镜像设计说明

本文说明当前 `ontop-ui` 默认环境中各镜像的职责、构建方式、运行关系，以及为什么拆成现在这几个服务。

## 1. 当前镜像总览

默认编排见 [docker-compose.yml](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-ui/docker-compose.yml)。

| Service | 镜像来源 | 宿主端口 | 主要职责 |
|---|---|---:|---|
| `postgres` | 官方镜像 `postgres:16-alpine` | `5435` | 示例业务库，存放 `retail_db` |
| `ontop-engine` | 本仓库自定义镜像 | `8081` | Ontop 建模期能力：提取元数据、Bootstrap、Validate |
| `ontop-endpoint` | 本仓库自定义镜像 | `18080` | Ontop 在线查询服务：SPARQL、SQL 改写、在线重启 |
| `backend` | 本仓库自定义镜像 | `8000` | FastAPI 业务编排层 |
| `frontend` | 本仓库自定义镜像 | `3000` | Next.js 前端 UI |

## 2. 设计目标

这套 Docker 设计的核心目标是把原先“Python 容器内嵌 Java CLI”的混合模式拆开：

1. 建模期任务独立
   `extract-metadata`、`bootstrap`、`validate` 不再由 Python 进程 `subprocess` 拉起 JVM。

2. 在线查询独立
   SPARQL endpoint 不再由 backend 容器本地持有子进程，而是以独立容器常驻运行。

3. Python 业务层瘦身
   backend 只做业务编排、文件管理、状态切换和代理，不再承担 Java 运行时。

4. 边界清晰
   builder 与 endpoint 两类 Java 责任拆开，避免建模任务和在线查询耦合在一个进程里。

## 3. 各镜像说明

### 3.1 `postgres`

- 基于官方镜像 `postgres:16-alpine`
- 在默认环境中暴露 `5435:5432`
- 使用 `docker/postgres/init.sql` 初始化 `retail_db`

它是示例数据库，不参与本体引擎逻辑，只提供底层关系数据。

### 3.2 `ontop-engine`

Dockerfile:
[ontop-engine/Dockerfile](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-engine/Dockerfile)

构建方式：

1. 第一阶段基于 `maven:3.9.9-eclipse-temurin-17`
2. 执行 `mvn -q -DskipTests package`
3. 第二阶段基于 `eclipse-temurin:17-jre`
4. 仅复制打包后的 Spring Boot fat jar

职责：

- `POST /api/ontop/extract-metadata`
- `POST /api/ontop/bootstrap`
- `POST /api/ontop/validate`

技术特点：

- 直接在 JVM 内调用 Ontop API
- 不再依赖 CLI 子进程
- 已内置 PostgreSQL / MySQL JDBC 驱动

为什么独立成镜像：

- 避免每次 Bootstrap 都重新拉起 JVM
- 便于单独调优 JVM 参数
- 让 backend 不再承载 Java 构建期逻辑

### 3.3 `ontop-endpoint`

Dockerfile:
[docker/endpoint/Dockerfile](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-ui/docker/endpoint/Dockerfile)

启动脚本：
[docker/endpoint/entrypoint.sh](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-ui/docker/endpoint/entrypoint.sh)

构建方式：

1. 基于 `eclipse-temurin:17-jre`
2. 拷贝仓库内 `docker/ontop-cli` 到容器
3. 拷贝一份 seed ontology / mapping / properties
4. 通过 `entrypoint.sh` 启动 `ontop endpoint`

职责：

- `/sparql`
- `/ontop/reformulate`
- `/ontop/restart`

设计要点：

- 容器内固定读取一组 active 文件：
  - `active_ontology.ttl`
  - `active_mapping.obda`
  - `active.properties`
- backend 通过共享目录写入这些 active 文件
- 然后调用 `/ontop/restart` 让 endpoint 重新加载配置

这样做的好处：

- endpoint 本身始终是独立容器
- backend 不需要持有 Ontop endpoint 子进程
- 在线端点切换映射时不需要重建镜像

### 3.4 `backend`

Dockerfile:
[docker/backend/Dockerfile](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-ui/docker/backend/Dockerfile)

构建方式：

- 基于 `python:3.11-slim`
- 安装 `requirements.txt`
- 启动 `uvicorn`

职责：

- 数据源 CRUD
- Bootstrap 编排
- 映射文件管理
- endpoint 切换与重启
- SPARQL 查询代理
- AI / MCP / 发布能力

backend 当前通过环境变量感知两个 Java 服务：

- `ONTOP_ENGINE_URL=http://ontop-engine:8081`
- `ONTOP_ENDPOINT_URL=http://ontop-endpoint:8080`

backend 同时挂载两个重要目录：

1. `./backend/data:/app/data`
   保存 SQLite、历史 bootstrap 版本、active endpoint 配置等

2. `./docker/endpoint/active:/opt/ontop-endpoint/active`
   供 backend 写入 active 映射文件，供 `ontop-endpoint` 读取

### 3.5 `frontend`

Dockerfile:
[docker/frontend/Dockerfile](/Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-ui/docker/frontend/Dockerfile)

构建方式：

1. builder 阶段基于 `node:20-slim`
2. `pnpm next build`
3. 用 `tsup` 打包 `src/server.ts`
4. runtime 阶段仅复制产物和生产依赖

职责：

- UI 展示
- 调用 backend API
- 不直接与 `ontop-engine` 或 `ontop-endpoint` 通信

## 4. 运行关系

### 4.1 建模链路

```text
Frontend
  -> Backend
  -> ontop-engine
  -> 返回 metadata / ontology / mapping
  -> Backend 落盘到 /app/data/...
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
  -> Backend (/mappings/restart-endpoint)
  -> Backend 把指定 ontology/mapping/properties 复制到 active 目录
  -> Backend 调用 ontop-endpoint /ontop/restart
  -> ontop-endpoint 重新加载 active 文件
```

## 5. 为什么不是一个 Java 容器

理论上可以把 builder API 和 endpoint 合成一个 Java 容器，但当前不这么做，原因是：

1. 建模任务和在线查询生命周期不同
2. Bootstrap 失败不应影响查询端点
3. builder 服务更适合 API 化，endpoint 更适合常驻服务化
4. 后续更容易分别替换实现

因此当前采用：

- `ontop-engine`：建模期 Java 服务
- `ontop-endpoint`：在线查询 Java 服务

## 6. 与官方 Ontop 镜像的区别

当前 `ontop-endpoint` 是独立镜像，但不是官方 `ontop/ontop` 镜像。

区别如下：

1. 当前镜像是自定义封装
   基于 `eclipse-temurin:17-jre`，再复制仓库里的 `docker/ontop-cli`

2. 官方镜像由 Ontop 官方维护
   一般直接通过 image tag 升级版本

3. 当前镜像的启动逻辑由我们控制
   通过自定义 `entrypoint.sh` 管理 active 文件和 `--dev` 模式

4. 当前镜像升级依赖仓库同步 CLI 文件
   官方镜像升级则更标准、更轻运维

当前方案的优点是可控、便于快速改造；缺点是维护成本高于直接采用官方镜像。

## 7. 当前已知约束

1. `ontop-endpoint` 目前依赖仓库内的 `docker/ontop-cli`
2. active 文件切换采用“复制文件 + 远程重启”模式，不是动态热更新配置中心
3. 默认 compose 中 endpoint 宿主端口使用 `18080`
   这是为了避开宿主机已有 `8080` 占用；容器内端口仍是 `8080`

## 8. 推荐的后续演进

建议后续继续做两件事：

1. 把 `ontop-endpoint` 切换到官方 `ontop/ontop` 镜像
   这样镜像来源更标准，升级更容易

2. 补齐 Docker 文档与 UI 行为一致性
   当前 UI 已验证主链路可用，但前端“添加数据源”表单仍存在字段错位问题，需要单独修复

## 9. 常用命令

构建默认环境：

```bash
cd /Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-ui
docker compose build
```

启动默认环境：

```bash
cd /Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-ui
docker compose up -d
```

查看服务状态：

```bash
cd /Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-ui
docker compose ps
```

单独重建 builder 服务：

```bash
cd /Users/wangkai/SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/ontop-engine
docker build -t ontop-ui-ontop-engine .
```

单独重启 endpoint：

```bash
curl -X POST http://localhost:8000/api/v1/mappings/restart-endpoint \
  -H 'Content-Type: application/json' \
  -d '{}'
```
