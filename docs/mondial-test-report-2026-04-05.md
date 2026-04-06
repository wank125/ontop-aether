# Mondial Demo 测试报告

测试日期：2026-04-05  
测试环境：当前本地 Docker 环境  
测试目标：验证 `Mondial` 在平台中的完整演示链路是否可运行

---

## 1. 测试范围

本次测试覆盖以下链路：

1. Mondial SQL 导入 PostgreSQL
2. 数据源接入与 schema 探测
3. Ontop bootstrap 生成 ontology / OBDA
4. Ontop endpoint 启动
5. 手工 SPARQL 查询
6. AI 自然语言查询

---

## 2. 环境状态

测试时以下服务可用：

- 前端: `http://localhost:3001`
- 后端: `http://localhost:8001`
- PostgreSQL: `localhost:5436`
- LM Studio: `http://localhost:1234/v1`

相关容器：

- `ontop-lvfa-db`
- `ontop-lvfa-backend`
- `ontop-lvfa-frontend`

---

## 3. 数据导入结果

Mondial 数据已成功导入 `mondial_db`。

实测结果：

- 表数量：47
- `country` 行数：179
- `city` 行数：3427
- `river` 行数：665
- `organization` 行数：169

结论：

- 文档中的“47 表”正确
- 文档中的 “country = 246” 与当前仓库附带 SQL 文件不一致，已修正文档为实测值 179

---

## 4. Schema 探测结果

后端对 Mondial 数据源的 schema 探测成功。

实测摘要：

- relations：47
- columns：186
- foreign keys：0

结论：

- 当前 Mondial schema 没有显式外键
- Bootstrap 结果将主要表现为“表 -> 类、列 -> 数据属性”
- 复杂跨表查询不能依赖自动对象属性，需要通过共享字段手工 JOIN

---

## 5. Bootstrap 结果

对数据源执行 full bootstrap 成功。

生成产物：

- `Mondial_PostgreSQL_ontology.ttl`
- `Mondial_PostgreSQL_mapping.obda`
- `Mondial_PostgreSQL.properties`

实测特征：

- 类数：47
- 数据属性：57+
- 显式对象属性：基本无

结论：

- Bootstrap 可用
- 生成物适合 SPARQL 查询与 text-to-SQL / text-to-SPARQL 演示
- 不适合被描述为“外键丰富的自动对象属性本体”

---

## 6. Ontop Endpoint 结果

使用 Mondial bootstrap 产物重启 endpoint 成功。

状态接口返回：

- `running = true`
- mapping / ontology / properties 路径均切换到 Mondial 产物

结论：

- Mondial endpoint 可正常工作
- 容器重建后需要重新添加数据源并重新 bootstrap / restart endpoint

---

## 7. SPARQL 测试结果

### 7.1 通过

以下查询已验证通过：

- 所有国家名称和人口
- 世界上最长的 5 条河流
- 亚洲人口最多的 5 个国家
- GDP 最高的 5 个国家（修正查询后）

### 7.2 关键结果

“世界上最长的 5 条河流”返回：

1. Yangtze
2. Huang He
3. Lena
4. Congo
5. Mekong

“亚洲人口最多的 5 个国家”返回：

1. China
2. India
3. Indonesia
4. Pakistan
5. Bangladesh

### 7.3 文档问题

原文档中的 GDP 查询有误：

- 错误写法：`economy#country` 连接国家名称
- 正确写法：`economy#country` 连接 `country#code`

该问题已修正文档。

---

## 8. AI 查询测试结果

### 8.1 初始问题

初始状态下，AI 查询存在两类问题：

1. 生成了不属于当前类的属性
2. 把 `ORDER BY` / `LIMIT` 放进 `WHERE {}` 导致语法错误

根因：

- 旧默认提示词没有根据当前本体结构约束属性选择
- 自动修复逻辑对排序和分页位置处理不稳定
- 当前 Mondial 本体是 `bootstrap_flat` 类型，不适合使用“强关系本体”假设

### 8.2 修复内容

已在后端完成以下修复：

1. 根据当前 ontology / OBDA 动态构造本体感知 prompt
2. 自动识别本体 profile，Mondial 命中 `bootstrap_flat`
3. 自动修复 `cls:attr` 到 `<base/Class#attr>`
4. 自动把 `ORDER BY` / `LIMIT` / `OFFSET` 移到查询外层
5. 对简单 list / top-N 问题增加通用 fallback 查询策略

### 8.3 修复后验证

以下两个示例问题已实测通过：

- `世界上最长的5条河流`
- `有哪些国家？`

修复后效果：

- 能生成可执行 SPARQL
- Ontop reformulate 能返回 SQL
- 查询结果非空
- 能生成中文回答

---

## 9. 最终结论

当前环境下，Mondial demo 已经可以稳定支撑：

1. 关系数据库导入
2. 自动 bootstrap
3. SPARQL 查询
4. 基础 AI 自然语言问答

但需要明确边界：

- 当前 Mondial schema 无显式外键
- 当前 bootstrap 结果基本没有对象属性
- 跨表语义查询主要依赖共享字段 JOIN，而不是本体对象属性跳转

因此，Mondial 目前更适合定位为：

- 多表关系库到 SPARQL 的演示集
- Bootstrap-flat 类型本体的 AI 问答演示集

而不是：

- 外键驱动对象属性丰富的标准语义本体样板

---

## 10. 后续建议

建议后续继续做三件事：

1. 为 `relation_rich` 类型本体增加另一套查询策略
2. 把 Mondial 的实测查询整理成 benchmark 问题集
3. 增加自动化回归脚本，固定验证 `Mondial` 的 SPARQL 与 AI 示例问题
