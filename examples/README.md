# Examples — 演示数据

一键导入 LVFA 物业管理 + Mondial 全球地理两个完整演示，包含语义标注和业务词汇表。

## 快速开始

```bash
# 1. 启动服务
cd .. && docker compose -f docker-compose.lvfa.yml up -d

# 2. 导入全部演示数据
./setup-demo.sh all

# 或只导入单个数据集
./setup-demo.sh lvfa      # 物业管理 (14 表)
./setup-demo.sh mondial   # 全球地理 (47 表)
```

## 数据集概览

### LVFA 物业管理

| 维度 | 内容 |
|------|------|
| 数据库 | `lvfa_db`, 14 表 |
| 领域 | 账户、账单、合同、客户、工单、车位等 |
| Bootstrap | 20+ OWL 类 |
| 语义标注 | 159 条 (中/英 label + comment) |
| 词汇表 | 75 条业务词汇 (含别名和示例问法) |

### Mondial 全球地理

| 维度 | 内容 |
|------|------|
| 数据库 | `mondial_db`, 47 表 |
| 领域 | 国家、城市、河流、山脉、机场、经济等 |
| Bootstrap | 47 OWL 类 + 186 数据属性 |
| 语义标注 | 178 条 (中/英 label + comment) |
| 词汇表 | 68 条业务词汇 (含别名和示例问法) |

## 文件结构

```
examples/
├── setup-demo.sh           # 一键导入脚本
├── lvfa/
│   ├── sql/schema.sql      # LVFA 建表 + 数据
│   ├── bootstrap/          # Bootstrap 产物 (TTL/OBDA/JDBC)
│   ├── annotations.json    # 159 条语义标注
│   └── glossary.json       # 75 条业务词汇
└── mondial/
    ├── sql/
    │   ├── schema.sql      # 47 表建表脚本
    │   └── data.sql        # 全球地理数据 (3.7MB)
    ├── bootstrap/          # Bootstrap 产物
    ├── annotations.json    # 178 条语义标注
    └── glossary.json       # 68 条业务词汇
```

## 脚本执行流程

```
setup-demo.sh
  ├── [1/5] 创建数据库 & 导入 SQL
  ├── [2/5] 注册数据源 (POST /api/v1/datasources)
  ├── [3/5] Bootstrap 语义构建
  ├── [4/5] 导入语义标注 + 词汇表
  └── [5/5] 合并到本体 & 激活 SPARQL 端点
```

## SPARQL 验证

```bash
# 查询国家列表
curl -s "http://localhost:18081/sparql" \
  -d "query=SELECT ?name ?pop WHERE { ?c <http://example.com/mondial/country#name> ?name . ?c <http://example.com/mondial/country#population> ?pop . } LIMIT 5"

# 查询最长河流
curl -s "http://localhost:18081/sparql" \
  -d "query=SELECT ?name ?length WHERE { ?r <http://example.com/mondial/river#name> ?name . ?r <http://example.com/mondial/river#length> ?length . } ORDER BY DESC(?length) LIMIT 5"
```
