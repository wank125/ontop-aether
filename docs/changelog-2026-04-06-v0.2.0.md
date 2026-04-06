# v0.2.0 — Ontop Engine API 契约化 + 本体精化建议全链路修复

## 变更日期
2026-04-06

## 变更概述

本次发布包含两项核心改进：
1. **ontop-engine Java 微服务 API 契约化**：统一响应信封、健康检查、版本接口、物化端点、结构化错误
2. **ontop-ui 本体精化建议全链路 bug 修复**：LLM JSON 解析、REFINE_TYPE 应用、active TTL 路径

---

## 一、ontop-engine 变更（v0.2.0 tag: `2314de9`）

### 1. 统一响应信封

所有 `/api/ontop/*` 端点统一使用 `ApiEnvelope<T>` 包装：

```json
{
  "success": true,
  "message": "Bootstrap completed",
  "requestId": "bed59c49",
  "durationMs": 173,
  "data": { "ontology": "...", "mapping": "...", "message": "..." }
}
```

**新增文件：**
- `model/ApiEnvelope.java` — 泛型响应信封，含 `ok()` / `fail()` 工厂方法

**修改文件：**
- `api/OntopController.java` — 所有方法包装 `requestId`（8位 UUID）+ `System.currentTimeMillis()` 计时 + SLF4J 日志

### 2. 错误响应规范化

**修改 `config/GlobalExceptionHandler.java`：**
- 业务异常（`IllegalArgumentException`/`RuntimeException`）→ 400 + `{ success, message, requestId, errorType }`
- 系统异常 → 500 + 同结构（隐藏内部细节）
- 校验异常（`MethodArgumentNotValidException`）→ 400 + 字段级错误
- 不再返回完整 stack trace

### 3. 健康检查 + 版本接口

**新增 `api/HealthController.java`：**

```
GET /health  → { "status": "UP", "uptimeSeconds": 9000, "ontopVersion": "5.5.0" }
GET /version → { "version": "0.1.0", "ontopVersion": "5.5.0", "javaVersion": "17", "springBootVersion": "2.7.18" }
```

### 4. Materialize 端点

**新增文件：**
- `model/MaterializeRequest.java` — mappingContent, ontologyContent, jdbc, format(turtle/ntriples), sparqlQuery(可选)
- `model/MaterializeData.java` — tripleCount, output, format

**修改 `service/OntopEngineService.java`：**
- 新增 `materialize()` 方法
- 全量物化：序列化本体 + 解析映射 triple map 模板
- 查询物化（sparqlQuery 非 null）：返回提示使用 SPARQL 端点
- 50MB 输出上限防止 OOM

**修改 `api/OntopController.java`：**
- 新增 `POST /api/ontop/materialize`（异步）

---

## 二、ontop-ui 变更（v0.2.0 tag: `d6e25ef`）

### 1. ontop_client.py 适配 Engine API 契约

**修改 `services/ontop_client.py`：**
- 新增 `_parse_envelope()` 解析统一信封
- 所有方法（extract_db_metadata/bootstrap/validate）适配 `body.get("data")` 取业务载荷
- 实现 `materialize()` 真实调用（替换原来的 `del` + `return False` 空壳）
- 新增 `health()` → `GET /health`
- 新增 `version()` → `GET /version`

**修改 `services/ontop_cli.py`：**
- 同步导出 `health`、`version`、`materialize`

### 2. 本体精化建议全链路 bug 修复

**修改 `services/ontology_advisor.py`：**
- 修复 `background_tasks.add_task(asyncio.create_task, fn())` → `background_tasks.add_task(fn)`（3 处）
- 修复 LLM JSON 输出解析：新增 `_repair_and_parse_json()` + `_fix_json_object()` 处理未闭合引号
- 从失败输出中成功恢复 70+ 条建议
- `max_tokens` 从 2048 提升到 4096
- 移除重复 `import re`

**修改 `services/suggestion_applicant.py`：**
- 重写 `_refine_xsd_type()`：双策略（替换已有 `rdfs:range` / 追加新 `rdfs:range`）
- 移除 `upsert_annotation()` 调用中多余的 `status="pending"` 参数

**修改 `routers/suggestions.py`：**
- 新增 `_resolve_active_ttl()`：优先使用 `active_dir/merged_ontology.ttl` 而非 `ontology_path`
- 单条和批量应用都使用正确的 active TTL 路径

**修改 `routers/datasources.py`：**
- 修复 `ds_record.name` → `ds_record["name"]`（字典属性访问）

**修改 `routers/endpoint_registry.py`：**
- 修复 `background_tasks.add_task` 模式

### 3. 功能设计文档更新

**修改 `docs/功能设计文档.md`：**
- 新增 7.11-7.15 节（语义注释、词汇表、精化建议、端点注册表、API Key 鉴权）
- 新增主流程四（语义增强）和主流程五（多数据源切换）
- 更新功能与接口映射表

**修改 `docs/使用说明书.md`：**
- 新增 7.14 API Key 鉴权说明
- 新增 REFINE_TYPE/LLM JSON 修复相关已知限制

**修改 `docs/架构设计.md`：**
- 反映 Ontop Engine（Java 微服务）取代 CLI 子进程调用
- 新增 API 契约表和统一信封说明
- 更新部署架构（5 容器）、安全设计、数据模型

---

## 验证结果

| 测试项 | 结果 |
|--------|------|
| GET /health | `{ "status": "UP", "uptimeSeconds": 14 }` |
| GET /version | `{ "version": "0.1.0", "ontopVersion": "5.5.0", "javaVersion": "17" }` |
| POST /api/ontop/bootstrap | `success=true, requestId=bed59c49, durationMs=173` |
| POST /api/ontop/extract-metadata | 信封正确（业务凭据错误时返回结构化错误） |
| Python backend /datasources/test | `connected: true` |
| Python backend /datasources/schemas | 正常返回 3 个 schema |
| 精化建议 analyze | 3 轮分别生成 74/52/38 条（含 JSON repair 兜底） |
| REFINE_TYPE apply | 成功追加 `rdfs:range xsd:integer` 到 active TTL |
| ADD_LABEL apply | 成功写入语义注释层 |
| ADD_SUBCLASS apply | 正确拒绝自动应用（422） |
