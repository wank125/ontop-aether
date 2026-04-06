# ontop-aether

基于 [Ontop](https://ontop-vkg.org/) 的语义数据平台，提供本体管理、OBDA 映射编辑、SPARQL 查询和 AI 自然语言查询能力。对标 Microsoft Fabric IQ 本体管理功能，纯 Ontop 驱动，无需 Protégé。

> **项目名称**：ontop-aether（天织）
> **定位**：虚拟知识图谱全栈工作台
> **仓库**：git@github.com:wank125/ontop-aether.git

## 项目结构

```
ontop-aether/
├── ontop-backend/     # FastAPI 后端（数据源管理、AI 查询、语义增强）
│   ├── main.py        #   应用入口 & 生命周期
│   ├── config.py      #   配置（路径、端口、LLM，支持环境变量）
│   ├── routers/       #   API 路由（datasources, mappings, sparql, ai_query 等）
│   ├── services/      #   业务逻辑（ontop_client, llm_service, mcp_server 等）
│   ├── models/        #   Pydantic 数据模型
│   ├── repositories/  #   数据访问层
│   ├── Dockerfile     #   Python 3.11 镜像
│   └── requirements.txt
│
├── ontop-engine/      # Java Spring Boot 微服务（本体构建引擎）
│   ├── src/           #   Ontop 5.5.0 原生 API 调用
│   ├── Dockerfile     #   Maven + JRE 17 多阶段构建
│   └── pom.xml        #   Spring Boot 2.7.18
│
├── ontop-ui/          # Next.js 前端（工作台界面）
│   ├── src/app/       #   App Router 页面
│   ├── src/components/ #  共享组件 + shadcn/ui
│   ├── Dockerfile     #   Node 20 + pnpm 多阶段构建
│   └── package.json
│
├── ontop-endpoint/    # Ontop SPARQL 端点
│   ├── Dockerfile     #   多阶段构建，构建时下载 ontop-cli
│   ├── entrypoint.sh  #   启动脚本
│   └── seed/          #   初始本体/映射/属性文件
│
├── ontop-db/          # 数据库初始化 + 迁移
│   ├── postgres/      #   PostgreSQL init SQL（retail, lvfa, mondial）
│   ├── mysql/         #   MySQL init SQL
│   └── properties/    #   JDBC 属性文件（按环境）
│
├── ontop-output/      # 共享生成产物（.ttl, .obda, .properties）
├── ontop-test/        # 测试脚本与数据
├── benchmark/         # 性能基准数据
├── docs/              # 文档（设计文档、使用说明书、架构设计等）
├── k8s/               # Kubernetes 部署清单
├── tests/             # 集成测试
├── docker-compose.yml          # retail 环境
├── docker-compose.lvfa.yml     # LVFA / Mondial 演示环境
├── docker-compose.mysql.yml    # MySQL 电商演示环境
└── Makefile                     # 顶层构建编排
```

## 功能模块

### 1. 数据源管理 `/datasource`
- 添加/编辑/删除 JDBC 数据源（PostgreSQL、MySQL、SQL Server、Oracle）
- 测试数据库连接
- 一键 Bootstrap：从数据库 Schema 自动生成本体（OWL）+ 映射规则（.obda）

### 2. 数据库概览 `/db-schema`
- 浏览已连接数据库的表、列、外键、主键
- 搜索表名，查看列详情
- 触发 Bootstrap 预览和生成

### 3. SPARQL 查询 `/sparql`
- SPARQL 查询编辑器
- 实时执行查询，结果表格展示
- 查看 Ontop 重写后的 SQL
- 查询历史记录，支持一键重跑

### 4. 映射编辑 `/mapping`
- 读取/编辑 .obda 映射文件
- 可视化展示映射规则（Mapping ID、Target、Source）
- 映射验证（`ontop validate`）
- 重启端点应用更改

### 5. AI 助手 `/ai-assistant`
- 聊天式界面，自然语言提问
- LLM 自动生成 SPARQL → 查看重写 SQL → 查询结果
- 流式响应（SSE），逐步展示处理过程
- 快捷问题入口

### 6. 本体可视化 `/ontology`
- 基于 Vis.js 的本体关系图谱
- Tab 切换：关系图谱 / 本体定义列表
- 缩放、拖拽交互

### 7. 语义标注 `/annotations`
- Bootstrap 完成后，LLM 自动为每个类/属性生成语义标注（中英文 label + comment）
- 审核界面：待审核 / 已接受 / 已拒绝 三 Tab 管理
- 支持逐条接受/拒绝或批量操作
- 人工编辑对话框（覆盖 LLM 标注，source=human，优先级最高）
- 「合并到本体」：将 accepted 标注写入 active_ontology.ttl
- Bootstrap 重跑不丢失已审核的人工标注

### 8. 业务词汇表 `/glossary`
- 维护业务口语词（如"欠款""物业费"）→ 本体属性/类 URI 的显式映射
- LLM 自动从已审核注释推导词汇，人工条目永不被覆盖
- 全局词汇（ds_id=''）跨数据源共享，查询时自动合并
- AI 查询时按问题关键词匹配 Top-12 词汇注入 SPARQL Prompt

### 9. 本体精化建议 `/refinement`
- LLM 分析本体结构，生成优先级分组建议
- 支持 6 种建议类型：RENAME_CLASS / RENAME_PROPERTY / REFINE_TYPE / ADD_LABEL / ADD_SUBCLASS / MERGE_CLASS
- 低风险类型支持一键自动应用到 TTL
- 高风险类型给出人工操作指引

### 10. 数据发布 `/publishing`
- **API 接入** — SPARQL 端点健康检查、API Key 生成/管理、CORS 跨域配置
- **MCP 服务** — 内置 MCP Server 一键启停（Streamable HTTP 传输）
- **插件/Skills** — OpenAI Function Calling、Anthropic Tool Use、OpenAPI 3.0 工具定义生成

### 11. AI 设置 `/settings`
- 8 种 LLM Provider 选择（OpenAI / LM Studio / Ollama / DeepSeek / 智谱 / Azure / Anthropic / 自定义）
- 自动拉取模型列表
- 系统提示词编辑（支持模板变量）
- 快捷问题管理

### 12. 系统设置 `/system`
- 用户信息展示
- 后端服务健康检查
- Ontop 端点运行状态
- 运行配置只读展示

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui |
| 后端 | Python FastAPI + httpx + OpenAI SDK + SQLite |
| 构建引擎 | Java 17 + Spring Boot 2.7 + Ontop 5.5.0（原生 API，非 CLI） |
| SPARQL 端点 | Ontop CLI 5.5.0 + JRE 17 |
| MCP | Model Context Protocol SDK (Python mcp>=1.0.0) |
| LLM | OpenAI 兼容 API（LM Studio / Ollama / DeepSeek 等） |
| 数据库 | PostgreSQL 16 / MySQL 8 |
| 部署 | Docker Compose 5 容器编排 |

## 快速启动

### 前置条件

- Docker & Docker Compose
- Make（可选，用于简化命令）
- LM Studio 或其他 OpenAI 兼容服务（AI 查询功能，可选）

### Docker 部署

```bash
# retail 环境（默认）
make up
# 或
docker compose up -d --build

# LVFA / Mondial 演示环境
make up-lvfa
# 或
docker compose -f docker-compose.lvfa.yml up -d --build

# MySQL 电商演示环境
make up-mysql
# 或
docker compose -f docker-compose.mysql.yml up -d --build
```

访问地址：

| 环境 | 前端 | 后端 API | PostgreSQL | Ontop Engine | SPARQL 端点 |
|------|------|----------|------------|--------------|-------------|
| Retail | http://localhost:3000 | http://localhost:8000/docs | :5435 | :8081 | :18080 |
| LVFA | http://localhost:3001 | http://localhost:8001/docs | :5436 | :8083 | :18081 |
| MySQL | http://localhost:3002 | http://localhost:8002/docs | :3307 | :8084 | :18082 |

### 本地开发

```bash
# 后端（依赖 ontop-engine 已启动）
make dev-backend    # http://localhost:8000

# 前端
make dev-ui         # http://localhost:5000

# Java 引擎
make dev-engine     # http://localhost:8081
```

### 环境变量

后端配置通过环境变量覆盖（参见 `ontop-backend/config.py`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ONTOP_OUTPUT` | `../ontop-output` | 映射/本体文件目录 |
| `ONTOP_ENDPOINT_PORT` | `8080` | SPARQL 端点端口 |
| `ONTOP_ENDPOINT_URL` | `http://localhost:8080` | 在线查询 endpoint 地址 |
| `ONTOP_ENGINE_URL` | `http://localhost:8081` | Ontop Builder API 地址 |
| `ONTOP_ENDPOINT_ACTIVE_DIR` | `/opt/ontop-endpoint/active` | endpoint 当前激活文件目录 |
| `LLM_BASE_URL` | `http://localhost:1234/v1` | LLM API 地址 |
| `LLM_MODEL` | `zai-org/glm-4.7-flash` | LLM 模型名 |
| `FASTAPI_PORT` | `8000` | 后端端口 |

前端通过 `BACKEND_URL` 环境变量指定后端地址（Docker 内默认 `http://backend:8000`）。

## API 概览

| 路径 | 方法 | 功能 |
|------|------|------|
| `/api/v1/health` | GET | 健康检查 |
| `/api/v1/datasources` | GET/POST | 数据源列表/创建 |
| `/api/v1/datasources/{id}/test` | POST | 测试连接 |
| `/api/v1/datasources/{id}/schema` | GET | 获取数据库 Schema |
| `/api/v1/datasources/{id}/bootstrap` | POST | 自动生成本体+映射 |
| `/api/v1/mappings` | GET | 列出 .obda 文件 |
| `/api/v1/mappings/{path}/content` | GET/PUT | 读取/保存映射 |
| `/api/v1/mappings/{path}/validate` | POST | 验证映射 |
| `/api/v1/sparql/query` | POST | 执行 SPARQL 查询 |
| `/api/v1/sparql/reformulate` | POST | 查看重写 SQL |
| `/api/v1/ai/query` | GET (SSE) | AI 自然语言查询 |
| `/api/v1/ai/config` | GET/PUT | AI 模型配置 |
| `/api/v1/ontology/parse` | POST | 解析本体文件 |
| `/api/v1/annotations/{ds_id}` | GET/POST | 语义注释管理 |
| `/api/v1/annotations/{ds_id}/merge` | POST | 合并 accepted 注释到 TTL |
| `/api/v1/publishing/mcp/*` | GET/POST | MCP Server 管理 |

完整 API 列表见 `ontop-ui/` 模块下的 Swagger 文档（`/docs`）。

## 数据存储

| 数据类型 | 存储方式 | 说明 |
|---------|---------|------|
| 数据源配置 | SQLite | JDBC 连接信息（密码加密） |
| AI 配置 | SQLite | Provider、模型、API Key |
| 语义注释 | SQLite | LLM 生成的 label/comment |
| 查询历史 | SQLite | SPARQL 查询记录 |
| 本体文件 | 文件系统 | `.ttl` 文件 |
| 映射文件 | 文件系统 | `.obda` 文件 |
| 连接属性 | 文件系统 | `.properties` 文件 |

## 页面一览

| 页面 | 路由 | 功能 |
|------|------|------|
| 仪表盘 | `/` | 统计概览、能力卡片、快速开始 |
| 数据源管理 | `/datasource` | 数据库连接管理 + Bootstrap |
| 数据库概览 | `/db-schema` | 表结构浏览 |
| SPARQL 查询 | `/sparql` | 查询编辑与执行 |
| 映射编辑 | `/mapping` | OBDA 映射管理 |
| AI 助手 | `/ai-assistant` | 自然语言转 SPARQL |
| 本体可视化 | `/ontology` | 关系图谱展示 |
| 语义标注 | `/annotations` | LLM 语义标注审核 + 合并 |
| 词汇表 | `/glossary` | 业务词汇管理 |
| 精化建议 | `/refinement` | 本体精化建议管理 |
| 数据发布 | `/publishing` | API/MCP/插件配置 |
| AI 设置 | `/settings` | 模型与提示词配置 |
| 系统设置 | `/system` | 用户信息、服务状态 |

## MCP Server 外部接入

MCP Server 通过 Streamable HTTP 模式暴露在 `http://<host>:<port>/mcp/mcp`：

### Claude Desktop

```json
{
  "mcpServers": {
    "ontop-semantic": {
      "url": "http://localhost:8001/mcp/mcp"
    }
  }
}
```

### Cursor / Windsurf

```
http://localhost:8001/mcp/mcp
```

## 许可证

本项目仅供研究学习使用。Ontop 本身为 Apache 2.0 许可。
