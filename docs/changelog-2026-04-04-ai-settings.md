# AI 设置独立页面 — 多协议 LLM 配置

## 变更日期
2026-04-04

## 变更概述
新增独立的 AI 设置页面（`/settings`），支持多种 LLM 协议/提供商配置，以及系统提示词编辑和快捷问题管理。

## 详细变更

### 1. 后端 — AI 配置 API (`backend/routers/ai_query.py`)

**新增 Provider 预设系统**，支持 8 种 LLM 提供商：

| Provider | 标识 | 默认 Base URL |
|----------|------|---------------|
| LM Studio | `lm_studio` | `http://localhost:1234/v1` |
| Ollama | `ollama` | `http://localhost:11434/v1` |
| OpenAI | `openai` | `https://api.openai.com/v1` |
| DeepSeek | `deepseek` | `https://api.deepseek.com/v1` |
| 智谱 AI | `zhipu` | `https://open.bigmodel.cn/api/paas/v4` |
| Azure OpenAI | `azure_openai` | 资源地址模板 |
| Anthropic Claude | `anthropic` | `https://api.anthropic.com` |
| 自定义 | `custom` | 用户自填 |

**新增 API 端点：**
- `GET /ai/providers` — 返回所有提供商预设（label、base_url、推荐模型列表）
- `GET /ai/config` — 返回当前配置（API Key 脱敏）
- `PUT /ai/config` — 更新模型配置（provider、base_url、model、temperature、max_tokens）
- `GET /ai/system-prompt` — 获取系统提示词模板
- `PUT /ai/system-prompt` — 更新系统提示词模板
- `GET /ai/quick-questions` — 获取快捷问题列表
- `PUT /ai/quick-questions` — 更新快捷问题列表

**AI 查询流水线改进：**
- ontology-summary 属性提取修复：只匹配 `<uri> {column}` 模式，不再混入 URI 模板片段
- SPARQL 执行前自动注入缺失的 PREFIX 声明
- 支持自定义系统提示词模板
- 配置持久化到 `backend/data/ai_config.json`

### 2. 后端 — LLM 服务 (`backend/services/llm_service.py`)

- 重构为模块级可变状态，支持运行时 `reload_client()` 动态切换模型
- `build_sparql_prompt()` 新增 `template` 参数，支持自定义提示词模板
- 删除硬编码的旧 SPARQL_SYSTEM_PROMPT，改为由 router 层管理

### 3. 后端 — 配置 (`backend/config.py`)

- 新增 `AI_CONFIG_FILE` 路径常量（`data/ai_config.json`）

### 4. 前端 — 设置页面 (`frontend/src/app/settings/page.tsx`)

新页面，三个 Tab：

**模型设置 Tab：**
- 提供商卡片选择器（8 种，可视化图标 + 标签）
- 切换提供商时自动填充 Base URL 和推荐模型
- API Base URL 输入框（附协议提示）
- 模型选择（预设下拉 + 自定义输入）
- API Key（可显隐切换，本地模型标注"可不填"）
- Temperature 滑条（0~1，精确/平衡/创意标注）
- Max Token 选择器（256/512/1024/2048/4096）
- 连接提示区域（按不同 provider 显示不同指引）
- 未保存/已保存状态标记 + 撤销修改按钮

**提示词编辑 Tab：**
- SPARQL 生成提示词完整编辑器（monospace textarea）
- 模板变量说明（{classes}、{properties}、{relationships}、{prefixes}）
- 字符计数 + 未保存/已保存标记

**快捷问题 Tab：**
- 问题列表（序号 + 内容 + 删除按钮）
- 添加新问题（输入框 + Enter 快捷添加）
- 保存/撤销操作

### 5. 前端 — 侧边栏导航 (`frontend/src/components/sidebar-nav.tsx`)

- 导航项新增 "AI 设置"（齿轮图标，路由 `/settings`）
- 底部设置按钮改为 Link 导航到 `/settings`

### 6. 前端 API (`frontend/src/lib/api.ts`)

- 新增 `AIConfig`、`QuickQuestion` 类型定义
- `ai` 对象新增：`getConfig`、`updateConfig`、`getSystemPrompt`、`updateSystemPrompt`、`getQuickQuestions`、`updateQuickQuestions`

## 数据存储

- AI 配置文件：`backend/data/ai_config.json`（JSON，含 provider、base_url、model、temperature、max_tokens、system_prompt、quick_questions）
- 未变更的默认值不写入文件
- API Key 与默认值相同时脱敏存储

## 测试验证

- SPARQL AI 查询流水线已验证通过（正确生成 PREFIX + cls: 命名空间）
- 前端 `/settings` 页面可正常访问
- 所有 8 种 Provider 的 API 均可返回预设数据
- `next build` 编译通过，无错误
