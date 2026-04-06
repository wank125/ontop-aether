"""Compatibility wrapper around the HTTP-based Ontop client."""

from services.ontop_client import (
    bootstrap,
    extract_db_metadata,
    health,
    materialize,
    validate,
    version,
)

__all__ = ["bootstrap", "extract_db_metadata", "health", "materialize", "validate", "version"]
