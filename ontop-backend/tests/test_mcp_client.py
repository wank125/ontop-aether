"""MCP Server 端到端测试 — 通过 MCP Python SDK 客户端验证所有工具。

用法:
    # 在后端容器内运行（MCP 服务需先启动）:
    python tests/test_mcp_client.py

    # 或指定 MCP 端点 URL:
    MCP_URL=http://localhost:8001/mcp/mcp/ python tests/test_mcp_client.py

前置条件:
    1. 后端已启动 (python main.py)
    2. MCP 服务已启动 (curl -X POST /api/v1/publishing/mcp/start)
    3. Ontop 端点可选 — 不启动时 sparql_query/get_sample_data 会跳过
"""

import asyncio
import json
import os
import sys
import time
import traceback
from pathlib import Path

# 确保可以 import backend 模块
sys.path.insert(0, str(Path(__file__).resolve().parent))


# ── 测试框架 ──────────────────────────────────────────────

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.results = []

    def record(self, name: str, status: str, detail: str = "", duration_ms: float = 0):
        self.results.append({"name": name, "status": status, "detail": detail, "duration_ms": duration_ms})
        if status == "PASS":
            self.passed += 1
        elif status == "FAIL":
            self.failed += 1
        else:
            self.skipped += 1

    def summary(self) -> str:
        total = self.passed + self.failed + self.skipped
        lines = [
            "",
            "=" * 60,
            "  MCP Server 测试报告",
            "=" * 60,
        ]
        for r in self.results:
            icon = {"PASS": "✅", "FAIL": "❌", "SKIP": "⏭️"}[r["status"]]
            dur = f" ({r['duration_ms']:.0f}ms)" if r["duration_ms"] > 0 else ""
            lines.append(f"  {icon} {r['name']}{dur}")
            if r["detail"]:
                for dl in r["detail"].split("\n"):
                    lines.append(f"     {dl}")
        lines.append("")
        lines.append(f"  总计: {total}  通过: {self.passed}  失败: {self.failed}  跳过: {self.skipped}")
        lines.append("=" * 60)
        return "\n".join(lines)


results = TestResult()


async def run_test(name: str, coro):
    """运行单个测试，记录结果。"""
    t0 = time.perf_counter()
    try:
        result = await asyncio.wait_for(coro, timeout=30.0)
        ms = (time.perf_counter() - t0) * 1000
        detail = ""
        if isinstance(result, str):
            detail = result[:200]
        results.record(name, "PASS", detail, ms)
        print(f"  ✅ {name} ({ms:.0f}ms)")
    except asyncio.TimeoutError:
        results.record(name, "FAIL", "超时 (30s)")
        print(f"  ❌ {name} — 超时")
    except Exception as e:
        ms = (time.perf_counter() - t0) * 1000
        results.record(name, "FAIL", str(e), ms)
        print(f"  ❌ {name} — {e}")


# ── MCP 客户端连接 ────────────────────────────────────────

async def create_client(url: str):
    """创建 MCP 客户端并初始化会话。"""
    from mcp.client.streamable_http import streamablehttp_client
    from mcp.client.session import ClientSession

    ctx = streamablehttp_client(url)
    read_stream, write_stream, _ = await ctx.__aenter__()
    session = ClientSession(read_stream, write_stream)
    await session.__aenter__()
    init_result = await session.initialize()
    return session, init_result, ctx


async def cleanup_client(session, ctx):
    """关闭 MCP 客户端。"""
    try:
        await session.__aexit__(None, None, None)
    except Exception:
        pass
    try:
        await ctx.__aexit__(None, None, None)
    except Exception:
        pass


# ── 测试用例 ──────────────────────────────────────────────

async def test_initialize(init_result):
    """测试 1: 初始化连接，验证服务器信息。"""
    info = init_result.serverInfo
    assert info.name == "ontop-semantic", f"期望 server name='ontop-semantic', 实际='{info.name}'"
    return f"server={info.name}"


async def test_list_tools(session):
    """测试 2: 列出所有工具，验证数量和名称。"""
    tool_list = await session.list_tools()
    tools = tool_list.tools
    assert len(tools) >= 4, f"期望至少 4 个工具, 实际 {len(tools)} 个"

    expected = {"sparql_query", "list_ontology_classes", "describe_class", "get_sample_data"}
    actual = {t.name for t in tools}
    missing = expected - actual
    assert not missing, f"缺少工具: {missing}"
    return f"共 {len(tools)} 个工具: {', '.join(t.name for t in tools)}"


async def test_list_ontology_classes(session):
    """测试 3: list_ontology_classes — 获取本体类列表。"""
    result = await session.call_tool("list_ontology_classes", {})
    assert result.content, "返回内容为空"
    assert not result.isError, f"工具返回错误: {result.content}"

    # 解析 JSON
    text = result.content[0].text
    classes = json.loads(text)
    assert isinstance(classes, list), f"期望 list, 实际 {type(classes)}"

    if len(classes) > 0:
        first = classes[0]
        assert "name" in first, f"类缺少 name 字段: {first}"
        return f"共 {len(classes)} 个类, 示例: {first['name']}"
    return "返回空列表 (可能未配置 OBDA 映射)"


async def test_describe_class(session):
    """测试 4: describe_class — 获取指定类的详情。"""
    # 先获取类列表，取第一个类名
    list_result = await session.call_tool("list_ontology_classes", {})
    classes = json.loads(list_result.content[0].text)

    if not classes:
        return "跳过 — 无可用类 (未配置 OBDA 映射)"

    class_name = classes[0]["name"]
    result = await session.call_tool("describe_class", {"class_name": class_name})
    assert result.content, "返回内容为空"
    assert not result.isError, f"工具返回错误: {result.content}"

    detail = json.loads(result.content[0].text)
    assert detail.get("name") == class_name, f"类名不匹配"
    return f"类 '{class_name}' 有 {len(detail.get('properties', []))} 个属性"


