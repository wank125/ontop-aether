#!/usr/bin/env python3
"""
Text-to-SQL 测试：自然语言 → SQL → PostgreSQL（无需 Ontop / Neo4j）

使用 LM Studio 本地模型直接生成 SQL 查询数据库
"""

from openai import OpenAI
import psycopg2
import json

# ══════════════════════════════════════════════════
# 配置
# ══════════════════════════════════════════════════
LM_STUDIO_BASE_URL = "http://localhost:1234/v1"
LM_STUDIO_MODEL = "zai-org/glm-4.7-flash"

PG_DSN = "host=localhost port=5433 dbname=retail_db user=admin password=test123"

# ══════════════════════════════════════════════════
# Step 1: 连接
# ══════════════════════════════════════════════════
print("=== Step 1: 连接服务 ===")
client = OpenAI(base_url=LM_STUDIO_BASE_URL, api_key="lm-studio")
pg = psycopg2.connect(PG_DSN)
print(f"模型: {LM_STUDIO_MODEL}")
print(f"数据库: PostgreSQL (retail_db)")

# ══════════════════════════════════════════════════
# Step 2: SQL 生成 Prompt
# ══════════════════════════════════════════════════
SQL_PROMPT = """根据以下表结构，将用户问题翻译为一条 PostgreSQL SQL 查询。

表结构:
- dim_store(store_id INT PK, name VARCHAR(100), region VARCHAR(50))
- dim_employee(emp_id INT PK, name VARCHAR(100), role VARCHAR(50), store_id INT FK→dim_store)
- fact_sales(sale_id INT PK, emp_id INT FK→dim_employee, store_id INT FK→dim_store, amount DECIMAL(10,2), sale_date DATE)

数据示例:
- dim_store: (1,'华东旗舰店','华东'), (2,'南京中心店','华东'), (3,'广州天河店','华南'), (4,'深圳南山店','华南')
- dim_employee: (101,'张三','店长',1), (102,'李四','销售员',1), (103,'王五','销售员',2)
- fact_sales: (1001,102,1,1500.00,'2026-03-01'), (1002,102,1,2300.00,'2026-03-05')

规则:
1. 只返回一条 SQL，不要解释
2. 使用 JOIN 处理外键关联
3. 中文名称直接匹配

用户问题: {question}

SQL:"""

ANSWER_PROMPT = """根据以下 SQL 查询结果，用中文简洁回答用户问题。

用户问题: {question}
SQL 查询结果: {result}

回答:"""

# ══════════════════════════════════════════════════
# Step 3: 问答函数
# ══════════════════════════════════════════════════
def ask(question: str) -> str:
    print(f"\n{'='*50}")
    print(f"问: {question}")
    print(f"{'='*50}")

    # 1. 生成 SQL
    print("\n[1] 生成 SQL...")
    resp = client.chat.completions.create(
        model=LM_STUDIO_MODEL,
        messages=[{"role": "user", "content": SQL_PROMPT.format(question=question)}],
        temperature=0, max_tokens=256,
    )
    sql = resp.choices[0].message.content.strip()
    # 清理 markdown
    if sql.startswith("```"):
        sql = sql.split("\n", 1)[1] if "\n" in sql else sql[3:]
    if sql.endswith("```"):
        sql = sql[:-3]
    sql = sql.strip().rstrip(";")
    print(f"  SQL: {sql}")

    # 2. 执行查询
    print("\n[2] 执行查询...")
    try:
        cur = pg.cursor()
        cur.execute(sql)
        cols = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
        records = [dict(zip(cols, row)) for row in rows]
        cur.close()
        # 转换非 JSON 类型
        for r in records:
            for k, v in r.items():
                if hasattr(v, 'isoformat'):
                    r[k] = v.isoformat()
                elif not isinstance(v, (str, int, float, bool, type(None))):
                    r[k] = str(v)
        print(f"  结果: {records}")
    except Exception as e:
        return f"SQL 执行失败: {e}"

    if not records:
        return "没有查到结果。"

    # 3. 生成回答
    print("\n[3] 生成回答...")
    result_str = json.dumps(records, ensure_ascii=False)
    resp = client.chat.completions.create(
        model=LM_STUDIO_MODEL,
        messages=[{"role": "user", "content": ANSWER_PROMPT.format(question=question, result=result_str)}],
        temperature=0, max_tokens=256,
    )
    answer = resp.choices[0].message.content.strip()
    print(f"  回答: {answer}")
    return answer

# ══════════════════════════════════════════════════
# Step 4: 运行测试
# ══════════════════════════════════════════════════
print("\n=== Step 2: Text-to-SQL 测试 ===")

questions = [
    "有哪些门店？",
    "华东旗舰店有多少员工？",
    "哪个门店销售额最高？",
    "李四经手的销售总额是多少？",
    "华南地区的门店有哪些员工？",
    "3月份每天的销售额趋势是怎样的？",
    "哪些员工还没有销售记录？",
]

for q in questions:
    ask(q)

pg.close()
print("\n\n=== 测试完成 ===")
