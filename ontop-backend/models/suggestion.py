"""Pydantic models for ontology refinement suggestions."""
from typing import Literal, Optional
from pydantic import BaseModel

SuggestionType = Literal[
    "RENAME_CLASS",
    "RENAME_PROPERTY",
    "ADD_SUBCLASS",
    "REFINE_TYPE",
    "ADD_LABEL",
]
SuggestionPriority = Literal["high", "medium", "low"]
SuggestionStatus = Literal["pending", "accepted", "rejected", "applied"]


class OntologySuggestion(BaseModel):
    id:           str
    ds_id:        str
    type:         SuggestionType
    current_val:  str
    proposed_val: str
    reason:       str
    priority:     SuggestionPriority
    auto_apply:   bool
    status:       SuggestionStatus
    created_at:   str
    updated_at:   Optional[str] = None


class SuggestionStatusUpdate(BaseModel):
    status: SuggestionStatus


class SuggestionStats(BaseModel):
    pending:  int
    accepted: int
    rejected: int
    applied:  int
    total:    int
