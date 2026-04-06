# Ontology Workbench — 语义建模实现文档

## 一、功能概述

语义建模（Semantic Modeling）是数据库概览页面 `/db-schema` 右侧的新增 Tab，用于把选中的关系数据库表半自动提升为 OWL 本体候选，让用户在 Bootstrap 之前先看清"表→类、列→属性、FK→关系"的映射关系。

核心价值：填补"结构浏览"和"本体生成"之间的语义确认空白。

## 二、数据流

```
左侧勾选表
    ↓
POST /api/v1/workbench/analyze
    ↓
返回候选（classes / data_properties / object_properties）
    ↓
前端展示三组候选表格（类 / 数据属性 / 对象属性）
    ↓
用户确认候选（当前版本默认全部 accepted）
    ↓
POST /api/v1/workbench/generate
    ↓
复用 bootstrap service 生成本体 + 映射
    ↓
返回版本路径（ontology_path / mapping_path / manifest_path）
```

## 三、页面结构

### Tab 布局

右侧面板从原来的单视图改为 `<Tabs>` 双 Tab 布局：

```
右侧:
  <Tabs defaultValue="structure">
    <TabsTrigger value="structure">表结构</TabsTrigger>
    <TabsTrigger value="semantic">语义建模</TabsTrigger>

    <TabsContent value="structure">
      现有的表详情 + 字段结构表 + 局部 Bootstrap 卡片 + 关系网络卡
    </TabsContent>

    <TabsContent value="semantic">
      未选表 → 空状态提示
      已选表:
        1. 标题区（已选 N 张表 + 语义分析按钮 + 生成本体按钮）
        2. 类候选表（表名 / 类名 / 类 IRI / 状态）
        3. 数据属性候选表（表 / 列名 / 属性名 / XSD 类型 / 标记 / 状态）
        4. 对象属性候选表（源表 / 属性名 / 目标表 / FK 列 / 状态）
        5. 生成结果卡（版本 / ontology_path / mapping_path / manifest_path）
    </TabsContent>
  </Tabs>
```

### 未选表状态

当用户未勾选任何表时，语义建模 Tab 显示空状态提示：

> 请先在左侧勾选需要建模的表。

### 已选表但未分析

显示"语义分析"和"生成本体"按钮（生成按钮 disabled），以及空状态提示：

> 点击"语义分析"查看推断结果。

### 分析完成

显示三组候选表格，"生成本体"按钮变为可用。

## 四、后端实现

### 4.1 语义推断引擎

文件：`backend/services/semantic_analyzer.py`

纯规则推断，不依赖 AI / LLM。

#### 推断规则

| 输入 | 规则 | 输出 |
|------|------|------|
| 表名 | 去除前缀（tbl_、dim_、fact_ 等），转 PascalCase | 类名 |
| 表名 | `base_iri + class_name` | 类 IRI |
| 主键列 | 标记 `is_pk=True`，属性名固定为 `identifier` | 标识符属性 |
| FK 列 | 跳过，不生成数据属性，由外键处理为对象属性 | — |
| 系统列（created_at 等） | 标记 `status="system"` | 降权属性 |
| 含 name/title/code 列 | 标记 `is_label=True` | label 候选 |
| 普通列 | 转 camelCase | 数据属性名 |
| SQL 类型 | 查表映射（varchar→xsd:string、numeric→xsd:decimal 等） | XSD 类型 |
| 外键 | 目标表在选中集合内 → `has{TargetTable}`，status=accepted | 对象属性 |
| 外键 | 目标表不在选中集合内 → `ref{TargetTable}`，status=external | 外部引用 |

#### 系统列清单

```python
SYSTEM_COLUMNS = {
    "created_at", "updated_at", "deleted_at", "created_by", "updated_by",
    "create_time", "update_time", "delete_time",
}
```

#### Label 关键词

```python
LABEL_KEYWORDS = {"name", "title", "code", "label", "description", "caption", "short_name", "full_name"}
```

#### SQL → XSD 类型映射

| SQL 类型 | XSD 类型 |
|----------|----------|
| varchar, char, text, nvarchar | xsd:string |
| int, bigint, smallint, serial | xsd:integer |
| numeric, decimal | xsd:decimal |
| real, float, double precision | xsd:double |
| boolean, bool | xsd:boolean |
| date | xsd:date |
| timestamp | xsd:dateTime |
| uuid, json, jsonb | xsd:string |

### 4.2 API 端点

文件：`backend/routers/workbench.py`

路由前缀：`/api/v1/workbench`

#### POST /analyze

语义分析，返回推断候选。

请求：
```json
{
  "datasource_id": "xxx",
  "tables": ["account", "customer"],
  "base_iri": "http://example.com/ontop/"
}
```

