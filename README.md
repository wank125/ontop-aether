# ontop-aether

Ontop 虚拟知识图谱全栈工作台。

## 项目结构

```
ontop-aether/
├── ontop-backend/    FastAPI 后端（数据源管理、AI 查询、语义增强）
├── ontop-engine/     Java Spring Boot（本体构建：bootstrap/validate/materialize）
├── ontop-ui/         Next.js 前端（工作台界面）
├── ontop-endpoint/   Ontop SPARQL 端点
├── ontop-db/         数据库初始化脚本 + JDBC 属性
├── ontop-output/     共享生成产物（.ttl, .obda, .properties）
├── ontop-test/       测试脚本与数据
├── benchmark/        性能基准数据
├── docs/             文档
├── k8s/              Kubernetes 清单
└── tests/            集成测试
```

## 快速开始

### Docker 部署

```bash
# 构建并启动（retail 环境）
make up

# LVFA 环境
make up-lvfa

# MySQL 环境
make up-mysql
```

### 本地开发

```bash
# 后端
make dev-backend    # http://localhost:8000

# 前端
make dev-ui         # http://localhost:5000

# Java 引擎
make dev-engine     # http://localhost:8081
```

## 技术栈

| 模块 | 技术 |
|------|------|
| ontop-backend | Python 3.11, FastAPI, Pydantic v2, httpx |
| ontop-engine | Java 17, Spring Boot 2.7, Ontop 5.5.0 |
| ontop-ui | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| ontop-endpoint | Ontop CLI 5.5.0, JRE 17 |
| ontop-db | PostgreSQL 16 / MySQL 8 |
