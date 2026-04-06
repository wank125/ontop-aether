#!/usr/bin/env python3
"""
Ontop → Neo4j 知识图谱导入脚本

流程：PostgreSQL → Ontop materialize (RDF) → Python 解析 → Neo4j Cypher 导入
"""

from rdflib import Graph, Namespace, RDF, RDFS, OWL
from neo4j import GraphDatabase
import sys

# ══════════════════════════════════════════════════
# 配置
# ══════════════════════════════════════════════════
TTL_FILE = "output/retail_exported.ttl"
NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "Test1234"

# Namespace
NS = Namespace("http://example.com/retail/")

# ══════════════════════════════════════════════════
# Step 1: 解析 RDF 三元组
# ══════════════════════════════════════════════════
print("=== Step 1: 解析 RDF 三元组 ===")
g = Graph()
g.parse(TTL_FILE, format="turtle")
print(f"三元组总数: {len(g)}")

# 按 rdf:type 分组，统计各类实体数量
type_counts = {}
for s, p, o in g.triples((None, RDF.type, None)):
    local_type = str(o).replace(str(NS), "")
    type_counts[local_type] = type_counts.get(local_type, 0) + 1
print(f"实体类型分布: {type_counts}")

# ══════════════════════════════════════════════════
# Step 2: 提取节点（实体）和属性
# ══════════════════════════════════════════════════
print("\n=== Step 2: 提取节点和属性 ===")

nodes = {}  # uri -> {label, props}
edges = []  # [(src_uri, rel_name, tgt_uri)]

for s, p, o in g:
    s_str = str(s)
    p_str = str(p)
    o_str = str(o)

    # 跳过非业务命名空间
    if not s_str.startswith(str(NS)):
        continue

    # rdf:type → 节点标签
    if p == RDF.type:
        label = o_str.replace(str(NS), "")
        if s_str not in nodes:
            nodes[s_str] = {"label": label, "props": {}}
        else:
            nodes[s_str]["label"] = label
        continue

    # 对象属性（引用关系）→ 边：宾语是 URI（非 literal）
    from rdflib import URIRef, Literal
    if isinstance(o, URIRef) and p != RDF.type:
        rel_name = p_str.split("#")[-1] if "#" in p_str else p_str.split("/")[-1]
        edges.append((s_str, rel_name, o_str))
        continue

    # 数据属性 → 节点属性：宾语是 literal
    if isinstance(o, Literal):
        prop_name = p_str.split("#")[-1]
        if s_str not in nodes:
            nodes[s_str] = {"label": "Unknown", "props": {}}
        # 提取属性值
        if hasattr(o, 'toPython'):
            val = o.toPython()
        else:
            val = str(o)
        # Neo4j driver doesn't support Decimal
        import decimal
        if isinstance(val, decimal.Decimal):
            val = float(val)
        nodes[s_str]["props"][prop_name] = val

print(f"节点数: {len(nodes)}")
print(f"关系数: {len(edges)}")

# ══════════════════════════════════════════════════
# Step 3: 连接 Neo4j 并导入
# ══════════════════════════════════════════════════
print("\n=== Step 3: 连接 Neo4j ===")
driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

