# v0.3.0 — 多 Repository 零切换时间端点支持

## 变更日期
2026-04-07

## 变更概述

本次发布实现 ontop-endpoint 多 Repository 实例支持，消除数据源切换时的 5-10 秒服务中断。

**核心变更**：
- ontop-endpoint 内维护多个 `OntopVirtualRepository` 实例（每个已 Bootstrap 数据源一个）
- 通过 `/{dsId}/sparql` 路径参数路由查询，实现零切换时间
- 保留 `/sparql` 无参路由向后兼容
- Repository 管理 API（注册/注销/激活/重启）

---

## 一、ontop-endpoint 变更

### 新增文件

| 文件 | 说明 |
|------|------|
| `config/RepositoryEntry.java` | 单个 Repository 元数据 + 实例引用 |
| `config/RepositoryRegistry.java` | ConcurrentHashMap 管理多 Repository（register/unregister/get/restart） |
| `controller/RepositoryManagementController.java` | REST API（`/api/v1/repositories`）管理 Repository 生命周期 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `config/OntopRepositoryConfig.java` | 从单例 Repository 改为委托 RepositoryRegistry；启动时自动从 `ontop.repos-dir` 加载 |
| `controller/SparqlController.java` | 新增 `/{dsId}/sparql` 路由（GET/POST），从 registry 获取 Repository |
| `controller/RestartController.java` | 新增 `/{dsId}/restart` 按数据源重启 |
| `controller/HealthController.java` | 返回 `active_ds_id` + `total_repositories`；新增 `/{dsId}/health` |
| `controller/ReformulateController.java` | 新增 `/{dsId}/ontop/reformulate` |
| `controller/OntologyFetcherController.java` | 新增 `/{dsId}/ontology` |
| `application.properties` | 新增 `ontop.repos-dir`、`ontop.active-ds-id` 配置 |
| `Dockerfile` | 改为 Maven 多阶段构建自定义 Spring Boot 应用 |
| `pom.xml` | 新增 Spring Boot + Ontop 依赖 |

### 关键设计

- **线程安全**：ConcurrentHashMap + synchronized register/unregister + volatile activeDsId
- **启动自动加载**：扫描 `ontop.repos-dir` 子目录，每个子目录为一个 dsId
- **向后兼容**：`/sparql` 使用当前激活 Repository，未注册时返回 503

---

## 二、ontop-engine 变更

### 新增文件

| 文件 | 说明 |
|------|------|
| `api/RepositoryProxyController.java` | 代理 endpoint 的 Repository 管理 API（6 端点） |

### 修改文件

| 文件 | 变更 |
|------|------|
| `service/SparqlProxyService.java` | `executeQuery` 支持 dsId 路由到 `{endpoint}/{dsId}/sparql` |
| `service/EndpointSwitcherService.java` | `switchToDatasource` 优先通过 API 注册 Repository，fallback 到文件复制 |
| `api/SparqlProxyController.java` | 新增 `POST /{dsId}/query`、`POST /{dsId}/reformulate` |
| `model/SparqlQueryRequest.java` | 新增 `dsId` 字段 |

---

## 三、ontop-ui 变更

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/lib/api.ts` | `sparql.query/reformulate` 新增 dsId 参数；新增 `repositories` API 对象（list/register/unregister/activate/restart/health） |
| `src/server.ts` | 新增 `/api/v1/repositories` 路由到 engine |
| `next.config.ts` | 新增 `/api/v1/repositories` rewrites |

---

## 四、Docker / 部署变更

| 变更 | 说明 |
|------|------|
| `docker-compose.yml` | ontop-endpoint 内存增至 2g；新增 `ONTOP_REPOS_DIR` 环境变量；新增 `./ontop-repos:/opt/ontop-repos` 卷 |
| ontop-endpoint 镜像 | 从 CLI 包装改为自定义 Spring Boot 应用 |

---

## 五、文档更新

| 文档 | 变更 |
|------|------|
| `README.md` | 更新服务职责表、路由表、项目结构 |
| `docs/架构设计.md` | 更新语义执行层描述、SPARQL 查询流程图、架构风险与演进方向 |
| `docs/功能设计文档.md` | 更新端点注册表章节、多数据源切换流程 |
| `docs/使用说明书.md` | 更新端点注册表与多 Repository 管理章节 |
| `docs/Docker镜像设计说明.md` | 更新 ontop-endpoint 镜像说明、切换链路图 |
| `docs/ontop-ui-README.md` | 更新路由表、服务职责表 |
