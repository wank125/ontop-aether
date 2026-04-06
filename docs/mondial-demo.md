# Mondial 地理数据库演示说明

基于 [Mondial](https://www.dbis.informatik.uni-goettingen.de/Mondial/) 地理数据库，演示天织平台从关系数据库到语义查询的完整工作流。

---

## 1. 数据集简介

Mondial 是由德国哥廷根大学 (University of Göttingen) 维护的全球地理信息数据库，涵盖国家、城市、河流、湖泊、山脉、沙漠、岛屿、机场、组织、语言、宗教、经济等数据。

说明：以下统计基于仓库当前附带的 `mondial-inputs.psql` 实测结果，不同版本的 Mondial 数据文件可能略有差异。

| 维度 | 数据量 |
|------|--------|
| 国家 (country) | 179 |
| 城市 (city) | 3,427 |
| 河流 (river) | 665 |
| 山脉 (mountain) | 587 |
| 湖泊 (lake) | 232 |
| 岛屿 (island) | 107 |
| 机场 (airport) | 848 |
| 组织 (organization) | 150+ |
| 数据表总数 | **47** |

### 核心表结构

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `country` | 国家信息 | name, code, capital, area, population |
| `city` | 城市信息 | name, country, province, longitude, latitude |
| `river` | 河流 | name, length, source, estuary |
| `mountain` | 山脉 | name, elevation, mountains |
| `lake` | 湖泊 | name, area, depth |
| `island` | 岛屿 | name, area, elevation |
| `airport` | 机场 | name, iatacode, city, country, elevation |
| `economy` | 经济数据 | country, gdp, agriculture, industry, service |
| `encompasses` | 国家-洲归属 | country, continent, percentage |
| `borders` | 国家接壤 | country1, country2, length |
| `province` | 省份 | name, country, population, area, capital |
| `organization` | 国际组织 | abbreviation, name, established |
| `ismember` | 组织成员 | country, organization, type |
| `language` | 语言 | name, superlanguage |
| `spoken` | 语言使用 | country, language, percentage |
| `religion` | 宗教 | country, name, percentage |
| `ethnicgroup` | 民族 | country, name, percentage |
| `geo_river` | 河流流经 | river, country, province |
| `geo_mountain` | 山脉位于 | mountain, country, province |
| `geo_lake` | 湖泊位于 | lake, country, province |
| `located` | 地理定位 | city, country, province |
| `population` | 人口统计 | country, population_growth, infant_mortality |

---

## 2. 环境准备

### 2.1 启动平台

```bash
# 在项目根目录执行
docker compose -f docker-compose.lvfa.yml up -d --build
```

服务地址：

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:3001 |
| 后端 API | http://localhost:8001/docs |
| PostgreSQL | localhost:5436 (admin/test123) |

### 2.2 导入 Mondial 数据

SQL 文件已下载到 `docker/postgres/mondial/`：

```bash
# 1. 创建数据库
docker exec ontop-lvfa-db psql -U admin -d postgres -c "CREATE DATABASE mondial_db;"

# 2. 复制文件到容器
docker cp docker/postgres/mondial/mondial-schema.psql ontop-lvfa-db:/tmp/
docker cp docker/postgres/mondial/mondial-inputs.psql ontop-lvfa-db:/tmp/

# 3. 导入 schema 和数据
docker exec ontop-lvfa-db psql -U admin -d mondial_db -f /tmp/mondial-schema.psql
docker exec ontop-lvfa-db psql -U admin -d mondial_db -f /tmp/mondial-inputs.psql

# 4. 验证
docker exec ontop-lvfa-db psql -U admin -d mondial_db -tAc "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';"
# 应输出 47

docker exec ontop-lvfa-db psql -U admin -d mondial_db -tAc "SELECT COUNT(*) FROM country;"
# 当前文件实测为 179
```

---

## 3. 平台操作流程

### Step 1: 添加数据源

通过 API 或前端 UI 添加 Mondial 数据源：

**API 方式：**

```bash
curl -X POST http://localhost:8001/api/v1/datasources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mondial PostgreSQL",
    "jdbc_url": "jdbc:postgresql://postgres-lvfa:5432/mondial_db",
    "user": "admin",
    "password": "test123",
    "driver": "org.postgresql.Driver"
  }'
```

**UI 方式：**

1. 访问 http://localhost:3001/datasource
2. 填写上述连接信息
3. 点击"添加"

### Step 2: 测试连接 & 探测结构

```bash
# 测试连接
curl -X POST http://localhost:8001/api/v1/datasources/{id}/test

# 获取 schema 概览
curl http://localhost:8001/api/v1/datasources/{id}/schema
```

前端操作：进入数据源详情页 → "测试连接" → "探测结构"

### Step 3: Bootstrap 生成本体

```bash
curl -X POST http://localhost:8001/api/v1/datasources/{id}/bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "full",
    "base_iri": "http://example.com/mondial/",
    "tables": [],
    "include_dependencies": false
  }'
```

Bootstrap 产物：

| 文件 | 说明 |
|------|------|
| `Mondial_PostgreSQL_ontology.ttl` | OWL 本体 (47 个类, 57+ 数据属性) |
| `Mondial_PostgreSQL_mapping.obda` | OBDA 映射 (47 条映射规则) |
| `Mondial_PostgreSQL.properties` | JDBC 连接属性 |

注意：当前 Mondial schema 没有显式外键约束，Bootstrap 结果以“表 -> 类、列 -> 数据属性”为主，跨表查询通常需要通过共享字段显式 JOIN。

### Step 4: 启动 Ontop 端点

```bash
curl -X POST http://localhost:8001/api/v1/mappings/restart-endpoint \
  -H "Content-Type: application/json" \
  -d '{
    "ontology_path": "/app/data/{id}/bootstrap-full-.../Mondial_PostgreSQL_ontology.ttl",
    "mapping_path": "/app/data/{id}/bootstrap-full-.../Mondial_PostgreSQL_mapping.obda",
    "properties_path": "/app/data/{id}/bootstrap-full-.../Mondial_PostgreSQL.properties",
    "port": 8081
  }'
```

前端操作：进入映射编辑页 → "重启端点"

### Step 5: 配置 AI 模型

进入 http://localhost:3001/settings：

- **Provider**: LM Studio
- **Base URL**: `http://192.168.31.244:1234/v1` (或本地 LM Studio 地址)
- **Model**: `zai-org/glm-4.7-flash`

---

## 4. SPARQL 查询示例

### 4.1 基础查询

**查询所有国家名称和人口：**

```sparql
SELECT ?name ?population WHERE {
  ?c <http://example.com/mondial/country#name> ?name .
  ?c <http://example.com/mondial/country#population> ?population .
}
LIMIT 10
```

### 4.2 排序查询

**世界上最长的 5 条河流：**

```sparql
SELECT ?name ?length WHERE {
  ?r <http://example.com/mondial/river#name> ?name .
  ?r <http://example.com/mondial/river#length> ?length .
}
ORDER BY DESC(?length)
LIMIT 5
```

结果：

| 河流 | 长度 (km) |
|------|-----------|
| Yangtze (长江) | 6,380 |
| Huang He (黄河) | 4,845 |
| Lena (勒拿河) | 4,400 |
| Congo (刚果河) | 4,374 |
| Mekong (湄公河) | 4,350 |

### 4.3 跨表 JOIN 查询

**亚洲人口最多的 5 个国家：**

```sparql
SELECT ?name ?population WHERE {
  ?c <http://example.com/mondial/country#name> ?name .
  ?c <http://example.com/mondial/country#population> ?population .
  ?c <http://example.com/mondial/country#code> ?code .
  ?e <http://example.com/mondial/encompasses#country> ?code .
  ?e <http://example.com/mondial/encompasses#continent> "Asia" .
}
ORDER BY DESC(?population)
LIMIT 5
```

结果：

| 国家 | 人口 |
|------|------|
| China (中国) | 1,411,778,724 |
| India (印度) | 1,210,854,977 |
| Indonesia (印尼) | 270,203,917 |
| Pakistan (巴基斯坦) | 207,776,954 |
| Bangladesh (孟加拉) | 165,158,616 |

### 4.4 经济数据查询

**GDP 最高的 5 个国家：**

```sparql
SELECT ?name ?gdp WHERE {
  ?c <http://example.com/mondial/country#name> ?name .
  ?c <http://example.com/mondial/country#code> ?code .
  ?ec <http://example.com/mondial/economy#country> ?code .
  ?ec <http://example.com/mondial/economy#gdp> ?gdp .
}
ORDER BY DESC(?gdp)
LIMIT 5
```

### 4.5 地理关系查询

**哪些河流流经中国：**

```sparql
SELECT ?river WHERE {
  ?g <http://example.com/mondial/geo_river#river> ?river .
  ?g <http://example.com/mondial/geo_river#country> "CN" .
}
```

### 4.6 更多查询思路

| 问题 | 涉及表 |
|------|--------|
| 世界上最深的湖泊 | `lake` |
| 海拔最高的山脉 | `mountain` |
| 面积最大的岛屿 | `island` |
| 接壤国家最多的国家 | `borders` |
| 某语言在哪些国家使用 | `spoken`, `language` |
| 哪些国家同时属于多个洲 | `encompasses` |
| 某国际组织有哪些成员国 | `ismember`, `organization` |
| 各洲的国家数量 | `encompasses`, `country` |

---

## 5. AI 自然语言查询

### 5.1 已验证的问题

进入 http://localhost:3001/ai-assistant，输入以下问题：

| 自然语言问题 | 结果 |
|-------------|------|
| 世界上最长的5条河流 | 正确返回长江、黄河等 |
| 有哪些国家？ | 正确返回国家列表，默认展示前 20 条 |

### 5.2 AI 查询工作原理

```
用户问题 (中文)
    ↓
LLM 生成 SPARQL
    ↓
根据当前本体摘要约束类和属性
    ↓
自动修复 URI / ORDER BY / LIMIT
    ↓
Ontop 重写为 SQL
    ↓
执行 SQL 查询 PostgreSQL
    ↓
LLM 生成中文回答
```

系统当前包含三层约束：

1. **本体感知提示词**: 根据当前类清单和每个类可用的属性生成 Prompt，避免编造属性
2. **URI 扩展**: `cls:name` → `<http://example.com/mondial/river#name>`（根据查询中的 `a cls:river` 推断正确类名）
3. **语法修正**: 将错误放在 `WHERE {}` 内的 `ORDER BY`/`LIMIT`/`OFFSET` 移到外层

对于 Mondial 这类“Bootstrap 直出、对象属性很少”的本体，系统会自动采用更保守的查询策略：

- 优先查询单表属性
- 跨表时通过共享字段手工 JOIN
- “列出有哪些 X” 默认只取名称、代码等主标识字段

### 5.3 URI 命名规则

Bootstrap 生成的本体遵循 `TableName#ColumnName` 命名模式：

```
类 URI:   http://example.com/mondial/country
属性 URI:  http://example.com/mondial/country#name
          http://example.com/mondial/country#population
          http://example.com/mondial/country#code
```

---

## 6. 本体可视化

访问 http://localhost:3001/ontology：

### 关系图谱

基于 Vis.js 展示 47 个类和属性之间的关系网络，支持缩放和拖拽。

### 本体定义

解析 TTL 文件，展示：

- **类列表**: country, city, river, mountain, lake, island, airport, economy 等 47 个类
- **数据属性**: name, population, area, length, elevation, gdp, depth 等 57+ 个属性
- **对象属性**: 当前 Mondial Bootstrap 结果中基本没有显式对象属性
- **SHACL 约束**: 如有

---

## 7. 数据来源

- **数据库**: [Mondial Database](https://www.dbis.informatik.uni-goettingen.de/Mondial/) — University of Göttingen
- **文件**: `mondial-schema.psql` (372行) + `mondial-inputs.psql` (56,860行)
- **格式**: PostgreSQL 16 兼容
- **本地副本**: `docker/postgres/mondial/`

---

## 8. 常见问题

### Q: Ontop 端点显示"已停止"

需要手动重启端点：进入映射编辑页 → "重启端点"，或通过 API 调用 `POST /api/v1/mappings/restart-endpoint`。

### Q: AI 查询返回空结果

1. 检查 LM Studio 是否运行：`curl http://192.168.31.244:1234/v1/models`
2. 检查 AI 设置页的 Base URL 和 Model 是否正确
3. 检查 Ontop 端点是否运行中
4. 检查当前是否已切换到 Mondial endpoint，而不是默认 LVFA endpoint
5. 尝试手动编写 SPARQL 在查询页面验证数据

### Q: SPARQL 语法错误

属性 URI 必须使用完整路径加尖括号：`<http://example.com/mondial/river#name>`，不能简写为 `cls:name`。当前 Mondial schema 没有显式外键，跨表查询通常需要通过共享字段（如 `country#code` 与 `encompasses#country`、`economy#country`）进行 JOIN。

### Q: Docker 容器重建后数据丢失

后端数据（datasource、AI 配置、bootstrap 产物）存储在容器文件系统中，容器重建会丢失。需要重新执行：添加数据源 → Bootstrap → 重启端点 → 配置 AI。PostgreSQL 数据使用 Docker Volume 持久化，不会丢失。
