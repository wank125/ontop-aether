from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class SparqlQueryRequest(BaseModel):
    query: str
    format: str = "json"  # json, xml, csv, turtle


class ReformulateRequest(BaseModel):
    query: str


class QueryHistoryEntry(BaseModel):
    id: str
    query: str
    timestamp: datetime
    result_count: Optional[int] = None
