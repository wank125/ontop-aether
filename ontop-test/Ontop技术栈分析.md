# Ontop 5.5.0 技术栈深度分析

> 基于 Ontop CLI 5.5.0 安装包（171 个 JAR）的逆向分析
> 分析时间：2026年3月

---

## 一、分层架构

```
┌─────────────────────────────────────────────────────────┐
│                       用户界面层                          │
│   CLI (Airline 3.0)  │  Protégé 插件  │  SPARQL Endpoint │
├─────────────────────────────────────────────────────────┤
│                       Web 服务层                          │
│          Spring Boot 2.7.18 + Tomcat 9 + Thymeleaf       │
├─────────────────────────────────────────────────────────┤
│                       语义处理层                          │
│     OWL API 5.5.1 (本体)  │  RDF4J 5.1.4 (RDF/SPARQL)    │
├─────────────────────────────────────────────────────────┤
│                      Ontop 核心层                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ OBDA Core│ │ Mapping  │ │Optimiz-  │ │Reform-   │   │
│  │ (模型)   │ │ (映射)   │ │ation     │ │ulation   │   │
│  │          │ │SQL+R2RML │ │(查询优化) │ │(查询重写) │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│             Google Guice 5.0.1 (依赖注入)                │
├─────────────────────────────────────────────────────────┤
│                       数据访问层                          │
│      JDBC  │  HikariCP (连接池)  │  JSQLParser (SQL解析)  │
├─────────────────────────────────────────────────────────┤
│                       基础设施层                          │
│  Guava │ Jackson │ Caffeine(缓存) │ Logback │ ANTLR4     │
└─────────────────────────────────────────────────────────┘
```

---

## 二、运行环境

| 项目 | 要求 |
|------|------|
| **Java 版本** | 11+（Caffeine 3.1.8 最低要求） |
| **JVM 内存** | 默认 512MB（`-Xmx512m`，可通过 `ONTOP_JAVA_ARGS` 调整） |
| **文件编码** | UTF-8 |
| **入口类** | `it.unibz.inf.ontop.cli.Ontop` |
| **Classpath** | `$ONTOP_HOME/lib/*:$ONTOP_HOME/jdbc/*` |

启动命令（简化）：

```bash
java -Xmx512m \
  -cp "lib/*:jdbc/*" \
  it.unibz.inf.ontop.cli.Ontop "$@"
```

---

## 三、Ontop 自身模块（13 个 JAR）

| 模块 | 职责 |
|------|------|
| `ontop-cli` | 命令行入口，参数解析 |
| `ontop-model` | 核心数据模型（URI、Literal、三元组、Variable） |
| `ontop-obda-core` | OBDA 核心逻辑（Ontology-Based Data Access） |
| `ontop-mapping-core` | 映射规则解析和管理（.obda 文件） |
| `ontop-mapping-sql-core` | SQL 类型映射（varchar→string, integer→integer） |
| `ontop-mapping-r2rml` | W3C R2RML 标准映射支持 |
| `ontop-optimization` | SPARQL 查询优化（消除冗余、常量传播） |
| `ontop-reformulation-core` | **核心！SPARQL → SQL 重写引擎** |
| `ontop-rdb` | 关系数据库适配层（SQL 方言处理） |
| `ontop-kg-query` | 知识图谱查询执行器 |
| `ontop-endpoint` | SPARQL HTTP endpoint 服务 |
| `ontop-owlapi` | OWL API 集成（本体读写） |
| `ontop-rdf4j` | RDF4J 集成（RDF 解析、SPARQL 引擎） |

模块间通过 **Google Guice** 依赖注入连接，不使用 OSGI。

---

## 四、核心依赖（171 个 JAR 分类）

### 4.1 依赖注入

| 技术 | 版本 | 作用 |
|------|------|------|
| Google Guice | 5.0.1 | 模块间依赖注入（替代 Spring DI） |
| javax.inject | 1.0 | JSR-330 注解标准 |
| aopalliance | 1.0 | AOP 接口支持 |

### 4.2 Web 服务（SPARQL Endpoint）

| 技术 | 版本 | 作用 |
|------|------|------|
| Spring Boot | 2.7.18 | Web 应用框架 |
| Spring Framework | 5.3.31 | IoC、Web MVC、AOP |
| Tomcat Embed | 9.0.111 | 内嵌 Servlet 容器 |
| Thymeleaf | 3.0.15 | 模板引擎（endpoint 管理页面） |

### 4.3 语义/本体处理

| 技术 | 版本 | 作用 |
|------|------|------|
| OWL API | 5.5.1 | OWL 本体读写、推理接口 |
| Eclipse RDF4J | 5.1.4 | RDF 解析、SPARQL 引擎（30+ 子模块） |
| R2RML API | 0.9.1 | W3C R2RML 映射标准 |
| JSON-LD | 0.13.0 | JSON-LD 格式支持 |
| Apache Commons RDF | 0.5.0 | RDF 数据模型抽象 |

### 4.4 数据库/SQL

| 技术 | 版本 | 作用 |
|------|------|------|
| HikariCP | 3.4.5 | 数据库连接池 |
| JSQLParser | 4.4 | SQL 解析和生成 |
| Tomcat JDBC | 10.0.0-M7 | 备用连接池 |

### 4.5 命令行

| 技术 | 版本 | 作用 |
|------|------|------|
| Airline | 3.0.0 | CLI 注解框架（命令、参数、帮助） |
| ANTLR4 | 4.13.1 | 解析器生成（SPARQL/OBDA 语法） |

