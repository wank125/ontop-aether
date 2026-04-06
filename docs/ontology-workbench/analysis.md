# Ontology Workbench 设计评审

## 一、总体评价

设计稿方向正确，核心洞察准确——现有页面（db-schema → bootstrap → mapping → ontology）是线性工具链，缺少一个让用户**理解语义、确认语义**的中间层。Workbench 填补了这个空白。

但设计稿偏理想化，部分模块与现有能力差距较大，需要务实分阶段。

---

## 二、可行性分析

### 已有能力（可直接复用）

| 能力 | 现有实现 | Workbench 对应模块 |
|------|---------|-------------------|
| Schema 读取 | `GET /datasources/{id}/schema` 返回表/列/FK/主键 | SchemaExplorerPanel |
| Bootstrap 预览 | `POST /datasources/{id}/bootstrap-preview` 预估类/属性数量 | ProgressStepper 阶段 2 |
| Bootstrap 执行 | `POST /datasources/{id}/bootstrap` 支持选定表生成 | 生成本体 + 映射 |
| TTL 解析 | `ttl_parser.py` 提取类/属性/关系/SHACL | OntologyDraftPanel |
| OBDA 解析 | `obda_parser.py` 读写映射规则 | BottomPreviewDrawer Mapping |
| AI 辅助 | `ai_query.py` 支持 NL→SPARQL | 可扩展为 schema→语义建议 |
| 前端类型 | `TtlOntology`、`OwlClass`、`OwlObjectProperty` 等类型已定义 | OntologyDraftPanel 数据层 |

### 需要新增的能力

| 能力 | 复杂度 | 说明 |
|------|--------|------|
| Schema→语义候选推断引擎 | **中** | 设计稿中的"表→类、列→属性、FK→关系"规则，可用纯 Python 实现，不依赖 AI |
| 候选确认 API | **低** | 新增 `/workbench/candidates` 端点，接受/拒绝/改名/忽略 |
| 三栏联动状态管理 | **中** | 前端需要跨面板状态同步（左栏选表 → 中栏刷新候选 → 右栏刷新草稿） |
| 实时 Mapping Preview | **低** | 复用 obda_parser 的序列化能力，拼装后前端展示 |
| 拖拽/合并/编排交互 | **高** | 设计稿提到但 MVP 应砍掉 |

### 不可行的部分

| 设计点 | 问题 | 建议 |
|--------|------|------|
| 复杂拖拽编排 | 工作量巨大，且 Ontop 映射规则本质是 SQL+模板，拖拽抽象不自然 | 砍掉，用卡片确认代替 |
| 图谱双向编辑 | 现有 Vis.js 是只读的，双向编辑需要大量工作 | 砍掉，用列表/卡片编辑代替 |
| SHACL 自动生成 | Bootstrap 不产出 SHACL，手写规则复杂 | MVP 不做，后续作为验证层补充 |
| 全量关系图实时刷新 | 三栏 + 底部抽屉 + 图谱同时刷新性能压力大 | 右栏用列表而非图谱，底部按需展开 |

---

## 三、优化建议

### 1. 简化页面结构

设计稿是三栏 + 底部抽屉 + 顶部步骤条，信息密度过高。建议改为**两阶段流**：

```
阶段 1: Schema Review（复用现有 db-schema 页面的左侧表列表）
  → 选表 → 自动推断候选

阶段 2: Semantic Confirm（卡片式确认）
  → 类候选卡片 / 属性候选卡片 / 关系候选卡片
  → 右侧显示 Ontology Draft 摘要
  → 底部 Mapping Preview 按需展开
```

理由：用户工作流天然是"先选表，再确认语义"，而不是同时看三栏。

### 2. 候选推断不需要 AI

设计稿暗示可能用 AI 推断语义，但第一版完全不需要：

- **表→类**：表名转 PascalCase，`account` → `Account`
- **列→属性**：列名转 camelCase，`account_name` → `accountName`
- **FK→关系**：外键自动映射为对象属性，用 FK 目标表名生成关系名
- **桥表→多对多**：检测只有 FK 列的表即为桥表
- **枚举检测**：列名含 `type`/`status`/`category` + 去重值 < 20 → 枚举候选

这些规则稳定、可预测、无需 LLM 调用，也避免了 AI 幻觉导致语义错误。

