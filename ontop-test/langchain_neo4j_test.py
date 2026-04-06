#!/usr/bin/env python3
"""
GraphRAG 测试脚本：自然语言 → Cypher → Neo4j 知识图谱查询

使用 LM Studio 本地模型（OpenAI 兼容 API）
直接用 openai + neo4j 库，绕过 LangChain 的 torch 依赖问题
"""

from openai import OpenAI
from neo4j import GraphDatabase
import json

# ══════════════════════════════════════════════════
# 配置
# ══════════════════════════════════════════════════
LM_STUDIO_BASE_URL = "http://localhost:1234/v1"
LM_STUDIO_MODEL = "zai-org/glm-4.7-flash"
# LM_STUDIO_MODEL = "gpt-oss-20b"                           # 推理模型，content为空
# LM_STUDIO_MODEL = "qwen3.5-27b-claude-4.6-opus-reasoning-distilled"  # 推理模型
# LM_STUDIO_MODEL = "qwen/qwen3.5-35b-a3b"                  # 推理模型

NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "Test1234"

# ══════════════════════════════════════════════════
# Step 1: 连接 LM Studio 本地模型
# ══════════════════════════════════════════════════
print("=== Step 1: 连接 LM Studio 本地模型 ===")
client = OpenAI(base_url=LM_STUDIO_BASE_URL, api_key="lm-studio")
print(f"模型: {LM_STUDIO_MODEL}")
print(f"API: {LM_STUDIO_BASE_URL}")

# ══════════════════════════════════════════════════
# Step 2: 连接 Neo4j 并获取 Schema
# ══════════════════════════════════════════════════
print("\n=== Step 2: 连接 Neo4j ===")
driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

# 验证连接
with driver.session() as session:
    result = session.run("MATCH (n) RETURN count(n) AS cnt")
    cnt = result.single()["cnt"]
    print(f"Neo4j 连接成功，共 {cnt} 个节点")

# ══════════════════════════════════════════════════
# Step 3: 自然语言 → Cypher → 查询 → 回答
# ══════════════════════════════════════════════════
CYPHER_PROMPT = """你是一个 Neo4j Cypher 查询生成器。根据图谱 Schema 将用户问题翻译为 Cypher。

图谱 Schema:
节点标签和属性:
- dim_store(store_id, name, region)
- dim_employee(emp_id, name, role, store_id)
- fact_sales(sale_id, emp_id, store_id, amount, sale_date)

关系（注意方向）:
- (dim_employee)-[:REF_STORE_ID]->(dim_store)   员工所属门店
- (fact_sales)-[:REF_STORE_ID]->(dim_store)     销售所属门店
- (fact_sales)-[:REF_EMP_ID]->(dim_employee)    销售经手员工

数据示例:
- dim_store: store_id=1, name='华东旗舰店', region='华东'
- dim_store: store_id=3, name='广州天河店', region='华南'
- dim_employee: emp_id=101, name='张三', role='店长', store_id=1
- dim_employee: emp_id=102, name='李四', role='销售员', store_id=1
- fact_sales: sale_id=1001, emp_id=102, store_id=1, amount=1500, sale_date='2026-03-01'

示例:
- 查某门店员工: MATCH (e:dim_employee)-[:REF_STORE_ID]->(s:dim_store {{name: 'XX'}}) RETURN e
- 查某员工销售额: MATCH (f:fact_sales)-[:REF_EMP_ID]->(e:dim_employee {{name: 'XX'}}) RETURN sum(f.amount)
- 查各门店销售额: MATCH (f:fact_sales)-[:REF_STORE_ID]->(s:dim_store) RETURN s.name, sum(f.amount) ORDER BY sum(f.amount) DESC
- 查某区域员工: MATCH (e:dim_employee)-[:REF_STORE_ID]->(s:dim_store {{region: 'XX'}}) RETURN e.name

规则:
1. 只返回一条 Cypher，不要解释
2. 关系方向必须严格按上述定义
3. 不要使用 CALL/YIELD

用户问题: {question}

Cypher:"""

ANSWER_PROMPT = """根据以下图谱查询结果，用中文回答用户问题。

用户问题: {question}

查询结果:
{result}

简洁回答:"""


def ask(question: str) -> str:
    """自然语言提问 → Cypher → 查询 → 自然语言回答"""
    print(f"\n{'='*50}")
    print(f"问: {question}")
    print(f"{'='*50}")

    # 1. 生成 Cypher
    print("\n[1] 生成 Cypher...")
    resp = client.chat.completions.create(
        model=LM_STUDIO_MODEL,
        messages=[{"role": "user", "content": CYPHER_PROMPT.format(question=question)}],
        temperature=0,
        max_tokens=256,
    )
    msg = resp.choices[0].message
    cypher = msg.content.strip() if msg.content else ""
    # 推理模型可能把内容放在 reasoning_content
    if not cypher and msg.model_extra and msg.model_extra.get("reasoning_content"):
        rc = msg.model_extra["reasoning_content"]
        # 尝试从推理内容中提取 Cypher
        if "```" in rc:
            parts = rc.split("```")
            for p in parts:
                if "MATCH" in p or "match" in p:
                    cypher = p.replace("cypher", "").replace("Cypher", "").strip()
                    break

    # 清理可能的 markdown 代码块标记
    if cypher.startswith("```"):
        cypher = cypher.split("\n", 1)[1] if "\n" in cypher else cypher[3:]
    if cypher.endswith("```"):
        cypher = cypher[:-3]
    cypher = cypher.strip()

    print(f"  Cypher: {cypher}")

    # 2. 执行查询
    print("\n[2] 执行查询...")
    try:
        with driver.session() as session:
            result = session.run(cypher)
            records = [dict(r) for r in result]
        print(f"  结果: {records}")
    except Exception as e:
        return f"查询执行失败: {e}"

    if not records:
        return "没有查到结果。"

    # 3. 生成自然语言回答
    print("\n[3] 生成自然语言回答...")
    result_str = json.dumps(records, ensure_ascii=False, default=str)
    resp = client.chat.completions.create(
        model=LM_STUDIO_MODEL,
        messages=[{"role": "user", "content": ANSWER_PROMPT.format(question=question, result=result_str)}],
        temperature=0,
        max_tokens=256,
    )
    answer = resp.choices[0].message.content.strip()
    print(f"  回答: {answer}")
    return answer


# ══════════════════════════════════════════════════
# Step 4: 运行测试
# ══════════════════════════════════════════════════
print("\n=== Step 3: 自然语言问答测试 ===")

questions = [
    "有哪些门店？",
    "华东旗舰店有多少员工？",
    "哪个门店销售额最高？",
    "李四经手的销售总额是多少？",
    "华南地区的门店有哪些员工？",
]

for q in questions:
    ask(q)

driver.close()
print("\n\n=== 测试完成 ===")
