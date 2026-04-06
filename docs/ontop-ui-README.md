# 天织 — Ontop 虚拟知识图谱管理平台

基于 [Ontop](https://ontop-vkg.org/) 的语义数据平台，提供本体管理、OBDA 映射编辑、SPARQL 查询和 AI 自然语言查询能力。对标 Microsoft Fabric IQ 本体管理功能，纯 Ontop 驱动，无需 Protégé。

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

### 7. 语义标注 `/annotations` ⭐ 新增
- Bootstrap 完成后，LLM 自动为每个类/属性生成语义标注（中英文 label + comment）
- 审核界面：待审核 / 已接受 / 已拒绝 三 Tab 管理
- 支持逐条接受/拒绝或批量操作
- 人工编辑对话框（覆盖 LLM 标注，source=human，优先级最高）
- 「合并到本体」：将 accepted 标注写入 active_ontology.ttl
- Bootstrap 重跑不丢失已审核的人工标注

### 8. 业务词汇表 `/glossary` ⭐ 新增
- 维护业务口语词（如"欠款""物业费"）→ 本体属性/类 URI 的显式映射
- LLM 自动从已审核注释推导词汇，人工条目永不被覆盖
- 全局词汇（ds_id=''）跨数据源共享，查询时自动合并
- AI 查询时按问题关键词匹配 Top-12 词汇注入 SPARQL Prompt，消除 LLM 猜测属性名
- 支持导出 / 导入 JSON，模糊搜索，按类型过滤

### 9. 本体精化建议 `/refinement` ⭐ 新增
- LLM 分析本体结构（类名、属性名、XSD 类型、层次关系），生成优先级分组建议
- 支持 6 种建议类型：RENAME_CLASS / RENAME_PROPERTY / REFINE_TYPE / ADD_LABEL / ADD_SUBCLASS / MERGE_CLASS
- 低风险类型（RENAME / REFINE_TYPE / ADD_LABEL）支持一键自动应用到 TTL，修改前自动备份 `.ttl.bak`
- 高风险类型（ADD_SUBCLASS / MERGE_CLASS）给出人工操作指引（Turtle 片段）
- 批量应用所有已接受+可自动建议

### 10. 端点注册表（后台功能）
- Bootstrap 完成后自动将本体/映射/属性文件路径写入 `endpoint_registry` 表
- 支持 `PUT /api/v1/endpoint-registry/{ds_id}/activate` 切换激活数据源
- 切换时文件同步到共享 active 目录 + 触发 Ontop reload（约 5-10s）

### 11. AI 设置 `/settings`
- 8 种 LLM Provider 选择（OpenAI / LM Studio / Ollama / DeepSeek / 智谱 / Azure / Anthropic / 自定义）
- 自动拉取模型列表
- 系统提示词编辑（支持模板变量）
- 快捷问题管理

### 8. 数据发布 `/publishing`
- **API 接入** — SPARQL 端点健康检查、API Key 生成/管理、CORS 跨域配置
- **MCP 服务** — 内置 MCP Server 一键启停（Streamable HTTP 传输）、可用工具列表（从本体自动推导）、目标平台配置片段生成（Claude Desktop / Cursor / Windsurf）
- **插件/Skills** — 四种格式工具定义一键生成与预览：OpenAI Function Calling、Anthropic Tool Use、OpenAPI 3.0、Generic JSON Schema

### 9. 系统设置 `/system`
- 用户信息展示
- 后端服务健康检查
- Ontop 端点运行状态
- 运行配置只读展示（CLI 路径、端点地址、LLM 配置）

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui |
| 后端 | Python FastAPI + httpx + OpenAI SDK + SQLite |
| 引擎 | Ontop 5.5.0 CLI + SPARQL Endpoint |
| MCP | Model Context Protocol SDK (Python mcp>=1.0.0) |
| LLM | OpenAI 兼容 API（LM Studio / Ollama / DeepSeek 等） |
| 数据库 | PostgreSQL 16 (Docker) |
| 部署 | Docker Compose，pnpm 构建 |

## 项目结构

```
ontop-ui/
├── backend/                    # FastAPI 后端
│   ├── main.py                 # 应用入口 & 生命周期
│   ├── config.py               # 配置（路径、端口、LLM，支持环境变量）
│   ├── database.py             # SQLite 初始化 & 迁移
│   ├── routers/
│   │   ├── datasources.py      # 数据源 CRUD、测试连接、Schema、Bootstrap
│   │   ├── mappings.py         # 映射文件读写、验证、端点重启
│   │   ├── sparql.py           # SPARQL 查询代理 & SQL 重写
│   │   ├── ai_query.py         # AI 自然语言查询（SSE 流式）
│   │   ├── ontology.py         # 本体文件解析
│   │   └── publishing.py       # 数据发布（API/MCP/Skills 配置）
│   ├── services/
│   │   ├── ontop_cli.py        # Ontop CLI 子进程封装
│   │   ├── ontop_endpoint.py   # SPARQL 端点进程管理
│   │   ├── obda_parser.py      # .obda 文件解析/序列化
│   │   ├── ttl_parser.py       # .ttl 本体文件解析
│   │   ├── bootstrap_service.py # 自动 Bootstrap 服务
│   │   ├── llm_service.py      # LLM 调用服务
│   │   ├── mcp_server.py       # MCP Server 生命周期管理
│   │   └── publishing_generator.py # 工具定义生成（OpenAI/Anthropic/OpenAPI）
│   ├── models/                 # Pydantic 数据模型
│   ├── repositories/           # 数据访问层
│   └── data/                   # SQLite 数据库 & 加密密钥（gitignore）
├── frontend/                   # Next.js 前端
│   ├── src/
│   │   ├── app/                # App Router 页面
│   │   │   ├── page.tsx        # 首页（仪表盘）
│   │   │   ├── datasource/     # 数据源管理
│   │   │   ├── db-schema/      # 数据库概览
│   │   │   ├── sparql/         # SPARQL 查询
│   │   │   ├── mapping/        # 映射编辑
│   │   │   ├── ai-assistant/   # AI 助手
│   │   │   ├── ontology/       # 本体可视化
│   │   │   ├── publishing/     # 数据发布（API/MCP/Skills）
│   │   │   ├── settings/       # AI 设置
│   │   │   └── system/         # 系统设置
│   │   ├── components/         # 共享组件
│   │   │   ├── sidebar-nav.tsx # 侧边栏导航
│   │   │   ├── top-bar.tsx     # 顶栏（端点状态、用户菜单）
│   │   │   └── ui/             # shadcn/ui 组件库
│   │   └── lib/
│   │       ├── api.ts          # 后端 API 封装
│   │       └── utils.ts        # 工具函数
│   └── package.json
├── docker/
│   ├── backend/Dockerfile      # 后端镜像
│   ├── frontend/Dockerfile     # 前端镜像
│   └── postgres/               # 数据库初始化 SQL
├── docker-compose.yml          # 默认环境（retail）
├── docker-compose.lvfa.yml     # LVFA / Mondial 演示环境
├── docker-compose.mysql.yml    # MySQL 电商演示环境
└── docs/
    ├── test-plan.md            # 页面测试计划
    └── screenshots/            # 测试截图
```

## 快速启动

### 前置条件

- Docker & Docker Compose
- LM Studio 或其他 OpenAI 兼容服务（AI 查询功能，可选）

### 一键启动（推荐）

```bash
# 默认 retail 环境
docker compose up -d --build

# LVFA / Mondial 演示环境
docker compose -f docker-compose.lvfa.yml up -d --build

# MySQL 电商演示环境
docker compose -f docker-compose.mysql.yml up -d --build

# 访问
# 默认前端: http://localhost:3000
# 默认后端 API: http://localhost:8000/docs
# 默认 PostgreSQL: localhost:5435 (admin/test123)
#
# LVFA 前端: http://localhost:3001
# LVFA 后端 API: http://localhost:8001/docs
# LVFA PostgreSQL: localhost:5436 (admin/test123)
#
# MySQL 前端: http://localhost:3002
# MySQL 后端 API: http://localhost:8002/docs
# MySQL DB: localhost:3307 (root/test123)
```

### 手动启动（开发模式）

**1. 启动 Demo 数据库**

```bash
docker compose -f docker-compose.lvfa.yml up -d postgres-lvfa
```

**2. 启动 `ontop-engine`**

```bash
cd ../ontop-engine
docker build -t ontop-engine:local .
docker run --rm -p 8081:8081 ontop-engine:local
```

**3. 启动后端**

```bash
cd backend
pip install -r requirements.txt
python3 -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

**4. 启动前端**

```bash
cd frontend
pnpm install
pnpm dev --port 3001
```

**5. 访问**

浏览器打开 http://localhost:3001

### 环境变量

后端配置通过环境变量覆盖（参见 `backend/config.py`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ONTOP_OUTPUT` | `./docker/backend/ontop-output` | 映射/本体文件目录 |
| `ONTOP_ENDPOINT_PORT` | `8080` | SPARQL 端点端口 |
| `ONTOP_ENDPOINT_URL` | `http://localhost:8080` | 在线查询 endpoint 地址 |
| `ONTOP_ENDPOINT_ADMIN_URL` | `http://localhost:8080` | endpoint 管理地址 |
| `ONTOP_ENGINE_URL` | `http://localhost:8081` | Native Java Ontop Builder API 地址 |
| `ONTOP_ENDPOINT_ACTIVE_DIR` | `/opt/ontop-endpoint/active` | endpoint 当前激活文件目录 |
| `LLM_BASE_URL` | `http://localhost:1234/v1` | LLM API 地址 |
| `LLM_MODEL` | `zai-org/glm-4.7-flash` | LLM 模型名 |
| `LLM_API_KEY` | `lm-studio` | LLM API Key |
| `FASTAPI_PORT` | `8000` | 后端端口 |

前端通过 `BACKEND_URL` 环境变量指定后端地址（Docker 内默认 `http://backend:8000`）。

### 当前 Docker 架构

现在三套 Compose 都遵循同一套微服务边界：

- `frontend` / `frontend-lvfa` / `frontend-mysql`：Next.js 前端
- `backend` / `backend-lvfa` / `backend-mysql`：FastAPI 业务编排层
- `ontop-engine*`：独立 Java Builder 服务，负责 metadata / bootstrap / validate
- `ontop-endpoint*`：独立 Java SPARQL Endpoint，负责 `/sparql`、`/ontop/reformulate`、`/ontop/restart`

其中：

- 默认环境端口：`3000 / 8000 / 8081 / 18080`
- LVFA 环境端口：`3001 / 8001 / 8083 / 18081`
- MySQL 环境端口：`3002 / 8002 / 8084 / 18082`

## API 概览

| 路径 | 方法 | 功能 |
|------|------|------|
| `/api/v1/health` | GET | 健康检查 |
| `/api/v1/config` | GET | 系统配置（只读） |
| `/api/v1/datasources` | GET/POST | 数据源列表/创建 |
| `/api/v1/datasources/{id}/test` | POST | 测试连接 |
| `/api/v1/datasources/{id}/schema` | GET | 获取数据库 Schema |
| `/api/v1/datasources/{id}/bootstrap` | POST | 自动生成本体+映射 |
| `/api/v1/mappings` | GET | 列出 .obda 文件 |
| `/api/v1/mappings/{path}/content` | GET/PUT | 读取/保存映射 |
| `/api/v1/mappings/{path}/validate` | POST | 验证映射 |
| `/api/v1/mappings/restart-endpoint` | POST | 重启 SPARQL 端点 |
| `/api/v1/sparql/query` | POST | 执行 SPARQL 查询 |
| `/api/v1/sparql/reformulate` | POST | 查看重写 SQL |
| `/api/v1/sparql/endpoint-status` | GET | 端点运行状态 |
| `/api/v1/ai/query` | GET (SSE) | AI 自然语言查询 |
| `/api/v1/ai/providers` | GET | LLM Provider 列表 |
| `/api/v1/ai/config` | GET/PUT | AI 模型配置 |
| `/api/v1/ai/system-prompt` | GET/PUT | 系统提示词 |
| `/api/v1/ai/quick-questions` | GET/PUT | 快捷问题 |
| `/api/v1/ai/discover-models` | POST | 自动发现可用模型 |
| `/api/v1/ontology/parse` | POST | 解析本体文件 |
| `/api/v1/publishing/config` | GET/PUT | 发布配置（API Key/CORS/MCP 开关） |
| `/api/v1/publishing/api/status` | GET | SPARQL 端点健康检查 |
| `/api/v1/publishing/api/generate-key` | POST | 生成 API Key |
| `/api/v1/publishing/mcp/status` | GET | MCP 服务状态 |
| `/api/v1/publishing/mcp/start` | POST | 启动 MCP Server |
| `/api/v1/publishing/mcp/stop` | POST | 停止 MCP Server |
| `/api/v1/publishing/mcp/tools` | GET | 列出 MCP 工具 |
| `/api/v1/publishing/mcp/config-snippet` | GET | 生成 MCP 配置片段 |
| `/api/v1/publishing/skills/generate` | GET | 生成工具定义（OpenAI/Anthropic/OpenAPI） |
| `/api/v1/annotations/{ds_id}` | GET | 列出语义注释（?status=pending\|accepted\|rejected） |
| `/api/v1/annotations/{ds_id}/stats` | GET | 注释数量统计 |
| `/api/v1/annotations/{ds_id}` | POST | 手动创建/覆盖注释（人工） |
| `/api/v1/annotations/{ds_id}/{id}` | PUT | 更新注释状态 |
| `/api/v1/annotations/{ds_id}/batch-status` | POST | 批量更新状态 |
| `/api/v1/annotations/{ds_id}/merge` | POST | 合并 accepted 注释到 active TTL |

## 数据存储

| 数据类型 | 存储方式 | 说明 |
|---------|---------|------|
| 发布配置 | SQLite | API Key（加密）、CORS、MCP 开关、Skills 格式 |
| AI 配置 | SQLite | Provider、模型、API Key |
| 查询历史 | SQLite | SPARQL 查询记录 |
| **语义注释** | **SQLite** | **LLM 生成的 label/comment（pending/accepted/rejected）** |
| 本体文件 | 文件系统 | `.ttl` 文件（raw）及 active 合并版 |
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
| **语义标注** | **`/annotations`** | **LLM 语义标注审核 + 合并（新增）** |
| 数据发布 | `/publishing` | API/MCP/插件配置与工具定义生成 |
| AI 设置 | `/settings` | 模型与提示词配置 |
| 系统设置 | `/system` | 用户信息、服务状态、运行配置 |

## MCP Server 外部接入

MCP Server 以本体数据通过 Streamable HTTP 博式暴露在 `http://<host>:<port>/mcp/mcp`，支持以下方式接入：

### Claude Desktop

编辑 `claude_desktop_config.json`（macOS） 或 Linux 下位于 `~/.claude/` 目录），添加：

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

打开 Settings → MCP → Add new MCP Server，填入地址：

```
http://localhost:8001/mcp/mcp
```

### Python 客户端（脚本测试)

安装依赖：
```bash
pip install mcp httpx
```

运行:
```bash
# 确保 MCP 服务已启动
curl -X POST http://localhost:8001/api/v1/publishing/mcp/start

# 运行外部测试脚本
python tests/test_mcp_external.py
```

在容器内测试:
```bash
docker exec ontop-lvfa-backend python3 tests/test_mcp_client.py
```

### 外部测试结果示例

```
============================================================
  MCP Server 外部客户端测试
  端点: http://localhost:8001/mcp/mcp
============================================================
  ✅ 初始化 (14ms) — server=ontop-semantic
  ✅ 列出工具 (6ms) — 4 tools
  ✅ 列出本体类 (4ms) — 14 classes, first: PropertyProject
  ✅ 查询类详情 (5ms) — 53 properties
  ✅ 查询不存在的类 (4ms) — correct error
  ✅ SPARQL 查询 (12ms)
  ✅ SPARQL 无效查询 (8ms) — correct isError
  ✅ 获取样本数据 (12ms)

  结果: 8 总计 | 8 通过 | 0 失败 | 0 跳过
============================================================
```

## 许可证

本项目仅供研究学习使用。Ontop 本身为 Apache 2.0 许可。
