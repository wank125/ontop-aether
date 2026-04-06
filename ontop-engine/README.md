# onto-engine

`onto-engine` 是一个独立的 Native Java Ontop 微服务，负责把 Ontop 的建模期能力以 REST API 方式暴露出来。

它的设计目标是替代“Python 容器中通过 CLI 子进程调用 Ontop”的旧模式，把 Ontop 直接运行在 JVM 内存中。

## 服务职责

这个服务只负责 Ontop 的建模期能力，不负责在线 SPARQL 查询。

当前职责包括：

- 提取数据库元数据
- 执行 Bootstrap，生成 ontology 与 mapping
- 校验 ontology 与 mapping

不包含的职责：

- 不提供 `/sparql` 在线查询
- 不负责持久化版本文件
- 不负责 active 映射切换
- 不负责前端或业务流程编排

这些职责由 `ontop-ui` 中的其它服务承担。

## API

默认监听端口：`8081`

基础路径：`/api/ontop`

### 1. 提取元数据

`POST /api/ontop/extract-metadata`

请求体示例：

```json
{
  "jdbc": {
    "jdbcUrl": "jdbc:postgresql://postgres:5432/retail_db",
    "user": "admin",
    "password": "test123",
    "driver": "org.postgresql.Driver"
  }
}
```

返回：

- `success`
- `metadataJson`
- `message`

### 2. Bootstrap

`POST /api/ontop/bootstrap`

请求体示例：

```json
{
  "baseIri": "http://example.com/retail/",
  "jdbc": {
    "jdbcUrl": "jdbc:postgresql://postgres:5432/retail_db",
    "user": "admin",
    "password": "test123",
    "driver": "org.postgresql.Driver"
  }
}
```

返回：

- `success`
- `ontology`
- `mapping`
- `message`

说明：

- `ontology` 是本体文本内容
- `mapping` 是 Ontop native mapping 文本内容
- 服务本身不直接写文件

### 3. 校验

`POST /api/ontop/validate`

请求体示例：

```json
{
  "mappingContent": "[PrefixDeclaration] ...",
  "ontologyContent": "@prefix owl: <http://www.w3.org/2002/07/owl#> .",
  "jdbc": {
    "jdbcUrl": "jdbc:postgresql://postgres:5432/retail_db",
    "user": "admin",
    "password": "test123",
    "driver": "org.postgresql.Driver"
  }
}
```

返回：

- `success`
- `message`

## 构建方式

### 本地 Maven 构建

```bash
cd onto-engine
mvn -DskipTests package
```

产物位置：

```bash
target/ontop-engine-0.1.0.jar
```

### 本地运行

```bash
cd onto-engine
java -jar target/ontop-engine-0.1.0.jar
```

### Docker 构建

```bash
cd onto-engine
docker build -t onto-engine .
```

### Docker 运行

```bash
docker run --rm -p 8081:8081 onto-engine
```

## 技术实现

当前技术栈：

- Java 17
- Spring Boot 2.7
- Ontop 5.5.0

实现方式不是通过 CLI 拉起外部 Java 进程，而是直接调用 Ontop 底层 API，例如：

- `DBMetadataExtractorAndSerializer`
- `DirectMappingBootstrapper`
- `OntopSQLOWLAPIConfiguration`

这意味它是一个真正的 Native Java Ontop service，而不是“CLI 套壳服务”。

### 性能与高并发优化设定 (v0.1.0)
为了在真实的企业图谱场景中保持高可用和低延迟，服务内集成了以下云原生优化：

1. **Docker 自适应内存**：取消了硬编码的 `-Xmx`，升级为 `-XX:MaxRAMPercentage=75.0`。可在 `docker-compose.yml` 中无缝弹性调整容器内存限额。
2. **LRU 配置缓存 (Caffeine)**：因 Ontop `Injector` 在使用 `build()` 时会有长达数百毫秒的 DI 依赖注入与 JDBC 池初始化耗时。服务内部使用了 Caffeine 缓存机制，对经常访问同配置数据源的操作实现了 **零冷启动延迟**。
3. **全局防雪崩拦截 (Global Exception HTTP 400)**：自动捕获 Ontop 底层各种诸如连接失败、冲突等异常，优雅降级返回 HTTP 400 而不是默认 HTTP 200，保证上游 Python 端 `httpx.HTTPStatusError` 的精准处理。
4. **异步队列隔离 (@Async)**：针对 `ExtractMetadata` 和 `Bootstrap` 这种潜在耗时操作，配置了专用的带界（Bounded）线程池 `ontopTaskExecutor`，保护主 Web 容器 (Tomcat) 线程池不被阻塞榨干。

## 与 `ontop-ui` 的关系

`ontop-ui` 把整个系统拆成了多个服务：

- `frontend`：Next.js 前端
- `backend`：FastAPI 业务编排层
- `ontop-engine`：建模期 Java 服务
- `ontop-endpoint`：在线查询 Java 服务

在这套架构里：

1. `ontop-ui/backend` 调用 `ontop-engine`
2. `ontop-engine` 返回文本结果
3. `ontop-ui/backend` 再把这些结果落地为版本文件
4. `ontop-ui/backend` 决定哪组文件切换为 active
5. `ontop-endpoint` 负责读取 active 文件并提供在线 SPARQL 查询

也就是说：

- `ontop-engine` 负责“算”
- `ontop-ui/backend` 负责“存”和“编排”
- `ontop-endpoint` 负责“查”

## 当前边界

这个仓库当前只关注 builder 能力，不包含：

- SPARQL endpoint 容器
- 前端页面
- SQLite 元数据管理
- 版本化文件管理

如果未来需要扩展，本服务仍建议继续保持 builder-api 角色，而不要和在线查询 endpoint 合并。