响应：
```json
{
  "candidates": {
    "classes": [
      { "table_name": "account", "class_name": "Account", "class_iri": "...", "label": "account", "status": "accepted" }
    ],
    "data_properties": [
      { "table_name": "account", "column_name": "balance", "property_name": "balance", "property_iri": "...", "datatype": "xsd:decimal", "is_nullable": true, "is_pk": false, "is_fk": false, "status": "accepted" }
    ],
    "object_properties": [
      { "from_table": "account", "to_table": "customer", "property_name": "hasCustomer", "property_iri": "...", "fk_columns": ["global_id"], "status": "accepted" }
    ]
  }
}
```

内部流程：
1. 通过 `datasource_repo.get_datasource()` 获取数据源配置
2. 写临时 `.properties` 文件，调用 `ontop_cli.extract_db_metadata()` 提取 schema
3. 调用 `semantic_analyzer.analyze_schema()` 推断候选

#### POST /generate

生成本体 + 映射，复用现有 bootstrap 逻辑。

请求：
```json
{
  "datasource_id": "xxx",
  "base_iri": "http://example.com/ontop/",
  "tables": ["account", "customer"]
}
```

响应：复用 `BootstrapResult`，包含 version、ontology_path、mapping_path 等。

内部流程：
1. 委托 `routers.datasources.run_bootstrap()` 以 `mode="partial"` + `include_dependencies=True` 执行

### 4.3 路由注册

`backend/main.py` 中添加：

```python
from routers import workbench
app.include_router(workbench.router, prefix="/api/v1")
```

## 五、前端实现

### 5.1 API 类型

文件：`frontend/src/lib/api.ts`

新增类型：

```typescript
interface ClassCandidate {
  table_name: string;
  class_name: string;
  class_iri: string;
  label: string;
  status: 'accepted' | 'renamed' | 'ignored';
}

interface DataPropertyCandidate {
  table_name: string;
  column_name: string;
  property_name: string;
  property_iri: string;
  datatype: string;
  is_nullable: boolean;
  is_pk: boolean;
  is_fk: boolean;
  status: 'accepted' | 'renamed' | 'ignored' | 'system';
  is_label?: boolean;
}

interface ObjectPropertyCandidate {
  from_table: string;
  to_table: string;
  property_name: string;
  property_iri: string;
  fk_columns: string[];
  target_columns?: string[];
  status: 'accepted' | 'renamed' | 'ignored' | 'external';
}

interface SemanticCandidates {
  candidates: {
    classes: ClassCandidate[];
    data_properties: DataPropertyCandidate[];
    object_properties: ObjectPropertyCandidate[];
  };
}
```

新增 API 模块：

```typescript
const workbench = {
  analyze: (datasourceId, tables, baseIri?) => api<SemanticCandidates>('/workbench/analyze', { method: 'POST', ... }),
  generate: (datasourceId, tables, baseIri?) => api<BootstrapResult>('/workbench/generate', { method: 'POST', ... }),
};
```

### 5.2 页面组件

文件：`frontend/src/app/db-schema/page.tsx`

修改点：
- 导入 `Tabs, TabsContent, TabsList, TabsTrigger` 和 `workbench` API
- 新增状态：`semanticCandidates`、`analyzing`、`generating`、`generateResult`
- 新增处理函数：`handleSemanticAnalyze()`、`handleSemanticGenerate()`
- 右侧面板包裹 `<Tabs>` 组件

### 5.3 候选状态语义

| 状态 | 含义 | 样式 |
|------|------|------|
| `accepted` | 自动推断通过，默认接受 | Badge default |
| `system` | 系统列，降权处理 | Badge secondary |
| `external` | 目标表不在选中集合内 | Badge outline |
| `renamed` | 用户手动改名（预留） | Badge secondary |
| `ignored` | 用户忽略（预留） | Badge outline |

## 六、实施过程修复的 Bug

| 问题 | 原因 | 修复 |
|------|------|------|
| API 404 | workbench router 缺少 `prefix="/workbench"` | `APIRouter(prefix="/workbench")` |
| ImportError 500 | `from repositories.datasource_repo import get` 函数名错误 | 改为 `get_datasource` |

## 七、验证结果

测试环境：LVFA PostgreSQL（14 表、71 列、12 外键）

测试场景：选中 account + customer + bill 三张表

| 候选类型 | 数量 | 示例 |
|----------|------|------|
| 类候选 | 3 | Account、Bill、Customer |
| 数据属性 | 14 | identifier(PK)、balance(decimal)、legalName(string,label) |
| 对象属性 | 3 | hasCustomer(accepted)、refPropertyProject(external)、refSubscription(external) |

全部请求返回 200，后端无 ERROR 日志，分析耗时约 750ms。

## 八、后续规划

### 第二版

- 候选行的内联编辑（改名、忽略）
- 批量操作（全选/全忽略）
- 映射规则预览

### 第三版

- AI 辅助语义推荐（LLM 基于表名/列名推荐更语义化的类名和属性名）
- 枚举检测（status/type 列自动识别为枚举）
- 桥表识别（只有 FK 列的表识别为多对多关系）
- SHACL 约束生成
