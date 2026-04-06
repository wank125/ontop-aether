# 微软 Fabric IQ 本体构建流程详解

---

## 一、两种创建方式

| 方式 | 适用场景 | 说明 |
|------|----------|------|
| **从语义模型自动生成** | 已有 Power BI 语义模型 | 表 → 实体类型，字段 → 属性，自动映射 |
| **手动构建** | 从零开始设计 | 逐步定义实体、属性、关系 |

---

## 二、完整构建流程（5个阶段）

### 阶段一：创建本体

- 在 Fabric 工作区中新建 **Ontology 项目**
- 命名本体（如 `RetailSalesOntology`）
- 选择创建方式（自动生成 / 手动构建）

### 阶段二：定义实体类型（Entity Type）

每个实体类型代表一个业务概念：

```
实体类型：Store（门店）
├── 属性：store_id, name, address, region
├── 主键：store_id
└── 数据绑定：→ Lakehouse 中的 dim_store 表

实体类型：Employee（员工）
├── 属性：emp_id, name, role, hire_date
├── 主键：emp_id
└── 数据绑定：→ Lakehouse 中的 dim_employee 表

实体类型：SaleEvent（销售事件）
├── 属性：event_id, timestamp, amount, product_id
├── 主键：event_id
└── 数据绑定：→ Eventhouse 中的 sales_stream 表（时序数据）
```

关键操作：

1. 点击 "Add entity type" 创建实体
2. 添加属性（Property）
3. 设置主键（Entity Type Key）
4. 绑定数据源（选择 Lakehouse / Eventhouse 中的表）
5. 将属性映射到具体字段

### 阶段三：定义关系（Relationship）

连接实体类型，描述业务关联：

```
Store ──雇佣（employs）──→ Employee
Store ──产生（generates）──→ SaleEvent
Employee ──完成（completes）──→ SaleEvent
```

关键操作：

1. 创建关系类型（Relationship Type）
2. 指定源实体和目标实体
3. 为关系命名（建议用主动动词，如 employs、generates）
4. 绑定关系数据（如有中间表）

### 阶段四：配置规则（Rule）

基于 OWL 2 RL 标准定义业务逻辑规则：

```
规则示例：
IF SaleEvent.amount < threshold AND Store.region = "华东"
THEN 触发告警动作
```

规则能触发动作（Actions），实现数据驱动的自动化。

### 阶段五：预览与验证

- **查看实体实例**：确认数据绑定正确，实体实例已生成
- **查看关系图**：可视化验证实体间的关系结构
- **图引擎查询**：通过图遍历测试查询效果

---

## 三、构建过程中的核心设计模式

```
                        ┌─────────────────┐
                        │   Ontology 本体   │
                        └────────┬────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
     ┌────────▼────────┐ ┌──────▼──────┐  ┌────────▼────────┐
     │  Entity Types   │ │ Relationships│  │     Rules       │
     │   实体类型定义    │ │   关系定义    │  │    规则逻辑      │
     └────────┬────────┘ └──────┬──────┘  └────────┬────────┘
              │                  │                   │
     ┌────────▼────────┐ ┌──────▼──────┐           │
     │ Data Binding    │ │ Data Binding│           │
     │  数据绑定        │ │  数据绑定    │           │
     └────────┬────────┘ └──────┬──────┘           │
              │                  │                   │
     ┌────────▼──────────────────▼──────┐  ┌───────▼───────┐
     │         OneLake 数据底座          │  │  触发 Actions  │
     │  Lakehouse（批量）| Eventhouse（实时）│  │  告警/通知/调用  │
     └──────────────────────────────────┘  └───────────────┘
```

---

## 四、构建完成后的产出

1. **知识图谱（Graph）** — 自动生成，支持图遍历查询
2. **Data Agent** — 基于本体创建 AI 智能体，支持自然语言交互
3. **统一语义层** — 所有下游应用共享同一套业务语义定义

---

## 五、官方教程路径

| 步骤 | 内容 | 链接 |
|------|------|------|
| 1 | 创建本体 | https://learn.microsoft.com/en-us/fabric/iq/ontology/tutorial-1-create-ontology |
| 2 | 丰富本体（添加数据和关系） | https://learn.microsoft.com/en-us/fabric/iq/ontology/tutorial-2-enrich-ontology |
| 3 | 预览本体 | https://learn.microsoft.com/en-us/fabric/iq/ontology/tutorial-3-preview-ontology |
| 4 | 创建 Data Agent | https://learn.microsoft.com/en-us/fabric/iq/ontology/tutorial-4-create-data-agent |
| 5 | 创建实体类型 | https://learn.microsoft.com/en-us/fabric/iq/ontology/how-to-create-entity-types |
| 6 | 添加关系类型 | https://learn.microsoft.com/en-us/fabric/iq/ontology/how-to-create-relationship-types |
| 7 | 从语义模型生成本体 | https://learn.microsoft.com/en-us/fabric/iq/ontology/concepts-generate |
