"""Unified tool specification — single source of truth for all export formats."""

from pydantic import BaseModel
from typing import Any


class ToolSpec(BaseModel):
    """Single-source definition of an MCP/publishing tool.

    Each tool is defined once here; the registry renders this spec into
    OpenAI Function Calling, Anthropic Tool Use, OpenAPI 3.0, or Generic
    JSON Schema on demand.
    """

    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema for inputs
    read_only: bool = True  # True = query-only, no side effects
    data_source_permission: str | None = None  # e.g. "sparql_endpoint"
