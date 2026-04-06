"""Audit helper — wraps SPARQL execution with timing and audit logging."""

import logging
import time

from repositories.query_history_repo import save_to_history

logger = logging.getLogger(__name__)


async def audit_sparql(
    query: str,
    execute_fn,
    source_ip: str = "",
    caller: str = "web",
) -> tuple[object, dict]:
    """Execute a SPARQL query with audit logging.

    Args:
        query: The SPARQL query string.
        execute_fn: Async callable that executes the query and returns the response.
        source_ip: Client IP address.
        caller: Who initiated the query — "web", "mcp", or "api".

    Returns:
        (response_from_execute_fn, audit_metadata_dict)
    """
    t0 = time.perf_counter()
    status = "ok"
    error_message = ""
    result_count = None
    resp = None

    try:
        resp = await execute_fn()
        status = "ok"
    except Exception as e:
        status = "error"
        error_message = str(e)[:500]
        logger.warning("SPARQL execution failed (caller=%s): %s", caller, error_message)
        raise
    finally:
        duration_ms = (time.perf_counter() - t0) * 1000
        try:
            save_to_history(
                query=query,
                result_count=result_count,
                source_ip=source_ip,
                caller=caller,
                duration_ms=round(duration_ms, 1),
                status=status,
                error_message=error_message,
            )
        except Exception as audit_err:
            logger.warning("Failed to save audit log: %s", audit_err)

    # Try to count results from response
    if resp is not None and hasattr(resp, "text"):
        try:
            import json
            data = json.loads(resp.text)
            bindings = data.get("results", {}).get("bindings", [])
            result_count = len(bindings)
        except Exception:
            pass

    return resp, {
        "duration_ms": round(duration_ms, 1),
        "status": status,
        "result_count": result_count,
    }
