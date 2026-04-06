# P1-A 平台治理 — 实现说明

> 版本：v0.2.0 | 日期：2026-04-06
>
> 本文档记录 P1-A 阶段平台治理功能的实际实现细节，作为设计文档的补充。
> 原始设计文档见 `SynologyDrive/20-本体建模/18-microsoft-fabric-ontology/todo/P1-A-platform-governance-design.md`。

---

## 1. 实现范围

### 已实现（P1-A）

| 治理能力 | 说明 |
|---------|------|
| 多租户 / 项目 / 环境 | 固定三环境(dev/test/prod)，默认租户和项目自动创建 |
| RBAC 权限 | 8 个内置角色 + 16 个最小权限，admin 用户自动绑定 platform_admin |
| API Key 独立化 | `oak_{env}_{public}.{secret}` 格式，双轨认证（新 Key + 旧 Key 兜底）|
| 统一审计 | 每次请求自动记录审计事件，自动清理超过 10000 条的旧记录 |
| 前端治理页面 | 项目管理、访问控制、审计日志三个页面 |
| 上下文隔离 | 通过请求头 X-Project-Id / X-Environment-Id 传递治理上下文 |

### 暂不实现（P2+）

- 变更审批流程（change_requests / change_request_approvals）
- 发布对象版本管理（release_versions / deployment_records）
- 项目/环境选择器（top-bar 组件）
- 系统设置页面的治理信息展示

---

## 2. 数据模型

### 2.1 新增表（9 张）

#### tenants — 租户

| 列名 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| code | TEXT UNIQUE | 租户编码 |
| name | TEXT | 租户名称 |
| description | TEXT | 描述 |
| status | TEXT | active / suspended |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |

#### projects — 项目

| 列名 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| tenant_id | TEXT FK | 所属租户 |
| code | TEXT UNIQUE | 项目编码 |
| name | TEXT | 项目名称 |
| description | TEXT | 描述 |
| owner_user_id | TEXT | 项目负责人 |
| status | TEXT | active / archived |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |

#### environments — 环境

| 列名 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | 所属项目 |
| name | TEXT | dev / test / prod |
| display_name | TEXT | 开发 / 测试 / 生产 |
| endpoint_url | TEXT | 环境端点 URL |
| active_registry_id | TEXT | 当前激活的 endpoint 注册 |
| settings_json | TEXT | 环境配置 JSON |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |

UNIQUE(project_id, name)

#### roles — 角色

| 列名 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| code | TEXT UNIQUE | 角色编码 |
| name | TEXT | 角色名称 |
| scope_type | TEXT | platform / project / environment |
| is_system | INTEGER | 是否系统内置 |
| created_at | TEXT | ISO 8601 |

#### permissions — 权限

| 列名 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| code | TEXT UNIQUE | 权限编码 |
| name | TEXT | 权限名称 |
| resource_type | TEXT | 资源类型 |
| action | TEXT | read / write |
| created_at | TEXT | ISO 8601 |

#### role_permissions — 角色-权限映射

| 列名 | 类型 | 说明 |
|------|------|------|
| role_id | TEXT FK | 角色 ID |
| permission_id | TEXT FK | 权限 ID |

复合主键 (role_id, permission_id)

#### role_bindings — 用户角色绑定

| 列名 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| user_id | TEXT FK | 用户 ID |
| role_id | TEXT FK | 角色 ID |
| tenant_id | TEXT | 租户范围 |
| project_id | TEXT | 项目范围 |
| environment_id | TEXT | 环境范围 |
| created_by | TEXT | 创建者 |
| created_at | TEXT | ISO 8601 |

#### api_credentials — API 密钥

| 列名 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| tenant_id | TEXT | 租户 |
| project_id | TEXT | 项目 |
| environment_id | TEXT | 环境 |
| name | TEXT | 密钥名称 |
| type | TEXT | human / agent / integration / system |
| key_prefix | TEXT | 前缀（用于查找） |
| secret_hash | TEXT | SHA256(secret) |
| allowed_scopes_json | TEXT | 允许的操作范围 |
| allowed_ips_json | TEXT | IP 白名单 |
| status | TEXT | active / revoked / expired |
| expires_at | TEXT | 过期时间 |
| last_used_at | TEXT | 最后使用时间 |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |

#### audit_events — 审计事件

| 列名 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| tenant_id | TEXT | 租户 |
| project_id | TEXT | 项目 |
| environment_id | TEXT | 环境 |
| event_type | TEXT | 事件类型 |
| event_category | TEXT | governance / data / auth |
| actor_type | TEXT | user / api_key / system |
| actor_id | TEXT | 操作者 ID |
| actor_display | TEXT | 操作者显示名 |
| action | TEXT | GET / POST / PUT / DELETE |
| resource_type | TEXT | 资源类型 |
| resource_id | TEXT | 资源 ID |
| resource_name | TEXT | 资源名称 |
| status | TEXT | success / failure / denied |
| duration_ms | REAL | 耗时（毫秒） |
| source_ip | TEXT | 来源 IP |
| user_agent | TEXT | User-Agent |
| error_message | TEXT | 错误信息 |
| metadata_json | TEXT | 额外元数据 |
| created_at | TEXT | ISO 8601 |