### 3. 与现有页面的关系

设计稿说"不替代现有页面"，这是对的。但需要明确入口关系：

```
datasource 页面 → 创建连接、测试
db-schema 页面  → 查看 Schema 全貌
                    ↓ (新增入口)
ontology-workbench → 选表 → 确认语义 → 生成本体+映射
                    ↓
mapping 页面    → 精调映射规则
ontology 页面   → 查看本体图谱
sparql 页面     → 查询验证
```

Workbench 是 **db-schema 的下游、mapping 的上游**，不是独立入口。

### 4. 前端状态管理建议

三栏联动容易变成状态混乱。建议用单一状态树：

```typescript
interface WorkbenchState {
  datasourceId: string;
  selectedTables: string[];
  candidates: {
    classes: ClassCandidate[];      // 表→类
    dataProperties: PropCandidate[]; // 列→属性
    objectProperties: RelCandidate[]; // FK→关系
  };
  decisions: Record<string, 'accepted' | 'renamed' | 'ignored' | 'merged'>;
  ontologyDraft: TtlOntology | null;
  mappingPreview: MappingContent | null;
}
```

所有面板从同一个 state 读取，修改时统一 dispatch，避免跨面板同步问题。

### 5. 后端 API 设计

新增一组轻量 API，不改动现有路由：

```
POST /api/v1/workbench/analyze
  body: { datasource_id, tables: string[] }
  response: { classes, data_properties, object_properties }

POST /api/v1/workbench/generate
  body: { datasource_id, decisions: {...} }
  response: { ontology_path, mapping_path, properties_path, preview }

GET /api/v1/workbench/preview
  query: session_id
  response: { ttl_preview, obda_preview }
```

### 6. 底部抽屉改为按需展开

设计稿底部始终显示 Mapping/RDF/Validation 三个 Tab，但用户在"确认语义"阶段不关心映射细节。建议：

- 确认阶段：底部隐藏
- 生成阶段：底部自动展开显示结果
- 后续可手动切换 Mapping/RDF/Validation Tab

---

## 四、MVP 实施建议

### 第一版（最小闭环，预估 2-3 天）

| 步骤 | 内容 | 复用 |
|------|------|------|
| 1 | 新建 `/workbench` 页面，左侧复用 db-schema 的表选择 | `datasources.schema()` |
| 2 | 选表后调用 `/workbench/analyze` 生成候选 | 新增后端推断引擎 |
| 3 | 中栏卡片式确认：类名确认、属性确认、关系确认 | 新前端组件 |
| 4 | 右栏显示 Ontology Draft 摘要（类/属性/关系列表） | 复用 `TtlOntology` 类型 |
| 5 | 点击生成，复用 bootstrap 生成 .ttl + .obda | `datasources.bootstrap()` |
| 6 | 底部展示生成结果摘要 + 跳转到 mapping/ontology 页面 | 链接跳转 |

### 第二版（增强体验）

- 重命名、合并、忽略交互
- AI 辅助语义推荐（调用 LLM 基于表名/列名/样例值推荐类名和属性名）
- 映射规则预览
- 枚举检测和码表识别

### 第三版（高级功能）

- 拖拽编排
- 关系图可视化
- SHACL 约束生成
- 历史版本管理

---

## 五、风险点

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Schema 过大（100+ 表） | 候选推断慢，前端渲染卡 | 支持分批选表，限制单次 20 表 |
| 推断准确率低 | 用户需要大量手动修正 | 先用规则引擎保证基线，AI 作为可选增强 |
| 与现有 bootstrap 逻辑重复 | 维护两套生成逻辑 | Workbench 底层直接调用 bootstrap service |
| 三栏状态同步复杂 | 交互 bug 多 | 单一状态树 + useReducer |

---

## 六、结论

设计稿方向正确，核心价值明确。主要优化点：

1. **砍掉拖拽编排、图谱双向编辑、SHACL 自动生成** —— 工作量大且 MVP 非必需
2. **推断引擎用纯规则而非 AI** —— 稳定、可预测、无额外依赖
3. **简化为两阶段流而非三栏同屏** —— 降低前端复杂度
4. **底层复用现有 bootstrap service** —— 避免重复建设
5. **明确与现有页面的上下游关系** —— Workbench 是 db-schema→mapping 的中间桥梁
