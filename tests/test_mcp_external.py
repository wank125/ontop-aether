"""MCP Server 外部客户端测试 — 从宿主机连接到容器内的 MCP Server。

用法:
    # 1. 确保 MCP 服务已启动
    curl -X POST http://localhost:8001/api/v1/publishing/mcp/start

    # 2. 安装 MCP SDK
    pip install mcp httpx

    # 3. 运行测试
    python tests/test_mcp_external.py

    # 4. 指定 URL（默认 http://localhost:8001/mcp/mcp）
    MCP_URL=http://localhost:8001/mcp/mcp python tests/test_mcp_external.py

依赖:
    pip install mcp httpx
"""

import asyncio
import json
import os
import sys
import time
import traceback

from mcp.client.streamable_http import streamablehttp_client
from mcp.client.session import ClientSession


MCP_URL = os.environ.get("MCP_URL", "http://localhost:8001/mcp/mcp")


# ── 测试框架 ──────────────────────────────────────────────

passed = 0
failed = 0
skipped = 0


async def run(name: str, coro):
    global passed, failed, skipped
    t0 = time.perf_counter()
    try:
        result = await asyncio.wait_for(coro, timeout=30.0)
        ms = (time.perf_counter() - t0) * 1000
        passed += 1
        detail = f" — {result}" if result else ""
        print(f"  ✅ {name} ({ms:.0f}ms){detail}")
    except asyncio.TimeoutError:
        failed += 1
        print(f"  ❌ {name} — 超时 (30s)")
    except AssertionError as e:
        failed += 1
        print(f"  ❌ {name} — 断言失败: {e}")
    except Exception as e:
        failed += 1
        print(f"  ❌ {name} — {e}")


# ── 测试用例 ──────────────────────────────────────────────

async def t_initialize(session):
    """初始化握手"""
    r = await session.initialize()
    assert r.serverInfo.name == "ontop-semantic"
    return f"server={r.serverInfo.name}"


async def t_list_tools(session):
    """列出所有工具"""
    r = await session.list_tools()
    names = [t.name for t in r.tools]
    assert "sparql_query" in names
    assert "list_ontology_classes" in names
    assert "describe_class" in names
    assert "get_sample_data" in names
    return f"{len(names)} tools: {', '.join(names)}"


async def t_list_ontology_classes(session):
    """列出本体类"""
    r = await session.call_tool("list_ontology_classes", {})
    classes = json.loads(r.content[0].text)
    assert isinstance(classes, list) and len(classes) > 0
    return f"{len(classes)} classes, first: {classes[0]['name']}"


async def t_describe_class(session):
    """查询类详情"""
    r = await session.call_tool("describe_class", {"class_name": "PropertyProject"})
    d = json.loads(r.content[0].text)
    assert d["name"] == "PropertyProject"
    n_props = len(d.get("properties", []))
    return f"{n_props} properties"


async def t_describe_not_found(session):
    """查询不存在的类"""
    r = await session.call_tool("describe_class", {"class_name": "FooBar999"})
    d = json.loads(r.content[0].text)
    assert d.get("error") == "Class not found"
    return "correct error"


async def t_sparql_query(session):
    """SPARQL 查询"""
    import httpx
    ontop = os.environ.get("ONTOP_ENDPOINT_URL", "http://localhost:8081")
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            resp = await c.get(f"{ontop}/sparql", params={"query": "ASK{?s ?p ?o}"})
            if resp.status_code != 200:
                return "SKIP: Ontop not reachable"
    except Exception:
        return "SKIP: Ontop not reachable"

    sparql = "SELECT DISTINCT ?class WHERE { ?s a ?class } LIMIT 5"
    r = await session.call_tool("sparql_query", {"query": sparql})
    assert not r.isError
    data = json.loads(r.content[0].text)
    rows = len(data.get("results", {}).get("bindings", []))
    return f"{rows} rows"


async def t_sparql_error(session):
    """SPARQL 无效查询"""
    r = await session.call_tool("sparql_query", {"query": "INVALID !!!"})
    if r.isError:
        return "correct isError"
    text = r.content[0].text
    data = json.loads(text)
    assert "error" in data
    return f"error: {data['error']}"


async def t_get_sample_data(session):
    """获取样本数据"""
    import httpx
    ontop = os.environ.get("ONTOP_ENDPOINT_URL", "http://localhost:8081")
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            resp = await c.get(f"{ontop}/sparql", params={"query": "ASK{?s ?p ?o}"})
            if resp.status_code != 200:
                return "SKIP: Ontop not reachable"
    except Exception:
        return "SKIP: Ontop not reachable"

    r = await session.call_tool("get_sample_data", {"class_name": "PropertyProject", "limit": 3})
    assert not r.isError
    return "ok"


# ── 主流程 ────────────────────────────────────────────────

async def main():
    print(f"\n{'='*60}")
    print(f"  MCP Server 外部客户端测试")
    print(f"  端点: {MCP_URL}")
    print(f"  时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    # 连接
    print("📡 连接中...")
    try:
        ctx = streamablehttp_client(MCP_URL)
        read_stream, write_stream, _ = await ctx.__aenter__()
        session = ClientSession(read_stream, write_stream)
        await session.__aenter__()
    except Exception as e:
        print(f"❌ 连接失败: {e}")
        traceback.print_exc()
        return

    try:
        await run("初始化", t_initialize(session))
        await run("列出工具", t_list_tools(session))
        await run("列出本体类", t_list_ontology_classes(session))
        await run("查询类详情", t_describe_class(session))
        await run("查询不存在的类", t_describe_not_found(session))
        await run("SPARQL 查询", t_sparql_query(session))
        await run("SPARQL 无效查询", t_sparql_error(session))
        await run("获取样本数据", t_get_sample_data(session))
    finally:
        try:
            await session.__aexit__(None, None, None)
        except Exception:
            pass
        try:
            await ctx.__aexit__(None, None, None)
        except Exception:
            pass

    total = passed + failed + skipped
    print(f"\n{'='*60}")
    print(f"  结果: {total} 总计 | {passed} 通过 | {failed} 失败 | {skipped} 跳过")
    print(f"{'='*60}\n")
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    asyncio.run(main())