### 4.6 数据处理

| 技术 | 版本 | 作用 |
|------|------|------|
| Jackson | 2.15.4 | JSON 序列化/反序列化 |
| Gson | 2.10.1 | 备用 JSON 处理 |
| opencsv | 5.7.1 | CSV 读写 |
| toml4j | 0.7.2 | TOML 配置解析 |

### 4.7 基础工具

| 技术 | 版本 | 作用 |
|------|------|------|
| Guava | 32.0.1 | Google 核心库（集合、缓存、并发） |
| Caffeine | 3.1.8 | 高性能缓存 |
| Apache Commons | 各版本 | 通用工具（IO、Lang、Collections、Math） |
| JGraphT | 0.9.3 | 图算法库（查询优化中的图操作） |
| Proj4J | 1.1.1 | 地理坐标投影（GeoSPARQL 支持） |
| Micrometer | 1.9.17 | 指标监控 |

### 4.8 日志

| 技术 | 版本 | 作用 |
|------|------|------|
| Logback | 1.2.13 | 日志实现 |
| SLF4J | 1.7.36 | 日志门面 |

---

## 五、核心流程：SPARQL → SQL 技术链路

```
用户输入 SPARQL
       │
       ▼ ANTLR4（语法解析）
  SPARQL AST（抽象语法树）
       │
       ▼ ontop-optimization（查询优化）
  优化后的 SPARQL（消除冗余三元组模式、常量传播）
       │
       ▼ ontop-reformulation-core（★ 核心重写引擎）
  │    结合 OWL 本体推理（OWL 2 QL）和 .obda 映射规则
  │    将 SPARQL 图模式匹配 → SQL 查询表达式
  │    处理：URI 模板展开、类型转换、JOIN 推导
       │
       ▼ JSQLParser（SQL 生成）
  标准 SQL 语句
       │
       ▼ HikariCP（连接池获取连接）
  JDBC → 目标数据库（PostgreSQL/MySQL/Oracle...）
       │
       ▼ RDF4J（结果封装）
  SQL 结果 → RDF 三元组 → 返回给用户
```

### 重写引擎的工作原理

```
SPARQL 三元组模式: ?sale f:store_id ?sid

1. 匹配映射 target: <.../sale_id={sale_id}> <...#store_id> {store_id}
2. 定位 source: SELECT * FROM "fact_sales"
3. 推导: ?sid ← fact_sales.store_id

SPARQL 中的共享变量 ?sid:
  ?sale f:store_id ?sid
  ?store s:store_id ?sid

推导出 JOIN:
  fact_sales.store_id = dim_store.store_id
```

---

## 六、CLI 命令清单

| 命令 | 作用 |
|------|------|
| `bootstrap` | 从数据库自动生成本体 + 映射规则 |
| `endpoint` | 启动 SPARQL HTTP endpoint |
| `materialize` | 导出 RDF 三元组（物化） |
| `query` | 直接执行 SPARQL 查询 |
| `validate` | 验证本体和映射规则 |
| `mapping` | 操作映射文件（合并、转换格式） |
| `extract-db-metadata` | 提取数据库元数据为 JSON |

---

## 七、可配置项

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `JAVA_HOME` | 系统 Java | Java 安装路径 |
| `ONTOP_JAVA_ARGS` | `-Xmx512m` | JVM 参数（调大内存用） |
| `ONTOP_FILE_ENCODING` | `UTF-8` | 文件编码 |
| `ONTOP_LOG_LEVEL` | `info` | 日志级别（debug/info/warn/error） |
| `ONTOP_DEBUG` | `false` | 调试模式（等同 log level=debug） |
| `ONTOP_LOG_CONFIG` | `log/logback.xml` | 日志配置文件 |

---

## 八、扩展方式

| 扩展需求 | 方式 |
|----------|------|
| 支持新数据库 | 将 JDBC 驱动放入 `jdbc/` 目录 |
| 自定义本体 | 编辑 `.ttl` 文件（Protégé 或文本编辑器） |
| 自定义映射 | 编辑 `.obda` 文件（Protégé 插件或文本） |
| 调整日志 | 编辑 `log/logback.xml` |
| 调大内存 | 设置 `ONTOP_JAVA_ARGS=-Xmx2g` |

**不支持插件架构**：无 OSGI、无 SPI、无插件 API。扩展仅限于 JDBC 驱动和配置文件。

---

## 九、技术栈总结

| 维度 | 选型 | 理由 |
|------|------|------|
| 语言 | Java 11+ | 企业级稳定，OWL API/RDF4J 生态成熟 |
| DI | Guice（非 Spring） | 更轻量，适合库级模块化 |
| Web | Spring Boot | 仅 endpoint 功能使用 |
| 本体 | OWL API | Java 生态的 OWL 标准实现 |
| RDF | RDF4J | 比 Jena 更现代的 RDF 框架 |
| SQL | JSQLParser | 纯 Java SQL 解析器 |
| CLI | Airline | 注解驱动的命令行框架 |
| 映射标准 | OBDA + R2RML | 同时支持自有格式和 W3C 标准 |

**一句话总结**：Ontop 是 Java 生态的 OBDA 引擎，用 Guice 做模块化，OWL API 处理本体，RDF4J 处理 RDF/SPARQL，Spring Boot 提供 HTTP 服务，核心能力是 reformulation 引擎（SPARQL → SQL 重写），通过 JDBC 连接任意关系型数据库。