### 2.2 现有表补列

| 表名 | 新增列 |
|------|--------|
| users | tenant_id, status, auth_source, last_login_at |
| datasources | project_id, environment_id |
| publishing_config | project_id, environment_id |
| endpoint_registry | project_id, environment_id |
| query_history | project_id, environment_id |

---

## 3. 种子数据

### 3.1 默认租户和项目

- 默认租户：code=`default`，name=`默认租户`
- 默认项目：code=`default`，name=`默认项目`，owner=admin
- 三环境：dev(开发)、test(测试)、prod(生产)

### 3.2 内置角色（8 个）

| 角色编码 | 名称 | 范围 | 说明 |
|---------|------|------|------|
| platform_admin | 平台管理员 | platform | 全部权限 |
| security_admin | 安全管理员 | platform | 审计、密钥、成员管理 |
| project_owner | 项目负责人 | project | 项目全部权限 |
| editor | 编辑者 | project | 数据源、本体、映射、词汇、发布、发布创建 |
| reviewer | 审核者 | project | 只读 + 发布审批 |
| publisher | 发布者 | project | 发布读写 + 发布操作 |
| viewer | 只读用户 | project | 全部只读 + 审计 |
| api_client | API 客户端 | project | 数据源、本体、映射、词汇只读 |

### 3.3 内置权限（16 个）

| 权限编码 | 资源类型 | 动作 |
|---------|---------|------|
| datasource.read | datasource | read |
| datasource.write | datasource | write |
| ontology.read | ontology | read |
| ontology.write | ontology | write |
| mapping.read | mapping | read |
| mapping.write | mapping | write |
| glossary.read | glossary | read |
| glossary.write | glossary | write |
| publishing.read | publishing | read |
| publishing.write | publishing | write |
| release.create | release | write |
| release.approve | release | write |
| release.execute | release | write |
| audit.read | audit | read |
| apikey.read | apikey | read |
| apikey.write | apikey | write |
| member.manage | member | write |

### 3.4 初始绑定

admin 用户自动绑定 `platform_admin` 角色。

---

## 4. 后端 API

所有端点前缀：`/api/v1/governance`

### 4.1 租户管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /tenants | 列出租户 |
| GET | /tenants/{tenant_id} | 获取租户详情 |

### 4.2 项目管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /projects | 列出项目（可按 tenant_id 过滤） |
| POST | /projects | 创建项目（自动创建 dev/test/prod 环境） |
| GET | /projects/{project_id} | 获取项目详情 |
| PUT | /projects/{project_id} | 更新项目 |
| GET | /projects/{project_id}/environments | 获取项目环境列表 |
| GET | /projects/{project_id}/members | 获取项目成员 |

### 4.3 角色与权限

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /roles | 列出角色（含权限） |
| GET | /permissions | 列出权限 |
| GET | /roles/{role_id} | 获取角色详情 |
| PUT | /roles/{role_id}/permissions | 更新角色权限（仅 admin） |

### 4.4 角色绑定

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /bindings | 列出绑定（支持 user_id/project_id/tenant_id 过滤） |
| POST | /bindings | 创建绑定 |
| DELETE | /bindings/{binding_id} | 删除绑定 |

### 4.5 API 密钥

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api-keys | 列出密钥（支持 project_id/environment_id 过滤） |
| POST | /api-keys | 创建密钥（返回明文 key，仅此一次） |
| GET | /api-keys/{cred_id} | 获取密钥详情 |
| PUT | /api-keys/{cred_id} | 更新密钥 |
| POST | /api-keys/{cred_id}/revoke | 吊销密钥 |

**Key 格式**：`oak_{env}_{8hex}.{32hex}`
- 存储 `key_prefix = oak_{env}_{8hex}` 用于快速查找
- 存储 `secret_hash = SHA256(secret)` 用于校验

### 4.6 审计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /audit | 查询审计事件（分页 + 多条件筛选） |
| GET | /audit/stats | 审计统计（总量、成功率、平均耗时） |

**筛选参数**：page, page_size, event_type, event_category, actor, resource_type, status, date_from, date_to, tenant_id, project_id

---

## 5. 认证与授权

### 5.1 双轨认证

```
请求 → 解析 Authorization / X-API-Key
       ├─ X-API-Key: oak_xxx.yyy → 查 api_credentials 表 → 校验 hash/expiry/IP
       └─ Authorization: Bearer xxx → 查 sessions 表 → 校验 token/expiry
           └─ fallback: publishing_config.api_key（兼容旧 Key）
```

### 5.2 治理上下文解析

`GovernanceContext` 从以下来源解析（优先级从高到低）：
1. API Credential 的 tenant_id/project_id/environment_id
2. 请求头 X-Tenant-Id / X-Project-Id / X-Environment-Id
3. 默认值（默认租户 + 默认项目 + dev 环境）

### 5.3 权限校验

