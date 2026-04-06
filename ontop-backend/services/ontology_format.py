"""Normalize ontology serialization formats for downstream consumers."""

from pathlib import Path

from rdflib import Graph


def _looks_like_rdfxml(raw: str) -> bool:
    snippet = raw.lstrip()[:2048]
    return snippet.startswith("<?xml") or "<rdf:RDF" in snippet


def normalize_ontology_to_turtle(path: str) -> str:
    """Return a Turtle path suitable for the ontology definition parser.

    If the source file already looks like Turtle, return it unchanged.
    If the source file is RDF/XML, keep the original file and write a
    normalized Turtle companion file next to it.
    """

    src = Path(path)
    raw = src.read_text(encoding="utf-8", errors="ignore")
    if not _looks_like_rdfxml(raw):
        return str(src)

    graph = Graph()
    graph.parse(data=raw, format="xml")

    target = src.with_name(f"{src.stem}.normalized.ttl")
    graph.serialize(destination=str(target), format="turtle")
    return str(target)
