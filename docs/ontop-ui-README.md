# 天织 ontop-aether — Ontop 虚拟知识图谱管理平台

基于 [Ontop](https://ontop-vkg.org/) 的语义数据平台，提供本体管理、OBDA 映射编辑、SPARQL 查询、AI 自然语言查询和平台治理能力。对标 Microsoft Fabric IQ 本体管理功能，纯 Ontop 驱动，无需 Protégé。

## 功能模块

### 1. 数据源管理 `/datasource`
- 添加/编辑/删除 JDBC 数据源（PostgreSQL、MySQL、SQL Server、Oracle）
- 测试数据库连接（Java 进程内调用，无 HTTP 开销）
- 一键 Bootstrap：从数据库 Schema 自动生成本体（OWL）+ 映射规则（.obda）
- 数据库结构探查：schema 列表、表/列/外键/主键详情

### 2. SPARQL 查询 `/sparql`
- SPARQL 查询编辑器，实时执行，结果表格展示
- 查看 Ontop 重写后的 SQL（reformulate）
- 查询历史记录，支持一键重跑、删除
- 端点健康状态实时检测
- 支持 JSON / XML / CSV / Turtle 格式

### 3. 映射编辑 `/mapping`
- 读取/编辑 .obda 映射文件
- 可视化展示映射规则（Mapping ID、Target、Source）
- 映射验证（`ontop validate`，进程内调用）
- 重启端点应用更改

### 4. AI 助手 `/ai-assistant`
- 聊天式界面，自然语言提问
- LLM 自动生成 SPARQL → 查看重写 SQL → 查询结果
- 流式响应（SSE），逐步展示处理过程
- 快捷问题入口

### 5. 本体可视化 `/ontology`
- 解析 .ttl 文件，展示 OWL 类、对象属性、数据属性
- 基于 Vis.js 的本体关系图谱
- Tab 切换：关系图谱 / 本体定义列表

### 6. 语义标注 `/annotations`
- Bootstrap 后 LLM 自动为类/属性生成中英文语义标注
- 审核界面：待审核 / 已接受 / 已拒绝 三 Tab 管理
- 逐条或批量操作，人工编辑覆盖 LLM 标注（source=human，优先级最高）
- 「合并到本体」写入 active_ontology.ttl

### 7. 业务词汇表 `/glossary`
- 业务口语词（如"欠款""物业费"）→ 本体属性/类 URI 的显式映射
- LLM 自动推导 + 人工条目（永不被覆盖）
- AI 查询时按关键词匹配 Top-12 词汇注入 SPARQL Prompt
- 导出/导入 JSON，模糊搜索，按类型过滤

### 8. 本体精化建议 `/refinement`
- LLM 分析本体结构，生成 6 种建议类型
- 低风险类型（RENAME / REFINE_TYPE / ADD_LABEL）一键自动应用
- 高风险类型（ADD_SUBCLASS / MERGE_CLASS）给出操作指引

### 9. 数据发布 `/publishing`
- API 接入：SPARQL 端点健康检查、API Key 管理、CORS 配置
- MCP 服务：一键启停、工具列表自动推导、多平台配置片段生成
- 工具定义：OpenAI Function Calling / Anthropic Tool Use / OpenAPI 3.0 / Generic JSON Schema

### 10. AI 设置 `/settings`
- 8 种 LLM Provider（OpenAI / LM Studio / Ollama / DeepSeek / 智谱 / Azure / Anthropic / 自定义）
- 自动拉取模型列表，系统提示词编辑，快捷问题管理

### 11. 平台治理 `/governance`
- **项目管理**：多租户、多项目、固定环境（dev/test/prod）
- **访问控制**：RBAC，8 内置角色 + 16 权限，角色绑定
- **API Key 管理**：`oak_` 格式密钥，双轨认证（密码 + API Key）
- **审计日志**：自动记录所有 HTTP 请求，支持查询与筛选

### 12. 端点注册表（后台功能）
- Bootstrap 完成后自动注册到多 Repository 端点
- 多个数据源可同时查询，通过 `/{dsId}/sparql` 路径路由
- `PUT /api/v1/endpoint-registry/{ds_id}/activate` 切换默认激活数据源（零切换时间）
- `GET /api/v1/repositories` 查看所有已注册 Repository 状态

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui |
| 后端（业务） | Python FastAPI + httpx + OpenAI SDK + SQLite |
| 引擎（CRUD） | Java Spring Boot + JdbcTemplate + OWLAPI + SQLite |
| 端点 | Ontop 5.5.0 SPARQL Endpoint（Spring Boot 原生，多 Repository 支持） |
| MCP | Model Context Protocol SDK (Python mcp>=1.0.0) |
| LLM | OpenAI 兼容 API（LM Studio / Ollama / DeepSeek 等） |
| 数据库 | PostgreSQL 16 (Docker) |
| 部署 | Docker Compose，pnpm 构建 |

## 双后端架构

前端 `server.ts` 根据路径前缀将请求路由到不同后端：

| 路径 | 目标 | 说明 |
|------|------|------|
| `/api/v1/datasources` + CRUD | ontop-engine (Java :8081) | 数据源管理、测试连接、Schema |
| `/api/v1/datasources/*/bootstrap` | ontop-backend (Python :8000) | Bootstrap 需要 LLM |
| `/api/v1/endpoint-registry` | ontop-engine (Java) | 端点注册表、切换 |
| `/api/v1/mappings` | ontop-engine (Java) | 映射文件读写、验证 |
| `/api/v1/ontology` | ontop-engine (Java) | TTL 文件解析 |
| `/api/v1/sparql/*` | ontop-engine (Java) | SPARQL 代理 + 历史记录（支持按 dsId 路由） |
| `/api/v1/repositories/*` | ontop-engine (Java) | 多 Repository 管理（注册/注销/激活/重启） |
| `/api/v1/auth/*` | ontop-backend (Python) | 认证 |
| `/api/v1/ai/*` | ontop-backend (Python) | AI 自然语言查询 |
| `/api/v1/annotations/*` | ontop-backend (Python) | 语义标注 |
| `/api/v1/glossary/*` | ontop-backend (Python) | 业务词汇表 |
| `/api/v1/governance/*` | ontop-backend (Python) | 平台治理 |
| `/api/v1/publishing/*` | ontop-backend (Python) | 数据发布 |

### SQLite 共享访问

Java 和 Python 共享同一个 SQLite 数据库文件（WAL 模式 + busy_timeout=5000）：

| 服务 | 管理的表 |
|------|---------|
| ontop-engine (Java) | datasources, endpoint_registry, query_history |
| ontop-backend (Python) | ai_config, semantic_annotations, business_glossary, users, sessions, ontology_suggestions, publishing_config, 治理相关表 |

### Java 迁移关键实现

- **Fernet 加密**：纯 Java 实现 AES-128-CBC + HMAC-SHA256，零迁移读取 Python 生成的加密 token
- **进程内调用**：test-connection、schema 提取、mapping 解析/验证直接调用 OntopEngineService，无 HTTP 开销
- **OBDA 序列化**：Java 端直接读写 .obda 文件
- **OWLAPI**：解析 .ttl 本体文件，提取类/属性结构

## 项目结构

```
ontop-aether/
├── ontop-ui/                     # Next.js 前端
│   ├── src/app/                  # 页面路由
│   ├── src/components/           # UI 组件
│   ├── src/lib/api.ts            # API 客户端
│   ├── src/lib/auth.tsx          # 认证管理
│   └── src/server.ts             # Node 服务 + API 路由代理
├── ontop-backend/                # FastAPI 后端（AI/LLM/标注/词汇表/治理）
│   ├── main.py                   # 应用入口
│   ├── database.py               # SQLite 初始化
│   ├── routers/                  # API 路由
│   ├── services/                 # 业务逻辑
│   └── repositories/             # 数据访问
├── ontop-engine/                 # Spring Boot 引擎（CRUD/映射/SPARQL 代理）
│   └── src/main/java/.../ontopengine/
│       ├── api/                  # REST 控制器
│       ├── service/              # 业务服务
│       ├── repository/           # JdbcTemplate 数据访问
│       ├── model/                # DTO
│       └── config/               # SQLite + RestTemplate + 加密
├── ontop-endpoint/               # Ontop SPARQL Endpoint（多 Repository 支持）
├── ontop-repos/                  # 多 Repository 持久化数据
├── ontop-db/                     # 数据库初始化脚本
├── ontop-output/                 # 共享产物（.ttl, .obda, .properties）
├── docker-compose.yml            # 默认 retail 环境
├── docker-compose.lvfa.yml       # LVFA / Mondial 演示环境
└── docker-compose.mysql.yml      # MySQL 演示环境
```

## Docker 端口映射

| 环境 | 前端 | 后端 | 引擎 | 端点 | PostgreSQL |
|------|------|------|------|------|-----------|
| retail | :3000 | :8000 | :8081 | :18080 | :5433 |
| lvfa | :3001 | :8001 | :8083 | :18081 | :5436 |
| mysql | :3002 | :8002 | :8084 | :18082 | :5434 |
