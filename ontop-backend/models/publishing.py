"""Publishing configuration models."""

from pydantic import BaseModel, Field
from typing import Optional


class PublishingConfig(BaseModel):
    api_enabled: bool = True
    api_key: str = ""
    cors_origins: str = "*"
    mcp_enabled: bool = False
    mcp_port: int = 9000
    mcp_selected_tools: list[str] = Field(
        default_factory=lambda: [
            "sparql_query",
            "list_ontology_classes",
            "describe_class",
            "get_sample_data",
        ]
    )
    skills_enabled: bool = True
    skills_selected_formats: list[str] = Field(
        default_factory=lambda: [
            "openai_function",
            "anthropic_tool",
            "openapi",
            "generic_json",
        ]
    )


class PublishingConfigUpdate(BaseModel):
    api_enabled: Optional[bool] = None
    api_key: Optional[str] = None
    cors_origins: Optional[str] = None
    mcp_enabled: Optional[bool] = None
    mcp_port: Optional[int] = None
    mcp_selected_tools: Optional[list[str]] = None
    skills_enabled: Optional[bool] = None
    skills_selected_formats: Optional[list[str]] = None
