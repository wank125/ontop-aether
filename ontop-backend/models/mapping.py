from pydantic import BaseModel
from typing import Optional


class MappingRule(BaseModel):
    mapping_id: str
    target: str
    source: str


class MappingContent(BaseModel):
    prefixes: dict[str, str]
    mappings: list[MappingRule]


class MappingFileInfo(BaseModel):
    path: str
    filename: str
    modified_at: Optional[str] = None


class ValidateRequest(BaseModel):
    ontology_path: Optional[str] = None
    properties_path: Optional[str] = None


class RestartEndpointRequest(BaseModel):
    ontology_path: Optional[str] = None
    mapping_path: Optional[str] = None
    properties_path: Optional[str] = None
    port: int = 8080
