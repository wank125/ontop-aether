"""TTL ontology parser backed by rdflib.

This replaces the previous handwritten Turtle parser/state machine while
preserving the parse_ttl() interface used by upper layers.
"""

from __future__ import annotations

import re

from rdflib import BNode, Graph, Literal
from rdflib.collection import Collection
from rdflib.namespace import OWL, RDF, RDFS, SKOS, XSD

from models.ontology import (
    BilingualLabel,
    OntologyMetadata,
    OwlClass,
    OwlDataProperty,
    OwlObjectProperty,
    ShaclConstraint,
    ShaclPropertyConstraint,
    ShaclSparqlConstraint,
    TtlOntology,
)

SH = Graph().namespace_manager.store.namespace("sh")
SHACL = None
if SH:
    from rdflib import Namespace

    SHACL = Namespace(SH)
else:
    from rdflib import Namespace

    SHACL = Namespace("http://www.w3.org/ns/shacl#")


DOMAIN_SECTIONS = [
    (r"W域|W-域|W域：物", "W"),
    (r"H域|H-域|H域：人", "H"),
    (r"F域|F-域|F域：财", "F"),
    (r"E域|E-域|E域：事", "E"),
]


def _term_to_str(term) -> str:
    return str(term) if term is not None else ""


def _local_name(term) -> str:
    value = _term_to_str(term)
    if not value:
        return ""
    if "#" in value:
        return value.rsplit("#", 1)[1]
    if "/" in value:
        return value.rstrip("/>").split("/")[-1]
    if ":" in value and not value.startswith("http"):
        return value.split(":", 1)[1]
    return value.strip("<>")


def _bilingual_from_literals(values: list[Literal]) -> BilingualLabel:
    zh = ""
    en = ""
    for value in values:
        text = str(value)
        lang = getattr(value, "language", None)
        if lang == "zh":
            zh = text
        elif lang == "en":
            en = text
        elif not en:
            en = text
    return BilingualLabel(zh=zh, en=en)


def _domain_tags_from_comments(content: str) -> dict[str, str]:
    current_domain = ""
    subject_domains: dict[str, str] = {}
    for line in content.splitlines():
        stripped = line.strip()
        for pattern, tag in DOMAIN_SECTIONS:
            if re.search(pattern, stripped):
                current_domain = tag
                break
        if not stripped or stripped.startswith("#") or stripped.startswith("@"):
            continue
        subject = stripped.split()[0]
        if subject and current_domain:
            subject_domains[_local_name(subject)] = current_domain
    return subject_domains


def _literal_values(graph: Graph, subject, predicate) -> list[Literal]:
    return [obj for obj in graph.objects(subject, predicate) if isinstance(obj, Literal)]


def _parse_shacl_property(graph: Graph, node) -> ShaclPropertyConstraint:
    constraint = ShaclPropertyConstraint()

    path = graph.value(node, SHACL.path)
    if isinstance(path, BNode):
        inverse = graph.value(path, SHACL.inversePath) or graph.value(path, SHACL.inverse)
        if inverse is not None:
            constraint.path_inverse = _local_name(inverse)
    elif path is not None:
        constraint.path = _local_name(path)

    min_count = graph.value(node, SHACL.minCount)
    if isinstance(min_count, Literal):
        constraint.min_count = int(min_count.toPython())

    min_inclusive = graph.value(node, SHACL.minInclusive)
    if isinstance(min_inclusive, Literal):
        constraint.min_inclusive = float(min_inclusive.toPython())

    min_exclusive = graph.value(node, SHACL.minExclusive)
    if isinstance(min_exclusive, Literal):
        constraint.min_exclusive = float(min_exclusive.toPython())

    datatype = graph.value(node, SHACL.datatype)
    if datatype is not None:
        constraint.datatype = _term_to_str(datatype)

    has_value = graph.value(node, SHACL.hasValue)
    if has_value is not None:
        constraint.has_value = str(has_value)

    in_values = graph.value(node, SHACL["in"])
    if isinstance(in_values, BNode):
        constraint.in_values = [str(item) for item in Collection(graph, in_values)]

    return constraint