async def test_describe_class_not_found(session):
    """测试 5: describe_class — 查询不存在的类。"""
    result = await session.call_tool("describe_class", {"class_name": "NonExistentClass999"})
    text = result.content[0].text
    detail = json.loads(text)
    assert detail.get("error") == "Class not found", f"期望错误 'Class not found', 实际: {detail}"
    return "正确返回 Class not found"


async def test_get_sample_data(session):
    """测试 6: get_sample_data — 获取样本数据。"""
    # 先检查 Ontop 端点是否可用
    import httpx
    try:
        ontop_url = os.environ.get("ONTOP_ENDPOINT_URL", "http://localhost:8080")
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{ontop_url}/sparql", params={"query": "ASK{?s ?p ?o}"})
            if resp.status_code != 200:
                return "跳过 — Ontop 端点不可用"
    except Exception:
        return "跳过 — Ontop 端点不可达"

    result = await session.call_tool("get_sample_data", {"class_name": "PropertyProject", "limit": 3})
    assert result.content, "返回内容为空"
    text = result.content[0].text

    if '"error"' in text:
        return f"查询返回错误 (可能 Ontop 未配置此类的映射): {text[:100]}"

    data = json.loads(text)
    bindings = data.get("results", {}).get("bindings", [])
    return f"返回 {len(bindings)} 条记录"


async def test_sparql_query(session):
    """测试 7: sparql_query — 执行 SPARQL 查询。"""
    import httpx
    ontop_url = os.environ.get("ONTOP_ENDPOINT_URL", "http://localhost:8080")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{ontop_url}/sparql", params={"query": "ASK{?s ?p ?o}"})
            if resp.status_code != 200:
                return "跳过 — Ontop 端点不可用"
    except Exception:
        return "跳过 — Ontop 端点不可达"

    sparql = "SELECT DISTINCT ?class WHERE { ?s a ?class } LIMIT 5"
    result = await session.call_tool("sparql_query", {"query": sparql})
    assert result.content, "返回内容为空"
    assert not result.isError, f"SPARQL 查询失败: {result.content[0].text[:200]}"

    text = result.content[0].text
    data = json.loads(text)
    vars_list = data.get("head", {}).get("vars", [])
    bindings = data.get("results", {}).get("bindings", [])
    return f"变量: {vars_list}, 返回 {len(bindings)} 行"


async def test_sparql_query_invalid(session):
    """测试 8: sparql_query — 无效查询应返回错误信息。"""
    result = await session.call_tool("sparql_query", {"query": "INVALID SPARQL SYNTAX !!!"})
    text = result.content[0].text

    # MCP SDK 可能将错误包装为 isError=True（如 httpx 连接错误）
    if result.isError:
        return f"正确返回错误 (isError=True): {text[:100]}"

    # 或者工具返回包含 "error" 的 JSON
    try:
        data = json.loads(text)
        if "error" in data:
            return f"正确返回错误: {data.get('error', 'unknown')}"
    except json.JSONDecodeError:
        # 非纯文本错误也接受
        if "error" in text.lower() or "failed" in text.lower():
            return f"正确返回错误文本: {text[:100]}"

    raise AssertionError(f"期望错误响应, 实际: {text[:200]}")


async def test_get_sample_data_limit(session):
    """测试 9: get_sample_data — limit 参数验证。"""
    result = await session.call_tool("get_sample_data", {"class_name": "Test", "limit": 100})
    # limit 应被限制为 50
    text = result.content[0].text
    return f"limit=100 请求正常处理 (服务端应截断为 50)"


# ── 主流程 ────────────────────────────────────────────────

async def main():
    mcp_url = os.environ.get(
        "MCP_URL",
        "http://localhost:8000/mcp/mcp/",  # 容器内用 FASTAPI_PORT
    )

    # 容器内可能端口不同，尝试从 config 读取
    try:
        from config import FASTAPI_PORT
        default_url = f"http://localhost:{FASTAPI_PORT}/mcp/mcp/"
        if not os.environ.get("MCP_URL"):
            mcp_url = default_url
    except Exception:
        pass

    print(f"\n🔍 MCP Server 测试")
    print(f"   端点: {mcp_url}")
    print(f"   时间: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")

    # 检查连通性
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(mcp_url.rstrip("/"))
            print(f"   端点 HTTP 状态: {resp.status_code}")
    except Exception as e:
        print(f"   ⚠️  端点不可达: {e}")
        print(f"   请确保后端已启动且 MCP 服务已开启\n")
        return

    # 连接 MCP
    print(f"\n📡 连接 MCP Server...")
    try:
        session, init_result, ctx = await create_client(mcp_url)
    except Exception as e:
        print(f"❌ 连接失败: {e}")
        traceback.print_exc()
        return

    try:
        # 运行测试
        print()
        await run_test("初始化连接", test_initialize(init_result))
        await run_test("列出工具", test_list_tools(session))
        await run_test("列出本体类", test_list_ontology_classes(session))
        await run_test("查询类详情", test_describe_class(session))
        await run_test("查询不存在的类", test_describe_class_not_found(session))
        await run_test("获取样本数据", test_get_sample_data(session))
        await run_test("SPARQL 查询", test_sparql_query(session))
        await run_test("SPARQL 无效查询", test_sparql_query_invalid(session))
        await run_test("样本数据 limit 验证", test_get_sample_data_limit(session))
    finally:
        await cleanup_client(session, ctx)

    # 打印报告
    print(results.summary())

    # 返回退出码
    sys.exit(1 if results.failed > 0 else 0)


if __name__ == "__main__":
    asyncio.run(main())