`require_permission(code)` FastAPI 依赖：
- admin 用户（users.role == 'admin'）直接放行
- 其他用户：查 role_bindings → role_permissions 获取有效权限集
- 无权限返回 403

---

## 6. 审计中间件

每次 HTTP 请求自动记录审计事件（在 `main.py` 的 `request_logging_middleware` 中）：

- **触发时机**：所有 `/api/v1/` 开头的请求
- **记录内容**：治理上下文、操作者信息、请求路径/方法/状态码/耗时、来源 IP
- **失败处理**：审计写入失败不阻断请求（try/except 包裹）
- **自动清理**：超过 10000 条记录时自动删除最旧的记录

---

## 7. 前端页面

### 7.1 新增页面

| 路径 | 组件 | 功能 |
|------|------|------|
| /governance/projects | `app/governance/projects/page.tsx` | 项目列表/创建/详情，环境卡片(dev/test/prod) |
| /governance/access | `app/governance/access/page.tsx` | 角色绑定管理 + API Key 管理两个 Tab |
| /governance/audit | `app/governance/audit/page.tsx` | 审计日志筛选 + 分页表格 + 状态标记 |

### 7.2 侧边栏导航

在"本体精化"后新增"平台治理"分区：

| 标题 | 路径 | 图标 | 说明 |
|------|------|------|------|
| 项目管理 | /governance/projects | FolderKanban | 项目与环境 |
| 访问控制 | /governance/access | ShieldCheck | 角色与 API 密钥 |
| 审计日志 | /governance/audit | ScrollText | 操作审计记录 |

### 7.3 前端 API 封装

`lib/api.ts` 中新增 `governance` 命名空间，包含：
- `tenants` — 租户查询
- `projects` — 项目 CRUD + 环境/成员查询
- `roles` — 角色与权限查询
- `roleBindings` — 绑定 CRUD
- `apiKeys` — API Key 创建/列表/吊销
- `audit` — 审计事件查询/统计

---

## 8. 文件清单

### 新建文件（11 个）

**后端（8 个）：**

| 文件路径 | 说明 |
|---------|------|
| `ontop-backend/models/governance.py` | Pydantic 模型定义 |
| `ontop-backend/repositories/tenant_repo.py` | 租户 Repository |
| `ontop-backend/repositories/project_repo.py` | 项目 Repository |
| `ontop-backend/repositories/environment_repo.py` | 环境 Repository |
| `ontop-backend/repositories/role_repo.py` | 角色/权限 Repository |
| `ontop-backend/repositories/role_binding_repo.py` | 角色绑定 Repository |
| `ontop-backend/repositories/api_credential_repo.py` | API 密钥 Repository |
| `ontop-backend/repositories/audit_repo.py` | 审计事件 Repository |

**前端（3 个）：**

| 文件路径 | 说明 |
|---------|------|
| `ontop-ui/src/app/governance/layout.tsx` | 治理区域布局 |
| `ontop-ui/src/app/governance/projects/page.tsx` | 项目管理页 |
| `ontop-ui/src/app/governance/access/page.tsx` | 访问控制页 |
| `ontop-ui/src/app/governance/audit/page.tsx` | 审计日志页 |

### 修改文件（8 个）

| 文件路径 | 修改内容 |
|---------|---------|
| `ontop-backend/database.py` | 新增 9 张表 + ALTER 迁移 + 种子数据 |
| `ontop-backend/main.py` | 治理上下文中间件 + 审计记录 + 路由注册 |
| `ontop-backend/routers/auth.py` | 返回 tenant_id/status、修复 verify_request_token |
| `ontop-ui/src/lib/api.ts` | governance 类型 + API 函数 |
| `ontop-ui/src/components/sidebar-nav.tsx` | 平台治理导航项 |
| `ontop-ui/src/lib/auth.tsx` | User 接口扩展 |
| `ontop-ui/src/components/top-bar.tsx` | (待实现) 项目/环境选择器 |
| `ontop-ui/src/app/system/page.tsx` | (待实现) 治理信息展示 |

---

## 9. 与设计文档的差异

| 设计要求 | 实际实现 | 说明 |
|---------|---------|------|
| 18 个权限 | 16 个权限 | 设计中 `publishing.read` + `publishing.write` 各一个，实现合并 |
| change_requests 表 | 未实现 | P2 阶段 |
| release_versions / deployment_records 表 | 未实现 | P2 阶段 |
| top-bar 项目/环境选择器 | 未实现 | 后续版本 |
| system 页面展示治理信息 | 未实现 | 后续版本 |
| Fernet 加密 API Key secret | SHA256 hash | 当前使用 hash 验证，满足校验需求 |

---

## 10. 验证结果

部署测试通过（Docker Compose）：

- [x] 后端启动 → 9 张新表创建 + 种子数据写入
- [x] 登录 admin/admin123 → 获取 token → 跳转首页
- [x] /governance/projects → 默认项目 + 三环境卡片
- [x] /governance/access → 角色绑定 Tab 显示 admin-平台管理员
- [x] /governance/audit → 36 条审计记录，分页正常
- [x] 侧边栏显示"平台治理"分区及三个导航项