def _parse_shacl_sparql(graph: Graph, node) -> ShaclSparqlConstraint:
    message = graph.value(node, SHACL.message)
    select = graph.value(node, SHACL.select)
    return ShaclSparqlConstraint(
        message=str(message) if message is not None else "",
        select=str(select) if select is not None else "",
    )


def parse_ttl(content: str) -> TtlOntology:
    """Parse Turtle into the stable TtlOntology model using rdflib."""
    graph = Graph()
    graph.parse(data=content, format="turtle")

    ontology = TtlOntology()
    domain_tags = _domain_tags_from_comments(content)

    ontology_subject = next(graph.subjects(RDF.type, OWL.Ontology), None)
    if ontology_subject is not None:
        ontology.metadata = OntologyMetadata(
            labels=_bilingual_from_literals(_literal_values(graph, ontology_subject, RDFS.label)),
            comments=_bilingual_from_literals(_literal_values(graph, ontology_subject, RDFS.comment)),
            version=str(graph.value(ontology_subject, OWL.versionInfo) or ""),
            version_iri=_term_to_str(graph.value(ontology_subject, OWL.versionIRI)),
        )

    classes: list[OwlClass] = []
    for subject in sorted(set(graph.subjects(RDF.type, OWL.Class)), key=_local_name):
        local = _local_name(subject)
        examples = [str(value) for value in _literal_values(graph, subject, SKOS.example)]
        classes.append(
            OwlClass(
                name=_term_to_str(subject),
                local_name=local,
                labels=_bilingual_from_literals(_literal_values(graph, subject, RDFS.label)),
                comments=_bilingual_from_literals(_literal_values(graph, subject, RDFS.comment)),
                examples=examples,
                domain_tag=domain_tags.get(local, ""),
            )
        )
    ontology.classes = classes

    object_properties: list[OwlObjectProperty] = []
    for subject in sorted(set(graph.subjects(RDF.type, OWL.ObjectProperty)), key=_local_name):
        object_properties.append(
            OwlObjectProperty(
                name=_term_to_str(subject),
                local_name=_local_name(subject),
                labels=_bilingual_from_literals(_literal_values(graph, subject, RDFS.label)),
                comments=_bilingual_from_literals(_literal_values(graph, subject, RDFS.comment)),
                domain=_local_name(graph.value(subject, RDFS.domain)),
                range=_local_name(graph.value(subject, RDFS.range)),
                inverse_of=_local_name(graph.value(subject, OWL.inverseOf)),
            )
        )
    ontology.object_properties = object_properties

    data_properties: list[OwlDataProperty] = []
    for subject in sorted(set(graph.subjects(RDF.type, OWL.DatatypeProperty)), key=_local_name):
        range_value = graph.value(subject, RDFS.range)
        if range_value == XSD.string:
            range_name = _term_to_str(range_value)
        else:
            range_name = _term_to_str(range_value)
        data_properties.append(
            OwlDataProperty(
                name=_term_to_str(subject),
                local_name=_local_name(subject),
                labels=_bilingual_from_literals(_literal_values(graph, subject, RDFS.label)),
                comments=_bilingual_from_literals(_literal_values(graph, subject, RDFS.comment)),
                domain=_local_name(graph.value(subject, RDFS.domain)),
                range=range_name,
            )
        )
    ontology.data_properties = data_properties

    shacl_constraints: list[ShaclConstraint] = []
    for subject in sorted(set(graph.subjects(RDF.type, SHACL.NodeShape)), key=_local_name):
        properties = [
            _parse_shacl_property(graph, node)
            for node in graph.objects(subject, SHACL.property)
            if isinstance(node, BNode)
        ]
        sparql_constraints = [
            _parse_shacl_sparql(graph, node)
            for node in graph.objects(subject, SHACL.sparql)
            if isinstance(node, BNode)
        ]
        shacl_constraints.append(
            ShaclConstraint(
                name=_term_to_str(subject),
                local_name=_local_name(subject),
                labels=_bilingual_from_literals(_literal_values(graph, subject, RDFS.label)),
                comments=_bilingual_from_literals(_literal_values(graph, subject, RDFS.comment)),
                target_class=_local_name(graph.value(subject, SHACL.targetClass)),
                properties=properties,
                sparql_constraints=sparql_constraints,
            )
        )
    ontology.shacl_constraints = shacl_constraints

    return ontology