with driver.session() as session:
    # 清空已有数据
    session.run("MATCH (n) DETACH DELETE n")
    print("已清空 Neo4j 数据")

    # 导入节点
    print("\n--- 导入节点 ---")
    for uri, info in nodes.items():
        label = info["label"]
        props = info["props"]

        # 从 URI 中提取 ID
        uri_id = uri.split("/")[-1]  # e.g., "store_id=1"
        id_parts = uri_id.split("=")
        if len(id_parts) == 2:
            props[id_parts[0]] = int(id_parts[1]) if id_parts[1].isdigit() else id_parts[1]

        # 构建 Cypher
        prop_str = ", ".join([f'{k}: ${k}' for k in props])
        cypher = f"CREATE (n:`{label}` {{{prop_str}}}) RETURN n"
        session.run(cypher, **props)
        print(f"  创建节点: [{label}] {props.get('name', props.get('store_id', uri_id))}")

    # 创建索引
    for label in set(n["label"] for n in nodes.values()):
        # 找到该类的主键字段
        pk_field = None
        for uri, info in nodes.items():
            if info["label"] == label:
                uri_id = uri.split("/")[-1]
                pk_parts = uri_id.split("=")
                if len(pk_parts) == 2:
                    pk_field = pk_parts[0]
                    break
        if pk_field:
            try:
                session.run(f"CREATE INDEX FOR (n:`{label}`) ON (n.`{pk_field}`)")
                print(f"  创建索引: {label}.{pk_field}")
            except:
                pass

    # 导入关系
    print("\n--- 导入关系 ---")
    # 构建节点 URI → Neo4j 标签+ID 映射
    def get_match_clause(uri):
        info = nodes.get(uri, {"label": "Unknown", "props": {}})
        label = info["label"]
        uri_id = uri.split("/")[-1]
        id_parts = uri_id.split("=")
        if len(id_parts) == 2:
            pk = id_parts[0]
            pk_val = int(id_parts[1]) if id_parts[1].isdigit() else id_parts[1]
            return f"(n:`{label}` {{{pk}: {pk_val}}})"
        return f"(n {{uri: '{uri}'}})"

    for idx, (src_uri, rel_name, tgt_uri) in enumerate(edges):
        src_info = nodes.get(src_uri, {"label": "Unknown", "props": {}})
        tgt_info = nodes.get(tgt_uri, {"label": "Unknown", "props": {}})
        src_label = src_info["label"]
        tgt_label = tgt_info["label"]
        src_uri_id = src_uri.split("/")[-1]
        tgt_uri_id = tgt_uri.split("/")[-1]
        src_pk_parts = src_uri_id.split("=")
        tgt_pk_parts = tgt_uri_id.split("=")

        rel_type = rel_name.upper().replace("-", "_")

        if len(src_pk_parts) == 2 and len(tgt_pk_parts) == 2:
            src_pk = src_pk_parts[0]
            src_pk_val = int(src_pk_parts[1]) if src_pk_parts[1].isdigit() else src_pk_parts[1]
            tgt_pk = tgt_pk_parts[0]
            tgt_pk_val = int(tgt_pk_parts[1]) if tgt_pk_parts[1].isdigit() else tgt_pk_parts[1]
            cypher = f"MATCH (a:`{src_label}` {{{src_pk}: {src_pk_val}}}), (b:`{tgt_label}` {{{tgt_pk}: {tgt_pk_val}}}) CREATE (a)-[:{rel_type}]->(b)"
        else:
            continue
        try:
            session.run(cypher)
            src_label = nodes.get(src_uri, {}).get("label", "?")
            tgt_label = nodes.get(tgt_uri, {}).get("label", "?")
            src_name = src_info.get("props", {}).get("name", src_uri_id)
            tgt_name = tgt_info.get("props", {}).get("name", tgt_uri_id)
            print(f"  {src_label}[{src_name}] -[:{rel_type}]-> {tgt_label}[{tgt_name}]")
        except Exception as e:
            print(f"  ⚠ 跳过: {e}")

driver.close()

# ══════════════════════════════════════════════════
# Step 4: 验证导入结果
# ══════════════════════════════════════════════════
print("\n=== Step 4: 验证 Neo4j 知识图谱 ===")
driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
with driver.session() as session:
    # 节点统计
    result = session.run("MATCH (n) RETURN labels(n)[0] AS label, count(*) AS cnt ORDER BY cnt DESC")
    print("\n节点统计:")
    for r in result:
        print(f"  {r['label']}: {r['cnt']} 个")

    # 关系统计
    result = session.run("MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS cnt ORDER BY cnt DESC")
    print("\n关系统计:")
    for r in result:
        print(f"  -[:{r['rel']}]-> : {r['cnt']} 条")

    # 关系统计
    result = session.run("MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS cnt ORDER BY cnt DESC")
    print("\n关系统计:")
    for r in result:
        print(f"  -[:{r['rel']}]-> : {r['cnt']} 条")

    # 图遍历示例1：门店 ← 员工
    print("\n图遍历: 门店 ← 员工（WORKS_AT）:")
    result = session.run("""
        MATCH (e:dim_employee)-[:REF_STORE_ID]->(s:dim_store)
        RETURN e.name AS emp, s.name AS store
        ORDER BY s.name
    """)
    for r in result:
        print(f"  {r['emp']} → {r['store']}")

    # 图遍历示例2：门店 ← 销售（聚合）
    print("\n图遍历: 各门店销售额:")
    result = session.run("""
        MATCH (f:fact_sales)-[:REF_STORE_ID]->(s:dim_store)
        RETURN s.name AS store, sum(f.amount) AS total, count(f) AS orders
        ORDER BY total DESC
    """)
    for r in result:
        print(f"  {r['store']}: ¥{r['total']:,.2f} ({r['orders']} 笔)")

    # 图遍历示例3：多跳 门店 ← 员工 ← 销售
    print("\n图遍历: 多跳（门店←员工←销售）:")
    result = session.run("""
        MATCH (f:fact_sales)-[:REF_EMP_ID]->(e:dim_employee)-[:REF_STORE_ID]->(s:dim_store)
        RETURN s.name AS store, e.name AS emp, f.amount AS amount
        ORDER BY s.name, e.name
    """)
    for r in result:
        print(f"  {r['store']} ← {r['emp']} ← ¥{r['amount']}")

driver.close()
print("\n✅ 完成！知识图谱已导入 Neo4j")
